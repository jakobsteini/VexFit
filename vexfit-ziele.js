// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-ziele.js
//
// Gemeinsame Ziel-/Spezialisierungsliste fuer registrieren.html (Kundenziel)
// und kunden-bereich.html (gefuehrter Einstieg). Als klassisches Skript VOR dem
// Seitenskript einbinden; stellt window.SPEZ_EINSTIEG und window.vexZiele bereit.
//
// Werte WORTGLEICH wie bisher in kunden-bereich.html (16 Ziele, feste Reihenfolge).
(function (global) {
  const SPEZ_EINSTIEG = [
    'Muskelaufbau', 'Abnehmen', 'Krafttraining', 'Ausdauer', 'HIIT',
    'Functional Training', 'Mobility', 'Bodybuilding', 'Calisthenics',
    'Schwangerschaft', 'Senioren', 'Rücken & Haltung', 'Ernährungsplanung',
    'Wettkampfvorbereitung', 'Stressabbau', 'Flexibilität',
  ];

  // Verbindet die gewaehlten Ziele in LISTEN-Reihenfolge (nicht Klick-Reihenfolge)
  // mit ", ". Unbekannte Werte werden ignoriert.
  function zieleText(auswahl) {
    const set = auswahl instanceof Set ? auswahl
      : new Set(Array.isArray(auswahl) ? auswahl : []);
    return SPEZ_EINSTIEG.filter(function (z) { return set.has(z); }).join(', ');
  }

  // Zerlegt einen gespeicherten kunden.ziel-Text (", "-getrennt) in die
  // bekannten Ziele, in Listen-Reihenfolge.
  function zieleAusText(text) {
    if (!text) return [];
    const teile = new Set(String(text).split(',').map(function (s) { return s.trim(); }));
    return SPEZ_EINSTIEG.filter(function (z) { return teile.has(z); });
  }

  global.SPEZ_EINSTIEG = SPEZ_EINSTIEG;
  global.vexZiele = { SPEZ_EINSTIEG: SPEZ_EINSTIEG, zieleText: zieleText, zieleAusText: zieleAusText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.vexZiele;
  }
})(typeof window !== 'undefined' ? window : globalThis);
