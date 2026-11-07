// deno-lint-ignore-file
// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/klick-rundgang-k9.mjs
//
// Dauerlauf 07.11.2026 – K9: „Prüfen wie der Kunde". Treibt die ECHTEN
// Kundenseiten (lokaler Server) mit Playwright/Chromium und GEMOCKTEM Backend
// (Supabase + Geocoder api.zippopotam.us) – keine echten Daten, keine Mails,
// keine Live-DB. Vier Kontexte: iPhone+FB, iPhone+IG, Android+FB, Laptop.
//
// Geprüft je Kontext:
//   * Kunde Salzburg MIT Treffern: Stadtseite → Suche (vorausgefüllt) → Profil
//     → Ein-Schritt-Anfrage → Bestätigung; Kunden-Trichter-Beacons + UTM.
//   * Kunde 0 Treffer (ländliche PLZ): nächste Trainer mit Entfernung +
//     Vormerk-Band statt Sackgasse.
//   * Öffentliche Vorschau AUS (voller Name) UND AN (nur „Vorname N.").
//
// Admin-Übersicht und Trainer-Annahme sind BLOCK (aal2/echtes Backend) und über
// die Deno-Tests abgesichert (k6_stadt_uebersicht_test, admin_*). Der
// Brief-Generator (K7) wird separat über node geprüft (siehe Abschluss).
//
// VORAUSSETZUNG: Playwright + Chromium; Server im Projektordner:
//   python3 -m http.server 8799
// Start:  BASIS=http://localhost:8799 node rundgang/klick-rundgang-k9.mjs

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
  { name: "iPhone+Facebook", w: 390, h: 844, mobil: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]" },
  { name: "iPhone+Instagram", w: 390, h: 844, mobil: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0" },
  { name: "Android+Facebook", w: 360, h: 800, mobil: true, ua: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 [FBAN/FB4A;FBAV/450.0]" },
  { name: "Laptop", w: 1366, h: 768, mobil: false, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" },
];

// Ein freigegebener, vollständiger Salzburg-Trainer (für Treffer).
const SBG_TRAINER = {
  id: "t-sbg-1", vorname: "Ben", nachname: "Beispiel", stadt: "Salzburg", plz: "5020", land: "AT",
  trainingsart: "Functional", trainingsort: "vor ort", spezialisierungen: ["Kraft", "Ausdauer"],
  bio: "Servus, ich bin Ben – seit Jahren Personal Trainer in Salzburg.",
  preis_stunde: 55, preis_monat: null, avatar_url: "https://x/storage/v1/object/public/avatars/ben.png",
  sprachen: ["Deutsch"], trainingsorte: ["studio"], verifiziert: false, created_at: new Date().toISOString(), verfuegbarkeit: null,
};

function mock(aufz) {
  return async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    // Geocoder: Salzburg bzw. ländlich (Lienz, ~130 km).
    if (url.includes("api.zippopotam.us")) {
      if (/\/5020$/.test(url)) return json({ places: [{ latitude: "47.80", longitude: "13.04", "place name": "Salzburg" }] });
      if (/\/9900$/.test(url)) return json({ places: [{ latitude: "46.83", longitude: "12.77", "place name": "Lienz" }] });
      return json({ places: [{ latitude: "47.80", longitude: "13.04", "place name": "Salzburg" }] });
    }
    if (url.includes(SB)) {
      if (url.includes("/auth/v1/signup")) return json({ user: { id: "u-k9" }, access_token: "a1", refresh_token: "r1" }, 200);
      if (url.includes("/rest/v1/trichter_ereignisse") && method === "POST") {
        try { aufz.beacons.push(JSON.parse(req.postData() || "{}")); } catch {}
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      if (url.includes("/rest/v1/trainers_oeffentlich")) return json([SBG_TRAINER]);
      if (url.includes("/rest/v1/kunden") && method === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: "" });
      if (url.includes("/rest/v1/anfragen") && method === "POST") {
        try { aufz.anfragen.push(JSON.parse(req.postData() || "{}")); } catch {}
        return route.fulfill({ status: 201, contentType: "application/json", body: "" });
      }
      if (url.includes("/rest/v1/trainers") && method === "GET") return json([{ ...SBG_TRAINER, user_id: "t-user", aktiv: true, gesperrt: false, telefon: "", video_url: "", galerie: [], zertifikat_datei: null }]);
      if (url.includes("/functions/v1/")) return json({ ok: true });
      if (url.includes("/rest/v1/")) return json([]);
      return json({});
    }
    if (url.startsWith(BASIS) || url.startsWith("data:")) return route.continue();
    return route.abort();
  };
}

async function neu(context, aufz) {
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  const konsole = [];
  page.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  page.on("pageerror", (e) => konsole.push(String(e)));
  await page.route("**/*", mock(aufz));
  return { page, konsole };
}

async function kundeTreffer(browser, k) {
  const aufz = { beacons: [], anfragen: [] };
  const context = await browser.newContext({ viewport: { width: k.w, height: k.h }, isMobile: k.mobil, hasTouch: k.mobil, userAgent: k.ua });
  const { page, konsole } = await neu(context, aufz);

  // 1) Stadtseite mit UTM.
  await page.goto(`${BASIS}/personal-trainer-salzburg.html?utm_source=google&utm_campaign=salzburg`, { waitUntil: "load" });
  const txt = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  merk(txt.includes("kostenlos"), `[${k.name}] Stadtseite nennt „kostenlos"`);
  await page.waitForTimeout(200);
  merk(aufz.beacons.some((b) => b.stufe === "seite" && b.rolle === "kunde"), `[${k.name}] Stadtseite feuert Kunden-Trichter 'seite'`);

  // 2) In die Suche (vorausgefüllt + Auto-Suche).
  await page.click("#cta");
  await page.waitForURL(/suche\.html/, { timeout: 10000 });
  merk(/utm_source=google/.test(page.url()), `[${k.name}] UTM an die Suche weitergereicht`);
  // PLZ 5020 ist mehrdeutig (Salzburg AT und CH): wie ein echter Nutzer die
  // österreichische Variante wählen, damit die Umkreissuche läuft.
  try { await page.locator(".plz-land-btn", { hasText: "(AT)" }).first().click({ timeout: 4000 }); } catch (e) {}
  // Auf das ECHTE Umkreis-Ergebnis warten (nicht die anfängliche Vorab-Liste):
  // der Status zeigt „… gefunden", und die Treffer-Stufe wird gemeldet.
  await page.waitForFunction(() => { const s = document.getElementById("plzStatus"); return s && /gefunden/.test(s.textContent); }, { timeout: 10000 }).catch(() => {});
  for (let i = 0; i < 40 && !aufz.beacons.some((b) => b.stufe === "treffer"); i++) await page.waitForTimeout(100);
  const treffer = await page.$$(".tc");
  merk(treffer.length > 0, `[${k.name}] Suche zeigt Treffer in Salzburg (${treffer.length})`);
  merk(aufz.beacons.some((b) => b.stufe === "suche" && b.rolle === "kunde"), `[${k.name}] Beacon 'suche'`);
  merk(aufz.beacons.some((b) => b.stufe === "treffer" && b.rolle === "kunde"), `[${k.name}] Beacon 'treffer'`);

  // 3) Profil öffnen.
  await page.click(".tc");
  await page.waitForURL(/profil\.html/, { timeout: 10000 });
  merk(aufz.beacons.some((b) => b.stufe === "profil" && b.rolle === "kunde"), `[${k.name}] Beacon 'profil'`);

  // 4) Ein-Schritt-Anfrage ausfüllen (anon Block ist sichtbar, da nicht angemeldet).
  await page.waitForSelector("#a-goal", { timeout: 10000 });
  await page.fill("#a-goal", "Abnehmen");
  await page.fill("#a-zeitraum", "ab nächster Woche");
  await page.fill("#a-vorname", "Testkundin");
  await page.fill("#a-email", `k9+${k.name}@beispiel.test`.replace(/[^a-z0-9@._+-]/gi, ""));
  await page.fill("#a-pw", "Sehr-Gut-2026!");
  await page.click("label:has(#a-agb) input");
  await page.click("#anonSendBtn");
  await page.waitForTimeout(500);
  merk(aufz.anfragen.length > 0, `[${k.name}] Anfrage wurde gespeichert (POST /anfragen)`);
  merk(aufz.beacons.some((b) => b.stufe === "anfrage" && b.rolle === "kunde"), `[${k.name}] Beacon 'anfrage'`);
  const erfolg = await page.evaluate(() => { const e = document.getElementById("contactSuccess"); return !!(e && e.classList.contains("show")); });
  merk(erfolg, `[${k.name}] Bestätigung „Nachricht gesendet" sichtbar`);
  merk(konsole.filter((c) => !c.includes("favicon") && !c.includes("manifest") && !c.includes("400")).length === 0, `[${k.name}] keine unerwarteten Konsolenfehler`);
  await context.close();
}

async function kundeNullTreffer(browser, k) {
  const aufz = { beacons: [], anfragen: [] };
  const context = await browser.newContext({ viewport: { width: k.w, height: k.h }, isMobile: k.mobil, hasTouch: k.mobil, userAgent: k.ua });
  const { page } = await neu(context, aufz);
  await page.goto(`${BASIS}/suche.html?plz=9900`, { waitUntil: "load" });
  // Auto-Suche einer ländlichen PLZ; der einzige Trainer (Salzburg) ist weit weg.
  await page.waitForTimeout(1500);
  const bandSichtbar = await page.evaluate(() => { const e = document.getElementById("naeheHinweis"); return !!(e && e.style.display !== "none" && e.offsetParent !== null); });
  const karten = await page.$$(".tc");
  merk(bandSichtbar || karten.length > 0, `[${k.name}] 0 Treffer: nächste Trainer und/oder Vormerk-Band statt Sackgasse`);
  await context.close();
}

async function vorschau(browser, anFlag) {
  const aufz = { beacons: [], anfragen: [] };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page } = await neu(context, aufz);
  if (anFlag) await page.addInitScript(() => { window.VEXFIT_CONFIG = { OEFFENTLICHE_VORSCHAU: true }; });
  await page.goto(`${BASIS}/suche.html?plz=5020`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const namen = await page.$$eval(".cn", (els) => els.map((e) => e.textContent.trim()));
  if (anFlag) {
    merk(namen.length > 0 && namen.every((n) => /^\S+\s+\S\.$/.test(n)), `[Vorschau AN] nur „Vorname N." (${namen.join(", ") || "—"})`);
  } else {
    merk(namen.some((n) => /Beispiel/.test(n)), `[Vorschau AUS] voller Name sichtbar (${namen.join(", ") || "—"})`);
  }
  await context.close();
}

const browser = await chromium.launch({ headless: true });
for (const k of KONTEXTE) {
  console.log(`\n=== Kunde Salzburg (Treffer): ${k.name} ===`);
  try { await kundeTreffer(browser, k); } catch (e) { merk(false, `[${k.name}] Treffer-Ablauf abgebrochen: ${e.message}`); }
  console.log(`--- Kunde 0 Treffer: ${k.name} ---`);
  try { await kundeNullTreffer(browser, k); } catch (e) { merk(false, `[${k.name}] 0-Treffer-Ablauf abgebrochen: ${e.message}`); }
}
console.log("\n=== Öffentliche Vorschau ===");
try { await vorschau(browser, false); } catch (e) { merk(false, `[Vorschau AUS] abgebrochen: ${e.message}`); }
try { await vorschau(browser, true); } catch (e) { merk(false, `[Vorschau AN] abgebrochen: ${e.message}`); }
await browser.close();

console.log(`\n=== K9 Ergebnis: ${fehlerAnzahl} Befund(e) ===`);
if (fehlerAnzahl) { for (const f of funde) console.log(" - " + f); process.exit(1); }
console.log("Sauberer Durchlauf (Kunde Treffer + 0 Treffer + Vorschau AUS/AN). Admin/Trainer-Annahme: BLOCK (aal2/Backend).");
process.exit(0);
