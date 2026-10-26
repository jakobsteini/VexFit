// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-einstieg.js
//
// Reine Entscheidungslogik des gefuehrten Einstiegs im Kundenbereich. Als
// klassisches Skript VOR dem Seitenskript einbinden; stellt window.vexEinstieg
// bereit. DOM-frei, damit ohne Browser pruefbar (kunden-bereich.html nutzt es).
(function (global) {
  // Reihenfolge der Fragen. 'ziel' nur, wenn kein Ziel gespeichert ist
  // (Altkonto); 'ort' und 'umkreis' immer. PLZ ist keine eigene Frage, sondern
  // ein Feld in der Umkreis-Frage (siehe plzFeldNoetig).
  function einstiegSchritte(opt) {
    opt = opt || {};
    const s = [];
    if (!opt.zielGesetzt) s.push('ziel');
    s.push('ort');
    s.push('umkreis');
    return s;
  }

  // Braucht die Umkreis-Frage ein PLZ-Feld? Nur wenn keine PLZ gespeichert ist.
  function plzFeldNoetig(opt) {
    return !(opt && opt.plzGesetzt);
  }

  // Ortslabel fuer die Zusammenfassung; 'beides' und leer = kein Teil (kein Filter).
  function ortLabel(ort) {
    if (ort === 'vor_ort') return 'Vor Ort';
    if (ort === 'online') return 'Online';
    return '';
  }

  // Baut den Text ueber der Trefferliste, z. B. "Abnehmen · Vor Ort · 25 km um Zug".
  function szTextBauen(a) {
    a = a || {};
    const teile = [];
    const ziele = Array.isArray(a.ziele) ? a.ziele : [];
    teile.push(ziele.length ? ziele.join(', ') : 'Alle Ziele');
    const ol = ortLabel(a.ort);
    if (ol) teile.push(ol);
    const stadt = a.stadt || '';
    if (stadt) {
      const km = Number(a.umkreis);
      teile.push(km > 0 ? km + ' km um ' + stadt : 'alle · ' + stadt);
    }
    return teile.join(' · ');
  }

  global.vexEinstieg = {
    einstiegSchritte: einstiegSchritte,
    plzFeldNoetig: plzFeldNoetig,
    ortLabel: ortLabel,
    szTextBauen: szTextBauen,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.vexEinstieg;
  }
})(typeof window !== 'undefined' ? window : globalThis);
