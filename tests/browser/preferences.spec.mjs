import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("preferencias tienen nombre y valor visibles, teclado nativo y logo", async ({
  page,
}) => {
  await page.goto("/");
  const contrast = page.locator("summary").filter({ hasText: "Contraste:" });
  await expect(contrast).toHaveAccessibleName("Contraste: Oscuro");
  await contrast.hover();
  await expect(contrast).toHaveText("Contraste: Oscuro");
  await expect(
    page.locator("summary").filter({ hasText: "Fuente:" }),
  ).toHaveAccessibleName("Fuente: Estándar");
  await expect(
    page.locator("summary").filter({ hasText: "Texto:" }),
  ).toHaveAccessibleName("Texto: 100 %");
  await contrast.focus();
  await contrast.press("Enter");
  await expect(
    page.getByRole("radio", { name: "Oscuro", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Oscuro", exact: true }).focus();
  await page
    .getByRole("radio", { name: "Oscuro", exact: true })
    .press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Claro", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Claro", exact: true }).press("Escape");
  await expect(contrast).toBeFocused();
  await expect(contrast).toHaveAccessibleName("Contraste: Claro");
  const image = page.locator(".brand-logo");
  await expect(image).toBeVisible();
  expect(await image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(
    true,
  );
  await expect(
    page.getByRole("link", {
      name: "UCORCI, Unión Cordobesa de Ciegos. Inicio",
      exact: true,
    }),
  ).toBeVisible();
  await contrast.click();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: "data/ucorci-logo-preferencias.png",
    fullPage: true,
  });
  await page.setViewportSize({width:390,height:844});
  const textControl=page.locator('details.preference').filter({has:page.locator('summary').filter({hasText:'Texto:'})});
  await textControl.locator('summary').click();await textControl.getByRole('radio',{name:'200 %',exact:true}).check();
  await contrast.click();
  const panel=page.locator('.preference-options').filter({has:page.getByRole('radio',{name:'Claro',exact:true})});
  const bounds=await panel.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
});
