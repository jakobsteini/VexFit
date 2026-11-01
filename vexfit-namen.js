// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-namen.js
//
// Feinschliff Teil 3: EINE gemeinsame Funktion für die Groß-/Kleinschreibung von
// Namen. Trainer tippen ihre Namen oft klein ("jajajaa hebebee") oder ganz groß;
// angezeigt werden sie überall schön ("Jajajaa Hebebee").
//
// Diese Datei ist die kanonische Quelle. Sie wird als klassisches Skript VOR dem
// Seitenskript eingebunden und stellt window.vexName bereit (wie vexfit-escape.js
// mit vexEsc). Wortgleich dupliziert – und per namen_test.ts abgesichert – liegt
// dieselbe Funktion als `nameFormatieren` in vexfit-verwaltung.js (ES-Modul der
// Verwaltung) und in supabase/functions/vexfit-automation/kern.ts (Edge/Mails +
// Push), weil die drei in verschiedenen Laufzeiten leben.
//
// NUR Anzeige: der gespeicherte Wert in der Datenbank wird NICHT verändert.
//
// Regeln:
//   * Jedes Namensteil beginnt groß, der Rest klein ("müller" → "Müller").
//   * Bindestrich- und Doppelnamen: jedes Teilstück groß ("anna-lena" →
//     "Anna-Lena"), ebenso nach einem Apostroph ("o'brien" → "O'Brien").
//   * Namenszusätze (von, van, de, der …) bleiben klein, aber nur zwischen
//     Namensteilen, nie als erstes Wort ("ludwig van beethoven" →
//     "Ludwig van Beethoven", aber "De Vries" am Anfang bleibt groß).
//   * Bereits gewollt gemischte Schreibweise (Kleinbuchstabe direkt vor einem
//     Großbuchstaben, z. B. "McDonald", "DeWitt") bleibt unverändert.
(function (global) {
  const PARTIKEL = new Set([
    "von", "van", "de", "der", "den", "del", "della", "di", "da", "dos", "du",
    "la", "le", "ter", "ten", "zu", "zum", "zur", "of", "and",
  ]);

  // Eine gewollte Binnengroßschreibung erkennen: ein Klein- direkt vor einem
  // Großbuchstaben (McDonald, DeWitt). Reines GROSS (MÜLLER) zählt NICHT.
  function gewollteMischung(s) {
    return /[a-zäöüéèàçñ][A-ZÄÖÜ]/.test(s);
  }

  // Ein einzelnes Teilstück (zwischen Bindestrich/Apostroph) groß beginnen.
  function teilGross(seg) {
    if (!seg) return seg;
    if (gewollteMischung(seg)) return seg;
    const klein = seg.toLowerCase();
    return klein.charAt(0).toUpperCase() + klein.slice(1);
  }

  function vexName(roh) {
    if (roh === null || roh === undefined) return "";
    const s = String(roh).replace(/\s+/g, " ").trim();
    if (!s) return "";
    const worte = s.split(" ");
    return worte.map(function (wort, i) {
      const klein = wort.toLowerCase();
      // Namenszusatz klein lassen – aber nie als erstes Wort und nie, wenn es
      // gewollt gemischt geschrieben ist.
      if (i > 0 && PARTIKEL.has(klein) && !gewollteMischung(wort)) return klein;
      // An Bindestrich/Apostroph trennen, Trenner behalten, jedes Stück groß.
      return wort.split(/(['’-])/).map(function (seg) {
        return (seg === "-" || seg === "'" || seg === "’") ? seg : teilGross(seg);
      }).join("");
    }).join(" ");
  }

  global.vexName = vexName;
  // Erlaubt die Nutzung als Modul in Tests (Node), ohne das klassische Skript im
  // Browser zu stören. In Deno-Tests wird die Datei stattdessen ausgewertet.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { vexName: vexName, nameFormatieren: vexName };
  }
})(typeof window !== "undefined" ? window : globalThis);
