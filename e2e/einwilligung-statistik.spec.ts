// e2e/einwilligung-statistik.spec.ts
//
// Baustein 15.11.2026 (Variante A): Herkunfts-/Trichter-Messung nur mit
// Einwilligung „Statistik". In diesem Projekt ist Playwright NICHT installiert –
// die automatisierten Prüfungen laufen über Deno (einwilligung_statistik_test.ts).
// Diese Datei ist die End-to-End-Fassung zum späteren Ausführen:
//
//   npm init -y && npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test e2e/einwilligung-statistik.spec.ts
//
// Alle Supabase-/Edge-Aufrufe werden abgefangen (page.route). BASIS ist die
// lokal (oder auf vexfit.app) servierte Seite.
import { expect, test } from "@playwright/test";

const BASIS = process.env.VEXFIT_BASIS || "http://localhost:5199";

type Netz = { trichter: number; pixel: number };
async function fange(page: import("@playwright/test").Page): Promise<Netz> {
  const netz: Netz = { trichter: 0, pixel: 0 };
  await page.route("**/rest/v1/trichter_ereignisse*", (r) => { netz.trichter++; return r.fulfill({ status: 201, body: "" }); });
  await page.route("**/connect.facebook.net/**", (r) => { netz.pixel++; return r.fulfill({ status: 200, contentType: "application/javascript", body: "" }); });
  await page.route("**/functions/v1/vexfit-automation/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  await page.route("**/rest/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  return netz;
}

const KEYS = ["vexfit_werbung"]; // Herkunft/Trichter-Spuren auf dem Gerät
async function storageDump(page: import("@playwright/test").Page) {
  return await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    statistik: localStorage.getItem("vexfit_statistik"),
    consent: localStorage.getItem("vexfit_consent"),
  }));
}

test("Banner: Statistik ist standardmäßig AUS und getrennt von Marketing", async ({ page }) => {
  await fange(page);
  await page.goto(`${BASIS}/index.html`);
  await expect(page.locator("#cookieBanner")).toHaveClass(/show/);
  await expect(page.locator("#ck-statistik")).not.toBeChecked();
  await expect(page.locator("#ck-marketing")).not.toBeChecked();
});

test("Nur nötige: keine Herkunfts-/Trichter-Spuren, kein Pixel, kein Beacon", async ({ page }) => {
  const netz = await fange(page);
  await page.goto(`${BASIS}/suche.html?utm_source=ig&utm_campaign=test`);
  await page.click("#ck-nur");
  await page.waitForTimeout(200);
  const s = await storageDump(page);
  expect(s.statistik).toBe("nein");
  expect(s.consent).toBe("abgelehnt");
  for (const k of KEYS) { expect(s.local).not.toContain(k); expect(s.session).not.toContain(k); }
  expect(netz.trichter).toBe(0);
  expect(netz.pixel).toBe(0);
});

test("Statistik an: sessionStorage vexfit_werbung + Trichter-Beacon, Pixel bleibt aus", async ({ page }) => {
  const netz = await fange(page);
  await page.goto(`${BASIS}/suche.html?utm_source=ig&utm_campaign=test`);
  await page.check("#ck-statistik");
  await page.click("#ck-save");
  await page.waitForTimeout(200);
  const s = await storageDump(page);
  expect(s.statistik).toBe("ja");
  expect(s.session).toContain("vexfit_werbung");
  // Suche erneut aufrufen → Trichter-Beacon feuert jetzt.
  await page.goto(`${BASIS}/suche.html`);
  await page.waitForTimeout(200);
  expect(netz.trichter).toBeGreaterThan(0);
  expect(netz.pixel).toBe(0); // Marketing war nicht gewählt
});

test("Marketing an lädt das Pixel; Statistik bleibt aus", async ({ page }) => {
  const netz = await fange(page);
  await page.goto(`${BASIS}/index.html`);
  await page.check("#ck-marketing");
  await page.click("#ck-save");
  await page.waitForTimeout(300);
  const s = await storageDump(page);
  expect(s.consent).toBe("zugestimmt");
  expect(s.statistik).toBe("nein");
  expect(netz.pixel).toBeGreaterThan(0);
});

test("Bestehende Marketing-Zustimmung bleibt erhalten, Statistik aus", async ({ page }) => {
  const netz = await fange(page);
  await page.addInitScript(() => { try { localStorage.setItem("vexfit_consent", "zugestimmt"); } catch (_e) { /* */ } });
  await page.goto(`${BASIS}/index.html`);
  // Banner erscheint nicht erneut (Marketing bereits entschieden).
  await expect(page.locator("#cookieBanner")).not.toHaveClass(/show/);
  await page.waitForTimeout(300);
  const s = await storageDump(page);
  expect(s.consent).toBe("zugestimmt");
  expect(s.statistik).toBeNull(); // Statistik nie gewählt → aus
  expect(netz.pixel).toBeGreaterThan(0); // Marketing lädt Pixel beim Laden
  expect(netz.trichter).toBe(0); // ohne Statistik kein Trichter
});

test("Wunsch-Formular ohne Statistik: utm aus URL mitgeschickt, kein Referrer", async ({ page }) => {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/vexfit-automation/wunsch", (r) => {
    try { posts.push(JSON.parse(r.request().postData() || "{}")); } catch (_e) { /* */ }
    return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.route("**/rest/v1/**", (r) => r.fulfill({ status: 200, body: "[]" }));
  await page.goto(`${BASIS}/wunsch.html?utm_source=ig&utm_campaign=test`);
  await page.fill("#fVorname", "Max");
  await page.fill("#fEmail", "max+e2e@example.com");
  await page.selectOption("#fLand", "AT");
  await page.fill("#fPlz", "5020");
  await page.selectOption("#fZiel", { index: 1 });
  await page.locator(".checkbox-field", { has: page.locator("#fEinwilligung") }).locator(".custom-cb").click().catch(() => page.check("#fEinwilligung"));
  await page.click("#fSubmit");
  await expect.poll(() => posts.length).toBeGreaterThan(0);
  const p = posts[0];
  expect(String(p.utm_source || "")).toContain("ig");
  expect(String(p.referrer || "")).toBe(""); // ohne Statistik kein Referrer
  const s = await storageDump(page);
  expect(s.session).not.toContain("vexfit_werbung");
});

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  test(`Banner bedienbar bei ${viewport.width}px`, async ({ page }) => {
    await fange(page);
    await page.setViewportSize(viewport);
    await page.goto(`${BASIS}/index.html`);
    await expect(page.locator("#cookieBanner")).toHaveClass(/show/);
    await expect(page.locator("#ck-statistik")).toBeVisible();
    await expect(page.locator("#ck-nur")).toBeVisible();
    await expect(page.locator("#ck-all")).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(viewport.width + 1);
  });
}
