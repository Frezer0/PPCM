const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ppcmConnection", {
  connect: (value) => ipcRenderer.invoke("connect-dashboard", value),
  onInfo: (callback) =>
    ipcRenderer.on("connection-info", (_event, info) => callback(info)),
});
