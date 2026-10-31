// /Users/js/Projekte/Vexfit/app/vexfit/registrierung_sichtbarkeit_test.ts
//
// Baustein "Warum erscheinen neue Trainer-Registrierungen nicht im Admin?".
//
// Befund: Die Ursache liegt NICHT im Repo-Code, sondern in der Supabase-Auth-
// Einstellung (E-Mail-Bestaetigung) bzw. der Mailzustellung nach dem Umzug der
// Domain auf Google Workspace. Grund (im Repo belegbar):
//   * registrieren.html legt die Trainer-Zeile nur an, wenn der Signup eine
//     Sitzung zurueckgibt (Authorization: Bearer <access_token>). Ohne Sitzung
//     laeuft der INSERT als Rolle "anon" — und anon hat auf trainers KEIN
//     Spalten-INSERT-Recht fuer vorname/nachname/email/... (nur trainingsort und
//     land). Der INSERT wird also abgelehnt, es entsteht keine Zeile.
//   * admin.html laedt dagegen schon heute ALLE Trainer (select=*, kein
//     aktiv-Filter) und zeigt inaktive Zeilen eigens an. Sobald eine Zeile
//     existiert und lesbar ist, erscheint sie also im Admin.
//
// Dieser Test aendert kein Verhalten; er sichert die beiden Repo-Invarianten,
// damit neue Registrierungen im Admin auftauchen, sobald die externe Ursache
// (Auth/Mail) behoben ist. Statisch gelesen, wie preismodell_test.ts
// (Playwright ist in diesem Projekt nicht installiert).
//
// Aufruf:  deno test --allow-read registrierung_sichtbarkeit_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Die Zeile, mit der admin.html die Trainerliste laedt.
async function adminTrainerLadezeile(): Promise<string> {
  const html = await lies("./admin.html");
  const i = html.indexOf("/rest/v1/trainers?select=");
  assert(i >= 0, "admin.html laedt die Trainerliste nicht ueber /rest/v1/trainers");
  return html.slice(i, html.indexOf("`", i) + 1);
}

Deno.test("admin.html laedt Trainer OHNE aktiv-Filter — inaktive/unbestaetigte sind sichtbar", async () => {
  const zeile = await adminTrainerLadezeile();
  assertStringIncludes(zeile, "trainers?select=*");
  // Kein aktiv-Filter in der Ladeabfrage: sonst blieben frisch registrierte
  // (aktiv=false) Trainer unsichtbar — genau das soll nicht passieren.
  assert(
    !/aktiv=eq/i.test(zeile),
    "die Trainer-Ladeabfrage enthaelt einen aktiv-Filter und wuerde neue Registrierungen ausblenden",
  );
});

Deno.test("admin.html zeigt inaktive Trainer eigens an (Badge + Freigeben-Knopf + Neu-Liste)", async () => {
  const html = await lies("./admin.html");
  // Inaktive Zeile wird gerendert (Badge "Inaktiv" und Knopf "Profil freigeben").
  assertStringIncludes(html, "Inaktiv");
  assertStringIncludes(html, "Profil freigeben");
  // Es gibt eine eigene Auswahl der noch nicht freigeschalteten Trainer.
  assertStringIncludes(html, "filter(t => !t.aktiv)");
});

Deno.test("registrieren.html: ein Fehler beim Anlegen der Trainer-Zeile wird angezeigt, nicht verschluckt", async () => {
  const html = await lies("./registrieren.html");
  // Direkt nach dem INSERT in trainers steht die Fehlerbehandlung.
  const i = html.indexOf("/rest/v1/trainers");
  assert(i >= 0, "der Trainer-INSERT fehlt in registrieren.html");
  const danach = html.slice(i, i + 600);
  assertStringIncludes(danach, "if(!ir.ok)");
  assertStringIncludes(danach, "showError('t-error','Profil konnte nicht gespeichert werden");
});

Deno.test("registrieren.html: ohne Sitzung wird zur E-Mail-Bestaetigung aufgefordert, nicht still weitergeleitet", async () => {
  const html = await lies("./registrieren.html");
  // Nur mit access_token wird die Sitzung gespeichert und weitergeleitet …
  assertStringIncludes(html, "if(ad.access_token){");
  // … sonst ein klarer Hinweis (kein stilles Scheitern).
  assertStringIncludes(
    html,
    "Konto erstellt! Bitte bestätige deine E-Mail-Adresse, dann kannst du dich anmelden.",
  );
  // Und fehlt sogar die user_id (Bestaetigung aktiv), bricht die Registrierung
  // mit Hinweis ab, statt ein Profil ohne user_id anzulegen.
  assertStringIncludes(html, "if(!userId){");
  assertStringIncludes(html, "Bitte bestätige deine E-Mail-Adresse");
});
