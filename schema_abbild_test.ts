// /Users/js/Projekte/Vexfit/app/vexfit/schema_abbild_test.ts
//
// Schema-Abbild-Wächter (Dauerlauf 2026-11-03, Korrektur der Warteliste).
//
// Hintergrund: Migration 2026-11-03-02 scheiterte live mit
//   „ERROR 42P01: relation public.trainer_alerts does not exist",
// weil sie eine Tabelle veränderte, die nie durch eine Migration angelegt wurde.
//
// Dieser Test bildet das ECHTE Schema der Live-Datenbank nach (Liste von Jakob
// am 03.11., Schema public) und prüft, dass die Migrationen 02–04 und der
// betroffene Code NUR auf Tabellen aufbauen, die entweder live existieren ODER
// in derselben Migration angelegt werden. Eine fehlende Tabelle = rot.
//
// Aufruf:  deno test --allow-read schema_abbild_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── Das echte Live-Schema (public), 03.11.2026, 17 Objekte. ──
// anfragen_sichtbar und trainers_oeffentlich sind Sichten; für den Wächter ist
// nur wichtig, dass ihr Name live auflösbar ist.
const LIVE_TABELLEN = new Set([
  "admin_protokoll",
  "anfragen",
  "anfragen_sichtbar",
  "bewertungen",
  "favoriten",
  "kunden",
  "nachrichten",
  "profilaufrufe",
  "push_abos",
  "spam_schutz",
  "stripe_events_verarbeitet",
  "studio_standorte",
  "studios",
  "such_eingaben",
  "trainers",
  "trainers_oeffentlich",
  "warteliste",
]);

const MIGRATIONEN = [
  "./migrations/2026-11-03-02-warteliste-mail.sql",
  "./migrations/2026-11-03-03-abo-abrechnung.sql",
  "./migrations/2026-11-03-04-abendbericht.sql",
];

// Entfernt Zeilenkommentare (-- …), damit Tabellennamen im Fließtext nicht
// fälschlich als Abhängigkeit zählen.
function ohneKommentare(sql: string): string {
  return sql.split("\n").map((z) => z.replace(/--.*$/, "")).join("\n");
}

function treffer(sql: string, re: RegExp): Set<string> {
  const s = new Set<string>();
  for (const m of sql.matchAll(re)) s.add(m[1].toLowerCase());
  return s;
}

// Tabellen, die eine Migration ANLEGT.
function angelegt(sql: string): Set<string> {
  return treffer(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi);
}

// public.<tabelle>, auf die eine Migration schreibend/indizierend zugreift.
function abhaengig(sql: string): Set<string> {
  const s = new Set<string>();
  for (
    const re of [
      /alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi,
      /\bon\s+public\.(\w+)/gi, // CREATE INDEX … ON / GRANT … ON / DROP POLICY … ON
      /\bupdate\s+public\.(\w+)/gi,
      /\binsert\s+into\s+public\.(\w+)/gi,
      /\bdelete\s+from\s+public\.(\w+)/gi,
    ]
  ) {
    for (const t of treffer(sql, re)) s.add(t);
  }
  return s;
}

Deno.test("Migrationen 02–04: jede berührte public-Tabelle ist live vorhanden oder wird in derselben Datei angelegt", async () => {
  for (const pfad of MIGRATIONEN) {
    const roh = ohneKommentare(await lies(pfad));
    const neu = angelegt(roh);
    const erlaubt = new Set<string>([...LIVE_TABELLEN, ...neu]);
    for (const t of abhaengig(roh)) {
      assert(
        erlaubt.has(t),
        `${pfad}: baut auf public.${t} auf, aber die Tabelle existiert live nicht ` +
          `und wird in dieser Migration nicht angelegt (fehlende Migration/Tabelle).`,
      );
    }
  }
});

Deno.test("Migration 02 legt die fehlende Tabelle trainer_alerts selbst an", async () => {
  const sql = ohneKommentare(await lies(MIGRATIONEN[0]));
  assert(
    angelegt(sql).has("trainer_alerts"),
    "Migration 02 muss public.trainer_alerts anlegen (sie fehlt live).",
  );
});

Deno.test("Betroffener Code: jede /rest/v1-Tabelle der Kundenseite ist live vorhanden oder frisch angelegt", async () => {
  // Alles, was eine Migration vom 03.11. anlegt.
  let angelegtNov03 = new Set<string>();
  for (const pfad of MIGRATIONEN) {
    angelegtNov03 = new Set([...angelegtNov03, ...angelegt(ohneKommentare(await lies(pfad)))]);
  }
  const erlaubt = new Set<string>([...LIVE_TABELLEN, ...angelegtNov03]);

  const html = await lies("./kunden-bereich.html");
  const tabellen = treffer(html, /\/rest\/v1\/(\w+)/g);
  assert(tabellen.has("trainer_alerts"), "Testannahme: Kundenseite nutzt trainer_alerts.");
  for (const t of tabellen) {
    assert(
      erlaubt.has(t),
      `kunden-bereich.html greift auf /rest/v1/${t} zu, aber die Tabelle existiert ` +
        `live nicht und wird von keiner Migration angelegt.`,
    );
  }
});

Deno.test("Migrationen 02 und 04 sind mehrfach ausführbar (idempotent)", async () => {
  const m02 = await lies(MIGRATIONEN[0]);
  assertStringIncludes(m02, "CREATE TABLE IF NOT EXISTS public.trainer_alerts");
  assertStringIncludes(m02, "DROP POLICY IF EXISTS");
  const m04 = await lies(MIGRATIONEN[2]);
  // Alte Jobs vor dem Anlegen abräumen.
  assertStringIncludes(m04, "cron.unschedule");
});
