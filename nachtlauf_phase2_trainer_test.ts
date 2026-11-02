// /Users/js/Projekte/Vexfit/app/vexfit/nachtlauf_phase2_trainer_test.ts
//
// Nachtlauf 03.11.2026 – Phase 2, Befunde aus dem unabhaengigen Trainer-Prueflauf:
//  - Kopfzeile am Handy (375 px): der Anfragen-Zaehler schob "Ausloggen" aus dem
//    Bild. Der Zaehler haengt jetzt als Overlay an der Anfragen-Pille
//    (position:absolute) und verbraucht keine Zeilenbreite mehr.
//  - Statusleiste "Kostenlose Phase" versprach einen Zahlungslink als Reaktion
//    auf "Annehmen". Tatsaechlich kommt der Link beim Eingang der Anfrage per
//    Mail und die Kontaktdaten werden mit dem Abo freigeschaltet. Text korrigiert.
//
// Aufruf:  deno test --allow-read nachtlauf_phase2_trainer_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Kopfzeile: Anfragen-Zaehler liegt als Overlay (absolut) auf der Pille", async () => {
  const s = await lies("./trainer-bereich.html");
  // Pille ist Anker ...
  assertStringIncludes(s, ".nav-link{position:relative;");
  // ... und der Zaehler sitzt absolut darauf (nimmt keine Zeilenbreite).
  assert(/\.nav-badge\{position:absolute;/.test(s), "nav-badge ist nicht absolut positioniert");
});

Deno.test("Statusleiste verspricht keinen Zahlungslink als Reaktion auf 'Annehmen'", async () => {
  const s = await lies("./trainer-bereich.html");
  assert(
    !s.includes("annimmst, schicken wir dir den Zahlungslink"),
    "Statusleiste verspricht weiterhin den Zahlungslink beim Annehmen",
  );
  assertStringIncludes(s, "sobald die erste Kundenanfrage über Vexfit eingeht, bekommst du den Zahlungslink per E-Mail");
  assertStringIncludes(s, "Kontaktdaten schaltest du mit dem Abo frei");
});
