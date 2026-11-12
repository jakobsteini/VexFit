// /Users/js/Projekte/Vexfit/app/vexfit/d2_abschnitte_test.ts
//
// Dauerlauf 08.11.2026 – D2: Standortfilter pro Land, zwei Abschnitte.
// Prueft die reine Einteilung (vexfit-abschnitte.js), die land-eindeutige
// PLZ-Aufloesung (vexfit-plz.js, 5020 AT vs. CH) und die Verdrahtung in
// suche.html (zwei Abschnitte, URL-Zustand).
//
// Aufruf:  deno test --allow-read d2_abschnitte_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const qa = await lies("./vexfit-abschnitte.js");
new Function(qa)();
// deno-lint-ignore no-explicit-any
const vexAbschnitte = (globalThis as any).vexAbschnitte;

const qp = await lies("./vexfit-plz.js");
new Function(qp)();
// deno-lint-ignore no-explicit-any
const vexPlz = (globalThis as any).vexPlz;

const TRAINER = [
  { id: "at-vorort", vorname: "Ben", land: "AT", trainingsort: "vor ort", trainingsart: "Functional" },
  { id: "at-beides", vorname: "Eva", land: "AT", trainingsort: "beides", trainingsart: "Kraft" },
  { id: "at-online", vorname: "Anna", land: "AT", trainingsort: "online", trainingsart: "Online" },
  { id: "de-online", vorname: "Max", land: "DE", trainingsort: "online", trainingsart: "Online" },
  { id: "ch-vorort", vorname: "Sven", land: "CH", trainingsort: "vor ort", trainingsart: "Kraft" },
  { id: "ch-online", vorname: "Rea", land: "CH", trainingsort: "beides", trainingsart: "Yoga" },
];

Deno.test("D2: Vor-Ort nur gewähltes Land, reine Online-Trainer nicht vor Ort", () => {
  const { vorOrt } = vexAbschnitte.einteilen(TRAINER, "AT");
  const ids = vorOrt.map((t: { id: string }) => t.id).sort();
  // AT vor-ort und AT „beides"; NICHT: AT-online, DE, CH.
  assertEquals(ids, ["at-beides", "at-vorort"]);
});

Deno.test("D2: Online-Abschnitt – gewähltes Land zuerst, andere Länder mit Kennzeichnung, kein Doppeleintrag", () => {
  const { online } = vexAbschnitte.einteilen(TRAINER, "AT");
  // „beides" aus AT steht vor Ort, NICHT online (kein Doppeleintrag).
  assert(!online.some((t: { id: string }) => t.id === "at-beides"), "AT-beides doppelt im Online-Abschnitt");
  // Enthalten: AT-online (eigenes Land), DE-online, CH-beides.
  assertEquals(online.map((t: { id: string }) => t.id).sort(), ["at-online", "ch-online", "de-online"]);
  // Gewähltes Land (AT) steht vorne.
  assertEquals(online[0].land, "AT");
  // Kennzeichnung „aus …" nur fuer andere Laender.
  assertEquals(vexAbschnitte.ausLand({ land: "DE" }, "AT"), "DE");
  assertEquals(vexAbschnitte.ausLand({ land: "AT" }, "AT"), null);
  assertEquals(vexAbschnitte.LANDNAME.DE, "Deutschland");
});

Deno.test("D2: ein DE-Online-Trainer erscheint bei AT-Suche NIE im Vor-Ort-Abschnitt", () => {
  const { vorOrt } = vexAbschnitte.einteilen(TRAINER, "AT");
  assert(!vorOrt.some((t: { id: string }) => t.id === "de-online"));
  assert(!vorOrt.some((t: { id: string }) => t.id === "ch-vorort"), "CH-Trainer darf nicht in AT-Vor-Ort");
});

Deno.test("D2: 5020 land-eindeutig – AT liefert Salzburg, CH liefert den Schweizer Ort", async () => {
  // Gefälschtes fetch: je Landpfad ein anderer Ort fuer dieselbe PLZ 5020.
  const fakeFetch = (url: string) => {
    const ok = (ort: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ places: [{ "place name": ort, latitude: "47", longitude: "13" }] }),
    });
    if (url.includes("/at/5020")) return ok("Salzburg");
    if (url.includes("/ch/5020")) return ok("Wettingen");
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };
  const at = await vexPlz.aufloesen("5020", { land: "AT", fetch: fakeFetch });
  const ch = await vexPlz.aufloesen("5020", { land: "CH", fetch: fakeFetch });
  assertEquals(at.stadt, "Salzburg");
  assertEquals(at.land, "AT");
  assertEquals(ch.stadt, "Wettingen");
  assertEquals(ch.land, "CH");
});

Deno.test("D2/12.11.: suche.html – nur Vor-Ort über RPC, KEIN Online-Split, fester Umkreis", async () => {
  const s = await lies("./suche.html");
  // Serverseitige Umkreissuche; der Vor-Ort/Online-Split in suche.html entfällt.
  assertStringIncludes(s, "rpc/suche_trainer_umkreis");
  assert(!s.includes("vexAbschnitte.einteilen(allTrainers, sel)"), "Online-Split noch aktiv");
  // Fester Umkreis (eine Konstante), kein Radius-Wähler/-Parameter mehr.
  assertStringIncludes(s, "const UMKREIS_KM = 25;");
  assert(!s.includes("q.get('radius')"), "Radius-Parameter noch gelesen");
  assert(!s.includes('id="radiusInput"'), "Radius-Wähler noch im HTML");
  // URL-Zustand bleibt (plz/land).
  assertStringIncludes(s, "function urlStand(");
});
