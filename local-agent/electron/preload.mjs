import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("qaOrbit", {
  config: () => ipcRenderer.invoke("agent:config"),
  copyToken: () => ipcRenderer.invoke("agent:copy-token"),
  openWorkspace: (workspace) => ipcRenderer.invoke("agent:open-workspace", workspace),
});
