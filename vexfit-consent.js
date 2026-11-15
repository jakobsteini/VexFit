// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-consent.js
//
// Einwilligungs-Banner mit getrennten Kategorien (Entscheidung Jakob,
// 15.11.2026, Variante A). Technisch nötige Dinge (Anmelde-Sitzung, die
// Einwilligungs-Entscheidung selbst, Formular-Entwürfe, Formular-Vorgaben) sind
// immer erlaubt. Darüber hinaus gibt es ZWEI getrennte Kategorien, Standard je AUS:
//   - Marketing  (vexfit_consent  = 'zugestimmt'|'abgelehnt'): Meta-Pixel.
//   - Statistik  (vexfit_statistik = 'ja'|'nein'): Reichweiten-/Herkunftsmessung
//     (sessionStorage vexfit_werbung, Referrer-Domain, Trichter-Beacon).
//
// Wichtig für Bestandsnutzer: Wer früher nur „Akzeptieren" geklickt hat, hat
// vexfit_consent='zugestimmt' (= Marketing). Statistik bleibt AUS, bis sie neu
// gewählt wird – die bestehende Marketing-Zustimmung wird NICHT verfälscht.
//
// Diese Datei wird auf allen Seiten mit Banner zusätzlich eingebunden; sie
// ersetzt zur Laufzeit den Inhalt von #cookieBanner durch die Kategorie-Auswahl
// und überschreibt die globalen Banner-Funktionen kategorie-bewusst. Der
// Meta-Pixel-Lader (vexfitPixelLaden) bleibt im Seitenkopf und wird hier nur bei
// Marketing-Zustimmung ausgelöst.
(function (global) {
  const MARKETING = "vexfit_consent";
  const STATISTIK = "vexfit_statistik";

  function liesLS(schluessel) {
    try { return global.localStorage ? global.localStorage.getItem(schluessel) : null; }
    catch (_e) { return null; }
  }
  function schreibLS(schluessel, wert) {
    try { if (global.localStorage) global.localStorage.setItem(schluessel, wert); }
    catch (_e) { /* best effort */ }
  }

  function hatMarketing() { return liesLS(MARKETING) === "zugestimmt"; }
  function hatStatistik() { return liesLS(STATISTIK) === "ja"; }
  // Marketing ist „entschieden", sobald eine der beiden Antworten vorliegt.
  function marketingEntschieden() {
    const w = liesLS(MARKETING);
    return w === "zugestimmt" || w === "abgelehnt";
  }

  function setzeMarketing(an) {
    schreibLS(MARKETING, an ? "zugestimmt" : "abgelehnt");
    if (an && typeof global.vexfitPixelLaden === "function") {
      try { global.vexfitPixelLaden(); } catch (_e) { /* egal */ }
    }
  }
  function setzeStatistik(an) { schreibLS(STATISTIK, an ? "ja" : "nein"); }

  // Nach außen (Tests, andere Skripte).
  global.vexConsent = {
    hatMarketing: hatMarketing,
    hatStatistik: hatStatistik,
    setzeMarketing: setzeMarketing,
    setzeStatistik: setzeStatistik,
  };

  // Ab hier nur im Browser (DOM nötig). Ohne document bleibt nur die Lese-/
  // Schreib-API oben erhalten (für Tests).
  const doc = global.document;
  if (!doc) return;

  function waZeigen(an) {
    try {
      const k = doc.querySelectorAll(".wa-btn, .wa");
      for (let i = 0; i < k.length; i++) k[i].style.display = an ? "" : "none";
    } catch (_e) { /* egal */ }
  }

  function bannerInhalt() {
    return (
      '<div class="cookie-text">&#127850; Wir verwenden Cookies. Technisch n&ouml;tige immer; weitere nur mit deiner Einwilligung. <a href="rechtliches.html">Datenschutz</a></div>' +
      '<div class="cookie-cats" style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:#999;margin:2px 0">' +
        '<label style="display:flex;align-items:center;gap:9px;cursor:pointer"><input type="checkbox" id="ck-marketing" style="width:17px;height:17px;flex:none;accent-color:#e8ff00;cursor:pointer"> Marketing &ndash; Meta-Pixel (Facebook/Instagram)</label>' +
        '<label style="display:flex;align-items:center;gap:9px;cursor:pointer"><input type="checkbox" id="ck-statistik" style="width:17px;height:17px;flex:none;accent-color:#e8ff00;cursor:pointer"> Statistik &ndash; anonyme Reichweiten- und Herkunftsmessung</label>' +
      "</div>" +
      '<div class="cookie-actions">' +
        '<button type="button" class="btn-cookie-no" id="ck-nur">Nur n&ouml;tige</button>' +
        '<button type="button" class="btn-cookie-no" id="ck-save">Auswahl speichern</button>' +
        '<button type="button" class="btn-cookie-ok" id="ck-all">Alle akzeptieren &#10003;</button>' +
      "</div>"
    );
  }

  function banner() { return doc.getElementById("cookieBanner"); }

  function schliessen() {
    const b = banner();
    if (b) {
      b.style.transition = "transform 0.4s";
      b.style.transform = "translateY(100%)";
      global.setTimeout(function () { b.classList.remove("show"); }, 400);
    }
    waZeigen(true);
  }

  function zeigen() {
    const b = banner();
    if (!b) return;
    b.style.transition = "";
    b.style.transform = "";
    // Kästchen aus dem gespeicherten Stand vorbelegen (Standard AUS).
    const m = doc.getElementById("ck-marketing");
    const s = doc.getElementById("ck-statistik");
    if (m) m.checked = hatMarketing();
    if (s) s.checked = hatStatistik();
    b.classList.add("show");
    waZeigen(false);
  }

  function aufbauen() {
    const b = banner();
    if (!b) return;
    b.innerHTML = bannerInhalt();
    const m = doc.getElementById("ck-marketing");
    const s = doc.getElementById("ck-statistik");
    const nur = doc.getElementById("ck-nur");
    const save = doc.getElementById("ck-save");
    const all = doc.getElementById("ck-all");
    if (nur) nur.addEventListener("click", function () { setzeMarketing(false); setzeStatistik(false); schliessen(); });
    if (save) save.addEventListener("click", function () { setzeMarketing(!!(m && m.checked)); setzeStatistik(!!(s && s.checked)); schliessen(); });
    if (all) all.addEventListener("click", function () { if (m) m.checked = true; if (s) s.checked = true; setzeMarketing(true); setzeStatistik(true); schliessen(); });
  }

  // Kategorie-bewusste Ersatz-Funktionen (überschreiben die alten Inline-
  // Funktionen, da diese Datei nach ihnen läuft). „Cookie-Einstellungen" in der
  // Fußzeile ruft weiterhin vexfitEinstellungenOeffnen auf.
  global.vexfitEinstellungenOeffnen = function () { zeigen(); return false; };
  global.vexfitZustimmen = function () { setzeMarketing(true); setzeStatistik(true); schliessen(); };
  global.vexfitAblehnen = function () { setzeMarketing(false); setzeStatistik(false); schliessen(); };

  function start() {
    aufbauen();
    // Beim ersten Besuch (Marketing noch nicht entschieden) zeigen, sonst nicht –
    // so bleibt eine bestehende Entscheidung unangetastet und Statistik aus.
    if (!marketingEntschieden()) {
      zeigen();
    } else {
      const b = banner();
      if (b) b.classList.remove("show");
    }
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : globalThis);
