const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("folioHost", {
  request: (action, payload = {}) =>
    ipcRenderer.invoke("folio:request", action, payload),
  onEvent: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("folio:event", listener);
    return () => ipcRenderer.removeListener("folio:event", listener);
  },
});
