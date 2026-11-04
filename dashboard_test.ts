// /Users/js/Projekte/Vexfit/app/vexfit/dashboard_test.ts
//
// Teil D — Trainer-Dashboard. Prueft OHNE Netz/Browser gegen die echten Quellen:
//   - naechsterSchritt() (reine Funktion aus dem DASHBOARD-KERN-Block in
//     trainer-bereich.html): richtige Reihenfolge.
//   - Ring/Prozent speisen sich aus profilAuswertung (keine zweite Zahl).
//   - Status-Texte In Prüfung / Freigeschaltet / Gesperrt vorhanden.
//   - keine erfundenen Prozent-/Mal-Zahlen; Foto-Hinweis wörtlich.
//   - kein Text nennt Foto/Kurztext/Spezialisierung als Suchbedingung.
//   - ?neu=1 zeigt Willkommens-Leiste statt 12-Punkte-Wand/Modal.
//   - profil.html zählt genau einmal pro Aufruf (Guard) und schickt keine
//     Identifikatoren; die Migration speichert keine IP/Nutzer-Kennung und die
//     Nachfrage-Funktion gibt nur eine Zahl zurück.
//   - Annehmen/Ablehnen nutzt die bestehende beantworteAnfrage-Logik.
//
// Aufruf:  deno test --allow-read dashboard_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── naechsterSchritt aus dem DASHBOARD-KERN-Block herausloesen ───────────────
async function schrittLaden() {
  const html = await lies("./trainer-bereich.html");
  const anfang = html.indexOf("// ==DASHBOARD-KERN-ANFANG==");
  const ende = html.indexOf("// ==DASHBOARD-KERN-ENDE==");
  assert(anfang !== -1 && ende !== -1 && ende > anfang, "DASHBOARD-KERN-Block nicht gefunden");
  const quelle = html.slice(anfang, ende);
  const bauen = new Function(quelle + "\nreturn { naechsterSchritt };");
  return (bauen() as { naechsterSchritt: (a: unknown, p: boolean) => string | null }).naechsterSchritt;
}

// Hilfs-Auswertung: alle Punkte ok, dann gezielt einzelne auf false.
function auswertung(ueberschreiben: Record<string, boolean> = {}) {
  const namen = [
    "Foto", "Kurztext", "Spezialisierungen", "Trainingsart", "Preis pro Stunde",
    "Erfahrung", "Trainingsort", "Telefon", "Vorstellungsvideo", "Galerie",
    "Sprachen", "Trainingsorte", "Zertifikat",
  ];
  return { alle: namen.map((name) => ({ name, ok: name in ueberschreiben ? ueberschreiben[name] : true })) };
}

Deno.test("D: naechster Schritt folgt der Reihenfolge Foto→Kurztext→Spez→Preis→Trainingsart→Trainingsort→PLZ→Telefon", async () => {
  const naechsterSchritt = await schrittLaden();
  // Alles fehlt → Foto zuerst.
  assertEquals(
    naechsterSchritt(auswertung({ Foto: false, Kurztext: false, Spezialisierungen: false }), false),
    "Foto",
  );
  // Foto da, Rest fehlt → Kurztext.
  assertEquals(naechsterSchritt(auswertung({ Kurztext: false, Spezialisierungen: false }), true), "Kurztext");
  // Bis Preis erfüllt, Trainingsart fehlt → Trainingsart.
  assertEquals(naechsterSchritt(auswertung({ Trainingsart: false }), true), "Trainingsart");
  // Alle Pflicht+Preis+Trainingsart+Trainingsort ok, aber keine PLZ → PLZ.
  assertEquals(naechsterSchritt(auswertung({}), false), "PLZ");
  // Alles ok inkl. PLZ → null.
  assertEquals(naechsterSchritt(auswertung({}), true), null);
  // Telefon kommt nach PLZ.
  assertEquals(naechsterSchritt(auswertung({ Telefon: false }), true), "Telefon");
});

Deno.test("D: Ring/Prozent kommen aus profilAuswertung (keine zweite Zahl)", async () => {
  const html = await lies("./trainer-bereich.html");
  // renderDashStaerke nutzt profilAuswertung(aktuellesProfil()) und a.prozent.
  const i = html.indexOf("function renderDashStaerke(");
  assert(i !== -1, "renderDashStaerke fehlt");
  const block = html.slice(i, i + 900);
  assert(block.includes("profilAuswertung(aktuellesProfil())"), "Ring nutzt nicht die vorhandene Berechnung");
  assert(block.includes("a.prozent"), "Ring nutzt a.prozent nicht");
});

Deno.test("D: Status-Texte In Prüfung / Freigeschaltet / Gesperrt vorhanden und an aktiv/gesperrt gekoppelt", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(html.includes("In Prüfung"), "Status 'In Prüfung' fehlt");
  assert(html.includes("Freigeschaltet"), "Status 'Freigeschaltet' fehlt");
  assert(html.includes("Gesperrt"), "Status 'Gesperrt' fehlt");
  assert(
    html.includes("Wir prüfen dein Profil und melden uns per Mail, sobald es freigeschaltet ist."),
    "Prüf-Satz (D1) fehlt wörtlich",
  );
  const i = html.indexOf("function dashStatusInfo(");
  const block = html.slice(i, i + 500);
  assert(block.includes("T.gesperrt") && block.includes("T.aktiv"), "Status hängt nicht an aktiv/gesperrt");
});

Deno.test("D: keine erfundenen Zahlen; Foto-Hinweis wörtlich; Kacheln ohne Migration '–'", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(
    html.includes("Profile mit Foto werden von Kunden deutlich eher angefragt."),
    "Foto-Hinweis nicht wörtlich",
  );
  // Default der Profilaufruf-Zahl ist '–' (keine erfundene Zahl ohne Migration).
  assert(html.includes("let dashAufrufe = null;"), "dashAufrufe-Default nicht null");
  assert(html.includes("(dashAufrufe == null) ? '–'"), "Kachel zeigt ohne Zahl kein '–'");
  // Keine erfundenen "x mal angefragt"-Behauptungen in den Dashboard-Tipps.
  const i = html.indexOf("const DASH_TIPPS");
  const block = html.slice(i, i + 1200);
  assert(!/\b\d+\s*(mal|%)\b/i.test(block), "Dashboard-Tipp enthält eine erfundene Zahl");
});

Deno.test("D: kein Dashboard-Text nennt Foto/Kurztext/Spezialisierung als Suchbedingung", async () => {
  const html = await lies("./trainer-bereich.html");
  // Der Status-Erklärungstext darf Sichtbarkeit nur an die Freigabe knüpfen.
  const i = html.indexOf("function dashStatusInfo(");
  const block = html.slice(i, i + 500);
  assert(!/sichtbar[^.]*foto/i.test(block), "Statustext macht Foto zur Suchbedingung");
  // Allgemein: keine Formulierung "nur mit Foto ... sichtbar/in der Suche".
  assert(!/nur mit foto[^.]*(sichtbar|suche)/i.test(html), "Text macht Foto zur Suchbedingung");
});

Deno.test("D: ?neu=1 zeigt die Willkommens-Leiste (kein Modal, keine 12-Punkte-Wand)", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(html.includes('id="dashWillkommen"'), "Willkommens-Leiste fehlt");
  assert(
    html.includes("Willkommen bei Vexfit – starte mit dem nächsten Schritt rechts."),
    "Willkommenstext fehlt wörtlich",
  );
  // Beim Laden ist das Dashboard sichtbar, das Profilformular versteckt.
  assert(html.includes('class="page-wrap" id="dashboardPage"'), "Dashboard ist nicht die Startseite");
  assert(html.includes('class="page-wrap hidden" id="profilPage"'), "Profilformular ist nicht versteckt");
});

Deno.test("D: Annehmen/Ablehnen im Dashboard nutzt die bestehende beantworteAnfrage-Logik", async () => {
  const html = await lies("./trainer-bereich.html");
  const i = html.indexOf("function renderDashAnfragen(");
  const block = html.slice(i, i + 1400);
  assert(block.includes("beantworteAnfrage('"), "Dashboard ruft beantworteAnfrage nicht auf");
  assert(block.includes('class="anf-actions'), "Dashboard-Aktionen tragen nicht .anf-actions (für beantworteAnfrage)");
  assert(block.includes("anfrage-card"), "Dashboard-Karte trägt nicht .anfrage-card (für beantworteAnfrage)");
});

Deno.test("D7: profil.html zählt genau einmal pro Aufruf und schickt keine Kennzeichen", async () => {
  const html = await lies("./profil.html");
  assert(html.includes("function zaehleProfilaufruf("), "zaehleProfilaufruf fehlt");
  assert(html.includes("_aufrufGezaehlt"), "Einmal-Guard fehlt");
  assert(html.includes("rpc/profilaufruf_zaehlen"), "RPC-Aufruf fehlt");
  // Der Rumpf trägt NUR die Trainer-Kennung, keine IP/kein User-Agent/keine Nutzer-ID.
  const i = html.indexOf("function zaehleProfilaufruf(");
  const block = html.slice(i, i + 600);
  assert(block.includes("p_trainer_id"), "Trainer-Kennung fehlt im Aufruf");
  assert(!/user_agent|navigator\.|p_ip|ip:/i.test(block), "Zähl-Aufruf schickt Kennzeichen");
});

// ── Feinschliff Teil 5 ───────────────────────────────────────────────────────

Deno.test("Teil 5a: Kachel zeigt 'Kostenlos' statt '0 €'", async () => {
  const html = await lies("./trainer-bereich.html");
  const i = html.indexOf("let kostenNum, kostenLabel;");
  const block = html.slice(i, i + 400);
  assert(block.includes("'Kostenlos'"), "Kachel nennt nicht 'Kostenlos'");
  assert(!block.includes("'0 €'"), "Kachel zeigt noch '0 €' (liest sich wie Umsatz)");
  assert(block.includes("bis zur 1. angenommenen Anfrage"), "Erklärungstext fehlt");
});

Deno.test("Teil 5b: Ring hat sichtbare Hintergrundspur + sanfte Animation (reduced-motion beachtet)", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(html.includes("--ring-spur"), "keine sichtbare Ring-Spur definiert");
  assert(/@property\s+--dash-p/.test(html), "@property --dash-p (Füll-Animation) fehlt");
  assert(html.includes("prefers-reduced-motion"), "Animation ignoriert prefers-reduced-motion");
  // Der Ring bekommt die Spur über conic-gradient mit var(--ring-spur).
  assert(/\.dash-ring\{[^}]*conic-gradient[^}]*var\(--ring-spur\)/.test(html), "Ring nutzt die Spur nicht");
  // JS setzt nur den Füllstand (keine Inline-Hintergrundfarbe mehr).
  const i = html.indexOf("function renderDashStaerke(");
  const block = html.slice(i, i + 500);
  assert(block.includes("setProperty('--dash-p'"), "Ring-Füllstand wird nicht über --dash-p gesetzt");
  assert(!block.includes("style.background ="), "Ring setzt noch eine Inline-Hintergrundfarbe (bricht die Animation)");
});

Deno.test("Teil 5c: 'PLZ eintragen' führt direkt ans PLZ-Feld; Profil-Seite fokussiert es", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(html.includes('href="profil-bearbeiten.html#fPlz">PLZ eintragen'), "Nachfrage-Knopf zeigt nicht aufs PLZ-Feld");
  assert(html.includes("schritt === 'PLZ' ? 'profil-bearbeiten.html#fPlz'"), "Nächster-Schritt-Knopf für PLZ zeigt nicht aufs Feld");
  const edit = await lies("./profil-bearbeiten.html");
  assert(edit.includes("location.hash === '#fPlz'"), "Profilseite reagiert nicht auf #fPlz");
  assert(/getElementById\('fPlz'\)[\s\S]{0,120}focus\(\)/.test(edit), "PLZ-Feld wird nicht fokussiert");
});

Deno.test("Teil 5d: Handy-Reihenfolge Kopf→nächster Schritt→Anfragen→Kacheln→Vorschau→Nachfrage", async () => {
  const html = await lies("./trainer-bereich.html");
  // Marker-Klassen an den vier Blöcken.
  for (const k of ["db-staerke", "db-anfragen", "db-vorschau", "db-nachfrage"]) {
    assert(html.includes(k), `Marker-Klasse ${k} fehlt`);
  }
  // Ordnungsblock unter dem Zwei-Spalten-Umbruch.
  const i = html.indexOf("@media(max-width:899px)");
  assert(i !== -1, "Handy-Ordnungsblock (max-width:899px) fehlt");
  const block = html.slice(i, i + 700);
  const reihenfolge = [
    [".dash-kopf", "order:1"], [".db-staerke", "order:2"], [".db-anfragen", "order:3"],
    [".dash-kacheln", "order:4"], [".db-vorschau", "order:5"], [".db-nachfrage", "order:6"],
  ];
  for (const [sel, ord] of reihenfolge) {
    assert(block.includes(sel) && block.includes(ord), `${sel} ${ord} fehlt in der Handy-Reihenfolge`);
  }
  assert(block.includes("display:contents"), "Spalten-Container lösen sich am Handy nicht auf");
});

Deno.test("Teil 3 (Dashboard): Namen laufen durch vexName (Anzeige) und vexfit-namen.js ist eingebunden", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(html.includes('src="vexfit-namen.js"'), "vexfit-namen.js nicht eingebunden");
  assert(html.includes("const vn = vexName("), "Begrüßung nutzt vexName nicht");
  assert(html.includes("vexEsc(vexName(a.kunden_name)"), "Anfrage-Name nicht formatiert");
});

Deno.test("D7/D8: Migration speichert keine Kennzeichen; Nachfrage-Funktion gibt nur eine Zahl", async () => {
  const sql = await lies("./migrations/2026-11-01-05-dashboard-admin-push.sql");
  // Tabelle profilaufrufe hat genau drei Datenspalten: trainer_id, tag, anzahl.
  const t = sql.indexOf("CREATE TABLE IF NOT EXISTS public.profilaufrufe");
  const tb = sql.slice(t, sql.indexOf(");", t));
  assert(tb.includes("trainer_id") && tb.includes("tag") && tb.includes("anzahl"), "Spalten fehlen");
  assert(!/\b(ip|user_agent|user_id|cookie|session)\b/i.test(tb), "profilaufrufe enthält ein Kennzeichen");
  // Nachfrage-Funktion gibt integer zurück (nur eine Zahl), für authenticated.
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.nachfrage_region()"), "nachfrage_region fehlt");
  assert(/FUNCTION public\.nachfrage_region\(\)\s*RETURNS integer/.test(sql), "nachfrage_region gibt nicht genau eine Zahl zurück");
  assert(sql.includes("SECURITY DEFINER"), "nachfrage_region nicht SECURITY DEFINER");
});
