import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { FOLLOWUP_STATES, dateValue } from "../shared/domain.mjs";
import { ValidationError } from "./excel.mjs";

export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, filename TEXT NOT NULL, imported_at TEXT NOT NULL,
      row_count INTEGER NOT NULL, metadata TEXT NOT NULL, records TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sources (type TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id));
    CREATE TABLE IF NOT EXISTS followups (key TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, record_key TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
    INSERT OR IGNORE INTO settings VALUES (1, '{"currency":"","workspaceName":"Operaciones forestales"}');
  `);
  const sources = () =>
    db
      .prepare(
        "SELECT i.id, i.type, i.filename, i.imported_at, i.row_count, i.metadata FROM imports i JOIN sources s ON s.import_id=i.id",
      )
      .all()
      .map(({ metadata, ...r }) => ({ ...r, ...JSON.parse(metadata) }));
  function records() {
    const notes = new Map(
      db
        .prepare("SELECT key, payload, version FROM followups")
        .all()
        .map((r) => [r.key, { ...JSON.parse(r.payload), version: r.version }]),
    );
    return db
      .prepare(
        "SELECT i.records FROM imports i JOIN sources s ON s.import_id=i.id",
      )
      .all()
      .flatMap((r) => JSON.parse(r.records))
      .map((r) => ({ ...r, followup: notes.get(r.key) || null }));
  }
  function importDatasets(datasets) {
    if (
      !datasets.length ||
      new Set(datasets.map((d) => d.type)).size !== datasets.length
    )
      throw new ValidationError("Carga como máximo un archivo de cada tipo.");
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const {
        records: rows,
        type,
        filename,
        rowCount,
        ...metadata
      } of datasets) {
        const id = randomUUID();
        db.prepare("INSERT INTO imports VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          id,
          type,
          filename,
          now,
          rowCount,
          JSON.stringify(metadata),
          JSON.stringify(rows),
        );
        db.prepare(
          "INSERT INTO sources VALUES (?, ?) ON CONFLICT(type) DO UPDATE SET import_id=excluded.import_id",
        ).run(type, id);
        db.prepare(
          "INSERT INTO activity (record_key, at, detail) VALUES (?, ?, ?)",
        ).run("import", now, JSON.stringify({ filename, type, rowCount }));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return sources();
  }
  function saveFollowup(key, input) {
    if (!records().some((r) => r.key === key))
      throw new ValidationError("El registro ya no está en los datos activos.");
    if (!FOLLOWUP_STATES.includes(input.state))
      throw new ValidationError("Estado de seguimiento inválido.");
    if (
      typeof input.planner !== "string" ||
      input.planner.length > 100 ||
      typeof input.notes !== "string" ||
      input.notes.length > 5000
    )
      throw new ValidationError(
        "Revisa el programador y las observaciones (máximo 5.000 caracteres).",
      );
    if (input.dueDate && !dateValue(input.dueDate))
      throw new ValidationError("Fecha de compromiso inválida.");
    const previous = db
      .prepare("SELECT payload, version FROM followups WHERE key=?")
      .get(key);
    if ((previous?.version || 0) !== input.version) {
      const error = new Error(
        "El registro cambió en otra pestaña. Cierra y vuelve a abrir el detalle para cargar la versión actual.",
      );
      error.status = 409;
      throw error;
    }
    const now = new Date().toISOString(),
      version = (previous?.version || 0) + 1;
    const payload = {
      planner: input.planner.trim(),
      state: input.state,
      dueDate: dateValue(input.dueDate) || "",
      notes: input.notes.trim(),
      updatedAt: now,
    };
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "INSERT INTO followups VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, version=excluded.version",
      ).run(key, JSON.stringify(payload), version);
      db.prepare(
        "INSERT INTO activity (record_key, at, detail) VALUES (?, ?, ?)",
      ).run(
        key,
        now,
        JSON.stringify({
          before: previous ? JSON.parse(previous.payload) : null,
          after: payload,
        }),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { ...payload, version };
  }
  function restore(id) {
    const item = db.prepare("SELECT type FROM imports WHERE id=?").get(id);
    if (!item) throw new ValidationError("No se encontró esa importación.");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE sources SET import_id=? WHERE type=?").run(
        id,
        item.type,
      );
      db.prepare(
        "INSERT INTO activity (record_key, at, detail) VALUES (?, ?, ?)",
      ).run(
        "restore",
        new Date().toISOString(),
        JSON.stringify({ id, type: item.type }),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return {
    db,
    sources,
    records,
    importDatasets,
    saveFollowup,
    restore,
    history: () =>
      db
        .prepare(
          "SELECT i.id, i.type, i.filename, i.imported_at, i.row_count, CASE WHEN s.import_id=i.id THEN 1 ELSE 0 END AS active FROM imports i LEFT JOIN sources s ON s.import_id=i.id ORDER BY i.imported_at DESC",
        )
        .all(),
    activity: (key) =>
      db
        .prepare(
          "SELECT * FROM activity WHERE record_key=? ORDER BY id DESC LIMIT 50",
        )
        .all(key)
        .map((r) => ({ ...r, detail: JSON.parse(r.detail) })),
    settings: () =>
      JSON.parse(
        db.prepare("SELECT payload FROM settings WHERE id=1").get().payload,
      ),
    saveSettings(input) {
      if (
        !["", "CLP", "USD", "EUR"].includes(input.currency) ||
        typeof input.workspaceName !== "string" ||
        !input.workspaceName.trim() ||
        input.workspaceName.length > 60
      )
        throw new ValidationError("Revisa el nombre del espacio y la moneda.");
      const value = {
        currency: input.currency,
        workspaceName: input.workspaceName.trim(),
      };
      db.prepare("UPDATE settings SET payload=? WHERE id=1").run(
        JSON.stringify(value),
      );
      return value;
    },
    backup: () => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      imports: db.prepare("SELECT * FROM imports").all(),
      sources: db.prepare("SELECT * FROM sources").all(),
      followups: db.prepare("SELECT * FROM followups").all(),
      activity: db.prepare("SELECT * FROM activity").all(),
      settings: db.prepare("SELECT * FROM settings").all(),
    }),
  };
}
