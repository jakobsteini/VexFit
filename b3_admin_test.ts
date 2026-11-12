// /Users/js/Projekte/Vexfit/app/vexfit/b3_admin_test.ts
//
// B3 (Dauerlauf 2026-11-03): Admin – „Heute zu tun", Karte, Zahlen nach
// Herkunft. Geprüft ohne Browser/Netz:
//   - die reinen Auswertungen (vexfit-verwaltung.js),
//   - die Admin-Oberfläche (HTML) und die Karten-/Herkunfts-Logik (Quelltext),
//   - die Migration für die Herkunft-Spalte.
//
// Aufruf:  deno test --allow-read b3_admin_test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  anfragenOhneAntwort,
  bereitZurFreigabe,
  herkunftVon,
  herkunftZusammenfassung,
  trainerOhneKoordinaten,
  trainerOhneStandort,
  wartenAufFreigabe,
} from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const AVATAR = "https://x/storage/v1/object/public/avatars/u/a.jpg";

Deno.test("B3.1a: wartenAufFreigabe listet nur nicht-freigegebene, nicht gesperrte mit fehlenden Pflichtangaben", () => {
  const liste = wartenAufFreigabe([
    { id: "1", aktiv: false, gesperrt: false, avatar_url: AVATAR, plz: "5020", preis_stunde: 60 }, // vollständig
    { id: "2", aktiv: false, gesperrt: false }, // alles fehlt
    { id: "3", aktiv: true, gesperrt: false },  // schon freigegeben -> raus
    { id: "4", aktiv: false, gesperrt: true },  // gesperrt -> raus
  ]);
  assertEquals(liste.map((t: { id: string }) => t.id), ["1", "2"]);
  assertEquals(liste[0].fehlt, []);
  assertEquals(liste[1].fehlt, ["Foto", "PLZ", "Preis"]);
});

Deno.test("B3.1b: 24-Stunden-Grenze (streng) und beantwortete Anfragen ausgeschlossen", () => {
  const jetzt = Date.parse("2026-11-03T12:00:00Z");
  const vor = (h: number) => new Date(jetzt - h * 3600000).toISOString();
  const rows = [
    { id: "a", created_at: vor(25) },                          // > 24 h -> rein
    { id: "b", created_at: vor(24) },                          // genau 24 h -> raus
    { id: "c", created_at: vor(23) },                          // < 24 h -> raus
    { id: "d", created_at: vor(48), status: "angenommen" },    // beantwortet -> raus
    { id: "e", created_at: vor(48), beantwortet_am: vor(1) },  // beantwortet -> raus
  ];
  assertEquals(anfragenOhneAntwort(rows, jetzt).map((a: { id: string }) => a.id), ["a"]);
});

Deno.test("B3.3: Herkunft – leer/fehlend = direkt/unbekannt", () => {
  assertEquals(herkunftVon({}), "direkt/unbekannt");
  assertEquals(herkunftVon({ herkunft: "  " }), "direkt/unbekannt");
  assertEquals(herkunftVon({ herkunft: "meta – trainer_at_1_beruf" }), "meta – trainer_at_1_beruf");
});

Deno.test("B3.3: Zahlen je Tag nach Herkunft, inkl. vollständige Trainer", () => {
  const jetzt = Date.parse("2026-11-03T12:00:00Z");
  const heute = new Date(jetzt).toISOString();
  const trainers = [
    { created_at: heute, herkunft: "meta – t1", avatar_url: AVATAR, plz: "5020", preis_stunde: 60 }, // vollständig
    { created_at: heute, herkunft: "meta – t1" }, // unvollständig
    { created_at: heute }, // direkt/unbekannt
  ];
  const kunden = [
    { created_at: heute, herkunft: "meta – k1" },
    { created_at: heute },
  ];
  const tage = herkunftZusammenfassung(trainers, kunden, jetzt, 14) as Array<{
    datum: string; trainer: number; kunde: number; trainerVollstaendig: number;
    herkuenfte: Record<string, { trainer: number; kunde: number }>;
  }>;
  assertEquals(tage.length, 14);
  const d0 = tage[0]; // heute (neueste zuerst)
  assertEquals(d0.trainer, 3);
  assertEquals(d0.trainerVollstaendig, 1);
  assertEquals(d0.kunde, 2);
  assertEquals(d0.herkuenfte["meta – t1"].trainer, 2);
  assertEquals(d0.herkuenfte["direkt/unbekannt"].trainer, 1);
  assertEquals(d0.herkuenfte["direkt/unbekannt"].kunde, 1);
  assertEquals(d0.herkuenfte["meta – k1"].kunde, 1);
});

Deno.test("Admin-HTML: neue Reiter, Heute-zu-tun, Karte, Herkunft vorhanden", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'data-tab="karte"');
  assertStringIncludes(html, 'data-tab="herkunft"');
  assertStringIncludes(html, 'id="heute-zu-tun"');
  assertStringIncludes(html, 'id="karte"');
  assertStringIncludes(html, 'id="herkunft-inhalt"');
  // Leaflet (feste Version) von cdnjs + OSM in der CSP erlaubt.
  assertStringIncludes(html, "leaflet/1.9.4/leaflet.min.js");
  assertStringIncludes(html, "cdnjs.cloudflare.com");
  assertStringIncludes(html, "https://*.tile.openstreetmap.org");
  assertStringIncludes(html, "api.zippopotam.us");
  // Legende mit allen vier Punktfarben.
  for (const farbe of ["#2e6fff", "#7fb3ff", "#ff5a5a", "#ff9f1a"]) assertStringIncludes(html, farbe);
  // Filter Land + Zeitraum.
  assertStringIncludes(html, 'id="karte-land"');
  assertStringIncludes(html, 'id="karte-zeit"');
});

Deno.test("Admin-JS: Karte nutzt OSM-Namensnennung, Farben nach Status, Testkonten-Schalter", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "OpenStreetMap-Mitwirkende"); // Attribution
  assertStringIncludes(js, "tile.openstreetmap.org");
  // Farbe nach Status: freigegeben blau, wartet hellblau.
  assertStringIncludes(js, 'aktiv ? "#2e6fff" : "#7fb3ff"');
  // Kunde rot, Warteliste orange.
  assertStringIncludes(js, '"#ff5a5a"');
  assertStringIncludes(js, '"#ff9f1a"');
  // PLZ-Zwischenspeicher (keine doppelten Abfragen).
  assertStringIncludes(js, "geoCache");
  // Testkonten-Schalter respektiert.
  assertStringIncludes(js, "sichtbar(daten.trainers, zustand.testsAusTrainer)");
  assertStringIncludes(js, "sichtbar(daten.kunden, zustand.testsAusKunden)");
  // Leere Listen: "Nichts offen".
  assertStringIncludes(js, "Nichts offen");
  // Herkunft-Hinweis (Cookies/Meta).
  assertStringIncludes(js, "Wer Cookies ablehnt");
});

Deno.test("B3: Migration legt die Herkunft-Spalte nur als Datei an (nicht eingespielt)", async () => {
  const sql = await lies("./migrations/2026-11-03-01-herkunft.sql");
  assertStringIncludes(sql, "ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft text");
  assertStringIncludes(sql, "ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft text");
  assertStringIncludes(sql, "NICHT eingespielt");
});

Deno.test("B3: registrieren.html trägt die Herkunft best-effort nach (bricht Registrierung nicht)", async () => {
  const reg = await lies("./registrieren.html");
  assertStringIncludes(reg, "herkunftNachtragen('trainers'");
  assertStringIncludes(reg, "herkunftNachtragen('kunden'");
  assertStringIncludes(reg, "if(!herkunft || !token) return;");
});

// E2 (10.11.): Liste „Standort fehlt" – Trainer ohne PLZ, ohne Test-/Spam-Konten.
Deno.test("E2: trainerOhneStandort listet nur Trainer ohne PLZ, keine Test-Konten", () => {
  const liste = trainerOhneStandort([
    { id: "1", vorname: "A", email: "a@b.at", plz: "5020" },        // hat PLZ
    { id: "2", vorname: "B", email: "b@b.at", plz: "" },            // keine PLZ
    { id: "3", vorname: "C", email: "c@b.at", plz: null },          // keine PLZ
    { id: "4", vorname: "D", email: "d+test@b.at", plz: "" },       // Test (Alias)
    { id: "5", vorname: "E", email: "e@b.at", plz: "", ist_test: true }, // Test (markiert)
  ]);
  assertEquals(liste.map((t) => t.id), ["2", "3"]);
});

// E5 (10.11.): „Bereit zur Freigabe" – ≥5/8, nicht freigegeben, kein Test/Spam.
Deno.test("E5: bereitZurFreigabe listet nur reife, nicht freigegebene, echte Konten", () => {
  const voll = { // 8/8
    avatar_url: AVATAR, trainingsart: "EMS", trainingsort: "vor_ort", preis_stunde: 50,
    bio: "ein ausreichend langer Text", erfahrung: "5 Jahre", spezialisierungen: ["Kraft"], telefon: "+43 1 2",
  };
  const liste = bereitZurFreigabe([
    { id: "1", vorname: "Reif", email: "r@b.at", aktiv: false, gesperrt: false, ...voll }, // 8/8
    { id: "2", vorname: "Schwach", email: "s@b.at", aktiv: false, gesperrt: false, trainingsart: "EMS" }, // <5
    { id: "3", vorname: "Frei", email: "f@b.at", aktiv: true, gesperrt: false, ...voll }, // schon freigegeben
    { id: "4", vorname: "Test", email: "t+x@b.at", aktiv: false, gesperrt: false, ...voll }, // Test-Alias
    { id: "5", vorname: "Markiert", email: "m@b.at", aktiv: false, gesperrt: false, ist_test: true, ...voll },
  ]);
  assertEquals(liste.map((t: { id: string }) => t.id), ["1"]);
  assertEquals(liste[0].erfuellt, 8);
});

// 12.11.: „Standort ohne Koordinaten" – PLZ da, aber lat/lng fehlen.
Deno.test("12.11.: trainerOhneKoordinaten listet nur Trainer mit PLZ ohne lat/lng", () => {
  const liste = trainerOhneKoordinaten([
    { id: "1", email: "a@b.at", plz: "5020", lat: 47.8, lng: 13.0 }, // hat Koordinaten
    { id: "2", email: "b@b.at", plz: "5020" },                       // PLZ, keine Koord
    { id: "3", email: "c@b.at", plz: "5020", lat: null, lng: null }, // PLZ, keine Koord
    { id: "4", email: "d@b.at", plz: "" },                           // keine PLZ (andere Liste)
    { id: "5", email: "e+test@b.at", plz: "5020" },                  // Test-Alias
    { id: "6", email: "f@b.at", plz: "5020", lat: 47.8, lng: 13.0, ist_test: true }, // Test
  ]);
  assertEquals(liste.map((t: { id: string }) => t.id), ["2", "3"]);
});
