const { app, BrowserWindow, shell, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

// electron-updater is a runtime dep; keep startup resilient if it's missing.
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch { /* dev env */ }

/* ── Edition ──────────────────────────────────────────────────────────────
   The social build injects `memoraEdition: "social"` into package.json via
   electron-builder's extraMetadata (see electron-builder.social.json). The
   private edition — and plain dev runs — have no field and default here. */
let EDITION = 'private';
try {
  EDITION = require(path.join(__dirname, '..', 'package.json')).memoraEdition || 'private';
} catch { /* dev tree without package.json is impossible, but stay safe */ }
const IS_SOCIAL = EDITION === 'social';
// One brand: both editions present themselves as "Memora".
const APP_NAME = 'Memora';
const APP_ID = IS_SOCIAL ? 'app.memora.social' : 'app.memora.desktop';

// Same display name, separate data: park the social edition's userData in its
// own folder so a machine with both editions never mixes their storage.
if (IS_SOCIAL) {
  app.setPath('userData', path.join(app.getPath('appData'), 'memora-social'));
}

/* ════════════════════════════════════════════════════════════════════════
   Local AI bootstrap — Ollama installs itself on first launch.
   Flow: probe the server → (download + silent-install if missing) →
   start it → pull the model → ready. Every step is broadcast to the
   renderer as an `ollama:status` event so the UI can show progress.
   ════════════════════════════════════════════════════════════════════════ */

const OLLAMA = 'http://127.0.0.1:11434';
const INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe';        // Windows (Inno Setup)
const INSTALLER_URL_MAC = 'https://ollama.com/download/Ollama-darwin.zip';  // macOS (Ollama.app in a zip)

// The app's specialised model: a derivative of a small multimodal base with
// the Memora study-engine identity and tuned parameters baked in.
const SPEC = require('./memora-model.json');
const MODEL = SPEC.name;        // "memora-engine" — what the renderer chats with
const BASE_MODEL = SPEC.base;   // pulled from the registry

let mainWin = null;
let status = { phase: 'checking', progress: 0, detail: '', model: MODEL };

function setStatus(patch) {
  status = { ...status, ...patch };
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('ollama:status', status);
  }
}

async function serverUp() {
  try {
    const res = await fetch(`${OLLAMA}/api/version`);
    return res.ok;
  } catch {
    return false;
  }
}

function findOllamaExe() {
  const home = os.homedir();
  const candidates = process.platform === 'darwin'
    ? [
        // Homebrew installs first (Apple Silicon, then Intel), then the app
        // bundle's embedded CLI — ours lands in ~/Applications, but respect a
        // copy the user dragged to /Applications themselves.
        '/opt/homebrew/bin/ollama',
        '/usr/local/bin/ollama',
        path.join(home, 'Applications', 'Ollama.app', 'Contents', 'Resources', 'ollama'),
        '/Applications/Ollama.app/Contents/Resources/ollama',
      ]
    : [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
      ];
  return candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || null;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download fallito (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const file = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (total) setStatus({ progress: Math.round((received / total) * 100) });
    if (!file.write(Buffer.from(value))) {
      await new Promise((resolve) => file.once('drain', resolve));
    }
  }
  await new Promise((resolve, reject) => file.end((e) => (e ? reject(e) : resolve())));
}

function runInstallerSilent(exe) {
  // Ollama's Windows installer is Inno Setup — these flags mean no UI at all.
  return new Promise((resolve, reject) => {
    execFile(exe, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true },
      (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * macOS install: unzip Ollama.app into ~/Applications (user-writable, no admin
 * prompt). `ditto -x -k` is Apple's own extractor — it preserves the bundle's
 * code signature, which generic unzippers can corrupt. The zip is fetched by
 * us (not a browser), so no quarantine attribute is attached and the embedded
 * CLI runs without a Gatekeeper dialog.
 */
async function installOllamaMac() {
  const zip = path.join(os.tmpdir(), 'Ollama-darwin.zip');
  await downloadFile(INSTALLER_URL_MAC, zip);
  setStatus({ progress: 100, detail: 'installazione in corso' });
  const appsDir = path.join(os.homedir(), 'Applications');
  fs.mkdirSync(appsDir, { recursive: true });
  await new Promise((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-x', '-k', zip, appsDir],
      (err) => (err ? reject(err) : resolve()));
  });
}

function startServer(exe) {
  // The installer may already have launched the tray app; a second `serve`
  // just exits on the busy port, which is harmless.
  const child = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

async function waitForServer(tries = 90) {
  for (let i = 0; i < tries; i++) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function hasModel(name) {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`);
    const data = await res.json();
    return (data.models || []).some((m) => String(m.name || '').startsWith(name));
  } catch {
    return false;
  }
}

async function pullModel() {
  setStatus({ phase: 'pulling', progress: 0, detail: '' });
  const res = await fetch(`${OLLAMA}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: BASE_MODEL, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`pull del modello fallito (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let json;
      try { json = JSON.parse(line); } catch { continue; }
      if (json.error) throw new Error(json.error);
      if (json.total && json.completed != null) {
        setStatus({ progress: Math.round((json.completed / json.total) * 100), detail: json.status || '' });
      } else if (json.status) {
        setStatus({ detail: json.status });
      }
    }
  }
}

/**
 * Build (or refresh) the specialised model from the base + baked-in system
 * prompt and parameters. Tries the modern /api/create JSON shape first, then
 * falls back to the legacy Modelfile payload (older Ollama installs). Returns
 * false when neither works — the app then runs on the base model.
 */
async function createModel() {
  setStatus({ phase: 'starting', detail: 'preparo il modello memora-engine' });
  const post = (body) => fetch(`${OLLAMA}/api/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    const modern = await post({
      model: MODEL, from: BASE_MODEL,
      system: SPEC.system, parameters: SPEC.parameters,
      stream: false,
    });
    if (modern.ok) return true;
    const modelfile = [
      `FROM ${BASE_MODEL}`,
      `SYSTEM """${SPEC.system}"""`,
      ...Object.entries(SPEC.parameters).map(([k, v]) => `PARAMETER ${k} ${v}`),
    ].join('\n');
    const legacy = await post({ name: MODEL, modelfile, stream: false });
    return legacy.ok;
  } catch {
    return false;
  }
}

let bootstrapping = false;

async function bootstrapOllama() {
  if (bootstrapping) return;
  bootstrapping = true;
  try {
    setStatus({ phase: 'checking', detail: '' });
    if (!(await serverUp())) {
      let exe = findOllamaExe();
      if (!exe) {
        if (process.platform !== 'win32' && process.platform !== 'darwin') {
          setStatus({ phase: 'error', detail: 'installa Ollama da ollama.com' });
          return;
        }
        setStatus({ phase: 'installing', progress: 0, detail: 'download di Ollama' });
        try {
          if (process.platform === 'darwin') {
            await installOllamaMac();
          } else {
            const installer = path.join(os.tmpdir(), 'OllamaSetup.exe');
            await downloadFile(INSTALLER_URL, installer);
            setStatus({ progress: 100, detail: 'installazione in corso' });
            await runInstallerSilent(installer);
          }
        } catch (e) {
          throw new Error(`download di Ollama fallito (${e.message}). Controlla la connessione e premi Riprova.`);
        }
        exe = findOllamaExe();
        if (!exe) throw new Error("l'installazione di Ollama non è andata a buon fine (antivirus?). Premi Riprova, o installa Ollama da ollama.com e riapri l'app.");
      }
      setStatus({ phase: 'starting', detail: '' });
      startServer(exe);
      if (!(await waitForServer())) {
        throw new Error('il motore locale non risponde. Premi Riprova; se succede ancora, riavvia il PC.');
      }
    }
    if (!(await hasModel(BASE_MODEL))) await pullModel();
    // (Re)create the specialised model: idempotent and near-instant once the
    // base exists. If it fails (very old Ollama), the base model still works —
    // the renderer falls back to it automatically.
    const created = await createModel();
    setStatus({ phase: 'ready', progress: 100, detail: created ? '' : 'modello base attivo' });
  } catch (e) {
    setStatus({ phase: 'error', detail: String((e && e.message) || e) });
  } finally {
    bootstrapping = false;
  }
}

ipcMain.handle('ollama:retry', () => { bootstrapOllama(); });

// Lazy bootstrap: the renderer calls this only when the local-AI provider is
// actually selected, so Claude-only users never download Ollama or the model.
ipcMain.handle('ollama:ensure', () => { bootstrapOllama(); });

/* ── Spotify OAuth: system browser + temporary loopback catcher ── */
ipcMain.handle('spotify:authorize', (_event, { authUrl, port }) => {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; try { server.close(); } catch {} fn(arg); } };
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${port}`);
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<meta charset="utf-8"><body style="font-family:Georgia,serif;background:#f3ede1;color:#241f18;display:grid;place-items:center;height:100vh;margin:0">' +
        '<div style="text-align:center"><div style="font-size:2rem;color:#9e2b25">♥</div>' +
        '<h2 style="margin:.3rem 0">Memora × Spotify</h2>' +
        '<p style="color:#6e6456">Collegamento riuscito. Chiudi pure questa scheda e torna all\'app.</p></div>',
      );
      const code = u.searchParams.get('code');
      if (code) done(resolve, { code });
      else done(reject, new Error(u.searchParams.get('error') || 'autenticazione annullata'));
    });
    server.on('error', (e) => done(reject, e));
    server.listen(port, '127.0.0.1', () => shell.openExternal(authUrl));
    // Give up after 5 minutes so the port never stays hostage.
    setTimeout(() => done(reject, new Error('timeout: nessuna risposta da Spotify')), 300000);
  });
});

/* ════════════════════════════════════════════════════════════════════════
   Auto-update — publish a GitHub release, her app takes care of the rest.
   Flow: silent check (startup + every 4h) → download in background →
   Windows toast + in-app note → she clicks → restart into the new version.
   ════════════════════════════════════════════════════════════════════════ */

function sendUpdate(payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update:status', payload);
}

function notify(body) {
  try {
    if (Notification.isSupported()) new Notification({ title: APP_NAME, body }).show();
  } catch { /* notifications disabled — the in-app note still shows */ }
}

function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    sendUpdate({ phase: 'downloading', version: info.version, progress: 0 });
    notify(IS_SOCIAL
      ? `Nuova versione di ${APP_NAME} (${info.version}) in download.`
      : `C'è una nuova versione di Memora (${info.version}): la sto scaricando per te.`);
  });
  autoUpdater.on('download-progress', (p) => {
    sendUpdate({ phase: 'downloading', progress: p.percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdate({ phase: 'ready', version: info.version });
    notify(IS_SOCIAL
      ? `Aggiornamento ${info.version} pronto — riavvia ${APP_NAME} per installarlo.`
      : `Aggiornamento ${info.version} pronto — riavvia Memora per installarlo. ♥`);
  });
  // Offline, rate-limited or no release yet: stay silent, retry later.
  autoUpdater.on('error', () => {});

  const check = () => { autoUpdater.checkForUpdates().catch(() => {}); };
  setTimeout(check, 15_000);                    // let the window settle first
  setInterval(check, 4 * 60 * 60 * 1000);       // then every 4 hours
}

ipcMain.handle('update:install', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

/* ── Apple Music: fetch public playlist pages (renderer would hit CORS) ── */
ipcMain.handle('apple:fetch', async (_event, url) => {
  try {
    const u = new URL(String(url));
    if (u.hostname !== 'music.apple.com' || u.protocol !== 'https:') {
      return { error: 'host non consentito' };
    }
    const res = await fetch(u.href, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Memora/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { html: await res.text() };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
});

ipcMain.handle('ollama:getStatus', () => status);

// Chat proxy: keeps the renderer free of CORS concerns in the packaged app.
ipcMain.handle('ollama:chat', async (_event, body) => {
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).error || detail; } catch { /* keep status */ }
      return { error: detail };
    }
    return await res.json();
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
});

/* ════════════════════════════════════════════════════════════════════════
   Window
   ════════════════════════════════════════════════════════════════════════ */

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    backgroundColor: '#f3ede1',         // warm paper — matches the Carta theme, no flash
    // Hide the native title bar; keep functional min/max/close as an overlay tinted
    // to match the paper chrome. The app's .topbar becomes the draggable region
    // (see -webkit-app-region rules in styles.css).
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f7f2e8',
      symbolColor: '#6e6456',
      height: 50,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the built React app
  mainWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Open external links in the system default browser instead of spawning a
  // blank Electron window.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  mainWin.once('ready-to-show', () => {
    mainWin.show();
    mainWin.focus();
  });
  mainWin.on('closed', () => { mainWin = null; app.quit(); });
}

app.whenReady().then(() => {
  // Required on Windows for toast notifications to actually appear.
  app.setAppUserModelId(APP_ID);
  createMainWindow();
  setupAutoUpdate();
  // Ready-to-use out of the box: local AI is the default provider, so the
  // whole chain (install Ollama → start it → pull the model → build
  // memora-engine) runs on first launch, not when someone finds the setting.
  // The short delay lets the window paint before the download starts;
  // 'ollama:ensure' / 'ollama:retry' still work and are no-ops mid-bootstrap.
  setTimeout(() => { bootstrapOllama(); }, 2500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
