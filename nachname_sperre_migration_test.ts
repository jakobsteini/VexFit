// /Users/js/Projekte/Vexfit/app/vexfit/nachname_sperre_migration_test.ts
//
// Dauerlauf 08.11.2026 – Baustein „Nachname-Sperre DB-Ebene".
// Sichert die STRUKTUR der Migration 2026-11-08-03 ab, damit sie nie wieder
// in die wirkungslose Form zurueckfaellt:
//   * Es gibt einen SICHTWEITEN REVOKE von anon auf trainers_oeffentlich.
//     (Ein reiner Spalten-REVOKE waere wirkungslos, solange das sichtweite
//      GRANT besteht – PostgreSQL-Semantik.)
//   * Falls ueberhaupt ein Spalten-REVOKE vorkommt, steht ein Tabellen-REVOKE
//     davor.
//   * In KEINEM GRANT an anon kommt die Spalte nachname vor.
//   * Die Ruecknahme stellt das sichtweite GRANT wieder her.
//
// Aufruf:  deno test --allow-read nachname_sperre_migration_test.ts
import { assert } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Entfernt Zeilen-Kommentare (-- …). Die Datei hat keine Blockkommentare und
// keine String-Literale mit "--", daher genuegt das zeilenweise.
function ohneKommentar(sql: string): string {
  return sql
    .split("\n")
    .map((z) => {
      const i = z.indexOf("--");
      return i >= 0 ? z.slice(0, i) : z;
    })
    .join("\n");
}

Deno.test("Migration 03: sichtweiter REVOKE auf trainers_oeffentlich fuer anon", async () => {
  const sql = ohneKommentar(await lies("./migrations/2026-11-08-03-anon-kein-nachname.sql"));
  // Tabellen-/sichtweiter REVOKE (SELECT direkt gefolgt von ON, keine Spaltenliste).
  assert(
    /REVOKE\s+SELECT\s+ON\s+public\.trainers_oeffentlich\s+FROM\s+anon/i.test(sql),
    "kein sichtweiter REVOKE SELECT ON trainers_oeffentlich FROM anon – ein Spalten-REVOKE allein wirkt nicht",
  );
});

Deno.test("Migration 03: kein reines Spalten-REVOKE ohne vorheriges Tabellen-REVOKE", async () => {
  const sql = ohneKommentar(await lies("./migrations/2026-11-08-03-anon-kein-nachname.sql"));
  const tabelleRevoke = sql.search(/REVOKE\s+SELECT\s+ON\s+public\.trainers_oeffentlich\s+FROM\s+anon/i);
  // Ein Spalten-REVOKE waere „REVOKE SELECT (spalte) ON … trainers_oeffentlich … FROM anon".
  const spalteRevoke = sql.search(/REVOKE\s+SELECT\s*\([^)]*\)\s+ON\s+public\.trainers_oeffentlich\s+FROM\s+anon/i);
  if (spalteRevoke >= 0) {
    assert(tabelleRevoke >= 0 && tabelleRevoke < spalteRevoke,
      "Spalten-REVOKE ohne vorheriges Tabellen-REVOKE (wirkungslos)");
  } else {
    assert(tabelleRevoke >= 0, "weder Tabellen- noch Spalten-REVOKE gefunden");
  }
});

Deno.test("Migration 03: nachname kommt in keinem GRANT an anon vor", async () => {
  const sql = ohneKommentar(await lies("./migrations/2026-11-08-03-anon-kein-nachname.sql"));
  // Im wirksamen SQL (ohne Kommentare) darf der Spaltenname nachname gar nicht
  // auftauchen – weder in der Allowlist noch in einem GRANT.
  assert(!/\bnachname\b/i.test(sql),
    "nachname taucht im wirksamen SQL auf (Allowlist/GRANT muss ohne nachname sein)");
  // Es gibt ueberhaupt ein Spalten-GRANT an anon (sonst saehe anon nichts).
  assert(/GRANT\s+SELECT\s*\([^)]*\)\s+ON\s+public\.trainers_oeffentlich\s+TO\s+anon/i.test(sql),
    "kein Spalten-GRANT an anon – Karten wuerden fuer anon leer bleiben");
});

Deno.test("Migration 03: Ruecknahme stellt das sichtweite GRANT wieder her", async () => {
  const r = ohneKommentar(await lies("./migrations/ruecknahmen/2026-11-08-03-anon-kein-nachname-ruecknahme.sql"));
  assert(/GRANT\s+SELECT\s+ON\s+public\.trainers_oeffentlich\s+TO\s+anon/i.test(r),
    "Ruecknahme vergibt kein sichtweites GRANT zurueck");
});
