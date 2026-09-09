import { test, expect } from "@playwright/test";

test("el menú permite llegar a todas las opciones y mantiene el perfil visible en pantallas bajas", async ({
  page,
  request,
}) => {
  const source = await (await request.get("/api/data")).json();
  const user = {
    id: "admin",
    role: "admin",
    display_name:
      "Administrador con un nombre largo para comprobar el espacio del perfil",
    email: "admin@example.test",
  };
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
  await page.route("**/api/presence/heartbeat", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/presence/leave", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const viewport of [
    { width: 1440, height: 1050 },
    { width: 1366, height: 768 },
    { width: 1280, height: 600 },
    { width: 1024, height: 600 },
    { width: 390, height: 600 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/#overview");
    await expect(
      page.getByRole("heading", {
        name: "Resumen de mantenimiento",
        exact: true,
      }),
    ).toBeVisible();
    if (viewport.width <= 760)
      await page.getByRole("button", { name: "Abrir menú" }).click();
    const sidebar = page.locator(".sidebar");
    const logout = page.getByTitle("Cerrar sesión");
    await expect(logout).toBeInViewport();
    const profile = await sidebar.locator(".local-profile").boundingBox();
    expect(profile.y).toBeGreaterThanOrEqual(0);
    expect(profile.y + profile.height).toBeLessThanOrEqual(viewport.height + 1);
    for (const name of [
      "Configuración",
      "Usuarios y permisos",
      "Resumen general",
    ]) {
      const option = sidebar.getByRole("button", { name, exact: true });
      await option.scrollIntoViewIfNeeded();
      await expect(option).toBeInViewport();
      await expect(logout).toBeInViewport();
    }
    const visibleLogout = await logout.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      );
    });
    expect(visibleLogout).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    if (viewport.width === 1366 || viewport.width === 390) {
      await sidebar
        .getByRole("button", { name: "Configuración", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "test-results/sidebar-" + viewport.width + ".png",
        fullPage: false,
      });
    }
  }
  expect(errors).toEqual([]);
});
