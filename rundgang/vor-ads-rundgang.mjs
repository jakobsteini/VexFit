// deno-lint-ignore-file no-window require-await
// Hinweis: Dieses Skript laeuft mit Node + Playwright, nicht mit Deno. Die
// `window`-Zugriffe stehen in page.evaluate()-Rueckrufen und laufen im Browser;
// supabaseMock ist fuer die Playwright-Route-Signatur bewusst async. Deno-Lint
// kennt diesen Kontext nicht - daher die Ausnahme oben.
//
// /Users/js/Projekte/Vexfit/app/vexfit/rundgang/vor-ads-rundgang.mjs
//
// Ablauf-Rundgang fuer den Baustein "Letzter Schliff vor Ads-Start".
// Treibt die ECHTEN Seiten aus dem Arbeitsordner, bedient aber JEDEN Aufruf an
// *.supabase.co per page.route mit nachgestellten (gemockten) Antworten - es
// werden keine Daten geschrieben und keine Mails verschickt. Jeder Ablauf wird
// bei 390 px und 1440 px geprueft. Bei einer gescheiterten Pruefung endet das
// Skript mit Code 1.
//
// ──────────────────────────────────────────────────────────────────────────
// VORAUSSETZUNG: Playwright. In diesem Projekt ist Playwright derzeit NICHT
// eingerichtet (kein package.json/node_modules, die Deno-Tests sind die
// primaere Pruefung). Einmalig einrichten und dann starten:
//
//   cd /Users/js/Projekte/Vexfit/app/vexfit
//   npm init -y && npm i -D playwright && npx playwright install chromium
//   node rundgang/vor-ads-rundgang.mjs
//
// Ein lokaler Dateiserver wird vom Skript selbst gestartet (Deno, Port 8099);
// mit eigenem Server: BASE=http://localhost:PORT node rundgang/vor-ads-rundgang.mjs
// ──────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, "..");
const PORT = 8099;
const BASE = process.env.BASE || `http://localhost:${PORT}`;
const EIGENER_SERVER = !process.env.BASE;

const BREITEN = [
  { name: "390", w: 390, h: 844 },
  { name: "1440", w: 1440, h: 900 },
];

let fehler = 0;
const merk = (ok, text) => {
  console.log((ok ? "  OK  " : "FEHLT ") + text);
  if (!ok) fehler++;
};

// ── Nachgestellte Supabase-Antworten ────────────────────────────────────────
// Das Szenario bestimmt, welches Trainerprofil / welche Anfragen kommen.
const SB = "https://hbapzwxdehfgnputrfjf.supabase.co";
let szenario = "vollstaendig";

function trainerDatensatz() {
  const basis = {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    vorname: "Testi",
    nachname: "Trainer",
    email: "testi@example.com",
    stadt: "Salzburg",
    plz: "5020",
    aktiv: true,
    stripe_bezahlt: false,
    studio_standort_id: null,
    avatar_url: SB + "/storage/v1/object/public/avatars/22222222-2222-2222-2222-222222222222/avatar.jpg",
    bio: "Ich bin Personal Trainer in Salzburg und helfe dir zu deinem Ziel.",
    spezialisierungen: ["Muskelaufbau", "Abnehmen"],
    trainingsart: "Personal Training",
    trainingsort: "beides",
    preis_stunde: 60,
    erfahrung: "3-5 Jahre",
    telefon: "telefon vorhanden",
    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    galerie: ["g1"],
    sprachen: ["Deutsch"],
    trainingsorte: ["Studio"],
    zertifikat_datei: "z1",
    verifiziert: true,
  };
  if (szenario === "ohne_foto") return { ...basis, avatar_url: null, aktiv: true };
  if (szenario === "ohne_freigabe") return { ...basis, aktiv: false };
  return basis;
}

const oeffentlicheTrainer = [
  {
    id: "aaaa1111-1111-1111-1111-111111111111",
    vorname: "Anna", nachname: "Berg", stadt: "Salzburg", plz: "5020",
    trainingsart: "Personal Training", trainingsort: "beides",
    spezialisierungen: ["Abnehmen"], bio: "Hallo, ich bin Anna.",
    preis_stunde: 55, avatar_url: SB + "/x.jpg", verifiziert: true, created_at: new Date().toISOString(),
  },
  {
    id: "bbbb2222-2222-2222-2222-222222222222",
    vorname: "Ben", nachname: "Stein", stadt: "Salzburg", plz: "5020",
    trainingsart: "Online Coaching", trainingsort: "online",
    spezialisierungen: ["Ausdauer"], bio: "Servus, ich bin Ben.",
    preis_stunde: 45, avatar_url: SB + "/y.jpg", verifiziert: false, created_at: new Date().toISOString(),
  },
];

async function supabaseMock(route) {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  // Storage-Upload (Avatar): einfach bestaetigen.
  if (url.includes("/storage/v1/object/")) {
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"Key":"ok"}' });
  }
  // Trainerprofil laden.
  if (url.includes("/rest/v1/trainers?") && method === "GET") return json([trainerDatensatz()]);
  // Trainerprofil speichern / Avatar-Adresse.
  if (url.includes("/rest/v1/trainers?") && method === "PATCH") {
    let body = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch { /* egal */ }
    return json([{ ...trainerDatensatz(), ...body }]);
  }
  // Anfragen (leer).
  if (url.includes("/rest/v1/anfragen")) return json([]);
  // Oeffentliche Trainerliste (Suche).
  if (url.includes("/rest/v1/trainers_oeffentlich")) return json(oeffentlicheTrainer);
  // RPCs / Edge Functions: stumm bestaetigen.
  if (url.includes("/rest/v1/rpc/") || url.includes("/functions/v1/")) return json({});
  // Alles Uebrige vom selben Host: leeres OK.
  return json({});
}

// ── Hilfen fuer die Pruefungen ──────────────────────────────────────────────
async function neueSeite(context) {
  const page = await context.newPage();
  const konsolenFehler = [];
  page.on("console", (m) => { if (m.type() === "error") konsolenFehler.push(m.text()); });
  page.on("pageerror", (e) => konsolenFehler.push(String(e)));
  await page.route("**/*.supabase.co/**", supabaseMock);
  return { page, konsolenFehler };
}

async function pruefeLayout(page, breiteName, name) {
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const fensterW = await page.evaluate(() => window.innerWidth);
  merk(scrollW <= fensterW + 1, `${name} @${breiteName}: kein horizontales Scrollen (${scrollW} <= ${fensterW})`);
  // Abgeschnittener Text in Knoepfen (scrollWidth deutlich groesser als clientWidth).
  const abgeschnitten = await page.evaluate(() =>
    [...document.querySelectorAll("button, a.btn-next, .btn-save, .btn-stripe")]
      .filter((b) => b.offsetParent !== null && b.scrollWidth > b.clientWidth + 2).length);
  merk(abgeschnitten === 0, `${name} @${breiteName}: kein abgeschnittener Knopftext (${abgeschnitten})`);
}

async function session(page, rolle = "trainer") {
  await page.addInitScript((r) => {
    localStorage.setItem("vexfit_session", JSON.stringify({
      role: r, email: "testi@example.com", access_token: "tok",
      user_id: "22222222-2222-2222-2222-222222222222",
    }));
    localStorage.setItem("vexfit_consent", "abgelehnt");
  }, rolle);
}

async function schuss(page, name) {
  await page.screenshot({ path: join(HIER, `vor-ads-${name}.jpg`), type: "jpeg", quality: 70 });
}

// ── Ablaeufe ─────────────────────────────────────────────────────────────────
async function ablaufTrainer(context, breite) {
  // a) Trainer: Bild waehlen -> Upload ohne weiteren Klick; dann Profil -> Anfragen.
  szenario = "vollstaendig";
  const { page, konsolenFehler } = await neueSeite(context);
  await session(page, "trainer");
  await page.setViewportSize({ width: breite.w, height: breite.h });
  await page.goto(`${BASE}/trainer-bereich.html`, { waitUntil: "networkidle" });

  // Vollstaendiges Profil: beide Leisten (orange + gruen) sind aus, die drei
  // Zahlen stimmen ueberein.
  const pct = (sel) => page.evaluate((s) => (document.querySelector(s)?.textContent || "").trim(), sel);
  const balken = await pct("#pctLabel");
  const uebersicht = await pct("#ubProfil");
  merk(balken === uebersicht, `${breite.name}: Balken (${balken}) == Uebersicht (${uebersicht})`);
  const gruenAus = await page.evaluate(() => document.getElementById("miniBanner")?.classList.contains("hidden"));
  merk(gruenAus === true, `${breite.name}: bei 100 % keine gruene Leiste`);

  // Bild waehlen -> Sofort-Upload (ohne weiteren Klick): Dateieingabe setzen.
  const pngB64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await page.setInputFiles("#fAvatar", {
    name: "avatar.png", mimeType: "image/png", buffer: Buffer.from(pngB64, "base64"),
  });
  // Es gibt keinen Hochladen-Knopf; der Upload laeuft allein ueber das change-Ereignis.
  const keinKnopf = await page.evaluate(() => !document.getElementById("btnAvatarUpload"));
  merk(keinKnopf, `${breite.name}: kein 'Hochladen'-Knopf vorhanden`);
  await page.waitForTimeout(400);
  const vorschau = await page.evaluate(() => (document.getElementById("avatarPreview")?.style.backgroundImage || ""));
  merk(/url\(/.test(vorschau), `${breite.name}: Vorschau zeigt ein Bild nach dem Waehlen`);

  await schuss(page, `trainer-profil-${breite.name}`);

  // Zu den Anfragen wechseln.
  await page.evaluate(() => window.showPage && window.showPage("anfragen"));
  await page.waitForTimeout(100);
  await pruefeLayout(page, breite.name, "trainer-anfragen");
  await schuss(page, `trainer-anfragen-${breite.name}`);

  // a2) Fehlendes Foto -> orange Zeile "erscheint noch nicht in der Suche".
  szenario = "ohne_foto";
  const { page: p2, konsolenFehler: kf2 } = await neueSeite(context);
  await session(p2, "trainer");
  await p2.setViewportSize({ width: breite.w, height: breite.h });
  await p2.goto(`${BASE}/trainer-bereich.html`, { waitUntil: "networkidle" });
  await p2.evaluate(() => window.showPage && window.showPage("anfragen"));
  await p2.waitForTimeout(100);
  const orange = await p2.evaluate(() => {
    const el = document.getElementById("ubHinweis");
    return el && !el.classList.contains("hidden") && el.className.includes("suche-warnung") &&
      /erscheint noch nicht in der Suche/.test(el.textContent || "");
  });
  merk(orange, `${breite.name}: ohne Foto erscheint die orange 'nicht in der Suche'-Zeile`);
  await pruefeLayout(p2, breite.name, "trainer-ohne-foto");
  merk(kf2.length === 0, `${breite.name}: keine Konsolenfehler (ohne Foto): ${kf2.join(" | ")}`);
  await p2.close();

  merk(konsolenFehler.length === 0, `${breite.name}: keine Konsolenfehler (Trainer): ${konsolenFehler.join(" | ")}`);
  await page.close();
}

async function ablaufFreigabe(context, breite) {
  // b) Trainer ohne Freigabe (aktiv=false): Freigabe-Hinweis sichtbar, getrennt.
  szenario = "ohne_freigabe";
  const { page, konsolenFehler } = await neueSeite(context);
  await session(page, "trainer");
  await page.setViewportSize({ width: breite.w, height: breite.h });
  await page.goto(`${BASE}/trainer-bereich.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.showPage && window.showPage("anfragen"));
  await page.waitForTimeout(150);
  const freigabe = await page.evaluate(() =>
    /wird noch geprüft/i.test(document.getElementById("statusBarEl")?.textContent || ""));
  merk(freigabe, `${breite.name}: Freigabe-Hinweis (aktiv=false) sichtbar`);
  await pruefeLayout(page, breite.name, "trainer-freigabe");
  await schuss(page, `trainer-freigabe-${breite.name}`);
  merk(konsolenFehler.length === 0, `${breite.name}: keine Konsolenfehler (Freigabe): ${konsolenFehler.join(" | ")}`);
  await page.close();
}

async function ablaufKunde(context, breite) {
  // c) Kunde: leere Registrierung -> Fehler; Suche mit zwei Trainern -> Karten.
  const { page, konsolenFehler } = await neueSeite(context);
  await page.setViewportSize({ width: breite.w, height: breite.h });
  await page.goto(`${BASE}/registrieren.html?typ=kunde`, { waitUntil: "networkidle" });
  // Leer abschicken -> Fehlermeldung.
  await page.evaluate(() => window.submitClient && window.submitClient());
  await page.waitForTimeout(100);
  const fehlerSichtbar = await page.evaluate(() => {
    const e = document.getElementById("c-error") || document.querySelector(".error-banner");
    return !!e && (e.offsetParent !== null || (e.textContent || "").length > 0);
  });
  merk(fehlerSichtbar, `${breite.name}: leere Kundenregistrierung zeigt einen Fehler`);
  await pruefeLayout(page, breite.name, "kunde-registrieren");

  // Suche: zwei nachgestellte Trainer -> Karten sichtbar.
  await page.goto(`${BASE}/suche.html?plz=5020`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const karten = await page.evaluate(() => document.querySelectorAll(".tc, .trainer-card, [class*='card']").length);
  merk(karten >= 1, `${breite.name}: Suche zeigt Trainerkarten (${karten})`);
  await pruefeLayout(page, breite.name, "kunde-suche");
  await schuss(page, `kunde-suche-${breite.name}`);
  merk(konsolenFehler.length === 0, `${breite.name}: keine Konsolenfehler (Kunde): ${konsolenFehler.join(" | ")}`);
  await page.close();
}

async function ablaufSeiten(context, breite) {
  // d) Oeffentliche Seiten laden ohne Konsolenfehler, Layout passt.
  const seiten = ["index.html", "suche.html", "registrieren.html?typ=trainer", "registrieren.html?typ=kunde", "login.html"];
  for (const s of seiten) {
    const { page, konsolenFehler } = await neueSeite(context);
    await page.setViewportSize({ width: breite.w, height: breite.h });
    const resp = await page.goto(`${BASE}/${s}`, { waitUntil: "networkidle" });
    merk(!!resp && resp.status() < 400, `${breite.name}: ${s} laedt (Status ${resp ? resp.status() : "?"})`);
    await pruefeLayout(page, breite.name, s);
    merk(konsolenFehler.length === 0, `${breite.name}: ${s} ohne Konsolenfehler: ${konsolenFehler.join(" | ")}`);
    await page.close();
  }
}

// ── Server + Lauf ────────────────────────────────────────────────────────────
async function warteAufServer(url, versuche = 50) {
  for (let i = 0; i < versuche; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* warten */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  let server = null;
  if (EIGENER_SERVER) {
    server = spawn("deno", ["run", "--allow-net", "--allow-read", "jsr:@std/http/file-server", "-p", String(PORT)],
      { cwd: WURZEL, stdio: "ignore" });
    const da = await warteAufServer(`${BASE}/index.html`);
    if (!da) { console.error("Lokaler Server kam nicht hoch."); process.exit(1); }
  }
  const browser = await chromium.launch();
  try {
    for (const breite of BREITEN) {
      const context = await browser.newContext({ viewport: { width: breite.w, height: breite.h } });
      console.log(`\n=== Breite ${breite.name} px ===`);
      await ablaufTrainer(context, breite);
      await ablaufFreigabe(context, breite);
      await ablaufKunde(context, breite);
      await ablaufSeiten(context, breite);
      await context.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log(`\nErgebnis: ${fehler === 0 ? "ALLES GRUEN" : fehler + " Pruefung(en) gescheitert"}`);
  process.exit(fehler === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
