// /Users/js/Projekte/Vexfit/app/vexfit/warteliste_admin_test.ts
//
// Warteliste-Abfrage im Admin (Dauerlauf 2026-11-03): die Live-Tabelle
// public.warteliste hat erstellt_am (nicht created_at) und KEIN land. Die
// Karten-Abfrage las created_at+land -> 42703, der Bereich lud nicht. Dieser
// Test gleicht alle warteliste-Abfragen gegen die echten Spalten der Migration
// ab (fehlende Spalte = rot).
//
// Aufruf:  deno test --allow-read warteliste_admin_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Spaltennamen aus einer CREATE TABLE lesen.
function spalten(sql: string, tabelle: string): Set<string> {
  const m = sql.match(
    new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${tabelle}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, "i"),
  );
  const s = new Set<string>();
  if (!m) return s;
  for (const z of m[1].split("\n")) {
    const mm = z.match(/^\s*([a-z_]+)\s+(text|uuid|timestamptz|boolean|integer|jsonb|bigint|serial)/i);
    if (mm) s.add(mm[1].toLowerCase());
  }
  return s;
}

Deno.test("Admin-Warteliste-Abfragen nutzen nur existierende warteliste-Spalten", async () => {
  const cols = spalten(await lies("./migrations/2026-10-24-warteliste.sql"), "warteliste");
  // Grundannahmen zur echten Tabelle.
  assert(cols.has("erstellt_am") && cols.has("plz") && cols.has("stadt"), "Spaltenliste unerwartet");
  assert(!cols.has("created_at") && !cols.has("land"), "created_at/land gibt es live nicht");

  const js = await lies("./vexfit-verwaltung.js");
  let gefunden = 0;
  for (const m of js.matchAll(/warteliste\?([^"'`]*)/g)) {
    const q = m[1];
    const sel = (q.match(/select=([a-z_,]+)/) || [])[1];
    if (sel) {
      for (const c of sel.split(",")) {
        gefunden++;
        assert(cols.has(c) || c === "id", `warteliste.select nutzt nicht vorhandene Spalte: ${c}`);
      }
    }
    const ord = (q.match(/order=([a-z_]+)/) || [])[1];
    if (ord) assert(cols.has(ord), `warteliste.order nutzt nicht vorhandene Spalte: ${ord}`);
  }
  assert(gefunden > 0, "keine warteliste-select-Abfrage gefunden");
});

Deno.test("Warteliste-Karte rendert mit erstellt_am, nicht created_at/land", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "warteliste?select=plz,stadt,erstellt_am&order=erstellt_am.desc");
  assertStringIncludes(js, "innerhalbTage(w.erstellt_am, tage)");
  assert(!/warteliste\?[^"'`]*created_at/.test(js), "warteliste darf created_at nicht mehr nutzen");
  assert(!/warteliste\?[^"'`]*\bland\b/.test(js), "warteliste darf land nicht mehr nutzen");
});

Deno.test("Service-Worker-Cache v3 (neue Datei wird ausgeliefert)", async () => {
  assertStringIncludes(await lies("./sw-verwaltung.js"), "vexfit-admin-huelle-v3");
});
