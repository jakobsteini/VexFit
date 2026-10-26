// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-passwort.js
//
// Gemeinsame Passwortregeln fuer registrieren.html und passwort-neu.html. Als
// klassisches Skript VOR dem Seitenskript einbinden; stellt die Funktionen
// global bereit (pwArten, pwStufe, pwMangel, PW_WORT) plus window.vexPasswort.
//
// Regeln WORTGLEICH wie bisher in registrieren.html:
//  'gruen': >=12 Zeichen UND >=3 Arten; 'gelb': >=8 UND >=2 Arten; sonst 'rot'.
//  "Arten" = Buchstaben, Ziffern, Sonderzeichen.
(function (global) {
  function pwArten(pw) {
    let n = 0;
    if (/[A-Za-zÀ-ÿ]/.test(pw)) n++;
    if (/[0-9]/.test(pw)) n++;
    if (/[^A-Za-z0-9À-ÿ]/.test(pw)) n++;
    return n;
  }
  function pwStufe(pw) {
    const len = pw.length, arten = pwArten(pw);
    if (len >= 12 && arten >= 3) return 'gruen';
    if (len >= 8 && arten >= 2) return 'gelb';
    return 'rot';
  }
  function pwMangel(pw) {
    if (pw.length < 8) return 'Dein Passwort braucht mindestens 8 Zeichen.';
    return 'Nutze mindestens zwei Arten: Buchstaben, Ziffern oder Sonderzeichen.';
  }
  const PW_WORT = { rot: 'zu schwach', gelb: 'geht in Ordnung', gruen: 'stark' };

  global.pwArten = pwArten;
  global.pwStufe = pwStufe;
  global.pwMangel = pwMangel;
  global.PW_WORT = PW_WORT;
  global.vexPasswort = { arten: pwArten, stufe: pwStufe, mangel: pwMangel, WORT: PW_WORT };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.vexPasswort;
  }
})(typeof window !== 'undefined' ? window : globalThis);
