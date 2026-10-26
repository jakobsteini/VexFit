// /Users/js/Projekte/Vexfit/app/vexfit/einstieg_test.ts
//
// Baustein "Einstieg vereinfachen". Prueft die DOM-freie Entscheidungslogik
// (vexfit-einstieg.js) hinter den geforderten Szenarien sowie die CSS-/Einbau-
// Fixes in kunden-bereich.html (ohne Browser).
//
// Aufruf:  deno test --allow-read einstieg_test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

async function ladeVexEinstieg() {
  const src = await lies("./vexfit-einstieg.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", src)(g, g, undefined);
  // deno-lint-ignore no-explicit-any
  return g.vexEinstieg as any;
}

Deno.test("vollstaendiges Konto: nur Frage 1 (Ort) und 2 (Umkreis)", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(E.einstiegSchritte({ zielGesetzt: true, plzGesetzt: true }), ["ort", "umkreis"]);
  assertEquals(E.plzFeldNoetig({ plzGesetzt: true }), false);
});

Deno.test("Altkonto ohne Ziel und ohne PLZ: Ziel-Frage + PLZ-Feld", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(E.einstiegSchritte({ zielGesetzt: false, plzGesetzt: false }), ["ziel", "ort", "umkreis"]);
  assertEquals(E.plzFeldNoetig({ plzGesetzt: false }), true);
});

Deno.test("szText: Abnehmen · Vor Ort · 25 km um Zug", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(
    E.szTextBauen({ ziele: ["Abnehmen"], ort: "vor_ort", umkreis: 25, stadt: "Zug" }),
    "Abnehmen · Vor Ort · 25 km um Zug",
  );
  // 'beides' = kein Ort-Teil; ohne Ziele -> "Alle Ziele"; Umkreis 0 -> "alle · Stadt".
  assertEquals(
    E.szTextBauen({ ziele: [], ort: "beides", umkreis: 0, stadt: "Wien" }),
    "Alle Ziele · alle · Wien",
  );
  assertEquals(E.ortLabel("beides"), "");
  assertEquals(E.ortLabel("online"), "Online");
});

Deno.test("kunden-bereich.html: CSS-Fix und 2-Fragen-Umbau", async () => {
  const html = await lies("./kunden-bereich.html");
  // Befund B behoben: .hidden setzt sich jetzt durch.
  assertStringIncludes(html, ".hidden{display:none !important}");
  // Modul eingebunden.
  assertStringIncludes(html, 'src="vexfit-einstieg.js"');
  // Keine gelben Weiter-Knoepfe mehr ausser bei der Ziel-Frage (einstiegZielWeiter).
  const weiter = [...html.matchAll(/class="ein-weiter"/g)].length;
  assertEquals(weiter, 1);
  assertStringIncludes(html, "einstiegZielWeiter()");
  // Ort-Frage mit drei Knoepfen inkl. Beides; Umkreis per Tipp.
  assertStringIncludes(html, "einOrtTipp('beides')");
  assertStringIncludes(html, "einUmkreisTipp(25)");
  // Befund C: Nutzer-PLZ wird bei gesetztem Land ohne Rueckfrage aufgeloest.
  assertStringIncludes(html, "ermittleNutzerCoords(plz, status, K && K.land)");
  // Befund D: szText wird aus vexEinstieg.szTextBauen gefuellt.
  assertStringIncludes(html, "vexEinstieg.szTextBauen");
});
