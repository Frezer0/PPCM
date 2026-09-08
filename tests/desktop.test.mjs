import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  normalizeServerUrl,
  isSetupSender,
} = require("../desktop/connection.cjs");
test("cliente Windows acepta solo orígenes HTTPS sin credenciales ni rutas", () => {
  assert.equal(
    normalizeServerUrl(" https://ppcm.example/ "),
    "https://ppcm.example",
  );
  for (const value of [
    "http://ppcm.example",
    "file:///C:/test",
    "javascript:alert(1)",
    "https://user:password@ppcm.example",
    "https://ppcm.example/route",
    "https://ppcm.example?token=test",
    "https://ppcm.example/#test",
  ])
    assert.throws(() => normalizeServerUrl(value));
  assert.equal(
    normalizeServerUrl("http://localhost:3000", true),
    "http://localhost:3000",
  );
  assert.throws(() => normalizeServerUrl("http://localhost:3000"));
});
test("el puente de configuración no puede ser invocado desde contenido remoto", () => {
  const root = path.resolve("desktop");
  assert.equal(isSetupSender("https://ppcm.example", root), false);
  assert.equal(
    isSetupSender(pathToFileURL(path.join(root, "setup.html")).href, root),
    true,
  );
});
