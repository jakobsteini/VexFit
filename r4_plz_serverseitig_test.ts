// /Users/js/Projekte/Vexfit/app/vexfit/r4_plz_serverseitig_test.ts
//
// Baustein R4 (15.11.2026) – PLZ-Auflösung serverseitig.
// Der Browser rief den externen Standortdienst (api.zippopotam.us) bisher DIREKT
// auf; dabei erhielt der Dienst zwangsläufig die IP-Adresse und Browserangaben
// des Besuchers. Jetzt läuft die Auflösung über den eigenen Edge-Endpunkt
// /plz-aufloesen (ÖFFENTLICH, Bremse je IP), der nur Ort + Koordinaten liefert.
//
// Geprüft wird (ohne Netz/DB):
//   1) der Edge-Endpunkt (Treffer/unbekannt/netzfehler/ungültig, öffentlich),
//   2) die Bremse je IP,
//   3) dass im ausgelieferten JS „zippopotam" nicht mehr vorkommt und der
//      Browser den eigenen Endpunkt /plz-aufloesen aufruft,
//   4) die Funktionsparität der Browser-Auflösung über den Endpunkt (gestubbt).
//
// Aufruf: deno test --allow-read r4_plz_serverseitig_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  bearbeiten,
  PLZ_ABFRAGEN_PRO_STUNDE,
  plzRatenGrenze,
  type Anschluesse,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const SALZBURG = { lat: 47.80, lng: 13.04 };

// Anschluss-Attrappe für /plz-aufloesen (Zwischenspeicher → Dienst).
function plzAnschluss(extra: Partial<Anschluesse> = {}): Anschluesse {
  return {
    plzOrtLesen: () => Promise.resolve(null),
    plzAbrufExtern: () => Promise.resolve({ ort: "Salzburg", lat: SALZBURG.lat, lng: SALZBURG.lng }),
    plzOrtSpeichern: () => Promise.resolve(),
    ...extra,
  } as unknown as Anschluesse;
}

// POST /plz-aufloesen ohne Anmeldung (öffentlich). ip setzt X-Forwarded-For.
async function rufPlz(body: unknown, a: Anschluesse, ip = ""): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  const r = new Request("https://x/functions/v1/vexfit-automation/plz-aufloesen", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return await bearbeiten(r, a);
}

// ── 1) Edge-Endpunkt ──
Deno.test("/plz-aufloesen: Treffer → 200 nur Ort + Koordinaten (öffentlich, ohne Token)", async () => {
  const res = await rufPlz({ plz: "5020", land: "AT" }, plzAnschluss());
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertEquals(d.stadt, "Salzburg");
  assertEquals(d.land, "AT");
  assertEquals(d.lat, SALZBURG.lat);
  assertEquals(d.lng, SALZBURG.lng);
  // Nur Ort + Koordinaten – keine weiteren Felder.
  assertEquals(Object.keys(d).sort().join(","), "land,lat,lng,ok,stadt");
});

Deno.test("/plz-aufloesen: fünfstellige PLZ im Land DE wird aufgelöst", async () => {
  const a = plzAnschluss({ plzAbrufExtern: () => Promise.resolve({ ort: "Berlin", lat: 52.52, lng: 13.405 }) });
  const res = await rufPlz({ plz: "10115", land: "DE" }, a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.stadt, "Berlin");
  assertEquals(d.land, "DE");
});

Deno.test("/plz-aufloesen: unbekannte PLZ → 404 { unbekannt } (keine erfundenen Koordinaten)", async () => {
  const a = plzAnschluss({ plzAbrufExtern: () => Promise.resolve(null) });
  const res = await rufPlz({ plz: "9999", land: "AT" }, a);
  assertEquals(res.status, 404);
  assertEquals((await res.json()).unbekannt, true);
});

Deno.test("/plz-aufloesen: Dienst nicht erreichbar → 503 { netzfehler }", async () => {
  const a = plzAnschluss({ plzAbrufExtern: () => Promise.resolve({ netzfehler: true as const }) });
  const res = await rufPlz({ plz: "5020", land: "AT" }, a);
  assertEquals(res.status, 503);
  assertEquals((await res.json()).netzfehler, true);
});

Deno.test("/plz-aufloesen: fehlendes/ungültiges Land oder PLZ → 400", async () => {
  const ohneLand = await rufPlz({ plz: "5020" }, plzAnschluss());
  assertEquals(ohneLand.status, 400);
  const schlechtesLand = await rufPlz({ plz: "5020", land: "FR" }, plzAnschluss());
  assertEquals(schlechtesLand.status, 400);
  const schlechtePlz = await rufPlz({ plz: "50", land: "AT" }, plzAnschluss());
  assertEquals(schlechtePlz.status, 400);
});

// ── 2) Bremse je IP ──
Deno.test(`plzRatenGrenze: ab ${PLZ_ABFRAGEN_PRO_STUNDE + 1}. Abfrage greift`, () => {
  const ip = "198.51.100.7";
  const t0 = 1_000_000;
  for (let i = 0; i < PLZ_ABFRAGEN_PRO_STUNDE; i++) {
    assert(plzRatenGrenze(ip, t0 + i) === false, `Abfrage ${i + 1} darf durch`);
  }
  assert(plzRatenGrenze(ip, t0 + PLZ_ABFRAGEN_PRO_STUNDE) === true, "61. Abfrage muss greifen");
  // Nach einer Stunde wieder frei.
  assert(plzRatenGrenze(ip, t0 + 3_600_001 + PLZ_ABFRAGEN_PRO_STUNDE) === false);
});

Deno.test("/plz-aufloesen: Bremse greift (429), wenn die IP ihr Kontingent ausgeschöpft hat", async () => {
  const ip = "203.0.113.42";
  // Kontingent für diese IP vorab füllen (gleiches Prozess-Fenster).
  for (let i = 0; i < PLZ_ABFRAGEN_PRO_STUNDE; i++) plzRatenGrenze(ip);
  const res = await rufPlz({ plz: "5020", land: "AT" }, plzAnschluss(), ip);
  assertEquals(res.status, 429);
});

// ── 3) Ausgeliefertes JS ohne externen Standortdienst ──
Deno.test("vexfit-plz.js ruft den eigenen Endpunkt /plz-aufloesen und NICHT zippopotam auf", async () => {
  const js = await lies("./vexfit-plz.js");
  assert(!js.includes("zippopotam"), "vexfit-plz.js darf den externen Dienst nicht mehr nennen/aufrufen");
  assert(js.includes("/functions/v1/vexfit-automation/plz-aufloesen"), "ruft den eigenen Edge-Endpunkt auf");
});

Deno.test("kunden-bereich.html ruft keinen externen Standortdienst mehr auf", async () => {
  const html = await lies("./kunden-bereich.html");
  assert(!html.includes("zippopotam"), "kunden-bereich.html darf den externen Dienst nicht mehr aufrufen");
});

// ── 4) Browser-Funktionsparität über den Endpunkt (gestubbt) ──
async function ladeVexPlz() {
  const src = await lies("./vexfit-plz.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", "fetch", src)(g, g, undefined, undefined);
  // deno-lint-ignore no-explicit-any
  return (g as any).vexPlz;
}

Deno.test("Browser: aufloesen ruft /plz-aufloesen mit { plz, land } und liefert den Ort", async () => {
  const vexPlz = await ladeVexPlz();
  let gesehen: { url: string; body: unknown } | null = null;
  const fetchStub = (url: string, opts?: { body?: string }) => {
    gesehen = { url: String(url), body: JSON.parse(opts?.body ?? "{}") };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, stadt: "Salzburg", land: "AT", lat: SALZBURG.lat, lng: SALZBURG.lng }),
    });
  };
  const erg = await vexPlz.aufloesen("5020", { fetch: fetchStub as unknown as typeof fetch, land: "AT" });
  assertEquals(erg.stadt, "Salzburg");
  assertEquals(erg.land, "AT");
  assertEquals(erg.lat, SALZBURG.lat);
  assert(gesehen !== null);
  assert((gesehen as { url: string }).url.includes("/functions/v1/vexfit-automation/plz-aufloesen"));
  assertEquals((gesehen as { body: { plz: string; land: string } }).body, { plz: "5020", land: "AT" });
});

Deno.test("Browser: 429 vom Server wird als netzfehler behandelt (später erneut)", async () => {
  const vexPlz = await ladeVexPlz();
  const fetchStub = () =>
    Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ fehler: "Zu viele" }) });
  const erg = await vexPlz.aufloesen("5020", { fetch: fetchStub as unknown as typeof fetch, land: "AT" });
  assertEquals(erg.netzfehler, true);
});
