// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-matching.js
//
// Baustein 5: Kunden-Matching. Bewertet einen Trainer gegen die vier
// Kundenfragen (Ziel, Trainingsort, Sprache, grobe Zeit) und liefert eine
// Punktzahl - je hoeher, desto besser passend. Reine Funktion ohne DOM,
// deshalb mit vexfit-matching_test.ts pruefbar.
//
// Aufruf:  vexMatch.bewerte(trainer, antworten) -> Zahl
//          vexMatch.sortiere(trainerListe, antworten) -> neue, sortierte Liste

(function (global) {
  "use strict";

  // Passt die grobe Zeit (morgen/mittag/abend/wochenende) zur Verfuegbarkeit?
  function zeitPasst(verfuegbarkeit, zeit) {
    const v = Array.isArray(verfuegbarkeit) ? verfuegbarkeit : [];
    if (!zeit) return false;
    if (zeit === "wochenende") {
      return v.some((k) => k.startsWith("sa_") || k.startsWith("so_"));
    }
    // morgen/mittag/abend: an irgendeinem Wochentag.
    return v.some((k) => k.endsWith("_" + zeit));
  }

  function alsListe(x) {
    if (Array.isArray(x)) return x;
    if (x === undefined || x === null || x === "") return [];
    return [x];
  }

  // Punktzahl eines Trainers zu den Antworten. Jede erfuellte Frage zaehlt; das
  // Ziel (Spezialisierung) wiegt am schwersten.
  function bewerte(trainer, antworten) {
    const a = antworten || {};
    let punkte = 0;

    // Ziel: Ueberschneidung mit den Spezialisierungen.
    const ziele = alsListe(a.ziel).map((s) => String(s).toLowerCase());
    const spez = (trainer.spezialisierungen || []).map((s) => String(s).toLowerCase());
    const treffer = ziele.filter((z) => spez.some((s) => s.includes(z) || z.includes(s)));
    punkte += treffer.length * 3;

    // Trainingsort.
    if (a.ort && (trainer.trainingsorte || []).includes(a.ort)) punkte += 2;

    // Sprache.
    if (a.sprache && (trainer.sprachen || []).includes(a.sprache)) punkte += 2;

    // Grobe Zeit.
    if (a.zeit && zeitPasst(trainer.verfuegbarkeit, a.zeit)) punkte += 2;

    return punkte;
  }

  // Sortiert eine Kopie der Liste nach Punktzahl (hoechste zuerst); bei
  // Gleichstand bleibt die urspruengliche Reihenfolge (stabile Sortierung).
  function sortiere(liste, antworten) {
    return liste
      .map((t, i) => ({ t, i, p: bewerte(t, antworten) }))
      .sort((x, y) => y.p - x.p || x.i - y.i)
      .map((e) => e.t);
  }

  const api = { bewerte, sortiere, zeitPasst };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.vexMatch = api;
})(typeof window !== "undefined" ? window : globalThis);
