// /Users/js/Projekte/Vexfit/app/vexfit/k7_brief_test.ts
//
// Dauerlauf 07.11.2026 – K7: Brief-Generator für die Post-Akquise. Strukturell
// geprüft (das PDF-Erzeugen selbst wurde im Lauf manuell gerendert):
//   * liest CSV (name;ort;postanschrift;website;schwerpunkt),
//   * Preis EXAKT nach AGB §3 (keine verbotene Formulierung),
//   * QR auf trainer.html mit utm_source=brief&utm_campaign=salzburg&utm_content,
//   * Absender ohne Straßenadresse (nur Salzburg, Österreich + Kontakt),
//   * Zeilen ohne Postanschrift werden übersprungen und gelistet,
//   * Ausgabeordner ist in .gitignore, Beispiel-CSV klar als BEISPIEL markiert,
//   * nutzt das projekteigene vexfit-qr.js (kein Fremdpaket).
//
// Aufruf:  deno test --allow-read k7_brief_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("K7: CSV-Spalten, QR mit UTM, Preis AGB §3, kein Fremdpaket", async () => {
  const s = await lies("./werkzeuge/brief-generator.mjs");
  for (const sp of ['"name"', '"ort"', '"postanschrift"', '"website"', '"schwerpunkt"']) {
    assertStringIncludes(s, sp);
  }
  assertStringIncludes(s, "utm_source=brief&utm_campaign=salzburg&utm_content=");
  assertStringIncludes(s, "49,99 € pro Monat, monatlich kündbar");
  assertStringIncludes(s, "einmalig 9,99 €");
  // verbotene AGB-widrige Formulierungen nicht enthalten.
  for (const v of ["bis zum ersten kunden", "ersten kunden gewonnen"]) {
    assert(!s.toLowerCase().includes(v), "AGB-widrige Formulierung: " + v);
  }
  assertStringIncludes(s, 'require("../vexfit-qr.js")');
});

Deno.test("K7: Absender ohne Straßenadresse", async () => {
  const s = await lies("./werkzeuge/brief-generator.mjs");
  const i = s.indexOf("const ABSENDER");
  const z = s.slice(i, i + 160);
  assertStringIncludes(z, "Salzburg, Österreich");
  assertStringIncludes(z, "office@vexfit.app");
  // Keine Straße/Hausnummer/PLZ im Absender.
  assert(!/\b5\d{3}\b/.test(z), "PLZ im Absender");
  assert(!/stra(ß|ss)e/i.test(z), "Straße im Absender");
});

Deno.test("K7: Zeilen ohne Postanschrift werden übersprungen und gelistet", async () => {
  const s = await lies("./werkzeuge/brief-generator.mjs");
  assertStringIncludes(s, "if (!row.postanschrift) { uebersprungen.push");
  assertStringIncludes(s, "Übersprungen (keine Postanschrift)");
});

Deno.test("K7: Beispiel-CSV klar markiert, inkl. Zeile ohne Postanschrift", async () => {
  const csv = await lies("./werkzeuge/briefe-beispiel.csv");
  assert((csv.match(/BEISPIEL/g) || []).length >= 2, "weniger als 2 BEISPIEL-Zeilen");
  assertStringIncludes(csv, "name;ort;postanschrift;website;schwerpunkt");
  // Eine Zeile ohne Postanschrift (zwei ;; hintereinander im Anschrift-Feld).
  assert(/;;/.test(csv), "keine Zeile ohne Postanschrift zum Testen");
});

Deno.test("K7: Ausgabeordner ist in .gitignore (Briefe nicht im Repo)", async () => {
  const gi = await lies("./.gitignore");
  assertStringIncludes(gi, "briefe-ausgabe/");
});
