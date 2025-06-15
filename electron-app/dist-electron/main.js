import { app, ipcMain, BrowserWindow, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.DIST = path.join(__dirname, "../dist");
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let mainWindow;
let customerWindow;
let lastKnownState = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createMainWindow() {
  const persistentSession = session.fromPartition("persist:electron-app");
  mainWindow = new BrowserWindow({
    icon: path.join(process.env.PUBLIC, "electron-vite.svg"),
    webPreferences: {
      session: persistentSession,
      preload: path.join(__dirname, "preload.js")
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send(
      "main-process-message",
      (/* @__PURE__ */ new Date()).toLocaleString()
    );
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST, "index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (customerWindow) {
      customerWindow.close();
    }
  });
}
function createCustomerWindow() {
  customerWindow = new BrowserWindow({
    // Set new dimensions or to a different screen if available
    x: 100,
    y: 100,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
      // Use a separate session for the customer display if needed
      // session: session.fromPartition('persist:customer-display'),
    }
  });
  if (VITE_DEV_SERVER_URL) {
    customerWindow.loadURL(`${VITE_DEV_SERVER_URL}customer.html`);
  } else {
    customerWindow.loadFile(path.join(process.env.DIST, "customer.html"));
  }
  customerWindow.on("closed", () => {
    customerWindow = null;
  });
}
ipcMain.on("POS_TO_CUSTOMER_STATE", (event, state) => {
  lastKnownState = state;
  if (customerWindow) {
    customerWindow.webContents.send("POS_TO_CUSTOMER_STATE", state);
  }
});
ipcMain.on("CUSTOMER_REQUESTS_STATE", (event) => {
  if (lastKnownState) {
    event.sender.send("POS_TO_CUSTOMER_STATE", lastKnownState);
  }
});
ipcMain.on("CUSTOMER_TO_POS_TIP", (event, amount) => {
  if (mainWindow) {
    mainWindow.webContents.send("CUSTOMER_TO_POS_TIP", amount);
  }
});
app.whenReady().then(() => {
  createMainWindow();
  createCustomerWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createCustomerWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
