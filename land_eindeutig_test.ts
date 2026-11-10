// /Users/js/Projekte/Vexfit/app/vexfit/land_eindeutig_test.ts
//
// Dauerlauf 07.11.2026 – PLZ eindeutig einem Land zuordnen (AT/DE/CH).
// Prueft die gemeinsame Aufloesung (vexfit-plz.js), den Trichter-Beacon
// (vexfit-trichter.js), die Stadtseiten-Links, die Land-Auswahl in Suche und
// Kundenbereich, die Admin-Liste „PLZ ohne Land" und die Migration als DATEI.
// KEINE echten Netzabfragen (fetch ist nachgestellt).
//
// Aufruf:  deno test --allow-read land_eindeutig_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── vexfit-plz.js laden (ohne DOM/Netz) ──
async function ladeVexPlz() {
  const src = await lies("./vexfit-plz.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", "fetch", src)(g, g, undefined, undefined);
  // deno-lint-ignore no-explicit-any
  return (g as any).vexPlz;
}

// Nachgestelltes fetch: liefert zippopotam-Antworten und zaehlt die Aufrufe.
function macheFetch(daten: Record<string, { stadt: string; lat: string; lng: string }>) {
  const aufrufe: string[] = [];
  const f = (url: string) => {
    aufrufe.push(String(url));
    const m = String(url).match(/zippopotam\.us\/([a-z]{2})\/(\d+)/);
    const key = m ? `${m[1]}/${m[2]}` : "";
    const t = daten[key];
    if (t) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ places: [{ "place name": t.stadt, latitude: t.lat, longitude: t.lng }] }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  };
  return { fetch: f as unknown as typeof fetch, aufrufe };
}

// ── standardLand: Vorgabe ohne Raten ──
Deno.test("standardLand: expliziter ?land= gewinnt", async () => {
  const vexPlz = await ladeVexPlz();
  assertEquals(vexPlz.standardLand({ ausUrl: "AT", gespeichert: "DE", sprache: "de-CH" }), "AT");
  assertEquals(vexPlz.standardLand({ ausUrl: "ch" }), "CH");
});

Deno.test("standardLand: sonst letzte Wahl, sonst Sprachraum – aber kein Raten", async () => {
  const vexPlz = await ladeVexPlz();
  assertEquals(vexPlz.standardLand({ gespeichert: "DE" }), "DE");
  assertEquals(vexPlz.standardLand({ sprache: "de-AT" }), "AT");
  assertEquals(vexPlz.standardLand({ sprache: "fr-CH" }), "CH");
  assertEquals(vexPlz.standardLand({ sprache: "de-DE" }), "DE");
  // Bloesses "de" ist mehrdeutig (DE/AT/CH) -> null (Formular fragt nach).
  assertEquals(vexPlz.standardLand({ sprache: "de" }), null);
  assertEquals(vexPlz.standardLand({}), null);
  assertEquals(vexPlz.standardLand({ ausUrl: "XX", gespeichert: "" }), null);
});

Deno.test("landNormal: nur AT/DE/CH, sonst null", async () => {
  const vexPlz = await ladeVexPlz();
  assertEquals(vexPlz.landNormal("at"), "AT");
  assertEquals(vexPlz.landNormal(" ch "), "CH");
  assertEquals(vexPlz.landNormal("DE"), "DE");
  assertEquals(vexPlz.landNormal("FR"), null);
  assertEquals(vexPlz.landNormal(""), null);
  assertEquals(vexPlz.landNormal(null), null);
});

// ── aufloesen mit Land: eindeutig, keine Rueckfrage ──
Deno.test("5020 + Land AT ergibt Salzburg (nur AT abgefragt, kein CH)", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch, aufrufe } = macheFetch({
    "at/5020": { stadt: "Salzburg", lat: "47.80", lng: "13.04" },
    "ch/5020": { stadt: "Wettingen", lat: "47.46", lng: "8.31" },
  });
  const erg = await vexPlz.aufloesen("5020", { fetch, land: "AT" });
  assertEquals(erg.land, "AT");
  assertEquals(erg.stadt, "Salzburg");
  assert(!erg.mehrdeutig, "mit Land darf es nicht mehrdeutig sein");
  assertEquals(aufrufe.length, 1, "nur das gewaehlte Land wird abgefragt");
  assert(aufrufe[0].includes("/at/5020"), "es wurde AT abgefragt");
});

Deno.test("5020 + Land CH ergibt den Schweizer Ort", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch } = macheFetch({
    "at/5020": { stadt: "Salzburg", lat: "47.80", lng: "13.04" },
    "ch/5020": { stadt: "Wettingen", lat: "47.46", lng: "8.31" },
  });
  const erg = await vexPlz.aufloesen("5020", { fetch, land: "CH" });
  assertEquals(erg.land, "CH");
  assertEquals(erg.stadt, "Wettingen");
});

Deno.test("5020 OHNE Land bleibt mehrdeutig (Rueckfrage statt Raten)", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch } = macheFetch({
    "at/5020": { stadt: "Salzburg", lat: "47.80", lng: "13.04" },
    "ch/5020": { stadt: "Wettingen", lat: "47.46", lng: "8.31" },
  });
  const erg = await vexPlz.aufloesen("5020", { fetch });
  assert(erg.mehrdeutig === true, "ohne Land muss 5020 mehrdeutig sein");
  assertEquals(erg.optionen.length, 2);
});

Deno.test("5-stellig ergibt DE, auch wenn ein anderes Land gewaehlt waere", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch, aufrufe } = macheFetch({ "de/10115": { stadt: "Berlin", lat: "52.53", lng: "13.38" } });
  const erg = await vexPlz.aufloesen("10115", { fetch, land: "AT" });
  assertEquals(erg.land, "DE");
  assertEquals(erg.stadt, "Berlin");
  assertEquals(aufrufe.length, 1, "fuenfstellig: nur eine (DE-)Abfrage");
  assert(aufrufe[0].includes("/de/10115"));
});

Deno.test("land-bewusster Zwischenspeicher: at:5020 und ch:5020 getrennt", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch, aufrufe } = macheFetch({
    "at/5020": { stadt: "Salzburg", lat: "47.80", lng: "13.04" },
    "ch/5020": { stadt: "Wettingen", lat: "47.46", lng: "8.31" },
  });
  const cache = new Map();
  const at = await vexPlz.aufloesen("5020", { fetch, land: "AT", cache });
  const ch = await vexPlz.aufloesen("5020", { fetch, land: "CH", cache });
  assertEquals(at.stadt, "Salzburg");
  assertEquals(ch.stadt, "Wettingen");
  assertEquals(aufrufe.length, 2, "beide Laender wurden getrennt abgefragt");
  // Zweiter Zugriff auf dasselbe Land/PLZ-Paar kommt aus dem Cache.
  await vexPlz.aufloesen("5020", { fetch, land: "AT", cache });
  assertEquals(aufrufe.length, 2, "gleiche Land/PLZ wird nicht erneut abgefragt");
});

// ── Trichter: Land mitsenden ──
Deno.test("vexfit-trichter: landNormal und land im Beacon-Koerper", async () => {
  const src = await lies("./vexfit-trichter.js");
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function("module", "window", src)(mod, {});
  // deno-lint-ignore no-explicit-any
  const t = mod.exports as any;
  assertEquals(t.landNormal("at"), "AT");
  assertEquals(t.landNormal("x"), null);
  assertEquals(t.plzBereich("5020"), "50");
  // Der Beacon setzt koerper.land nur bei gueltigem Land.
  assertStringIncludes(src, "if (land) koerper.land = land;");
});

// ── Stadtseite: Link traegt das Land ──
Deno.test("personal-trainer-salzburg.html: Suche-Link und Beacon mit Land AT", async () => {
  const s = await lies("./personal-trainer-salzburg.html");
  assert((s.match(/suche\.html\?plz=5020&land=AT/g) || []).length >= 2, "beide CTA-Links mit &land=AT");
  assertStringIncludes(s, "{ rolle: 'kunde', plz: '5020', land: 'AT' }");
});

// ── Suche: Land-Auswahl neben dem PLZ-Feld, 4-stellig ohne Land fragt nach ──
Deno.test("suche.html: Land-Auswahl + Nachfrage bei 4-stellig ohne Land", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, 'id="landInput"');
  assertStringIncludes(s, "gewaehltesLand()");
  assertStringIncludes(s, "Bitte wähle das Land");
  // 5-stellig schaltet die Auswahl automatisch auf DE.
  assertStringIncludes(s, "if (el && /^\\d{5}$/.test(plz)) el.value = 'DE';");
  // aufgeloest wird mit dem gewaehlten Land.
  assertStringIncludes(s, "vexPlz.aufloesen(plz, { cache: plzCache, land: land })");
});

// ── Kundenbereich: Land-Auswahl + an alle Speicherstellen weitergereicht ──
Deno.test("kunden-bereich.html: Land in Auswahl, Vormerkung, Alert und Suchzaehlung", async () => {
  const s = await lies("./kunden-bereich.html");
  assertStringIncludes(s, 'id="landInput"');
  assertStringIncludes(s, 'id="einLand"');
  assertStringIncludes(s, "function landSpeichern");
  assertStringIncludes(s, "land: vexPlz.landNormal(lastSearch.land) || null"); // Vormerkung + Alert
  assertStringIncludes(s, "land: vexPlz.landNormal(einAuswahl.land) || null"); // such_eingaben
});

// ── Admin: Liste „PLZ ohne Land" + Zuordnen ──
Deno.test("Admin: Liste PLZ ohne Land liest ohne land und ordnet ueber /admin-aktion zu", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function ladePlzOhneLand");
  assertStringIncludes(js, "land=is.null");
  assertStringIncludes(js, 'aktion: "land_setzen"');
  assertStringIncludes(js, 'akt === "land-setzen"');
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'id="plz-ohne-land-tbody"');
});

Deno.test("Edge: adminAktion kennt land_setzen (nur AT/DE/CH)", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, 'case "land_setzen"');
  assertStringIncludes(kern, "adminLandSetzen");
  assertStringIncludes(kern, 'land !== "AT" && land !== "DE" && land !== "CH"');
});

// ── Migration als DATEI (nicht eingespielt) + Ruecknahme ──
Deno.test("Migration ergaenzt land in den vier Tabellen, ohne zu befuellen", async () => {
  const m = await lies("./migrations/2026-11-07-02-land-ueberall.sql");
  for (const tab of ["trainer_alerts", "warteliste", "such_eingaben", "trichter_ereignisse"]) {
    assertStringIncludes(m, `public.${tab} ADD COLUMN IF NOT EXISTS land text`);
  }
  assertStringIncludes(m, "IN ('AT','DE','CH')");
  // Kein automatisches Befuellen (kein UPDATE ... SET land).
  assert(!/update\s+public\.\w+\s+set\s+land/i.test(m), "Migration darf land NICHT automatisch befuellen");
  const r = await lies("./migrations/ruecknahmen/2026-11-07-02-land-ueberall-ruecknahme.sql");
  for (const tab of ["trainer_alerts", "warteliste", "such_eingaben", "trichter_ereignisse"]) {
    assertStringIncludes(r, `public.${tab} DROP COLUMN IF EXISTS land`);
  }
});

// ── E2 (10.11.): Standort-Pflicht bei der Trainer-Registrierung ──
Deno.test("E2: unbekannte PLZ im gewählten Land wird abgelehnt (null)", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch } = macheFetch({ "at/5020": { stadt: "Salzburg", lat: "47.80", lng: "13.04" } });
  const erg = await vexPlz.aufloesen("9999", { fetch, land: "AT" });
  assertEquals(erg, null, "eine im Land unbekannte PLZ liefert keinen Ort");
});

Deno.test("E2: registrieren.html – Trainer-Formular mit Land+PLZ, land-bewusste Auflösung", async () => {
  const html = await lies("./registrieren.html");
  assertStringIncludes(html, 'id="t-land"');
  assertStringIncludes(html, 'id="t-plz"');
  assertStringIncludes(html, "{cache:plzCache,land:landSel}");
  assertStringIncludes(html, "stadt:plzStand.t.stadt,plz:plzWert,land:ortLand");
});
