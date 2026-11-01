// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/gp01_abwaertskompatibel_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 1: Abwärtskompatibilität. Alles, was auf
// Migration 2026-10-31-09 (Spalte gesperrt, Tabelle admin_protokoll) angewiesen
// ist, muss auch OHNE eingespielte Migration sauber reagieren – kein Absturz
// (HTTP 500), sondern ein verständlicher Hinweis „Migration fehlt" (HTTP 400).
//
// Gemockt: PostgREST antwortet wie ohne Migration mit 42703/42P01.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import { ADMIN_ID, type Anschluesse, bearbeiten, ERLAUBTE_HERKUNFT, istMigrationFehlt } from "./kern.ts";

// Fehler, wie PostgREST ihn ohne die Spalte gesperrt liefert.
const SPALTE_FEHLT = () =>
  new Error('personGesperrtSetzen fehlgeschlagen: HTTP 400 {"code":"42703","message":"column \\"gesperrt\\" does not exist"}');
const TABELLE_FEHLT = () =>
  new Error('Loeschen fehlgeschlagen: HTTP 404 {"code":"42P01","message":"relation \\"public.admin_protokoll\\" does not exist"}');

function unbenutzt(name: string) {
  return () => {
    throw new Error(`${name} nicht erwartet`);
  };
}

// Anschlüsse ohne eingespielte Migration: personGesperrtSetzen bzw.
// zeileLoeschenOderAnonymisieren werfen den „Spalte/Tabelle fehlt"-Fehler.
function ohneMigration(opt: { wirftBeimLoeschen?: boolean } = {}): Anschluesse {
  return {
    benutzerAusToken: () => Promise.resolve({ id: ADMIN_ID, email: "admin@vexfit.app" }),
    personUserId: () => Promise.resolve(null),
    authSperren: () => Promise.resolve(),
    authNutzerLoeschen: () => Promise.resolve(),
    personGesperrtSetzen: () => Promise.reject(SPALTE_FEHLT()),
    zeileLoeschenOderAnonymisieren: () =>
      opt.wirftBeimLoeschen ? Promise.reject(TABELLE_FEHLT()) : Promise.resolve({ geloescht: true, anonymisiert: false }),
    protokoll: () => Promise.resolve(),
    melden: () => {},
    trainerNachId: unbenutzt("trainerNachId"),
    trainerNachEmail: unbenutzt("trainerNachEmail"),
    aeltesteOffeneAnfrage: unbenutzt("aeltesteOffeneAnfrage"),
    trainerBezahltMarkieren: unbenutzt("trainerBezahltMarkieren"),
    anfrageWeitergeleitetMarkieren: unbenutzt("anfrageWeitergeleitetMarkieren"),
    mailSenden: unbenutzt("mailSenden"),
    stripeEreignis: unbenutzt("stripeEreignis"),
    ereignisSchonVerarbeitet: unbenutzt("ereignisSchonVerarbeitet"),
    ereignisVermerken: unbenutzt("ereignisVermerken"),
    anfragenAnzahlSeit: unbenutzt("anfragenAnzahlSeit"),
    spamProEmailSeit: unbenutzt("spamProEmailSeit"),
    spamProIpSeit: unbenutzt("spamProIpSeit"),
    spamEintragVormerken: unbenutzt("spamEintragVormerken"),
    adminTrainerSetzen: unbenutzt("adminTrainerSetzen"),
    adminZeileLoeschen: unbenutzt("adminZeileLoeschen"),
  } as unknown as Anschluesse;
}

function req(payload: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/admin-aktion",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" },
      body: JSON.stringify(payload),
    },
  );
}

Deno.test("istMigrationFehlt erkennt 42703/42P01/does not exist/gesperrt/admin_protokoll", () => {
  assert(istMigrationFehlt(SPALTE_FEHLT()));
  assert(istMigrationFehlt(TABELLE_FEHLT()));
  assert(istMigrationFehlt('{"code":"42703"}'));
  assert(istMigrationFehlt("column gesperrt does not exist"));
  assert(!istMigrationFehlt(new Error("HTTP 500 irgendein anderer Fehler")));
  assert(!istMigrationFehlt(null));
});

Deno.test("Sperren ohne Migration → 400 mit Migrations-Hinweis (kein Absturz)", async () => {
  const res = await bearbeiten(req({ aktion: "login_sperren", art: "trainer", ziel_id: "t-1" }), ohneMigration());
  const d = await res.json();
  assertEquals(res.status, 400);
  assertStringIncludes(d.fehler, "Migration 2026-10-31-09");
});

Deno.test("Löschen ohne Protokoll-/Sperr-Tabelle → 400 mit Migrations-Hinweis", async () => {
  const res = await bearbeiten(
    req({ aktion: "endgueltig_loeschen", art: "kunde", ziel_id: "k-1", bestaetigt: true }),
    ohneMigration({ wirftBeimLoeschen: true }),
  );
  const d = await res.json();
  assertEquals(res.status, 400);
  assertStringIncludes(d.fehler, "Migration 2026-10-31-09");
});

Deno.test("Ein anderer Fehler (nicht Migration) wird NICHT als Migration gemeldet", async () => {
  const a = ohneMigration();
  (a as unknown as { personGesperrtSetzen: () => Promise<number> }).personGesperrtSetzen = () =>
    Promise.reject(new Error("HTTP 500 Datenbank nicht erreichbar"));
  // Kein Migrations-Hinweis: der unerwartete Fehler wird durchgereicht (Deno.serve
  // beantwortet ihn mit 500; der Prozess läuft weiter). Er wird NICHT fälschlich
  // als „Migration fehlt" (400) gemeldet.
  await assertRejects(
    () => bearbeiten(req({ aktion: "login_sperren", art: "trainer", ziel_id: "t-1" }), a),
    Error,
    "Datenbank nicht erreichbar",
  );
});
