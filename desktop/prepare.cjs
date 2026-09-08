const fs = require("node:fs");
const { normalizeServerUrl } = require("./connection.cjs");
const raw = process.env.PPCM_DEFAULT_SERVER_URL || "";
fs.writeFileSync(
  "default-server.json",
  JSON.stringify({ url: raw ? normalizeServerUrl(raw) : "" }, null, 2),
);
if (!fs.existsSync("build/icon.ico"))
  throw new Error(
    "Primero ejecuta node scripts/create-desktop-icon.mjs desde la raíz.",
  );
