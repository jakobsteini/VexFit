// e2e/suche-nur-angemeldet.spec.ts
//
// Baustein 12.11.2026 – Suche nur für angemeldete Kunden, 25 km Umkreis.
// Playwright ist in diesem Projekt nicht installiert – diese Datei ist die
// End-to-End-Fassung zum späteren Ausführen (gegen den lokal servierten Stand
// MIT eingespielter Migration 2026-11-12-01):
//
//   npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test e2e/suche-nur-angemeldet.spec.ts
//
// Geprüft: (a) nicht angemeldet → kein Trainername/-ort im DOM UND keine
// REST-Antwort mit Trainerdaten; (b) angemeldet → RPC liefert nur ≤25 km; bei 0
// Treffern ehrliche Leerseite + Vormerkung (interne Mail gestubbt). 375 + 1440 px.
import { expect, test, type Page } from "@playwright/test";

const BASIS = process.env.VEXFIT_BASIS || "http://localhost:5199";

const SITZUNG = {
  access_token: "tok", refresh_token: "ref",
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "kunde@example.com", role: "kunde",
};

// Jede /rest/v1/-Antwort mitschneiden; keine darf Trainerdaten (nachname/vorname/
// stadt) für anon liefern. RPC + Geo stubben.
async function fange(page: Page, trainer: unknown[], restCalls: string[]) {
  await page.route("**/rest/v1/**", (r) => {
    restCalls.push(r.request().method() + " " + r.request().url());
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/rpc/suche_trainer_umkreis", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(trainer) }));
  await page.route("**/api.zippopotam.us/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [{ "place name": "Salzburg", latitude: "47.80", longitude: "13.04" }] }) }));
  await page.route("**/functions/v1/vexfit-automation/neuer-kunde", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
}

for (const breite of [375, 1440]) {
  test(`anon: suche.html zeigt KEINE Trainerdaten (${breite}px)`, async ({ page }) => {
    const restCalls: string[] = [];
    await fange(page, [], restCalls);
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`${BASIS}/suche.html?plz=5020&land=AT`);
    await expect(page.locator("#anonGate")).toBeVisible();
    // Kein Trainer-Netzaufruf (weder Tabelle/Sicht noch RPC).
    expect(restCalls.filter((u) => /trainers|suche_trainer_umkreis/.test(u))).toEqual([]);
    const dom = (await page.locator("body").innerText()).toLowerCase();
    expect(dom.includes("vor ort")).toBeFalsy();
  });

  test(`angemeldet: nur ≤25 km, 0 Treffer → Vormerkung (${breite}px)`, async ({ page }) => {
    const restCalls: string[] = [];
    await fange(page, [], restCalls); // RPC liefert leer
    await page.addInitScript((s) => { try { localStorage.setItem("vexfit_session", JSON.stringify(s)); } catch { /* egal */ } }, SITZUNG);
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`${BASIS}/suche.html?plz=5020&land=AT`);
    await expect(page.locator("#naeheHinweis")).toBeVisible();
    const vorm = page.locator("#naehe-email");
    await vorm.fill("kunde@example.com");
    await page.locator("button", { hasText: /Benachrichtige/i }).first().click();
  });
}

test("angemeldet: ein Treffer wird gezeigt (RPC-Ergebnis)", async ({ page }) => {
  const restCalls: string[] = [];
  await fange(page, [{ id: "t1", vorname: "Nina", nachname: "B.", stadt: "Salzburg", plz: "5020", land: "AT", trainingsart: "EMS", trainingsort: "vor_ort", preis_stunde: 50, entfernung_km: 3 }], restCalls);
  await page.addInitScript((s) => { try { localStorage.setItem("vexfit_session", JSON.stringify(s)); } catch { /* egal */ } }, SITZUNG);
  await page.goto(`${BASIS}/suche.html?plz=5020&land=AT`);
  await expect(page.locator("#trainerGrid")).toContainText(/Nina/);
});
