// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/pruef-profil-erinnerung.mjs
//
// Baustein 08.11.2026 – Verwaltung „Profil-Erinnerung" bei 375 und 1440 px.
// Admin-Login ist per aal2-Session GESÄT (sessionStorage, kein echter Login),
// Supabase + Mailweg sind GEMOCKT – es geht nichts ins Netz, keine echte Mail.
// Geprüft: Liste rendert (Salzburg-/Unbestätigt-Kennzeichen), Vorschau öffnet
// mit Betreff/Text, „Jetzt senden" ruft die Edge-Aktion (Mail gestubbt).
//
// Aufruf:  python3 -m http.server 8799   (im Projektordner)
//          BASIS=http://localhost:8799 node rundgang/pruef-profil-erinnerung.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASIS = process.env.BASIS || "http://localhost:8799";
const SB = "hbapzwxdehfgnputrfjf.supabase.co";
const SEITE = "verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html";
let fehler = 0;
const merk = (ok, text) => { if (ok) { console.log("  ok  " + text); } else { fehler++; console.log("  XX  " + text); } };

// ADMIN_ID aus dem ausgelieferten JS lesen (nicht hartkodieren).
const vwJs = readFileSync(new URL("../vexfit-verwaltung.js", import.meta.url), "utf8");
const ADMIN_ID = (vwJs.match(/ADMIN_ID\s*=\s*"([0-9a-f-]+)"/) || [])[1];
if (!ADMIN_ID) { console.error("ADMIN_ID nicht gefunden"); process.exit(2); }

// base64url ohne Padding – für ein Mini-JWT mit aal2 und Ablauf in der Zukunft.
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const exp = Math.floor(Date.now() / 1000) + 3600;
const TOKEN = `kopf.${b64url({ aal: "aal2", exp })}.sig`;
const SESSION = JSON.stringify({ access_token: TOKEN, refresh_token: "r", user_id: ADMIN_ID, email: "admin@vexfit.app", zuletzt: Date.now() });

// Drei Trainer für die Liste: zwei Salzburg (einer mit unbestätigter Mail),
// einer anderswo, einer gesperrt (darf=false).
const LISTE = [
  { id: "a", name: "Anna B.", ort: "Salzburg", plz: "5020", land: "AT", erfuellt: 3, fehlend: ["Foto", "Preis pro Stunde", "Telefon", "Über mich", "Erfahrung"], registriert_am: "2026-11-07T10:00:00Z", letzte_erinnerung_am: null, email_bestaetigt: false, salzburg: true, darf: true, grund: "" },
  { id: "b", name: "Ben K.", ort: "Hallein", plz: "5400", land: "AT", erfuellt: 6, fehlend: ["Foto", "Preis pro Stunde"], registriert_am: "2026-11-06T10:00:00Z", letzte_erinnerung_am: null, email_bestaetigt: true, salzburg: true, darf: true, grund: "" },
  { id: "c", name: "Cara M.", ort: "Wien", plz: "1010", land: "AT", erfuellt: 8, fehlend: [], registriert_am: "2026-11-05T10:00:00Z", letzte_erinnerung_am: "2026-11-08T08:00:00Z", email_bestaetigt: true, salzburg: false, darf: false, grund: "Profil ist vollständig (8/8)" },
];
const VORSCHAU = {
  ok: true, darf: true, empfaenger: "anna@example.com",
  betreff: "Dein Vexfit-Profil ist zu 3 von 8 fertig",
  text: "Hallo Anna, danke, dass du bei Vexfit dabei bist! Dein Profil ist zu 3 von 8 fertig. Es fehlen noch: Foto, Preis pro Stunde, Telefon, Über mich, Erfahrung. …",
  erfuellt: 3, fehlend: LISTE[0].fehlend,
};
let gesendetAufruf = 0;

function mock() {
  return (route) => {
    const url = route.request().url();
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes(SB)) {
      if (url.includes("/functions/v1/vexfit-automation/admin-aktion")) {
        const body = JSON.parse(route.request().postData() || "{}");
        if (body.aktion === "profil_erinnerung_liste") return json({ ok: true, eintraege: LISTE });
        if (body.aktion === "profil_erinnerung_vorschau") return json(VORSCHAU);
        if (body.aktion === "profil_erinnerung_senden") { gesendetAufruf++; return json({ ok: true, gesendet: true, empfaenger: "anna@example.com" }); }
        return json({ ok: true });
      }
      // Alle übrigen Supabase-Reads leer/ok (Dashboard lädt mehrere Tabellen).
      if (url.includes("/rest/v1/")) return json([]);
      if (url.includes("/auth/v1/")) return json({});
      return json({});
    }
    if (url.startsWith(BASIS) || url.startsWith("data:")) return route.continue();
    return route.abort(); // keine CDNs (Leaflet/Fonts) – nicht nötig für diesen Reiter
  };
}

const browser = await chromium.launch();
for (const w of [1440, 375]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((s) => { try { sessionStorage.setItem("vexfit_admin_session", s); } catch { /* egal */ } }, SESSION);
  await ctx.route("**/*", mock());
  const page = await ctx.newPage();
  await page.goto(`${BASIS}/${SEITE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  // Dashboard sichtbar (nicht Login)?
  const dash = await page.evaluate(() => {
    const d = document.getElementById("ansicht-dashboard");
    return !!d && getComputedStyle(d).display !== "none";
  });
  merk(dash, `[${w}] Dashboard offen (aal2-Session, Login übersprungen)`);

  // Reiter „Profil-Erinnerung" öffnen (Knopf steckt im „Mehr"-Menü).
  await page.evaluate(() => {
    const b = document.querySelector('.tab[data-tab="erinnerung"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);

  // Liste gerendert: 3 Zeilen, Salzburg-Kennzeichen, „E-Mail unbestätigt".
  const zeilen = await page.evaluate(() => document.querySelectorAll("#erinnerung-tbody tr").length);
  merk(zeilen === 3, `[${w}] Liste zeigt 3 Trainer (${zeilen})`);
  const txt = await page.evaluate(() => document.getElementById("erinnerung-tbody").textContent);
  merk(/Salzburg/.test(txt), `[${w}] Salzburg-Kennzeichen sichtbar`);
  merk(/unbestätigt/i.test(txt), `[${w}] „E-Mail unbestätigt" gekennzeichnet`);
  merk(/vollständig \(8\/8\)/.test(txt), `[${w}] 8/8 ohne Senden-Knopf (Grund genannt)`);

  // Erste „Erinnerung" → Vorschau-Fenster.
  await page.evaluate(() => {
    const b = document.querySelector('#erinnerung-tbody [data-aktion="profil-erinnerung"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const vorschauOffen = await page.evaluate(() => {
    const box = document.getElementById("erinnerung-box");
    return box && !box.classList.contains("verborgen");
  });
  merk(vorschauOffen, `[${w}] Vorschau-Fenster geöffnet`);
  const vText = await page.evaluate(() => document.getElementById("erinnerung-text").textContent || "");
  merk(/3 von 8/.test(vText), `[${w}] Vorschau zeigt den Mailtext`);

  // „Jetzt senden" → Fenster zu, Edge-Aktion gerufen (Mail gestubbt).
  const vorher = gesendetAufruf;
  await page.evaluate(() => {
    const b = document.getElementById("erinnerung-senden");
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  merk(gesendetAufruf === vorher + 1, `[${w}] „Jetzt senden" ruft die Edge-Aktion (gestubbt)`);
  const zu = await page.evaluate(() => document.getElementById("erinnerung-box").classList.contains("verborgen"));
  merk(zu, `[${w}] Vorschau nach dem Senden geschlossen`);

  await ctx.close();
}
await browser.close();
console.log(fehler === 0 ? "\nALLES GRÜN" : `\n${fehler} BEFUND(E)`);
if (fehler > 0) process.exit(1);
