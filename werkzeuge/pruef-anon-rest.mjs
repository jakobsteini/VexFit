// /Users/js/Projekte/Vexfit/app/vexfit/werkzeuge/pruef-anon-rest.mjs
//
// Dauerlauf 08.11.2026 – Live-Prüfung: sieht ein NICHT angemeldeter Besucher
// (Rolle anon) irgendwo den vollen Nachnamen? NUR LESEND (GET), keine
// Schreibzugriffe, keine DB-Änderung. Exit-Code 1, wenn ein Fall durchfällt.
//
// NACH dem Einspielen von 2026-11-08-03 ausführen – dann müssen a, b, c, d
// BESTANDEN sein. VOR dem Einspielen fallen a/b (und d) ABSICHTLICH durch und
// beweisen damit, dass der Schutz noch fehlt.
//
// URL und öffentlicher anon-Schlüssel werden aus suche.html GELESEN (wo sie
// ohnehin ausgeliefert werden) – sie werden hier NICHT neu hinterlegt.
//
// Aufruf:  cd /Users/js/Projekte/Vexfit/app/vexfit && node werkzeuge/pruef-anon-rest.mjs
//   Umgebungsvariablen (optional):
//     LIVE=https://vexfit.app   (Seiten-Basis für Fall d; Standard vexfit.app)
//     OHNE_D=1                  (Fall d / Playwright überspringen)
import { readFile } from "node:fs/promises";

const wurzel = new URL("../", import.meta.url);
const html = await readFile(new URL("suche.html", wurzel), "utf8");
const SUPABASE_URL = (html.match(/const SUPABASE_URL = '([^']+)'/) || [])[1];
const SUPABASE_KEY = (html.match(/const SUPABASE_KEY = '([^']+)'/) || [])[1];
const LIVE = process.env.LIVE || "https://vexfit.app";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("FEHLER: SUPABASE_URL/SUPABASE_KEY nicht aus suche.html lesbar.");
  process.exit(2);
}

let fehler = 0;
const merk = (ok, text) => {
  console.log(`  ${ok ? "BESTANDEN  " : "DURCHGEFALLEN"}  ${text}`);
  if (!ok) fehler++;
};
const kopf = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
const rest = (pfad) => fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, { headers: kopf });

console.log(`anon-REST gegen ${SUPABASE_URL}\n`);

// a) trainers_oeffentlich?select=nachname  -> MUSS fehlschlagen (kein nachname).
try {
  const res = await rest("trainers_oeffentlich?select=nachname&limit=1");
  const txt = await res.text();
  const leckt = res.status === 200 && /"nachname"\s*:/.test(txt);
  merk(res.status !== 200 && !leckt,
    `a) trainers_oeffentlich?select=nachname -> Fehlerstatus (ist ${res.status}${leckt ? ", LECK: nachname im Body" : ""})`);
} catch (e) { merk(false, `a) Netzwerkfehler: ${e.message}`); }

// b) trainers?select=nachname  -> anon darf trainers gar nicht lesen; kein
//    nachname in der Antwort.
try {
  const res = await rest("trainers?select=nachname&limit=1");
  const txt = await res.text();
  const leckt = res.status === 200 && /"nachname"\s*:\s*"[^"]/.test(txt);
  merk(!leckt, `b) trainers?select=nachname -> kein nachname (Status ${res.status}${leckt ? ", LECK" : ""})`);
} catch (e) { merk(false, `b) Netzwerkfehler: ${e.message}`); }

// c) trainers_vorschau?select=vorname,nachname_initial -> Status 200,
//    nachname_initial vorhanden (oder leere Liste, falls kein aktiver Trainer).
try {
  const res = await rest("trainers_vorschau?select=vorname,nachname_initial&limit=1");
  const daten = res.ok ? await res.json() : null;
  const ok = res.status === 200 && Array.isArray(daten) &&
    (daten.length === 0 || Object.prototype.hasOwnProperty.call(daten[0], "nachname_initial"));
  merk(ok, `c) trainers_vorschau?select=vorname,nachname_initial -> 200 + nachname_initial (Status ${res.status}, Zeilen ${Array.isArray(daten) ? daten.length : "?"})`);
} catch (e) { merk(false, `c) Netzwerkfehler: ${e.message}`); }

// d) Live-Seiten (nicht angemeldet): suche.html + eine aktive Profilseite.
//    Kein voller Nachname in DOM, Meta, JSON-LD oder in REST-Antworten.
if (process.env.OHNE_D === "1") {
  console.log("  (übersprungen) d) Playwright (OHNE_D=1)");
} else {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { chromium = null; console.log("  (übersprungen) d) playwright nicht installiert"); }

  if (chromium) {
    // Eine aktive Trainer-id für die Profilseite finden.
    let id = null;
    try {
      const r = await rest("trainers_vorschau?select=id&limit=1");
      const j = r.ok ? await r.json() : [];
      id = Array.isArray(j) && j[0] ? j[0].id : null;
    } catch { /* unten als übersprungen behandelt */ }

    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      ctx.addInitScript(() => { try { localStorage.setItem("vexfit_consent", "abgelehnt"); } catch { /* egal */ } });

      // REST-Antworten einsammeln: keine darf ein gefülltes nachname-Feld haben.
      const restLeck = [];
      ctx.on("response", async (resp) => {
        const u = resp.url();
        if (!u.includes("/rest/v1/")) return;
        try {
          const ct = resp.headers()["content-type"] || "";
          if (!ct.includes("json")) return;
          const body = await resp.json();
          const zeilen = Array.isArray(body) ? body : [body];
          for (const z of zeilen) {
            if (z && typeof z === "object" && typeof z.nachname === "string" && z.nachname.trim().length > 1) {
              restLeck.push(`${z.nachname} @ ${u.split("?")[0].split("/rest/v1/")[1]}`);
            }
          }
        } catch { /* kein JSON */ }
      });

      const page = await ctx.newPage();
      await page.goto(`${LIVE}/suche.html?plz=5020&land=AT`, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1200);
      if (id) {
        await page.goto(`${LIVE}/profil.html?id=${encodeURIComponent(id)}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(1200);
      }

      merk(restLeck.length === 0,
        `d) keine REST-Antwort liefert vollen Nachnamen${restLeck.length ? " (LECK: " + restLeck.slice(0, 3).join("; ") + ")" : ""}`);

      // JSON-LD + Namens-Meta: Name nur „Vorname I." oder einwortig.
      const befunde = await page.evaluate(() => {
        const schlecht = [];
        const vollname = /^\p{Lu}[\p{Ll}]+\s+\p{Lu}[\p{Ll}]{2,}/u; // „Max Mustermann"
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
          let d; try { d = JSON.parse(s.textContent); } catch { continue; }
          const namen = [];
          const sammle = (o) => {
            if (!o || typeof o !== "object") return;
            if (typeof o.name === "string") namen.push(o.name);
            for (const v of Object.values(o)) (Array.isArray(v) ? v : [v]).forEach(sammle);
          };
          sammle(d);
          namen.filter((n) => vollname.test(n)).forEach((n) => schlecht.push("JSON-LD name: " + n));
        }
        for (const m of document.querySelectorAll('meta[property="og:title"], meta[name="description"]')) {
          // Nur melden, wenn ein ausgeschriebener Vor+Nachname im Meta steht.
          if (vollname.test(m.content || "")) schlecht.push(`${m.getAttribute("property") || m.name}: ${m.content}`);
        }
        return schlecht;
      });
      merk(befunde.length === 0,
        `d) kein voller Name in JSON-LD/Meta${befunde.length ? " (" + befunde.slice(0, 3).join("; ") + ")" : ""}${id ? "" : " [ohne Profilseite: keine aktive Trainer-id gefunden]"}`);
    } finally {
      await browser.close();
    }
  }
}

console.log(fehler === 0 ? "\nERGEBNIS: alle Fälle BESTANDEN" : `\nERGEBNIS: ${fehler} Fall/Fälle DURCHGEFALLEN`);
process.exit(fehler === 0 ? 0 : 1);
