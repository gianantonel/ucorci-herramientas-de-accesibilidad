import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("genera MP3 y WAV reales y transcribe el audio con Whisper base", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_AUDIO_TESTS !== "1",
    "Prueba con descargas de modelo y generación de audio; activar RUN_AUDIO_TESTS=1",
  );
  test.setTimeout(420000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Registrarse gratis", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Prueba");
  await dialog.getByLabel("Apellido", { exact: true }).fill("Audio");
  await dialog
    .getByLabel("Correo electrónico")
    .fill(`audio-${Date.now()}@example.invalid`);
  await dialog
    .getByLabel("Contraseña", { exact: true })
    .fill("Prueba-Local-Audio-2026");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Crear mi cuenta gratis" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("link", { name: "Abrir Texto a voz", exact: true })
    .click();
  await page
    .getByLabel("Texto para convertir a voz")
    .fill(
      "Hola. Esta es una prueba de lectura accesible. Estamos en Córdoba, Argentina.",
    );
  await page
    .getByRole("button", { name: "Generar audio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu audio está listo" }),
  ).toBeVisible({ timeout: 65000 });
  const [mp3] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Descargar audio", exact: true }).click(),
  ]);
  await mp3.saveAs("data/voice-sample.mp3");
  expect(readFileSync("data/voice-sample.mp3").length).toBeGreaterThan(1000);
  await page.getByLabel("Formato de descarga").selectOption("wav");
  await expect(page.getByRole("heading", { name: "Tu audio está listo" })).not.toBeVisible();
  await page
    .getByRole("button", { name: "Generar audio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu audio está listo" }),
  ).toBeVisible({ timeout: 65000 });
  const [wav] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Descargar audio", exact: true }).click(),
  ]);
  await wav.saveAs("data/voice-sample.wav");
  expect(readFileSync("data/voice-sample.wav").subarray(0, 4).toString()).toBe(
    "RIFF",
  );
  await page
    .getByRole("link", { name: "Volver al índice de herramientas" })
    .click();
  await page
    .getByRole("link", { name: "Abrir Audio a texto", exact: true })
    .click();
  await page.getByLabel("Cargar audio").setInputFiles("data/voice-sample.wav");
  await page
    .getByRole("button", { name: "Convertir audio a texto", exact: true })
    .click();
  const status = setInterval(async () => {
    try {
      console.log(
        "Whisper:",
        (await page.getByRole("status").allTextContents()).join(" "),
      );
    } catch {}
  }, 30000);
  try {
    await expect(page.getByLabel("Transcripción en texto plano")).toHaveValue(
      /Córdoba|Argentina/i,
      { timeout: 300000 },
    );
  } finally {
    clearInterval(status);
  }
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await dialog
    .getByText("Eliminar mi cuenta y mis datos", { exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await dialog
    .getByRole("button", { name: "Eliminar definitivamente" })
    .click();
  await expect(dialog).not.toBeVisible();
});
