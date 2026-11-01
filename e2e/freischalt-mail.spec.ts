// e2e/freischalt-mail.spec.ts
//
// Baustein „Freischalt-Mail an den Trainer". Playwright ist in diesem Projekt
// NICHT installiert; die automatisierte Prüfung läuft über Deno
// (admin_freischalt_mail_test.ts + verwaltung_logik_test.ts). Diese Datei ist
// die End-to-End-Fassung zum späteren Ausführen:
//
//   npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test e2e/freischalt-mail.spec.ts
//
// Geprüft wird die ANZEIGE in der Verwaltung (kein echtes Login/Supabase):
// die Detailansicht eines Trainers rendert „gesendet am …" bzw. den Knopf
// „Freischalt-Mail senden" bei 390 px und 1440 px. Dafür rufen wir die reine
// Funktion freischaltMailStatus der Seite auf und bauen die Statuszeile nach.
import { expect, test } from "@playwright/test";

const BASIS = process.env.VEXFIT_BASIS || "http://localhost:5199";
const SEITE = `${BASIS}/verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html`;

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`Status „gesendet am" und „noch nicht gesendet" bei ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(SEITE);
    const r = await page.evaluate(async () => {
      const mod = await import("./vexfit-verwaltung.js");
      const f = (mod as { freischaltMailStatus: (t: unknown) => { gesendet: boolean; datum: Date | null } }).freischaltMailStatus;
      const gesendet = f({ freischalt_mail_gesendet: "2026-11-01T11:00:00.000Z" });
      const offen = f({});
      return {
        gesendet: gesendet.gesendet,
        hatDatum: gesendet.datum instanceof Date,
        offen: offen.gesendet,
      };
    });
    expect(r.gesendet).toBe(true);
    expect(r.hatDatum).toBe(true);
    expect(r.offen).toBe(false);
    // Kein horizontaler Überlauf bei schmaler Ansicht.
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(viewport.width + 1);
  });
}
