import { test, expect } from "@playwright/test";

test("administrador configura ingreso, crea contraseña y comprueba acceso e importación solo con nombre", async ({
  page,
  request,
}) => {
  const source = await (await request.get("/api/data")).json();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requireCredentials = true;
  let currentUser = {
    id: "admin",
    email: "admin@example.test",
    display_name: "Administrador",
    role: "admin",
  };
  const admin = currentUser;
  let members = [{ ...admin, active: true, login_mode: "supabase" }];
  let lastMemberInput;
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        mode: "cloud",
        publicUrl: "https://ppcm.example",
        user: currentUser,
        access: { requireCredentials },
      },
    }),
  );
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        ...source,
        currentUser,
        mode: "cloud",
        revision: "1",
        access: { requireCredentials },
      },
    }),
  );
  await page.route("**/api/revision", (route) =>
    route.fulfill({ json: { revision: "1" } }),
  );
  await page.route("**/api/access-settings", (route) => {
    if (route.request().method() === "PUT")
      requireCredentials = route.request().postDataJSON().requireCredentials;
    return route.fulfill({ json: { requireCredentials } });
  });
  await page.route("**/api/members", (route) => {
    if (route.request().method() === "PUT") {
      lastMemberInput = route.request().postDataJSON();
      const { password, ...profile } = lastMemberInput;
      const existing = members.findIndex((m) => m.id === profile.id);
      if (existing >= 0) members[existing] = profile;
      else members.push({ ...profile, id: "editor" });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: members });
  });
  let guestImports = 0;
  await page.route("**/api/import/preview", (route) =>
    route.fulfill({
      json: {
        type: "order",
        filename: "OMs IW38.xlsx",
        sheet: "Órdenes",
        rowCount: 2727,
        token: "guest-preview",
        warnings: [],
        added: 0,
        removed: 0,
        existing: 2727,
        sample: [],
      },
    }),
  );
  await page.route("**/api/import/commit", (route) => {
    expect(currentUser.guest).toBe(true);
    expect(requireCredentials).toBe(false);
    expect(route.request().postDataJSON()).toEqual({
      tokens: ["guest-preview"],
    });
    guestImports++;
    return route.fulfill({ json: { sources: source.sources } });
  });
  await page.route("**/api/auth/logout", (route) => {
    currentUser = null;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/auth/login", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: admin.email,
      password: "Admin-seguro-2026",
    });
    currentUser = admin;
    return route.fulfill({ json: { user: currentUser } });
  });
  await page.route("**/api/auth/guest", (route) => {
    expect(requireCredentials).toBe(false);
    const body = route.request().postDataJSON();
    expect(body).toEqual({ name: "Visitante de prueba" });
    currentUser = {
      id: "guest:test",
      email: "",
      display_name: body.name,
      role: "viewer",
      guest: true,
    };
    return route.fulfill({ json: { user: currentUser } });
  });

  await page.goto("/#members");
  const toggle = page.getByRole("switch", {
    name: "Solicitar correo y contraseña al ingresar",
  });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(
    page.getByText(/Cualquier persona que escriba un nombre/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Guardar configuración de ingreso" })
    .click();
  await expect(
    page.getByText("Configuración de ingreso guardada."),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await page.getByLabel("Correo", { exact: true }).fill("nuevo@example.test");
  await page.getByLabel("Nombre", { exact: true }).fill("Nuevo editor");
  await page.getByLabel("Contraseña", { exact: true }).fill("Nueva-clave-2026");
  await page
    .getByRole("button", { name: "Guardar acceso", exact: true })
    .click();
  await expect(
    page.getByText("nuevo@example.test", { exact: true }),
  ).toBeVisible();
  expect(lastMemberInput.password).toBe("Nueva-clave-2026");
  expect(lastMemberInput.login_mode).toBe("password");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");
  const editorRow = page
    .getByRole("row")
    .filter({ hasText: "nuevo@example.test" });
  await editorRow.getByRole("button", { name: "Editar" }).click();
  await expect(
    page.getByLabel("Nueva contraseña", { exact: false }),
  ).toHaveValue("");
  await page
    .getByLabel("Nueva contraseña", { exact: false })
    .fill("Otra-clave-2026");
  await page
    .getByRole("button", { name: "Guardar acceso", exact: true })
    .click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  expect(lastMemberInput.password).toBe("Otra-clave-2026");
  await page.screenshot({
    path: "test-results/access-settings-admin.png",
    fullPage: true,
  });

  await page.getByTitle("Cerrar sesión").click();
  await expect(
    page.getByLabel("Nombre de usuario", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Nombre de usuario", { exact: false })
    .fill("Visitante de prueba");
  await page.screenshot({
    path: "test-results/guest-login.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Resumen de mantenimiento",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Usuarios y permisos", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Actualizar datos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exportar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actualizar datos", exact: true })
    .click();
  await page
    .getByLabel("Seleccionar archivos Excel")
    .setInputFiles("OMs IW38.xlsx");
  await expect(
    page.getByRole("button", { name: "Confirmar importación", exact: false }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirmar importación", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(guestImports).toBe(1);
  await page.getByTitle("Cerrar sesión").click();
  await page
    .getByRole("button", { name: "Ingresar con correo y contraseña" })
    .click();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill(admin.email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Admin-seguro-2026");
  await page.getByRole("button", { name: "Ingresar al dashboard" }).click();
  await page
    .getByRole("button", { name: "Usuarios y permisos", exact: true })
    .click();
  await toggle.check();
  await page
    .getByRole("button", { name: "Guardar configuración de ingreso" })
    .click();
  await expect(
    page.getByText("Configuración de ingreso guardada."),
  ).toBeVisible();
  await page.getByTitle("Cerrar sesión").click();
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nombre de usuario", { exact: false }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("el formulario actualiza el modo cuando el administrador lo cambia antes de entrar", async ({
  page,
}) => {
  let required = false;
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        mode: "cloud",
        user: null,
        access: { requireCredentials: required },
      },
    }),
  );
  await page.route("**/api/auth/guest", (route) => {
    required = true;
    return route.fulfill({
      status: 403,
      json: {
        error: "El administrador activó el ingreso con correo y contraseña.",
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Nombre de usuario", { exact: false }).fill("Visita");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(
    page.getByLabel("Correo electrónico", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("activó el ingreso");
  await expect(
    page.getByLabel("Nombre de usuario", { exact: false }),
  ).toHaveCount(0);
});
