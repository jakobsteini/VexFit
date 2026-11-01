// e2e/verwaltung-qr.spec.ts
//
// Baustein „QR-Code im zweiten Faktor". In diesem Projekt ist Playwright NICHT
// installiert (kein Node-Toolchain) – die automatisierte Prüfung läuft über Deno
// (verwaltung_logik_test.ts: qrAlsDatenUri + CSP erlaubt data:). Diese Datei ist
// die End-to-End-Fassung zum späteren Ausführen:
//
//   npm init -y && npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test e2e/verwaltung-qr.spec.ts
//
// Die Supabase-MFA-Antwort wird abgefangen (page.route) und liefert einen QR als
// data:image/svg+xml;utf-8,<svg …> mit rohem SVG – genau wie Supabase es sendet.
// KEINE Live-Datensätze, kein echtes Login nötig: wir rufen die Normalisierung
// der Seite direkt auf und prüfen, dass das <img> lädt und die CSP nicht meckert.
import { expect, test } from "@playwright/test";

const BASIS = process.env.VEXFIT_BASIS || "http://localhost:5199";
const SEITE = `${BASIS}/verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html`;

// So kommt der QR von Supabase: roher, NICHT prozentkodierter SVG-Inhalt mit '#'
// in der Füllfarbe – unkodiert zerstört das die data:-Adresse (kaputtes Bild).
const SUPABASE_QR =
  'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 2 2"><rect width="2" height="2" fill="#ffffff"/><rect width="1" height="1" fill="#000000"/></svg>';

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`QR-Bild lädt ohne CSP-Verstoß bei ${viewport.width}px`, async ({ page }) => {
    const cspFehler: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to load the image/i.test(t)) cspFehler.push(t);
    });
    await page.setViewportSize(viewport);
    await page.goto(SEITE);

    // Die Seite normalisiert den Supabase-Wert selbst (qrAlsDatenUri). Wir setzen
    // das <img> über denselben Weg wie die Seite: Modul importieren, Quelle setzen.
    const geladen = await page.evaluate(async ({ roh }) => {
      const mod = await import("./vexfit-verwaltung.js");
      const img = document.getElementById("mfa-qr") as HTMLImageElement;
      img.src = (mod as { qrAlsDatenUri: (s: string) => string }).qrAlsDatenUri(roh);
      await new Promise<void>((res, rej) => {
        if (img.complete && img.naturalWidth > 0) return res();
        img.onload = () => res();
        img.onerror = () => rej(new Error("QR-Bild konnte nicht geladen werden"));
        setTimeout(() => (img.naturalWidth > 0 ? res() : rej(new Error("Timeout"))), 2000);
      });
      return img.naturalWidth;
    }, { roh: SUPABASE_QR });

    expect(geladen).toBeGreaterThan(0);
    expect(cspFehler, cspFehler.join("\n")).toHaveLength(0);
  });
}
