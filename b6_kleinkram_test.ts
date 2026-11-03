// /Users/js/Projekte/Vexfit/app/vexfit/b6_kleinkram_test.ts
//
// B6 (Dauerlauf 2026-11-03): Kleinkram. Prüft ohne Browser/Netz gegen die echten
// Quelldateien.
//   a) Umsatzsteuer: Kleinunternehmer-Hinweis statt "inkl. USt" (Preise unverändert)
//   b) Datenschutz/Meta-Pixel: bewusst NICHT eingefügt (kein fertiger Text in der
//      Quelle) – dieser Test hält die Block-Entscheidung fest
//   c) Kunden-Tracking: Browser-Seite reicht event_id/Zustimmung/Quell-URL mit
//   d) Studio-Randfall: registrieren.html löst den Studiokontext auf und legt ihn ab
//
// Aufruf:  deno test --allow-read b6_kleinkram_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const KLEIN = "Kein Ausweis der Umsatzsteuer – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG";

Deno.test("B6a: rechtliches.html §3 nennt den Kleinunternehmer-Hinweis statt 'inkl. USt'", async () => {
  const html = await lies("./rechtliches.html");
  assertStringIncludes(html, KLEIN);
  assert(!html.includes("€49,99</strong> inkl. USt"), "altes 'inkl. USt' noch vorhanden");
  // Der Preis selbst bleibt unverändert.
  assertStringIncludes(html, "€49,99");
  assertStringIncludes(html, "€9,99");
});

Deno.test("B6a: AGB-Entwurf §6 setzt den USt-Status auf Kleinunternehmer (Platzhalter aufgelöst)", async () => {
  const md = await lies("./docs/recht/agb-entwurf-2026-11-03.md");
  assertStringIncludes(md, KLEIN);
  // Der offene Platzhalter mit der Regelbesteuerungs-Alternative ist weg.
  assert(!md.includes('ODER Regelbesteuerung „inkl. 20 % USt"'), "USt-Platzhalter noch offen");
  // Preise unverändert.
  assertStringIncludes(md, "49,99 € pro Monat");
  assertStringIncludes(md, "einmalig 9,99 €");
});

Deno.test("B6b: Meta-Pixel-Datenschutztext bewusst NICHT eingefügt (kein fertiger Text in der Quelle)", async () => {
  const quelle = await lies("./docs/recht/aenderungen-datenschutz-impressum.md");
  // Die Quelle beschreibt nur Anforderungen ("Erforderlich: ... als Empfänger"),
  // sie liefert KEINEN fertig formulierten Datenschutz-Absatz zum wörtlichen
  // Übernehmen. Darum wurde nach der Regel BLOCK-STATT-RATEN nichts eingefügt.
  assertStringIncludes(quelle, "Erforderlich:");
  const recht = await lies("./rechtliches.html");
  // Es wurde kein erfundener Meta-Absatz in die Datenschutzerklärung geschrieben.
  assert(!recht.includes("Meta Platforms"), "ein nicht belegter Meta-Absatz wurde eingefügt");
  assert(!recht.includes("Conversions API"), "ein nicht belegter CAPI-Absatz wurde eingefügt");
});

Deno.test("B6c: Kunden-Pfad reicht event_id, Zustimmung und Quell-URL an /neuer-kunde", async () => {
  const reg = await lies("./registrieren.html");
  // Die submitClient-Seite erzeugt eine event_id, liest die Zustimmung und
  // schickt beides (plus Quell-URL) an die Function; das Pixel bekommt dieselbe id.
  assertStringIncludes(reg, "pixelRegistrierungFertig('kunde', capiEventId)");
  // Im neuer-kunde-Aufruf stehen die drei Entdopplungs-Felder.
  const i = reg.indexOf("/vexfit-automation/neuer-kunde");
  assert(i >= 0, "neuer-kunde-Aufruf nicht gefunden");
  const umfeld = reg.slice(i, i + 400);
  assertStringIncludes(umfeld, "event_id: capiEventId");
  assertStringIncludes(umfeld, "zustimmung: zugestimmt");
  assertStringIncludes(umfeld, "event_source_url: location.href");
});

Deno.test("B6c: Edge-Function sendet CompleteRegistration auch im Kunden-Pfad", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  // In neuerKunde steht derselbe Aufruf wie in neuerTrainer.
  const i = kern.indexOf("async function neuerKunde(");
  assert(i >= 0, "neuerKunde nicht gefunden");
  const ende = kern.indexOf("async function", i + 10);
  const block = kern.slice(i, ende > i ? ende : kern.length);
  assertStringIncludes(block, "await sendeMetaConversion(a, body)");
  assertStringIncludes(block, "capi }");
});

Deno.test("B6d: registrieren.html liest standort+s und legt den Studiokontext ab", async () => {
  const reg = await lies("./registrieren.html");
  assertStringIncludes(reg, "studioKontextAusUrl");
  assertStringIncludes(reg, "p.get('standort')");
  assertStringIncludes(reg, "p.get('s')");
  assertStringIncludes(reg, "rpc/studio_anzeigen");
  // Es wird dieselbe Objektform wie auf der Studioseite abgelegt.
  assertStringIncludes(reg, "setItem('vexfit_studio'");
  assertStringIncludes(reg, "standort_id:treffer.id");
  // Ein bestehender QR-Kontext wird nicht überschrieben.
  assertStringIncludes(reg, "if(localStorage.getItem('vexfit_studio')) return;");
});

Deno.test("B6d: Studio-Seite reicht den Studio-Slug (s) in den Registrier-Links mit", async () => {
  const studio = await lies("./studio.html");
  // Ohne den Studio-Slug könnte registrieren.html den Standort nicht auflösen.
  assertStringIncludes(studio, "registrieren.html?typ=kunde&s=${encodeURIComponent(studioSlug)}&standort=");
  assertStringIncludes(studio, "function standortBlock(a, studioName, studioSlug)");
  assertStringIncludes(studio, "function trainerKarten(trainer, slug, studioName, studioSlug)");
});
