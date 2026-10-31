// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-matching_test.ts
//
// Prueft das Kunden-Matching (vexfit-matching.js): Bewertung und Sortierung.
// Aufruf:  deno test --allow-read vexfit-matching_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const quelle = await Deno.readTextFile(new URL("./vexfit-matching.js", import.meta.url));
new Function(quelle)();
// deno-lint-ignore no-explicit-any
const vexMatch = (globalThis as any).vexMatch;

const T = (over: Record<string, unknown> = {}) => ({
  spezialisierungen: [],
  trainingsorte: [],
  sprachen: [],
  verfuegbarkeit: [],
  ...over,
});

Deno.test("zeitPasst: Tageszeit an irgendeinem Tag, Wochenende nur Sa/So", () => {
  assert(vexMatch.zeitPasst(["mo_abend", "di_morgen"], "abend"));
  assert(!vexMatch.zeitPasst(["mo_abend"], "morgen"));
  assert(vexMatch.zeitPasst(["sa_mittag"], "wochenende"));
  assert(!vexMatch.zeitPasst(["mo_morgen", "fr_abend"], "wochenende"));
});

Deno.test("bewerte: jede erfuellte Frage zaehlt, Ziel am staerksten", () => {
  const voll = T({
    spezialisierungen: ["Yoga", "Pilates"],
    trainingsorte: ["online"],
    sprachen: ["Deutsch"],
    verfuegbarkeit: ["sa_morgen"],
  });
  const antw = { ziel: ["Yoga"], ort: "online", sprache: "Deutsch", zeit: "wochenende" };
  // 1 Ziel-Treffer (3) + Ort (2) + Sprache (2) + Zeit (2) = 9
  assertEquals(vexMatch.bewerte(voll, antw), 9);

  // Nichts passt -> 0.
  assertEquals(vexMatch.bewerte(T(), antw), 0);
});

Deno.test("bewerte: mehrere Ziel-Treffer zaehlen mehrfach", () => {
  const t = T({ spezialisierungen: ["Yoga", "Pilates", "Boxen"] });
  assertEquals(vexMatch.bewerte(t, { ziel: ["Yoga", "Pilates"] }), 6);
});

Deno.test("sortiere: bestpassende zuerst, stabil bei Gleichstand", () => {
  const liste = [
    T({ spezialisierungen: ["Boxen"] }),                 // 0 (i0)
    T({ spezialisierungen: ["Yoga"], sprachen: ["Deutsch"] }), // 3+2=5 (i1)
    T({ spezialisierungen: ["Yoga"] }),                  // 3 (i2)
    T({ spezialisierungen: ["Yoga"] }),                  // 3 (i3)
  ];
  const antw = { ziel: ["Yoga"], sprache: "Deutsch" };
  const r = vexMatch.sortiere(liste, antw);
  // Reihenfolge: i1 (5), dann i2, i3 (je 3, stabil), dann i0 (0).
  assertEquals(r, [liste[1], liste[2], liste[3], liste[0]]);
  // Original bleibt unveraendert.
  assertEquals(liste[0].spezialisierungen, ["Boxen"]);
});
