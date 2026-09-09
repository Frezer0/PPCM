import { test, expect } from "@playwright/test";

async function cloud(page, request, user) {
  const source = await (await request.get("/api/data")).json();
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: { mode: "cloud", user, access: { requireCredentials: true } },
    }),
  );
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        ...source,
        currentUser: user,
        mode: "cloud",
        revision: "1",
        access: { requireCredentials: true },
      },
    }),
  );
  await page.route("**/api/revision", (route) =>
    route.fulfill({ json: { revision: "1" } }),
  );
  await page.route("**/api/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/access-settings", (route) =>
    route.fulfill({ json: { requireCredentials: true } }),
  );
  await page.route("**/api/presence/leave", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
}

test("presencia del administrador: cuentas, visitantes, actualización automática y fallos de conexión", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await cloud(page, request, {
    id: "admin",
    display_name: "Administrador",
    email: "admin@example.test",
    role: "admin",
  });
  let heartbeats = 0;
  const tabs = new Set();
  await page.route("**/api/presence/heartbeat", (route) => {
    const payload = route.request().postDataJSON();
    expect(Object.keys(payload)).toEqual(["tabId"]);
    expect(payload.tabId).toMatch(/^[a-f0-9-]{36}$/);
    tabs.add(payload.tabId);
    heartbeats++;
    return route.fulfill({ json: { ok: true } });
  });
  let online = true;
  let failed = false;
  await page.route("**/api/presence", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: "Conexión no disponible" },
        })
      : route.fulfill({
          json: {
            updatedAt: new Date().toISOString(),
            onlineWindowSeconds: 90,
            entries: [
              {
                id: "admin",
                display_name: "Administrador",
                email: "admin@example.test",
                role: "admin",
                guest: false,
                online: true,
                last_seen: new Date().toISOString(),
              },
              {
                id: "guest:test",
                display_name: "Visita de prueba",
                email: "",
                role: "viewer",
                guest: true,
                online,
                last_seen: new Date().toISOString(),
              },
            ],
          },
        }),
  );
  await page.goto("/#members");
  const panel = page.getByRole("region", {
    name: "Conexiones y actividad reciente",
  });
  await expect(panel.getByRole("status")).toContainText("2 en línea");
  await expect(panel.getByRole("status")).toContainText(
    "1 cuenta · 1 visitante",
  );
  await expect(
    panel.getByText("Visita de prueba", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => heartbeats).toBeGreaterThan(0);
  const initial = heartbeats;
  online = false;
  await page.clock.fastForward(30000);
  await expect(panel.getByRole("status")).toContainText("1 en línea");
  await expect(
    panel.getByRole("row").filter({ hasText: "Visita de prueba" }),
  ).toContainText("Desconectado");
  await expect.poll(() => heartbeats).toBeGreaterThan(initial);
  await page.screenshot({
    path: "test-results/presence-admin.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/presence-mobile.png",
    fullPage: true,
  });
  failed = true;
  await panel.getByRole("button", { name: "Actualizar conexiones" }).click();
  await expect(panel.getByRole("status")).toHaveText(
    "Conexiones sin verificar",
  );
  await expect(panel.getByRole("alert")).toContainText(
    "Conexión no disponible",
  );
  await expect(panel.getByText("En línea", { exact: true })).toHaveCount(0);
  failed = false;
  await panel.getByRole("button", { name: "Actualizar conexiones" }).click();
  await expect(panel.getByRole("status")).toContainText("1 en línea");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("los visitantes envían presencia sin acceso a la lista del administrador", async ({
  page,
  request,
}) => {
  await cloud(page, request, {
    id: "guest:visitor",
    display_name: "Visitante",
    email: "",
    role: "viewer",
    guest: true,
  });
  let heartbeats = 0,
    listRequests = 0;
  await page.route("**/api/presence/heartbeat", (route) => {
    heartbeats++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/presence", (route) => {
    listRequests++;
    return route.fulfill({ status: 403, json: { error: "Sin permiso" } });
  });
  await page.goto("/#members");
  await expect(
    page.getByRole("heading", {
      name: "Resumen de mantenimiento",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(() => heartbeats).toBeGreaterThan(0);
  await expect(
    page.getByRole("region", { name: "Conexiones y actividad reciente" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Usuarios y permisos", exact: true }),
  ).toHaveCount(0);
  expect(listRequests).toBe(0);
});
