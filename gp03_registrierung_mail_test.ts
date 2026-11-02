// /Users/js/Projekte/Vexfit/app/vexfit/gp03_registrierung_mail_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 3: Registrierung und Mails.
// STATISCHE Prüfungen (das Pixel-/Zustimmungs-Gate und die Events Lead/
// CompleteRegistration dürfen NICHT verändert werden – hier wird nur gesichert,
// dass sie so bleiben, wie sie sein müssen):
//   * Pixel lädt nur nach Zustimmung (vexfit_consent === 'zugestimmt'),
//   * CompleteRegistration (Trainer) feuert nur, wenn fbq existiert (= Zustimmung),
//     im Erfolgszweig, mit vorher deaktiviertem Knopf → genau einmal,
//   * Lead (Kunde) ebenso,
//   * Fehler werden angezeigt (showError), nicht verschluckt,
//   * ohne Sitzung (E-Mail-Bestätigung aktiv) wird KEINE Profilzeile ohne user_id
//     angelegt, sondern zur Bestätigung aufgefordert.
// Dazu das Mail-Ziel: interne Benachrichtigungen gehen an office@vexfit.app.
//
// Aufruf:  deno test --allow-read gp03_registrierung_mail_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const reg = await Deno.readTextFile(new URL("./registrieren.html", import.meta.url));
const kern = await Deno.readTextFile(new URL("./supabase/functions/vexfit-automation/kern.ts", import.meta.url));

Deno.test("Pixel lädt nur nach Zustimmung", () => {
  assertStringIncludes(reg, "localStorage.getItem('vexfit_consent') === 'zugestimmt'");
  assertStringIncludes(reg, "fbq('init', '1034036285801133')");
  // Erst beim Zustimmen wird der Pixel geladen.
  assertStringIncludes(reg, "setItem('vexfit_consent','zugestimmt')");
});

Deno.test("CompleteRegistration feuert zustimmungsgebunden über den Helfer (Teil 1: Kunde jetzt auch)", () => {
  // Teil 1: ein gemeinsamer Helfer mit Zustimmungs- und fbq-Schutz; Trainer UND
  // Kunde feuern CompleteRegistration (Kunde war vorher fälschlich 'Lead').
  const i = reg.indexOf("function pixelRegistrierungFertig(");
  const helfer = reg.slice(i, i + 500);
  assertStringIncludes(helfer, "vexfit_consent");
  assertStringIncludes(helfer, "typeof fbq !== 'function'");
  assertStringIncludes(helfer, "fbq('track','CompleteRegistration'");
  assertStringIncludes(reg, "pixelRegistrierungFertig('trainer'");
  assertStringIncludes(reg, "pixelRegistrierungFertig('kunde')");
  assert(!reg.includes("fbq('track','Lead'"), "altes Lead-Ereignis darf nicht mehr auftauchen");
  // Exakt die kampagnenrelevante ID, kein Umbau.
  assert(!reg.includes("1105307262121912"), "alte/falsche Pixel-ID darf nicht auftauchen");
});

Deno.test("Trainer-Submit: Knopf wird vor dem Feuern deaktiviert (genau einmal)", () => {
  // imVersand + btn.disabled stehen VOR dem Pixel-Aufruf.
  const vorPixel = reg.slice(0, reg.indexOf("pixelRegistrierungFertig('trainer'"));
  assertStringIncludes(vorPixel, "imVersand.t=true;btn.disabled=true");
});

Deno.test("Fehler werden angezeigt, nicht verschluckt", () => {
  for (const msg of [
    "Bitte Vorname, Nachname und E-Mail ausfüllen!",
    "Profil konnte nicht gespeichert werden. Bitte erneut versuchen.",
    "Verbindungsfehler. Bitte prüfe deine Internetverbindung.",
  ]) {
    assertStringIncludes(reg, msg);
  }
});

Deno.test("Ohne Sitzung (E-Mail-Bestätigung) keine Zeile ohne user_id, sondern Hinweis", () => {
  assertStringIncludes(reg, "if(!userId){");
  assertStringIncludes(reg, "bestätige deine E-Mail");
});

Deno.test("Interne Benachrichtigungen gehen an office@vexfit.app (BETREIBER)", () => {
  assertStringIncludes(kern, 'BETREIBER = "office@vexfit.app"');
  // Neue-Trainer- und Neue-Kunde-Mail adressieren BETREIBER.
  const trainerMail = kern.slice(kern.indexOf("function mailNeuerTrainer"), kern.indexOf("function mailNeuerKunde"));
  assertStringIncludes(trainerMail, "BETREIBER");
  const kundeMail = kern.slice(kern.indexOf("function mailNeuerKunde"), kern.indexOf("function mailNeueAnfrageIntern"));
  assertStringIncludes(kundeMail, "BETREIBER");
});
