// /Users/js/Projekte/Vexfit/app/vexfit/vertrauen_test.ts
//
// Baustein 4 (Vertrauen und mehr Anfragen, 31.10.2026). Migration und Seiten
// ohne Browser/DB. Die Edge-Function-Logik (Admin-Verifizierung, Alternativen)
// hat eigene Pruefungen in kern_test.ts.
//
// Aufruf:  deno test --allow-read vertrauen_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Migration 04: verifiziert nur service_role, Trigger + RPC fuer Antwortzeit", async () => {
  const sql = await lies("./migrations/2026-10-31-04-vertrauen.sql");
  assertStringIncludes(sql, "ADD COLUMN verifiziert");
  // Trainer darf nur Probetraining der eigenen Zeile setzen - NICHT verifiziert.
  assertStringIncludes(sql, "GRANT UPDATE (probetraining, probetraining_kostenlos)");
  const grantZeilen = sql.split("\n").filter((z) => z.toLowerCase().includes("grant update"));
  for (const z of grantZeilen) {
    assert(!z.includes("verifiziert"), "verifiziert wird per GRANT UPDATE vergeben: " + z);
  }
  // Antwortzeit: Trigger setzt beantwortet_am, RPC rechnet aus echten Daten.
  assertStringIncludes(sql, "CREATE TRIGGER anfrage_beantwortet_stempeln_trg");
  assertStringIncludes(sql, "FUNCTION public.antwortzeit_aktualisieren()");
  assertStringIncludes(sql, "GRANT EXECUTE ON FUNCTION public.antwortzeit_aktualisieren() TO authenticated");
  // Sicht gibt die Vertrauensfelder + created_at (fuer "Neu") aus.
  const sicht = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW"));
  assertStringIncludes(sicht, "verifiziert, probetraining, probetraining_kostenlos");
  assertStringIncludes(sicht, "antwort_stunden, antwort_basis, created_at");
});

Deno.test("Ruecknahme 04 entfernt Spalten, Trigger und Funktionen", async () => {
  const sql = await lies("./migrations/2026-10-31-04-vertrauen-ruecknahme.sql");
  assertStringIncludes(sql, "DROP TRIGGER IF EXISTS anfrage_beantwortet_stempeln_trg");
  assertStringIncludes(sql, "DROP FUNCTION IF EXISTS public.antwortzeit_aktualisieren()");
  assertStringIncludes(sql, "DROP COLUMN IF EXISTS verifiziert");
});

Deno.test("profil.html: Abzeichen (verifiziert/neu/antwortzeit) und Probetraining-Knopf", async () => {
  const html = await lies("./profil.html");
  assertStringIncludes(html, "t.verifiziert === true");
  assertStringIncludes(html, "Neu auf Vexfit");
  assertStringIncludes(html, "t.antwort_basis >= 3 && t.antwort_stunden");
  assertStringIncludes(html, "function probetrainingAnfragen()");
  // Lade-Spalten enthalten die Vertrauensfelder.
  assertStringIncludes(html, "verifiziert,probetraining,probetraining_kostenlos,antwort_stunden,antwort_basis");
});

Deno.test("profil-bearbeiten.html: Probetraining-Umschalter wird gespeichert", async () => {
  const html = await lies("./profil-bearbeiten.html");
  assertStringIncludes(html, "function toggleProbe()");
  assertStringIncludes(html, "body.probetraining = probetraining");
  assertStringIncludes(html, "body.probetraining_kostenlos = probetraining && probetrainingKostenlos");
});

Deno.test("trainer-bereich.html: Antwortzeit-RPC und Passt-nicht bei Absage", async () => {
  const html = await lies("./trainer-bereich.html");
  assertStringIncludes(html, "rpc/antwortzeit_aktualisieren");
  // Alternativen nur bei einer Absage.
  assertStringIncludes(html, "if(neuerStatus === 'abgelehnt')");
  assertStringIncludes(html, "vexfit-automation/passt-nicht");
});

Deno.test("suche.html: Kartenabzeichen richtet sich nach echter Verifizierung", async () => {
  const html = await lies("./suche.html");
  assertStringIncludes(html, "function kartenAbzeichen(t, isOnline)");
  assertStringIncludes(html, "t.verifiziert === true");
  // Das alte, pauschale "Verifiziert ✓" fuer jede Karte ist weg.
  assert(!html.includes("? 'Online' : 'Verifiziert ✓'"), "pauschales Verifiziert-Abzeichen noch da");
});
