import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

test("índice, buscador, contraste, tamaño y fuente persistentes; sin infracciones axe", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "UCORCI Herramientas de Accesibilidad",
  );
  await page.getByLabel("Buscar una herramienta").fill("dislexia");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Buscar una herramienta").fill("");
  for (const theme of ["dark", "light", "yellow"]) {
    await page.getByLabel("Contraste", { exact: true }).selectOption(theme);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations)).toEqual([]);
  }
  await page.getByLabel("Fuente", { exact: true }).selectOption("dyslexia");
  await page.getByLabel("Texto", { exact: true }).selectOption("150");
  await page.reload();
  await expect(page.getByLabel("Contraste", { exact: true })).toHaveValue(
    "yellow",
  );
  await expect(page.getByLabel("Fuente", { exact: true })).toHaveValue(
    "dyslexia",
  );
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("150");
  await page.getByLabel("Contraste", { exact: true }).selectOption("dark");
  await page.getByLabel("Fuente", { exact: true }).selectOption("standard");
  await page.getByLabel("Texto", { exact: true }).selectOption("100");
  mkdirSync("data", { recursive: true });
  await page.screenshot({ path: "data/ucorci-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "data/ucorci-mobile.png", fullPage: true });
});

test("registro, sesión recordada, lectura adaptada, exportación y cuenta privada", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Registrarse gratis", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nombre", { exact: true }).fill("Prueba");
  await dialog.getByLabel("Apellido", { exact: true }).fill("Accesibilidad");
  await dialog
    .getByLabel("Correo electrónico")
    .fill(`local-${Date.now()}@example.invalid`);
  await dialog
    .getByLabel("Contraseña", { exact: true })
    .fill("Prueba-Solo-Local-2026");
  await dialog.getByRole("checkbox").check();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Crear mi cuenta gratis" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Mi cuenta", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mi cuenta", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Abrir Lectura para dislexia", exact: true })
    .click();
  await page
    .getByLabel("Texto para adaptar")
    .fill("Córdoba: lectura accesible.");
  await page
    .getByRole("button", { name: "Adaptar texto", exact: true })
    .click();
  await expect(page.locator(".reading")).toHaveText(
    "Córdoba: lectura accesible.",
  );
  const adapted = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(adapted.violations).toEqual([]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar lectura HTML" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("ucorci-lectura.html");
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await dialog
    .getByText("Eliminar mi cuenta y mis datos", { exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await dialog
    .getByRole("button", { name: "Eliminar definitivamente" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrarse gratis", exact: true }),
  ).toBeVisible();
});

test("extrae TXT, HTML, PDF, DOCX y todas las hojas XLSX", async ({ page }) => {
  await page.goto("/#tts");
  await page
    .getByLabel("Cargar un documento")
    .setInputFiles({
      name: "documento.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Texto desde TXT"),
    });
  await expect(page.getByLabel("Texto para convertir a voz")).toHaveValue(
    "Texto desde TXT",
  );
  await page
    .getByLabel("Cargar un documento")
    .setInputFiles({
      name: "documento.html",
      mimeType: "text/html",
      buffer: Buffer.from(
        '<h1>Texto HTML</h1><script>alert("no ejecutar")</script><p>Segundo párrafo</p>',
      ),
    });
  await expect(page.getByLabel("Texto para convertir a voz")).toHaveValue(
    /Texto HTML/,
  );
  expect(
    await page.getByLabel("Texto para convertir a voz").inputValue(),
  ).not.toContain("alert");
  for (const [file, expected] of [
    ["documento.docx", "Texto desde Word"],
    ["documento.xlsx", "Segunda hoja"],
    ["documento.pdf", "Texto desde PDF"],
  ]) {
    test.skip(
      !existsSync(resolve("data", file)),
      "Fixtures generadas por el desarrollador no disponibles",
    );
    await page
      .getByLabel("Cargar un documento")
      .setInputFiles(resolve("data", file));
    await expect(page.locator('.upload [role="status"]')).toHaveText(
      new RegExp("Texto extraído de " + file),
      { timeout: 20000 },
    );
    await expect(page.getByLabel("Texto para convertir a voz")).toHaveValue(
      new RegExp(expected),
      { timeout: 20000 },
    );
  }
});
