// /Users/js/Projekte/Vexfit/app/vexfit/suche_umkreis_1211_test.ts
//
// Baustein 12.11.2026 – Umkreis-Suche serverseitig dicht (Weg B mit
// Zwischenspeicher). Statische/Logik-Prüfungen ohne Netz/DB. Die serverseitige
// Logik liegt testbar in supabase/functions/vexfit-automation/kern.ts; die
// anon-/Kunden-REST-Sperre prüft werkzeuge/pruef-anon-rest.mjs live.
//
// Aufruf: deno test --allow-read suche_umkreis_1211_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  erlaubteTrainerFelder,
  haversineKm,
  landNormal,
  plzAufloesen,
  suchRatenGrenze,
  trainerKoordinatenNachtragen,
  trainerTrefferBerechnen,
  UMKREIS_KM,
  SUCHEN_PRO_STUNDE,
  ziffernPlz,
  type Anschluesse,
  type TrainerKandidat,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Salzburg 5020 (AT). ~20 km nördlich = +0.18° Breite; ~28 km = +0.25°.
const SALZBURG = { lat: 47.80, lng: 13.04 };

// ── Migration ──
Deno.test("Migration 2026-11-12-01: lat/lng, kunden-Suchmitte, plz_orte (nur service_role), Abschnitt 3 aktiv, RPCs entfernt", async () => {
  const m = await lies("./migrations/2026-11-12-01-suche-umkreis.sql");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS lat double precision");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS lng double precision");
  // Kunden-Suchmitte für die Profil-Sichtprüfung.
  assertStringIncludes(m, "letzte_such_lat");
  assertStringIncludes(m, "letzte_such_lng");
  // Zwischenspeicher mit RLS, kein anon/authenticated-Zugriff.
  assertStringIncludes(m, "CREATE TABLE IF NOT EXISTS public.plz_orte");
  assertStringIncludes(m, "PRIMARY KEY (land, plz)");
  assertStringIncludes(m, "ALTER TABLE public.plz_orte ENABLE ROW LEVEL SECURITY");
  assertStringIncludes(m, "REVOKE ALL ON public.plz_orte FROM anon");
  assertStringIncludes(m, "REVOKE ALL ON public.plz_orte FROM authenticated");
  // anon verliert beide Vorschau-Sichten.
  assertStringIncludes(m, "REVOKE SELECT (%s) ON public.trainers_oeffentlich FROM anon");
  assertStringIncludes(m, "REVOKE SELECT ON public.trainers_vorschau   FROM anon");
  // Abschnitt 3 AKTIV: authenticated liest nur die eigene Zeile.
  assertStringIncludes(m, 'CREATE POLICY "trainers_angemeldet_lesen"');
  assertStringIncludes(m, "USING (user_id = auth.uid())");
  assert(!/USING \(aktiv = true OR user_id = auth\.uid\(\)\)/.test(m), "alte weite Leseregel darf im Vorwärts-Teil nicht stehen");
  // Die Client-Koordinaten-RPCs sind entfernt.
  assertStringIncludes(m, "DROP FUNCTION IF EXISTS public.suche_trainer_umkreis");
  assertStringIncludes(m, "DROP FUNCTION IF EXISTS public.trainer_profil(uuid)");
  assert(!/CREATE OR REPLACE FUNCTION public\.suche_trainer_umkreis/.test(m), "RPC darf nicht mehr angelegt werden");
  assert(!/TO anon/.test(m.replace(/FROM anon/g, "")), "nichts an anon vergeben");

  const r = await lies("./migrations/ruecknahmen/2026-11-12-01-suche-umkreis-ruecknahme.sql");
  // Rücknahme stellt die RPCs wieder her und entfernt den Zwischenspeicher.
  assertStringIncludes(r, "CREATE OR REPLACE FUNCTION public.suche_trainer_umkreis");
  assertStringIncludes(r, "CREATE OR REPLACE FUNCTION public.trainer_profil(p_id uuid)");
  assertStringIncludes(r, "DROP TABLE IF EXISTS public.plz_orte");
  assertStringIncludes(r, "USING (aktiv = true OR user_id = auth.uid())");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS lat");
});

// ── Haversine (dieselbe Formel wie serverseitig) ──
Deno.test("Haversine: ≤25 km dabei, 28 km draußen, München weit weg", () => {
  assert(haversineKm(SALZBURG.lat, SALZBURG.lng, SALZBURG.lat + 0.18, SALZBURG.lng) <= 25);
  assert(haversineKm(SALZBURG.lat, SALZBURG.lng, SALZBURG.lat + 0.25, SALZBURG.lng) > 25);
  assert(haversineKm(SALZBURG.lat, SALZBURG.lng, 48.137, 11.575) > 25);
});

// ── Eingabe-Normalisierung ──
Deno.test("landNormal / ziffernPlz", () => {
  assertEquals(landNormal("at"), "AT");
  assertEquals(landNormal(" De "), "DE");
  assertEquals(landNormal("xx"), null);
  assertEquals(ziffernPlz("5020"), "5020");
  assertEquals(ziffernPlz("80331"), "80331");
  assertEquals(ziffernPlz("50"), null);
  assertEquals(ziffernPlz("abcd"), null);
});

// ── Suchrechnung: Umkreis, Online-Ausschluss, Schwerpunkt, Sortierung ──
function kand(id: string, dlat: number, ort = "vor_ort", spez: string[] = []): TrainerKandidat {
  return { id, trainingsort: ort, lat: SALZBURG.lat + dlat, lng: SALZBURG.lng, spezialisierungen: spez };
}
Deno.test("trainerTrefferBerechnen: 20 km dabei, 28 km draußen, online raus, nach Entfernung sortiert", () => {
  const liste = [
    kand("nah", 0.18),          // ~20 km
    kand("fern", 0.25),         // ~28 km → raus
    kand("sehr-nah", 0.05),     // ~5,5 km
    kand("online", 0.01, "online"), // reines Online → raus
  ];
  const t = trainerTrefferBerechnen(liste, SALZBURG, null, UMKREIS_KM);
  assertEquals(t.map((x) => x.id), ["sehr-nah", "nah"]);
  assert(typeof t[0].entfernung_km === "number");
  // Keine lat/lng im Ergebnis (nur erlaubte Felder).
  assert(!("lat" in t[0]));
  assert(!("lng" in t[0]));
});
Deno.test("trainerTrefferBerechnen: Schwerpunkt filtert über Spezialisierung", () => {
  const liste = [
    kand("yoga", 0.05, "vor_ort", ["Yoga", "Rücken"]),
    kand("box", 0.05, "vor_ort", ["Boxen"]),
  ];
  const t = trainerTrefferBerechnen(liste, SALZBURG, "yoga", UMKREIS_KM);
  assertEquals(t.map((x) => x.id), ["yoga"]);
});
Deno.test("erlaubteTrainerFelder gibt keine lat/lng/email heraus", () => {
  const o = erlaubteTrainerFelder({ id: "x", lat: 1, lng: 2, vorname: "A" } as TrainerKandidat, 7);
  assert(!("lat" in o) && !("lng" in o));
  assertEquals(o.entfernung_km, 7);
});

// ── Bremse ──
Deno.test(`suchRatenGrenze: ab ${SUCHEN_PRO_STUNDE + 1}. Suche greift`, () => {
  const t0 = 1_000_000;
  const id = "kunde-bremse";
  for (let i = 0; i < SUCHEN_PRO_STUNDE; i++) {
    assert(suchRatenGrenze(id, t0 + i) === false, `Suche ${i + 1} darf durch`);
  }
  assert(suchRatenGrenze(id, t0 + SUCHEN_PRO_STUNDE) === true, "31. Suche muss greifen");
  // Eine Stunde später ist das Fenster frei.
  assert(suchRatenGrenze(id, t0 + 3_600_001 + SUCHEN_PRO_STUNDE) === false);
});

// ── plzAufloesen: Zwischenspeicher-Treffer ruft den Dienst NICHT erneut ──
Deno.test("plzAufloesen: Cache-Treffer → kein externer Abruf", async () => {
  let externAufrufe = 0;
  const a = {
    plzOrtLesen: () => Promise.resolve({ ort: "Salzburg", lat: SALZBURG.lat, lng: SALZBURG.lng }),
    plzAbrufExtern: () => { externAufrufe++; return Promise.resolve(null); },
    plzOrtSpeichern: () => Promise.resolve(),
  } as unknown as Anschluesse;
  const o = await plzAufloesen(a, "AT", "5020");
  assert(o && !("netzfehler" in o));
  assertEquals((o as { lat: number }).lat, SALZBURG.lat);
  assertEquals(externAufrufe, 0);
});
Deno.test("plzAufloesen: Cache leer → Dienst, Ergebnis wird gespeichert", async () => {
  let gespeichert = false;
  const a = {
    plzOrtLesen: () => Promise.resolve(null),
    plzAbrufExtern: () => Promise.resolve({ ort: "Salzburg", lat: SALZBURG.lat, lng: SALZBURG.lng }),
    plzOrtSpeichern: () => { gespeichert = true; return Promise.resolve(); },
  } as unknown as Anschluesse;
  const o = await plzAufloesen(a, "AT", "5020");
  assert(o && !("netzfehler" in o));
  assert(gespeichert);
});
Deno.test("plzAufloesen: unbekannte PLZ → null (keine erfundenen Koordinaten)", async () => {
  const a = {
    plzOrtLesen: () => Promise.resolve(null),
    plzAbrufExtern: () => Promise.resolve(null),
    plzOrtSpeichern: () => Promise.resolve(),
  } as unknown as Anschluesse;
  assertEquals(await plzAufloesen(a, "AT", "9999"), null);
});
Deno.test("plzAufloesen: Dienst nicht erreichbar → netzfehler, nicht gespeichert", async () => {
  let gespeichert = false;
  const a = {
    plzOrtLesen: () => Promise.resolve(null),
    plzAbrufExtern: () => Promise.resolve({ netzfehler: true as const }),
    plzOrtSpeichern: () => { gespeichert = true; return Promise.resolve(); },
  } as unknown as Anschluesse;
  const o = await plzAufloesen(a, "AT", "5020");
  assert(o && "netzfehler" in o);
  assert(!gespeichert);
});

// ── trainerKoordinatenNachtragen ──
Deno.test("trainerKoordinatenNachtragen: ohne Land → keine_plz; mit → erledigt", async () => {
  const basis = {
    plzOrtLesen: () => Promise.resolve({ ort: "Salzburg", lat: SALZBURG.lat, lng: SALZBURG.lng }),
    plzAbrufExtern: () => Promise.resolve(null),
    plzOrtSpeichern: () => Promise.resolve(),
    adminKoordinatenSetzen: () => Promise.resolve(1),
  } as unknown as Anschluesse;
  assertEquals((await trainerKoordinatenNachtragen(basis, { id: "t", plz: "5020", land: null })).status, "keine_plz");
  assertEquals((await trainerKoordinatenNachtragen(basis, { id: "t", plz: "5020", land: "AT" })).status, "erledigt");
});

// ── Router: /trainer-suche manipulationssicher + Bremse + Kundenpflicht ──
async function ruf(pfad: string, body: unknown, a: Anschluesse, token = "tok"): Promise<Response> {
  const { bearbeiten } = await import("./supabase/functions/vexfit-automation/kern.ts");
  const r = new Request(`https://x/functions/v1/vexfit-automation/${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify(body),
  });
  return await bearbeiten(r, a);
}
function sucheAnschluss(extra: Partial<Anschluesse> = {}): Anschluesse {
  return {
    benutzerAusToken: () => Promise.resolve({ id: "u-" + Math.random(), email: "k@example.com" }),
    kundeKurzNachAuth: () => Promise.resolve({ id: "kunde1", email: "k@example.com", letzte_such_lat: null, letzte_such_lng: null }),
    plzOrtLesen: () => Promise.resolve({ ort: "Salzburg", lat: SALZBURG.lat, lng: SALZBURG.lng }),
    plzAbrufExtern: () => Promise.resolve(null),
    plzOrtSpeichern: () => Promise.resolve(),
    kundeSuchMitteSetzen: () => Promise.resolve(),
    // Die Land-Filterung (land=ilike.AT) macht die DB-Abfrage; der Fake liefert
    // für AT nur AT-Trainer. Für DE (anderes Land) käme eine andere Menge.
    trainerKandidatenFuerSuche: (land: string) =>
      Promise.resolve(land === "AT" ? [kand("nah", 0.18), kand("fern", 0.25)] : []),
    ...extra,
  } as unknown as Anschluesse;
}
Deno.test("/trainer-suche: Body-lat/lng/umkreis werden ignoriert (Mitte aus plzAufloesen, fester 25 km)", async () => {
  const res = await ruf("trainer-suche", { plz: "5020", land: "AT", lat: 0, lng: 0, umkreis_km: 9999 }, sucheAnschluss());
  assertEquals(res.status, 200);
  const d = await res.json();
  // 28-km-Trainer bleibt draußen (der große umkreis_km aus dem Body zählt nicht).
  assertEquals(d.treffer.map((t: { id: string }) => t.id), ["nah"]);
  assertEquals(d.umkreis_km, UMKREIS_KM);
});
Deno.test("/trainer-suche: ohne Kundenkonto → 403", async () => {
  const res = await ruf("trainer-suche", { plz: "5020", land: "AT" }, sucheAnschluss({ kundeKurzNachAuth: () => Promise.resolve(null) }));
  assertEquals(res.status, 403);
});
Deno.test("/trainer-suche: unbekannte PLZ → 404; Dienst down → 503", async () => {
  const res404 = await ruf("trainer-suche", { plz: "9999", land: "AT" }, sucheAnschluss({ plzOrtLesen: () => Promise.resolve(null), plzAbrufExtern: () => Promise.resolve(null) }));
  assertEquals(res404.status, 404);
  const res503 = await ruf("trainer-suche", { plz: "5020", land: "AT" }, sucheAnschluss({ plzOrtLesen: () => Promise.resolve(null), plzAbrufExtern: () => Promise.resolve({ netzfehler: true as const }) }));
  assertEquals(res503.status, 503);
});

// ── Router: /trainer-profil – außerhalb ohne Anfrage 404, mit Anfrage sichtbar ──
function profilAnschluss(extra: Partial<Anschluesse> = {}): Anschluesse {
  return {
    benutzerAusToken: () => Promise.resolve({ id: "u1", email: "k@example.com" }),
    kundeKurzNachAuth: () => Promise.resolve({ id: "kunde1", email: "k@example.com", letzte_such_lat: SALZBURG.lat, letzte_such_lng: SALZBURG.lng }),
    trainerFuerProfil: (id: string) =>
      Promise.resolve(id === "weit"
        ? { ...kand("weit", 0.5), lat: SALZBURG.lat + 0.5, lng: SALZBURG.lng }
        : { ...kand("nah", 0.05), lat: SALZBURG.lat + 0.05, lng: SALZBURG.lng }),
    kundeHatAnfrageAnTrainer: () => Promise.resolve(false),
    ...extra,
  } as unknown as Anschluesse;
}
Deno.test("/trainer-profil: nah → sichtbar; weit ohne Anfrage → 404; weit mit Anfrage → sichtbar", async () => {
  const nah = await ruf("trainer-profil", { id: "nah" }, profilAnschluss());
  assertEquals(nah.status, 200);

  const weit = await ruf("trainer-profil", { id: "weit" }, profilAnschluss());
  assertEquals(weit.status, 404);

  const weitMitAnfrage = await ruf("trainer-profil", { id: "weit" }, profilAnschluss({ kundeHatAnfrageAnTrainer: () => Promise.resolve(true) }));
  assertEquals(weitMitAnfrage.status, 200);
});

// ── Client: Seiten nutzen die Endpunkte, nicht mehr die Tabelle/RPC ──
Deno.test("suche.html: /trainer-suche, fester 25 km, Gate für anon, kein direkter trainers-Lesezugriff", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "const UMKREIS_KM = 25;");
  assertStringIncludes(s, "functions/v1/vexfit-automation/trainer-suche");
  assert(!s.includes("rpc/suche_trainer_umkreis"), "alte RPC noch referenziert");
  assertStringIncludes(s, "zeigeAnonGate");
});
Deno.test("profil.html: /trainer-profil statt RPC/Tabelle", async () => {
  const p = await lies("./profil.html");
  assertStringIncludes(p, "functions/v1/vexfit-automation/trainer-profil");
  assert(!p.includes("rpc/trainer_profil"), "alte RPC noch referenziert");
});
Deno.test("kunden-bereich.html: /trainer-suche, kein direkter trainers-Lesezugriff", async () => {
  const k = await lies("./kunden-bereich.html");
  assertStringIncludes(k, "functions/v1/vexfit-automation/trainer-suche");
  assert(!/rest\/v1\/trainers\?aktiv=eq\.true/.test(k), "kunden-bereich liest trainers noch direkt");
});
