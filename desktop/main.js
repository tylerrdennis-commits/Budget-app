// BudgetApp for Windows: shows the same page as the web version and keeps
// the budget in one JSON file in the user's AppData folder.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs");
const path = require("path");

if (!app.requestSingleInstanceLock()) app.quit();

const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "budget.json");

function readDocs() {
  for (const f of [dataFile(), dataFile() + ".bak"]) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")).docs || {}; } catch (e) { /* try the next one */ }
  }
  return {};
}

let docs = null;
let writeTimer = null;
function writeNow() {
  clearTimeout(writeTimer); writeTimer = null;
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = dataFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ app: "BudgetApp", format: 1, saved: new Date().toISOString(), docs }));
  fs.renameSync(tmp, dataFile());
}

ipcMain.handle("store:load", () => {
  docs = readDocs();
  // keep yesterday's copy around in case something goes wrong
  try { if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), dataFile() + ".bak"); } catch (e) {}
  return docs;
});
ipcMain.handle("store:save", (_e, id, data) => {
  if (!docs) docs = readDocs();
  docs[id] = data;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeNow, 300);
  return true;
});
ipcMain.handle("store:export", async (e, name, json) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath("documents"), name),
    filters: [{ name: "BudgetApp backup", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, json);
  return true;
});

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 860, minWidth: 420, minHeight: 500,
    title: "BudgetApp", backgroundColor: "#f2f4f1", show: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  // links to websites open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
app.on("before-quit", () => { if (writeTimer) writeNow(); });
app.on("window-all-closed", () => { if (writeTimer) writeNow(); app.quit(); });
