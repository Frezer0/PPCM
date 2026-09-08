const path = require("node:path");
const { pathToFileURL } = require("node:url");

function normalizeServerUrl(value, allowLocal = false) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error(
      "Escribe una dirección válida, por ejemplo https://tu-dashboard.onrender.com.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(allowLocal && local && url.protocol === "http:")
  )
    throw new Error("La dirección del dashboard debe usar HTTPS.");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error(
      "Usa solo la dirección principal del dashboard, sin contraseñas, rutas ni parámetros.",
    );
  return url.origin;
}
function isSetupSender(senderUrl, root) {
  return senderUrl === pathToFileURL(path.join(root, "setup.html")).href;
}
module.exports = { normalizeServerUrl, isSetupSender };
