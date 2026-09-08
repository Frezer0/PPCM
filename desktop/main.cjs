const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
  session,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeServerUrl, isSetupSender } = require("./connection.cjs");
let setupWindow,
  dashboardWindow,
  serverUrl = "";
const allowLocal =
  !app.isPackaged && process.env.PPCM_DESKTOP_ALLOW_LOCAL === "1";
const configFile = () => path.join(app.getPath("userData"), "connection.json");
function savedUrl() {
  for (const file of [
    configFile(),
    path.join(__dirname, "default-server.json"),
  ]) {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")).url;
      if (value) return normalizeServerUrl(value, allowLocal);
    } catch {
      /* A missing or invalid preference opens setup. */
    }
  }
  return "";
}
async function checkServer(url) {
  const response = await fetch(`${url}/api/health`, {
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (!response.ok || (await response.json()).app !== "ppcm")
    throw new Error(
      "La dirección no corresponde a un dashboard PPCM disponible.",
    );
}
function saveUrl(url) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  const temporary = `${configFile()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ url }, null, 2));
  fs.renameSync(temporary, configFile());
}
function showSetup(message = "") {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 640,
    height: 650,
    minWidth: 560,
    minHeight: 560,
    title: "Conectar PPCM",
    icon: path.join(__dirname, "build/icon.png"),
    show: !process.argv.includes("--smoke-test"),
    backgroundColor: "#f5f6f2",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  setupWindow.setMenu(null);
  setupWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  setupWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  setupWindow.loadFile("setup.html");
  setupWindow.webContents.once("did-finish-load", () =>
    setupWindow.webContents.send("connection-info", {
      url: savedUrl(),
      message,
      version: app.getVersion(),
    }),
  );
  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}
function openDashboard(url) {
  serverUrl = url;
  if (dashboardWindow && !dashboardWindow.isDestroyed())
    dashboardWindow.destroy();
  dashboardWindow = new BrowserWindow({
    width: 1440,
    height: 950,
    minWidth: 850,
    minHeight: 640,
    title: "PPCM · Mantenimiento",
    icon: path.join(__dirname, "build/icon.png"),
    backgroundColor: "#f5f6f2",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: "persist:ppcm-dashboard",
    },
  });
  const win = dashboardWindow;
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url: destination }) => {
    try {
      if (new URL(destination).origin === serverUrl) win.loadURL(destination);
    } catch {
      /* Reject invalid destinations. */
    }
    return { action: "deny" };
  });
  const guardNavigation = (event, destination) => {
    try {
      if (new URL(destination).origin === serverUrl) return;
    } catch {
      /* Block invalid destinations. */
    }
    event.preventDefault();
  };
  win.webContents.on("will-navigate", guardNavigation);
  win.webContents.on("will-redirect", guardNavigation);
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.on(
    "did-fail-load",
    (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        showSetup(
          "No pudimos abrir el dashboard. Revisa tu conexión a internet e inténtalo de nuevo.",
        );
        win.hide();
      }
    },
  );
  win
    .loadURL(url)
    .catch(() => showSetup("No se pudo establecer conexión con el dashboard."));
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  win.on("closed", () => {
    if (dashboardWindow === win) dashboardWindow = null;
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const win = setupWindow || dashboardWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    for (const current of [
      session.defaultSession,
      session.fromPartition("persist:ppcm-dashboard"),
    ]) {
      current.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      current.setPermissionCheckHandler(() => false);
    }
    ipcMain.handle("connect-dashboard", async (event, value) => {
      if (!isSetupSender(event.senderFrame?.url, __dirname))
        throw new Error("Solicitud no autorizada.");
      try {
        const url = normalizeServerUrl(value, allowLocal);
        await checkServer(url);
        const old = savedUrl();
        if (old && old !== url) {
          const result = await dialog.showMessageBox(setupWindow, {
            type: "question",
            buttons: ["Cancelar", "Cambiar de espacio"],
            defaultId: 0,
            cancelId: 0,
            message: "Cambiar el espacio de trabajo",
            detail: `Conectarás con ${url}.`,
          });
          if (result.response !== 1)
            return { error: "Se mantuvo la conexión anterior." };
          await session
            .fromPartition("persist:ppcm-dashboard")
            .clearStorageData();
        }
        saveUrl(url);
        openDashboard(url);
        return { ok: true };
      } catch (error) {
        return {
          error:
            error.name === "TimeoutError"
              ? "El servidor tardó en responder. Espera un momento y vuelve a intentar."
              : error.message === "fetch failed"
                ? "No se pudo conectar. Revisa la dirección y tu conexión a internet."
                : error.message,
        };
      }
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "PPCM",
          submenu: [
            { label: "Cambiar conexión…", click: () => showSetup() },
            {
              label: "Abrir en el navegador",
              click: () => {
                if (serverUrl) shell.openExternal(serverUrl);
              },
            },
            { type: "separator" },
            { role: "quit", label: "Salir" },
          ],
        },
        {
          label: "Edición",
          submenu: [
            { role: "undo", label: "Deshacer" },
            { role: "redo", label: "Rehacer" },
            { type: "separator" },
            { role: "cut", label: "Cortar" },
            { role: "copy", label: "Copiar" },
            { role: "paste", label: "Pegar" },
            { role: "selectAll", label: "Seleccionar todo" },
          ],
        },
        {
          label: "Vista",
          submenu: [
            { role: "reload", label: "Actualizar dashboard" },
            { role: "resetZoom", label: "Tamaño original" },
            { role: "zoomIn", label: "Acercar" },
            { role: "zoomOut", label: "Alejar" },
            { role: "togglefullscreen", label: "Pantalla completa" },
          ],
        },
        {
          label: "Ayuda",
          submenu: [
            {
              label: "Acerca de PPCM",
              click: () =>
                dialog.showMessageBox({
                  type: "info",
                  message: `PPCM Mantenimiento ${app.getVersion()}`,
                  detail:
                    "Cliente conectado al mismo dashboard web. Requiere conexión a internet.",
                }),
            },
          ],
        },
      ]),
    );
    if (process.argv.includes("--smoke-test")) {
      showSetup();
      setupWindow.webContents.once("did-finish-load", () => {
        console.log("PPCM_DESKTOP_SMOKE_OK");
        app.exit(0);
      });
    } else {
      const url = savedUrl();
      url ? openDashboard(url) : showSetup();
    }
  });
  app.on("window-all-closed", () => app.quit());
}
