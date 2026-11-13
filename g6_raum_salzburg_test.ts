// /Users/js/Projekte/Vexfit/app/vexfit/g6_raum_salzburg_test.ts
//
// Dauerlauf 13.11.2026 – G6: Raum Salzburg nach Kilometern (≤ 25 km um 5020 AT)
// statt PLZ-Präfix. Geprüft:
//   * trainerImRaumSalzburg: Seekirchen dabei, Braunau/Mattighofen nicht,
//     ohne Koordinaten false,
//   * der Abendbericht wählt die Salzburger Trainer nach km, wenn ein Zentrum da
//     ist (sonst Präfix-Rückfall),
//   * die Verwaltung rechnet ebenfalls in Kilometern (salzKmDist).
//
// Aufruf:  deno test --allow-read g6_raum_salzburg_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  abendberichtZahlenHolen,
  SALZBURG_ZENTRUM_KOORD,
  trainerImRaumSalzburg,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Reale Näherungskoordinaten.
const SEEKIRCHEN = { lat: 47.900, lng: 13.133 }; // ≈ 15 km
const BRAUNAU = { lat: 48.258, lng: 13.035 }; // ≈ 50 km
const MATTIGHOFEN = { lat: 48.106, lng: 13.147 }; // ≈ 34 km

Deno.test("G6: trainerImRaumSalzburg – Seekirchen dabei, Braunau/Mattighofen nicht", () => {
  assert(trainerImRaumSalzburg(SEEKIRCHEN, SALZBURG_ZENTRUM_KOORD), "Seekirchen sollte zum Raum Salzburg zählen");
  assert(!trainerImRaumSalzburg(BRAUNAU, SALZBURG_ZENTRUM_KOORD), "Braunau darf nicht zählen");
  assert(!trainerImRaumSalzburg(MATTIGHOFEN, SALZBURG_ZENTRUM_KOORD), "Mattighofen darf nicht zählen");
  // ohne Koordinaten: nicht verortbar → false
  assert(!trainerImRaumSalzburg({ lat: null, lng: null }, SALZBURG_ZENTRUM_KOORD));
});

Deno.test("G6: Abendbericht zählt die Salzburger Trainer nach Kilometern", async () => {
  const vollesProfil = {
    aktiv: true, gesperrt: false, ist_test: false,
    avatar_url: "/avatars/x.jpg", trainingsart: "Studio", trainingsort: "vor_ort",
    preis_stunde: 50, bio: "Ein ausreichend langer Text über mich.", erfahrung: "5 Jahre",
    spezialisierungen: ["Abnehmen"], telefon: "123",
  };
  // deno-lint-ignore no-explicit-any
  const lesen = (pfad: string): Promise<any[]> => {
    if (pfad.includes("land=ilike.AT&lat=not.is.null")) {
      return Promise.resolve([
        { id: "see", vorname: "See", nachname: "Kirchen", stadt: "Seekirchen", plz: "5201", lat: SEEKIRCHEN.lat, lng: SEEKIRCHEN.lng, ...vollesProfil },
        { id: "bra", vorname: "Bra", nachname: "Unau", stadt: "Braunau", plz: "5280", lat: BRAUNAU.lat, lng: BRAUNAU.lng, ...vollesProfil },
      ]);
    }
    return Promise.resolve([]);
  };
  const zaehlen = (_p: string): Promise<number> => Promise.resolve(0);
  const z = await abendberichtZahlenHolen(lesen, zaehlen, Date.now(), () => Promise.resolve([]), SALZBURG_ZENTRUM_KOORD);
  assert(z.salzburg, "salzburg fehlt");
  assertEquals(z.salzburg.trainerFrei, 1); // nur Seekirchen, nicht Braunau
  assertEquals(z.salzburg.trainerReif, 1);
  assertEquals(z.salzburg.trainer.length, 1);
  assertEquals(z.salzburg.trainer[0].ort, "Seekirchen");
});

Deno.test("G6: ohne Zentrum fällt der Abendbericht auf die PLZ-Präfixe zurück", async () => {
  // deno-lint-ignore no-explicit-any
  const lesen = (pfad: string): Promise<any[]> => {
    // Präfix-Abfrage (or=(plz.like.50*,...)) liefert einen Trainer.
    if (pfad.startsWith("trainers?or=") && pfad.includes("plz.like.50")) {
      return Promise.resolve([{ id: "p", vorname: "P", nachname: "Räfix", stadt: "Salzburg", plz: "5020", aktiv: true, gesperrt: false, ist_test: false, avatar_url: "/avatars/x.jpg", trainingsart: "x", trainingsort: "vor_ort", preis_stunde: 40, bio: "Langer Text hier bitte.", erfahrung: "3", spezialisierungen: ["x"], telefon: "1" }]);
    }
    return Promise.resolve([]);
  };
  const zaehlen = (_p: string): Promise<number> => Promise.resolve(0);
  const z = await abendberichtZahlenHolen(lesen, zaehlen, Date.now(), () => Promise.resolve([]) /* kein Zentrum */);
  assert(z.salzburg);
  assertEquals(z.salzburg.trainerFrei, 1);
});

Deno.test("G6: Verwaltung rechnet in Kilometern", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "SALZBURG_UMKREIS_KM");
  assertStringIncludes(js, "salzKmDist");
  assertStringIncludes(js, 'vexPlz.aufloesen("5020"');
});
