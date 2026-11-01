// e2e/registrierung-kurz.spec.ts
//
// Playwright-Spec für Zusatzauftrag Teil R. In diesem Projekt ist Playwright
// NICHT installiert (kein Node-Toolchain) – die automatisierten Prüfungen laufen
// über Deno (registrierung_kurz_test.ts, gp03/teil4/profilstaerke). Diese Datei
// ist die End-to-End-Fassung zum späteren Ausführen:
//
//   npm init -y && npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test e2e/registrierung-kurz.spec.ts
//
// Alle Supabase-/Edge-Aufrufe werden abgefangen (page.route) – es entstehen
// KEINE Live-Datensätze. BASIS ist die lokal (oder auf vexfit.app) servierte Seite.
import { expect, test } from "@playwright/test";

const BASIS = process.env.VEXFIT_BASIS || "http://localhost:5199";

// Supabase/Edge abfangen: Signup liefert eine Fake-Sitzung, Insert/Meldung 2xx.
async function fangeSupabaseAb(page: import("@playwright/test").Page, calls: string[]) {
  await page.route("**/auth/v1/signup*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "11111111-1111-1111-1111-111111111111" } }) }));
  await page.route("**/rest/v1/trainers*", (r) => { calls.push("insert-trainer"); return r.fulfill({ status: 201, body: "" }); });
  await page.route("**/rest/v1/kunden*", (r) => { calls.push("insert-kunde"); return r.fulfill({ status: 201, body: "" }); });
  await page.route("**/functions/v1/vexfit-automation/neuer-trainer", (r) => { calls.push("mail-trainer:" + r.request().postData()); return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
  await page.route("**/functions/v1/vexfit-automation/neuer-kunde", (r) => { calls.push("mail-kunde"); return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
}

test("Trainer-Erstformular: nur Pflichtfelder, Mail sofort mit utm_campaign, dann geführter Ablauf", async ({ page }) => {
  const calls: string[] = [];
  await fangeSupabaseAb(page, calls);
  await page.goto(`${BASIS}/registrieren.html?typ=trainer&utm_campaign=ig_schmerz`);

  // Genau die kurzen Felder, kein gelber Balken.
  await expect(page.locator("#t-fn")).toBeVisible();
  await expect(page.locator("#t-pw2")).toHaveCount(0);
  await expect(page.locator("#t-plz")).toHaveCount(0);
  await expect(page.locator("#iabBanner")).toHaveCount(0);
  await expect(page.locator(".wa-btn")).toHaveCount(0);

  await page.fill("#t-fn", "Max");
  await page.fill("#t-ln", "Muster");
  await page.fill("#t-email", "max+e2e@example.com");
  await page.fill("#t-pw", "geheim123");
  await page.check("#t-agb");
  await page.click("#t-submit-btn");

  // neuer-trainer genau einmal, mit utm_campaign.
  await expect.poll(() => calls.filter((c) => c.startsWith("mail-trainer:")).length).toBe(1);
  const mail = calls.find((c) => c.startsWith("mail-trainer:")) || "";
  expect(mail).toContain("ig_schmerz");

  // Weiterleitung in den Trainer-Bereich (geführter Ablauf, ?neu=1).
  await page.waitForURL("**/trainer-bereich.html?neu=1*");
});

test("Passwort zeigen schaltet um", async ({ page }) => {
  await fangeSupabaseAb(page, []);
  await page.goto(`${BASIS}/registrieren.html?typ=trainer`);
  await expect(page.locator("#t-pw")).toHaveAttribute("type", "password");
  await page.click("#t-pw-zeigen");
  await expect(page.locator("#t-pw")).toHaveAttribute("type", "text");
});

test("Trainer-Bereich: kein Text behauptet Suche-Bedingung", async ({ page }) => {
  await page.goto(`${BASIS}/trainer-bereich.html`);
  await expect(page.locator("body")).not.toContainText("erscheint noch nicht in der Suche");
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`kein Querscroll / Felder frei bei ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${BASIS}/registrieren.html?typ=trainer`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(viewport.width + 1);
    await expect(page.locator("#t-submit-btn")).toBeVisible();
  });
}
