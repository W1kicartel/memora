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
});
