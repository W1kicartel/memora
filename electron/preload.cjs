// Preload bridge: the renderer sees a tiny `window.memoraAI` API and nothing
// else of Node/Electron. Chat is proxied through the main process so the
// packaged app (file:// origin) never has to fight Ollama's CORS policy.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('memoraAI', {
  getStatus: () => ipcRenderer.invoke('ollama:getStatus'),
  onStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('ollama:status', listener);
    return () => ipcRenderer.removeListener('ollama:status', listener);
  },
  chat: (body) => ipcRenderer.invoke('ollama:chat', body),
  // Streaming chat: tokens arrive via per-request events; resolves at the end.
  chatStream: (body, onToken) => new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onData = (_e, chunk) => onToken(chunk);
    const cleanup = () => {
      ipcRenderer.removeListener(`ollama:stream:data:${id}`, onData);
    };
    ipcRenderer.on(`ollama:stream:data:${id}`, onData);
    ipcRenderer.once(`ollama:stream:done:${id}`, (_e, result) => { cleanup(); resolve(result); });
    ipcRenderer.once(`ollama:stream:error:${id}`, (_e, msg) => { cleanup(); reject(new Error(msg)); });
    ipcRenderer.send('ollama:chatStream', { id, body });
  }),
  retryOllama: () => ipcRenderer.invoke('ollama:retry'),
  ensureOllama: () => ipcRenderer.invoke('ollama:ensure'),
  authorizeSpotify: (authUrl, port) => ipcRenderer.invoke('spotify:authorize', { authUrl, port }),
  fetchApplePage: (url) => ipcRenderer.invoke('apple:fetch', url),
  onUpdate: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openUpdateDownload: () => ipcRenderer.invoke('update:openDownload'),
});
