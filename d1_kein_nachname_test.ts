// /Users/js/Projekte/Vexfit/app/vexfit/d1_kein_nachname_test.ts
//
// Dauerlauf 08.11.2026 – D1: kein voller Nachname oeffentlich.
// Geprueft (ohne Netz, reine Datei-/Funktionspruefung):
//   * profil.html laedt fuer Nichtangemeldete aus trainers_vorschau (Rueckfall
//     trainers_oeffentlich OHNE nachname); der anon-Profil-Ladeweg fragt kein
//     Feld "nachname" an.
//   * profilAnzeigeName() baut fuer Nichtangemeldete „Vorname N." aus
//     nachname_initial, nicht aus dem vollen Nachnamen.
//   * suche.html: OEFFENTLICHE_SPALTEN (toter Pfad bei Vorschau AUS) enthaelt
//     kein "nachname"; die Freitextsuche trifft Nachnamen nur fuer Angemeldete.
//   * Migration 2026-11-08-03 entzieht anon den Lesezugriff auf nachname, mit
//     Ruecknahme.
//
// Aufruf:  deno test --allow-read d1_kein_nachname_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("D1: profil.html laedt nicht angemeldet aus trainers_vorschau, ohne Nachnamen", async () => {
  const p = await lies("./profil.html");
  // Der anon-Zweig ruft ladeProfilVorschau statt trainers_oeffentlich-mit-nachname.
  assertStringIncludes(p, ": await ladeProfilVorschau(id);");
  assertStringIncludes(p, "async function ladeProfilVorschau(");
  assertStringIncludes(p, "trainers_vorschau?id=eq.");
  // Rueckfall trainers_oeffentlich ohne nachname (Sicht fehlt).
  assertStringIncludes(p, "res.status === 404 || res.status === 400");
  // Keine der beiden Vorschau-Spaltenlisten fragt nachname an.
  const vs = p.match(/const VS = '([^']+)'/);
  assert(vs, "VS-Spalten nicht gefunden");
  assert(!vs![1].split(",").includes("nachname"), "anon-Profil fragt vollen Nachnamen an");
  assert(vs![1].split(",").includes("nachname_initial"), "anon-Profil sollte nachname_initial laden");
  const fb = p.match(/const FB = '([^']+)'/);
  assert(fb, "FB-Spalten nicht gefunden");
  assert(!fb![1].split(",").includes("nachname"), "Profil-Rueckfall fragt vollen Nachnamen an");
});

Deno.test("D1: profilAnzeigeName baut 'Vorname N.' aus nachname_initial", async () => {
  const p = await lies("./profil.html");
  assertStringIncludes(p, "function profilAnzeigeName(t) {");
  assertStringIncludes(p, "t.nachname_initial");
  // SEO und Anzeige nutzen den Helfer (kein roher voller Nachname mehr).
  assertStringIncludes(p, "const name = profilAnzeigeName(t);");
  assertStringIncludes(p, "const anzeigeName = profilAnzeigeName(t);");
  // Der alte, direkte Nachname-Aufbau ist verschwunden.
  assert(!p.includes("const name = (t.vorname + ' ' + t.nachname).trim();"), "alter SEO-Name mit vollem Nachnamen noch da");
});

Deno.test("D1: suche.html – oeffentlicher Pfad ohne Nachnamen, Freitextsuche nur fuer Angemeldete", async () => {
  const s = await lies("./suche.html");
  const m = s.match(/const OEFFENTLICHE_SPALTEN = '([^']+)'/);
  assert(m, "OEFFENTLICHE_SPALTEN nicht gefunden");
  assert(!m![1].split(",").includes("nachname"), "OEFFENTLICHE_SPALTEN enthaelt noch den vollen Nachnamen");
  // kein order=nachname mehr (die Sicht liefert anon kein nachname mehr).
  assert(!s.includes("order=nachname.asc"), "sortiert noch nach Nachnamen");
  // Freitextsuche: Nachname nur, wenn angemeldet.
  assert(!/\n\s*\(t\.nachname\|\|''\)\.toLowerCase\(\)\.includes\(q\)/.test(s), "Nachnamen-Suche ohne angemeldet-Schranke");
  assertStringIncludes(s, "(angemeldet && (t.nachname||'').toLowerCase().includes(q))");
});

Deno.test("D1: Migration 2026-11-08-03 entzieht anon den Nachnamen wirksam (mit Ruecknahme)", async () => {
  const mig = await lies("./migrations/2026-11-08-03-anon-kein-nachname.sql");
  // Wirksam nur mit SICHTWEITEM Entzug (ein Spalten-REVOKE allein wirkt nicht,
  // solange das sichtweite GRANT besteht).
  assertStringIncludes(mig, "REVOKE SELECT ON public.trainers_oeffentlich FROM anon");
  // Danach wieder ein Spalten-GRANT an anon (nur unbedenkliche Spalten).
  assertStringIncludes(mig, "GRANT SELECT (%s) ON public.trainers_oeffentlich TO anon");
  const r = await lies("./migrations/ruecknahmen/2026-11-08-03-anon-kein-nachname-ruecknahme.sql");
  assertStringIncludes(r, "GRANT SELECT ON public.trainers_oeffentlich TO anon");
});
