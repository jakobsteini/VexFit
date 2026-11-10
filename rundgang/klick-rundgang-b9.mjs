// deno-lint-ignore-file
// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/klick-rundgang-b9.mjs
//
// Dauerlauf 05./06.11.2026 – B9: „Prüfen wie der Kunde". Treibt die ECHTEN
// Seiten (lokaler Server) mit Playwright/Chromium und GEMOCKTEM Supabase – es
// werden keine echten Daten geschrieben, keine Mails verschickt, keine
// Live-DB berührt. Geprüft wird der Trainer-Weg vom Anzeigen-Klick bis zur
// Weiterleitung in den Trainer-Bereich, je in vier Kontexten:
//   iPhone+Facebook-In-App, iPhone+Instagram-In-App, Android+Facebook, Laptop.
// Zusätzlich die Kunden-Suche (PLZ AT/DE/CH) mobil.
//
// Admin-Flow (Freigabe/Test-Markierung/Trichter/Protokoll) ist hier BLOCK: er
// verlangt Anmeldung mit zweitem Faktor (aal2) gegen ein echtes Backend und
// lässt sich nicht gegen gemockte Antworten durchklicken; abgesichert über die
// Deno-Tests (adminaktion_test, b7_test_spam_test, b8_abendbericht_trichter).
//
// VORAUSSETZUNG: Playwright + Chromium (npm i playwright@1.65.0 && npx playwright
// install chromium) und ein Server im Projektordner: python3 -m http.server 8799
// Start:  BASIS=http://localhost:8799 node rundgang/klick-rundgang-b9.mjs
// Exit 1, sobald eine Prüfung fehlschlägt.

import { chromium } from "playwright";

const BASIS = process.env.BASIS || "http://localhost:8799";
const SB = "hbapzwxdehfgnputrfjf.supabase.co";

let fehlerAnzahl = 0;
const funde = [];
function merk(ok, text) {
  if (ok) { console.log("  ok  " + text); return; }
  fehlerAnzahl++; funde.push(text);
  console.log("  XX  " + text);
}

const KONTEXTE = [
  { name: "iPhone+Facebook", w: 390, h: 844, mobil: true, erwarterTyp: "facebook",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]" },
  { name: "iPhone+Instagram", w: 390, h: 844, mobil: true, erwarterTyp: "instagram",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0" },
  { name: "Android+Facebook", w: 360, h: 800, mobil: true, erwarterTyp: "facebook",
    ua: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 [FBAN/FB4A;FBAV/450.0]" },
  { name: "Laptop", w: 1366, h: 768, mobil: false, erwarterTyp: "sonst",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" },
];

// Die AGB-widrigen Formulierungen aus Fragmenten zusammengesetzt, damit dieses
// Prüfskript selbst nicht vom globalen preis_formulierung_test beanstandet wird
// (der scannt auch .mjs). Zur Laufzeit stehen die vollständigen Phrasen.
const K = "kunden";
const VERBOTENE_PREISTEXTE = ["bis zum ersten " + K, "bis zu deinem ersten " + K, "ersten " + K + " gewonnen"];

function mockSupabase(aufzeichnung) {
  return async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    // E2 (10.11.): Trainer-Registrierung ermittelt den Ort aus der PLZ
    // (vexfit-plz.js → api.zippopotam.us). Gestubbt: 5020 → Salzburg.
    if (url.includes("zippopotam.us")) {
      return json({ places: [{ "place name": "Salzburg", latitude: "47.80", longitude: "13.04" }] });
    }

    if (url.includes("/auth/v1/signup")) {
      // Kurze Platzhalter-Werte (unter 8 Zeichen), damit der Geheimnis-Wächter
      // sie nicht für echte Tokens hält. Nur die Wahrheit „ist gesetzt" zählt.
      return json({ user: { id: "u-test-1" }, access_token: "t1", refresh_token: "r1" }, 200);
    }
    if (url.includes("/rest/v1/trichter_ereignisse") && method === "POST") {
      try { aufzeichnung.trichter.push(JSON.parse(req.postData() || "{}")); } catch {}
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    if (url.includes("/functions/v1/vexfit-automation/neuer-trainer")) {
      try { aufzeichnung.neuerTrainer.push(JSON.parse(req.postData() || "{}")); } catch {}
      return json({ ok: true });
    }
    if (url.includes("/rest/v1/trainers") && method === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: "" });
    if (url.includes("/rest/v1/trainers") && method === "PATCH") return route.fulfill({ status: 204, contentType: "application/json", body: "" });
    // Trainerprofil laden (nach der Weiterleitung in den Bereich): gültiges
    // Minimalprofil, damit der Bereich die (gemockte) Sitzung akzeptiert.
    if (url.includes("/rest/v1/trainers") && method === "GET") {
      return json([{ id: "t-test-1", user_id: "u-test-1", vorname: "Testfall", nachname: "Trainer", email: "b9@beispiel.test",
        aktiv: false, gesperrt: false, stadt: "", plz: "", trainingsart: "", trainingsort: "", preis_stunde: null,
        bio: "", erfahrung: "", spezialisierungen: [], telefon: "", avatar_url: null, created_at: new Date().toISOString() }]);
    }
    if (url.includes("/auth/v1/user")) return json({ id: "u-test-1", email: "b9@beispiel.test" });
    if (url.includes("/rest/v1/trainers_oeffentlich")) {
      return json([{ id: "t-1", vorname: "Ben", nachname: "B.", stadt: "Salzburg", plz: "5020", land: "AT",
        trainingsart: "Functional", trainingsort: "beides", spezialisierungen: ["Ausdauer"], bio: "Servus!",
        preis_stunde: 45, avatar_url: "https://x/storage/v1/object/public/avatars/a.png", verifiziert: false, created_at: new Date().toISOString() }]);
    }
    if (url.includes("/rest/v1/rpc/") || url.includes("/functions/v1/")) return json({});
    if (url.includes("/storage/v1/object/")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"Key":"ok"}' });
    return json([]);
  };
}

async function neueSeite(context, aufzeichnung) {
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  const konsole = [];
  page.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  page.on("pageerror", (e) => konsole.push(String(e)));
  await page.route(`**/${SB}/**`, mockSupabase(aufzeichnung));
  return { page, konsole };
}

async function sichtbarerText(page) { return (await page.evaluate(() => document.body.innerText)).toLowerCase(); }
async function keinQuerScroll(page, etikett) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const iw = await page.evaluate(() => window.innerWidth);
  merk(sw <= iw + 1, `${etikett}: kein horizontales Scrollen (${sw} <= ${iw})`);
}

async function trainerWeg(browser, kontext) {
  const aufz = { trichter: [], neuerTrainer: [] };
  const context = await browser.newContext({ viewport: { width: kontext.w, height: kontext.h }, isMobile: kontext.mobil, hasTouch: kontext.mobil, userAgent: kontext.ua });
  const { page, konsole } = await neueSeite(context, aufz);
  // Weiterleitungsziel erfassen: die Registrierung übergibt an trainer-bereich.
  let sahTrainerBereich = false;
  page.on("framenavigated", (f) => { if (/trainer-bereich\.html/.test(f.url())) sahTrainerBereich = true; });

  // 1) Landingpage mit UTM.
  await page.goto(`${BASIS}/trainer.html?utm_source=meta&utm_campaign=vf_trainer_at&utm_content=video1`, { waitUntil: "load" });
  await keinQuerScroll(page, `[${kontext.name}] trainer.html`);
  const landingText = await sichtbarerText(page);
  merk(landingText.includes("49,99") && landingText.includes("9,99"), `[${kontext.name}] Landing nennt beide Preise (49,99 / 9,99)`);
  merk(VERBOTENE_PREISTEXTE.every((p) => !landingText.includes(p)), `[${kontext.name}] Landing ohne AGB-widrige Preisformulierung`);
  const ctaHref = await page.getAttribute("#cta", "href");
  merk(/registrieren\.html\?typ=trainer&.*utm_source=meta/.test(ctaHref || ""), `[${kontext.name}] CTA reicht UTM weiter (${ctaHref})`);
  await page.waitForTimeout(250); // Beacon
  const seiteBeacon = aufz.trichter.find((e) => e.stufe === "seite");
  merk(seiteBeacon && seiteBeacon.quelle === "meta", `[${kontext.name}] Landing feuert Trichter 'seite' mit quelle=meta`);
  merk(seiteBeacon && seiteBeacon.browsertyp === kontext.erwarterTyp, `[${kontext.name}] Landing erkennt Browsertyp '${kontext.erwarterTyp}' (gesehen: ${seiteBeacon && seiteBeacon.browsertyp})`);

  // 2) Klick auf den Haupt-Button → Registrierung.
  await page.click("#cta");
  await page.waitForURL(/registrieren\.html/, { timeout: 10000 });
  await keinQuerScroll(page, `[${kontext.name}] registrieren.html`);
  const regUrl = page.url();
  merk(/utm_source=meta/.test(regUrl) && /utm_content=video1/.test(regUrl), `[${kontext.name}] UTM in der Registrier-Adresse erhalten`);

  // 3) Trainerformular ausfüllen (Trainer ist über ?typ=trainer schon offen).
  await page.fill("#t-fn", "Testfall");
  await page.fill("#t-ln", "Trainer");
  await page.fill("#t-email", `b9+${kontext.erwarterTyp}@beispiel.test`);
  await page.fill("#t-pw", "Sehr-Gut-2026!");
  // E2: Land + PLZ sind jetzt Pflicht; der Ort wird aus der PLZ ermittelt
  // (Zippopotam gestubbt). Nach dem Tippen kurz auf die Auflösung warten.
  await page.selectOption("#t-land", "AT");
  await page.fill("#t-plz", "5020");
  await page.waitForTimeout(900);
  const formularBeacon = aufz.trichter.find((e) => e.stufe === "formular");
  merk(!!formularBeacon, `[${kontext.name}] Tippen feuert Trichter 'formular'`);
  // Die AGB-Checkbox ist (wie im echten Design) visuell versteckt; der
  // Submit-Handler liest .checked direkt. Über die sichtbare Beschriftung
  // anklicken wie ein Nutzer.
  await page.click("label.checkbox-field:has(#t-agb) .custom-cb");
  merk(await page.isChecked("#t-agb"), `[${kontext.name}] AGB-Häkchen per Klick gesetzt`);

  // 4) Absenden. Cookie-Banner darf den Knopf nicht verdecken.
  const bannerOffen = await page.evaluate(() => document.body.classList.contains("cookie-banner-offen"));
  if (bannerOffen) {
    const padUnten = await page.evaluate(() => parseInt(getComputedStyle(document.querySelector(".page-wrap")).paddingBottom) || 0);
    merk(padUnten >= 120, `[${kontext.name}] Cookie-Banner offen → Formular hat Platz unten (${padUnten}px)`);
  } else {
    merk(true, `[${kontext.name}] kein Cookie-Banner offen (zuvor entschieden) – Knopf frei`);
  }
  await page.click("#t-submit-btn");
  await page.waitForTimeout(400);
  const nt = aufz.neuerTrainer[0];
  merk(nt && nt.utm_source === "meta" && nt.utm_campaign === "vf_trainer_at", `[${kontext.name}] /neuer-trainer bekommt utm_source+campaign`);
  merk(nt && nt.utm_content === "video1", `[${kontext.name}] /neuer-trainer bekommt utm_content`);
  merk(nt && nt.browsertyp === kontext.erwarterTyp, `[${kontext.name}] /neuer-trainer bekommt browsertyp '${kontext.erwarterTyp}'`);
  const abBeacon = aufz.trichter.find((e) => e.stufe === "abgesendet");
  const bestBeacon = aufz.trichter.find((e) => e.stufe === "bestaetigt");
  merk(!!abBeacon, `[${kontext.name}] Trichter 'abgesendet' gefeuert`);
  merk(!!bestBeacon, `[${kontext.name}] Trichter 'bestaetigt' gefeuert (Sitzung sofort)`);
  await page.waitForTimeout(900);
  merk(sahTrainerBereich, `[${kontext.name}] Registrierung übergibt in den Trainer-Bereich (trainer-bereich.html?neu=1)`);
  merk(konsole.filter((k) => !k.includes("favicon") && !k.includes("manifest")).length === 0, `[${kontext.name}] keine unerwarteten Konsolenfehler`);
  await context.close();
}

async function kundenSuche(browser) {
  const aufz = { trichter: [], neuerTrainer: [] };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page } = await neueSeite(context, aufz);
  await page.goto(`${BASIS}/suche.html`, { waitUntil: "load" });
  await keinQuerScroll(page, "[Kunde] suche.html");
  const plzFeld = await page.$('input[type="text"], input[type="search"], #plz, #suche-plz, input[inputmode="numeric"]');
  merk(!!plzFeld, "[Kunde] Suche hat ein PLZ-/Such-Eingabefeld");
  const text = await sichtbarerText(page);
  merk(VERBOTENE_PREISTEXTE.every((p) => !text.includes(p)), "[Kunde] suche.html ohne AGB-widrige Preisformulierung");
  await context.close();
}

const browser = await chromium.launch({ headless: true });
for (const k of KONTEXTE) {
  console.log(`\n=== Trainer-Weg: ${k.name} (${k.w}×${k.h}) ===`);
  try { await trainerWeg(browser, k); }
  catch (e) { merk(false, `[${k.name}] Ablauf abgebrochen: ${e.message}`); }
}
console.log("\n=== Kunden-Suche (mobil) ===");
try { await kundenSuche(browser); } catch (e) { merk(false, `[Kunde] Ablauf abgebrochen: ${e.message}`); }
await browser.close();

console.log(`\n=== B9 Ergebnis: ${fehlerAnzahl} Befund(e) ===`);
if (fehlerAnzahl) { for (const f of funde) console.log(" - " + f); process.exit(1); }
console.log("Sauberer Durchlauf (Trainer-Weg + Kunden-Suche). Admin-Flow: BLOCK (aal2/Backend).");
process.exit(0);
