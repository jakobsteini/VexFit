// /Users/js/Projekte/Vexfit/app/vexfit/teil4_test.ts
//
// Teil 4 - Ziel bei der Kunden-Registrierung. Prueft die gemeinsame Zielliste
// und dass registrieren.html das Pflichtfeld hat und den Wert ", "-getrennt in
// Listen-Reihenfolge speichert.
//
// Aufruf:  deno test --allow-read teil4_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

async function ladeVexZiele() {
  const src = await lies("./vexfit-ziele.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", src)(g, g, undefined);
  // deno-lint-ignore no-explicit-any
  return g.vexZiele as any;
}

Deno.test("zieleText verbindet in Listen-Reihenfolge mit ', '", async () => {
  const vexZiele = await ladeVexZiele();
  // Klick-Reihenfolge Ausdauer, Abnehmen -> Ausgabe in Listen-Reihenfolge.
  assertEquals(vexZiele.zieleText(["Ausdauer", "Abnehmen"]), "Abnehmen, Ausdauer");
  assertEquals(vexZiele.zieleText([]), "");
  assertEquals(vexZiele.SPEZ_EINSTIEG.length, 16);
  // zieleAusText ist die Umkehrung fuer die Vorauswahl.
  assertEquals(vexZiele.zieleAusText("Abnehmen, Ausdauer"), ["Abnehmen", "Ausdauer"]);
  assertEquals(vexZiele.zieleAusText(""), []);
});

Deno.test("Teil R: Kunden-Erstformular ohne Ziel/PLZ – nötigste Felder, Ziel kommt bei der Suche", async () => {
  const html = await lies("./registrieren.html");
  // Teil R Punkt 10: das Kunden-Erstformular verlangt nur Vorname, Nachname,
  // E-Mail, Passwort, AGB. Ziel und PLZ werden NICHT mehr abgefragt – der Kunde
  // gibt sie direkt bei der Trainersuche (suche.html) ein.
  assert(!html.includes('id="c-ziel"'), "Zielfeld sollte im Erstformular entfernt sein");
  assert(!html.includes('id="c-plz"'), "PLZ-Feld sollte im Kunden-Erstformular entfernt sein");
  assert(html.includes("if(!fn||!ln||!email){showError('c-error','Bitte Vorname, Nachname und E-Mail ausfüllen!')"), "Kurz-Pflichtprüfung fehlt");
  // Neutrale Startwerte beim Anlegen; Ziel wird später gepflegt.
  assert(html.includes("ziel:''"), "cd.ziel sollte neutral leer gesetzt werden");
});

Deno.test("kunden-bereich.html nutzt die gemeinsame Liste und aktualisiert kunden.ziel", async () => {
  const html = await lies("./kunden-bereich.html");
  assert(html.includes('src="vexfit-ziele.js"'), "vexfit-ziele.js nicht eingebunden");
  assert(html.includes("window.SPEZ_EINSTIEG"), "nutzt die gemeinsame Liste nicht");
  assert(
    !html.includes("['Muskelaufbau','Abnehmen'"),
    "lokale Dubletten-Liste sollte entfernt sein",
  );
  assert(
    html.includes("zielSpeichernWennGeaendert"),
    "Aktualisierung von kunden.ziel fehlt",
  );
});
