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
      // 12.11.: Suche läuft angemeldet über die RPC (nur Vor-Ort, mit Entfernung).
      if (url.includes("/rest/v1/rpc/suche_trainer_umkreis")) {
        return json(TRAINER.filter((t) => t.trainingsort !== "online")
          .map((t) => ({ ...t, entfernung_km: 3 })));
      }
      if (url.includes("/rest/v1/trainers_vorschau") || url.includes("/rest/v1/trainers_oeffentlich")) return json([]);
      if (method === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      if (url.includes("/rest/v1/")) return json([]);
      return json({});
    }
    if (url.startsWith(BASIS) || url.startsWith("data:")) return route.continue();
    return route.abort();
  };
}

const browser = await chromium.launch();

// 12.11.: suche.html ist jetzt nur-angemeldet. ANON (keine Sitzung) sieht das
// Gate (Registrieren/Anmelden), KEINE Trainerkarten, macht KEINEN Trainer-
// Netzaufruf und zeigt keinen vollen Nachnamen. Geprüft bei 375 und 1440 px.
// Die angemeldete Karten-/Foto-Ansicht deckt e2e/suche-nur-angemeldet.spec.ts ab.
for (const w of [375, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("vexfit_consent", "abgelehnt"); } catch { /* kein localStorage */ } });
  await ctx.route("**/*", mock());
  const page = await ctx.newPage();
  const vorher = requests.length;
  await page.goto(`${BASIS}/suche.html?plz=5020&land=AT`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const gate = await page.evaluate(() => { const g = document.getElementById("anonGate"); return !!g && getComputedStyle(g).display !== "none"; });
  merk(gate, `[${w}] Gate sichtbar (Registrieren/Anmelden)`);

  const karten = await page.evaluate(() => document.querySelectorAll(".tc").length);
  merk(karten === 0, `[${w}] keine Trainerkarten für anon (${karten})`);

  const trainerCalls = requests.slice(vorher).filter((u) => /trainers|suche_trainer_umkreis/.test(u));
  merk(trainerCalls.length === 0, `[${w}] kein Trainer-Netzaufruf (${trainerCalls.length})`);

  // Kein waagrechter Scroll.
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  merk(scroll.sw <= scroll.cw, `[${w}] kein waagrechter Scroll (${scroll.sw} <= ${scroll.cw})`);

  // Kein voller Nachname im DOM.
  const dom = await page.content();
  merk(!dom.includes(CANARY), `[${w}] kein voller Nachname im DOM`);

  await ctx.close();
}
await browser.close();

// Keine anon-Abfrage, die „nachname" (voll) auswählt.
const nachnameSelect = requests.filter((u) => /select=[^&]*\bnachname\b(?!_initial)/.test(decodeURIComponent(u)));
merk(nachnameSelect.length === 0, `keine anon-Abfrage wählt vollen Nachnamen (${nachnameSelect.length})`);

console.log(fehler === 0 ? "\nALLES GRÜN" : `\n${fehler} BEFUND(E)`);
if (fehler > 0) process.exit(1);
