// /Users/js/Projekte/Vexfit/app/vexfit/teil7_test.ts
//
// Teil 7 - Mails, Kontakt, Anmeldung, Kleinigkeiten. Pruefbare Teile ohne
// Browser: Firmenangabe (7.1), keine Zeile mit Leerzeichen am Ende (7.2),
// Kontaktadresse office@vexfit.app (7.3), gemeinsame Passwortregel (7.8),
// E-Mail klein + E-Mail-Bestaetigung robust (7.6/7.9), profil.html (7.4/7.5).
//
// Aufruf:  deno test --allow-read teil7_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { FIRMENANGABE, mailText } from "./supabase/functions/_shared/mailgeruest.ts";
import { ABSENDER, BETREIBER } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── 7.1 Firmenangabe aus dem Impressum (GISA fehlt dort -> nicht erfunden) ──
Deno.test("7.1 FIRMENANGABE kommt aus dem Impressum, kein Platzhalter mehr", () => {
  assertEquals(FIRMENANGABE, "Jakob Steinbacher, 5330 Fuschl am See, Österreich");
  assert(!FIRMENANGABE.includes("FIRMENANGABE_FEHLT"));
});

// ── 7.2 Keine Zeile endet auf einem Leerzeichen (=20-Ursache) ───────────────
Deno.test("7.2 mailText erzeugt keine Zeile mit Leerzeichen am Ende", () => {
  const txt = mailText({
    ueberschrift: "Titel",
    absatz: "Hallo",
    datenZeilen: [
      { beschriftung: "Ziel", wert: "" }, // leer -> faellt weg, kein "Ziel: "
      { beschriftung: "Nachricht", wert: "   " }, // nur Leerzeichen -> faellt weg
      { beschriftung: "Name", wert: "Mara" },
    ],
    grundZeile: "Grund",
  });
  for (const zeile of txt.split("\n")) {
    assert(!/[ \t]$/.test(zeile), `Zeile endet auf Leerzeichen: ${JSON.stringify(zeile)}`);
  }
  // Leere Werte erzeugen keine "Label: "-Zeile.
  assert(!txt.includes("Ziel:"), "leere Zeile darf nicht erscheinen");
  assertStringIncludes(txt, "Name: Mara");
});

// ── 7.3 Kontaktadresse office@vexfit.app, interne Mails bleiben vexfit.info ──
Deno.test("7.3 sichtbare Kontaktadresse ist office@vexfit.app", async () => {
  const index = await lies("./index.html");
  assertStringIncludes(index, "mailto:office@vexfit.app");
  assert(!index.includes("vexfit.info@gmail.com"), "index.html darf vexfit.info nicht mehr sichtbar fuehren");
  const recht = await lies("./rechtliches.html");
  assertStringIncludes(recht, "office@vexfit.app");
  assert(!recht.includes("vexfit.info@gmail.com"), "rechtliches.html darf vexfit.info nicht mehr fuehren");
  // Interne Benachrichtigungen an Jakob bleiben unveraendert.
  assertEquals(ABSENDER, "vexfit.info@gmail.com");
  assertEquals(BETREIBER, "vexfit.info@gmail.com");
});

// ── 7.8 Gemeinsame Passwortregel ────────────────────────────────────────────
Deno.test("7.8 vexfit-passwort.js: gemeinsame Regel, in beiden Seiten eingebunden", async () => {
  const src = await lies("./vexfit-passwort.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", src)(g, g, undefined);
  // deno-lint-ignore no-explicit-any
  const vp = g.vexPasswort as any;
  assertEquals(vp.stufe("abc"), "rot"); // zu kurz
  assertEquals(vp.stufe("abcd1234"), "gelb"); // 8 Zeichen, 2 Arten (Buchstaben+Ziffern)
  assertEquals(vp.stufe("abcd1234EF!@"), "gruen"); // 12 Zeichen, 3 Arten (Buchstaben+Ziffern+Sonderzeichen)
  const reg = await lies("./registrieren.html");
  assertStringIncludes(reg, 'src="vexfit-passwort.js"');
  const neu = await lies("./passwort-neu.html");
  assertStringIncludes(neu, 'src="vexfit-passwort.js"');
});

// ── 7.6 / 7.9 registrieren: E-Mail klein + robuste user_id ──────────────────
Deno.test("7.6/7.9 registrieren: E-Mail klein, user_id robust, Bestaetigungshinweis", async () => {
  const reg = await lies("./registrieren.html");
  // E-Mail wird kleingeschrieben gespeichert.
  assert(
    (reg.match(/getElementById\('[tc]-email'\)\.value\.trim\(\)\.toLowerCase\(\)/g) || []).length >= 2,
    "beide Registrierungen muessen die E-Mail kleinschreiben",
  );
  // user_id robust lesen und Bestaetigungshinweis statt Profil ohne user_id.
  assertStringIncludes(reg, "ad.user?.id || ad.id");
  assertStringIncludes(reg, "Bitte bestätige deine E-Mail-Adresse");
});

// ── 7.6 E-Mail-Abfragen ohne Gross-/Kleinschreibung (ilike) ─────────────────
Deno.test("7.6 Abfragen nutzen email=ilike statt email=eq", async () => {
  for (const seite of ["login.html", "trainer-bereich.html", "profil-bearbeiten.html"]) {
    const html = await lies("./" + seite);
    assert(!html.includes("email=eq."), `${seite} hat noch email=eq.`);
    assertStringIncludes(html, "email=ilike.");
  }
  // "Profil gespeichert!" nur bei echter Aenderung (return=representation + Pruefung).
  for (const seite of ["trainer-bereich.html", "profil-bearbeiten.html"]) {
    const html = await lies("./" + seite);
    assertStringIncludes(html, "Es wurde nichts geändert.");
  }
});

// ── 7.4 / 7.5 profil.html: oeffentlich, Anmelden-zum-Anfragen, Konto-E-Mail ──
Deno.test("7.4/7.5 profil.html: oeffentlich + Anmelde-Knopf + Speichern vor Mail", async () => {
  const html = await lies("./profil.html");
  // Kein Zwangs-Redirect Nicht-Angemeldeter mehr.
  assert(
    !html.includes("location.replace('registrieren.html?typ=kunde')"),
    "alte Zwangs-Umleitung ist noch da",
  );
  // Anmelde-Knopf statt Formular fuer anon, mit Ruecksprung-Ziel.
  assertStringIncludes(html, "Anmelden, um anzufragen");
  assertStringIncludes(html, "vexfit_ziel");
  // Doppelklick-Schutz und Konto-E-Mail (kein freies Feld).
  assertStringIncludes(html, "anfrageLaeuft");
  assert(!html.includes('id="c-email"'), "freies E-Mail-Feld sollte entfernt sein");
});
