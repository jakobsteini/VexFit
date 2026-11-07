// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-abschnitte.js
//
// D2 (08.11.2026): Einteilung der Trefferliste in zwei Abschnitte –
// „Personal Training vor Ort" und „Online-Training". Reine Funktionen (kein
// DOM, kein Netz), damit sie ohne Browser geprueft werden koennen. Die
// Entfernungsberechnung bleibt in suche.html (braucht den Standortdienst).
//
// Regeln (Entscheidung Jakob steht):
//   * Vor-Ort-Abschnitt: NUR Trainer aus dem gewaehlten Land, die vor Ort
//     trainieren (trainingsort 'vor ort' ODER 'beides'). Reine Online-Trainer
//     und Trainer aus anderen Laendern erscheinen hier NIE.
//   * Online-Abschnitt: alle Trainer mit Online-Angebot – ABER ein „beides"-
//     Trainer aus dem GEWAEHLTEN Land steht nur im Vor-Ort-Abschnitt (kein
//     Doppeleintrag; lokal zaehlt der Vor-Ort-Mehrwert). Trainer aus dem
//     gewaehlten Land zuerst, danach andere Laender mit Laenderkennzeichnung.
(function (global) {
  const LANDNAME = { AT: 'Österreich', DE: 'Deutschland', CH: 'Schweiz' };

  function landNormal(x) {
    const s = String(x == null ? '' : x).trim().toUpperCase();
    return (s === 'AT' || s === 'DE' || s === 'CH') ? s : null;
  }

  function istOnline(t) {
    const ort = String((t && t.trainingsort) || '').toLowerCase();
    return ort === 'online' || ort === 'beides' ||
      String((t && t.trainingsart) || '').toLowerCase().includes('online');
  }

  function nurOnline(t) {
    const ort = String((t && t.trainingsort) || '').toLowerCase();
    return ort === 'online' || String((t && t.trainingsart) || '').toLowerCase() === 'online';
  }

  // Land-Kennzeichnung fuer den Online-Abschnitt: nur wenn der Trainer aus einem
  // ANDEREN Land als dem gewaehlten kommt, sonst null (keine Kennzeichnung).
  function ausLand(t, sel) {
    const tl = landNormal(t && t.land);
    const s = landNormal(sel);
    return (s && tl && tl !== s) ? tl : null;
  }

  // Teilt die Trainer in { vorOrt, online }. sel = gewaehltes Land ('AT'|'DE'|'CH')
  // oder null (ohne Landwahl bleibt der Vor-Ort-Teil ungefiltert nach Land).
  function einteilen(trainers, sel) {
    sel = landNormal(sel);
    const vorOrt = [];
    const online = [];
    for (const t of (trainers || [])) {
      const tl = landNormal(t && t.land);
      const beides = String((t && t.trainingsort) || '').toLowerCase() === 'beides';
      // Online-Abschnitt: Online-Angebot, aber „beides" aus dem gewaehlten Land
      // nicht doppelt (steht vor Ort).
      if (istOnline(t) && !(beides && sel && tl === sel)) online.push(t);
      // Vor-Ort-Abschnitt: kein reiner Online-Trainer, nur gewaehltes Land.
      if (nurOnline(t)) continue;
      if (sel && tl !== sel) continue;
      vorOrt.push(t);
    }
    // Online: gewaehltes Land zuerst (stabil).
    online.sort((a, b) =>
      (landNormal(a && a.land) === sel ? 0 : 1) - (landNormal(b && b.land) === sel ? 0 : 1));
    return { vorOrt, online };
  }

  global.vexAbschnitte = {
    LANDNAME: LANDNAME,
    landNormal: landNormal,
    istOnline: istOnline,
    nurOnline: nurOnline,
    ausLand: ausLand,
    einteilen: einteilen,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.vexAbschnitte;
})(typeof window !== 'undefined' ? window : globalThis);
