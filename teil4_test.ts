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

Deno.test("registrieren.html hat das Pflichtfeld Ziel und speichert den Wert", async () => {
  const html = await lies("./registrieren.html");
  assert(html.includes('src="vexfit-ziele.js"'), "vexfit-ziele.js nicht eingebunden");
  assert(html.includes('id="c-ziel"'), "Zielfeld c-ziel fehlt");
  assert(html.includes("Was ist dein Ziel?"), "Feldbeschriftung fehlt");
  assert(
    html.includes("Bitte wähle mindestens ein Ziel."),
    "Pflicht-Fehlermeldung fehlt",
  );
  assert(html.includes("vexZiele.zieleText("), "zieleText wird nicht verwendet");
  assert(html.includes("ziel:zielText"), "cd.ziel wird nicht aus der Auswahl gesetzt");
  assert(!/ziel:\s*''/.test(html), "cd darf kein festes leeres ziel mehr setzen");
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
