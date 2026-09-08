import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FOLLOWUP_STATES, dateValue } from "../shared/domain.mjs";
import { ValidationError } from "./excel.mjs";

const iso = (value) => (value instanceof Date ? value.toISOString() : value);
const conflict = () =>
  Object.assign(
    new Error(
      "El registro cambió en otra pestaña. Cierra y vuelve a abrir el detalle.",
    ),
    { status: 409 },
  );
export async function createPgStore(pool) {
  await pool.query(
    await readFile(
      new URL("../supabase/migrations/001_ppcm.sql", import.meta.url),
      "utf8",
    ),
  );
  const rows = async (db, sql, params = []) =>
    (await db.query(sql, params)).rows;
  async function transaction(fn, readOnly = false) {
    const db = await pool.connect();
    try {
      await db.query(
        readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
      );
      if (!readOnly) await db.query("SELECT pg_advisory_xact_lock(7439821)");
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  const sources = async (db = pool) =>
    (
      await rows(
        db,
        "SELECT i.id,i.type,i.filename,i.imported_at,i.row_count,i.metadata FROM ppcm.imports i JOIN ppcm.sources s ON s.import_id=i.id",
      )
    ).map(({ metadata, ...r }) => ({
      ...r,
      imported_at: iso(r.imported_at),
      ...metadata,
    }));
  const history = async (db = pool) =>
    (
      await rows(
        db,
        "SELECT i.id,i.type,i.filename,i.imported_at,i.row_count,CASE WHEN s.import_id=i.id THEN 1 ELSE 0 END AS active FROM ppcm.imports i LEFT JOIN ppcm.sources s ON s.import_id=i.id ORDER BY i.imported_at DESC",
      )
    ).map((r) => ({ ...r, imported_at: iso(r.imported_at) }));
  const records = async (db = pool) => {
    const notes = new Map(
      (await rows(db, "SELECT key,payload,version FROM ppcm.followups")).map(
        (r) => [r.key, { ...r.payload, version: r.version }],
      ),
    );
    return (
      await rows(
        db,
        "SELECT i.records FROM ppcm.imports i JOIN ppcm.sources s ON s.import_id=i.id",
      )
    )
      .flatMap((r) => r.records)
      .map((r) => ({ ...r, followup: notes.get(r.key) || null }));
  };
  const settings = async (db = pool) =>
    (await rows(db, "SELECT payload FROM ppcm.settings WHERE id=1"))[0].payload;
  const revision = async (db = pool) =>
    (
      await rows(
        db,
        "SELECT concat((SELECT coalesce(max(id),0) FROM ppcm.activity), ':', (SELECT md5(payload::text) FROM ppcm.settings WHERE id=1)) AS value",
      )
    )[0].value;
  return {
    sources,
    history,
    records,
    settings,
    revision,
    close: () => pool.end(),
    snapshot: () =>
      transaction(
        async (db) => ({
          records: await records(db),
          sources: await sources(db),
          settings: await settings(db),
          history: await history(db),
          revision: await revision(db),
        }),
        true,
      ),
    async importDatasets(datasets, actor = null) {
      if (
        !datasets.length ||
        new Set(datasets.map((d) => d.type)).size !== datasets.length
      )
        throw new ValidationError("Carga como máximo un archivo de cada tipo.");
      await transaction(async (db) => {
        for (const {
          records: data,
          type,
          filename,
          rowCount,
          ...metadata
        } of datasets) {
          const id = randomUUID();
          await db.query(
            "INSERT INTO ppcm.imports(id,type,filename,row_count,metadata,records) VALUES($1,$2,$3,$4,$5,$6)",
            [
              id,
              type,
              filename,
              rowCount,
              JSON.stringify({
                ...metadata,
                importedBy: actor?.display_name || actor?.email || "",
              }),
              JSON.stringify(data),
            ],
          );
          await db.query(
            "INSERT INTO ppcm.sources VALUES($1,$2) ON CONFLICT(type) DO UPDATE SET import_id=excluded.import_id",
            [type, id],
          );
          await db.query(
            "INSERT INTO ppcm.activity(record_key,detail) VALUES($1,$2)",
            ["import", JSON.stringify({ type, filename, rowCount, actor })],
          );
        }
      });
      return sources();
    },
    saveFollowup: (key, input, actor = null) =>
      transaction(async (db) => {
        if (!(await records(db)).some((r) => r.key === key))
          throw new ValidationError(
            "El registro ya no está en los datos activos.",
          );
        if (
          !FOLLOWUP_STATES.includes(input.state) ||
          typeof input.planner !== "string" ||
          input.planner.length > 100 ||
          typeof input.notes !== "string" ||
          input.notes.length > 5000 ||
          !Number.isInteger(input.version) ||
          input.version < 0
        )
          throw new ValidationError("Revisa los datos del seguimiento.");
        if (input.dueDate && !dateValue(input.dueDate))
          throw new ValidationError("Fecha de compromiso inválida.");
        const previous = (
          await rows(
            db,
            "SELECT payload,version FROM ppcm.followups WHERE key=$1",
            [key],
          )
        )[0];
        if ((previous?.version || 0) !== input.version) throw conflict();
        const payload = {
          planner: input.planner.trim(),
          state: input.state,
          notes: input.notes.trim(),
          dueDate: dateValue(input.dueDate) || "",
          updatedAt: new Date().toISOString(),
          updatedBy: actor?.display_name || actor?.email || "",
        };
        const version = input.version + 1;
        await db.query(
          "INSERT INTO ppcm.followups VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,version=excluded.version",
          [key, JSON.stringify(payload), version],
        );
        await db.query(
          "INSERT INTO ppcm.activity(record_key,detail) VALUES($1,$2)",
          [
            key,
            JSON.stringify({
              before: previous?.payload || null,
              after: payload,
              actor,
            }),
          ],
        );
        return { ...payload, version };
      }),
    restore: (id, actor = null) =>
      transaction(async (db) => {
        const item = (
          await rows(db, "SELECT type FROM ppcm.imports WHERE id=$1", [id])
        )[0];
        if (!item) throw new ValidationError("No se encontró esa importación.");
        await db.query("UPDATE ppcm.sources SET import_id=$1 WHERE type=$2", [
          id,
          item.type,
        ]);
        await db.query(
          "INSERT INTO ppcm.activity(record_key,detail) VALUES($1,$2)",
          ["restore", JSON.stringify({ id, type: item.type, actor })],
        );
      }),
    activity: async (key) =>
      (
        await rows(
          pool,
          "SELECT * FROM ppcm.activity WHERE record_key=$1 ORDER BY id DESC LIMIT 50",
          [key],
        )
      ).map((r) => ({ ...r, at: iso(r.at) })),
    async saveSettings(input) {
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
      await pool.query("UPDATE ppcm.settings SET payload=$1 WHERE id=1", [
        JSON.stringify(value),
      ]);
      return value;
    },
    backup: () =>
      transaction(async (db) => {
        const result = {
          version: 2,
          storage: "postgres",
          exportedAt: new Date().toISOString(),
        };
        for (const table of [
          "imports",
          "sources",
          "followups",
          "activity",
          "settings",
          "members",
        ])
          result[table] = await rows(db, `SELECT * FROM ppcm.${table}`);
        return result;
      }, true),
    async bootstrapAdmin(email) {
      if (!email) return;
      await pool.query(
        "INSERT INTO ppcm.members(id,email,display_name,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
        [randomUUID(), email.trim().toLowerCase(), "Administrador", "admin"],
      );
    },
    async memberFor(authUser) {
      if (!authUser?.email_confirmed_at || !authUser.email) return null;
      const member = (
        await rows(
          pool,
          "SELECT * FROM ppcm.members WHERE auth_user_id=$1 OR email=$2 LIMIT 1",
          [authUser.id, authUser.email.toLowerCase()],
        )
      )[0];
      if (
        !member?.active ||
        (member.auth_user_id && member.auth_user_id !== authUser.id)
      )
        return null;
      if (!member.auth_user_id) {
        const bound = await rows(
          pool,
          "UPDATE ppcm.members SET auth_user_id=$1 WHERE id=$2 AND auth_user_id IS NULL RETURNING id",
          [authUser.id, member.id],
        );
        if (!bound.length) return null;
      }
      return {
        id: member.id,
        auth_user_id: authUser.id,
        email: member.email,
        display_name: member.display_name,
        role: member.role,
      };
    },
    members: async () =>
      rows(
        pool,
        "SELECT id,email,display_name,role,active,created_at FROM ppcm.members ORDER BY email",
      ),
    saveMember: (input, actor) =>
      transaction(async (db) => {
        if (
          typeof input.email !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
          input.email.length > 254 ||
          !["admin", "editor", "viewer"].includes(input.role) ||
          typeof input.active !== "boolean" ||
          typeof input.display_name !== "string" ||
          !input.display_name.trim() ||
          input.display_name.length > 80
        )
          throw new ValidationError("Revisa el correo, el nombre y el rol.");
        const email = input.email.trim().toLowerCase();
        const previous = (
          await rows(db, "SELECT * FROM ppcm.members WHERE email=$1", [email])
        )[0];
        if (
          previous?.role === "admin" &&
          previous.active &&
          (!input.active || input.role !== "admin")
        ) {
          const admins = await rows(
            db,
            "SELECT id FROM ppcm.members WHERE role='admin' AND active=true",
          );
          if (admins.length <= 1)
            throw new ValidationError(
              "Debe quedar al menos un administrador activo.",
            );
          if (previous.id === actor.id)
            throw new ValidationError(
              "Otro administrador debe modificar tu acceso.",
            );
        }
        await db.query(
          "INSERT INTO ppcm.members(id,email,display_name,role,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,active=excluded.active",
          [
            previous?.id || randomUUID(),
            email,
            input.display_name.trim(),
            input.role,
            input.active,
          ],
        );
        await db.query(
          "INSERT INTO ppcm.activity(record_key,detail) VALUES($1,$2)",
          [
            "member",
            JSON.stringify({ before: previous || null, after: input, actor }),
          ],
        );
        return { ok: true };
      }),
  };
}
