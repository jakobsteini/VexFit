// /Users/js/Projekte/Vexfit/app/vexfit/datenschutz_ergaenzung_test.ts
//
// Baustein (15.11.2026): Datenschutzerklaerung um die vier im Nachtlauf
// (docs/pruefbericht-2026-11-15.md) als fehlend gemeldeten Punkte ergaenzen:
//   R1 Meta-Pixel, R2 Herkunftsmessung, R3 Wunsch-Formular, R4 PLZ-Aufloesung.
//
// Dieser Test liest rechtliches.html statisch (wie agb_test.ts; Playwright ist
// nicht installiert) und prueft, dass der Datenschutz-Tab die vier neuen
// Abschnitte enthaelt und dass im ausgelieferten HTML keine Platzhalter stehen.
//
// Aufruf:  deno test --allow-read datenschutz_ergaenzung_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Nur der Datenschutz-Abschnitt (von <div ... id="datenschutz"> bis zum AGB-Tab).
async function datenschutz(): Promise<string> {
  const html = await lies("./rechtliches.html");
  const start = html.indexOf('id="datenschutz"');
  const ende = html.indexOf('id="agb"', start);
  assert(start >= 0 && ende > start, "Datenschutz-Abschnitt nicht gefunden");
  return html.slice(start, ende);
}

Deno.test("Datenschutz nennt das Meta-Pixel mit Einwilligung, Empfaenger und Drittland (R1)", async () => {
  const d = await datenschutz();
  assertStringIncludes(d, "META-PIXEL");
  assertStringIncludes(d, "Meta Platforms Ireland Ltd.");
  assertStringIncludes(d, "Art. 6 Abs. 1 lit. a DSGVO");
  assertStringIncludes(d, "USA");
  // Widerruf ueber die bestehende Cookie-Einstellung.
  assertStringIncludes(d, "Cookie-Einstellungen");
});

Deno.test("Datenschutz nennt die Herkunftsmessung (Referrer-Domain, utm) in sessionStorage (R2)", async () => {
  const d = await datenschutz();
  assertStringIncludes(d, "HERKUNFTSMESSUNG");
  assertStringIncludes(d, "utm_source");
  assertStringIncludes(d, "sessionStorage");
  // Nur Domainname, ausdruecklich ohne Pfad/Parameter.
  assertStringIncludes(d, "ohne Pfad");
  assertStringIncludes(d, "Art. 6 Abs. 1 lit. f DSGVO");
});

Deno.test("Datenschutz nennt das Wunsch-Formular mit Weitergabe erst bei Vermittlung (R3)", async () => {
  const d = await datenschutz();
  assertStringIncludes(d, "WUNSCH-FORMULAR");
  assertStringIncludes(d, "Personal Trainer finden lassen");
  assertStringIncludes(d, "Art. 6 Abs. 1 lit. a DSGVO");
  // Der Trainer sieht die Daten erst bei der Vermittlung (kern.ts wunsch_an_trainer:
  // kunden_name=vorname, kunden_email, ziel, nachricht).
  assertStringIncludes(d, "Erst wenn wir deinen Wunsch an einen ausgewählten");
  assertStringIncludes(d, "office@vexfit.app");
});

Deno.test("Datenschutz nennt die PLZ-Aufloesung ueber api.zippopotam.us (R4)", async () => {
  const d = await datenschutz();
  assertStringIncludes(d, "POSTLEITZAHL-AUFLÖSUNG");
  assertStringIncludes(d, "api.zippopotam.us");
  // Nur PLZ + Land, keine Personendaten.
  assertStringIncludes(d, "nur die Postleitzahl und das Land");
  assertStringIncludes(d, "Art. 6 Abs. 1 lit. b DSGVO");
});

Deno.test("das Datenschutz-Stand-Datum ist aktualisiert", async () => {
  const html = await lies("./rechtliches.html");
  assertStringIncludes(html, "Datenschutzerklärung gemäß DSGVO · Stand: 15. November 2026");
});

Deno.test("keine Platzhalter im ausgelieferten rechtliches.html", async () => {
  const html = await lies("./rechtliches.html");
  for (const platzhalter of ["TODO", "BLOCK", "XXX", "[…]", "[...]", "PLATZHALTER"]) {
    assert(!html.includes(platzhalter), `Platzhalter „${platzhalter}" steht im ausgelieferten HTML`);
  }
});
