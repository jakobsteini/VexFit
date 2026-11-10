// e2e/salzburg-kundenweg.spec.ts
//
// Dauerlauf 10.11.2026 – E6: Kunden-Weg Salzburg bei 0, 1 oder 2 freigegebenen
// Trainern, je bei 375 px (Handy) und 1440 px (Desktop). In diesem Projekt ist
// Playwright NICHT installiert – diese Datei ist die End-to-End-Fassung zum
// späteren Ausführen:
//
//   npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test e2e/salzburg-kundenweg.spec.ts
//
// Alle Supabase-/Edge-/Geo-Aufrufe werden abgefangen (page.route) – KEINE
// Live-Daten. BASIS: lokal servierte Seite oder https://vexfit.app.
import { expect, test, type Page } from "@playwright/test";

const BASIS = process.env.VEXFIT_BASIS || "http://localhost:5199";

// Ein Salzburger Trainer-Datensatz für die öffentliche Vorschau.
function trainer(i: number) {
  return {
    id: `t${i}`, vorname: `Trainer${i}`, stadt: "Salzburg", plz: "5020", land: "AT",
    trainingsart: "EMS", trainingsort: "vor_ort", preis_stunde: 50,
    bio: "Kurzprofil", spezialisierungen: ["Kraft"], avatar_url: null, aktiv: true,
  };
}

// Supabase-Vorschau (0/1/2 Trainer), Geo-Auflösung (5020 -> Salzburg) und die
// Vormerkung (/neuer-kunde) abfangen. `calls` sammelt die internen Meldungen.
async function fange(page: Page, anzahl: number, calls: string[]) {
  const liste = Array.from({ length: anzahl }, (_x, i) => trainer(i + 1));
  const body = JSON.stringify(liste);
  for (const sicht of ["trainers_vorschau", "trainers_oeffentlich"]) {
    await page.route(`**/rest/v1/${sicht}*`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body }));
  }
  await page.route("**/api.zippopotam.us/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [{ "place name": "Salzburg", latitude: "47.80", longitude: "13.04" }] }) }));
  await page.route("**/functions/v1/vexfit-automation/neuer-kunde", (r) => {
    calls.push("mail-kunde");
    return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
}

for (const breite of [375, 1440]) {
  for (const anzahl of [0, 1, 2]) {
    test(`Salzburg-Kundenweg: ${anzahl} Trainer bei ${breite}px`, async ({ page }) => {
      const calls: string[] = [];
      await fange(page, anzahl, calls);
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${BASIS}/suche.html?plz=5020&land=AT`);

      // Kein horizontales Scrollen (mobil + desktop).
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, "kein horizontaler Überlauf").toBeFalsy();

      if (anzahl === 0) {
        // Ehrlich: Leerzustand ODER Nähe-Hinweis mit Vormerkung – kein Absturz.
        const leer = page.locator("#emptyState.show, #naeheHinweis");
        await expect(leer.first()).toBeVisible();
        // Vormerkung möglich -> interne Meldung an office@ (aus E1).
        const feld = page.locator("#naeheVormerkForm input, #naeheVormerk input, input[type=email]").first();
        if (await feld.count()) {
          await feld.fill("kunde@example.com");
          await page.locator("button", { hasText: /Benachrichtige|Vormerk/i }).first().click();
          await expect.poll(() => calls.length).toBeGreaterThan(0);
        }
      } else {
        // 1 oder 2: die Trainer werden gezeigt, die Seite ist nicht „leer".
        await expect(page.locator("#emptyState.show")).toHaveCount(0);
        await expect(page.locator(".cf-card, .trainer-card, [data-trainer]").first()).toBeVisible();
      }
    });
  }
}
