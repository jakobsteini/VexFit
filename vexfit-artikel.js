// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-artikel.js
//
// G4 (13.11.2026): dezenter „Bekannt aus …"-Hinweis. Als klassisches Skript NACH
// vexfit-config.js einbinden; stellt window.vexArtikelBanner bereit. Zeigt nur
// etwas, wenn VEXFIT_CONFIG.ARTIKEL_URL eine gültige https-Adresse ist – sonst
// bleibt der Container leer und unsichtbar. KEINE Logos fremder Medien, nur Text.
(function (global) {
  // Nur https-Adressen zulassen (kein javascript:, kein http, kein Unsinn).
  function sichereArtikelUrl(u) {
    try {
      const x = new URL(String(u == null ? "" : u).trim());
      return x.protocol === "https:" ? x.href : "";
    } catch {
      return "";
    }
  }

  // Rendert den Hinweis in das Element mit der Kennung zielId. Rückgabe: true,
  // wenn ein Banner gesetzt wurde. Der Linktext wird über textContent gesetzt,
  // die Adresse über die geprüfte href – kein HTML aus der Konfiguration.
  function vexArtikelBanner(url, zielId) {
    const doc = global.document;
    if (!doc) return false;
    const el = doc.getElementById(zielId);
    if (!el) return false;
    const href = sichereArtikelUrl(url);
    el.innerHTML = "";
    if (!href) {
      el.style.display = "none";
      return false;
    }
    const a = doc.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "★ Bekannt aus der Flachgauer Woche / SN.at – zum Artikel →";
    a.style.cssText =
      "display:block;text-align:center;padding:9px 16px;font-size:12.5px;letter-spacing:0.3px;color:#0a0a0a;background:#e8ff00;text-decoration:none;font-weight:700";
    el.appendChild(a);
    el.style.display = "block";
    return true;
  }

  // Bequemer Selbststart: liest die Adresse aus der Konfiguration und rendert in
  // den Standard-Container #artikelBanner, falls vorhanden.
  function vexArtikelAuto(zielId) {
    try {
      const url = (global.VEXFIT_CONFIG && global.VEXFIT_CONFIG.ARTIKEL_URL) || "";
      return vexArtikelBanner(url, zielId || "artikelBanner");
    } catch {
      return false;
    }
  }

  global.sichereArtikelUrl = sichereArtikelUrl;
  global.vexArtikelBanner = vexArtikelBanner;
  global.vexArtikelAuto = vexArtikelAuto;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { sichereArtikelUrl: sichereArtikelUrl, vexArtikelBanner: vexArtikelBanner };
  }
})(typeof window !== "undefined" ? window : globalThis);
