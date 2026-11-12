// /Users/js/Projekte/Vexfit/app/vexfit/suche_umkreis_1211_test.ts
//
// Baustein 12.11.2026 – Suche nur angemeldet, 25 km Umkreis, gleiches Land.
// Statische/Logik-Prüfungen (ohne Netz/DB). Die End-to-End-Fassung (375/1440 px,
// anon ohne Trainerdaten, RPC ≤25 km) liegt in e2e/suche-nur-angemeldet.spec.ts;
// das Prüfskript werkzeuge/pruef-anon-rest.mjs prüft die anon-REST-Sperre live.
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── Migration: Backbone ──
Deno.test("Migration 2026-11-12-01: lat/lng, anon-Revoke, RPCs, nur authenticated", async () => {
  const m = await lies("./migrations/2026-11-12-01-suche-umkreis.sql");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS lat double precision");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS lng double precision");
  // anon verliert beide Vorschau-Sichten (Spalten-Revoke + view-weit).
  assertStringIncludes(m, "REVOKE SELECT (%s) ON public.trainers_oeffentlich FROM anon");
  assertStringIncludes(m, "REVOKE SELECT ON public.trainers_vorschau   FROM anon");
  // RPC mit Pflicht-Filtern.
  assertStringIncludes(m, "CREATE OR REPLACE FUNCTION public.suche_trainer_umkreis");
  assertStringIncludes(m, "SECURITY DEFINER");
  assertStringIncludes(m, "t.aktiv = true");
  assertStringIncludes(m, "t.gesperrt IS NOT TRUE");
  assertStringIncludes(m, "t.ist_test IS NOT TRUE");
  assertStringIncludes(m, "upper(btrim(COALESCE(t.land, ''))) = upper(btrim(COALESCE(p_land, '')))");
  assertStringIncludes(m, "COALESCE(t.trainingsort, '') IN ('vor_ort', 'beides')");
  assertStringIncludes(m, "t.lat IS NOT NULL AND t.lng IS NOT NULL");
  // Einzelprofil-RPC + nur authenticated ausführbar.
  assertStringIncludes(m, "CREATE OR REPLACE FUNCTION public.trainer_profil(p_id uuid)");
  assertStringIncludes(m, "GRANT EXECUTE ON FUNCTION public.suche_trainer_umkreis");
  assertStringIncludes(m, "GRANT EXECUTE ON FUNCTION public.trainer_profil(uuid) TO authenticated");
  assert(!/GRANT EXECUTE[^\n]*TO anon/.test(m), "RPC darf nicht an anon vergeben werden");
  // Die authenticated-Policy-Verschärfung ist BEWUSST als BLOCK auskommentiert.
  assertStringIncludes(m, "BLOCK / TEIL B");
  const r = await lies("./migrations/ruecknahmen/2026-11-12-01-suche-umkreis-ruecknahme.sql");
  assertStringIncludes(r, "DROP FUNCTION IF EXISTS public.suche_trainer_umkreis");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS lat");
});

// ── Haversine: dieselbe Formel wie in der RPC (Erdradius 6371 km) ──
function hav(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, rad = (x: number) => x * Math.PI / 180;
  return R * 2 * Math.asin(Math.sqrt(
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2,
  ));
}

Deno.test("Umkreis-Logik: ≤25 km dabei, 26 km draußen, anderes Land/weit weg draußen", () => {
  const salzburg = { lat: 47.80, lng: 13.04 }; // 5020 (AT)
  // ~20 km nördlich (0.18° Breite) → im Umkreis.
  assert(hav(salzburg.lat, salzburg.lng, salzburg.lat + 0.18, salzburg.lng) <= 25);
  // ~28 km nördlich (0.25° Breite) → NICHT im Umkreis.
  assert(hav(salzburg.lat, salzburg.lng, salzburg.lat + 0.25, salzburg.lng) > 25);
  // München (DE, 80331) ist weit weg (und anderes Land) → nie Salzburger Treffer.
  assert(hav(salzburg.lat, salzburg.lng, 48.137, 11.575) > 25);
});

// ── Client: Schalter aus, Gates, RPC, Umkreis-Konstante ──
Deno.test("Client: Vorschau aus, suche/profil gaten anon, nutzen RPC, fester 25 km", async () => {
  const cfg = await lies("./vexfit-config.js");
  assertStringIncludes(cfg, "OEFFENTLICHE_VORSCHAU: false");
  const s = await lies("./suche.html");
  assertStringIncludes(s, "const UMKREIS_KM = 25;");
  assertStringIncludes(s, "if(!angemeldet) { zeigeAnonGate(); return; }");
  assertStringIncludes(s, "rpc/suche_trainer_umkreis");
  assert(!s.includes('id="radiusInput"'), "Radius-Wähler noch da");
  const p = await lies("./profil.html");
  assertStringIncludes(p, "if(!angemeldet) { zeigeProfilGate(); return; }");
  assertStringIncludes(p, "rpc/trainer_profil");
});

Deno.test("Registrierung speichert Trainer-Koordinaten (lat/lng) mit", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, "lat:(typeof plzStand.t.lat==='number'?plzStand.t.lat:null)");
  assertStringIncludes(s, "lng:(typeof plzStand.t.lng==='number'?plzStand.t.lng:null)");
});

Deno.test("pruef-anon-rest: Fall c verlangt jetzt einen Fehlerstatus (anon gesperrt)", async () => {
  const s = await lies("./werkzeuge/pruef-anon-rest.mjs");
  assertStringIncludes(s, "res.status !== 200 && !leckt");
  assertStringIncludes(s, "MÜSSEN für anon fehlschlagen");
});

Deno.test("SEO: Generator stillgelegt, sitemap ohne Trainerprofile", async () => {
  const g = await lies("./werkzeuge/stadtseiten.mjs");
  assertStringIncludes(g, "const STILLGELEGT = true;");
  const sm = await lies("./sitemap.xml");
  assert(!sm.includes("profil.html?id"), "sitemap enthält noch Trainerprofile");
});

Deno.test("Koordinaten nachtragen: Edge-Aktion + Verwaltungs-Verdrahtung", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, 'case "koordinaten_setzen"');
  assertStringIncludes(kern, "adminKoordinatenSetzen");
  const idx = await lies("./supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(idx, "async adminKoordinatenSetzen(trainerId, lat, lng)");
  const v = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(v, "function trainerOhneKoordinaten(");
  assertStringIncludes(v, "async function koordinatenNachtragen(");
  assertStringIncludes(v, 'aktion: "koordinaten_setzen"');
  assertStringIncludes(v, 'data-aktion="koord-nachtragen"');
});
