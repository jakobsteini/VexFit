// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-pflicht.js
//
// B2 (Dauerlauf 2026-11-03): die Pflichtangaben VOR der Freigabe. Entscheidung
// Jakob: Foto, PLZ und Preis pro Stunde. (Sichtbar wird ein Trainer allein durch
// die Freigabe des Admins – siehe B1; diese drei sind nur die Angaben, die der
// Einstieg abfragt und die der Admin beim Freigeben als fehlend angezeigt
// bekommt. Freigeben bleibt trotzdem immer möglich.)
//
// Reine Funktion ohne DOM, damit sie sowohl im Trainer-Bereich als auch im
// Admin (vexfit-verwaltung.js über globalThis.vexPflicht) und im Test
// (vexfit-pflicht_test.ts) ohne Netz geprüft werden kann.

(function (global) {
  "use strict";

  // Foto gilt nur mit Adresse aus dem eigenen Avatar-Behälter – dieselbe Regel
  // wie der Trainer-Bereich (avatarAdresse) und der Admin (avatarVorhanden).
  function hatFoto(t) {
    const u = t && t.avatar_url;
    return typeof u === "string" && u.includes("/storage/v1/object/public/avatars/");
  }
  function hatPlz(t) {
    return !!(t && String(t.plz == null ? "" : t.plz).trim());
  }
  function hatPreis(t) {
    return Number(t && t.preis_stunde) > 0;
  }

  // Liefert pro Pflichtangabe true/false und die Liste der fehlenden in fester
  // Reihenfolge (Foto · PLZ · Preis) – genau diese Reihenfolge hat auch der
  // Einstieg (Schritt 1/2/3).
  function pflichtVorFreigabe(t) {
    t = t || {};
    const foto = hatFoto(t);
    const plz = hatPlz(t);
    const preis = hatPreis(t);
    const fehlt = [];
    if (!foto) fehlt.push("Foto");
    if (!plz) fehlt.push("PLZ");
    if (!preis) fehlt.push("Preis");
    return { foto: foto, plz: plz, preis: preis, fehlt: fehlt, vollstaendig: fehlt.length === 0 };
  }

  const api = { pflichtVorFreigabe, hatFoto, hatPlz, hatPreis };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.vexPflicht = api;
})(typeof window !== "undefined" ? window : globalThis);
