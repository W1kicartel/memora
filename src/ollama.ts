/**
 * ollama.ts — the local AI provider.
 *
 * In the desktop app the Electron main process installs, starts and manages
 * Ollama automatically (see electron/main.cjs) and proxies chat calls over
 * IPC, so the renderer never hits CORS. In a plain browser (`npm run dev`)
 * we talk to http://127.0.0.1:11434 directly — Ollama's default CORS policy
 * allows localhost origins — and even trigger the model pull ourselves.
 */
import { useEffect, useState } from "react";
import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import MODEL_SPEC from "../electron/memora-model.json";

export const OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = DEFAULT_SETTINGS.ollamaModel;
/** The base tag memora-engine derives from — used as a last-resort fallback. */
export const OLLAMA_FALLBACK_MODEL = MODEL_SPEC.base;

/** Ask the desktop app to re-run the local-AI bootstrap after a failure. */
export function retryOllama(): void {
  if (window.memoraAI?.retryOllama) {
    void window.memoraAI.retryOllama();
  } else {
    browserPullStarted = false; // dev mode: let the next poll try the pull again
  }
}

export type OllamaPhase =
  | "checking"    // probing the local server
  | "installing"  // first launch: downloading + running the Ollama installer
  | "starting"    // server binary found, waiting for it to answer
  | "pulling"     // downloading the model
  | "ready"       // model available, chat works
  | "off"         // no server reachable (browser mode without Ollama running)
  | "error";

export interface OllamaStatus {
  phase: OllamaPhase;
  /** 0-100 where meaningful (install download, model pull). */
  progress?: number;
  detail?: string;
  model: string;
}

/** Bridge exposed by electron/preload.cjs — absent in a plain browser. */
interface Bridge {
  getStatus(): Promise<OllamaStatus>;
  onStatus(cb: (s: OllamaStatus) => void): () => void;
  chat(body: unknown): Promise<unknown>;
  /** Re-run the install/start/pull bootstrap after a failure. */
  retryOllama?(): Promise<void>;
  /** Start the bootstrap on demand (called when local AI is selected). */
  ensureOllama?(): Promise<void>;
  /** Spotify OAuth: opens the system browser, resolves with the auth code. */
  authorizeSpotify?(authUrl: string, port: number): Promise<{ code: string }>;
  /** Fetch a public music.apple.com page from the main process (no CORS). */
  fetchApplePage?(url: string): Promise<{ html?: string; error?: string }>;
  /** Auto-update: status stream + restart-and-install (+ macOS assisted download). */
  onUpdate?(cb: (s: { phase: "downloading" | "ready" | "manual"; version?: string; progress?: number }) => void): () => void;
  installUpdate?(): Promise<void>;
  /** macOS: open the download the update checker found. */
  openUpdateDownload?(): Promise<void>;
}
declare global {
  interface Window { memoraAI?: Bridge }
}

/** True when the AI features can be offered at all (local AI needs no key). */
export function aiConfigured(settings: Settings): boolean {
  return (settings.provider ?? "ollama") !== "claude" || Boolean(settings.apiKey);
}

/* ─── chat ────────────────────────────────────────────────────────────────── */

export interface OllamaMsg {
  role: "system" | "user" | "assistant";
  content: string;
  /** base64 images for multimodal models (gemma3 understands them). */
  images?: string[];
}

interface OllamaChatReply {
  message?: { content?: string };
  done_reason?: string;
  error?: string;
}

/** One /api/chat round trip. Throws Error with a readable message on failure. */
export async function ollamaChat(
  model: string,
  messages: OllamaMsg[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string; stopReason: string }> {
  const body = {
    model,
    messages,
    stream: false,
    // Keep the model resident for 30 min so back-to-back generations skip the
    // reload-from-disk latency entirely.
    keep_alive: "30m",
    options: {
      temperature: opts.temperature ?? 0.4,
      num_predict: opts.maxTokens ?? 1024,
      // 4096 keeps gemma3:4b comfortable on 8 GB machines; larger contexts
      // are the #1 cause of "model won't load" out-of-memory failures.
      num_ctx: 4096,
    },
  };

  let data: OllamaChatReply;
  if (window.memoraAI) {
    data = (await window.memoraAI.chat(body)) as OllamaChatReply;
  } else {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = ((await res.json()) as { error?: string }).error ?? detail; } catch { /* keep status */ }
      throw new Error(detail);
    }
    data = (await res.json()) as OllamaChatReply;
  }

  if (data.error) throw new Error(data.error);
  const text = String(data.message?.content ?? "");
  // Ollama reports "length" when num_predict cut the reply — same contract as
  // Anthropic's "max_tokens", which drives the auto-continue loop upstream.
  const stopReason = data.done_reason === "length" ? "max_tokens" : "end_turn";
  return { text, stopReason };
}

/* ─── status ─────────────────────────────────────────────────────────────── */

/** Human-readable status line (Italian, like the rest of the AI surface). */
export function statusLabel(s: OllamaStatus): string {
  const pct = s.progress != null ? ` ${Math.round(s.progress)}%` : "";
  switch (s.phase) {
    case "checking":   return "Controllo dell'IA locale…";
    case "installing": return `Prima installazione di Ollama…${pct}`;
    case "starting":   return "Avvio del motore locale…";
    case "pulling":    return `Scarico il modello ${s.model}…${pct}`;
    case "ready":      return `IA locale pronta · ${s.model}`;
    case "off":        return "IA locale non attiva — apri l'app desktop di Memora (si configura da sola) o avvia Ollama.";
    case "error":      return `Problema con l'IA locale: ${s.detail || "errore sconosciuto"}`;
  }
}

/** Kick off /api/pull from the browser (dev mode) and stream progress. */
let browserPullStarted = false;
async function browserPull(model: string, onStatus: (s: OllamaStatus) => void): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`pull failed (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string };
        if (j.error) throw new Error(j.error);
        if (j.total && j.completed != null) {
          onStatus({ phase: "pulling", model, progress: (j.completed / j.total) * 100, detail: j.status });
        }
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
  }
}

/** Build the specialised model from the pulled base (dev-mode counterpart of main.cjs). */
async function browserCreate(): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL_SPEC.name,
      from: MODEL_SPEC.base,
      system: MODEL_SPEC.system,
      parameters: MODEL_SPEC.parameters,
      stream: false,
    }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = ((await res.json()) as { error?: string }).error ?? detail; } catch { /* keep status */ }
    throw new Error(`creazione del modello fallita: ${detail}`);
  }
}

async function browserStatus(model: string, onStatus: (s: OllamaStatus) => void): Promise<OllamaStatus> {
  try {
    const v = await fetch(`${OLLAMA_URL}/api/version`);
    if (!v.ok) return { phase: "off", model };
    const tags = (await (await fetch(`${OLLAMA_URL}/api/tags`)).json()) as { models?: { name?: string }[] };
    const has = (name: string) => (tags.models ?? []).some((m) => String(m.name ?? "").startsWith(name));
    if (has(model)) return { phase: "ready", model };

    // Our derived model is built locally, never pulled from the registry:
    // pull the base if needed, then create the specialised model on top.
    if (model === MODEL_SPEC.name) {
      if (has(MODEL_SPEC.base)) {
        await browserCreate();
        return { phase: "ready", model };
      }
      if (!browserPullStarted) {
        browserPullStarted = true;
        browserPull(MODEL_SPEC.base, onStatus)
          .then(() => browserCreate())
          .then(() => onStatus({ phase: "ready", model }))
          .catch((e) => onStatus({ phase: "error", model, detail: e instanceof Error ? e.message : String(e) }));
      }
      return { phase: "pulling", model: MODEL_SPEC.base, progress: 0 };
    }

    // A custom tag the user typed by hand: pull it as-is.
    if (!browserPullStarted) {
      browserPullStarted = true;
      browserPull(model, onStatus)
        .then(() => onStatus({ phase: "ready", model }))
        .catch((e) => onStatus({ phase: "error", model, detail: e instanceof Error ? e.message : String(e) }));
    }
    return { phase: "pulling", model, progress: 0 };
  } catch {
    return { phase: "off", model };
  }
}

/**
 * Live Ollama status. In Electron it mirrors the main process's bootstrap
 * (install → start → pull → ready); in a browser it polls the local server.
 */
export function useOllamaStatus(enabled: boolean, model: string): OllamaStatus {
  const [status, setStatus] = useState<OllamaStatus>({ phase: "checking", model });

  useEffect(() => {
    if (!enabled) return;
    if (window.memoraAI) {
      const off = window.memoraAI.onStatus(setStatus);
      // Kick the lazy bootstrap: it runs only when local AI is in use.
      void window.memoraAI.ensureOllama?.();
      window.memoraAI.getStatus().then(setStatus).catch(() => { /* keep checking */ });
      return off;
    }
    let stopped = false;
    const push = (s: OllamaStatus) => { if (!stopped) setStatus(s); };
    const tick = async () => {
      const s = await browserStatus(model, push);
      // Don't clobber live pull progress with the poller's coarse answer.
      if (!stopped) setStatus((prev) => (prev.phase === "pulling" && s.phase === "pulling" ? prev : s));
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [enabled, model]);

  return status;
}
