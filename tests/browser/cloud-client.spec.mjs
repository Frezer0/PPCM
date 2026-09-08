import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("descarga Windows desde el dashboard entrega el instalador con su hash publicado", async ({
  page,
  request,
}) => {
  const info = await (await request.get("/api/client")).json();
  test.skip(
    !info.available,
    "Compila o publica el instalador antes de verificar la descarga.",
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#client");
  await expect(
    page.getByRole("heading", { name: "PPCM para Windows", exact: true }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar para Windows" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(info.filename);
  const bytes = await readFile(await download.path());
  expect(bytes.length).toBe(info.size);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(info.sha256);
  await page.screenshot({
    path: "test-results/windows-download.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("acceso compartido: login, permisos de consulta y gestión de miembros", async ({
  page,
  request,
}) => {
  const source = await (await request.get("/api/data")).json();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let loggedIn = false;
  let role = "viewer";
  let members = [
    {
      id: "admin",
      email: "admin@example.test",
      display_name: "Administrador",
      role: "admin",
      active: true,
    },
  ];
  const user = () => ({
    id: "test",
    email: "user@example.test",
    display_name: "Usuario de prueba",
    role,
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        mode: "cloud",
        publicUrl: "https://ppcm.example",
        user: loggedIn ? user() : null,
      },
    }),
  );
  await page.route("**/api/auth/login", (route) => {
    loggedIn = true;
    return route.fulfill({ json: { user: user() } });
  });
  await page.route("**/api/auth/logout", (route) => {
    loggedIn = false;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: { ...source, mode: "cloud", currentUser: user(), revision: "1" },
    }),
  );
  await page.route("**/api/revision", (route) =>
    route.fulfill({ json: { revision: "1" } }),
  );
  await page.route("**/api/members", async (route) => {
    if (route.request().method() === "PUT") {
      members.push({ id: "new", ...route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: members });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bienvenido a tu espacio." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/cloud-login.png",
    fullPage: true,
  });
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("user@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Ingresar al dashboard" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Resumen de mantenimiento",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Actualizar datos", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Actualizar archivos", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Usuarios y permisos", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Configuración", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Órdenes de trabajo/ }).click();
  await page
    .getByRole("button", { name: /^Abrir \d+$/ })
    .first()
    .click();
  await page.getByRole("tab", { name: "Seguimiento", exact: true }).click();
  await expect(
    page.getByLabel("Observaciones", { exact: false }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByTitle("Cerrar sesión").click();
  await expect(
    page.getByRole("button", { name: "Ingresar al dashboard" }),
  ).toBeVisible();
  role = "admin";
  await page.getByLabel("Contraseña", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Ingresar al dashboard" }).click();
  await page
    .getByRole("button", { name: "Usuarios y permisos", exact: true })
    .click();
  await expect(
    page.getByText("admin@example.test", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Correo", { exact: true }).fill("editor@example.test");
  await page.getByLabel("Nombre", { exact: true }).fill("Editor de prueba");
  await page
    .getByRole("button", { name: "Guardar acceso", exact: true })
    .click();
  await expect(
    page.getByText("editor@example.test", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aplicación Windows", exact: true })
    .click();
  await expect(
    page.getByText("https://ppcm.example", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
