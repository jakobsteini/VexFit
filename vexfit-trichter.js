// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-trichter.js
//
// K1 (07.11.2026): gemeinsamer, anonymer Trichter-Beacon für die Kundenseite
// (suche.html, kunden-bereich.html). KEINE Personendaten – nur Kampagnen-
// Kennungen (utm), grober Browsertyp und grober PLZ-Bereich (zwei Ziffern).
// Best effort: fehlt die Tabelle/Spalte (Migration 2026-11-07-01 nicht
// eingespielt), schlägt der Aufruf still fehl und nichts bricht.
//
// Nutzung:  vexfitTrichter('suche', { rolle: 'kunde', plz: '5020' })
// Jede Stufe wird je Rolle nur EINMAL pro Seitenaufruf gemeldet (außer
// { einmal: false }).
(function (global) {
  var SUPABASE_URL = "https://hbapzwxdehfgnputrfjf.supabase.co";
  var SUPABASE_KEY = "sb_publishable_DqQ2QLBEd_mRzWIRH5npXA_e99yfAzY";

  function browserTyp() {
    var ua = (global.navigator && global.navigator.userAgent || "").toLowerCase();
    if (ua.indexOf("instagram") >= 0) return "instagram";
    if (ua.indexOf("fban") >= 0 || ua.indexOf("fbav") >= 0 || ua.indexOf("fb_iab") >= 0) return "facebook";
    return "sonst";
  }
  // K5: UTM „laufen durch" über die ganze Kundenstrecke (Stadtseite → Suche →
  // Profil → Anfrage). Beim ersten Aufruf mit UTM werden sie best effort in
  // sessionStorage gespiegelt; auf Folgeseiten ohne Query kommen sie von dort.
  var SCHLUESSEL = "vexfit_werbung";
  function werbung() {
    var p = new URLSearchParams(global.location ? global.location.search : "");
    var w = {
      quelle: (p.get("utm_source") || "").trim() || null,
      kampagne: (p.get("utm_campaign") || "").trim() || null,
      inhalt: (p.get("utm_content") || "").trim() || null,
    };
    try {
      var alt = JSON.parse(global.sessionStorage.getItem(SCHLUESSEL) || "null");
      if (alt && typeof alt === "object") {
        if (!w.quelle && alt.quelle) w.quelle = alt.quelle;
        if (!w.kampagne && alt.kampagne) w.kampagne = alt.kampagne;
        if (!w.inhalt && alt.inhalt) w.inhalt = alt.inhalt;
      }
      if (w.quelle || w.kampagne || w.inhalt) global.sessionStorage.setItem(SCHLUESSEL, JSON.stringify(w));
    } catch (e) { /* best effort */ }
    return w;
  }
  // Grober PLZ-Bereich: die ersten zwei Ziffern. "5020" -> "50". Reicht, um zu
  // sehen, wo Nachfrage ist, ohne jemanden zu verorten.
  function plzBereich(plz) {
    var s = String(plz == null ? "" : plz).replace(/\D/g, "");
    return s.length >= 2 ? s.slice(0, 2) : null;
  }
  // Land normalisieren: nur 'AT'|'DE'|'CH', sonst null. So wird derselbe PLZ-
  // Bereich (z. B. "50") je Land getrennt sichtbar (AT-Salzburg vs. CH).
  function landNormal(x) {
    var s = String(x == null ? "" : x).trim().toUpperCase();
    return (s === "AT" || s === "DE" || s === "CH") ? s : null;
  }

  var gemeldet = {};
  function vexfitTrichter(stufe, opt) {
    opt = opt || {};
    var rolle = opt.rolle || null;
    if (opt.einmal !== false) {
      var k = stufe + "|" + (rolle || "");
      if (gemeldet[k]) return;
      gemeldet[k] = true;
    }
    var w = werbung();
    var koerper = {
      stufe: stufe,
      rolle: rolle,
      quelle: w.quelle,
      kampagne: w.kampagne,
      inhalt: w.inhalt,
      browsertyp: browserTyp(),
    };
    // plz_bereich nur mitsenden, wenn eine PLZ da ist – so funktioniert die
    // Stufe "seite" auch, falls die Spalte noch nicht eingespielt ist.
    if (opt.plz != null && String(opt.plz).trim() !== "") {
      koerper.plz_bereich = plzBereich(opt.plz);
    }
    // Land (07.11.2026) nur mitsenden, wenn eindeutig – damit "50" in AT nicht
    // mit "50" in der Schweiz vermischt wird. Fehlt die Spalte (Migration noch
    // nicht eingespielt), schlägt der Beacon still fehl, wie bei plz_bereich.
    var land = landNormal(opt.land);
    if (land) koerper.land = land;
    try {
      global.fetch(SUPABASE_URL + "/rest/v1/trichter_ereignisse", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, Prefer: "return=minimal" },
        body: JSON.stringify(koerper),
      }).catch(function () {});
    } catch (e) { /* best effort */ }
  }

  global.vexfitTrichter = vexfitTrichter;
  // Für Tests ohne Browser.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { plzBereich: plzBereich, browserTyp: browserTyp, landNormal: landNormal };
  }
})(typeof window !== "undefined" ? window : globalThis);
