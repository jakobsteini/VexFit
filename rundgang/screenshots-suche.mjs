// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/screenshots-suche.mjs
//
// Dauerlauf 08.11.2026 – D0/D7: Screenshots von suche.html (NICHT angemeldet)
// bei 375 und 1440 px fuer fuenf Faelle. Lokaler Server + Playwright/Chromium
// mit GEMOCKTEM Backend (Supabase + Geocoder) – keine echten Daten, keine
// Live-DB, keine Mails. Gleiche Methode wie rundgang/klick-rundgang-k9.mjs.
//
// Aufruf:
//   python3 -m http.server 8799   (im Projektordner)
//   OUT=docs/screenshots/2026-11-08/vorher  BASIS=http://localhost:8799 \
//     node rundgang/screenshots-suche.mjs
//
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASIS = process.env.BASIS || "http://localhost:8799";
const OUT = resolve(process.env.OUT || "docs/screenshots/2026-11-08/vorher");
const SB = "hbapzwxdehfgnputrfjf.supabase.co";
mkdirSync(OUT, { recursive: true });

// Ein Portrait als SVG – Kopf sitzt OBEN, damit „center" vs. „center top"
// sichtbar wird (bei cover in einer breiten, flachen Karte).
function portraitSvg(farbe) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
    <rect width="240" height="320" fill="${farbe}"/>
    <circle cx="120" cy="80" r="46" fill="#f3d9c0"/>
    <rect x="70" y="140" width="100" height="180" rx="40" fill="#2b2b2b"/>
    <text x="120" y="310" fill="#fff" font-size="16" text-anchor="middle" font-family="sans-serif">Foto</text>
  </svg>`;
}

// Trainerdaten mit land fuer D2 (Vor-Ort/Online, laenderuebergreifend).
const TRAINER = [
  { id: "t1", vorname: "Ben", nachname_initial: "B.", stadt: "Salzburg", plz: "5020", land: "AT",
    trainingsart: "Functional", trainingsort: "vor ort", spezialisierungen: ["Kraft", "Ausdauer"],
    bio: "Servus, ich bin Ben – Personal Trainer in Salzburg.", preis_stunde: 55,
    avatar_url: `https://${SB}/storage/v1/object/public/avatars/t1.svg`, verifiziert: true,
    verfuegbarkeit: null, created_at: new Date().toISOString(), sprachen: ["Deutsch"], trainingsorte: ["studio"] },
  { id: "t2", vorname: "Carla", nachname_initial: "D.", stadt: "Hallein", plz: "5400", land: "AT",
    trainingsart: "Yoga", trainingsort: "vor ort", spezialisierungen: ["Yoga", "Beweglichkeit", "Rücken"],
    bio: "Yoga und Beweglichkeit in und um Hallein.", preis_stunde: 60,
    avatar_url: null, verifiziert: false, verfuegbarkeit: null,
    created_at: new Date().toISOString(), sprachen: ["Deutsch", "Englisch"], trainingsorte: ["outdoor"] },
  { id: "t3", vorname: "Max", nachname_initial: "M.", stadt: "München", plz: "80331", land: "DE",
    trainingsart: "Online", trainingsort: "online", spezialisierungen: ["Ernährung", "Abnehmen"],
    bio: "Online-Coaching aus München – DACH-weit.", preis_stunde: 45,
    avatar_url: `https://${SB}/storage/v1/object/public/avatars/t3.svg`, verifiziert: false,
    verfuegbarkeit: null, created_at: new Date().toISOString(), sprachen: ["Deutsch"], trainingsorte: ["online"] },
  { id: "t4", vorname: "Anna", nachname_initial: "O.", stadt: "Wien", plz: "1010", land: "AT",
    trainingsart: "Online", trainingsort: "online", spezialisierungen: ["Muskelaufbau"],
    bio: "Online-Personal-Training aus Wien.", preis_stunde: 50,
    avatar_url: null, verifiziert: false, verfuegbarkeit: null,
    created_at: new Date().toISOString(), sprachen: ["Deutsch"], trainingsorte: ["online"] },
  { id: "t5", vorname: "Sven", nachname_initial: "S.", stadt: "Zürich", plz: "8001", land: "CH",
    trainingsart: "Kraft", trainingsort: "vor ort", spezialisierungen: ["Kraft", "Reha"],
    bio: "Krafttraining in Zürich.", preis_stunde: 90,
    avatar_url: `https://${SB}/storage/v1/object/public/avatars/t5.svg`, verifiziert: false,
    verfuegbarkeit: null, created_at: new Date().toISOString(), sprachen: ["Deutsch"], trainingsorte: ["studio"] },
];

// Trainer OHNE nachname_initial (fuer die oeffentliche Rueckfall-Sicht).
const OEFFENTLICH = TRAINER.map((t) => { const c = { ...t }; delete c.nachname_initial; return c; });

const GEO = {
  "at/5020": { lat: "47.80", lng: "13.04", ort: "Salzburg" },
  "at/5330": { lat: "47.82", lng: "13.29", ort: "Fuschl am See" },
  "at/5400": { lat: "47.68", lng: "13.10", ort: "Hallein" },
  "at/1010": { lat: "48.21", lng: "16.37", ort: "Wien" },
  "de/80331": { lat: "48.137", lng: "11.575", ort: "München" },
  "ch/8001": { lat: "47.374", lng: "8.541", ort: "Zürich" },
};

function mock() {
  return (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("api.zippopotam.us")) {
      const m = /zippopotam\.us\/([a-z]{2})\/(\d{4,5})/.exec(url);
      const key = m ? `${m[1]}/${m[2]}` : "";
      const g = GEO[key];
      if (g) return json({ places: [{ latitude: g.lat, longitude: g.lng, "place name": g.ort }] });
      return json({ places: [] }, 404);
    }
    if (url.includes(`${SB}/storage/v1/object/public/avatars/`)) {
      const farbe = url.includes("t1") ? "#1d3b2a" : url.includes("t3") ? "#2a2440" : "#3a2a1d";
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: portraitSvg(farbe) });
    }
    if (url.includes(SB)) {
      if (url.includes("/rest/v1/trainers_vorschau")) return json(TRAINER);
      if (url.includes("/rest/v1/trainers_oeffentlich")) return json(OEFFENTLICH);
      if (method === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      if (url.includes("/rest/v1/")) return json([]);
      return json({});
    }
    if (url.startsWith(BASIS) || url.startsWith("data:")) return route.continue();
    return route.abort();
  };
}

const FAELLE = [
  { name: "5020-at", q: "?plz=5020&land=AT" },
  { name: "5330-at", q: "?plz=5330&land=AT" },
  { name: "80331-de", q: "?plz=80331&land=DE" },
  { name: "8001-ch", q: "?plz=8001&land=CH" },
  { name: "ohne-param", q: "" },
];
const BREITEN = [375, 1440];

const browser = await chromium.launch();
for (const b of BREITEN) {
  for (const f of FAELLE) {
    const ctx = await browser.newContext({ viewport: { width: b, height: 900 } });
    // Cookie-Banner nicht aufklappen (verdeckt sonst den oberen Abschnitt).
    await ctx.addInitScript(() => { try { localStorage.setItem('vexfit_consent', 'abgelehnt'); } catch { /* kein localStorage */ } });
    await ctx.route("**/*", mock());
    const page = await ctx.newPage();
    page.setDefaultTimeout(9000);
    await page.goto(`${BASIS}/suche.html${f.q}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const datei = `${OUT}/suche-${f.name}-${b}.png`;
    await page.screenshot({ path: datei, fullPage: true });
    console.log("  ok  " + datei);
    await ctx.close();
  }
}
await browser.close();
console.log("fertig:", OUT);
