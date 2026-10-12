import test from "node:test";
import assert from "node:assert/strict";
import { plainText, extractText } from "../src/files.js";
test("transcripción conserva español y puntuación sin emojis", () => {
  assert.equal(
    plainText(" Hola  Córdoba. 👋 Argentina 🇦🇷 1️⃣ "),
    "Hola Córdoba. Argentina 1",
  );
  assert.equal(
    plainText("Año 2026, atención: número 5."),
    "Año 2026, atención: número 5.",
  );
});
test("archivos de texto y límites", async () => {
  assert.equal(
    await extractText(new File(["Texto accesible"], "lectura.txt")),
    "Texto accesible",
  );
  await assert.rejects(
    extractText({ name: "big.txt", size: 21 * 1024 * 1024 }),
    /20 MB/,
  );
  await assert.rejects(
    extractText(new File(["legacy"], "lectura.doc")),
    /Formato no compatible/,
  );
});
