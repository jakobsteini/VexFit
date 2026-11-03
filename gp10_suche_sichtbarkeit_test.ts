// /Users/js/Projekte/Vexfit/app/vexfit/gp10_suche_sichtbarkeit_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 10 (Live-Nachprüfung-Befund): die öffentliche
// Suche zeigte live 0 Trainer, weil suche.html nach der öffentlichen Sicht noch
// einmal nach Mindeststärke (Foto) filterte – im Widerspruch zur Entscheidung
// „Admin entscheidet allein" (Migration 2026-10-31-10).
//
// B1 (Dauerlauf 2026-11-03): der Filter wurde auch auf dem ANGEMELDETEN Pfad
// entfernt. Beide Pfade zeigen jetzt genau: freigegeben (aktiv=true) UND nicht
// gesperrt. Dieser Test hält fest, dass gar nicht mehr nach Mindeststärke
// gefiltert wird. Die vollständige Prüfung beider Pfade steht in
// suche_sichtbarkeit_angemeldet_test.ts.
//
// Aufruf:  deno test --allow-read gp10_suche_sichtbarkeit_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const suche = await Deno.readTextFile(new URL("./suche.html", import.meta.url));

Deno.test("Weder der öffentliche noch der angemeldete Pfad filtert nach Mindeststärke", () => {
  // Beide Pfade nutzen dieselbe Liste; keine zusätzliche Mindeststärke-Hürde.
  assertStringIncludes(suche, "allTrainers = daten;");
  // Die alte, an die Anmeldung gebundene Filterung ist weg.
  assert(
    !suche.includes("daten.filter(mindeststaerkeErfuellt)"),
    "Mindeststärke-Filterung in loadTrainers noch da",
  );
  // Die Funktion selbst ist entfernt (kein toter Code mehr).
  assert(
    !suche.includes("function mindeststaerkeErfuellt"),
    "mindeststaerkeErfuellt sollte entfernt sein",
  );
});
