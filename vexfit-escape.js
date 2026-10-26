// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-escape.js
//
// Gemeinsame Escape-Funktion fuer Vexfit. Wird als klassisches Skript VOR dem
// Seitenskript eingebunden und stellt window.vexEsc bereit.
//
// Zweck: Jeder Datenbankwert und jede Nutzereingabe, die per innerHTML oder
// Template-String in eine Seite geschrieben wird, muss hier durch - auch in
// href-, tel:- und mailto:-Attributen. So wird aus <img src=x onerror=...>
// sichtbarer Text statt ausgefuehrtes HTML.
//
// Ein einziges Escaping deckt Textinhalt UND Werte in doppelten
// Anfuehrungszeichen ab: & < > " ' werden ersetzt. Dadurch kann ein Wert weder
// ein Tag oeffnen noch aus einem Attribut ausbrechen.
(function (global) {
  function vexEsc(wert) {
    if (wert === null || wert === undefined) return '';
    return String(wert)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  global.vexEsc = vexEsc;
  // Erlaubt auch die Nutzung als Modul in den Tests (Deno/Node), ohne die
  // Verwendung als klassisches Skript im Browser zu stoeren.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { vexEsc };
  }
})(typeof window !== 'undefined' ? window : globalThis);
