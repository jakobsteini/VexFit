// /Users/js/Projekte/Vexfit/app/vexfit/registrierung_kurz_test.ts
//
// Zusatzauftrag Teil R: kurzes Erstformular, Mail sofort, keine Reibung.
// Statische Prüfungen (Playwright ist in diesem Projekt nicht installiert; die
// End-to-End-Fassung liegt als Spec in e2e/registrierung-kurz.spec.ts bereit).
//
// Aufruf:  deno test --allow-read registrierung_kurz_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Trainer-Erstformular: genau Vorname, Nachname, E-Mail, Passwort (ein Feld), AGB", async () => {
  const html = await lies("./registrieren.html");
  for (const id of ['id="t-fn"', 'id="t-ln"', 'id="t-email"', 'id="t-pw"', 'id="t-agb"']) assertStringIncludes(html, id);
  // Weg: Passwort wiederholen, PLZ, "Wo trainierst du?".
  assert(!html.includes('id="t-pw2"'), "Passwort-wiederholen noch vorhanden");
  assert(!html.includes('id="t-plz"'), "PLZ noch im Erstformular");
  assert(!html.includes('id="t-ort"'), '"Wo trainierst du?" noch im Erstformular');
  // "Passwort zeigen"-Umschalter.
  assertStringIncludes(html, "pwZeigen('t')");
  assertStringIncludes(html, "function pwZeigen(");
});

Deno.test("Kunden-Erstformular: nur die nötigsten Felder (kein PLZ/Ziel)", async () => {
  const html = await lies("./registrieren.html");
  for (const id of ['id="c-fn"', 'id="c-ln"', 'id="c-email"', 'id="c-pw"', 'id="c-agb"']) assertStringIncludes(html, id);
  assert(!html.includes('id="c-pw2"'), "Kunde: Passwort-wiederholen noch vorhanden");
  assert(!html.includes('id="c-plz"'), "Kunde: PLZ noch im Erstformular");
  assert(!html.includes('id="c-ziel"'), "Kunde: Ziel noch im Erstformular");
});

Deno.test("Meldung sofort: neuer-trainer/neuer-kunde werden direkt nach dem Erstformular gerufen, mit utm_campaign", async () => {
  const html = await lies("./registrieren.html");
  assertStringIncludes(html, "vexfit-automation/neuer-trainer");
  assertStringIncludes(html, "vexfit-automation/neuer-kunde");
  assertStringIncludes(html, "utm_campaign: utm");
  // B1 (05.11.): UTM werden nicht mehr erst beim Abschicken aus location.search
  // gelesen (fragil im In-App-Browser), sondern einmal beim Laden robust in
  // VEXFIT_WERBUNG erfasst und von dort weitergereicht.
  assertStringIncludes(html, "const VEXFIT_WERBUNG=(function(){");
  assertStringIncludes(html, "utm_campaign: utm");
});

Deno.test("kern.ts: neuer-Trainer-Mail nennt Herkunft und Registrierzeit (Teil M)", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  const mail = kern.slice(kern.indexOf("function mailNeuerTrainer"), kern.indexOf("function mailNeuerKunde"));
  assertStringIncludes(mail, '"Herkunft"');
  assertStringIncludes(mail, '"Registriert"');
});

Deno.test("Kein gelber In-App-Balken mehr; kein WhatsApp-Knopf auf registrieren/login", async () => {
  const reg = await lies("./registrieren.html");
  assert(!reg.includes("Im Browser öffnen"), "gelber In-App-Balken noch vorhanden");
  assert(!reg.includes('id="iabBanner"'), "In-App-Balken-Element noch vorhanden");
  assert(!/class="wa-btn"/.test(reg), "WhatsApp-Knopf noch auf registrieren.html");
  const login = await lies("./login.html");
  assert(!/class="wa-btn"/.test(login), "WhatsApp-Knopf noch auf login.html");
});

Deno.test("trainer-bereich: kein Text behauptet Foto/Kurztext/Spezialisierung als Suche-Bedingung", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(!html.includes("erscheint noch nicht in der Suche"), "irreführender Suche-Text noch vorhanden");
  assert(!html.includes("Dafür brauchst du mindestens Foto, Spezialisierung und Kurztext"), "alte Bedingung noch vorhanden");
  // Echte Regel: Freigabe/Prüfung + mehr Anfragen bei vollständigem Profil.
  assertStringIncludes(html, "wird von uns geprüft und freigeschaltet");
  assertStringIncludes(html, "bekommt mehr Anfragen");
});
