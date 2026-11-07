// /Users/js/Projekte/Vexfit/app/vexfit/s1_vorschau_test.ts
//
// Dauerlauf 07./08.11.2026 – S1: Öffentliche Vorschau produktionsreif.
// Geprüft (ohne Netz, reine Datei-/Funktionsprüfung):
//   * Schalter OEFFENTLICHE_VORSCHAU ist AN,
//   * strenge Sicht trainers_vorschau liefert KEINEN vollen Nachnamen
//     (nur nachname_initial), keinen Monatspreis, keine Kontaktdaten, und nur
//     freigeschaltete UND nicht gesperrte Trainer,
//   * suche.html lädt für nicht angemeldete Besucher aus trainers_vorschau,
//     und die Vorschau-Spaltenliste enthält kein Feld "nachname".
//
// Aufruf:  deno test --allow-read s1_vorschau_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("S1: OEFFENTLICHE_VORSCHAU ist eingeschaltet", async () => {
  const cfg = await lies("./vexfit-config.js");
  assertStringIncludes(cfg, "OEFFENTLICHE_VORSCHAU: true");
});

Deno.test("S1: Sicht trainers_vorschau ohne vollen Nachnamen/Kontaktdaten/Monatspreis", async () => {
  const m = await lies("./migrations/2026-11-08-01-trainers-vorschau.sql");
  assertStringIncludes(m, "CREATE OR REPLACE VIEW public.trainers_vorschau");
  assertStringIncludes(m, "nachname_initial");
  assertStringIncludes(m, "WHERE aktiv = true AND gesperrt IS NOT TRUE");
  assertStringIncludes(m, "GRANT SELECT ON public.trainers_vorschau TO anon, authenticated");
  // Der Teil ab SELECT bis FROM darf NUR unbedenkliche Spalten nennen.
  const sel = m.slice(m.indexOf("SELECT"), m.indexOf("FROM public.trainers"));
  for (const verboten of ["email", "telefon", "user_id", "preis_monat", "zertifikate", "calendly", "stripe_bezahlt"]) {
    assert(!sel.includes(verboten), `Vorschau-Sicht darf ${verboten} nicht ausliefern`);
  }
  // Der volle Nachname darf keine AUSGELIEFERTE Spalte sein: keine Spaltenzeile
  // "    nachname,". (Im CASE darf nachname vorkommen – daraus entsteht nur die
  // Initiale, der volle Wert verlässt die DB nicht.)
  assert(!/\n\s*nachname\s*,/.test(sel), "voller Nachname als ausgelieferte Spalte");
  // Rücknahme vorhanden.
  const r = await lies("./migrations/ruecknahmen/2026-11-08-01-trainers-vorschau-ruecknahme.sql");
  assertStringIncludes(r, "DROP VIEW IF EXISTS public.trainers_vorschau");
});

Deno.test("S1: suche.html lädt nicht angemeldet aus trainers_vorschau, ohne Nachnamen", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "trainers_vorschau?select=");
  assertStringIncludes(s, "function ladeVorschau(");
  assertStringIncludes(s, "vexVorschau.vorschauAktiv(angemeldet)) {");
  // Die Vorschau-Spaltenliste trägt kein Feld "nachname" (nur nachname_initial).
  const m = s.match(/const VORSCHAU_SPALTEN = '([^']+)'/);
  assert(m, "VORSCHAU_SPALTEN nicht gefunden");
  const felder = m![1].split(",");
  assert(!felder.includes("nachname"), "VORSCHAU_SPALTEN enthält den vollen Nachnamen");
  assert(felder.includes("nachname_initial"), "VORSCHAU_SPALTEN sollte nachname_initial enthalten");
  for (const verboten of ["email", "telefon", "user_id", "preis_monat"]) {
    assert(!felder.includes(verboten), `VORSCHAU_SPALTEN darf ${verboten} nicht anfordern`);
  }
});
