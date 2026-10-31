// /Users/js/Projekte/Vexfit/app/vexfit/matching_verfuegbarkeit_test.ts
//
// Baustein 5 (Matching) und 6 (Verfuegbarkeit). Migration und Seiten ohne
// Browser/DB. Die Bewertungslogik hat eine eigene Pruefung
// (vexfit-matching_test.ts).
//
// Aufruf:  deno test --allow-read matching_verfuegbarkeit_test.ts
import { assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Migration 05: verfuegbarkeit-Spalte, Recht, Sicht", async () => {
  const sql = await lies("./migrations/2026-10-31-05-verfuegbarkeit.sql");
  assertStringIncludes(sql, "ADD COLUMN verfuegbarkeit text[]");
  assertStringIncludes(sql, "GRANT UPDATE (verfuegbarkeit) ON public.trainers TO authenticated");
  assertStringIncludes(sql.slice(sql.indexOf("CREATE OR REPLACE VIEW")), "verfuegbarkeit");
});

Deno.test("Ruecknahme 05 entfernt die Spalte", async () => {
  const sql = await lies("./migrations/2026-10-31-05-verfuegbarkeit-ruecknahme.sql");
  assertStringIncludes(sql, "DROP COLUMN IF EXISTS verfuegbarkeit");
});

Deno.test("profil-bearbeiten.html: Verfuegbarkeits-Raster wird gespeichert", async () => {
  const html = await lies("./profil-bearbeiten.html");
  assertStringIncludes(html, "function verfGridAufbauen()");
  assertStringIncludes(html, "function toggleVerf(");
  assertStringIncludes(html, "body.verfuegbarkeit = verfuegbarkeit");
});

Deno.test("profil.html: zeigt die Verfuegbarkeit", async () => {
  const html = await lies("./profil.html");
  assertStringIncludes(html, "pVerfSection");
  assertStringIncludes(html, "t.verfuegbarkeit");
  assertStringIncludes(html, "verfuegbarkeit`"); // in den Lade-Spalten
});

Deno.test("suche.html: Matching in 4 Fragen", async () => {
  const html = await lies("./suche.html");
  assertStringIncludes(html, "vexfit-matching.js");
  assertStringIncludes(html, "function matchingStarten()");
  assertStringIncludes(html, "vexMatch.sortiere(allTrainers, antworten)");
  // Die vier Fragen.
  assertStringIncludes(html, "matchZiel");
  assertStringIncludes(html, "matchOrt");
  assertStringIncludes(html, "matchSprache");
  assertStringIncludes(html, "matchZeit");
  // verfuegbarkeit wird geladen (fuer die Zeit-Frage).
  assertStringIncludes(html, "trainingsorte,verifiziert,created_at,verfuegbarkeit");
});
