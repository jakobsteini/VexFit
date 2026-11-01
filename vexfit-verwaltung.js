// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-verwaltung.js
//
// Admin-Dashboard neu (Teil 1 + 2): die gesamte Logik der geschützten
// Verwaltungsseite. Als ES-Modul geladen (<script type="module" src=…>), damit
// die Content-Security-Policy ohne Inline-Code auskommt: keine inline-Skripte,
// keine onclick-Attribute (alles über Ereignis-Delegation).
//
// Die REINEN Funktionen (Sitzung prüfen, aal2 lesen, Filtern/Sortieren, CSV,
// Testkonten, Profil-Vollständigkeit) sind exportiert und werden in
// verwaltung_logik_test.ts ohne Browser geprüft. Der DOM-Teil ist hinter einer
// Prüfung auf `document` gekapselt und läuft nur im Browser.
//
// Sicherheit (Teil 1):
//   * eigene Admin-Sitzung in sessionStorage (eigener Schlüssel, getrennt von
//     der Kunden-/Trainer-Anmeldung); automatische Abmeldung nach 30 min
//     Inaktivität und beim Schließen des Tabs (sessionStorage).
//   * zweiter Faktor (TOTP) Pflicht: ohne aal2 wird das Dashboard nicht gezeigt.
//   * ist_vexfit_admin() wird nach dem Login serverseitig geprüft.
//   * alle schreibenden Aktionen laufen über die Edge Function /admin-aktion.
//   * jede Ausgabe wird escaped (escapeHtml).

export const SUPABASE_URL = "https://hbapzwxdehfgnputrfjf.supabase.co";
export const ANON_KEY = "sb_publishable_DqQ2QLBEd_mRzWIRH5npXA_e99yfAzY";
// Das einzige Konto mit Admin-Zugriff. Wortgleich zu kern.ts (ADMIN_ID) und zur
// Datenbankregel ist_vexfit_admin(). Steuert nur die Anzeige – der echte Schutz
// liegt in Login + zweitem Faktor + Serverprüfung.
export const ADMIN_ID = "ee744b01-0a70-4da5-a19b-6c905c8479b5";
export const SITZUNG_SCHLUESSEL = "vexfit_admin_session";
export const INAKTIV_MS = 30 * 60 * 1000; // 30 Minuten
export const PROFIL_FELDER_GESAMT = 8;
// Stripe-Zahlungslink „ERSTE Anfrage" (wortgleich zum Workflow/kern.ts).
export const STRIPE_ERSTE = "https://buy.stripe.com/eVqdR9gopdNhczNbhw2oE00";
// Teil A: öffentlicher VAPID-Schlüssel für Web Push. Darf im Code stehen; der
// PRIVATE Schlüssel ist ausschließlich das Supabase-Secret VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY = "BO2R6TqUNLrPOKLQs1LThvjih094DldW9Mi6uY6QOxu_I-6JW6Uj5Z2pIF_TaTSVjKjv_IH6F8WqV9o41GyCYZg";

// ============================================================================
// REINE FUNKTIONEN (ohne Browser, in verwaltung_logik_test.ts geprüft)
// ============================================================================

/** Escaping für jede Ausgabe (wortgleich zu vexfit-escape.js). Deckt Textinhalt
 *  und Werte in Anführungszeichen ab: & < > " ' werden ersetzt. */
export function escapeHtml(wert) {
  if (wert === null || wert === undefined) return "";
  return String(wert)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Supabase liefert den TOTP-QR-Code als SVG. Je nach Version kommt er als
 *  `data:image/svg+xml;utf-8,<svg …>` mit ROHEM, nicht prozentkodiertem SVG –
 *  oder als nackter <svg>-String. Rohes SVG enthält Zeichen, die eine data:-
 *  Adresse zerstören: vor allem '#' (in Füllfarben wie fill="#000"), das den
 *  Fragmentteil startet und die Bilddaten abschneidet, außerdem '<', '>', '"'.
 *  Als <img>-Quelle ergibt das ein kaputtes Bild (die beobachtete Ursache; die
 *  CSP erlaubt data: bereits). Wir bauen daraus eine sauber prozentkodierte
 *  data:-Adresse. Base64-/PNG-Adressen bleiben unverändert. Bewusst weiter als
 *  <img> (nicht per innerHTML): ein data:-Bild führt keinen fremden Code aus –
 *  das ist die sichere Variante gegenüber dem Einhängen von fremdem SVG ins DOM. */
export function qrAlsDatenUri(roh) {
  if (typeof roh !== "string") return "";
  const s = roh.trim();
  if (!s) return "";
  if (/^data:image\/[a-z.+-]+;base64,/i.test(s)) return s; // schon base64 (z. B. PNG)
  let svg = s;
  const m = s.match(/^data:image\/svg\+xml[^,]*,(.*)$/is);
  if (m) svg = m[1];
  // Falls bereits prozentkodiert (kein literales <svg), erst dekodieren, damit
  // nicht doppelt kodiert wird.
  if (!svg.includes("<svg") && /%[0-9a-f]{2}/i.test(svg)) {
    try { svg = decodeURIComponent(svg); } catch { /* roh lassen */ }
  }
  if (!svg.includes("<svg")) return s; // kein SVG erkennbar: Original zurückgeben
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** base64url -> String (für das Auslesen von JWT-Nutzdaten). */
function b64urlDecode(teil) {
  let b64 = String(teil).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return atob(b64);
}

/** Nutzdaten eines JWT (oder null). */
function jwtNutzdaten(token) {
  if (!token || typeof token !== "string") return null;
  const teile = token.split(".");
  if (teile.length < 2) return null;
  try {
    return JSON.parse(b64urlDecode(teile[1]));
  } catch {
    return null;
  }
}

/** MFA-Stufe ("aal1"/"aal2") aus dem Token, sonst null. */
export function aalAusToken(token) {
  const d = jwtNutzdaten(token);
  return d && typeof d.aal === "string" ? d.aal : null;
}

/** Ablaufzeitpunkt (exp, Millisekunden) aus dem Token, sonst null. */
export function tokenAblaufMs(token) {
  const d = jwtNutzdaten(token);
  return d && typeof d.exp === "number" ? d.exp * 1000 : null;
}

/**
 * Ist die Admin-Sitzung gültig? Verlangt access_token mit aal2, nicht
 * abgelaufen und nicht länger als maxInaktiv ohne Aktivität. Rein prüfbar.
 */
export function sitzungGueltig(sess, jetzt = Date.now(), maxInaktiv = INAKTIV_MS) {
  if (!sess || typeof sess !== "object") return false;
  if (!sess.access_token) return false;
  if (sess.user_id !== ADMIN_ID) return false;
  if (aalAusToken(sess.access_token) !== "aal2") return false;
  const ablauf = tokenAblaufMs(sess.access_token);
  if (ablauf !== null && ablauf <= jetzt) return false;
  if (typeof sess.zuletzt === "number" && (jetzt - sess.zuletzt) > maxInaktiv) return false;
  return true;
}

/** Testkonto? E-Mail mit „+" oder in der gepflegten Liste. */
export function istTestkonto(email, liste = []) {
  if (!email) return false;
  const e = String(email).toLowerCase();
  if (e.includes("+")) return true;
  return liste.map((x) => String(x).toLowerCase()).includes(e);
}

/** Liste ggf. um Testkonten bereinigen. */
export function sichtbar(liste, testsAus, testListe = []) {
  const arr = Array.isArray(liste) ? liste : [];
  return testsAus ? arr.filter((p) => !istTestkonto(p.email, testListe)) : arr;
}

/** Avatar-Adresse nur gelten lassen, wenn sie aus dem Avatar-Bucket kommt. */
function avatarVorhanden(url) {
  return typeof url === "string" && url.includes("/storage/v1/object/public/avatars/");
}

/** Die acht Vollständigkeitsfelder (inkl. Foto), gleiche Regel wie im Backend. */
export function fehlendeProfilfelder(t) {
  const fehlt = [];
  if (!avatarVorhanden(t.avatar_url)) fehlt.push("Foto");
  if (!t.trainingsart) fehlt.push("Trainingsart");
  if (!t.trainingsort) fehlt.push("Trainingsort");
  if (!(Number(t.preis_stunde) > 0)) fehlt.push("Preis pro Stunde");
  if (!(t.bio && String(t.bio).trim().length > 10)) fehlt.push("Über mich");
  if (!t.erfahrung) fehlt.push("Erfahrung");
  if (!(Array.isArray(t.spezialisierungen) && t.spezialisierungen.length > 0)) fehlt.push("Spezialisierungen");
  if (!(t.telefon && String(t.telefon).trim())) fehlt.push("Telefon");
  return fehlt;
}

/** Freischalt-Mail: aus trainers.freischalt_mail_gesendet ablesen, ob (und wann)
 *  die Mail „Dein Profil ist freigeschaltet" an den Trainer ging. Ein Zeitstempel
 *  (String) oder true = gesendet. Fehlt die Spalte (Migration nicht eingespielt),
 *  ist der Wert undefined -> noch nicht gesendet. */
export function freischaltMailStatus(t) {
  const v = t && t.freischalt_mail_gesendet;
  if (v === true) return { gesendet: true, datum: null };
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    return { gesendet: true, datum: isNaN(d.getTime()) ? null : d };
  }
  return { gesendet: false, datum: null };
}

/** Profilstärke 0–100 % aus acht Ausbaupunkten. */
export function profilStaerke(t) {
  const hatVideo = !!(t.video_url && /youtu\.?be|vimeo|\.mp4/i.test(String(t.video_url)));
  const punkte = [
    avatarVorhanden(t.avatar_url),
    (t.bio || "").trim().length > 10,
    Array.isArray(t.spezialisierungen) && t.spezialisierungen.length > 0,
    hatVideo,
    Array.isArray(t.galerie) && t.galerie.length > 0,
    Array.isArray(t.sprachen) && t.sprachen.length > 0,
    Array.isArray(t.trainingsorte) && t.trainingsorte.length > 0,
    !!t.zertifikat_datei,
  ];
  return Math.round(punkte.filter(Boolean).length / punkte.length * 100);
}

/** Zustand einer Anfrage: alles außer angenommen/abgelehnt gilt als offen. */
export function anfrageZustand(a) {
  const s = a && a.status;
  return (s === "angenommen" || s === "abgelehnt") ? s : "offen";
}

/** Stunden seit dem Eingang einer noch offenen Anfrage (sonst null). */
export function unbeantwortetSeitStunden(a, jetzt = Date.now()) {
  if (anfrageZustand(a) !== "offen" || !a.created_at) return null;
  const t = Date.parse(a.created_at);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((jetzt - t) / 3_600_000));
}

/** Trainer filtern nach Suchtext und Statusfilter. */
export function trainerFiltern(liste, { q = "", status = "" } = {}) {
  const suche = String(q).toLowerCase().trim();
  return (Array.isArray(liste) ? liste : []).filter((t) => {
    if (status === "warten" && t.aktiv) return false;
    if (status === "aktiv" && !t.aktiv) return false;
    if (status === "gesperrt" && !t.gesperrt) return false;
    if (status === "unvollstaendig" && fehlendeProfilfelder(t).length === 0) return false;
    if (status === "studio" && !t.studio_standort_id) return false;
    if (!suche) return true;
    const heu = [t.vorname, t.nachname, t.email, t.stadt, t.plz].join(" ").toLowerCase();
    return heu.includes(suche);
  });
}

/** Kunden filtern nach Suchtext. */
export function kundenFiltern(liste, q = "") {
  const suche = String(q).toLowerCase().trim();
  return (Array.isArray(liste) ? liste : []).filter((k) => {
    if (!suche) return true;
    const heu = [k.vorname, k.nachname, k.email, k.stadt, k.plz].join(" ").toLowerCase();
    return heu.includes(suche);
  });
}

/** Stabil sortieren nach einem Feld. feld: name|email|stadt|created_at. */
export function sortieren(liste, feld, absteigend = false) {
  const wert = (p) => {
    if (feld === "name") return `${p.vorname || ""} ${p.nachname || ""}`.trim().toLowerCase();
    if (feld === "created_at") return p.created_at || "";
    return String(p[feld] ?? "").toLowerCase();
  };
  const arr = (Array.isArray(liste) ? liste : []).slice();
  arr.sort((a, b) => {
    const x = wert(a), y = wert(b);
    if (x < y) return absteigend ? 1 : -1;
    if (x > y) return absteigend ? -1 : 1;
    return 0;
  });
  return arr;
}

/** Eine CSV-Zelle sicher einpacken (Trenner/Zeilenumbruch/Anführungszeichen). */
export function csvZelle(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (Array.isArray(v)) s = v.join("; ");
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** CSV aus Zeilen bauen. spalten: [{key,label,wert?}]. Trenner Semikolon
 *  (Excel-DE), mit BOM für Umlaute. */
export function csvBauen(zeilen, spalten) {
  const kopf = spalten.map((s) => csvZelle(s.label)).join(";");
  const rumpf = (Array.isArray(zeilen) ? zeilen : []).map((z) =>
    spalten.map((s) => csvZelle(s.wert ? s.wert(z) : z[s.key])).join(";")
  ).join("\r\n");
  return "﻿" + kopf + "\r\n" + rumpf;
}

export const ORT_TEXT = { studio: "Studio", outdoor: "Outdoor", beim_kunden: "Beim Kunden", online: "Online", beides: "Studio & beim Kunden" };

// ============================================================================
// DOM-TEIL (nur im Browser)
// ============================================================================
if (typeof document !== "undefined") {
  starteVerwaltung();
}

function starteVerwaltung() {
  const $ = (id) => document.getElementById(id);
  const auth = { token: null, refresh: null, user: null, factorId: null, challengeId: null };
  const daten = { trainers: [], kunden: [] };
  const zustand = {
    testsAusTrainer: true, testsAusKunden: true,
    trainerSort: { feld: "created_at", ab: true },
    kundenSort: { feld: "created_at", ab: true },
  };
  let inaktivTimer = null;
  let _dialogAufloesen = null;
  let _formAufloesen = null;
  let hashSprungGemacht = false; // Teil M: Deep-Link nur einmal nach dem ersten Laden anspringen

  // ── Ansichten ──
  function zeigeAnsicht(id) {
    for (const a of ["ansicht-login", "ansicht-mfa-setup", "ansicht-mfa-code", "ansicht-dashboard"]) {
      $(a).classList.toggle("verborgen", a !== id);
    }
  }

  // ── Meldungen ──
  function meldung(text, art = "info", aktion) {
    const wrap = $("meldungen");
    const el = document.createElement("div");
    el.className = "meldung meldung-" + art;
    const span = document.createElement("span");
    span.textContent = text;
    el.append(span);
    // Optionaler Aktionsknopf in der Meldung (z. B. "Mail erneut senden").
    if (aktion && aktion.text && typeof aktion.fn === "function") {
      const akt = document.createElement("button");
      akt.className = "btn-klein";
      akt.style.marginLeft = "4px";
      akt.textContent = aktion.text;
      akt.addEventListener("click", () => { el.remove(); aktion.fn(); });
      el.append(akt);
    }
    const zu = document.createElement("button");
    zu.setAttribute("aria-label", "Schließen");
    zu.textContent = "✕";
    zu.addEventListener("click", () => el.remove());
    el.append(zu);
    wrap.appendChild(el);
    if (art !== "fehler") setTimeout(() => el.remove(), 4500);
  }
  const fehler = (t) => meldung(t, "fehler");
  const erfolg = (t) => meldung(t, "ok");

  // ── Supabase-Aufrufe ──
  function authKopf(token) {
    return { apikey: ANON_KEY, Authorization: "Bearer " + token };
  }
  async function auth1(pfad, body) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${pfad}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }
  async function authMit(pfad, body, method = "POST") {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${pfad}`, {
      method,
      headers: { ...authKopf(auth.token), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }

  // ── Sitzung speichern/lesen ──
  function sitzungSpeichern() {
    const sess = {
      access_token: auth.token, refresh_token: auth.refresh,
      user_id: auth.user && auth.user.id, email: auth.user && auth.user.email,
      zuletzt: Date.now(),
    };
    try { sessionStorage.setItem(SITZUNG_SCHLUESSEL, JSON.stringify(sess)); } catch { /* ignorieren */ }
  }
  function aktivitaet() {
    try {
      const roh = sessionStorage.getItem(SITZUNG_SCHLUESSEL);
      if (!roh) return;
      const s = JSON.parse(roh);
      s.zuletzt = Date.now();
      sessionStorage.setItem(SITZUNG_SCHLUESSEL, JSON.stringify(s));
    } catch { /* ignorieren */ }
  }
  function abmelden(grund) {
    try { sessionStorage.removeItem(SITZUNG_SCHLUESSEL); } catch { /* ignorieren */ }
    if (auth.token) { authMit("logout", {}).catch(() => {}); }
    auth.token = null; auth.user = null;
    if (inaktivTimer) { clearInterval(inaktivTimer); inaktivTimer = null; }
    zeigeAnsicht("ansicht-login");
    if (grund) fehler(grund);
  }
  function inaktivitaetsWache() {
    if (inaktivTimer) clearInterval(inaktivTimer);
    inaktivTimer = setInterval(() => {
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem(SITZUNG_SCHLUESSEL) || "null"); } catch { s = null; }
      if (!sitzungGueltig(s)) abmelden("Aus Sicherheitsgründen abgemeldet (Inaktivität oder abgelaufen).");
    }, 30 * 1000);
  }

  // ── Anmeldung ──
  async function anmelden() {
    const email = $("login-email").value.trim();
    const pw = $("login-pw").value;
    $("login-fehler").textContent = "";
    if (!email || !pw) { $("login-fehler").textContent = "Bitte E-Mail und Passwort eingeben."; return; }
    $("btn-login").disabled = true;
    try {
      const { ok, d } = await auth1("token?grant_type=password", { email, password: pw });
      if (!ok || !d.access_token) {
        // Neutral: nicht verraten, ob das Konto existiert.
        $("login-fehler").textContent = "Kein Zugang.";
        return;
      }
      auth.token = d.access_token; auth.refresh = d.refresh_token; auth.user = d.user;
      // Serverseitig prüfen: ist_vexfit_admin() muss true sein.
      const istAdmin = await pruefeAdmin();
      if (!istAdmin) { auth.token = null; abmelden(); $("login-fehler").textContent = "Kein Zugang."; return; }
      await nachAnmeldungMfa(d.user);
    } catch {
      $("login-fehler").textContent = "Verbindungsfehler. Bitte erneut versuchen.";
    } finally {
      $("btn-login").disabled = false;
    }
  }

  async function pruefeAdmin() {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ist_vexfit_admin`, {
        method: "POST", headers: { ...authKopf(auth.token), "Content-Type": "application/json" }, body: "{}",
      });
      if (!r.ok) return auth.user && auth.user.id === ADMIN_ID; // Rückfall auf die ID-Prüfung
      const v = await r.json().catch(() => null);
      return v === true;
    } catch {
      return auth.user && auth.user.id === ADMIN_ID;
    }
  }

  // Nach erfolgreichem Passwort-Login: zweiten Faktor einrichten oder abfragen.
  async function nachAnmeldungMfa(user) {
    const factors = (user && Array.isArray(user.factors)) ? user.factors : [];
    const totp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");
    if (totp) {
      auth.factorId = totp.id;
      const { ok, d } = await authMit(`factors/${totp.id}/challenge`, {});
      if (!ok || !d.id) { fehler("Zweiter Faktor konnte nicht gestartet werden."); return; }
      auth.challengeId = d.id;
      zeigeAnsicht("ansicht-mfa-code");
      setTimeout(() => $("mfa-code").focus(), 60);
    } else {
      await mfaEinrichten();
    }
  }

  async function mfaEinrichten() {
    const { ok, d } = await authMit("factors", { factor_type: "totp", friendly_name: "Vexfit Verwaltung" });
    if (!ok || !d.id || !d.totp) { fehler("Einrichtung des zweiten Faktors fehlgeschlagen."); return; }
    auth.factorId = d.id;
    $("mfa-qr").src = qrAlsDatenUri(d.totp.qr_code);
    $("mfa-secret").textContent = d.totp.secret || "";
    zeigeAnsicht("ansicht-mfa-setup");
    setTimeout(() => $("mfa-setup-code").focus(), 60);
  }

  async function mfaBestaetigen(codeFeldId, fehlerFeldId) {
    const code = $(codeFeldId).value.replace(/\s/g, "");
    $(fehlerFeldId).textContent = "";
    if (!/^\d{6}$/.test(code)) { $(fehlerFeldId).textContent = "Bitte den 6-stelligen Code eingeben."; return; }
    // Bei der Einrichtung braucht es erst eine Challenge.
    if (!auth.challengeId) {
      const ch = await authMit(`factors/${auth.factorId}/challenge`, {});
      if (!ch.ok || !ch.d.id) { $(fehlerFeldId).textContent = "Konnte nicht bestätigen. Bitte erneut."; return; }
      auth.challengeId = ch.d.id;
    }
    const { ok, d } = await authMit(`factors/${auth.factorId}/verify`, { challenge_id: auth.challengeId, code });
    auth.challengeId = null;
    if (!ok || !d.access_token) { $(fehlerFeldId).textContent = "Code falsch oder abgelaufen. Bitte erneut."; return; }
    auth.token = d.access_token; auth.refresh = d.refresh_token || auth.refresh;
    if (aalAusToken(auth.token) !== "aal2") { $(fehlerFeldId).textContent = "Zweiter Faktor nicht bestätigt."; return; }
    sitzungSpeichern();
    starteDashboard();
  }

  // ── Dashboard-Start ──
  function starteDashboard() {
    zeigeAnsicht("ansicht-dashboard");
    inaktivitaetsWache();
    ladeDaten();
    // Teil A: Push-Bereich vorbereiten (Status + Geräteliste).
    pushInit();
  }

  // ── Datenabruf ──
  async function hole(pfad, extra) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, { headers: { ...authKopf(auth.token), ...(extra || {}) } });
    if (r.status === 401 || r.status === 403) { abmelden("Sitzung abgelaufen. Bitte neu anmelden."); throw new Error("abgemeldet"); }
    return r;
  }
  async function zaehle(pfad) {
    try {
      const r = await hole(`${pfad}&limit=1`, { Prefer: "count=exact" });
      if (!r.ok) return null;
      const cr = r.headers.get("content-range");
      const n = cr && cr.includes("/") ? cr.split("/")[1] : null;
      return (!n || n === "*") ? null : parseInt(n, 10);
    } catch { return null; }
  }

  async function ladeDaten() {
    try {
      const [trRes, kuRes] = await Promise.all([
        hole("trainers?select=*&order=created_at.desc"),
        hole("kunden?select=*&order=created_at.desc"),
      ]);
      if (!trRes.ok) throw new Error("Trainer laden: HTTP " + trRes.status);
      if (!kuRes.ok) throw new Error("Kunden laden: HTTP " + kuRes.status);
      daten.trainers = await trRes.json();
      daten.kunden = await kuRes.json();
      $("zuletzt").textContent = "Aktualisiert: " + new Date().toLocaleTimeString("de-AT");
      renderStats();
      renderFreigabe();
      renderTrainer();
      renderKunden();
      ladeAnfragen();
      ladeZahlungslinkOffen();
      ladeZahlungen();
      ladeZertifikate();
      ladeStudios();
      ladeNachfrage();
      ladeProtokoll();
      // Teil M: Deep-Link aus der Benachrichtigungs-Mail (#trainer-/#kunde-/
      // #anfrage-<id>) nach dem ersten Laden genau einmal anspringen.
      if (!hashSprungGemacht) { hashSprungGemacht = true; springeZuHash(); }
    } catch (e) {
      if (String(e && e.message) !== "abgemeldet") fehler("Daten konnten nicht geladen werden: " + (e && e.message ? e.message : e));
    }
  }

  // ── Kennzahlen ──
  async function renderStats() {
    const tr = sichtbar(daten.trainers, zustand.testsAusTrainer);
    const ku = sichtbar(daten.kunden, zustand.testsAusKunden);
    const warten = tr.filter((t) => !t.aktiv).length;
    const aktiv = tr.filter((t) => t.aktiv && !t.gesperrt).length;
    const gesperrt = tr.filter((t) => t.gesperrt).length;
    const bezahlt = tr.filter((t) => t.stripe_bezahlt).length;
    const sieben = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const neu7 = tr.filter((t) => t.created_at && t.created_at >= sieben).length;
    const eur = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
    const [gesamt, ang, abg] = await Promise.all([
      zaehle("anfragen?select=id"),
      zaehle("anfragen?select=id&status=eq.angenommen"),
      zaehle("anfragen?select=id&status=eq.abgelehnt"),
    ]);
    const offen = (gesamt != null && ang != null && abg != null) ? gesamt - ang - abg : null;
    const karten = [
      { label: "Trainer gesamt", wert: tr.length, sub: `${neu7} neu (7 Tage)`, tab: "trainer" },
      { label: "Wartet auf Freigabe", wert: warten, sub: "", tab: "trainer", filter: "warten" },
      { label: "Aktiv", wert: aktiv, sub: `${gesperrt} gesperrt`, tab: "trainer", filter: "aktiv" },
      { label: "Kunden gesamt", wert: ku.length, sub: "", tab: "kunden" },
      { label: "Anfragen offen", wert: offen == null ? "–" : offen, sub: `${gesamt == null ? "–" : gesamt} gesamt`, tab: "anfragen" },
      { label: "Angenommen", wert: ang == null ? "–" : ang, sub: `${abg == null ? "–" : abg} abgelehnt`, tab: "anfragen" },
      { label: "Bezahlt", wert: bezahlt, sub: eur.format(bezahlt * 49.99) + "/Mo", tab: "zahlungen" },
      { label: "Wartet auf Freigabe", wert: warten, sub: "zur Freigabe", tab: "uebersicht" },
    ];
    $("stats").innerHTML = karten.map((k) =>
      `<div class="stat-card" data-aktion="stat" data-tab="${escapeHtml(k.tab)}" data-filter="${escapeHtml(k.filter || "")}">
        <div class="stat-label">${escapeHtml(k.label)}</div>
        <div class="stat-value">${escapeHtml(k.wert)}</div>
        <div class="stat-sub">${escapeHtml(k.sub)}</div>
      </div>`
    ).join("");
  }

  function renderFreigabe() {
    const tb = $("freigabe-tbody");
    const neue = sichtbar(daten.trainers, zustand.testsAusTrainer).filter((t) => !t.aktiv);
    if (!neue.length) { tb.innerHTML = '<tr><td colspan="4" class="leer-text">Keine Trainer warten auf Freigabe.</td></tr>'; return; }
    tb.innerHTML = neue.map((t) => {
      const fehlt = fehlendeProfilfelder(t);
      const voll = PROFIL_FELDER_GESAMT - fehlt.length;
      const farbe = fehlt.length === 0 ? "#4ade80" : (voll >= 4 ? "var(--accent)" : "#ff6b6b");
      return `<tr class="klickbar" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
        <td data-label="Name"><strong>${escapeHtml(t.vorname)} ${escapeHtml(t.nachname)}</strong><br><span style="color:var(--text-muted);font-size:11px">${escapeHtml(t.email)}</span></td>
        <td data-label="Vollständigkeit"><span style="color:${farbe};font-weight:700">${voll}/${PROFIL_FELDER_GESAMT}</span> <span style="color:var(--text-muted);font-size:11px">${fehlt.length ? "fehlt: " + escapeHtml(fehlt.join(", ")) : "vollständig"}</span></td>
        <td data-label="Registriert">${t.created_at ? new Date(t.created_at).toLocaleDateString("de-AT") : "–"}</td>
        <td data-label=""><button class="btn-klein" data-aktion="freigeben" data-id="${escapeHtml(t.id)}">Freigeben</button></td>
      </tr>`;
    }).join("");
  }

  function aktuelleTrainerliste() {
    let liste = sichtbar(daten.trainers, zustand.testsAusTrainer);
    liste = trainerFiltern(liste, { q: $("trainer-suche").value, status: $("trainer-filter").value });
    return sortieren(liste, zustand.trainerSort.feld, zustand.trainerSort.ab);
  }
  function aktuelleKundenliste() {
    let liste = sichtbar(daten.kunden, zustand.testsAusKunden);
    liste = kundenFiltern(liste, $("kunden-suche").value);
    return sortieren(liste, zustand.kundenSort.feld, zustand.kundenSort.ab);
  }

  function renderTrainer() {
    const tb = $("trainer-tbody");
    const liste = aktuelleTrainerliste();
    if (!liste.length) { tb.innerHTML = '<tr><td colspan="8" class="leer-text">Keine Treffer.</td></tr>'; return; }
    tb.innerHTML = liste.map((t) => {
      const voll = PROFIL_FELDER_GESAMT - fehlendeProfilfelder(t).length;
      return `<tr class="klickbar" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
        <td data-label="Name"><strong>${escapeHtml(t.vorname)} ${escapeHtml(t.nachname)}</strong></td>
        <td data-label="E-Mail">${escapeHtml(t.email)}</td>
        <td data-label="Telefon">${t.telefon ? escapeHtml(t.telefon) : "–"}</td>
        <td data-label="Stadt">${escapeHtml(t.stadt) || "–"}</td>
        <td data-label="Vollst.">${voll}/${PROFIL_FELDER_GESAMT}</td>
        <td data-label="Bezahlt"><span class="badge ${t.stripe_bezahlt ? "badge-paid" : "badge-unpaid"}">${t.stripe_bezahlt ? "Ja" : "Nein"}</span></td>
        <td data-label="Status"><span class="badge ${t.aktiv ? "badge-active" : "badge-grau"}">${t.aktiv ? "Aktiv" : "Inaktiv"}</span>${t.gesperrt ? ' <span class="badge badge-abg">Gesperrt</span>' : ""}${t.studio_standort_id ? ' <span class="badge badge-grau">Studio</span>' : ""}</td>
        <td data-label="Registriert">${t.created_at ? new Date(t.created_at).toLocaleDateString("de-AT") : "–"}</td>
      </tr>`;
    }).join("");
  }

  function renderKunden() {
    const tb = $("kunden-tbody");
    const liste = aktuelleKundenliste();
    if (!liste.length) { tb.innerHTML = '<tr><td colspan="6" class="leer-text">Keine Treffer.</td></tr>'; return; }
    tb.innerHTML = liste.map((k) =>
      `<tr class="klickbar" data-aktion="detail" data-art="kunde" data-id="${escapeHtml(k.id)}">
        <td data-label="Name"><strong>${escapeHtml(k.vorname)} ${escapeHtml(k.nachname)}</strong>${k.gesperrt ? ' <span class="badge badge-abg">Gesperrt</span>' : ""}</td>
        <td data-label="E-Mail">${escapeHtml(k.email)}</td>
        <td data-label="Telefon">${k.telefon ? escapeHtml(k.telefon) : "–"}</td>
        <td data-label="Stadt">${escapeHtml(k.stadt) || "–"}</td>
        <td data-label="Ziel">${escapeHtml(k.ziel) || "–"}</td>
        <td data-label="Registriert">${k.created_at ? new Date(k.created_at).toLocaleDateString("de-AT") : "–"}</td>
      </tr>`
    ).join("");
  }

  async function ladeAnfragen() {
    const tb = $("anfragen-tbody");
    try {
      const r = await hole("anfragen?select=created_at,trainer_id,trainer_name,kunden_name,status,weitergeleitet&order=created_at.desc&limit=100");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const rows = await r.json();
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="leer-text">Noch keine Anfragen.</td></tr>'; return; }
      tb.innerHTML = rows.map((a) => {
        const z = anfrageZustand(a);
        const b = z === "angenommen" ? '<span class="badge badge-ang">Angenommen</span>' : z === "abgelehnt" ? '<span class="badge badge-abg">Abgelehnt</span>' : '<span class="badge badge-offen">Offen</span>';
        const std = unbeantwortetSeitStunden(a);
        return `<tr>
          <td data-label="Datum">${a.created_at ? new Date(a.created_at).toLocaleDateString("de-AT") : "–"}</td>
          <td data-label="Trainer">${escapeHtml(a.trainer_name) || "–"}</td>
          <td data-label="Kunde">${escapeHtml(a.kunden_name) || "–"}</td>
          <td data-label="Status">${b}</td>
          <td data-label="Unbeantwortet seit">${std == null ? "–" : std + " h"}</td>
          <td data-label="Weitergeleitet">${a.weitergeleitet ? '<span class="badge badge-paid">Ja</span>' : '<span class="badge badge-grau">Nein</span>'}</td>
        </tr>`;
      }).join("");
    } catch { tb.innerHTML = '<tr><td colspan="6" class="leer-text">Anfragen konnten nicht geladen werden.</td></tr>'; }
  }

  async function ladeZahlungslinkOffen() {
    const tb = $("zahlungslink-tbody");
    try {
      const r = await hole("anfragen?status=eq.angenommen&select=trainer_id");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const rows = await r.json();
      const mitAng = new Set(rows.map((x) => x.trainer_id).filter(Boolean));
      const liste = sichtbar(daten.trainers, zustand.testsAusTrainer).filter((t) => t.aktiv && !t.stripe_bezahlt && mitAng.has(t.id));
      if (!liste.length) { tb.innerHTML = '<tr><td colspan="4" class="leer-text">Kein offener Zahlungslink.</td></tr>'; return; }
      tb.innerHTML = liste.map((t) => {
        // Stripe-Zahlungslink mit client_reference_id (Zuordnung in Stripe) und
        // vorausgefüllter E-Mail – wie bisher, zum Kopieren/Schicken.
        const link = `${STRIPE_ERSTE}?client_reference_id=${encodeURIComponent(t.id)}&prefilled_email=${encodeURIComponent(t.email || "")}`;
        return `<tr class="klickbar" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
          <td><strong>${escapeHtml(t.vorname)} ${escapeHtml(t.nachname)}</strong></td>
          <td>${escapeHtml(t.email)}</td><td>${escapeHtml(t.stadt) || "–"}</td>
          <td><button class="btn-klein" data-aktion="kopieren" data-text="${escapeHtml(link)}">Zahlungslink kopieren</button></td>
        </tr>`;
      }).join("");
    } catch { tb.innerHTML = '<tr><td colspan="4" class="leer-text">Konnte nicht geladen werden.</td></tr>'; }
  }

  async function ladeZahlungen() {
    const tb = $("zahlungen-tbody");
    const hinweis = "Zugriff auf Zahlungsereignisse ist noch nicht freigeschaltet (Migration admin-stripe-events-lesen nicht eingespielt).";
    try {
      const r = await hole("stripe_events_verarbeitet?select=event_id,typ,verarbeitet_am&order=verarbeitet_am.desc&limit=20");
      if (!r.ok) { tb.innerHTML = `<tr><td colspan="3" class="leer-text">${escapeHtml(hinweis)}</td></tr>`; return; }
      const rows = await r.json();
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="3" class="leer-text">Noch keine Zahlungsereignisse.</td></tr>'; return; }
      tb.innerHTML = rows.map((e) =>
        `<tr><td>${e.verarbeitet_am ? new Date(e.verarbeitet_am).toLocaleString("de-AT") : "–"}</td>
          <td>${escapeHtml(e.typ) || "–"}</td>
          <td style="font-family:monospace;font-size:11px;word-break:break-all">${escapeHtml(e.event_id) || "–"}</td></tr>`
      ).join("");
    } catch { tb.innerHTML = `<tr><td colspan="3" class="leer-text">${escapeHtml(hinweis)}</td></tr>`; }
  }

  function ladeZertifikate() {
    const tb = $("zertifikate-tbody");
    const liste = sichtbar(daten.trainers, zustand.testsAusTrainer).filter((t) => t.zertifikat_datei);
    if (!liste.length) { tb.innerHTML = '<tr><td colspan="5" class="leer-text">Noch keine Zertifikate.</td></tr>'; return; }
    tb.innerHTML = liste.map((t) =>
      `<tr class="klickbar" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
        <td><strong>${escapeHtml(t.vorname)} ${escapeHtml(t.nachname)}</strong></td>
        <td>${escapeHtml(t.stadt) || "–"}</td>
        <td><button class="btn-klein" data-aktion="zertifikat" data-pfad="${escapeHtml(t.zertifikat_datei)}">Ansehen</button></td>
        <td>${t.verifiziert ? '<span class="badge badge-paid">Verifiziert</span>' : '<span class="badge badge-unpaid">offen</span>'}</td>
        <td>${t.verifiziert
          ? `<button class="btn-klein" data-aktion="entverifizieren" data-id="${escapeHtml(t.id)}">Zurücknehmen</button>`
          : `<button class="btn-klein" data-aktion="verifizieren" data-id="${escapeHtml(t.id)}">Verifizieren</button>`}</td>
      </tr>`
    ).join("");
  }

  async function ladeNachfrage() {
    const tb = $("nachfrage-tbody"), zb = $("ziele-tbody");
    const hinweis = "Die Nachfrage-Übersicht braucht die Tabellen such_eingaben und warteliste.";
    const zeige = (t) => { tb.innerHTML = `<tr><td colspan="4" class="leer-text">${escapeHtml(t)}</td></tr>`; zb.innerHTML = `<tr><td colspan="2" class="leer-text">${escapeHtml(t)}</td></tr>`; };
    try {
      const [seR, wlR] = await Promise.all([
        hole("such_eingaben?select=plz,spezialisierungen&limit=5000"),
        hole("warteliste?select=plz,stadt&limit=5000"),
      ]);
      if (!seR.ok || !wlR.ok) { zeige(hinweis); return; }
      const suchen = await seR.json(), vorm = await wlR.json();
      const orte = {};
      const slot = (p) => (orte[p] = orte[p] || { plz: p, stadt: "", suchen: 0, vorm: 0, trainer: 0 });
      for (const s of suchen) if (s.plz) slot(s.plz).suchen++;
      for (const v of vorm) if (v.plz) { const o = slot(v.plz); o.vorm++; if (!o.stadt && v.stadt) o.stadt = v.stadt; }
      const trProPlz = {}, stadtProPlz = {};
      for (const t of daten.trainers) if (t.plz) { trProPlz[t.plz] = (trProPlz[t.plz] || 0) + 1; if (t.stadt && !stadtProPlz[t.plz]) stadtProPlz[t.plz] = t.stadt; }
      for (const p in orte) { orte[p].trainer = trProPlz[p] || 0; if (!orte[p].stadt && stadtProPlz[p]) orte[p].stadt = stadtProPlz[p]; }
      const liste = Object.values(orte).sort((a, b) => (a.trainer === 0) !== (b.trainer === 0) ? (a.trainer === 0 ? -1 : 1) : (b.suchen + b.vorm) - (a.suchen + a.vorm));
      tb.innerHTML = liste.map((o) => {
        const ort = o.stadt ? `${escapeHtml(o.stadt)} (${escapeHtml(o.plz)})` : escapeHtml(o.plz);
        return `<tr><td><strong>${ort}</strong>${o.trainer === 0 ? ' <span class="badge badge-unpaid">Kein Trainer</span>' : ""}</td><td>${o.suchen}</td><td>${o.vorm}</td><td>${o.trainer}</td></tr>`;
      }).join("") || '<tr><td colspan="4" class="leer-text">Noch keine Suchen erfasst.</td></tr>';
      const zz = {};
      for (const s of suchen) for (const z of (Array.isArray(s.spezialisierungen) ? s.spezialisierungen : [])) if (z) zz[z] = (zz[z] || 0) + 1;
      const ziele = Object.entries(zz).sort((a, b) => b[1] - a[1]);
      zb.innerHTML = ziele.map(([z, n]) => `<tr><td><strong>${escapeHtml(z)}</strong></td><td>${n}</td></tr>`).join("") || '<tr><td colspan="2" class="leer-text">Noch keine Ziele.</td></tr>';
    } catch { zeige(hinweis); }
  }

  async function ladeProtokoll() {
    const tb = $("protokoll-tbody");
    const hinweis = "Protokoll noch nicht verfügbar (Migration admin-sperren-protokoll nicht eingespielt).";
    try {
      const r = await hole("admin_protokoll?select=zeitpunkt,aktion,ziel_tabelle,ziel_id,ergebnis&order=zeitpunkt.desc&limit=50");
      if (!r.ok) { tb.innerHTML = `<tr><td colspan="4" class="leer-text">${escapeHtml(hinweis)}</td></tr>`; return; }
      const rows = await r.json();
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="4" class="leer-text">Noch keine Aktionen protokolliert.</td></tr>'; return; }
      tb.innerHTML = rows.map((e) =>
        `<tr><td>${e.zeitpunkt ? new Date(e.zeitpunkt).toLocaleString("de-AT") : "–"}</td>
          <td>${escapeHtml(e.aktion)}</td>
          <td>${escapeHtml(e.ziel_tabelle) || "–"} ${escapeHtml((e.ziel_id || "").slice(0, 8))}</td>
          <td style="font-size:11px;color:var(--text-muted)">${escapeHtml(e.ergebnis) || "–"}</td></tr>`
      ).join("");
    } catch { tb.innerHTML = `<tr><td colspan="4" class="leer-text">${escapeHtml(hinweis)}</td></tr>`; }
  }

  // ── Detailansicht ──
  function df(label, wert, fehltMarke) {
    const leer = wert === null || wert === undefined || wert === "" || (Array.isArray(wert) && wert.length === 0);
    const inhalt = leer
      ? `<span class="feld-wert ${fehltMarke ? "feld-fehlt" : ""}" style="color:var(--text-muted)">${fehltMarke ? "fehlt" : "—"}</span>`
      : `<div class="feld-wert">${wert}</div>`;
    return `<div class="feld"><div class="feld-label">${escapeHtml(label)}</div>${inhalt}</div>`;
  }
  function detailOeffnen(titel, body, foot) {
    $("detail-titel").textContent = titel;
    $("detail-body").innerHTML = body;
    $("detail-foot").innerHTML = foot || "";
    $("detail-overlay").classList.remove("verborgen");
    $("detail-panel").classList.remove("verborgen");
  }
  function detailSchliessen() {
    $("detail-overlay").classList.add("verborgen");
    $("detail-panel").classList.add("verborgen");
  }

  function trainerDetail(id) {
    const t = daten.trainers.find((x) => String(x.id) === String(id));
    if (!t) { fehler("Trainer nicht gefunden. Bitte neu laden."); return; }
    const foto = avatarVorhanden(t.avatar_url) ? t.avatar_url : null;
    const fehlt = fehlendeProfilfelder(t);
    const mailStatus = freischaltMailStatus(t);
    const spez = Array.isArray(t.spezialisierungen) && t.spezialisierungen.length
      ? `<div class="chiprow">${t.spezialisierungen.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</div>` : "";
    const orte = Array.isArray(t.trainingsorte) ? t.trainingsorte.map((o) => ORT_TEXT[o] || o).map(escapeHtml).join(", ") : "";
    const fotoHtml = foto
      ? `<img src="${escapeHtml(foto)}" alt="" style="width:110px;height:110px;border-radius:8px;object-fit:cover;border:1px solid var(--border)">`
      : `<div style="width:110px;height:110px;border-radius:8px;background:var(--mid);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px">Kein Foto</div>`;
    const vollTxt = fehlt.length === 0
      ? `<span style="color:#4ade80;font-weight:700">vollständig (${PROFIL_FELDER_GESAMT}/${PROFIL_FELDER_GESAMT})</span>`
      : `<span style="color:#ff8a8a;font-weight:700">${PROFIL_FELDER_GESAMT - fehlt.length}/${PROFIL_FELDER_GESAMT}</span> <span style="color:var(--text-muted)">– fehlt: ${escapeHtml(fehlt.join(", "))}</span>`;
    const statusB = [
      `<span class="badge ${t.aktiv ? "badge-active" : "badge-unpaid"}">${t.aktiv ? "Aktiv (in Suche)" : "Inaktiv"}</span>`,
      `<span class="badge ${t.stripe_bezahlt ? "badge-paid" : "badge-unpaid"}">${t.stripe_bezahlt ? "Bezahlt" : "Nicht bezahlt"}</span>`,
      t.gesperrt ? '<span class="badge badge-abg">Gesperrt</span>' : "",
      t.verifiziert ? '<span class="badge badge-paid">Zertifikat verifiziert</span>' : "",
      t.studio_standort_id ? '<span class="badge badge-grau">Studio-Trainer</span>' : "",
    ].join("");
    const body = `
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">${fotoHtml}
        <div><div style="font-size:20px;font-weight:700">${escapeHtml(t.vorname)} ${escapeHtml(t.nachname)}</div>
          <div style="color:var(--text-muted);font-size:13px">${escapeHtml(t.email) || "—"}</div>
          <div class="chiprow" style="margin-top:8px">${statusB}</div></div></div>
      ${df("Profil-Vollständigkeit", vollTxt)}
      ${df("Telefon", escapeHtml(t.telefon || ""), fehlt.includes("Telefon"))}
      ${df("PLZ / Stadt", [t.plz, t.stadt].filter(Boolean).map(escapeHtml).join(" · "))}
      ${df("Trainingsart", escapeHtml(t.trainingsart || ""), fehlt.includes("Trainingsart"))}
      ${df("Trainingsort", escapeHtml(ORT_TEXT[t.trainingsort] || t.trainingsort || ""), fehlt.includes("Trainingsort"))}
      ${orte ? df("Weitere Trainingsorte", orte) : ""}
      ${df("Preis pro Stunde", t.preis_stunde ? "€" + escapeHtml(t.preis_stunde) : "", fehlt.includes("Preis pro Stunde"))}
      ${t.preis_monat ? df("Preis pro Monat", "€" + escapeHtml(t.preis_monat)) : ""}
      ${df("Erfahrung", escapeHtml(t.erfahrung || ""), fehlt.includes("Erfahrung"))}
      ${df("Über mich", escapeHtml(t.bio || ""), fehlt.includes("Über mich"))}
      ${df("Spezialisierungen", spez, fehlt.includes("Spezialisierungen"))}
      ${Array.isArray(t.sprachen) && t.sprachen.length ? df("Sprachen", t.sprachen.map(escapeHtml).join(", ")) : ""}
      ${t.video_url ? df("Video", escapeHtml(t.video_url)) : ""}
      ${Array.isArray(t.verfuegbarkeit) && t.verfuegbarkeit.length ? df("Verfügbarkeit", t.verfuegbarkeit.map(escapeHtml).join(", ")) : ""}
      ${t.zertifikat_datei ? df("Zertifikat", `<button class="btn-gross btn-neutral" style="padding:7px 12px" data-aktion="zertifikat" data-pfad="${escapeHtml(t.zertifikat_datei)}">Zertifikat ansehen</button>`) : ""}
      ${df("Profilstärke", profilStaerke(t) + " %")}
      ${df("Freischalt-Mail", mailStatus.gesendet
        ? (mailStatus.datum ? "gesendet am " + mailStatus.datum.toLocaleString("de-AT") : "gesendet")
        : '<span style="color:var(--text-muted)">noch nicht gesendet</span>')}
      ${df("Registriert am", t.created_at ? new Date(t.created_at).toLocaleString("de-AT") : "")}
      <div class="feld"><div class="feld-label">Anfragen</div><div id="detail-anfragen" class="feld-wert" style="color:var(--text-muted)">Lade …</div></div>`;
    const freigabe = !t.aktiv
      ? `<button class="btn-gross btn-ja" data-aktion="freigeben" data-id="${escapeHtml(t.id)}">Freigeben</button>`
      : `<button class="btn-gross btn-warn" data-aktion="freigabe-zurueck" data-id="${escapeHtml(t.id)}">Freigabe zurücknehmen</button>`;
    const hinweis = (!t.aktiv && fehlt.length > 0)
      ? `<div style="flex-basis:100%;font-size:12px;color:var(--text-muted)">Hinweis: unvollständiges Profil – Freigeben ist trotzdem möglich, du entscheidest.</div>` : "";
    const freischaltKnopf = (t.aktiv && !mailStatus.gesendet)
      ? `<button class="btn-gross btn-neutral" data-aktion="freischalt-mail" data-id="${escapeHtml(t.id)}">Freischalt-Mail senden</button>` : "";
    const foot = `${freigabe}${hinweis}${freischaltKnopf}
      ${t.verifiziert ? `<button class="btn-gross btn-neutral" data-aktion="entverifizieren" data-id="${escapeHtml(t.id)}">Verifizierung zurück</button>` : `<button class="btn-gross btn-neutral" data-aktion="verifizieren" data-id="${escapeHtml(t.id)}">Verifizieren</button>`}
      <button class="btn-gross btn-warn" data-aktion="sperren" data-art="trainer" data-id="${escapeHtml(t.id)}">${t.gesperrt ? "Entsperren" : "Sperren (Login)"}</button>
      <button class="btn-gross btn-gefahr" data-aktion="kicken" data-art="trainer" data-id="${escapeHtml(t.id)}">Kicken</button>`;
    detailOeffnen(`${t.vorname || ""} ${t.nachname || ""}`.trim() || "Trainer", body, foot);
    ladeDetailAnfragen("trainer_id=eq." + encodeURIComponent(t.id), "an ", "kunden_name");
  }

  function kundeDetail(id) {
    const k = daten.kunden.find((x) => String(x.id) === String(id));
    if (!k) { fehler("Kunde nicht gefunden. Bitte neu laden."); return; }
    const LABEL = { telefon: "Telefon", plz: "PLZ", stadt: "Stadt", ziel: "Ziele", nachricht: "Nachricht", erwartungen: "Antworten aus dem Einstieg", land: "Land" };
    const VERBERGEN = new Set(["id", "user_id", "vorname", "nachname", "email", "created_at", "gesperrt"]);
    let body = `<div style="margin-bottom:16px"><div style="font-size:20px;font-weight:700">${escapeHtml(k.vorname)} ${escapeHtml(k.nachname)}</div>
      <div style="color:var(--text-muted);font-size:13px">${escapeHtml(k.email) || "—"}</div>
      ${k.gesperrt ? '<div class="chiprow" style="margin-top:8px"><span class="badge badge-abg">Gesperrt</span></div>' : ""}</div>`;
    for (const key of ["telefon", "plz", "stadt", "ziel", "erwartungen", "nachricht", "land"]) {
      if (key in k && k[key] !== null && k[key] !== "") body += df(LABEL[key], escapeHtml(Array.isArray(k[key]) ? k[key].join(", ") : String(k[key])));
    }
    for (const key of Object.keys(k)) {
      if (VERBERGEN.has(key) || LABEL[key]) continue;
      const v = k[key];
      if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      body += df(key, escapeHtml(Array.isArray(v) ? v.join(", ") : String(v)));
    }
    body += df("Registriert am", k.created_at ? new Date(k.created_at).toLocaleString("de-AT") : "");
    body += `<div class="feld"><div class="feld-label">Gestellte Anfragen</div><div id="detail-anfragen" class="feld-wert" style="color:var(--text-muted)">Lade …</div></div>`;
    const foot = `<button class="btn-gross btn-warn" data-aktion="sperren" data-art="kunde" data-id="${escapeHtml(k.id)}">${k.gesperrt ? "Entsperren" : "Sperren (Login)"}</button>
      <button class="btn-gross btn-gefahr" data-aktion="kicken" data-art="kunde" data-id="${escapeHtml(k.id)}">Kicken</button>`;
    detailOeffnen(`${k.vorname || ""} ${k.nachname || ""}`.trim() || "Kunde", body, foot);
    const name = `${k.vorname || ""} ${k.nachname || ""}`.trim();
    if (name) ladeDetailAnfragen("kunden_name=eq." + encodeURIComponent(name), "an ", "trainer_name");
    else { const z = $("detail-anfragen"); if (z) z.textContent = "Kein Name – nicht zuordenbar."; }
  }

  async function ladeDetailAnfragen(filter, prefix, gegenseite) {
    const ziel = $("detail-anfragen");
    if (!ziel) return;
    try {
      const r = await hole(`anfragen?${filter}&select=id,trainer_name,kunden_name,status,created_at,ziel&order=created_at.desc`);
      if (!r.ok) { ziel.textContent = "Anfragen konnten nicht geladen werden (" + r.status + ")."; return; }
      const rows = await r.json();
      if (!rows.length) { ziel.textContent = "Keine Anfragen."; return; }
      ziel.style.color = "var(--white)";
      ziel.innerHTML = rows.map((a) => {
        const z = anfrageZustand(a);
        const farbe = z === "angenommen" ? "#4ade80" : z === "abgelehnt" ? "#ff6b6b" : "var(--accent)";
        return `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:${farbe};font-weight:700;text-transform:capitalize">${z}</span> · ${escapeHtml(prefix)}${escapeHtml(a[gegenseite]) || "—"} ${a.ziel ? "· " + escapeHtml(a.ziel) : ""} <span style="color:var(--text-muted);font-size:11px">${a.created_at ? new Date(a.created_at).toLocaleDateString("de-AT") : ""}</span></div>`;
      }).join("");
    } catch { ziel.textContent = "Anfragen konnten nicht geladen werden."; }
  }

  // ── Bestätigungsdialog (Promise<boolean>) ──
  function bestaetige(opt) {
    $("dialog-titel").textContent = opt.titel || "Bestätigen";
    $("dialog-text").textContent = opt.text || "";
    const ok = $("dialog-ok");
    ok.textContent = opt.okText || "Bestätigen";
    ok.className = "btn-gross " + (opt.okArt || "btn-ja");
    $("dialog-overlay").classList.remove("verborgen");
    $("dialog-box").classList.remove("verborgen");
    return new Promise((res) => { _dialogAufloesen = res; });
  }
  function dialogZu(wert) {
    $("dialog-overlay").classList.add("verborgen");
    $("dialog-box").classList.add("verborgen");
    if (_dialogAufloesen) { _dialogAufloesen(wert); _dialogAufloesen = null; }
  }

  // ── Formulardialog (Promise<obj|null>) ──
  function frageFormular(titel, felder) {
    const box = $("form-felder");
    $("form-titel").textContent = titel;
    box.innerHTML = "";
    for (const f of felder) {
      const w = document.createElement("div"); w.className = "feld";
      const l = document.createElement("div"); l.className = "feld-label"; l.textContent = f.label + (f.pflicht ? " *" : "");
      const i = document.createElement("input"); i.value = f.wert || ""; i.dataset.key = f.key;
      w.append(l, i); box.appendChild(w);
    }
    $("form-overlay").classList.remove("verborgen");
    $("form-box").classList.remove("verborgen");
    const erstes = box.querySelector("input"); if (erstes) setTimeout(() => erstes.focus(), 50);
    return new Promise((res) => { _formAufloesen = res; });
  }
  function formZu(wert) {
    $("form-overlay").classList.add("verborgen");
    $("form-box").classList.add("verborgen");
    if (_formAufloesen) { _formAufloesen(wert); _formAufloesen = null; }
  }

  // ── Admin-Aktionen über die Edge Function ──
  async function adminEdge(payload) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/vexfit-automation/admin-aktion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + auth.token },
        body: JSON.stringify(payload),
      });
      aktivitaet();
      if (r.status === 401) { abmelden("Sitzung abgelaufen. Bitte neu anmelden."); return null; }
      const d = await r.json().catch(() => null);
      if (!r.ok) { fehler(d && d.fehler ? d.fehler : "Aktion fehlgeschlagen (" + r.status + ")."); return null; }
      return d;
    } catch {
      fehler("Verbindungsfehler. Die Aktion wurde nicht ausgeführt.");
      return null;
    }
  }

  async function freigeben(id) {
    const t = daten.trainers.find((x) => String(x.id) === String(id));
    const d = await adminEdge({ aktion: "trainer_aktivieren", ziel_id: id });
    if (!d || !(d.geaendert > 0)) { fehler("Freigeben fehlgeschlagen."); return; }
    if (t) { t.aktiv = true; if (d.mail && d.mail.datum) t.freischalt_mail_gesendet = d.mail.datum; }
    freischaltMailMelden(id, d.mail, true);
    neuZeichnen(); ladeDaten();
  }

  // Meldung nach einem Versuch, die Freischalt-Mail zu senden. `beiFreigabe`
  // unterscheidet die Freigabe (Mailfehler ist kein Freigabe-Fehler) vom reinen
  // Senden. Bei einem Fehler bietet die Meldung "Mail erneut senden" an.
  function freischaltMailMelden(id, mail, beiFreigabe) {
    const m = mail || { gesendet: false, grund: "keine Rückmeldung" };
    const vorn = beiFreigabe ? "Freigegeben – " : "";
    if (m.gesendet) {
      erfolg(vorn + "E-Mail an den Trainer gesendet." + (m.sperre_fehlt ? " (Hinweis: Einmal-Sperre fehlt – Migration 2026-11-01-04 nicht eingespielt, erneutes Freigeben sendet erneut.)" : ""));
    } else if (m.schon) {
      erfolg(vorn + "E-Mail war bereits gesendet – kein zweiter Versand.");
    } else {
      meldung(vorn + "Mail konnte nicht gesendet werden: " + (m.grund || "unbekannter Grund"), "fehler",
        { text: "Mail erneut senden", fn: () => freischaltMailSenden(id) });
    }
  }

  // Einzelner Versand über den Knopf beim Trainer – mit einer Bestätigung.
  async function freischaltMailBestaetigen(id) {
    const t = daten.trainers.find((x) => String(x.id) === String(id));
    const name = t ? `${t.vorname || ""} ${t.nachname || ""}`.trim() : "";
    const ja = await bestaetige({
      titel: "Freischalt-Mail senden",
      text: `Die Mail „Dein Vexfit-Profil ist freigeschaltet" an ${name || "diesen Trainer"} (${t ? (t.email || "") : ""}) senden?`,
      okText: "Senden", okArt: "btn-ja",
    });
    if (!ja) return;
    await freischaltMailSenden(id);
  }

  async function freischaltMailSenden(id) {
    const d = await adminEdge({ aktion: "trainer_freischalt_mail", ziel_id: id });
    if (!d) return;
    const t = daten.trainers.find((x) => String(x.id) === String(id));
    if (t && d.mail && d.mail.datum) t.freischalt_mail_gesendet = d.mail.datum;
    freischaltMailMelden(id, d.mail, false);
    neuZeichnen(); ladeDaten();
  }
  async function freigabeZurueck(id) {
    const ja = await bestaetige({ titel: "Freigabe zurücknehmen", text: "Das Profil verschwindet aus der Suche, das Konto bleibt bestehen.", okText: "Zurücknehmen", okArt: "btn-warn" });
    if (!ja) return;
    const d = await adminEdge({ aktion: "trainer_sperren", ziel_id: id });
    if (d && d.geaendert > 0) { erfolg("Freigabe zurückgenommen."); ladeDaten(); } else fehler("Zurücknehmen fehlgeschlagen.");
  }
  async function verifizieren(id, an) {
    const d = await adminEdge({ aktion: an ? "trainer_verifizieren" : "trainer_entverifizieren", ziel_id: id });
    if (d && d.geaendert > 0) { erfolg(an ? "Zertifikat verifiziert." : "Verifizierung zurückgenommen."); ladeDaten(); } else fehler("Aktion fehlgeschlagen.");
  }
  async function sperren(art, id) {
    const liste = art === "trainer" ? daten.trainers : daten.kunden;
    const p = liste.find((x) => String(x.id) === String(id));
    const name = p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "";
    const ent = !!(p && p.gesperrt);
    const ja = await bestaetige({
      titel: ent ? "Sperre aufheben" : "Anmeldung sperren",
      text: ent ? `${name || "Diese Person"} wieder entsperren?` : `${name || "Diese Person"} sperren? Anmeldung nicht mehr möglich${art === "trainer" ? ", verschwindet aus der Suche" : ""}. Daten bleiben erhalten.`,
      okText: ent ? "Entsperren" : "Sperren", okArt: "btn-warn",
    });
    if (!ja) return;
    const d = await adminEdge({ aktion: ent ? "login_entsperren" : "login_sperren", art, ziel_id: id });
    if (!d || !d.ok) return;
    if (p) p.gesperrt = !ent;
    erfolg(ent ? "Entsperrt." : "Gesperrt.");
    detailSchliessen(); neuZeichnen(); ladeDaten();
  }

  // Teil 3: Kicken – EIN Bestätigungsdialog, kein Namen-Eintippen.
  async function kicken(art, id) {
    const liste = art === "trainer" ? daten.trainers : daten.kunden;
    const p = liste.find((x) => String(x.id) === String(id));
    const name = p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "";
    const email = p ? (p.email || "") : "";
    const ja = await bestaetige({
      titel: "Endgültig löschen",
      text: `${name || "Diese Person"} (${email}) endgültig löschen? Das kann nicht rückgängig gemacht werden.`,
      okText: "Ja, endgültig löschen", okArt: "btn-gefahr",
    });
    if (!ja) return;
    const d = await adminEdge({ aktion: "person_kicken", art, ziel_id: id, bestaetigt: true });
    if (!d || !d.ok) return;
    if (art === "trainer") daten.trainers = daten.trainers.filter((x) => String(x.id) !== String(id));
    else daten.kunden = daten.kunden.filter((x) => String(x.id) !== String(id));
    detailSchliessen();
    erfolg(`${name || "Person"} gelöscht (Anfragen ${d.anfragen ?? 0}, Konto ${d.konto ? "ja" : "nein"}).`);
    neuZeichnen(); ladeDaten();
  }

  function neuZeichnen() { renderStats(); renderFreigabe(); renderTrainer(); renderKunden(); ladeZertifikate(); }

  // ── Zertifikat (signierte Adresse) ──
  async function zertifikatOeffnen(pfad) {
    try {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/zertifikate/${pfad}`, {
        method: "POST", headers: { ...authKopf(auth.token), "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }),
      });
      if (!r.ok) { fehler("Zertifikat konnte nicht geöffnet werden (" + r.status + ")."); return; }
      const d = await r.json();
      globalThis.open(`${SUPABASE_URL}/storage/v1${d.signedURL}`, "_blank", "noopener");
    } catch { fehler("Zertifikat konnte nicht geöffnet werden."); }
  }

  // ── Studios ──
  async function studioRpc(name, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { ...authKopf(auth.token), "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    });
    return r;
  }
  let _studios = [];
  async function ladeStudios() {
    const el = $("studios-inhalt");
    try {
      const r = await studioRpc("studios_admin_liste", {});
      if (!r.ok) throw new Error("HTTP " + r.status);
      _studios = await r.json() || [];
      const o = location.origin.includes("localhost") || location.origin.includes("127.0.0.1") ? location.origin : "https://vexfit.app";
      const link = (label, url) => `<div style="margin-top:8px"><div style="font-size:11px;color:var(--text-muted)">${escapeHtml(label)}</div>
        <div style="display:flex;gap:6px;align-items:center"><input readonly value="${escapeHtml(url)}" style="flex:1;background:var(--black);border:1px solid var(--border);color:var(--white);padding:6px 8px;border-radius:3px;font-size:11px;font-family:monospace">
        <button class="btn-klein" data-aktion="kopieren" data-text="${escapeHtml(url)}">Kopieren</button></div></div>`;
      const adr = (st) => { const teile = [st.adresse, st.plz, st.stadt, st.land].filter(Boolean); return teile.length ? teile.map((t) => String(t).includes("HIER EINFÜGEN") ? `<span style="color:#ffaa00;font-weight:600">${escapeHtml(t)}</span>` : escapeHtml(t)).join(" · ") : '<span style="color:var(--text-muted)">Noch keine Adresse</span>'; };
      let html = "";
      for (const s of _studios) {
        html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:6px;padding:16px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><strong style="font-size:16px">${escapeHtml(s.name)}</strong>
          <label class="schalter"><input type="checkbox" ${s.veroeffentlicht ? "checked" : ""} data-aktion="studio-freigabe" data-id="${escapeHtml(s.id)}"> veröffentlicht</label></div>
          ${link("Vorschau-Link", `${o}/${s.slug}.html?vorschau=${s.vorschau_schluessel}`)}
          ${link("Übersicht (nur lesen)", `${o}/${s.slug}-uebersicht.html?schluessel=${s.uebersicht_schluessel}`)}
          <div style="margin-top:10px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Standorte</div>
          ${(s.standorte || []).map((st) => `<div style="border-top:1px solid var(--border);padding:10px 0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span><strong>${escapeHtml(st.name)}</strong> <span style="color:var(--text-muted);font-size:12px">· ${st.trainer_anzahl} Trainer</span></span>
            <button class="btn-klein" data-aktion="standort-bearbeiten" data-id="${escapeHtml(st.id)}">Adresse bearbeiten</button></div>
            <div style="font-size:12px;margin-top:4px">${adr(st)}</div>
            ${link("Trainer-Einladung", `${o}/registrieren.html?einladung=${st.einladungs_schluessel}`)}
            ${link("Kunden-Link (QR)", `${o}/${s.slug}.html?standort=${st.slug}`)}
            ${link("Aufsteller (Druck)", `${o}/${s.slug}-aufsteller.html?standort=${st.slug}`)}</div>`).join("")}
          <div style="margin-top:12px"><button class="btn-klein" data-aktion="standort-anlegen" data-id="${escapeHtml(s.id)}">+ Standort</button></div></div>`;
      }
      html += `<button class="btn-haupt" style="width:auto;padding:10px 18px" data-aktion="studio-anlegen">+ Neues Studio</button>`;
      el.innerHTML = html;
    } catch { el.innerHTML = '<div class="leer-text">Studios konnten nicht geladen werden.</div>'; }
  }

  // ── CSV-Export ──
  function csvDownload(dateiname, inhalt) {
    const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportiereTrainer() {
    const sp = [
      { key: "vorname", label: "Vorname" }, { key: "nachname", label: "Nachname" }, { key: "email", label: "E-Mail" },
      { key: "telefon", label: "Telefon" }, { key: "plz", label: "PLZ" }, { key: "stadt", label: "Stadt" },
      { key: "trainingsart", label: "Trainingsart" }, { label: "Preis/Stunde", wert: (t) => t.preis_stunde },
      { label: "Aktiv", wert: (t) => t.aktiv ? "ja" : "nein" }, { label: "Bezahlt", wert: (t) => t.stripe_bezahlt ? "ja" : "nein" },
      { label: "Gesperrt", wert: (t) => t.gesperrt ? "ja" : "nein" }, { label: "Vollst.", wert: (t) => (PROFIL_FELDER_GESAMT - fehlendeProfilfelder(t).length) + "/" + PROFIL_FELDER_GESAMT },
      { label: "Registriert", wert: (t) => t.created_at || "" },
    ];
    csvDownload("vexfit-trainer.csv", csvBauen(aktuelleTrainerliste(), sp));
  }
  function exportiereKunden() {
    const sp = [
      { key: "vorname", label: "Vorname" }, { key: "nachname", label: "Nachname" }, { key: "email", label: "E-Mail" },
      { key: "telefon", label: "Telefon" }, { key: "plz", label: "PLZ" }, { key: "stadt", label: "Stadt" },
      { key: "ziel", label: "Ziel" }, { label: "Gesperrt", wert: (k) => k.gesperrt ? "ja" : "nein" }, { label: "Registriert", wert: (k) => k.created_at || "" },
    ];
    csvDownload("vexfit-kunden.csv", csvBauen(aktuelleKundenliste(), sp));
  }

  // ── Reiter umschalten ──
  function zeigeTab(name) {
    for (const el of document.querySelectorAll(".tab-content")) el.classList.remove("active");
    for (const el of document.querySelectorAll(".tab")) el.classList.remove("active");
    const inhalt = $("tab-" + name); if (inhalt) inhalt.classList.add("active");
    const knopf = document.querySelector(`.tab[data-tab="${name}"]`); if (knopf) knopf.classList.add("active");
  }

  // Teil M: Deep-Link aus der Mail anspringen. #trainer-<id> / #kunde-<id>
  // öffnen den passenden Reiter und die Detailansicht des Datensatzes;
  // #anfrage-<id> bzw. #anfragen öffnen den Anfragen-Reiter.
  function springeZuHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    const i = h.indexOf("-");
    const art = i >= 0 ? h.slice(0, i) : h;
    const id = i >= 0 ? h.slice(i + 1) : "";
    if (art === "trainer" && id) { zeigeTab("trainer"); trainerDetail(id); }
    else if ((art === "kunde" || art === "kunden") && id) { zeigeTab("kunden"); kundeDetail(id); }
    else if (art === "anfrage" || art === "anfragen") { zeigeTab("anfragen"); }
  }

  // ── Teil A: Web Push (Mitteilungen auf diesem Gerät) ──
  function pushUnterstuetzt() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function b64urlZuUint8(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
    const roh = atob(b64);
    const out = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) out[i] = roh.charCodeAt(i);
    return out;
  }
  function geraetName() {
    const ua = navigator.userAgent || "";
    let plt = "Gerät";
    if (/iPhone|iPad|iPod/.test(ua)) plt = "iPhone/iPad";
    else if (/Android/.test(ua)) plt = "Android";
    else if (/Macintosh/.test(ua)) plt = "Mac";
    else if (/Windows/.test(ua)) plt = "Windows";
    return plt + " · " + new Date().toLocaleDateString("de-AT");
  }
  async function swRegistrierung() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      return await navigator.serviceWorker.register("sw-verwaltung.js", {
        scope: "verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html",
      });
    } catch { return null; }
  }
  async function pushInit() {
    const status = $("push-status");
    const knopf = $("push-aktivieren");
    if (!status) return;
    if (!pushUnterstuetzt()) {
      status.textContent = "Dein Browser unterstützt hier keine Mitteilungen. Auf dem iPhone zuerst über „Teilen → Zum Home-Bildschirm“ installieren und die App öffnen.";
      if (knopf) knopf.style.display = "none";
      return;
    }
    let aktiv = false;
    try {
      const reg = await navigator.serviceWorker.getRegistration("verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      aktiv = !!sub && Notification.permission === "granted";
    } catch { /* egal */ }
    status.textContent = aktiv
      ? "Dieses Gerät erhält Mitteilungen. Du kannst weitere Geräte aktivieren."
      : "Auf diesem Gerät noch nicht aktiviert. Mehrere Geräte sind möglich.";
    if (knopf) knopf.textContent = aktiv ? "Mitteilungen erneut einrichten" : "Mitteilungen auf diesem Gerät aktivieren";
    pushGeraeteLaden();
  }
  async function pushAktivieren() {
    const status = $("push-status");
    if (!pushUnterstuetzt()) { fehler("Dein Browser unterstützt hier keine Mitteilungen."); return; }
    try {
      // Berechtigung erst nach Klick anfragen.
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== "granted") { if (status) status.textContent = "Mitteilungen wurden nicht erlaubt."; return; }
      const reg = await swRegistrierung();
      if (!reg) { fehler("Service Worker konnte nicht registriert werden."); return; }
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlZuUint8(VAPID_PUBLIC_KEY),
      });
      const j = sub.toJSON();
      const d = await adminEdge({
        aktion: "push_abo_speichern",
        abo: { endpoint: j.endpoint, p256dh: j.keys && j.keys.p256dh, auth: j.keys && j.keys.auth, geraet: geraetName() },
      });
      if (d && d.ok) { erfolg("Mitteilungen auf diesem Gerät aktiviert."); pushInit(); }
      else fehler("Aktivierung fehlgeschlagen.");
    } catch { fehler("Mitteilungen konnten nicht aktiviert werden."); }
  }
  async function pushGeraeteLaden() {
    const wrap = $("push-geraete");
    if (!wrap) return;
    const d = await adminEdge({ aktion: "push_abos_liste" });
    if (!d || !Array.isArray(d.abos)) { wrap.innerHTML = ""; return; }
    if (!d.abos.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Noch keine Geräte aktiviert.</div>'; return; }
    wrap.innerHTML = d.abos.map((g) =>
      `<div class="push-geraet"><span>${escapeHtml(g.geraet || "Gerät")}${g.erstellt_am ? " · seit " + new Date(g.erstellt_am).toLocaleDateString("de-AT") : ""}</span><button data-aktion="push-entfernen" data-id="${escapeHtml(g.id)}">Entfernen</button></div>`
    ).join("");
  }
  async function pushGeraetEntfernen(id) {
    const d = await adminEdge({ aktion: "push_abo_entfernen", ziel_id: id });
    if (d && d.ok) { erfolg("Gerät entfernt."); pushGeraeteLaden(); }
    else fehler("Entfernen fehlgeschlagen.");
  }

  // ── Ereignis-Delegation ──
  function verdrahten() {
    $("btn-login").addEventListener("click", anmelden);
    $("login-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") anmelden(); });
    $("btn-mfa-setup").addEventListener("click", () => mfaBestaetigen("mfa-setup-code", "mfa-setup-fehler"));
    $("btn-mfa-code").addEventListener("click", () => mfaBestaetigen("mfa-code", "mfa-code-fehler"));
    $("mfa-code").addEventListener("keydown", (e) => { if (e.key === "Enter") mfaBestaetigen("mfa-code", "mfa-code-fehler"); });
    $("mfa-setup-code").addEventListener("keydown", (e) => { if (e.key === "Enter") mfaBestaetigen("mfa-setup-code", "mfa-setup-fehler"); });
    $("btn-mfa-setup-abbruch").addEventListener("click", () => abmelden());
    $("btn-mfa-code-abbruch").addEventListener("click", () => abmelden());
    $("btn-logout").addEventListener("click", () => abmelden());
    $("dialog-ok").addEventListener("click", () => dialogZu(true));
    $("dialog-abbrechen").addEventListener("click", () => dialogZu(false));
    $("form-ok").addEventListener("click", () => {
      const werte = {}; $("form-felder").querySelectorAll("input").forEach((i) => werte[i.dataset.key] = i.value.trim()); formZu(werte);
    });
    $("form-abbrechen").addEventListener("click", () => formZu(null));

    // Suche / Filter / Testkonten
    $("trainer-suche").addEventListener("input", renderTrainer);
    $("trainer-filter").addEventListener("change", renderTrainer);
    $("kunden-suche").addEventListener("input", renderKunden);
    $("tests-aus-trainer").addEventListener("change", (e) => { zustand.testsAusTrainer = e.target.checked; neuZeichnen(); });
    $("tests-aus-kunden").addEventListener("change", (e) => { zustand.testsAusKunden = e.target.checked; renderKunden(); });
    $("csv-trainer").addEventListener("click", exportiereTrainer);
    $("csv-kunden").addEventListener("click", exportiereKunden);

    // Teil A: Push-Knopf + „Mehr"-Reiter (untere Leiste am Handy).
    const pushKnopf = $("push-aktivieren");
    if (pushKnopf) pushKnopf.addEventListener("click", pushAktivieren);
    const mehrKnopf = $("tab-mehr-knopf");
    if (mehrKnopf) {
      mehrKnopf.addEventListener("click", () => {
        const menu = $("tab-mehr-menu");
        if (menu) menu.classList.toggle("offen");
      });
    }

    // Aktivität (für die 30-Minuten-Wache)
    for (const ev of ["click", "keydown"]) document.addEventListener(ev, aktivitaet, { passive: true });

    // Delegierte Klicks
    document.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      if (tab && tab.classList.contains("tab")) {
        zeigeTab(tab.dataset.tab);
        // „Mehr"-Menü nach der Wahl schließen (Handy).
        const menu = $("tab-mehr-menu");
        if (menu) menu.classList.remove("offen");
        return;
      }
      const sort = e.target.closest("th[data-sort]");
      if (sort) { aufSortieren(sort.dataset.liste, sort.dataset.sort); return; }
      const schliessen = e.target.closest("[data-schliessen]");
      if (schliessen) { if (schliessen.dataset.schliessen === "detail") detailSchliessen(); else if (schliessen.dataset.schliessen === "dialog") dialogZu(false); else if (schliessen.dataset.schliessen === "form") formZu(null); return; }
      const a = e.target.closest("[data-aktion]");
      if (!a) return;
      const akt = a.dataset.aktion, id = a.dataset.id, art = a.dataset.art;
      if (akt === "stat") { zeigeTab(a.dataset.tab); if (a.dataset.filter) { const f = $("trainer-filter"); if (f) { f.value = a.dataset.filter; renderTrainer(); } } return; }
      if (akt === "detail") { art === "kunde" ? kundeDetail(id) : trainerDetail(id); return; }
      if (akt === "freigeben") { freigeben(id); return; }
      if (akt === "freischalt-mail") { freischaltMailBestaetigen(id); return; }
      if (akt === "freigabe-zurueck") { freigabeZurueck(id); return; }
      if (akt === "verifizieren") { verifizieren(id, true); return; }
      if (akt === "entverifizieren") { verifizieren(id, false); return; }
      if (akt === "sperren") { sperren(art, id); return; }
      if (akt === "kicken") { kicken(art, id); return; }
      if (akt === "zertifikat") { zertifikatOeffnen(a.dataset.pfad); return; }
      if (akt === "push-entfernen") { pushGeraetEntfernen(id); return; }
      if (akt === "kopieren") { navigator.clipboard && navigator.clipboard.writeText(a.dataset.text).then(() => erfolg("Kopiert."), () => {}); return; }
      if (akt === "studio-freigabe") { studioRpc("studio_admin_freigabe", { p_studio_id: id, p_an: a.checked }); return; }
      if (akt === "studio-anlegen") { studioAnlegen(); return; }
      if (akt === "standort-anlegen") { standortAnlegen(id); return; }
      if (akt === "standort-bearbeiten") { standortBearbeiten(id); return; }
    });
    // Checkbox der Studio-Freigabe (change statt click)
    document.addEventListener("change", (e) => {
      const el = e.target.closest('[data-aktion="studio-freigabe"]');
      if (el) studioRpc("studio_admin_freigabe", { p_studio_id: el.dataset.id, p_an: el.checked });
    });
  }

  function aufSortieren(liste, feld) {
    const z = liste === "kunde" ? zustand.kundenSort : zustand.trainerSort;
    z.ab = (z.feld === feld) ? !z.ab : false;
    z.feld = feld;
    liste === "kunde" ? renderKunden() : renderTrainer();
  }

  async function studioAnlegen() {
    const w = await frageFormular("Neues Studio", [{ key: "name", label: "Name des Studios", pflicht: true }, { key: "slug", label: "Kürzel (Kleinbuchstaben)", pflicht: true }]);
    if (!w || !w.name || !w.slug) return;
    const r = await studioRpc("studio_admin_anlegen", { p_slug: w.slug, p_name: w.name });
    if (r.ok) { erfolg("Studio angelegt."); ladeStudios(); } else fehler("Studio konnte nicht angelegt werden (" + r.status + ").");
  }
  async function standortAnlegen(studioId) {
    const w = await frageFormular("Neuer Standort", [{ key: "name", label: "Name", pflicht: true }, { key: "slug", label: "Kürzel", pflicht: true }, { key: "stadt", label: "Stadt" }]);
    if (!w || !w.name || !w.slug) return;
    const r = await studioRpc("standort_admin_anlegen", { p_studio_id: studioId, p_slug: w.slug, p_name: w.name, p_stadt: w.stadt || null, p_adresse: "HIER EINFÜGEN", p_plz: "HIER EINFÜGEN", p_land: "AT" });
    if (r.ok) { erfolg("Standort angelegt."); ladeStudios(); } else fehler("Standort konnte nicht angelegt werden (" + r.status + ").");
  }
  async function standortBearbeiten(standortId) {
    let st = null;
    for (const s of _studios) for (const x of (s.standorte || [])) if (x.id === standortId) st = x;
    if (!st) return;
    const w = await frageFormular("Standort bearbeiten", [
      { key: "name", label: "Name", wert: st.name || "" }, { key: "stadt", label: "Stadt", wert: st.stadt || "" },
      { key: "adresse", label: "Straße und Hausnummer", wert: st.adresse || "" }, { key: "plz", label: "PLZ", wert: st.plz || "" }, { key: "land", label: "Land", wert: st.land || "AT" },
    ]);
    if (!w) return;
    const r = await studioRpc("standort_admin_bearbeiten", { p_standort_id: standortId, p_name: w.name, p_stadt: w.stadt, p_adresse: w.adresse, p_plz: w.plz, p_land: w.land });
    if (r.ok) { erfolg("Standort gespeichert."); ladeStudios(); } else fehler("Standort konnte nicht gespeichert werden (" + r.status + ").");
  }

  // ── Start ──
  function start() {
    verdrahten();
    // Teil A: Service Worker früh registrieren (Homescreen-App + Push).
    swRegistrierung();
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(SITZUNG_SCHLUESSEL) || "null"); } catch { s = null; }
    if (sitzungGueltig(s)) {
      auth.token = s.access_token; auth.refresh = s.refresh_token; auth.user = { id: s.user_id, email: s.email };
      aktivitaet();
      starteDashboard();
    } else {
      try { sessionStorage.removeItem(SITZUNG_SCHLUESSEL); } catch { /* ignorieren */ }
      zeigeAnsicht("ansicht-login");
      setTimeout(() => $("login-email").focus(), 60);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
