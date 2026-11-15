// /Users/js/Projekte/Vexfit/app/vexfit/einwilligung_statistik_test.ts
//
// Baustein 15.11.2026 (Variante A): Herkunfts- und Trichter-Messung nur noch mit
// Einwilligung „Statistik". Standard AUS, getrennt von „Marketing" (Meta-Pixel);
// bestehende Marketing-Zustimmung bleibt unverfälscht.
//
// Geprüft wird (ohne echten Browser):
//   1) vexfit-trichter.js: ohne Statistik-Einwilligung kein sessionStorage und
//      kein Trichter-Beacon; mit Einwilligung wie bisher.
//   2) vexfit-consent.js: Lese-/Schreib-API der zwei Kategorien, Standard aus,
//      Marketing-Bestand bleibt; Banner-Markup hat beide Kategorien.
//   3) Die Formular-Gates (registrieren/wunsch) und die Seiten-Einbindung.
//   4) Datenschutz R2 (nur mit Einwilligung) und Abendbericht-Hinweis.
//
// Aufruf: deno test --allow-read einwilligung_statistik_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── Fake-Browser für vexfit-trichter.js ──
// deno-lint-ignore no-explicit-any
function ladeTrichter(statistik: boolean): any {
  const lsStore: Record<string, string> = {};
  if (statistik) lsStore["vexfit_statistik"] = "ja";
  const ssStore: Record<string, string> = {};
  const fetchCalls: { url: string; body: unknown }[] = [];
  // deno-lint-ignore no-explicit-any
  const g: any = {
    localStorage: {
      getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
      setItem: (k: string, v: string) => { lsStore[k] = v; },
      removeItem: (k: string) => { delete lsStore[k]; },
    },
    sessionStorage: {
      getItem: (k: string) => (k in ssStore ? ssStore[k] : null),
      setItem: (k: string, v: string) => { ssStore[k] = v; },
      removeItem: (k: string) => { delete ssStore[k]; },
    },
    location: { search: "?utm_source=ig&utm_campaign=x", hostname: "vexfit.app" },
    document: { referrer: "https://google.com/suche" },
    navigator: { userAgent: "Mozilla/5.0" },
    fetch: (url: string, opts?: { body?: string }) => {
      fetchCalls.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null });
      return Promise.resolve({ ok: true });
    },
    URLSearchParams,
    URL,
  };
  return { g, lsStore, ssStore, fetchCalls };
}
async function instanzTrichter(statistik: boolean) {
  const src = await lies("./vexfit-trichter.js");
  const { g, ssStore, fetchCalls } = ladeTrichter(statistik);
  new Function("window", "globalThis", "module", src)(g, g, undefined);
  return { g, ssStore, fetchCalls };
}

Deno.test("Trichter OHNE Statistik-Einwilligung: kein sessionStorage, kein Beacon", async () => {
  const { g, ssStore, fetchCalls } = await instanzTrichter(false);
  g.vexfitTrichter("seite", { rolle: "kunde", plz: "5020", land: "AT" });
  assertEquals(fetchCalls.length, 0, "ohne Einwilligung darf kein Beacon gesendet werden");
  assertEquals(Object.keys(ssStore).length, 0, "ohne Einwilligung nichts in sessionStorage");
});

Deno.test("Trichter MIT Statistik-Einwilligung: Beacon + sessionStorage wie bisher", async () => {
  const { g, ssStore, fetchCalls } = await instanzTrichter(true);
  g.vexfitTrichter("seite", { rolle: "kunde", plz: "5020", land: "AT" });
  assertEquals(fetchCalls.length, 1, "mit Einwilligung wird der Beacon gesendet");
  assertStringIncludes(fetchCalls[0].url, "/rest/v1/trichter_ereignisse");
  const b = fetchCalls[0].body as Record<string, unknown>;
  assertEquals(b.stufe, "seite");
  assertEquals(b.quelle, "ig");
  assertEquals(b.referrer, "google.com");
  // sessionStorage vexfit_werbung ist gesetzt.
  assert(ssStore["vexfit_werbung"], "vexfit_werbung in sessionStorage gesetzt");
  const w = JSON.parse(ssStore["vexfit_werbung"]);
  assertEquals(w.quelle, "ig");
  assertEquals(w.referrer, "google.com");
});

// ── vexfit-consent.js: Kategorie-API ──
// deno-lint-ignore no-explicit-any
async function ladeConsent(): Promise<any> {
  const src = await lies("./vexfit-consent.js");
  const lsStore: Record<string, string> = {};
  let pixelGeladen = 0;
  // deno-lint-ignore no-explicit-any
  const g: any = {
    localStorage: {
      getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
      setItem: (k: string, v: string) => { lsStore[k] = v; },
      removeItem: (k: string) => { delete lsStore[k]; },
    },
    vexfitPixelLaden: () => { pixelGeladen++; },
    // KEIN document → nur die Lese-/Schreib-API wird aktiv.
  };
  new Function("window", "globalThis", src)(g, g);
  return { vexConsent: g.vexConsent, lsStore, pixel: () => pixelGeladen };
}

Deno.test("Consent-API: Standard AUS für beide Kategorien", async () => {
  const { vexConsent } = await ladeConsent();
  assertEquals(vexConsent.hatMarketing(), false);
  assertEquals(vexConsent.hatStatistik(), false);
});

Deno.test("Consent-API: Statistik an/aus schreibt vexfit_statistik", async () => {
  const { vexConsent, lsStore } = await ladeConsent();
  vexConsent.setzeStatistik(true);
  assertEquals(lsStore["vexfit_statistik"], "ja");
  assertEquals(vexConsent.hatStatistik(), true);
  vexConsent.setzeStatistik(false);
  assertEquals(lsStore["vexfit_statistik"], "nein");
  assertEquals(vexConsent.hatStatistik(), false);
});

Deno.test("Consent-API: Marketing an lädt Pixel und setzt vexfit_consent", async () => {
  const { vexConsent, lsStore, pixel } = await ladeConsent();
  vexConsent.setzeMarketing(true);
  assertEquals(lsStore["vexfit_consent"], "zugestimmt");
  assertEquals(pixel(), 1);
  assertEquals(vexConsent.hatMarketing(), true);
});

Deno.test("Consent-API: bestehende Marketing-Zustimmung bleibt, Statistik bleibt AUS", async () => {
  const src = await lies("./vexfit-consent.js");
  const lsStore: Record<string, string> = { vexfit_consent: "zugestimmt" }; // Altbestand
  // deno-lint-ignore no-explicit-any
  const g: any = {
    localStorage: {
      getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
      setItem: (k: string, v: string) => { lsStore[k] = v; },
      removeItem: (k: string) => { delete lsStore[k]; },
    },
  };
  new Function("window", "globalThis", src)(g, g);
  assertEquals(g.vexConsent.hatMarketing(), true, "Altbestand Marketing bleibt erhalten");
  assertEquals(g.vexConsent.hatStatistik(), false, "Statistik ist für Altbestand AUS");
});

// ── Banner-Markup ──
Deno.test("vexfit-consent.js: Banner bietet Marketing UND Statistik getrennt", async () => {
  const js = await lies("./vexfit-consent.js");
  assertStringIncludes(js, 'id="ck-marketing"');
  assertStringIncludes(js, 'id="ck-statistik"');
  assertStringIncludes(js, 'id="ck-nur"');   // Nur nötige
  assertStringIncludes(js, 'id="ck-save"');  // Auswahl speichern
  assertStringIncludes(js, 'id="ck-all"');   // Alle akzeptieren
});

// ── Einbindung auf allen Banner-Seiten ──
Deno.test("alle Banner-Seiten binden vexfit-consent.js ein", async () => {
  const seiten = [
    "index.html", "suche.html", "registrieren.html", "login.html", "kunden-bereich.html",
    "trainer-bereich.html", "profil.html", "404.html", "anleitung.html", "passwort-neu.html",
    "passwort-vergessen.html", "profil-bearbeiten.html", "rechtliches.html",
  ];
  for (const s of seiten) {
    const html = await lies("./" + s);
    assertStringIncludes(html, 'src="vexfit-consent.js"', `${s} bindet vexfit-consent.js ein`);
  }
});

// ── Formular-Gates (utm aus URL ohne Einwilligung, kein Referrer/Storage) ──
Deno.test("registrieren.html + wunsch.html: Herkunft nur mit Statistik-Einwilligung aus dem Gerät", async () => {
  const reg = await lies("./registrieren.html");
  assertStringIncludes(reg, "localStorage.getItem('vexfit_statistik')");
  // Ohne Einwilligung: früher Ausstieg -> nur utm aus der URL.
  assertStringIncludes(reg, "if(!statistik) return w;");
  const wu = await lies("./wunsch.html");
  assertStringIncludes(wu, "localStorage.getItem('vexfit_statistik')");
  assertStringIncludes(wu, "if (!statistik) return w;");
});

Deno.test("direkte Trichter-Beacons sind gegatet (registrieren, trainer-bereich, trainer.html)", async () => {
  for (const [datei, muster] of [
    ["registrieren.html", "if(localStorage.getItem('vexfit_statistik')!=='ja') return;"],
    ["trainer-bereich.html", "if (localStorage.getItem('vexfit_statistik') !== 'ja') return;"],
    ["trainer.html", "statistikOk=(localStorage.getItem('vexfit_statistik')==='ja')"],
  ] as const) {
    const html = await lies("./" + datei);
    assertStringIncludes(html, muster, `${datei} gatet den Trichter-Beacon`);
  }
});

// ── Datenschutz R2 ──
Deno.test("Datenschutz R2: Messung nur mit Einwilligung, Widerruf über Cookie-Einstellungen", async () => {
  const html = await lies("./rechtliches.html");
  const start = html.indexOf("REICHWEITEN- UND HERKUNFTSMESSUNG");
  const ende = html.indexOf("WUNSCH-FORMULAR", start);
  const r2 = html.slice(start, ende);
  assertStringIncludes(r2, "Statistik");
  assertStringIncludes(r2, "Nur mit Einwilligung");
  assertStringIncludes(r2, "Art. 6 Abs. 1 lit. a DSGVO");
  assertStringIncludes(r2, "Cookie-Einstellungen");
  // utm aus der aktuellen URL beim Absenden, ohne Referrer.
  assertStringIncludes(r2, "aus der aktuell aufgerufenen Adresse");
  // Stand-Datum unverändert.
  assertStringIncludes(html, "Datenschutzerklärung gemäß DSGVO · Stand: 15. November 2026");
});

// ── Abendbericht-Hinweis ──
Deno.test("Abendbericht: Hinweis-Zeile zur Statistik-Einwilligung", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, "Zahlen nur von Besuchern mit Statistik-Einwilligung");
});
