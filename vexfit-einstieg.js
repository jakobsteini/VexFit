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

  // Braucht die Ortswahl noch eine Umkreis-Frage? Online nicht (ortsunabhaengig).
  function brauchtUmkreis(ort) {
    return ort !== 'online';
  }

  // Ist dieser Trainer online erreichbar? trainingsort hat Vorrang; fehlt er
  // (Altbestand ohne die neue Spalte), zaehlt der Freitext trainingsart.
  function istOnline(t) {
    const o = t && t.trainingsort;
    if (o === 'online' || o === 'beides') return true;
    if (o === 'vor_ort') return false;
    return String((t && t.trainingsart) || '').toLowerCase().indexOf('online') >= 0;
  }

  // Trainiert dieser Trainer vor Ort? trainingsort hat Vorrang; fehlt er, gilt
  // ein Trainer ohne "online" im Freitext als vor Ort (Altbestand bleibt sichtbar).
  function istVorOrt(t) {
    const o = t && t.trainingsort;
    if (o === 'vor_ort' || o === 'beides') return true;
    if (o === 'online') return false;
    return String((t && t.trainingsart) || '').toLowerCase().indexOf('online') < 0;
  }

  // Teilt eine Trefferliste nach der Ortswahl in zwei Abschnitte. Jeder Trainer
  // traegt _dist (Entfernung in km) oder null (kein Ort/nicht aufloesbar).
  // radius 0 bedeutet "Alle" (keine Entfernungsgrenze). Online-Trainer zaehlen
  // NIE zum Umkreis (das war Befund C). Rueckgabe:
  //   { umkreis:[], online:[], anzahlUmkreis:n }
  function trefferAufteilen(liste, ort, radius) {
    liste = Array.isArray(liste) ? liste : [];
    radius = Number(radius) || 0;
    const imUmkreis = function (t) {
      if (!istVorOrt(t)) return false;
      if (radius === 0) return true; // "Alle": keine Entfernungsgrenze
      return t._dist != null && t._dist <= radius;
    };
    if (ort === 'online') {
      return { umkreis: [], online: liste.filter(istOnline), anzahlUmkreis: 0 };
    }
    const umkreis = liste.filter(imUmkreis);
    if (ort === 'vor_ort') {
      return { umkreis: umkreis, online: [], anzahlUmkreis: umkreis.length };
    }
    // 'beides' (oder keine Ortswahl): Online-Abschnitt = online/beides, die nicht
    // schon im Umkreis stehen.
    const drin = umkreis;
    const online = liste.filter(function (t) {
      return istOnline(t) && drin.indexOf(t) < 0;
    });
    return { umkreis: umkreis, online: online, anzahlUmkreis: umkreis.length };
  }

  // Zaehlzeile ueber der Trefferliste. Nennt NUR die Trainer im Umkreis (Befund C):
  // "<Stadt> · <n> Trainer im Umkreis von <X> km". radius 0 = "Alle" (ohne km).
  function zaehlzeile(stadt, anzahl, radius) {
    const teile = [];
    if (stadt) teile.push(String(stadt));
    const km = Number(radius) || 0;
    teile.push(km > 0
      ? anzahl + ' Trainer im Umkreis von ' + km + ' km'
      : anzahl + ' Trainer im Umkreis');
    return teile.join(' · ');
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
    brauchtUmkreis: brauchtUmkreis,
    istOnline: istOnline,
    istVorOrt: istVorOrt,
    trefferAufteilen: trefferAufteilen,
    zaehlzeile: zaehlzeile,
    ortLabel: ortLabel,
    szTextBauen: szTextBauen,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.vexEinstieg;
  }
})(typeof window !== 'undefined' ? window : globalThis);
