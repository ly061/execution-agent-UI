import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.QA_ORBIT_AGENT_PORT || 8765);
const token = process.env.QA_ORBIT_AGENT_TOKEN || crypto.randomBytes(24).toString("base64url");
let runtimeProcess;

function runtimeRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime")
    : path.join(here, "..", "runtime");
}

function startRuntime() {
  const python = process.env.QA_ORBIT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  runtimeProcess = spawn(python, [path.join(runtimeRoot(), "run_agent.py"), "--port", String(port), "--token", token], {
    cwd: runtimeRoot(),
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  runtimeProcess.stdout.on("data", (chunk) => console.log(`[runtime] ${chunk}`));
  runtimeProcess.stderr.on("data", (chunk) => console.error(`[runtime] ${chunk}`));
  runtimeProcess.on("exit", (code) => console.log(`Local runtime exited (${code})`));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 620,
    title: "QA Orbit Agent",
    backgroundColor: "#f6f7fa",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(here, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile(path.join(here, "..", "renderer", "index.html"));
}

ipcMain.handle("agent:config", () => ({ endpoint: `http://127.0.0.1:${port}`, token, platform: process.platform }));
ipcMain.handle("agent:copy-token", () => clipboard.writeText(token));
ipcMain.handle("agent:open-workspace", (_, workspace) => shell.openPath(workspace));

app.whenReady().then(() => {
  startRuntime();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => runtimeProcess?.kill());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
