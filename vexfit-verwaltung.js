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

// Feinschliff Teil 3: Namen schön anzeigen (NUR Anzeige, gespeicherte Daten
// bleiben). Wortgleich zu vexfit-namen.js (window.vexName) und kern.ts
// (nameFormatieren) – per namen_test.ts abgesichert.
const NAME_PARTIKEL = new Set([
  "von", "van", "de", "der", "den", "del", "della", "di", "da", "dos", "du",
  "la", "le", "ter", "ten", "zu", "zum", "zur", "of", "and",
]);
function nameGewollteMischung(s) {
  return /[a-zäöüéèàçñ][A-ZÄÖÜ]/.test(s);
}
function nameTeilGross(seg) {
  if (!seg) return seg;
  if (nameGewollteMischung(seg)) return seg;
  const klein = seg.toLowerCase();
  return klein.charAt(0).toUpperCase() + klein.slice(1);
}
export function nameFormatieren(roh) {
  if (roh === null || roh === undefined) return "";
  const s = String(roh).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.split(" ").map((wort, i) => {
    const klein = wort.toLowerCase();
    if (i > 0 && NAME_PARTIKEL.has(klein) && !nameGewollteMischung(wort)) return klein;
    return wort.split(/(['’-])/).map((seg) =>
      (seg === "-" || seg === "'" || seg === "’") ? seg : nameTeilGross(seg)
    ).join("");
  }).join(" ");
}
/** Vor- und Nachname zusammen, schön formatiert und maskiert – der Normalfall in
 *  der Verwaltung. Leere Teile fallen weg. */
export function namePaarHtml(vorname, nachname) {
  return escapeHtml(nameFormatieren(`${vorname || ""} ${nachname || ""}`.trim()));
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

/** Liste ggf. um Testkonten bereinigen. Blendet sowohl die serverseitig
 *  markierten (p.ist_test) als auch die per Heuristik (E-Mail-Alias) erkannten
 *  aus – aber nur, wenn „Tests ausblenden" aktiv ist. */
export function sichtbar(liste, testsAus, testListe = []) {
  const arr = Array.isArray(liste) ? liste : [];
  return testsAus ? arr.filter((p) => p.ist_test !== true && !istTestkonto(p.email, testListe)) : arr;
}

/** B7: Vorschläge (NICHT automatisch) für Test-/Spam-Konten. Gründe: E-Mail mit
 *  Plus-Alias (z. B. name+test@…), auffälliger Name (Tastatur-Muster, keine
 *  Vokale, Wörter wie „test"/„asdf"), doppelter Name. Schon markierte Konten
 *  (ist_test) werden nicht erneut vorgeschlagen. Reine Funktion. */
export function testSpamVerdacht(trainers) {
  const arr = Array.isArray(trainers) ? trainers : [];
  const norm = (t) => `${(t.vorname || "").trim()} ${(t.nachname || "").trim()}`.trim().toLowerCase();
  const zaehler = {};
  for (const t of arr) { const n = norm(t); if (n) zaehler[n] = (zaehler[n] || 0) + 1; }
  const auffaellig = (t) => {
    const n = norm(t);
    if (!n) return false;
    if (/\b(test|asdf|qwert|wasd|xxx|abc|fake|spam|lorem)\b/.test(n)) return true;
    const buchst = n.replace(/[^a-zäöü]/gi, "");
    if (buchst.length >= 3 && !/[aeiouäöü]/i.test(buchst)) return true; // keine Vokale
    if (/(.)\1\1\1/.test(buchst)) return true; // vierfacher gleicher Buchstabe
    return false;
  };
  const funde = [];
  for (const t of arr) {
    if (t.ist_test === true) continue;
    const gruende = [];
    const lokal = String(t.email || "").split("@")[0] || "";
    if (lokal.includes("+")) gruende.push("E-Mail-Alias (+)");
    if (auffaellig(t)) gruende.push("auffälliger Name");
    if (zaehler[norm(t)] > 1) gruende.push("doppelter Name");
    if (gruende.length) funde.push({ id: t.id, name: norm(t), email: t.email || "", gruende: gruende });
  }
  return funde;
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

/** B2: die drei Pflichtangaben VOR der Freigabe – Foto, PLZ, Preis pro Stunde.
 *  Entscheidung Jakob. Dieselbe Regel wie vexfit-pflicht.js (vexPflicht) im
 *  Trainer-Bereich; die Übereinstimmung sichert verwaltung_logik_test.ts ab.
 *  Freigeben bleibt trotzdem immer möglich – der Admin entscheidet allein. */
export function pflichtVorFreigabe(t) {
  t = t || {};
  const foto = avatarVorhanden(t.avatar_url);
  const plz = !!String(t.plz == null ? "" : t.plz).trim();
  const preis = Number(t.preis_stunde) > 0;
  const fehlt = [];
  if (!foto) fehlt.push("Foto");
  if (!plz) fehlt.push("PLZ");
  if (!preis) fehlt.push("Preis");
  return { foto, plz, preis, fehlt, vollstaendig: fehlt.length === 0 };
}

// ── B3: "Heute zu tun" und Zahlen nach Herkunft (reine Funktionen) ──

/** B3.1a: Trainer, die auf Freigabe warten (freigegeben=false, nicht gesperrt),
 *  je mit den fehlenden Pflichtangaben (Foto/PLZ/Preis) aus B2. */
export function wartenAufFreigabe(trainers) {
  return (trainers || [])
    .filter((t) => !t.aktiv && !t.gesperrt)
    .map((t) => ({
      id: t.id, vorname: t.vorname, nachname: t.nachname,
      stadt: t.stadt, plz: t.plz, fehlt: pflichtVorFreigabe(t).fehlt,
    }));
}

// ── Login-Schleifen-Fix: HTTP-Status deuten, Bereiche voneinander isolieren ──
// NUR 401 (abgelaufenes/ungültiges Token) beendet die Sitzung. 403 heißt
// „kein Recht auf diesen Bereich" und darf NICHT abmelden – sonst wird aus
// einer fehlenden Berechtigung ein Rauswurf (die beobachtete Login-Schleife).
// Exportiert, damit ohne Browser prüfbar.
export function mussAbmelden(status) {
  return status === 401;
}

// Hinweistext für einen Bereich, der nicht geladen werden konnte: bei 403 der
// klare Rechte-Hinweis, sonst ein allgemeiner Text.
export const KEIN_RECHT_TEXT = "Keine Berechtigung für diesen Bereich";
export function bereichFehlerText(status) {
  return status === 403 ? KEIN_RECHT_TEXT : "konnte nicht geladen werden";
}

// Lädt mehrere Dashboard-Bereiche UNABHÄNGIG voneinander: ein fehlschlagender
// Bereich wirft nie bis nach oben durch und blockiert die anderen nicht. Jede
// laden()-Funktion zeigt ihren Zustand (inkl. Fehlermeldung) selbst an. Gibt je
// Bereich true/false zurück, ob er fehlerfrei durchlief. Exportiert, prüfbar.
export async function bereicheLaden(bereiche) {
  const ergebnis = {};
  await Promise.all((bereiche || []).map(async (b) => {
    try { await b.laden(); ergebnis[b.name] = true; }
    catch { ergebnis[b.name] = false; }
  }));
  return ergebnis;
}

/** B3.1b: Kundenanfragen ohne Trainer-Antwort seit mehr als 24 Stunden.
 *  Beantwortet = Trigger-Zeitstempel beantwortet_am ODER Status angenommen/
 *  abgelehnt. 24-Stunden-Grenze streng (> 24 h). */
export function anfragenOhneAntwort(anfragen, jetzt = Date.now()) {
  const grenze = jetzt - 24 * 60 * 60 * 1000;
  return (anfragen || []).filter((a) => {
    const beantwortet = !!a.beantwortet_am || a.status === "angenommen" || a.status === "abgelehnt";
    if (beantwortet) return false;
    const t = a.created_at ? new Date(a.created_at).getTime() : NaN;
    return !isNaN(t) && t < grenze;
  });
}

/** B3.3: Herkunft eines Datensatzes; leer/fehlend = "direkt/unbekannt". */
export function herkunftVon(row) {
  const h = row && row.herkunft != null ? String(row.herkunft).trim() : "";
  return h || "direkt/unbekannt";
}

function tagSchluessel(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** B3.3: Zahlen je Tag für die letzten `tage` Tage (neueste zuerst): neue
 *  Trainer und Kunden, aufgeschlüsselt nach Herkunft, plus wie viele der
 *  Trainer Foto+PLZ+Preis vollständig haben. Reine Funktion. */
export function herkunftZusammenfassung(trainers, kunden, jetzt = Date.now(), tage = 14) {
  const tageListe = [];
  const index = {};
  for (let i = 0; i < tage; i++) {
    const key = tagSchluessel(jetzt - i * 86400000);
    const eintrag = { datum: key, trainer: 0, kunde: 0, trainerVollstaendig: 0, herkuenfte: {} };
    tageListe.push(eintrag);
    index[key] = eintrag;
  }
  const hk = (e, quelle) => (e.herkuenfte[quelle] = e.herkuenfte[quelle] || { trainer: 0, kunde: 0 });
  for (const t of trainers || []) {
    if (!t.created_at) continue;
    const e = index[tagSchluessel(new Date(t.created_at).getTime())];
    if (!e) continue;
    e.trainer++;
    if (pflichtVorFreigabe(t).vollstaendig) e.trainerVollstaendig++;
    hk(e, herkunftVon(t)).trainer++;
  }
  for (const k of kunden || []) {
    if (!k.created_at) continue;
    const e = index[tagSchluessel(new Date(k.created_at).getTime())];
    if (!e) continue;
    e.kunde++;
    hk(e, herkunftVon(k)).kunde++;
  }
  return tageListe;
}

// ── B3 (05./06.11.): Trichter nach Herkunft (anonyme Stufen) ──
/** Die fünf Trichter-Stufen in Reihenfolge. */
export const TRICHTER_STUFEN = ["seite", "formular", "abgesendet", "bestaetigt", "profil5"];
export const TRICHTER_LABEL = {
  seite: "Seite geöffnet",
  formular: "Formular begonnen",
  abgesendet: "Abgeschickt",
  bestaetigt: "Bestätigt",
  profil5: "Profil ≥5/8",
};

/** Zählt anonyme Trichter-Ereignisse der letzten `tage` Tage je Herkunft und
 *  Stufe. Reine Funktion (keine Personendaten in den Ereignissen). Gibt
 *  { gesamt: {stufe->n}, quellen: { quelle -> {stufe->n} } } zurück. */
export function trichterNachQuelle(ereignisse, jetzt = Date.now(), tage = 7) {
  const grenze = jetzt - tage * 86400000;
  const leer = () => { const o = {}; for (const s of TRICHTER_STUFEN) o[s] = 0; return o; };
  const gesamt = leer();
  const quellen = {};
  for (const e of ereignisse || []) {
    if (!e || !TRICHTER_STUFEN.includes(e.stufe)) continue;
    if (e.rolle === "kunde") continue; // K1: Kunden-Ereignisse gehören zum Kunden-Trichter
    const t = e.erstellt_am ? new Date(e.erstellt_am).getTime() : NaN;
    if (isNaN(t) || t < grenze) continue;
    const q = (e.quelle != null && String(e.quelle).trim()) || "direkt/unbekannt";
    quellen[q] = quellen[q] || leer();
    quellen[q][e.stufe]++;
    gesamt[e.stufe]++;
  }
  return { gesamt, quellen };
}

// ── K1 (07.11.): Kunden-Trichter (eigene Stufen) ──
export const KUNDE_TRICHTER_STUFEN = ["seite", "suche", "treffer", "profil", "anfrage_start", "anfrage"];
export const KUNDE_TRICHTER_LABEL = {
  seite: "Seite geöffnet",
  suche: "Suche ausgeführt",
  treffer: "Treffer > 0",
  profil: "Profil angesehen",
  anfrage_start: "Anfrage begonnen",
  anfrage: "Anfrage abgeschickt",
};

/** Zählt die KUNDEN-Trichter-Ereignisse (rolle='kunde') der letzten `tage` Tage,
 *  aufgeschlüsselt nach Herkunft UND grobem PLZ-Bereich. Reine Funktion. */
export function trichterKundeNachQuelle(ereignisse, jetzt = Date.now(), tage = 7) {
  const grenze = jetzt - tage * 86400000;
  const leer = () => { const o = {}; for (const s of KUNDE_TRICHTER_STUFEN) o[s] = 0; return o; };
  const gesamt = leer();
  const quellen = {};
  const plzBereiche = {};
  for (const e of ereignisse || []) {
    if (!e || e.rolle !== "kunde" || !KUNDE_TRICHTER_STUFEN.includes(e.stufe)) continue;
    const t = e.erstellt_am ? new Date(e.erstellt_am).getTime() : NaN;
    if (isNaN(t) || t < grenze) continue;
    const q = (e.quelle != null && String(e.quelle).trim()) || "direkt/unbekannt";
    quellen[q] = quellen[q] || leer();
    quellen[q][e.stufe]++;
    gesamt[e.stufe]++;
    if (e.plz_bereich != null && String(e.plz_bereich).trim()) {
      const pb = String(e.plz_bereich).trim();
      plzBereiche[pb] = plzBereiche[pb] || leer();
      plzBereiche[pb][e.stufe]++;
    }
  }
  return { gesamt, quellen, plzBereiche };
}

// ── K6 (07.11.): Stadt-/PLZ-Übersicht – wo ist Nachfrage, wo fehlen Trainer ──
/** Aggregiert je PLZ (mit Stadt-Label): freigegebene Trainer, davon Profil ≥5/8,
 *  Kundensuchen der letzten 7/30 Tage, Vormerkungen und Anfragen. Test-/Spam-
 *  Trainer (ist_test) werden ausgenommen. Reine Funktion. */
export function stadtUebersicht(daten, jetzt = Date.now()) {
  const { trainers, suchen, warteliste, anfragen } = daten || {};
  const g7 = jetzt - 7 * 86400000, g30 = jetzt - 30 * 86400000;
  const orte = {};
  const slot = (plz) => (orte[plz] = orte[plz] || { plz, stadt: "", trainerFrei: 0, trainerReif: 0, suchen7: 0, suchen30: 0, vorm: 0, anfragen: 0 });
  const plzVonTrainer = {};
  for (const t of trainers || []) {
    if (t.ist_test === true) continue;
    if (t.id != null && t.plz) plzVonTrainer[String(t.id)] = t.plz;
    if (!t.plz) continue;
    const o = slot(t.plz);
    if (t.stadt && !o.stadt) o.stadt = t.stadt;
    if (t.aktiv === true && t.gesperrt !== true) {
      o.trainerFrei++;
      if ((8 - fehlendeProfilfelder(t).length) >= 5) o.trainerReif++;
    }
  }
  for (const s of suchen || []) {
    if (!s.plz) continue;
    const t = s.erstellt_am ? new Date(s.erstellt_am).getTime() : NaN;
    if (isNaN(t)) continue;
    const o = slot(s.plz);
    if (t >= g30) o.suchen30++;
    if (t >= g7) o.suchen7++;
  }
  for (const v of warteliste || []) {
    if (!v.plz) continue;
    const o = slot(v.plz);
    o.vorm++;
    if (v.stadt && !o.stadt) o.stadt = v.stadt;
  }
  for (const a of anfragen || []) {
    const plz = a.trainer_id != null ? plzVonTrainer[String(a.trainer_id)] : null;
    if (plz) slot(plz).anfragen++;
  }
  return Object.values(orte);
}

/** K6: Standardsortierung – größter Handlungsbedarf zuerst: Orte mit Nachfrage
 *  (Suchen/Vormerkungen), aber ohne freigegebene Trainer. Reine Funktion. */
export function stadtUebersichtSortiert(liste, feld) {
  const arr = Array.isArray(liste) ? liste.slice() : [];
  if (feld && feld !== "bedarf") {
    return arr.sort((a, b) => (b[feld] || 0) - (a[feld] || 0) || (b.suchen30 - a.suchen30));
  }
  // Bedarf = Nachfrage ohne (genug) Trainer zuerst.
  const bedarf = (o) => (o.suchen30 + o.vorm) * (o.trainerFrei === 0 ? 10 : 1);
  return arr.sort((a, b) => bedarf(b) - bedarf(a) || (b.suchen30 + b.vorm) - (a.suchen30 + a.vorm));
}

/** B5.3: Anzeigetext für den Abo-Status eines Trainers. */
export function aboStatusLabel(status) {
  switch (status) {
    case "aktiv": return "Aktiv";
    case "zahlung_fehlgeschlagen": return "Zahlung fehlgeschlagen";
    case "gekuendigt": return "Gekündigt";
    default: return "–";
  }
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
    // Gesperrte zaehlen weder als "wartet" noch als "aktiv" – sie erscheinen nur
    // unter "gesperrt" (gleiche Regel wie in den Kennzahlen/der Freigabeliste).
    if (status === "warten" && (t.aktiv || t.gesperrt)) return false;
    if (status === "aktiv" && (!t.aktiv || t.gesperrt)) return false;
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
  // Formel-Einschleusung verhindern: Werte, die mit = + - @ (oder Tab/CR)
  // beginnen, deutet Excel/Numbers als Formel (auch "+43 660 …" bei Telefon).
  // Ein vorangestelltes ' macht die Zelle zu reinem Text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
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

// Teil 3: Beschriftungen für den Trainingsort GENAU wie im Trainer-Formular
// (profil-bearbeiten.html / trainer-bereich.html), damit im Admin nie ein
// Rohwert wie „vor_ort" steht.
//   * Einzelauswahl „Trainingsort": vor_ort / online / beides.
//   * Mehrfachauswahl „Trainingsorte" (ORTE_OPTIONS): studio / outdoor / beim_kunden.
export const TRAININGSORT_TEXT = { vor_ort: "Vor Ort", online: "Online", beides: "Beides" };
export const ORT_TEXT = { studio: "Studio", outdoor: "Outdoor", beim_kunden: "Beim Kunden zuhause", online: "Online" };
/** Lesbaren Ort-Text liefern. Unbekannter Wert bleibt unverändert (kein Absturz,
 *  kein Rohwert-Verlust); leerer Wert wird zu "".
 *  @param {unknown} wert
 *  @param {Record<string, string>} [karte]
 *  @returns {string} */
export function ortText(wert, karte = TRAININGSORT_TEXT) {
  if (wert === null || wert === undefined || wert === "") return "";
  return Object.prototype.hasOwnProperty.call(karte, wert) ? karte[wert] : String(wert);
}

// ============================================================================
// DOM-TEIL (nur im Browser)
// ============================================================================
if (typeof document !== "undefined") {
  starteVerwaltung();
}

function starteVerwaltung() {
  const $ = (id) => document.getElementById(id);
  const auth = { token: null, refresh: null, user: null, factorId: null, challengeId: null };
  const daten = { trainers: [], kunden: [], trichter: [] };
  const zustand = {
    testsAusTrainer: true, testsAusKunden: true,
    trainerSort: { feld: "created_at", ab: true },
    kundenSort: { feld: "created_at", ab: true },
  };
  let inaktivTimer = null;
  let _dialogAufloesen = null;
  let _formAufloesen = null;
  let hashSprungGemacht = false; // Teil M: Deep-Link nur einmal nach dem ersten Laden anspringen
  // Teil 1a: Auto-Aktualisieren ohne Flackern. Signaturen erkennen echte
  // Änderungen (nur dann neu zeichnen); bekannte IDs markieren neue Einträge.
  let autoTimer = null, zeitTimer = null;
  let letzteAktualisierung = 0;
  let trainerSig = "", kundenSig = "";
  let ersteLadung = true;
  const bekannt = { trainer: new Set(), kunde: new Set() };
  const neueIds = { trainer: new Set(), kunde: new Set() };

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
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (zeitTimer) { clearInterval(zeitTimer); zeitTimer = null; }
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
    // Teil 1a: im Hintergrund alle 30 s aktualisieren + Zeit-Label mitführen.
    starteAutoAktualisieren();
  }

  // ── Datenabruf ──
  async function hole(pfad, extra) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, { headers: { ...authKopf(auth.token), ...(extra || {}) } });
    // Nur 401 beendet die Sitzung; 403 (fehlendes Recht auf einen Bereich) wird
    // an den Aufrufer zurückgegeben, der im Bereich einen Hinweis zeigt.
    if (mussAbmelden(r.status)) { abmelden("Sitzung abgelaufen. Bitte neu anmelden."); throw new Error("abgemeldet"); }
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
      // B3/K1: anonyme Trichter-Ereignisse (nur Admin liest sie). Best effort:
      // zuerst MIT plz_bereich (K1); fehlt die Spalte (Migration 2026-11-07-01
      // noch nicht eingespielt → HTTP 400), ohne plz_bereich erneut; fehlt die
      // ganze Tabelle, bleibt der Trichter leer. Das Dashboard läuft immer weiter.
      daten.trichter = [];
      for (const spalten of ["stufe,quelle,kampagne,inhalt,browsertyp,rolle,plz_bereich,erstellt_am", "stufe,quelle,kampagne,inhalt,browsertyp,rolle,erstellt_am"]) {
        try {
          const trichRes = await hole(`trichter_ereignisse?select=${spalten}&order=erstellt_am.desc&limit=5000`);
          if (trichRes.ok) { daten.trichter = await trichRes.json(); break; }
          if (trichRes.status !== 400) break; // kein Spaltenproblem → nicht weiter versuchen
        } catch { break; }
      }
      // Teil 1a: bekannte IDs und Signaturen setzen (beim ersten Laden ohne
      // Hervorhebung), Zeitstempel merken.
      for (const p of daten.trainers) if (p.id != null) bekannt.trainer.add(String(p.id));
      for (const p of daten.kunden) if (p.id != null) bekannt.kunde.add(String(p.id));
      trainerSig = signatur(daten.trainers);
      kundenSig = signatur(daten.kunden);
      neueIds.trainer = new Set();
      neueIds.kunde = new Set();
      ersteLadung = false;
      letzteAktualisierung = Date.now();
      zeitLabelAktualisieren();
      renderStats();
      renderFreigabe();
      renderTrainer();
      renderKunden();
      // Login-Schleifen-Fix: jeder Bereich lädt unabhängig. Ein 403 (fehlendes
      // Recht) zeigt nur im Bereich einen Hinweis, meldet NICHT ab und
      // blockiert die übrigen Bereiche nicht.
      bereicheLaden([
        { name: "heute", laden: renderHeuteZuTun },
        { name: "anfragen", laden: ladeAnfragen },
        { name: "zahlungslink", laden: ladeZahlungslinkOffen },
        { name: "zahlungen", laden: ladeZahlungen },
        { name: "zertifikate", laden: ladeZertifikate },
        { name: "studios", laden: ladeStudios },
        { name: "nachfrage", laden: ladeNachfrage },
        { name: "protokoll", laden: ladeProtokoll },
      ]);
      // Teil M: Deep-Link aus der Benachrichtigungs-Mail (#trainer-/#kunde-/
      // #anfrage-<id>) nach dem ersten Laden genau einmal anspringen.
      if (!hashSprungGemacht) { hashSprungGemacht = true; springeZuHash(); }
    } catch (e) {
      if (String(e && e.message) !== "abgemeldet") fehler("Daten konnten nicht geladen werden: " + (e && e.message ? e.message : e));
    }
  }

  // ── Teil 1a: Auto-Aktualisieren, Signaturen, neue Einträge hervorheben ──
  // Signatur einer Liste aus den Feldern, die die Anzeige verändern. Ändert sich
  // nichts, wird nicht neu gezeichnet (kein Flackern).
  function signatur(liste) {
    return (Array.isArray(liste) ? liste : []).map((p) =>
      [p.id, p.vorname, p.nachname, p.email, p.telefon, p.stadt, p.plz, p.aktiv,
       p.gesperrt, p.stripe_bezahlt, p.verifiziert, p.ziel, p.avatar_url,
       p.zertifikat_datei, p.studio_standort_id,
       Array.isArray(p.spezialisierungen) ? p.spezialisierungen.length : 0].join("~")
    ).join("|");
  }
  function markiereNeu(art, liste) {
    const neu = new Set();
    if (!ersteLadung) {
      for (const p of liste) if (p.id != null && !bekannt[art].has(String(p.id))) neu.add(String(p.id));
    }
    neueIds[art] = neu;
    for (const p of liste) if (p.id != null) bekannt[art].add(String(p.id));
  }
  function zeitLabelAktualisieren() {
    const el = $("zuletzt");
    if (!el || !letzteAktualisierung) return;
    const min = Math.floor((Date.now() - letzteAktualisierung) / 60000);
    el.textContent = min <= 0 ? "gerade aktualisiert" : `vor ${min} Min aktualisiert`;
  }
  function spin(an) {
    const b = $("btn-aktualisieren");
    if (b) b.classList.toggle("laeuft", !!an);
  }
  // Leichter Poller: nur Trainer/Kunden (die veränderlichen Listen) neu laden und
  // NUR neu zeichnen, wenn sich wirklich etwas geändert hat.
  async function autoAktualisieren(manuell = false) {
    if (!auth.token) return;
    if (manuell) spin(true);
    try {
      const [trRes, kuRes] = await Promise.all([
        hole("trainers?select=*&order=created_at.desc"),
        hole("kunden?select=*&order=created_at.desc"),
      ]);
      if (!trRes.ok || !kuRes.ok) return;
      const tr = await trRes.json(), ku = await kuRes.json();
      const trSig = signatur(tr), kuSig = signatur(ku);
      if (trSig !== trainerSig) {
        markiereNeu("trainer", tr);
        daten.trainers = tr; trainerSig = trSig;
        renderStats(); renderFreigabe(); renderTrainer(); ladeZertifikate();
      }
      if (kuSig !== kundenSig) {
        markiereNeu("kunde", ku);
        daten.kunden = ku; kundenSig = kuSig;
        renderStats(); renderKunden();
      }
      neueIds.trainer = new Set();
      neueIds.kunde = new Set();
      letzteAktualisierung = Date.now();
      zeitLabelAktualisieren();
      // Beim bewussten Zug auch die sekundären Listen mitnehmen.
      if (manuell) { ladeAnfragen(); ladeZahlungslinkOffen(); ladeNachfrage(); }
    } catch (e) {
      if (String(e && e.message) !== "abgemeldet") { /* stiller Poll */ }
    } finally {
      if (manuell) setTimeout(() => spin(false), 400);
    }
  }
  function starteAutoAktualisieren() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(() => { if (!document.hidden) autoAktualisieren(false); }, 30 * 1000);
    if (zeitTimer) clearInterval(zeitTimer);
    zeitTimer = setInterval(zeitLabelAktualisieren, 30 * 1000);
  }

  // ── Teil 1b: Karten fürs Handy ──
  function vollBalken(t) {
    const voll = PROFIL_FELDER_GESAMT - fehlendeProfilfelder(t).length;
    const pct = Math.round(voll / PROFIL_FELDER_GESAMT * 100);
    const farbe = voll === PROFIL_FELDER_GESAMT ? "#4ade80" : (voll >= 4 ? "var(--accent)" : "#ff6b6b");
    return { voll, html: `<div class="karte-voll"><div class="karte-balken"><span style="width:${pct}%;background:${farbe}"></span></div><span class="karte-voll-text">${voll}/${PROFIL_FELDER_GESAMT}</span></div>` };
  }
  function statusChip(t) {
    if (t.gesperrt) return '<span class="badge badge-abg">Gesperrt</span>';
    if (!t.aktiv) return '<span class="badge badge-offen">Wartet</span>';
    return '<span class="badge badge-active">Aktiv</span>';
  }
  function datumKurz(s) { return s ? new Date(s).toLocaleDateString("de-AT") : "–"; }
  // B2: kurzer Hinweis am Freigeben-Knopf, welche Pflichtangaben (Foto, PLZ,
  // Preis) noch fehlen. Freigeben bleibt möglich – der Admin entscheidet allein.
  function freigabeFehltHinweis(t) {
    const fehlt = pflichtVorFreigabe(t).fehlt;
    return fehlt.length
      ? `<div class="freigabe-fehlt" style="font-size:11px;color:#ffaa00;margin:4px 0 2px">Fehlt für die Freigabe: ${escapeHtml(fehlt.join(", "))}</div>`
      : "";
  }
  function trainerKarte(t) {
    const neu = neueIds.trainer.has(String(t.id)) ? " karte-neu" : "";
    const ort = escapeHtml(nameFormatieren(t.stadt) || "Ort offen");
    const bal = vollBalken(t);
    const akt = !t.aktiv
      ? `<button class="btn-ja" data-aktion="freigeben" data-id="${escapeHtml(t.id)}">Freigeben</button>`
      : `<button class="btn-warn" data-aktion="sperren" data-art="trainer" data-id="${escapeHtml(t.id)}">${t.gesperrt ? "Entsperren" : "Sperren"}</button>`;
    const sperrBtn = t.aktiv ? "" : `<button class="btn-warn" data-aktion="sperren" data-art="trainer" data-id="${escapeHtml(t.id)}">${t.gesperrt ? "Entsperren" : "Sperren"}</button>`;
    return `<div class="karte${neu}" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
      <div class="karte-kopf"><div class="karte-name">${namePaarHtml(t.vorname, t.nachname)}</div>${statusChip(t)}</div>
      <div class="karte-zeile">${ort} · ${datumKurz(t.created_at)}${t.studio_standort_id ? " · Studio" : ""}</div>
      ${bal.html}
      ${!t.aktiv ? freigabeFehltHinweis(t) : ""}
      <div class="karte-aktionen">${akt}${sperrBtn}<button class="btn-neutral" data-aktion="${t.ist_test ? "test-aufheben" : "test-markieren"}" data-id="${escapeHtml(t.id)}">${t.ist_test ? "Test-Markierung weg" : "Als Test/Spam"}</button><button class="btn-gefahr" data-aktion="kicken" data-art="trainer" data-id="${escapeHtml(t.id)}">Kicken</button></div>
    </div>`;
  }
  function kundeKarte(k) {
    const neu = neueIds.kunde.has(String(k.id)) ? " karte-neu" : "";
    const ort = escapeHtml(nameFormatieren(k.stadt) || "Ort offen");
    const chip = k.gesperrt ? '<span class="badge badge-abg">Gesperrt</span>' : '<span class="badge badge-grau">Kunde</span>';
    return `<div class="karte${neu}" data-aktion="detail" data-art="kunde" data-id="${escapeHtml(k.id)}">
      <div class="karte-kopf"><div class="karte-name">${namePaarHtml(k.vorname, k.nachname)}</div>${chip}</div>
      <div class="karte-zeile">${ort} · ${datumKurz(k.created_at)}${k.ziel ? " · " + escapeHtml(k.ziel) : ""}</div>
      <div class="karte-aktionen"><button class="btn-warn" data-aktion="sperren" data-art="kunde" data-id="${escapeHtml(k.id)}">${k.gesperrt ? "Entsperren" : "Sperren"}</button><button class="btn-gefahr" data-aktion="kicken" data-art="kunde" data-id="${escapeHtml(k.id)}">Kicken</button></div>
    </div>`;
  }
  function freigabeKarte(t) {
    const neu = neueIds.trainer.has(String(t.id)) ? " karte-neu" : "";
    const ort = escapeHtml(nameFormatieren(t.stadt) || "Ort offen");
    const bal = vollBalken(t);
    return `<div class="karte${neu}" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
      <div class="karte-kopf"><div class="karte-name">${namePaarHtml(t.vorname, t.nachname)}</div><span class="badge badge-offen">Wartet</span></div>
      <div class="karte-zeile">${ort} · ${datumKurz(t.created_at)}</div>
      ${bal.html}
      ${freigabeFehltHinweis(t)}
      <div class="karte-aktionen"><button class="btn-ja" data-aktion="freigeben" data-id="${escapeHtml(t.id)}">Freigeben</button></div>
    </div>`;
  }
  function leerKarte(text) { return `<div class="leer-text">${escapeHtml(text)}</div>`; }

  // ── Kennzahlen ──
  async function renderStats() {
    const tr = sichtbar(daten.trainers, zustand.testsAusTrainer);
    const ku = sichtbar(daten.kunden, zustand.testsAusKunden);
    const warten = tr.filter((t) => !t.aktiv && !t.gesperrt).length;
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
      { label: "Freigabe-Liste", wert: warten, sub: "zur Übersicht", tab: "uebersicht" },
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
    const karten = $("freigabe-karten");
    const neue = sichtbar(daten.trainers, zustand.testsAusTrainer).filter((t) => !t.aktiv && !t.gesperrt);
    if (!neue.length) {
      tb.innerHTML = '<tr><td colspan="4" class="leer-text">Keine Trainer warten auf Freigabe.</td></tr>';
      if (karten) karten.innerHTML = leerKarte("Keine Trainer warten auf Freigabe.");
      return;
    }
    tb.innerHTML = neue.map((t) => {
      const fehlt = fehlendeProfilfelder(t);
      const voll = PROFIL_FELDER_GESAMT - fehlt.length;
      const farbe = fehlt.length === 0 ? "#4ade80" : (voll >= 4 ? "var(--accent)" : "#ff6b6b");
      return `<tr class="klickbar" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
        <td data-label="Name"><strong>${namePaarHtml(t.vorname, t.nachname)}</strong><br><span style="color:var(--text-muted);font-size:11px">${escapeHtml(t.email)}</span></td>
        <td data-label="Vollständigkeit"><span style="color:${farbe};font-weight:700">${voll}/${PROFIL_FELDER_GESAMT}</span> <span style="color:var(--text-muted);font-size:11px">${fehlt.length ? "fehlt: " + escapeHtml(fehlt.join(", ")) : "vollständig"}</span></td>
        <td data-label="Registriert">${t.created_at ? new Date(t.created_at).toLocaleDateString("de-AT") : "–"}</td>
        <td data-label=""><button class="btn-klein" data-aktion="freigeben" data-id="${escapeHtml(t.id)}">Freigeben</button></td>
      </tr>`;
    }).join("");
    if (karten) karten.innerHTML = neue.map(freigabeKarte).join("");
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
    const karten = $("trainer-karten");
    renderTestVerdacht();
    const liste = aktuelleTrainerliste();
    if (!liste.length) {
      tb.innerHTML = '<tr><td colspan="8" class="leer-text">Keine Treffer.</td></tr>';
      if (karten) karten.innerHTML = leerKarte("Keine Treffer.");
      return;
    }
    if (karten) karten.innerHTML = liste.map(trainerKarte).join("");
    tb.innerHTML = liste.map((t) => {
      const voll = PROFIL_FELDER_GESAMT - fehlendeProfilfelder(t).length;
      return `<tr class="klickbar" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">
        <td data-label="Name"><strong>${namePaarHtml(t.vorname, t.nachname)}</strong></td>
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

  // B7: Vorschlagskasten für mögliche Test-/Spam-Konten (nicht automatisch).
  // Der Admin entscheidet je Konto per Knopf. Schon markierte tauchen hier nicht
  // mehr auf.
  function renderTestVerdacht() {
    const box = $("test-verdacht");
    if (!box) return;
    const funde = testSpamVerdacht(daten.trainers);
    if (!funde.length) { box.innerHTML = ""; box.style.display = "none"; return; }
    box.style.display = "";
    const zeilen = funde.slice(0, 20).map((f) =>
      `<div class="verdacht-zeile">
         <div><strong>${escapeHtml(f.name || "ohne Namen")}</strong> <span class="verdacht-mail">${escapeHtml(f.email)}</span><br>
           <span class="verdacht-grund">${escapeHtml(f.gruende.join(" · "))}</span></div>
         <button class="btn-klein" data-aktion="test-markieren" data-id="${escapeHtml(f.id)}">Als Test markieren</button>
       </div>`).join("");
    box.innerHTML =
      `<div class="verdacht-kopf">Mögliche Test-/Spam-Konten (${funde.length}) – Vorschlag, du entscheidest je Konto.</div>${zeilen}`;
  }

  function renderKunden() {
    const tb = $("kunden-tbody");
    const karten = $("kunden-karten");
    const liste = aktuelleKundenliste();
    if (!liste.length) {
      tb.innerHTML = '<tr><td colspan="6" class="leer-text">Keine Treffer.</td></tr>';
      if (karten) karten.innerHTML = leerKarte("Keine Treffer.");
      return;
    }
    if (karten) karten.innerHTML = liste.map(kundeKarte).join("");
    tb.innerHTML = liste.map((k) =>
      `<tr class="klickbar" data-aktion="detail" data-art="kunde" data-id="${escapeHtml(k.id)}">
        <td data-label="Name"><strong>${namePaarHtml(k.vorname, k.nachname)}</strong>${k.gesperrt ? ' <span class="badge badge-abg">Gesperrt</span>' : ""}</td>
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
      if (!r.ok) { tb.innerHTML = `<tr><td colspan="6" class="leer-text">${escapeHtml(bereichFehlerText(r.status))}</td></tr>`; return; }
      const rows = await r.json();
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="leer-text">Noch keine Anfragen.</td></tr>'; return; }
      tb.innerHTML = rows.map((a) => {
        const z = anfrageZustand(a);
        const b = z === "angenommen" ? '<span class="badge badge-ang">Angenommen</span>' : z === "abgelehnt" ? '<span class="badge badge-abg">Abgelehnt</span>' : '<span class="badge badge-offen">Offen</span>';
        const std = unbeantwortetSeitStunden(a);
        return `<tr>
          <td data-label="Datum">${a.created_at ? new Date(a.created_at).toLocaleDateString("de-AT") : "–"}</td>
          <td data-label="Trainer">${escapeHtml(nameFormatieren(a.trainer_name)) || "–"}</td>
          <td data-label="Kunde">${escapeHtml(nameFormatieren(a.kunden_name)) || "–"}</td>
          <td data-label="Status">${b}</td>
          <td data-label="Unbeantwortet seit">${std == null ? "–" : std + " h"}</td>
          <td data-label="Weitergeleitet">${a.weitergeleitet ? '<span class="badge badge-paid">Ja</span>' : '<span class="badge badge-grau">Nein</span>'}</td>
        </tr>`;
      }).join("");
    } catch { tb.innerHTML = '<tr><td colspan="6" class="leer-text">Anfragen konnten nicht geladen werden.</td></tr>'; }
    // S3: Liste „Zur Pruefung" mitladen (best effort, eigener try).
    try { await ladeAnfragenPruefung(); } catch { /* still */ }
  }

  // S3: verdaechtige Anfragen (pruef_status='zur_pruefung') mit Freigeben/Verwerfen.
  async function ladeAnfragenPruefung() {
    const tb = $("pruef-tbody");
    if (!tb) return;
    try {
      const r = await hole("anfragen?pruef_status=eq.zur_pruefung&select=id,created_at,trainer_name,kunden_name,pruef_grund&order=created_at.desc&limit=100");
      if (!r.ok) {
        // Fehlt die Spalte (Migration 2026-11-08-02 nicht eingespielt), ruhig bleiben.
        tb.innerHTML = '<tr><td colspan="5" class="leer-text">Prüf-Liste nicht verfügbar (Migration 2026-11-08-02 einspielen).</td></tr>';
        return;
      }
      const rows = await r.json();
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="leer-text">Nichts zur Prüfung. 👍</td></tr>'; return; }
      tb.innerHTML = rows.map((a) => `<tr>
        <td data-label="Datum">${a.created_at ? new Date(a.created_at).toLocaleDateString("de-AT") : "–"}</td>
        <td data-label="Trainer">${escapeHtml(nameFormatieren(a.trainer_name)) || "–"}</td>
        <td data-label="Kunde">${escapeHtml(nameFormatieren(a.kunden_name)) || "–"}</td>
        <td data-label="Grund">${escapeHtml(a.pruef_grund || "–")}</td>
        <td data-label="Aktion"><button class="btn-klein" data-aktion="anfrage-freigeben" data-id="${escapeHtml(a.id)}">Freigeben</button> <button class="btn-klein" data-aktion="anfrage-verwerfen" data-id="${escapeHtml(a.id)}">Verwerfen</button></td>
      </tr>`).join("");
    } catch { tb.innerHTML = '<tr><td colspan="5" class="leer-text">Prüf-Liste konnte nicht geladen werden.</td></tr>'; }
  }

  async function anfrageFreigeben(id) {
    const d = await adminEdge({ aktion: "anfrage_freigeben", ziel_id: id });
    if (!d) return;
    erfolg(d.mails > 0 ? "Freigegeben und an den Trainer geschickt." : "Freigegeben (keine Trainer-Mail möglich).");
    ladeAnfragenPruefung();
  }
  async function anfrageVerwerfen(id) {
    const d = await adminEdge({ aktion: "anfrage_verwerfen", ziel_id: id });
    if (!d) return;
    erfolg("Anfrage verworfen.");
    ladeAnfragenPruefung();
  }

  // ══════════ B3.1: Heute zu tun (Übersicht, nur lesend) ══════════
  async function renderHeuteZuTun() {
    const box = $("heute-zu-tun");
    if (!box) return;
    const warten = wartenAufFreigabe(sichtbar(daten.trainers, zustand.testsAusTrainer));
    const freigabeHtml = warten.length
      ? warten.slice(0, 50).map((t) => {
          const name = nameFormatieren(`${t.vorname || ""} ${t.nachname || ""}`.trim()) || "Trainer";
          const ort = t.stadt ? escapeHtml(nameFormatieren(t.stadt)) : (t.plz ? escapeHtml(t.plz) : "");
          const fehlt = t.fehlt.length
            ? `<span class="heute-fehlt">fehlt: ${escapeHtml(t.fehlt.join(", "))}</span>`
            : `<span class="heute-fehlt" style="color:var(--green,#4ade80)">vollständig</span>`;
          return `<div class="heute-zeile"><span class="heute-link" data-aktion="detail" data-art="trainer" data-id="${escapeHtml(t.id)}">${escapeHtml(name)}</span>${ort ? `<span>${ort}</span>` : ""}${fehlt}</div>`;
        }).join("")
      : '<div class="heute-leer">Nichts offen</div>';
    box.innerHTML =
      `<div class="heute-karte">
         <div class="heute-kopf">🟡 Trainer warten auf Freigabe <span class="heute-zahl${warten.length ? "" : " null"}">${warten.length}</span></div>
         <div class="heute-liste">${freigabeHtml}</div>
       </div>
       <div class="heute-karte">
         <div class="heute-kopf">⏰ Anfragen ohne Antwort seit über 24 h <span class="heute-zahl null" id="heute-anfragen-zahl">…</span></div>
         <div class="heute-liste" id="heute-anfragen"><div class="heute-leer">Lade …</div></div>
       </div>`;
    // Teil b (Anfragen > 24 h) asynchron nachladen.
    try {
      const r = await hole("anfragen?beantwortet_am=is.null&select=id,created_at,status,kunden_name,trainer_name,trainer_id&order=created_at.asc&limit=500");
      const liste = $("heute-anfragen"), zahl = $("heute-anfragen-zahl");
      if (!r.ok) {
        // Kein Recht (403) o. ä.: nur diesen Bereich als nicht ladbar anzeigen;
        // nicht abmelden, die übrige Übersicht bleibt stehen.
        if (zahl) { zahl.textContent = "–"; zahl.classList.add("null"); }
        if (liste) liste.innerHTML = `<div class="heute-leer">${escapeHtml(bereichFehlerText(r.status))}</div>`;
        return;
      }
      const rows = await r.json();
      const offen = anfragenOhneAntwort(rows);
      if (zahl) { zahl.textContent = String(offen.length); zahl.classList.toggle("null", offen.length === 0); }
      if (liste) {
        liste.innerHTML = offen.length
          ? offen.slice(0, 50).map((a) => {
              const std = unbeantwortetSeitStunden(a);
              const kunde = escapeHtml(nameFormatieren(a.kunden_name)) || "Kunde";
              const trainer = a.trainer_name ? ` → ${escapeHtml(nameFormatieren(a.trainer_name))}` : "";
              return `<div class="heute-zeile"><span>${kunde}${trainer}</span><span class="heute-fehlt">${std == null ? "" : "seit " + std + " h"}</span></div>`;
            }).join("")
          : '<div class="heute-leer">Nichts offen</div>';
      }
    } catch {
      const liste = $("heute-anfragen");
      if (liste) liste.innerHTML = '<div class="heute-leer">Anfragen konnten nicht geladen werden.</div>';
    }
  }

  // ══════════ B3.3: Zahlen nach Herkunft (letzte 14 Tage, nur lesend) ══════════
  function renderHerkunft() {
    const box = $("herkunft-inhalt");
    if (!box) return;
    const tr = sichtbar(daten.trainers, zustand.testsAusTrainer);
    const ku = sichtbar(daten.kunden, zustand.testsAusKunden);
    const tage = herkunftZusammenfassung(tr, ku, Date.now(), 14);
    const zeilen = tage.map((d) => {
      const quellen = Object.keys(d.herkuenfte).sort();
      const herk = quellen.length
        ? quellen.map((q) => `${escapeHtml(q)}: ${d.herkuenfte[q].trainer}T/${d.herkuenfte[q].kunde}K`).join(" · ")
        : "–";
      const datum = new Date(d.datum + "T00:00:00").toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
      const trTxt = d.trainer ? `${d.trainer} (${d.trainerVollstaendig} vollständig)` : "0";
      return `<tr><td data-label="Tag"><strong>${datum}</strong></td><td data-label="Trainer">${trTxt}</td><td data-label="Kunden">${d.kunde}</td><td data-label="Herkunft">${herk}</td></tr>`;
    }).join("");
    // B3 (05./06.11.): Trichter der letzten 7 Tage je Herkunft – anonyme
    // Stufen (Seite geöffnet → Formular begonnen → abgeschickt → bestätigt →
    // Profil ≥5/8). Fehlt die Trichter-Tabelle, ist daten.trichter leer.
    const trichter = trichterNachQuelle(daten.trichter || [], Date.now(), 7);
    const stufenKopf = TRICHTER_STUFEN.map((s) => `<th>${escapeHtml(TRICHTER_LABEL[s])}</th>`).join("");
    const trichterZeile = (name, z) =>
      `<tr><td data-label="Herkunft"><strong>${escapeHtml(name)}</strong></td>` +
      TRICHTER_STUFEN.map((s) => `<td data-label="${escapeHtml(TRICHTER_LABEL[s])}">${z[s]}</td>`).join("") +
      `</tr>`;
    const quellNamen = Object.keys(trichter.quellen).sort();
    const gesamtSumme = TRICHTER_STUFEN.reduce((n, s) => n + trichter.gesamt[s], 0);
    const trichterKoerper = quellNamen.length
      ? quellNamen.map((q) => trichterZeile(q, trichter.quellen[q])).join("") + trichterZeile("Gesamt", trichter.gesamt)
      : `<tr><td colspan="${TRICHTER_STUFEN.length + 1}" class="leer-text">Noch keine Trichter-Daten (oder Tabelle noch nicht eingespielt).</td></tr>`;

    // K1 (07.11.): Kunden-Trichter – eigene Stufen, nach Herkunft UND grobem
    // PLZ-Bereich (zeigt, wo gesucht und wo angefragt wird).
    const kunde = trichterKundeNachQuelle(daten.trichter || [], Date.now(), 7);
    const kStufenKopf = KUNDE_TRICHTER_STUFEN.map((s) => `<th>${escapeHtml(KUNDE_TRICHTER_LABEL[s])}</th>`).join("");
    const kZeile = (name, z) =>
      `<tr><td data-label="Herkunft"><strong>${escapeHtml(name)}</strong></td>` +
      KUNDE_TRICHTER_STUFEN.map((s) => `<td data-label="${escapeHtml(KUNDE_TRICHTER_LABEL[s])}">${z[s]}</td>`).join("") + `</tr>`;
    const kQuellen = Object.keys(kunde.quellen).sort();
    const kPlz = Object.keys(kunde.plzBereiche).sort();
    const kGesamtSumme = KUNDE_TRICHTER_STUFEN.reduce((n, s) => n + kunde.gesamt[s], 0);
    const kKoerper = kQuellen.length
      ? kQuellen.map((q) => kZeile(q, kunde.quellen[q])).join("") + kZeile("Gesamt", kunde.gesamt)
      : `<tr><td colspan="${KUNDE_TRICHTER_STUFEN.length + 1}" class="leer-text">Noch keine Kunden-Ereignisse (oder Migration 2026-11-07-01 nicht eingespielt).</td></tr>`;
    const kPlzKoerper = kPlz.length
      ? kPlz.map((pb) => kZeile(pb + "xxx", kunde.plzBereiche[pb])).join("")
      : `<tr><td colspan="${KUNDE_TRICHTER_STUFEN.length + 1}" class="leer-text">Noch keine PLZ-Bereiche.</td></tr>`;

    box.innerHTML =
      `<h3 style="font-size:14px;margin:4px 0 10px">Trainer-Trichter · letzte 7 Tage · nach Herkunft</h3>
       <div class="table-wrap"><table>
         <thead><tr><th>Herkunft</th>${stufenKopf}</tr></thead>
         <tbody>${trichterKoerper}</tbody>
       </table></div>
       <div class="herkunft-hinweis">Anonyme Zählung ohne Personendaten. „Bestätigt" = Konto mit sofortiger Sitzung; „Profil ≥5/8" zählt erst, sobald der Trainer-Bereich die Stufe meldet.${gesamtSumme ? "" : " Noch keine Ereignisse."}</div>
       <h3 style="font-size:14px;margin:22px 0 10px">Kunden-Trichter · letzte 7 Tage · nach Herkunft</h3>
       <div class="table-wrap"><table>
         <thead><tr><th>Herkunft</th>${kStufenKopf}</tr></thead>
         <tbody>${kKoerper}</tbody>
       </table></div>
       <h3 style="font-size:14px;margin:16px 0 10px">Kunden-Trichter · nach PLZ-Bereich</h3>
       <div class="table-wrap"><table>
         <thead><tr><th>PLZ-Bereich</th>${kStufenKopf}</tr></thead>
         <tbody>${kPlzKoerper}</tbody>
       </table></div>
       <div class="herkunft-hinweis">Anonyme Zählung: Seite → Suche → Treffer → Profil → Anfrage begonnen → abgeschickt. PLZ-Bereich = erste zwei Ziffern (z. B. 50 = Salzburg).${kGesamtSumme ? "" : " Noch keine Kunden-Ereignisse."}</div>
       <h3 style="font-size:14px;margin:22px 0 10px">Registrierungen je Tag · letzte 14 Tage</h3>
       <div class="table-wrap"><table>
         <thead><tr><th>Tag</th><th>Neue Trainer</th><th>Neue Kunden</th><th>nach Herkunft (T=Trainer, K=Kunden)</th></tr></thead>
         <tbody>${zeilen}</tbody>
       </table></div>
       <div class="herkunft-hinweis">Wer Cookies ablehnt, wird trotzdem über den Link erkannt und hier gezählt; Meta selbst zählt diese Registrierungen nicht mit.</div>`;
  }

  // ══════════ B3.2: Karte (Leaflet + OpenStreetMap, nur lesend) ══════════
  let karte = null, kartenEbene = null;
  const geoCache = new Map(); // plz -> { lat, lng, land, stadt } (keine PLZ doppelt abfragen)

  function kartenInit() {
    if (karte) { setTimeout(() => karte.invalidateSize(), 60); kartenZeichnen(); return; }
    if (typeof L === "undefined") {
      const el = $("karte-status");
      if (el) el.textContent = "Karte konnte nicht geladen werden.";
      return;
    }
    karte = L.map("karte", { center: [47.6, 13.4], zoom: 6, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(karte);
    kartenEbene = L.layerGroup().addTo(karte);
    setTimeout(() => karte.invalidateSize(), 60);
    kartenZeichnen();
  }

  // Koordinaten zu einer PLZ – gespeicherte zuerst, sonst über vexfit-plz.js mit
  // gemeinsamem Zwischenspeicher (keine PLZ wird doppelt abgefragt).
  async function kartenCoords(p) {
    if (p && p.lat != null && p.lng != null) return { lat: Number(p.lat), lng: Number(p.lng), land: p.land || null, stadt: p.stadt || null };
    const plz = p && p.plz ? String(p.plz).trim() : "";
    if (!plz) return null;
    if (geoCache.has(plz)) return geoCache.get(plz);
    const vp = (typeof globalThis !== "undefined" && globalThis.vexPlz) ? globalThis.vexPlz : null;
    if (!vp) return null;
    let erg = null;
    try { erg = await vp.aufloesen(plz, {}); } catch { erg = null; }
    if (!erg || erg.netzfehler) { geoCache.set(plz, null); return null; }
    const o = erg.mehrdeutig ? (erg.optionen && erg.optionen[0]) : erg;
    const coords = o && o.lat != null ? { lat: Number(o.lat), lng: Number(o.lng), land: o.land || null, stadt: o.stadt || null } : null;
    geoCache.set(plz, coords);
    return coords;
  }

  function innerhalbTage(created_at, tage) {
    if (!tage) return true;
    if (!created_at) return false;
    const t = Date.parse(created_at);
    return !Number.isNaN(t) && t >= Date.now() - tage * 86400000;
  }

  async function kartenZeichnen() {
    if (!karte || !kartenEbene) return;
    const statusEl = $("karte-status");
    if (statusEl) statusEl.textContent = "Orte werden ermittelt …";
    kartenEbene.clearLayers();
    const land = ($("karte-land") || {}).value || "";
    const tage = Number(($("karte-zeit") || {}).value || 0);

    // Punkte sammeln (Testkonten je nach Schalter raus).
    const punkte = [];
    for (const t of sichtbar(daten.trainers, zustand.testsAusTrainer)) {
      if (!innerhalbTage(t.created_at, tage)) continue;
      const aktiv = t.aktiv && !t.gesperrt;
      if (t.gesperrt) continue;
      punkte.push({ typ: "trainer", farbe: aktiv ? "#2e6fff" : "#7fb3ff", status: aktiv ? "Freigegeben" : "Wartet auf Freigabe", quelle: t, art: "trainer", id: t.id, name: `${t.vorname || ""} ${t.nachname || ""}`.trim() });
    }
    for (const k of sichtbar(daten.kunden, zustand.testsAusKunden)) {
      if (!innerhalbTage(k.created_at, tage)) continue;
      punkte.push({ typ: "kunde", farbe: "#ff5a5a", status: "Kunde", quelle: k, art: "kunde", id: k.id, name: `${k.vorname || ""} ${k.nachname || ""}`.trim() });
    }
    // Warteliste separat laden (nur aktive Einträge).
    try {
      // warteliste hat erstellt_am (nicht created_at) und KEIN land – nur echte Spalten lesen.
      const r = await hole("warteliste?select=plz,stadt,erstellt_am&order=erstellt_am.desc&limit=2000");
      if (r.ok) {
        for (const w of await r.json()) {
          if (!innerhalbTage(w.erstellt_am, tage)) continue;
          punkte.push({ typ: "warteliste", farbe: "#ff9f1a", status: "Warteliste", quelle: w, name: w.stadt || w.plz || "Warteliste" });
        }
      }
    } catch { /* Warteliste optional */ }

    let gesetzt = 0;
    const koords = [];
    for (const p of punkte) {
      const c = await kartenCoords(p.quelle);
      if (!c) continue;
      if (land && c.land && String(c.land).toUpperCase() !== land) continue;
      const ortTxt = [p.quelle.plz, c.stadt || p.quelle.stadt].filter(Boolean).map((x) => escapeHtml(String(x))).join(" · ");
      const nameTxt = escapeHtml(nameFormatieren(p.name) || p.status);
      const link = (p.art && p.id)
        ? `<br><span class="heute-link" data-aktion="detail" data-art="${p.art}" data-id="${escapeHtml(p.id)}">Eintrag öffnen →</span>`
        : "";
      const popup = `<b>${nameTxt}</b><br>${ortTxt || "Ort unbekannt"}<br><span style="color:#888">${p.status}</span>${link}`;
      L.circleMarker([c.lat, c.lng], { radius: 7, color: "#fff", weight: 1, fillColor: p.farbe, fillOpacity: 0.9 })
        .addTo(kartenEbene).bindPopup(popup);
      koords.push([c.lat, c.lng]);
      gesetzt++;
    }
    if (koords.length) { try { karte.fitBounds(koords, { padding: [30, 30], maxZoom: 11 }); } catch { /* ok */ } }
    if (statusEl) statusEl.textContent = gesetzt ? `${gesetzt} Orte` : "Keine Orte für diese Auswahl";
  }

  // B5.3: Abo-Status je Trainer (aktiv / Zahlung fehlgeschlagen / gekündigt) mit Datum.
  function renderAboStatus() {
    const tb = $("abo-status-tbody");
    if (!tb) return;
    const liste = sichtbar(daten.trainers, zustand.testsAusTrainer)
      .filter((t) => t.abo_status || t.stripe_bezahlt)
      .sort((a, b) => String(b.abo_status_am || "").localeCompare(String(a.abo_status_am || "")));
    if (!liste.length) { tb.innerHTML = '<tr><td colspan="3" class="leer-text">Noch keine Abo-Ereignisse.</td></tr>'; return; }
    const farbe = (s) => s === "zahlung_fehlgeschlagen" ? "#ffaa00" : (s === "gekuendigt" ? "#ff6b6b" : "var(--green,#4ade80)");
    tb.innerHTML = liste.map((t) => {
      const status = t.abo_status || (t.stripe_bezahlt ? "aktiv" : "");
      const seit = t.abo_status_am ? new Date(t.abo_status_am).toLocaleDateString("de-AT") : "–";
      return `<tr>
        <td data-label="Trainer"><strong>${namePaarHtml(t.vorname, t.nachname)}</strong></td>
        <td data-label="Abo-Status"><span style="color:${farbe(status)}">${escapeHtml(aboStatusLabel(status))}</span></td>
        <td data-label="seit">${escapeHtml(seit)}</td>
      </tr>`;
    }).join("");
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
          <td><strong>${namePaarHtml(t.vorname, t.nachname)}</strong></td>
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
        <td><strong>${namePaarHtml(t.vorname, t.nachname)}</strong></td>
        <td>${escapeHtml(t.stadt) || "–"}</td>
        <td><button class="btn-klein" data-aktion="zertifikat" data-pfad="${escapeHtml(t.zertifikat_datei)}">Ansehen</button></td>
        <td>${t.verifiziert ? '<span class="badge badge-paid">Verifiziert</span>' : '<span class="badge badge-unpaid">offen</span>'}</td>
        <td>${t.verifiziert
          ? `<button class="btn-klein" data-aktion="entverifizieren" data-id="${escapeHtml(t.id)}">Zurücknehmen</button>`
          : `<button class="btn-klein" data-aktion="verifizieren" data-id="${escapeHtml(t.id)}">Verifizieren</button>`}</td>
      </tr>`
    ).join("");
  }

  // K6: Zustand der Stadt-Übersicht (geladene Daten + aktuelle Sortierung).
  const stadtZustand = { suchen: [], warteliste: [], anfragen: [], feld: "bedarf" };
  function renderStadtUebersicht() {
    const tb = $("stadt-uebersicht-tbody");
    if (!tb) return;
    const liste = stadtUebersicht({
      trainers: sichtbar(daten.trainers, zustand.testsAusTrainer),
      suchen: stadtZustand.suchen, warteliste: stadtZustand.warteliste, anfragen: stadtZustand.anfragen,
    }, Date.now());
    const sortiert = stadtUebersichtSortiert(liste, stadtZustand.feld);
    tb.innerHTML = sortiert.length ? sortiert.map((o) => {
      const ort = o.stadt ? `${escapeHtml(o.stadt)} (${escapeHtml(o.plz)})` : escapeHtml(o.plz);
      const kennung = (o.trainerFrei === 0 && (o.suchen30 + o.vorm) > 0) ? ' <span class="badge badge-unpaid">Nachfrage ohne Trainer</span>' : "";
      return `<tr><td data-label="Ort"><strong>${ort}</strong>${kennung}</td><td data-label="Trainer frei">${o.trainerFrei}</td><td data-label="≥5/8">${o.trainerReif}</td><td data-label="Suchen 7d">${o.suchen7}</td><td data-label="Suchen 30d">${o.suchen30}</td><td data-label="Vormerk.">${o.vorm}</td><td data-label="Anfragen">${o.anfragen}</td></tr>`;
    }).join("") : '<tr><td colspan="7" class="leer-text">Noch keine Orte mit Daten.</td></tr>';
  }
  async function ladeNachfrage() {
    const tb = $("nachfrage-tbody"), zb = $("ziele-tbody");
    const hinweis = "Die Nachfrage-Übersicht braucht die Tabellen such_eingaben und warteliste.";
    const zeige = (t) => { tb.innerHTML = `<tr><td colspan="4" class="leer-text">${escapeHtml(t)}</td></tr>`; zb.innerHTML = `<tr><td colspan="2" class="leer-text">${escapeHtml(t)}</td></tr>`; };
    // K6: zusätzliche Datenquellen für die Stadt-Übersicht (erstellt_am für 7/30
    // Tage, Anfragen je Trainer). Best effort: fehlt eine, bleibt die Übersicht
    // trotzdem bestmöglich befüllt.
    try {
      const [se30R, anfR] = await Promise.all([
        hole("such_eingaben?select=plz,erstellt_am&limit=5000"),
        hole("anfragen?select=trainer_id&limit=5000"),
      ]);
      stadtZustand.suchen = se30R.ok ? await se30R.json() : [];
      stadtZustand.anfragen = anfR.ok ? await anfR.json() : [];
    } catch { stadtZustand.suchen = []; stadtZustand.anfragen = []; }
    try {
      const [seR, wlR] = await Promise.all([
        hole("such_eingaben?select=plz,spezialisierungen&limit=5000"),
        hole("warteliste?select=plz,stadt&limit=5000"),
      ]);
      if (!seR.ok || !wlR.ok) { zeige(hinweis); return; }
      const suchen = await seR.json(), vorm = await wlR.json();
      stadtZustand.warteliste = vorm;
      renderStadtUebersicht();
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
    // Land eindeutig: Liste „PLZ ohne Land" mitladen (best effort, eigener try).
    try { await ladePlzOhneLand(); } catch { /* still */ }
  }

  // Land eindeutig (07.11.2026): Trainer und Kunden mit PLZ, aber ohne Land. Je
  // Zeile drei Knöpfe (AT/DE/CH) → /admin-aktion „land_setzen" (aal2, Protokoll).
  async function ladePlzOhneLand() {
    const tb = $("plz-ohne-land-tbody");
    if (!tb) return;
    const hinweis = "Die Liste braucht die Spalte land (Migration 2026-11-07-02 bzw. 2026-10-26-02 einspielen).";
    try {
      const [tr, ku] = await Promise.all([
        hole("trainers?plz=not.is.null&land=is.null&select=id,vorname,nachname,plz,stadt&order=plz.asc&limit=500"),
        hole("kunden?plz=not.is.null&land=is.null&select=id,vorname,nachname,plz,stadt&order=plz.asc&limit=500"),
      ]);
      if (!tr.ok || !ku.ok) { tb.innerHTML = `<tr><td colspan="4" class="leer-text">${escapeHtml(hinweis)}</td></tr>`; return; }
      const zeilen = [];
      for (const t of await tr.json()) zeilen.push({ art: "trainer", ...t });
      for (const k of await ku.json()) zeilen.push({ art: "kunde", ...k });
      if (!zeilen.length) { tb.innerHTML = '<tr><td colspan="4" class="leer-text">Alle Datensätze mit PLZ haben ein Land. 👍</td></tr>'; return; }
      tb.innerHTML = zeilen.map((z) => {
        const name = `${z.vorname || ""} ${z.nachname || ""}`.trim() || "—";
        const ortPlz = z.stadt ? `${escapeHtml(z.plz)} ${escapeHtml(z.stadt)}` : escapeHtml(z.plz);
        const artLabel = z.art === "trainer" ? "Trainer" : "Kunde";
        const knopf = (land) => `<button class="btn-klein" data-aktion="land-setzen" data-art="${z.art}" data-id="${escapeHtml(z.id)}" data-land="${land}">${land}</button>`;
        return `<tr><td data-label="Art">${artLabel}</td><td data-label="Name"><strong>${escapeHtml(name)}</strong></td><td data-label="PLZ / Stadt">${ortPlz}</td><td data-label="Land zuordnen">${knopf("AT")} ${knopf("DE")} ${knopf("CH")}</td></tr>`;
      }).join("");
    } catch { tb.innerHTML = `<tr><td colspan="4" class="leer-text">${escapeHtml(hinweis)}</td></tr>`; }
  }

  async function landSetzen(art, id, land) {
    const d = await adminEdge({ aktion: "land_setzen", art, ziel_id: id, land });
    if (!d) return; // Fehler schon gemeldet
    if (d.geaendert > 0) erfolg(`Land ${land} zugeordnet.`);
    else fehler("Zuordnung fehlgeschlagen (keine Zeile geändert).");
    ladePlzOhneLand();
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

  // B7: Test-Auslöser „Abendbericht jetzt senden". Läuft über /admin-aktion mit
  // derselben Admin-Prüfung (aal2) wie die übrigen Aktionen und schickt den
  // Bericht sofort (ohne 16-Uhr-Prüfung). Danach das Protokoll neu laden, damit
  // der Lauf sichtbar wird.
  async function abendberichtJetzt() {
    const btn = $("btn-abendbericht-jetzt");
    if (btn) { btn.disabled = true; btn.textContent = "Wird gesendet …"; }
    try {
      const d = await adminEdge({ aktion: "abendbericht_jetzt" });
      if (d && d.ok) {
        erfolg(d.mail ? "Abendbericht an office@vexfit.app gesendet." : "Abendbericht ausgelöst, aber die Mail wurde nicht zugestellt – siehe Protokoll.");
      }
      // adminEdge meldet einen Fehler bereits selbst.
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Abendbericht jetzt senden"; }
      ladeProtokoll();
    }
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
    const pflicht = pflichtVorFreigabe(t); // B2: Foto/PLZ/Preis vor der Freigabe
    const mailStatus = freischaltMailStatus(t);
    const spez = Array.isArray(t.spezialisierungen) && t.spezialisierungen.length
      ? `<div class="chiprow">${t.spezialisierungen.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</div>` : "";
    const orte = Array.isArray(t.trainingsorte) ? t.trainingsorte.map((o) => ortText(o, ORT_TEXT)).map(escapeHtml).join(", ") : "";
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
        <div><div style="font-size:20px;font-weight:700">${namePaarHtml(t.vorname, t.nachname)}</div>
          <div style="color:var(--text-muted);font-size:13px">${escapeHtml(t.email) || "—"}</div>
          <div class="chiprow" style="margin-top:8px">${statusB}</div></div></div>
      ${df("Profil-Vollständigkeit", vollTxt)}
      ${df("Telefon", escapeHtml(t.telefon || ""), fehlt.includes("Telefon"))}
      ${df("PLZ / Stadt", [t.plz, t.stadt].filter(Boolean).map(escapeHtml).join(" · "), !pflicht.plz)}
      ${df("Trainingsart", escapeHtml(t.trainingsart || ""), fehlt.includes("Trainingsart"))}
      ${df("Trainingsort", escapeHtml(ortText(t.trainingsort)), fehlt.includes("Trainingsort"))}
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
    const hinweis = (!t.aktiv && pflicht.fehlt.length > 0)
      ? `<div style="flex-basis:100%;font-size:12px;color:var(--text-muted)">Fehlt für die Freigabe: ${escapeHtml(pflicht.fehlt.join(", "))} – Freigeben ist trotzdem möglich, du entscheidest.</div>` : "";
    const freischaltKnopf = (t.aktiv && !mailStatus.gesendet)
      ? `<button class="btn-gross btn-neutral" data-aktion="freischalt-mail" data-id="${escapeHtml(t.id)}">Freischalt-Mail senden</button>` : "";
    const foot = `${freigabe}${hinweis}${freischaltKnopf}
      ${t.verifiziert ? `<button class="btn-gross btn-neutral" data-aktion="entverifizieren" data-id="${escapeHtml(t.id)}">Verifizierung zurück</button>` : `<button class="btn-gross btn-neutral" data-aktion="verifizieren" data-id="${escapeHtml(t.id)}">Verifizieren</button>`}
      <button class="btn-gross btn-warn" data-aktion="sperren" data-art="trainer" data-id="${escapeHtml(t.id)}">${t.gesperrt ? "Entsperren" : "Sperren (Login)"}</button>
      <button class="btn-gross btn-neutral" data-aktion="${t.ist_test ? "test-aufheben" : "test-markieren"}" data-id="${escapeHtml(t.id)}">${t.ist_test ? "Test-Markierung aufheben" : "Als Test/Spam markieren"}</button>
      <button class="btn-gross btn-gefahr" data-aktion="kicken" data-art="trainer" data-id="${escapeHtml(t.id)}">Kicken</button>`;
    detailOeffnen(nameFormatieren(`${t.vorname || ""} ${t.nachname || ""}`.trim()) || "Trainer", body, foot);
    ladeDetailAnfragen("trainer_id=eq." + encodeURIComponent(t.id), "an ", "kunden_name");
  }

  function kundeDetail(id) {
    const k = daten.kunden.find((x) => String(x.id) === String(id));
    if (!k) { fehler("Kunde nicht gefunden. Bitte neu laden."); return; }
    const LABEL = { telefon: "Telefon", plz: "PLZ", stadt: "Stadt", ziel: "Ziel", nachricht: "Nachricht", erwartungen: "Antworten aus dem Einstieg", land: "Land" };
    const VERBERGEN = new Set(["id", "user_id", "vorname", "nachname", "email", "created_at", "gesperrt"]);
    let body = `<div style="margin-bottom:16px"><div style="font-size:20px;font-weight:700">${namePaarHtml(k.vorname, k.nachname)}</div>
      <div style="color:var(--text-muted);font-size:13px">${escapeHtml(k.email) || "—"}</div>
      ${k.gesperrt ? '<div class="chiprow" style="margin-top:8px"><span class="badge badge-abg">Gesperrt</span></div>' : ""}</div>`;
    for (const key of ["telefon", "plz", "stadt", "ziel", "erwartungen", "nachricht", "land"]) {
      if (key in k && k[key] !== null && k[key] !== "") body += df(LABEL[key], escapeHtml(Array.isArray(k[key]) ? k[key].join(", ") : String(k[key])));
    }
    for (const key of Object.keys(k)) {
      if (VERBERGEN.has(key) || LABEL[key]) continue;
      const v = k[key];
      if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      // Technischen Schluessel lesbar machen (kein roher DB-Name als Label).
      const label = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      body += df(label, escapeHtml(Array.isArray(v) ? v.join(", ") : String(v)));
    }
    body += df("Registriert am", k.created_at ? new Date(k.created_at).toLocaleString("de-AT") : "");
    body += `<div class="feld"><div class="feld-label">Gestellte Anfragen</div><div id="detail-anfragen" class="feld-wert" style="color:var(--text-muted)">Lade …</div></div>`;
    const foot = `<button class="btn-gross btn-warn" data-aktion="sperren" data-art="kunde" data-id="${escapeHtml(k.id)}">${k.gesperrt ? "Entsperren" : "Sperren (Login)"}</button>
      <button class="btn-gross btn-gefahr" data-aktion="kicken" data-art="kunde" data-id="${escapeHtml(k.id)}">Kicken</button>`;
    detailOeffnen(nameFormatieren(`${k.vorname || ""} ${k.nachname || ""}`.trim()) || "Kunde", body, foot);
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
        return `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:${farbe};font-weight:700;text-transform:capitalize">${z}</span> · ${escapeHtml(prefix)}${escapeHtml(nameFormatieren(a[gegenseite])) || "—"} ${a.ziel ? "· " + escapeHtml(a.ziel) : ""} <span style="color:var(--text-muted);font-size:11px">${a.created_at ? new Date(a.created_at).toLocaleDateString("de-AT") : ""}</span></div>`;
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
    if (!d) return; // adminEdge hat den Fehler bereits gemeldet – keine zweite Meldung
    if (!(d.geaendert > 0)) { fehler("Freigeben fehlgeschlagen."); return; }
    if (t) { t.aktiv = true; if (d.mail && d.mail.datum) t.freischalt_mail_gesendet = d.mail.datum; }
    freischaltMailMelden(id, d.mail, true);
    detailSchliessen(); neuZeichnen(); ladeDaten();
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
    const name = t ? nameFormatieren(`${t.vorname || ""} ${t.nachname || ""}`.trim()) : "";
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
    if (!d) return; // adminEdge hat den Fehler bereits gemeldet
    if (d.geaendert > 0) { erfolg("Freigabe zurückgenommen."); detailSchliessen(); ladeDaten(); } else fehler("Zurücknehmen fehlgeschlagen.");
  }
  async function verifizieren(id, an) {
    const d = await adminEdge({ aktion: an ? "trainer_verifizieren" : "trainer_entverifizieren", ziel_id: id });
    if (!d) return; // adminEdge hat den Fehler bereits gemeldet
    if (d.geaendert > 0) { erfolg(an ? "Zertifikat verifiziert." : "Verifizierung zurückgenommen."); detailSchliessen(); ladeDaten(); } else fehler("Aktion fehlgeschlagen.");
  }
  async function sperren(art, id) {
    const liste = art === "trainer" ? daten.trainers : daten.kunden;
    const p = liste.find((x) => String(x.id) === String(id));
    const name = p ? nameFormatieren(`${p.vorname || ""} ${p.nachname || ""}`.trim()) : "";
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

  // B7: Trainer als Test/Spam markieren bzw. die Markierung aufheben. Nichts
  // wird gelöscht; markierte Konten werden ausgeblendet, bekommen keine
  // Erinnerungen und zählen nicht im Abendbericht.
  async function testMarkieren(id, an) {
    const t = daten.trainers.find((x) => String(x.id) === String(id));
    const name = t ? nameFormatieren(`${t.vorname || ""} ${t.nachname || ""}`.trim()) : "";
    const ja = await bestaetige({
      titel: an ? "Als Test/Spam markieren" : "Markierung aufheben",
      text: an
        ? `${name || "Dieses Konto"} als Test-/Spam-Konto markieren? Es wird ausgeblendet, bekommt keine Erinnerungs-Mails und zählt nicht im Abendbericht. Nichts wird gelöscht.`
        : `Die Test-/Spam-Markierung von ${name || "diesem Konto"} wieder aufheben?`,
      okText: an ? "Markieren" : "Aufheben", okArt: "btn-neutral",
    });
    if (!ja) return;
    const d = await adminEdge({ aktion: an ? "trainer_test_markieren" : "trainer_test_aufheben", ziel_id: id });
    if (!d || !d.ok) return;
    if (t) t.ist_test = an;
    erfolg(an ? "Als Test/Spam markiert und ausgeblendet." : "Markierung aufgehoben.");
    detailSchliessen(); neuZeichnen(); ladeDaten();
  }

  // Teil 3: Kicken – EIN Bestätigungsdialog, kein Namen-Eintippen.
  async function kicken(art, id) {
    const liste = art === "trainer" ? daten.trainers : daten.kunden;
    const p = liste.find((x) => String(x.id) === String(id));
    const name = p ? nameFormatieren(`${p.vorname || ""} ${p.nachname || ""}`.trim()) : "";
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

  function neuZeichnen() { renderStats(); renderFreigabe(); renderHeuteZuTun(); renderTrainer(); renderKunden(); renderAboStatus(); ladeZertifikate(); }

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
    // B3: Karte und Herkunft erst beim Öffnen zeichnen (Karte braucht einen
    // sichtbaren Container zum korrekten Einmessen).
    if (name === "karte") kartenInit();
    else if (name === "herkunft") renderHerkunft();
    else if (name === "zahlungen") renderAboStatus();
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

  // ── Teil 1c: Mehr-Blatt (von unten) mit Abdunkelung ──
  function mehrOeffnen() {
    const menu = $("tab-mehr-menu"); const ov = $("mehr-overlay");
    if (menu) menu.classList.add("offen");
    if (ov) ov.classList.remove("verborgen");
  }
  function mehrSchliessen() {
    const menu = $("tab-mehr-menu"); const ov = $("mehr-overlay");
    if (menu) menu.classList.remove("offen");
    if (ov) ov.classList.add("verborgen");
  }

  // Teil 1c: Wisch-nach-unten schließt das Mehr-Blatt.
  function mehrSwipeVerdrahten() {
    const menu = $("tab-mehr-menu");
    if (!menu) return;
    let sy = 0;
    menu.addEventListener("touchstart", (e) => { sy = e.touches[0] ? e.touches[0].clientY : 0; }, { passive: true });
    menu.addEventListener("touchend", (e) => {
      const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : 0) - sy;
      if (dy > 60) mehrSchliessen();
    }, { passive: true });
  }

  // ── Teil 1f: Push-Kasten ein-/ausklappen (kompakt wenn eingerichtet) ──
  function pushGrossZeigen() {
    const box = $("push-box"); const komp = $("push-kompakt");
    if (box) box.classList.remove("verborgen");
    if (komp) komp.classList.add("verborgen");
    pushGeraeteLaden();
  }

  // ── Teil 1g: aktive Kennzahl-Kachel markieren ──
  function statAktivMarkieren(el) {
    for (const c of document.querySelectorAll(".stat-card")) c.classList.remove("aktiv");
    if (el && el.classList) el.classList.add("aktiv");
  }

  // ── Teil 1a: „Zum Aktualisieren ziehen" (Pull-to-Refresh) ──
  function pullToRefreshVerdrahten() {
    const ptr = $("ptr");
    const dash = $("ansicht-dashboard");
    let startY = 0, ziehen = false;
    const schwelle = 80;
    const obenImDash = () => dash && !dash.classList.contains("verborgen") && (globalThis.scrollY || 0) <= 0;
    document.addEventListener("touchstart", (e) => {
      ziehen = obenImDash() && !!e.touches[0];
      startY = e.touches[0] ? e.touches[0].clientY : 0;
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!ziehen) return;
      const dy = (e.touches[0] ? e.touches[0].clientY : 0) - startY;
      if (ptr) ptr.classList.toggle("sichtbar", dy > 24 && (globalThis.scrollY || 0) <= 0);
    }, { passive: true });
    document.addEventListener("touchend", (e) => {
      if (!ziehen) return;
      ziehen = false;
      const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : 0) - startY;
      if (ptr) ptr.classList.remove("sichtbar");
      if (dy > schwelle && (globalThis.scrollY || 0) <= 0) autoAktualisieren(true);
    }, { passive: true });
    mehrSwipeVerdrahten();
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
    const box = $("push-box");
    const komp = $("push-kompakt");
    if (!status) return;
    if (!pushUnterstuetzt()) {
      status.textContent = "Dein Browser unterstützt hier keine Mitteilungen. Auf dem iPhone zuerst über „Teilen → Zum Home-Bildschirm“ installieren und die App öffnen.";
      if (knopf) knopf.style.display = "none";
      if (box) box.classList.remove("verborgen");
      if (komp) komp.classList.add("verborgen");
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
    // Teil 1f: eingerichtet → nur die kleine Zeile; sonst der große Kasten.
    if (box) box.classList.toggle("verborgen", aktiv);
    if (komp) komp.classList.toggle("verborgen", !aktiv);
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
    if (mehrKnopf) mehrKnopf.addEventListener("click", () => {
      const menu = $("tab-mehr-menu");
      if (menu && menu.classList.contains("offen")) mehrSchliessen(); else mehrOeffnen();
    });

    // Teil 1a: Aktualisieren-Knopf + sofort beim Zurückkehren in die App.
    const btnAkt = $("btn-aktualisieren");
    if (btnAkt) btnAkt.addEventListener("click", () => autoAktualisieren(true));
    document.addEventListener("visibilitychange", () => { if (!document.hidden && auth.token) autoAktualisieren(true); });
    // Beim Antippen einer Push-Mitteilung öffnet sich die App mit einem #-Anker.
    globalThis.addEventListener("hashchange", () => { if (auth.token) { springeZuHash(); autoAktualisieren(true); } });

    // Teil 1d/1f: Abmelden + Mitteilungen verwalten aus dem Mehr-Blatt.
    const mehrLogout = $("mehr-logout");
    if (mehrLogout) mehrLogout.addEventListener("click", () => { mehrSchliessen(); abmelden(); });
    const mehrPush = $("mehr-push-verwalten");
    if (mehrPush) mehrPush.addEventListener("click", () => { mehrSchliessen(); zeigeTab("uebersicht"); pushGrossZeigen(); });
    const pushVerw = $("push-verwalten");
    if (pushVerw) pushVerw.addEventListener("click", pushGrossZeigen);

    // Teil 1a: „Zum Aktualisieren ziehen" (Pull-to-Refresh, nur Touch, nur am Kopf).
    pullToRefreshVerdrahten();

    // Aktivität (für die 30-Minuten-Wache)
    for (const ev of ["click", "keydown"]) document.addEventListener(ev, aktivitaet, { passive: true });

    // Delegierte Klicks
    document.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      if (tab && tab.classList.contains("tab")) {
        zeigeTab(tab.dataset.tab);
        statAktivMarkieren(null); // Reiterwahl hebt die Kennzahl-Markierung auf
        mehrSchliessen(); // Teil 1c: „Mehr"-Blatt nach der Wahl schließen (Handy)
        return;
      }
      const sort = e.target.closest("th[data-sort]");
      if (sort) { aufSortieren(sort.dataset.liste, sort.dataset.sort); return; }
      // K6: Stadt-Übersicht nach einer Spalte sortieren.
      const stadtSort = e.target.closest("th.stadt-sort");
      if (stadtSort) { stadtZustand.feld = stadtSort.dataset.feld || "bedarf"; renderStadtUebersicht(); return; }
      const schliessen = e.target.closest("[data-schliessen]");
      if (schliessen) { const was = schliessen.dataset.schliessen; if (was === "detail") detailSchliessen(); else if (was === "dialog") dialogZu(false); else if (was === "form") formZu(null); else if (was === "mehr") mehrSchliessen(); return; }
      const a = e.target.closest("[data-aktion]");
      if (!a) return;
      const akt = a.dataset.aktion, id = a.dataset.id, art = a.dataset.art;
      if (akt === "stat") { zeigeTab(a.dataset.tab); statAktivMarkieren(a); if (a.dataset.filter) { const f = $("trainer-filter"); if (f) { f.value = a.dataset.filter; renderTrainer(); } } return; }
      if (akt === "detail") { art === "kunde" ? kundeDetail(id) : trainerDetail(id); return; }
      if (akt === "freigeben") { freigeben(id); return; }
      if (akt === "freischalt-mail") { freischaltMailBestaetigen(id); return; }
      if (akt === "freigabe-zurueck") { freigabeZurueck(id); return; }
      if (akt === "verifizieren") { verifizieren(id, true); return; }
      if (akt === "entverifizieren") { verifizieren(id, false); return; }
      if (akt === "sperren") { sperren(art, id); return; }
      if (akt === "test-markieren") { testMarkieren(id, true); return; }
      if (akt === "test-aufheben") { testMarkieren(id, false); return; }
      if (akt === "kicken") { kicken(art, id); return; }
      if (akt === "zertifikat") { zertifikatOeffnen(a.dataset.pfad); return; }
      if (akt === "push-entfernen") { pushGeraetEntfernen(id); return; }
      if (akt === "abendbericht-jetzt") { abendberichtJetzt(); return; }
      if (akt === "kopieren") { navigator.clipboard && navigator.clipboard.writeText(a.dataset.text).then(() => erfolg("Kopiert."), () => {}); return; }
      if (akt === "studio-freigabe") { studioRpc("studio_admin_freigabe", { p_studio_id: id, p_an: a.checked }); return; }
      if (akt === "studio-anlegen") { studioAnlegen(); return; }
      if (akt === "standort-anlegen") { standortAnlegen(id); return; }
      if (akt === "standort-bearbeiten") { standortBearbeiten(id); return; }
      if (akt === "land-setzen") { landSetzen(art, id, a.dataset.land); return; }
      if (akt === "anfrage-freigeben") { anfrageFreigeben(id); return; }
      if (akt === "anfrage-verwerfen") { anfrageVerwerfen(id); return; }
    });
    // Checkbox der Studio-Freigabe (change statt click)
    document.addEventListener("change", (e) => {
      const el = e.target.closest('[data-aktion="studio-freigabe"]');
      if (el) studioRpc("studio_admin_freigabe", { p_studio_id: el.dataset.id, p_an: el.checked });
    });
    // B3: Karten-Filter (Land / Zeitraum) neu zeichnen.
    for (const id of ["karte-land", "karte-zeit"]) {
      const el = $(id);
      if (el) el.addEventListener("change", () => kartenZeichnen());
    }
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
