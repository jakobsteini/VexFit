// /Users/js/Projekte/Vexfit/app/vexfit/teil1_test.ts
//
// Teil 1 - Zugriffsschutz und XSS. Prueft ohne Netz/Browser:
//  - die gemeinsame Escape-Funktion vexEsc (XSS-Nutzlast wird Text, kein Tag)
//  - dass die sechs betroffenen Seiten vexfit-escape.js einbinden und vexEsc nutzen
//  - dass migrations/2026-10-26-01-zugriffsschutz.sql kein tabellenweites UPDATE
//    auf trainers, kein UPDATE auf weitergeleitet und kein tabellenweites SELECT
//    auf anfragen fuer authenticated enthaelt.
//
// Aufruf:  deno test --allow-read teil1_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// vexEsc aus der echten Quelldatei laden (IIFE ausfuehren, vexEsc abgreifen).
async function ladeVexEsc(): Promise<(w: unknown) => string> {
  const src = await lies("./vexfit-escape.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", src)(g, g, undefined);
  const fn = g.vexEsc as (w: unknown) => string;
  assert(typeof fn === "function", "vexEsc wurde nicht definiert");
  return fn;
}

const SEITEN = [
  "admin.html",
  "trainer-bereich.html",
  "kunden-bereich.html",
  "profil.html",
  "suche.html",
  "profil-bearbeiten.html",
];

// ── vexEsc: XSS-Nutzlast wird zu Text ───────────────────────────────────────
Deno.test("vexEsc macht aus <img onerror> harmlosen Text", async () => {
  const vexEsc = await ladeVexEsc();
  const roh = "<img src=x onerror=window.__xss=1>";
  const aus = vexEsc(roh);
  // Kein oeffnendes/schliessendes Tag mehr -> der Browser kann kein Element
  // bauen, window.__xss kann nicht gesetzt werden.
  assert(!aus.includes("<"), "< muss ersetzt sein");
  assert(!aus.includes(">"), "> muss ersetzt sein");
  assert(!aus.includes("<img"), "kein rohes <img");
  assertEquals(aus, "&lt;img src=x onerror=window.__xss=1&gt;");
  // Anfuehrungszeichen (Attribut-Ausbruch) werden ebenfalls ersetzt.
  assert(vexEsc('a"b').includes("&quot;"), '" muss ersetzt sein');
  assert(vexEsc("a'b").includes("&#39;"), "' muss ersetzt sein");
  // & zuerst, kein Doppel-Escape der folgenden Ersetzungen.
  assertEquals(vexEsc("a & b"), "a &amp; b");
  // null/undefined -> leerer String.
  assertEquals(vexEsc(null), "");
  assertEquals(vexEsc(undefined), "");
});

// ── Jede betroffene Seite bindet die Funktion ein und nutzt sie ──────────────
Deno.test("alle sechs Seiten binden vexfit-escape.js ein und nutzen vexEsc", async () => {
  for (const seite of SEITEN) {
    const html = await lies("./" + seite);
    assert(
      html.includes('src="vexfit-escape.js"'),
      `${seite} bindet vexfit-escape.js nicht ein`,
    );
    assert(html.includes("vexEsc("), `${seite} nutzt vexEsc nicht`);
  }
});

// ── Migration 01: keine gefaehrlichen tabellenweiten Rechte ──────────────────
Deno.test("Migration 01 entzieht die gefaehrlichen Rechte", async () => {
  const roh = await lies("./migrations/2026-10-26-01-zugriffsschutz.sql");
  // Kommentare (-- bis Zeilenende) entfernen, damit nur echte Anweisungen
  // geprueft werden - der Kopf der Datei zitiert die alten GRANTs.
  const ohneKommentar = roh
    .split("\n")
    .map((z) => z.replace(/--.*$/, ""))
    .join("\n");
  const sql = ohneKommentar.replace(/\s+/g, " ");

  // Kein tabellenweites UPDATE auf trainers fuer authenticated (ohne Spaltenliste).
  assert(
    !sql.includes("GRANT UPDATE ON public.trainers TO authenticated"),
    "tabellenweites UPDATE auf trainers darf nicht vergeben werden",
  );
  assert(
    sql.includes("REVOKE UPDATE ON public.trainers FROM authenticated"),
    "tabellenweites UPDATE auf trainers muss entzogen werden",
  );

  // Kein UPDATE auf weitergeleitet (weder allein noch zusammen mit status).
  assert(
    !sql.includes("GRANT UPDATE (status, weitergeleitet)"),
    "UPDATE (status, weitergeleitet) darf nicht vergeben werden",
  );
  assert(
    !sql.includes("GRANT UPDATE (weitergeleitet)"),
    "UPDATE (weitergeleitet) darf nicht vergeben werden",
  );
  assert(
    sql.includes("GRANT UPDATE (status) ON public.anfragen TO authenticated"),
    "UPDATE (status) soll erhalten bleiben",
  );

  // Kein tabellenweites SELECT auf anfragen; spaltenweise ohne kunden_email.
  assert(
    !sql.includes("GRANT SELECT ON public.anfragen TO authenticated"),
    "tabellenweites SELECT auf anfragen darf nicht vergeben werden",
  );
  assert(
    sql.includes("REVOKE SELECT ON public.anfragen FROM authenticated"),
    "tabellenweites SELECT auf anfragen muss entzogen werden",
  );
  // Die spaltenweise SELECT-Freigabe darf kunden_email NICHT enthalten.
  const m = sql.match(/GRANT SELECT \(([^)]*)\) ON public\.anfragen/);
  assert(m, "spaltenweise SELECT-Freigabe auf anfragen fehlt");
  assert(
    !m![1].includes("kunden_email"),
    "kunden_email darf nicht spaltenweise freigegeben sein",
  );
});
