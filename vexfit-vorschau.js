// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-vorschau.js
//
// K2 (07.11.2026): Helfer für die öffentliche Vorschau (Schalter
// OEFFENTLICHE_VORSCHAU in vexfit-config.js, Standard AUS). Reine Funktionen,
// damit sie ohne Browser prüfbar sind.
//
//   vorschauAktiv(angemeldet)  – true nur, wenn der Schalter an UND der Besucher
//                                NICHT angemeldet ist.
//   vorschauReif(t)            – Profil „stark genug" für die Vorschau
//                                (Näherung an >= 5/8 aus den öffentlich
//                                sichtbaren Feldern; Erfahrung und Telefon sind
//                                in der öffentlichen Sicht nicht enthalten).
//   vorschauName(vn, nn)       – „Vorname N." (Nachname nur als Initial).
(function (global) {
  function schalterAn() {
    try { return !!(global.VEXFIT_CONFIG && global.VEXFIT_CONFIG.OEFFENTLICHE_VORSCHAU); }
    catch (e) { return false; }
  }
  function vorschauAktiv(angemeldet) {
    return !angemeldet && schalterAn();
  }

  function avatarDa(url) {
    return typeof url === "string" && url.indexOf("/storage/v1/object/public/avatars/") >= 0;
  }
  // Näherung an „>= 5/8". Öffentlich sichtbar sind sechs der acht Felder (ohne
  // Erfahrung und Telefon). Reif = mindestens vier dieser sechs erfüllt, und
  // Foto muss dabei sein (Foto ist für eine Vorschau das Wichtigste).
  function vorschauReif(t) {
    t = t || {};
    const text = function (v) { return (v == null ? "" : String(v)).trim(); };
    const foto = avatarDa(t.avatar_url);
    const felder = [
      foto,
      !!text(t.trainingsart),
      !!text(t.trainingsort),
      Number(t.preis_stunde) > 0,
      text(t.bio).length >= 10,
      Array.isArray(t.spezialisierungen) && t.spezialisierungen.length > 0,
    ];
    const erfuellt = felder.filter(Boolean).length;
    return foto && erfuellt >= 4;
  }

  function vorschauName(vorname, nachname) {
    const vn = (vorname == null ? "" : String(vorname)).trim();
    const nn = (nachname == null ? "" : String(nachname)).trim();
    const init = nn ? nn[0].toUpperCase() + "." : "";
    return (vn + " " + init).trim();
  }

  global.vexVorschau = { vorschauAktiv: vorschauAktiv, vorschauReif: vorschauReif, vorschauName: vorschauName };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.vexVorschau;
  }
})(typeof window !== "undefined" ? window : globalThis);
