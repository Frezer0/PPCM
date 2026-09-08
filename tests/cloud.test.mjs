import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createPgStore } from "../server/pg-store.mjs";
import { createAuth, requireRole } from "../server/auth.mjs";
import { configuration } from "../server/config.mjs";
import { databaseConfiguration } from "../server/database-config.mjs";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { Client } from "pg";
import { normalizeRecord } from "../shared/domain.mjs";

const supabaseCA = readFileSync(
  new URL("../server/certs/supabase-prod-ca-2021.crt", import.meta.url),
  "utf8",
);
test("certificado Supabase incluido corresponde a la CA pública oficial vigente", () => {
  const cert = new X509Certificate(supabaseCA);
  assert.equal(cert.ca, true);
  assert.equal(
    cert.fingerprint256,
    "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
  );
  assert.ok(Date.now() < Date.parse(cert.validTo));
});

test("PostgreSQL confía en Supabase solo para sus dominios y conserva verificación TLS", () => {
  for (const host of [
    "aws-0-us-west-2.pooler.supabase.com",
    "db.example.supabase.co",
  ]) {
    const config = databaseConfiguration({
      DATABASE_URL: `postgresql://user:test@${host}:5432/postgres?sslmode=disable&ssl=false&sslrootcert=ignored.crt&application_name=ppcm`,
    });
    const client = new Client(config);
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
    assert.ok(client.connectionParameters.ssl.ca.includes(supabaseCA));
    assert.equal(
      new URL(config.connectionString).searchParams.has("sslmode"),
      false,
    );
    assert.equal(
      new URL(config.connectionString).searchParams.get("application_name"),
      "ppcm",
    );
  }
  for (const host of [
    "localhost",
    "pooler.supabase.com.example.test",
    "db.example.supabase.co.example.test",
  ]) {
    const config = databaseConfiguration({
      DATABASE_URL: `postgresql://user:test@${host}:5432/postgres`,
    });
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  }
});

test("certificado explícito acepta PEM o saltos escapados y mantiene prioridad", () => {
  for (const value of [supabaseCA, supabaseCA.replace(/\n/g, "\\n")]) {
    const config = databaseConfiguration({
      DATABASE_URL:
        "postgresql://user:test@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
      SUPABASE_CA_CERT: value,
    });
    assert.equal(config.ssl.ca, supabaseCA.trim());
    assert.equal(config.ssl.rejectUnauthorized, true);
  }
});

test("modo Render exige configuración completa y nunca inicia con base local", () => {
  assert.throws(() => configuration({ RENDER: "true" }), /DATABASE_URL/);
  const env = {
    PPCM_MODE: "cloud",
    DATABASE_URL: "postgres://example",
    PUBLIC_APP_URL: "https://ppcm.example",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-test-key",
    BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
  };
  assert.equal(configuration(env).cloud, true);
  assert.throws(
    () => configuration({ ...env, PUBLIC_APP_URL: "http://ppcm.example" }),
    /HTTPS/,
  );
});
test("PostgreSQL: esquema, cargas atómicas, persistencia, control de versiones y permisos", async () => {
  const db = new PGlite();
  let tail = Promise.resolve();
  const query = (sql, params) =>
    sql.includes("pg_advisory_xact_lock")
      ? Promise.resolve({ rows: [] })
      : params
        ? db.query(sql, params)
        : sql.includes("CREATE SCHEMA")
          ? db.exec(sql).then(() => ({ rows: [] }))
          : db.query(sql);
  const pool = {
    query,
    async connect() {
      const previous = tail;
      let release;
      tail = new Promise((r) => {
        release = r;
      });
      await previous;
      return { query, release };
    },
    end: () => db.close(),
  };
  const store = await createPgStore(pool);
  try {
    await store.bootstrapAdmin("admin@example.test");
    const actor = await store.memberFor({
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.test",
      email_confirmed_at: "2026-01-01",
    });
    assert.equal(actor.role, "admin");
    assert.equal(
      await store.memberFor({
        id: "22222222-2222-4222-8222-222222222222",
        email: "stranger@example.test",
        email_confirmed_at: "2026-01-01",
      }),
      null,
    );
    const row = normalizeRecord(
      {
        Orden: "10001",
        "Texto breve": "Mantenimiento de prueba",
        "Centro emplazamiento": "FCF1",
        "Grupo planificación": 100,
        Prioridad: 6,
        "Tota general (plan)": 1000,
        "Costes tot.reales": 800,
      },
      "order",
    );
    const dataset = {
      type: "order",
      filename: "prueba.xlsx",
      rowCount: 1,
      records: [row],
      warnings: [],
    };
    await store.importDatasets([dataset], actor);
    const initial = (await store.sources())[0].id;
    const input = {
      state: "En gestión",
      planner: "Responsable de prueba",
      notes: "Verificar",
      dueDate: "2026-10-01",
      version: 0,
    };
    const changes = await Promise.allSettled([
      store.saveFollowup(row.key, input, actor),
      store.saveFollowup(row.key, input, actor),
    ]);
    assert.equal(changes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      changes.find((r) => r.status === "rejected").reason.status,
      409,
    );
    await store.importDatasets([dataset], actor);
    await store.restore(initial, actor);
    const snapshot = await store.snapshot();
    assert.equal(snapshot.records[0].followup.notes, "Verificar");
    assert.equal(snapshot.history.length, 2);
    assert.equal(
      (await store.activity(row.key))[0].detail.actor.email,
      actor.email,
    );
    await assert.rejects(
      store.importDatasets([dataset, { ...dataset, type: "invalid" }], actor),
    );
    assert.equal((await store.history()).length, 2);
    await assert.rejects(
      store.saveMember(
        {
          email: actor.email,
          display_name: "Admin",
          role: "viewer",
          active: true,
        },
        actor,
      ),
      /administrador/,
    );
    await store.saveMember(
      {
        email: "viewer@example.test",
        display_name: "Consulta",
        role: "viewer",
        active: true,
      },
      actor,
    );
    assert.equal((await store.members()).length, 2);
    assert.equal((await store.backup()).followups.length, 1);
  } finally {
    await store.close();
  }
});
test("autenticación usa cookies HttpOnly y valida usuario y pertenencia", async () => {
  const member = { id: "user", email: "admin@example.test", role: "admin" };
  const fetcher = async (url) =>
    new Response(
      JSON.stringify(
        url.includes("/token?")
          ? {
              access_token: "access-test",
              refresh_token: "refresh-test",
              expires_in: 3600,
            }
          : {
              id: "user",
              email: member.email,
              email_confirmed_at: "2026-01-01",
            },
      ),
      { status: 200 },
    );
  const auth = createAuth({
    cloud: true,
    supabaseUrl: "https://example.supabase.co",
    publicKey: "public-test",
    store: { memberFor: async () => member },
    fetcher,
  });
  const saved = [];
  let body;
  const res = {
    cookie: (...args) => saved.push(args),
    clearCookie() {},
    json: (value) => {
      body = value;
    },
  };
  await auth.login(
    { ip: "test", body: { email: member.email, password: "test-password" } },
    res,
  );
  assert.equal(saved.length, 2);
  assert.equal(saved[0][2].httpOnly, true);
  assert.equal(saved[0][2].secure, true);
  assert.equal(JSON.stringify(body).includes("access-test"), false);
  assert.equal(
    (
      await auth.current(
        { headers: { cookie: "ppcm_access=access-test" } },
        res,
      )
    ).id,
    "user",
  );
  assert.equal(await auth.current({ headers: {} }, res), null);
  assert.throws(
    () => requireRole("admin")({ user: { role: "viewer" } }, {}, () => {}),
    /permiso/,
  );
});
