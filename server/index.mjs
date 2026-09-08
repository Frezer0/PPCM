import express from "express";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createStore } from "./store.mjs";
import { createAuth, requireRole } from "./auth.mjs";
import { configuration } from "./config.mjs";
import { databaseConfiguration } from "./database-config.mjs";
import { clientDownloads } from "./client-download.mjs";
import { readExcel, exportExcel, ValidationError } from "./excel.mjs";
import { filterRecords } from "../shared/domain.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = configuration();
let store;
if (config.cloud) {
  const { Pool } = await import("pg");
  const { createPgStore } = await import("./pg-store.mjs");
  const pool = new Pool(databaseConfiguration());
  pool.on("error", (error) =>
    console.error("PostgreSQL:", error.code || "error de conexión"),
  );
  store = await createPgStore(pool);
  await store.bootstrapAdmin(process.env.BOOTSTRAP_ADMIN_EMAIL);
} else {
  const dataDir = process.env.PPCM_DATA_DIR || path.join(root, "data");
  await mkdir(dataDir, { recursive: true });
  store = createStore(path.join(dataDir, "ppcm.sqlite"));
  if (!store.sources().length && !process.env.PPCM_SKIP_SEED) {
    const initial = [];
    for (const filename of ["Avisos IW28.xlsx", "OMs IW38.xlsx"])
      if (existsSync(path.join(root, filename)))
        initial.push(
          await readExcel(await readFile(path.join(root, filename)), filename),
        );
    if (initial.length) store.importDatasets(initial);
  }
}
const app = express();
app.disable("x-powered-by");
if (config.cloud) app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  if (config.cloud) {
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    res.set("Strict-Transport-Security", "max-age=31536000");
  }
  next();
});
app.use("/api", (req, res, next) => {
  const host = req.headers.host || "";
  if (!config.cloud && !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
    return res
      .status(403)
      .json({ error: "Acceso permitido solo desde este equipo." });
  const origin = req.headers.origin;
  if (origin && origin !== (config.cloud ? config.publicUrl : `http://${host}`))
    return res.status(403).json({ error: "Origen no autorizado." });
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "1mb" }));
const auth = createAuth({ ...config, store });
const downloads = clientDownloads(root);
app.get("/api/health", (_req, res) => res.json({ ok: true, app: "ppcm" }));
app.get("/api/session", async (req, res) =>
  res.json({
    mode: config.cloud ? "cloud" : "local",
    user: await auth.current(req, res),
    publicUrl: config.publicUrl,
  }),
);
app.post("/api/auth/login", auth.login);
app.post("/api/auth/logout", auth.logout);
app.use("/api", auth.required);
app.get("/api/revision", async (_req, res) =>
  res.json({ revision: store.revision ? await store.revision() : "local" }),
);
app.get("/api/client", async (_req, res) => res.json(await downloads.info()));
app.get("/api/client/download", downloads.download);
if (!config.cloud)
  app.post("/api/shutdown", (_req, res) => {
    res.json({ ok: true });
    setTimeout(shutdown, 100);
  });
app.get("/api/data", async (req, res) => {
  const data = store.snapshot
    ? await store.snapshot()
    : {
        records: store.records(),
        sources: store.sources(),
        settings: store.settings(),
        history: store.history(),
      };
  res.json({
    ...data,
    currentUser: req.user,
    mode: config.cloud ? "cloud" : "local",
  });
});
app.get("/api/records/:key/activity", async (req, res) =>
  res.json(await store.activity(req.params.key)),
);
app.put("/api/records/:key", requireRole("admin", "editor"), async (req, res) =>
  res.json(await store.saveFollowup(req.params.key, req.body, req.user)),
);
app.put("/api/settings", requireRole("admin"), async (req, res) =>
  res.json(await store.saveSettings(req.body)),
);
app.get("/api/members", requireRole("admin"), async (_req, res) =>
  res.json(store.members ? await store.members() : []),
);
app.put("/api/members", requireRole("admin"), async (req, res) => {
  if (!store.saveMember)
    throw new ValidationError(
      "Los usuarios se gestionan en el modo compartido.",
    );
  res.json(await store.saveMember(req.body, req.user));
});
const staging = new Map();
const purge = () => {
  for (const [token, entry] of staging)
    if (Date.now() - entry.created > 20 * 60000) staging.delete(token);
};
app.post(
  "/api/import/preview",
  requireRole("admin", "editor"),
  express.raw({ type: "application/octet-stream", limit: "10mb" }),
  async (req, res) => {
    purge();
    if (
      [...staging.values()].filter((v) => v.owner === req.user.id).length >=
        12 ||
      staging.size >= 60
    )
      throw new ValidationError(
        "Hay demasiadas cargas pendientes. Espera unos minutos.",
      );
    if (!Buffer.isBuffer(req.body))
      throw new ValidationError("No se recibió el archivo.");
    let filename;
    try {
      filename = decodeURIComponent(
        req.headers["x-filename"] || "archivo.xlsx",
      );
    } catch {
      throw new ValidationError("Nombre de archivo inválido.");
    }
    const dataset = await readExcel(req.body, path.basename(filename));
    const token = randomUUID();
    const current = (await store.records()).filter(
      (r) => r.type === dataset.type,
    );
    const currentIds = new Set(current.map((r) => r.id)),
      newIds = new Set(dataset.records.map((r) => r.id));
    staging.set(token, { dataset, created: Date.now(), owner: req.user.id });
    const { records, ...info } = dataset;
    res.json({
      ...info,
      token,
      added: records.filter((r) => !currentIds.has(r.id)).length,
      removed: current.filter((r) => !newIds.has(r.id)).length,
      existing: records.filter((r) => currentIds.has(r.id)).length,
      sample: records
        .slice(0, 4)
        .map((r) => ({ id: r.id, description: r.description, zone: r.zone })),
    });
  },
);
app.post(
  "/api/import/commit",
  requireRole("admin", "editor"),
  async (req, res) => {
    purge();
    const tokens = req.body.tokens;
    if (
      !Array.isArray(tokens) ||
      !tokens.length ||
      tokens.length > 2 ||
      tokens.some((t) => staging.get(t)?.owner !== req.user.id)
    )
      throw new ValidationError(
        "La vista previa venció o no es válida. Vuelve a seleccionar los archivos.",
      );
    const result = await store.importDatasets(
      tokens.map((t) => staging.get(t).dataset),
      req.user,
    );
    tokens.forEach((t) => staging.delete(t));
    res.json({ sources: result });
  },
);
app.post("/api/import/restore", requireRole("admin"), async (req, res) => {
  await store.restore(req.body.id, req.user);
  res.json({ ok: true });
});
app.post("/api/export", async (req, res) => {
  const type = req.body.type;
  let records = filterRecords(await store.records(), req.body.filters);
  if (type === "notice" || type === "order")
    records = records.filter((r) => r.type === type);
  if (Array.isArray(req.body.keys)) {
    const keys = new Set(req.body.keys);
    records = records.filter((r) => keys.has(r.key));
  }
  const file = await exportExcel(records, {
    currency: (await store.settings()).currency,
    filters: req.body.filters,
  });
  res.set(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.set(
    "Content-Disposition",
    'attachment; filename="PPCM-mantenimiento.xlsx"',
  );
  res.send(Buffer.from(file));
});
app.get("/api/backup", requireRole("admin"), async (_req, res) =>
  res
    .attachment(`PPCM-respaldo-${new Date().toISOString().slice(0, 10)}.json`)
    .json(await store.backup()),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Ruta no encontrada." }),
);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.PPCM_HMR_PORT || 24678) },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  if (!existsSync(path.join(root, "dist/index.html")))
    throw new Error("Primero ejecuta npm run build.");
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
}
app.use((error, _req, res, _next) => {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const status = error.status || 500;
  if (status === 500) console.error(error.code || error.message);
  res.status(status).json({
    error:
      status === 413
        ? "El archivo supera el límite de 10 MB."
        : status === 500
          ? "No se pudo completar la operación. Revisa la conexión del servidor."
          : error.message,
  });
});
const server = app.listen(
  config.port,
  config.cloud ? "0.0.0.0" : "127.0.0.1",
  () =>
    console.log(
      `PPCM disponible en ${config.cloud ? config.publicUrl : `http://localhost:${config.port}`} · modo ${config.cloud ? "compartido" : "local"}`,
    ),
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `El puerto ${config.port} está ocupado.`
      : error.code,
  );
  process.exit(1);
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    if (store.close) await store.close();
    else store.db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 1000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
