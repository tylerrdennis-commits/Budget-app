const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("budgetStore", {
  load: () => ipcRenderer.invoke("store:load"),
  save: (id, data) => ipcRenderer.invoke("store:save", id, data),
  exportBackup: (name, json) => ipcRenderer.invoke("store:export", name, json),
});
