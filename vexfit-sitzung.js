// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-sitzung.js
//
// Fix 7a (Komplettpruefung 26.10.2026): "Eingeloggt bleiben".
// Gemeinsame Datei fuer alle Seiten mit Anmeldung. Sie erneuert das
// Zugangs-Token VOR Ablauf ueber /auth/v1/token?grant_type=refresh_token,
// solange ein refresh_token in vexfit_session liegt. Das legen login.html
// (nur mit gesetztem Haken "Eingeloggt bleiben") und registrieren.html ab.
// Ohne refresh_token bleibt alles beim Alten (kein Erneuern). Schlaegt die
// Erneuerung fehl, wird sauber ausgeloggt und zur Anmeldung geleitet.
//
// Die reinen Funktionen sind exportiert und ohne Browser pruefbar
// (fix7_test.ts); der Bootstrap unten laeuft nur im Browser.

export const VEXFIT_SB = "https://hbapzwxdehfgnputrfjf.supabase.co";
export const VEXFIT_KEY = "sb_publishable_DqQ2QLBEd_mRzWIRH5npXA_e99yfAzY";

/** Ablaufzeitpunkt (ms seit 1970) aus dem JWT-Feld exp, sonst 0. */
export function tokenAblaufMs(token) {
  try {
    const teil = String(token).split(".")[1];
    const roh = atob(teil.replace(/-/g, "+").replace(/_/g, "/"));
    const nutz = JSON.parse(roh);
    return typeof nutz.exp === "number" ? nutz.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Muss erneuert werden? Nur mit refresh_token. Erneuert wird innerhalb von
 * `vorlaufMs` vor Ablauf (Standard 2 Minuten) oder wenn der Ablauf unbekannt ist.
 */
export function mussErneuern(sess, jetztMs, vorlaufMs = 120000) {
  if (!sess || !sess.refresh_token || !sess.access_token) return false;
  const exp = tokenAblaufMs(sess.access_token);
  if (!exp) return true;
  return exp - jetztMs <= vorlaufMs;
}

/**
 * Ruft den Supabase-Token-Endpunkt mit dem refresh_token. Gibt die erneuerte
 * Sitzung zurueck (access_token/refresh_token aktualisiert) oder wirft bei
 * Fehler. `holen` ist fetch (injizierbar fuer den Test).
 */
export async function sitzungErneuern(sess, holen) {
  const r = await holen(VEXFIT_SB + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: VEXFIT_KEY },
    body: JSON.stringify({ refresh_token: sess.refresh_token }),
  });
  if (!r.ok) throw new Error("Token-Erneuerung fehlgeschlagen: " + r.status);
  const d = await r.json();
  if (!d || !d.access_token) throw new Error("Antwort ohne access_token");
  return {
    ...sess,
    access_token: d.access_token,
    refresh_token: d.refresh_token || sess.refresh_token,
  };
}

// ---------------------------------------------------------------------------
// Browser-Bootstrap (laeuft nicht unter Deno).
// ---------------------------------------------------------------------------
if (typeof document !== "undefined" && typeof localStorage !== "undefined") {
  const lies = () => {
    try {
      return JSON.parse(localStorage.getItem("vexfit_session") || "null");
    } catch {
      return null;
    }
  };
  const ausloggen = () => {
    try {
      localStorage.removeItem("vexfit_session");
    } catch { /* localStorage gesperrt */ }
    location.href = "login.html";
  };
  const pruefen = async () => {
    const sess = lies();
    if (!sess || !sess.refresh_token) return; // ohne Haken: altes Verhalten
    if (!mussErneuern(sess, Date.now())) return;
    try {
      const neu = await sitzungErneuern(sess, fetch);
      try {
        localStorage.setItem("vexfit_session", JSON.stringify(neu));
      } catch { /* localStorage gesperrt */ }
    } catch {
      ausloggen();
    }
  };
  pruefen();
  setInterval(pruefen, 60000);
  globalThis.vexfitSitzung = { tokenAblaufMs, mussErneuern, sitzungErneuern, pruefen };
}
