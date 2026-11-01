// /Users/js/Projekte/Vexfit/app/vexfit/gp10_suche_sichtbarkeit_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 10 (Live-Nachprüfung-Befund): die öffentliche
// Suche zeigte live 0 Trainer, weil suche.html nach der öffentlichen Sicht noch
// einmal nach Mindeststärke (Foto) filterte – im Widerspruch zur Entscheidung
// „Admin entscheidet allein" (Migration 2026-10-31-10). Fix: auf dem
// öffentlichen Pfad die Sicht allein entscheiden lassen.
//
// Aufruf:  deno test --allow-read gp10_suche_sichtbarkeit_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const suche = await Deno.readTextFile(new URL("./suche.html", import.meta.url));

Deno.test("Öffentlicher Pfad filtert nicht mehr nach Mindeststärke; angemeldeter schon", () => {
  assertStringIncludes(suche, "allTrainers = angemeldet ? daten.filter(mindeststaerkeErfuellt) : daten;");
  // Die alte, bedingungslose Filterung ist weg.
  assert(!suche.includes("allTrainers = daten.filter(mindeststaerkeErfuellt);"), "alte bedingungslose Mindeststärke-Filterung noch da");
});
