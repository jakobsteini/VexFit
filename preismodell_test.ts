// /Users/js/Projekte/Vexfit/app/vexfit/preismodell_test.ts
//
// Baustein "Trainer-Anmeldeseite: Hinweis 'Monatlich kuendbar' klarstellen".
//
// Auf registrieren.html?typ=trainer stand unter dem Button "✓ Kostenlos" direkt
// neben "✓ Monatlich kuendbar" — das widerspricht sich (gratis, aber kuendbar?).
// Das Preismodell (AGB rechtliches.html §3 + index.html): gratis bis zum ersten
// Kunden, DANACH €49,99/Monat, monatlich kuendbar. Die Haekchen sind darum auf
// "Gratis bis zu deinem 1. Kunden" und "Danach monatlich kuendbar" praezisiert.
//
// Dieser Test prueft ohne Netz gegen die echte Datei. Playwright ist in diesem
// Projekt nicht installiert; der Test liest das HTML statisch, wie pixel_id_test.ts.
//
// Aufruf:  deno test --allow-read preismodell_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("./registrieren.html", import.meta.url));

// Nur die Trainer-Ansicht (von #formTrainer bis zur Kunden-Form #formClient).
function trainerAnsicht(): string {
  const start = html.indexOf('id="formTrainer"');
  const ende = html.indexOf('id="formClient"');
  assert(start >= 0 && ende > start, "Trainer-/Kunden-Form nicht gefunden");
  return html.slice(start, ende);
}

Deno.test("Trainer-Ansicht: kein nacktes '✓ Kostenlos' mehr neben 'Monatlich kuendbar'", () => {
  const t = trainerAnsicht();
  assert(
    !t.includes('<div class="trust-item"><span>✓</span> Kostenlos</div>'),
    "das nackte Haekchen '✓ Kostenlos' steht noch in der Trainer-Ansicht",
  );
  assert(
    !t.includes('<div class="trust-item"><span>✓</span> Monatlich kündbar</div>'),
    "das nackte Haekchen '✓ Monatlich kündbar' steht noch in der Trainer-Ansicht",
  );
});

Deno.test("Trainer-Ansicht: die praezisierten Texte sind da, DACH-Region bleibt", () => {
  const t = trainerAnsicht();
  assertStringIncludes(t, "Gratis bis zur 1. angenommenen Anfrage");
  assertStringIncludes(t, "Danach monatlich kündbar");
  assertStringIncludes(t, "DACH-Region");
});

Deno.test("der Meta-Pixel bleibt unveraendert (ID 1034036285801133, keine neue ID)", () => {
  assertStringIncludes(html, "fbq('init', '1034036285801133')");
  assert(!html.includes("1105307262121912"), "die zurueckgenommene Pixel-ID ist wieder aufgetaucht");
  // Zustimmungs-Gate bleibt; Teil 1: CompleteRegistration für Trainer UND Kunde
  // über den gemeinsamen Helfer (Kunde war vorher 'Lead').
  assertStringIncludes(html, "=== 'zugestimmt') vexfitPixelLaden()");
  assertStringIncludes(html, "fbq('track','CompleteRegistration'");
  assertStringIncludes(html, "pixelRegistrierungFertig('trainer'");
  assertStringIncludes(html, "pixelRegistrierungFertig('kunde', capiEventId)");
  assert(!html.includes("fbq('track','Lead'"), "altes Lead-Ereignis noch vorhanden");
});
