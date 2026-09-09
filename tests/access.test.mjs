import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createPgStore } from "../server/pg-store.mjs";
import {
  createAuth,
  requireRole,
  requireImportAccess,
} from "../server/auth.mjs";
import { randomUUID } from "node:crypto";

async function fixture(t) {
  const db = new PGlite();
  let tail = Promise.resolve();
  const query = (sql, params) =>
    sql.includes("pg_advisory_xact_lock")
      ? Promise.resolve({ rows: [] })
      : !params && sql.includes("CREATE TABLE")
        ? db.exec(sql).then(() => ({ rows: [] }))
        : db.query(sql, params);
  const pool = {
    query,
    end: () => db.close(),
    async connect() {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      return { query, release };
    },
  };
  const store = await createPgStore(pool);
  t.after(() => store.close());
  await store.bootstrapAdmin("admin@example.test");
  const [admin] = await store.members();
  const auth = createAuth({
    cloud: true,
    store,
    fetcher: () => {
      throw new Error("No debe llamar a Supabase para estas cuentas.");
    },
  });
  return { db, pool, store, admin, auth };
}
function response() {
  const cookies = new Map();
  return {
    cookies,
    body: null,
    cookie(name, value, options) {
      cookies.set(name, { value, options });
    },
    clearCookie(name) {
      cookies.delete(name);
    },
    json(value) {
      this.body = value;
    },
  };
}
const request = (res, body = {}) => ({
  ip: "test",
  body,
  headers: {
    cookie: [...res.cookies]
      .map(([name, c]) => `${name}=${c.value}`)
      .join("; "),
  },
});
const account = (values = {}) => ({
  id: "",
  email: "editor@example.test",
  display_name: "Editor de prueba",
  role: "editor",
  active: true,
  login_mode: "password",
  password: "Clave-inicial-2026",
  ...values,
});

test("presencia agrupa pestañas y equipos, conserva las otras conexiones y vence sin latidos", async (t) => {
  const { db, pool, store, admin } = await fixture(t);
  const browser = randomUUID(),
    otherBrowser = randomUUID();
  const first = randomUUID(),
    second = randomUUID();
  const before = await store.revision();
  await store.recordPresence(admin, browser, first);
  await store.recordPresence(admin, browser, second);
  await store.recordPresence(admin, otherBrowser, first);
  let result = await store.presence();
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].online, true);
  assert.equal(result.entries[0].guest, false);
  assert.equal(result.entries[0].email, admin.email);
  assert.equal(
    await store.revision(),
    before,
    "los latidos no generan actividad de mantenimiento",
  );
  const restarted = await createPgStore(pool);
  assert.equal((await restarted.presence()).entries[0].online, true);
  await store.leavePresence(admin, browser, first);
  assert.equal((await store.presence()).entries[0].online, true);
  await store.endPresenceSession(browser);
  assert.equal(
    (await store.presence()).entries[0].online,
    true,
    "otro equipo sigue conectado",
  );
  await store.endPresenceSession(otherBrowser);
  assert.equal((await store.presence()).entries[0].online, false);
  await store.recordPresence(admin, otherBrowser, first);
  await db.query(
    "UPDATE ppcm.presence SET last_seen=now()-interval '91 seconds'",
  );
  assert.equal((await store.presence()).entries[0].online, false);
  await store.recordPresence(admin, otherBrowser, first);
  assert.equal((await store.presence()).entries[0].online, true);
  await db.query(
    "UPDATE ppcm.presence SET last_seen=now()-interval '25 hours'",
  );
  assert.equal((await store.presence()).entries.length, 0);
});

test("presencia distingue visitantes con el mismo nombre y refleja el cierre del acceso público", async (t) => {
  const { store, admin } = await fixture(t);
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  const one = await store.createGuestSession("Administrador");
  const two = await store.createGuestSession("Administrador");
  await store.recordPresence(admin, randomUUID(), randomUUID());
  await store.recordPresence(one.user, randomUUID(), randomUUID());
  await store.recordPresence(two.user, randomUUID(), randomUUID());
  let result = await store.presence();
  assert.equal(result.entries.length, 3);
  assert.equal(
    result.entries.filter((r) => r.guest && r.online && r.role === "viewer")
      .length,
    2,
  );
  await store.saveAccessSettings({ requireCredentials: true }, admin);
  result = await store.presence();
  assert.equal(result.entries.filter((r) => r.online).length, 1);
  assert.equal(result.entries.find((r) => !r.guest).role, "admin");
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  assert.equal(
    (await store.presence()).entries.filter((r) => r.online).length,
    1,
  );
});

test("presencia usa la sesión autenticada y cierra solo el navegador que sale", async (t) => {
  const { store, admin, auth } = await fixture(t);
  const input = account();
  await store.saveMember(input, admin);
  const first = response(),
    second = response();
  await auth.login(
    { ip: "first", body: { email: input.email, password: input.password } },
    first,
  );
  await auth.login(
    { ip: "second", body: { email: input.email, password: input.password } },
    second,
  );
  const member = await auth.current(request(first), first);
  await auth.current(request(second), second);
  const browser1 = first.cookies.get("ppcm_presence"),
    browser2 = second.cookies.get("ppcm_presence");
  assert.notEqual(browser1.value, browser2.value);
  assert.equal(browser1.options.httpOnly, true);
  assert.equal(browser1.options.secure, true);
  await store.recordPresence(member, browser1.value, randomUUID());
  await store.recordPresence(member, browser2.value, randomUUID());
  const details = JSON.stringify(await store.presence());
  for (const secret of [
    browser1.value,
    browser2.value,
    first.cookies.get("ppcm_member").value,
  ])
    assert.ok(!details.includes(secret));
  assert.ok(!JSON.stringify(await store.backup()).includes(browser1.value));
  assert.throws(
    () => requireRole("admin")({ user: member }, response(), () => {}),
    { status: 403 },
  );
  await auth.logout(request(first), first);
  assert.equal((await store.presence()).entries[0].online, true);
  await auth.logout(request(second), second);
  assert.equal((await store.presence()).entries[0].online, false);
});

test("presencia valida identificadores, respeta identidad y revocación del usuario", async (t) => {
  const { store, admin } = await fixture(t);
  const browser = randomUUID(),
    tab = randomUUID();
  await assert.rejects(store.recordPresence(admin, browser, "invalid"), {
    status: 400,
  });
  await store.recordPresence(admin, browser, tab);
  await store.leavePresence({ id: randomUUID() }, browser, tab);
  assert.equal((await store.presence()).entries[0].online, true);
  await store.saveMember(account(), admin);
  const editor = (await store.members()).find((r) => r.role === "editor");
  await store.recordPresence(editor, randomUUID(), randomUUID());
  await store.saveMember({ ...editor, active: false }, admin);
  assert.equal(
    (await store.presence()).entries.find((r) => r.id === editor.id).online,
    false,
  );
});

test("las cuentas de Supabase conservan su identificador de presencia al renovar el acceso", async (t) => {
  const { store, admin } = await fixture(t);
  const auth = createAuth({
    cloud: true,
    store,
    supabaseUrl: "https://auth.example",
    publicKey: "test",
    fetcher: async (url) =>
      new Response(
        JSON.stringify(
          url.includes("/token?")
            ? {
                access_token: "new",
                refresh_token: "renewed",
                expires_in: 3600,
              }
            : {
                id: "11111111-1111-4111-8111-111111111111",
                email: admin.email,
                email_confirmed_at: "2026-01-01",
              },
        ),
        { status: 200 },
      ),
  });
  const res = response();
  const member = await auth.current(
    { headers: { cookie: "ppcm_access=valid" } },
    res,
  );
  const browser = res.cookies.get("ppcm_presence").value;
  await store.recordPresence(member, browser, randomUUID());
  const req = {
    headers: { cookie: `ppcm_refresh=refresh; ppcm_presence=${browser}` },
  };
  const renewed = await auth.current(req, response());
  assert.equal(req.presenceSession, browser);
  await store.recordPresence(renewed, req.presenceSession, randomUUID());
  assert.equal((await store.presence()).entries.length, 1);
});

test("acceso general: exige credenciales por defecto, persiste y cierra invitados al reactivarlo", async (t) => {
  const { store, pool, admin, auth } = await fixture(t);
  assert.deepEqual(await store.accessSettings(), { requireCredentials: true });
  await assert.rejects(
    auth.guest({ ip: "test", body: { name: "Visita" } }, response()),
    { status: 403 },
  );
  await assert.rejects(
    store.saveAccessSettings({ requireCredentials: "false" }, admin),
  );
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  const restarted = await createPgStore(pool);
  assert.deepEqual(await restarted.accessSettings(), {
    requireCredentials: false,
  });
  const res = response();
  await auth.guest(
    { ip: "guest", body: { name: " Administrador ", role: "admin" } },
    res,
  );
  assert.equal(res.body.user.role, "viewer");
  assert.equal(res.body.user.guest, true);
  assert.equal(res.body.user.display_name, "Administrador");
  const cookie = res.cookies.get("ppcm_guest");
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, "lax");
  const guestReq = request(res);
  assert.equal((await auth.current(guestReq, response())).role, "viewer");
  const requiredReq = request(res);
  let next = false;
  await auth.required(requiredReq, response(), () => {
    next = true;
  });
  assert.equal(next, true);
  for (const roles of [["admin"], ["admin", "editor"]])
    assert.throws(
      () => requireRole(...roles)(requiredReq, response(), () => {}),
      { status: 403 },
    );
  assert.equal(
    (await store.members()).length,
    1,
    "los visitantes no crean cuentas registradas",
  );
  assert.ok(!JSON.stringify(await store.backup()).includes(cookie.value));
  await store.saveAccessSettings({ requireCredentials: true }, admin);
  assert.equal(await auth.current(guestReq, response()), null);
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  assert.equal(
    await auth.current(guestReq, response()),
    null,
    "no se recuperan sesiones revocadas",
  );
});

test("invitados: valida nombre, caducidad, cierre de sesión y carreras con el interruptor", async (t) => {
  const { db, store, admin, auth } = await fixture(t);
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  for (const name of ["", " ", "a", "x".repeat(81), "Juan\nadmin", {}, null])
    await assert.rejects(store.createGuestSession(name), { status: 400 });
  const res = response();
  await auth.guest({ ip: "test", body: { name: "María José" } }, res);
  const req = request(res);
  await auth.logout(req, res);
  assert.equal(await auth.current(req, response()), null);
  const expired = await store.createGuestSession("Visitante");
  await db.query(
    "UPDATE ppcm.guest_sessions SET expires_at=now()-interval '1 second'",
  );
  assert.equal(await store.guestSession(expired.token), null);
  const results = await Promise.allSettled([
    store.createGuestSession("Entrada concurrente"),
    store.saveAccessSettings({ requireCredentials: true }, admin),
  ]);
  if (results[0].status === "fulfilled")
    assert.equal(await store.guestSession(results[0].value.token), null);
  assert.equal(results[1].status, "fulfilled");
});

test("cuentas: crea y cambia contraseña sin exponerla, revoca sesiones y conserva el acceso existente", async (t) => {
  const { db, store, admin, auth } = await fixture(t);
  const input = account();
  await store.saveMember(input, admin);
  const member = (await store.members()).find((m) => m.email === input.email);
  const res = response();
  await auth.login(
    {
      ip: "test",
      body: { email: "EDITOR@example.test", password: input.password },
    },
    res,
  );
  assert.equal(res.body.user.id, member.id);
  assert.equal(res.body.user.role, "editor");
  const req = request(res);
  const token = res.cookies.get("ppcm_member").value;
  assert.equal((await auth.current(req, response())).id, member.id);
  const stored = (
    await db.query("SELECT password_hash FROM ppcm.member_credentials")
  ).rows[0].password_hash;
  assert.notEqual(stored, input.password);
  const exposed = JSON.stringify([
    res.body,
    await store.members(),
    await store.activity("member"),
    await store.backup(),
  ]);
  for (const secret of [input.password, stored, token])
    assert.ok(!exposed.includes(secret));
  await assert.rejects(
    auth.login(
      { ip: "wrong", body: { email: input.email, password: "incorrecta" } },
      response(),
    ),
    { status: 401 },
  );
  await store.saveMember(
    { ...member, password: "", display_name: "Nombre actualizado" },
    admin,
  );
  assert.equal(await auth.current(req, response()), null);
  await auth.login(
    { ip: "test", body: { email: input.email, password: input.password } },
    res,
  );
  const stale = await store.memberCredentials(input.email);
  const oldSession = request(res);
  const newPassword = "Clave-nueva-2026";
  await store.saveMember({ ...member, password: newPassword }, admin);
  assert.equal(await auth.current(oldSession, response()), null);
  await assert.rejects(store.createMemberSession(stale), { status: 401 });
  await assert.rejects(
    auth.login(
      { ip: "old", body: { email: input.email, password: input.password } },
      response(),
    ),
    { status: 401 },
  );
  await auth.login(
    { ip: "test", body: { email: input.email, password: newPassword } },
    res,
  );
  const logoutReq = request(res);
  await auth.logout(logoutReq, res);
  assert.equal(await auth.current(logoutReq, response()), null);
  assert.equal(
    (await store.members()).find((m) => m.id === admin.id).login_mode,
    "supabase",
  );
  await store.saveMember({ ...member, active: false, password: "" }, admin);
  await assert.rejects(
    auth.login(
      { ip: "disabled", body: { email: input.email, password: newPassword } },
      response(),
    ),
    { status: 401 },
  );
});

test("cuentas: rechaza duplicados y contraseñas inválidas, protege último admin y limita intentos", async (t) => {
  const { store, admin, auth } = await fixture(t);
  for (const password of ["", "corta", " ".repeat(8), "x".repeat(257)])
    await assert.rejects(store.saveMember(account({ password }), admin), {
      status: 400,
    });
  await store.saveMember(account(), admin);
  await assert.rejects(store.saveMember(account(), admin), /ya está en uso/);
  await assert.rejects(
    store.saveMember({ ...admin, role: "viewer", password: "" }, admin),
    /administrador activo/,
  );
  await store.saveMember(
    { ...admin, login_mode: "password", password: "Admin-2026-seguro" },
    admin,
  );
  assert.equal(
    await store.memberFor({
      id: "11111111-1111-4111-8111-111111111111",
      email: admin.email,
      email_confirmed_at: "2026-01-01",
    }),
    null,
    "al cambiar la contraseña no sigue funcionando el acceso previo de Supabase",
  );
  const res = response();
  await auth.login(
    {
      ip: "admin",
      body: { email: admin.email, password: "Admin-2026-seguro" },
    },
    res,
  );
  assert.equal(res.body.user.role, "admin");
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  assert.equal(
    (await auth.current(request(res), response())).role,
    "admin",
    "el interruptor conserva el acceso administrador",
  );
  for (let i = 0; i < 10; i++)
    await assert.rejects(
      auth.login(
        { ip: "limited", body: { email: "unknown", password: "invalid" } },
        response(),
      ),
      { status: 401 },
    );
  await assert.rejects(
    auth.login(
      { ip: "limited", body: { email: "unknown", password: "invalid" } },
      response(),
    ),
    { status: 429 },
  );
});

test("sin contraseña, invitados y cuentas de consulta pueden importar sin obtener permisos de seguimiento", async (t) => {
  const { store, admin, auth } = await fixture(t);
  await store.saveMember(
    account({ email: "consulta@example.test", role: "viewer" }),
    admin,
  );
  const viewer = (await store.members()).find((m) => m.role === "viewer");
  const guard = requireImportAccess(store);
  await assert.rejects(
    guard({ user: viewer }, response(), () => {}),
    { status: 403 },
  );
  await assert.rejects(
    guard({}, response(), () => {}),
    { status: 401 },
  );
  await store.saveAccessSettings({ requireCredentials: false }, admin);
  const res = response();
  await auth.guest(
    { ip: "import", body: { name: "Visitante que carga" } },
    res,
  );
  const guestRequest = request(res);
  await auth.required(guestRequest, response(), () => {});
  for (const user of [guestRequest.user, viewer]) {
    let allowed = false;
    await guard({ user }, response(), () => {
      allowed = true;
    });
    assert.equal(allowed, true);
    assert.throws(
      () => requireRole("admin", "editor")({ user }, response(), () => {}),
      { status: 403 },
    );
    assert.throws(() => requireRole("admin")({ user }, response(), () => {}), {
      status: 403,
    });
  }
  await store.importDatasets(
    [
      {
        type: "order",
        filename: "visitante.xlsx",
        rowCount: 1,
        records: [
          {
            key: "order:10001",
            id: "10001",
            type: "order",
            description: "Orden de visitante",
          },
        ],
        warnings: [],
      },
    ],
    guestRequest.user,
  );
  assert.equal((await store.sources())[0].importedBy, "Visitante que carga");
  assert.equal((await store.activity("import"))[0].detail.actor.guest, true);
  await store.saveAccessSettings({ requireCredentials: true }, admin);
  assert.equal(await auth.current(guestRequest, response()), null);
  await assert.rejects(
    guard({ user: viewer }, response(), () => {}),
    { status: 403 },
  );
});
