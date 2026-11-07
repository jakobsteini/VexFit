// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/pruef-suche.mjs
//
// Dauerlauf 08.11.2026 – D7: automatische Prüfungen von suche.html (nicht
// angemeldet) mit Playwright/Chromium und GEMOCKTEM Backend. Prüft:
//   * Knopf „4 Fragen" Kontrast >= 4,5:1 (berechnete Stile),
//   * Seitenüberschrift sichtbar (nicht unter der Kopfzeile) bei 375 und 1440,
//   * Kartenfoto zentriert (Bildmitte = Kartenmitte ± 2 px, object-position top),
//   * kein waagrechter Scroll bei 375,
//   * NICHT angemeldet: kein voller Nachname im DOM (Kanarienwert) und keine
//     anon-Abfrage, die „nachname" auswählt.
//
// Aufruf:  python3 -m http.server 8799   (im Projektordner)
//          BASIS=http://localhost:8799 node rundgang/pruef-suche.mjs
import { chromium } from "playwright";

const BASIS = process.env.BASIS || "http://localhost:8799";
const SB = "hbapzwxdehfgnputrfjf.supabase.co";
let fehler = 0;
const merk = (ok, text) => { if (ok) { console.log("  ok  " + text); } else { fehler++; console.log("  XX  " + text); } };

// Kanarienwert: ein voller Nachname, der in der Antwort steht, aber NIE im DOM
// auftauchen darf (die Vorschau liefert real nur nachname_initial).
const CANARY = "LECKNACHNAME";
const TRAINER = [
  { id: "t1", vorname: "Ben", nachname: CANARY, nachname_initial: "B.", stadt: "Salzburg", plz: "5020", land: "AT",
    trainingsart: "Functional", trainingsort: "vor ort", spezialisierungen: ["Kraft"], bio: "x", preis_stunde: 55,
    avatar_url: `https://${SB}/storage/v1/object/public/avatars/t1.svg`, verifiziert: true, created_at: new Date().toISOString(),
    sprachen: ["Deutsch"], trainingsorte: ["studio"] },
  { id: "t3", vorname: "Max", nachname: CANARY, nachname_initial: "M.", stadt: "München", plz: "80331", land: "DE",
    trainingsart: "Online", trainingsort: "online", spezialisierungen: ["Ernährung"], bio: "x", preis_stunde: 45,
    avatar_url: null, verifiziert: false, created_at: new Date().toISOString(), sprachen: ["Deutsch"], trainingsorte: ["online"] },
];

function portrait() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#1d3b2a"/><circle cx="120" cy="80" r="46" fill="#f3d9c0"/></svg>`;
}

const requests = [];
function mock() {
  return (route) => {
    const url = route.request().url();
    const method = route.request().method();
    requests.push(url);
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("api.zippopotam.us")) return json({ places: [{ latitude: "47.80", longitude: "13.04", "place name": "Salzburg" }] });
    if (url.includes(`${SB}/storage/v1/object/public/avatars/`)) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: portrait() });
    if (url.includes(SB)) {
      if (url.includes("/rest/v1/trainers_vorschau")) return json(TRAINER);
      if (url.includes("/rest/v1/trainers_oeffentlich")) return json(TRAINER.map((t) => { const c = { ...t }; delete c.nachname; return c; }));
      if (method === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      if (url.includes("/rest/v1/")) return json([]);
      return json({});
    }
    if (url.startsWith(BASIS) || url.startsWith("data:")) return route.continue();
    return route.abort();
  };
}

function kanal(c) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
function lumRgb([r, g, b]) { return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b); }
function parseRgb(s) { const m = s.match(/(\d+),\s*(\d+),\s*(\d+)/); return m ? [ +m[1], +m[2], +m[3] ] : [0, 0, 0]; }
function kontrast(a, b) { const la = lumRgb(parseRgb(a)), lb = lumRgb(parseRgb(b)); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

const browser = await chromium.launch();
for (const w of [375, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("vexfit_consent", "abgelehnt"); } catch { /* kein localStorage */ } });
  await ctx.route("**/*", mock());
  const page = await ctx.newPage();
  await page.goto(`${BASIS}/suche.html?plz=5020&land=AT`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Kein waagrechter Scroll.
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  merk(scroll.sw <= scroll.cw, `[${w}] kein waagrechter Scroll (${scroll.sw} <= ${scroll.cw})`);

  // Überschrift nicht unter der festen Kopfzeile.
  const kopf = await page.evaluate(() => {
    const nav = document.querySelector("nav").getBoundingClientRect();
    const label = document.querySelector(".sh-label").getBoundingClientRect();
    const titel = document.querySelector(".sh-title").getBoundingClientRect();
    return { navBottom: nav.bottom, labelTop: label.top, titelTop: titel.top };
  });
  merk(kopf.labelTop >= kopf.navBottom - 1, `[${w}] Überschrift frei unter der Kopfzeile (label ${kopf.labelTop.toFixed(0)} >= nav ${kopf.navBottom.toFixed(0)})`);

  // Knopf-Kontrast.
  const btn = await page.evaluate(() => { const b = document.getElementById("matchBtn"); const cs = getComputedStyle(b); return { color: cs.color, bg: cs.backgroundColor }; });
  const kBtn = kontrast(btn.color, btn.bg);
  merk(kBtn >= 4.5, `[${w}] 4-Fragen-Knopf Kontrast ${kBtn.toFixed(2)} >= 4,5`);

  // Kartenfoto: Bildmitte = Kartenmitte ± 2 px; object-fit cover + position top.
  const foto = await page.evaluate(() => {
    const img = document.querySelector(".tc .ci .cimg");
    if (!img) return null;
    const karte = img.closest(".tc").getBoundingClientRect();
    const b = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return { imgMitte: b.left + b.width / 2, karteMitte: karte.left + karte.width / 2, fit: cs.objectFit, pos: cs.objectPosition };
  });
  if (!foto) { merk(false, `[${w}] Kartenfoto <img> gefunden`); }
  else {
    merk(Math.abs(foto.imgMitte - foto.karteMitte) <= 2, `[${w}] Bildmitte = Kartenmitte ± 2 px (${Math.abs(foto.imgMitte - foto.karteMitte).toFixed(1)})`);
    merk(foto.fit === "cover", `[${w}] object-fit cover (${foto.fit})`);
    // „center top" wird vom Browser als „50% 0%" normalisiert – beides heißt oben.
    merk(/top/.test(foto.pos) || /\b0%/.test(foto.pos), `[${w}] object-position oben (${foto.pos})`);
  }

  // Kein voller Nachname im DOM (nicht angemeldet).
  const dom = await page.content();
  merk(!dom.includes(CANARY), `[${w}] kein voller Nachname im DOM`);
  const namen = await page.evaluate(() => Array.from(document.querySelectorAll(".cn")).map((e) => e.textContent.trim()));
  merk(namen.length > 0 && namen.every((n) => /^[^ ]+ [A-ZÄÖÜ]\.$/.test(n) || /^[^ ]+$/.test(n)), `[${w}] Kartennamen sind „Vorname N." (${namen.join(", ")})`);

  await ctx.close();
}
await browser.close();

// Keine anon-Abfrage, die „nachname" (voll) auswählt.
const nachnameSelect = requests.filter((u) => /select=[^&]*\bnachname\b(?!_initial)/.test(decodeURIComponent(u)));
merk(nachnameSelect.length === 0, `keine anon-Abfrage wählt vollen Nachnamen (${nachnameSelect.length})`);

console.log(fehler === 0 ? "\nALLES GRÜN" : `\n${fehler} BEFUND(E)`);
if (fehler > 0) process.exit(1);
