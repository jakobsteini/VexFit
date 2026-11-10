// /Users/js/Projekte/Vexfit/app/vexfit/s8_abendbericht_test.ts
//
// Dauerlauf 07./08.11.2026 – S8: Abendbericht nachziehen (neue Anfragen, davon
// zur Prüfung, angenommen/abgelehnt, Ersatzvorschläge, Salzburg-Zeile).
//
// Aufruf:  deno test --allow-read s8_abendbericht_test.ts
import { assertStringIncludes } from "jsr:@std/assert@1";
import {
  type AbendberichtZahlen,
  leereAbendberichtZahlen,
  mailAbendbericht,
} from "./supabase/functions/vexfit-automation/kern.ts";

Deno.test("S8: Abendbericht zeigt Anfragen-Fluss, Prüfung und Ersatzvorschläge", () => {
  const z: AbendberichtZahlen = {
    ...leereAbendberichtZahlen(),
    anfragenNeu24h: 5,
    anfragenAngenommen24h: 2,
    anfragenAbgelehnt24h: 1,
    anfragenZurPruefung: 3,
    ersatzVersendet: 4,
    salzburg: { trainerFrei: 1, trainerReif: 1, suchen7: 0, vorm: 0, anfragen7: 2, annahmen7: 1, trainer: [] },
  };
  const txt = mailAbendbericht(z).text;
  assertStringIncludes(txt, "Neue Anfragen (24 h): 5");
  assertStringIncludes(txt, "angenommen 2, abgelehnt 1");
  assertStringIncludes(txt, "Anfragen zur Prüfung (offen): 3");
  assertStringIncludes(txt, "Ersatzvorschläge versendet (gesamt): 4");
  assertStringIncludes(txt, "Raum Salzburg (50/51/52)");
});

Deno.test("S8: ohne Aktivität bleibt der Bericht kurz (leer)", () => {
  const txt = mailAbendbericht(leereAbendberichtZahlen()).text;
  assertStringIncludes(txt, "nichts Neues");
});
