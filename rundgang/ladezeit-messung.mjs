// deno-lint-ignore-file
// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/ladezeit-messung.mjs
//
// Dauerlauf 05./06.11.2026 – B5: reproduzierbare Ladezeit-Messung mobil.
// Misst index.html, registrieren.html, trainer.html und trainer-bereich.html
// unter MOBIL + Slow-4G-Drosselung mit Playwright/Chromium. Für jede Seite:
//   * First Contentful Paint (FCP),
//   * DOMContentLoaded (DCL) und Load,
//   * Anzahl Requests und übertragene Bytes der EIGENEN Assets.
//
// Determinismus: alle NICHT-localhost-Requests (Supabase, Meta-Pixel) werden
// abgebrochen – gemessen wird die eigene Nutzlast, nicht das Netz Dritter. Die
// Supabase-Aufrufe laufen ohnehin erst nach dem Laden und sind best effort.
//
// Drosselung (Lighthouse „Mobile Slow 4G", dokumentiert für Wiederholbarkeit):
//   download 1.6 Mbit/s, upload 750 Kbit/s, RTT 150 ms, CPU 4×.
//   Gerät: 390×844, devicePixelRatio 3, Touch, mobiler User-Agent.
//
// VORAUSSETZUNG: Playwright + Chromium. Einmalig:
//   npm i -D playwright@1.65.0 && npx playwright install chromium
// Statischer Server im Projektordner (anderes Terminal):
//   python3 -m http.server 8799
// Start:
//   node rundgang/ladezeit-messung.mjs            (misst http://localhost:8799)
//   BASIS=http://localhost:8799 node rundgang/ladezeit-messung.mjs
//
// Gibt eine Tabelle aus und schreibt sie als JSON nach
// rundgang/ladezeit-<zeit>.json. Exit 1, wenn eine Seite nicht lädt.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASIS = process.env.BASIS || "http://localhost:8799";
const SEITEN = [
  { name: "index.html", url: `${BASIS}/index.html` },
  { name: "registrieren.html?typ=trainer", url: `${BASIS}/registrieren.html?typ=trainer&utm_source=meta&utm_campaign=test` },
  { name: "trainer.html (Landing)", url: `${BASIS}/trainer.html?utm_source=meta&utm_campaign=test` },
  { name: "trainer-bereich.html", url: `${BASIS}/trainer-bereich.html` },
];

// Lighthouse „Mobile Slow 4G".
const DROSSEL = {
  downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.floor((750 * 1024) / 8),
  latency: 150,
};
const CPU_DROSSEL = 4;

function ms(n) { return n == null ? "–" : Math.round(n) + " ms"; }
function kb(n) { return (n / 1024).toFixed(1) + " KB"; }

async function messeSeite(browser, seite) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", { offline: false, ...DROSSEL });
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_DROSSEL });

  let requests = 0, bytes = 0;
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (!url.startsWith(BASIS)) return; // nur eigene Assets zählen
    requests++;
    try { const sizes = await req.sizes(); bytes += (sizes.responseBodySize || 0) + (sizes.responseHeadersSize || 0); } catch {}
  });
  // Fremde Hosts (Supabase, Meta) für die Messung abbrechen.
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(BASIS) || u.startsWith("data:")) return route.continue();
    return route.abort();
  });

  const t0 = Date.now();
  const resp = await page.goto(seite.url, { waitUntil: "load", timeout: 60000 });
  if (!resp || !resp.ok()) throw new Error(`${seite.name}: HTTP ${resp && resp.status()}`);
  // Auf FCP warten (max 10 s).
  const metriken = await page.evaluate(async () => {
    const hole = (typ, name) => performance.getEntriesByType(typ).find((e) => e.name === name);
    await new Promise((r) => {
      if (performance.getEntriesByName("first-contentful-paint").length) return r();
      new PerformanceObserver((list, obs) => { if (list.getEntriesByName("first-contentful-paint").length) { obs.disconnect(); r(); } }).observe({ type: "paint", buffered: true });
      setTimeout(r, 10000);
    });
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      fcp: fcp ? fcp.startTime : null,
      dcl: nav.domContentLoadedEventEnd || null,
      load: nav.loadEventEnd || null,
    };
  });
  const dauer = Date.now() - t0;
  await context.close();
  return { ...seite, ...metriken, requests, bytes, wanduhr: dauer };
}

const LAEUFE = Number(process.env.LAEUFE || 3);
const median = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };

const browser = await chromium.launch({ headless: true });
const ergebnisse = [];
let fehler = false;
for (const seite of SEITEN) {
  try {
    const laeufe = [];
    for (let i = 0; i < LAEUFE; i++) laeufe.push(await messeSeite(browser, seite));
    const r = {
      ...seite,
      fcp: median(laeufe.map((x) => x.fcp)),
      dcl: median(laeufe.map((x) => x.dcl)),
      load: median(laeufe.map((x) => x.load)),
      requests: laeufe[0].requests,
      bytes: laeufe[0].bytes,
      laeufe: laeufe.length,
    };
    ergebnisse.push(r);
    console.log(
      `${r.name.padEnd(34)} FCP ${ms(r.fcp).padStart(8)} | DCL ${ms(r.dcl).padStart(8)} | Load ${ms(r.load).padStart(8)} | ${String(r.requests).padStart(2)} Req | ${kb(r.bytes).padStart(9)}  (Median aus ${r.laeufe})`,
    );
  } catch (e) {
    fehler = true;
    console.error(`${seite.name}: FEHLER ${e.message}`);
  }
}
await browser.close();

const datei = new URL(`ladezeit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url);
writeFileSync(datei, JSON.stringify({ basis: BASIS, drossel: { ...DROSSEL, cpu: CPU_DROSSEL }, zeit: new Date().toISOString(), ergebnisse }, null, 2));
console.log("\nGeschrieben:", datei.pathname);
process.exit(fehler ? 1 : 0);
