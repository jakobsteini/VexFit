// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-video.js
//
// Erkennt einen Vorstellungsvideo-Link (YouTube, Instagram, TikTok) und liefert
// die Einbettungs-Adresse. Kein Hochladen, keine Speicherkosten - das Video
// bleibt bei der Plattform. Ungueltige Links werden abgelehnt (null).
//
// Reine Funktion, ohne DOM - deshalb mit vexfit-video_test.ts pruefbar.
// Aufruf:  vexVideo.erkenne(url) -> { plattform, id, embed } | null

(function (global) {
  "use strict";

  function erkenne(eingabe) {
    const roh = String(eingabe == null ? "" : eingabe).trim();
    if (!roh) return null;
    let url;
    try {
      url = new URL(roh.includes("://") ? roh : "https://" + roh);
    } catch {
      return null;
    }
    // Nur https/http zulassen (kein javascript:, data: ...).
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pfad = url.pathname;

    // -------- YouTube --------
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      let id = url.searchParams.get("v");
      if (!id) {
        const m = pfad.match(/^\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{6,})/);
        if (m) id = m[1];
      }
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
        return { plattform: "youtube", id, embed: "https://www.youtube.com/embed/" + id };
      }
      return null;
    }
    if (host === "youtu.be") {
      const id = pfad.replace(/^\//, "").split("/")[0];
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) {
        return { plattform: "youtube", id, embed: "https://www.youtube.com/embed/" + id };
      }
      return null;
    }

    // -------- Instagram (Beitrag oder Reel) --------
    if (host === "instagram.com") {
      const m = pfad.match(/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) {
        return {
          plattform: "instagram",
          id: m[1],
          embed: "https://www.instagram.com/p/" + m[1] + "/embed",
        };
      }
      return null;
    }

    // -------- TikTok --------
    if (host === "tiktok.com" || host === "vm.tiktok.com") {
      const m = pfad.match(/\/video\/(\d{6,})/);
      if (m) {
        return {
          plattform: "tiktok",
          id: m[1],
          embed: "https://www.tiktok.com/embed/v2/" + m[1],
        };
      }
      return null;
    }

    return null;
  }

  const api = { erkenne };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.vexVideo = api;
})(typeof window !== "undefined" ? window : globalThis);
