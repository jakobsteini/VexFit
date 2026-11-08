// /Users/js/Projekte/Vexfit/app/vexfit/stadtseiten_vorschau_test.ts
//
// Baustein 08.11.2026: Der SEO-Generator (werkzeuge/stadtseiten.mjs) liest
// Trainer nur noch ueber die PII-sichere Sicht trainers_vorschau (nur
// nachname_initial). Frueher las er trainers_oeffentlich mit der Spalte
// nachname; seit anon dort kein Leserecht mehr hat (Migration 2026-11-08-03),
// lieferte das HTTP 401 und der GitHub-Lauf „seo" schlug fehl.
//
// Dieser Test fuehrt den Lade- und Render-Weg gegen eine ATTRAPPE der
// REST-Antwort und stellt sicher:
//   * ladeVorschauTrainer laeuft ohne Fehler, fragt trainers_vorschau an und
//     NIE den vollen Nachnamen (select ohne nachname, kein select=*),
//   * in keiner erzeugten Ausgabe (Stadtseite, JSON-LD, Sitemap) steht der
//     volle Nachname – auch dann nicht, wenn die Antwort ihn faelschlich
//     mitliefert (Kanarienwert),
//   * die Sitemap enthaelt personal-trainer-salzburg.html,
//   * bei HTTP-Fehler wirft der Lader (main bricht dann sauber ab).
//
// Aufruf:  deno test --allow-read stadtseiten_vorschau_test.ts
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import {
  anzeigeName,
  jsonLd,
  ladeVorschauTrainer,
  sitemapXml,
  SPALTEN,
  stadtDateien,
  stadtseiteHtml,
} from "./werkzeuge/stadtseiten.mjs";

// Ein voller Nachname, der in der (falschen) Antwort steht, aber NIE in einer
// erzeugten Datei auftauchen darf. Die echte Vorschau liefert ihn nie.
const CANARY = "GEHEIMNACHNAME";
const SALZBURG = [
  { id: "s1", vorname: "Marco", nachname_initial: "B.", nachname: CANARY, stadt: "Salzburg", plz: "5020", trainingsart: "Functional", trainingsort: "vor ort", spezialisierungen: ["Kraft"], bio: "x", preis_stunde: 55, avatar_url: null },
  { id: "s2", vorname: "Anna", nachname_initial: "O.", nachname: CANARY, stadt: "Salzburg", plz: "5020", trainingsart: "Yoga", trainingsort: "vor ort", spezialisierungen: ["Yoga"], bio: "y", preis_stunde: 60, avatar_url: null },
  { id: "s3", vorname: "Lena", nachname_initial: "K.", nachname: CANARY, stadt: "Salzburg", plz: "5020", trainingsart: "Kraft", trainingsort: "vor ort", spezialisierungen: ["Reha"], bio: "z", preis_stunde: 50, avatar_url: null },
];

Deno.test("Generator: SPALTEN fragt nachname_initial, nie den vollen Nachnamen", () => {
  const felder = SPALTEN.split(",");
  assert(!felder.includes("nachname"), "SPALTEN enthaelt den vollen Nachnamen");
  assert(felder.includes("nachname_initial"), "SPALTEN sollte nachname_initial laden");
  for (const feld of ["email", "telefon", "telephone"]) {
    assert(!felder.includes(feld), `SPALTEN darf ${feld} nicht enthalten`);
  }
});

Deno.test("ladeVorschauTrainer: fragt trainers_vorschau ohne vollen Nachnamen", async () => {
  let gesehen = "";
  const mock = (url: string) => {
    gesehen = url;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(SALZBURG) } as Response);
  };
  const trainer = await ladeVorschauTrainer(mock as typeof fetch);
  assertEquals(trainer.length, 3);
  assertStringIncludes(gesehen, "/rest/v1/trainers_vorschau");
  assert(!gesehen.includes("trainers_oeffentlich"), "liest noch die alte Sicht");
  const roh = decodeURIComponent(gesehen);
  assert(!/select=[^&]*\bnachname\b(?!_initial)/.test(roh), "select fragt den vollen Nachnamen an");
  assert(!/select=\*/.test(roh), "select=* ist unzulaessig (koennte nachname mitholen)");
  assert(!/order=nachname\b(?!_initial)/.test(roh), "order nach vollem Nachnamen");
});

Deno.test("ladeVorschauTrainer: wirft bei HTTP-Fehler (main bricht ab)", async () => {
  const mock = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve([]) } as Response);
  await assertRejects(() => ladeVorschauTrainer(mock as typeof fetch), Error, "401");
});

Deno.test("Erzeugte Stadtseite: 'Vorname N.', nie der volle Nachname", () => {
  const geplant = stadtDateien(SALZBURG);
  assertEquals(geplant.length, 1);
  assertEquals(geplant[0].datei, "personal-trainer-salzburg.html");
  const html = stadtseiteHtml("Salzburg", SALZBURG);
  assert(!html.includes(CANARY), "voller Nachname in der Stadtseite");
  assertStringIncludes(html, anzeigeName(SALZBURG[0])); // „Marco B."
  assertStringIncludes(html, "Marco B.");
});

Deno.test("JSON-LD der Stadtseite: Name nur 'Vorname N.', kein voller Nachname", () => {
  const jl = jsonLd("Salzburg", SALZBURG);
  assert(!jl.includes(CANARY), "voller Nachname im JSON-LD");
  assertStringIncludes(jl, "Marco B.");
  // gueltiges JSON
  const daten = JSON.parse(jl);
  assertEquals(daten.itemListElement.length, 3);
});

Deno.test("Sitemap enthaelt personal-trainer-salzburg.html und keinen Nachnamen", () => {
  const xml = sitemapXml(SALZBURG, ["index.html", "personal-trainer-salzburg.html", "suche.html"], "2026-11-08");
  assertStringIncludes(xml, "https://vexfit.app/personal-trainer-salzburg.html");
  assert(!xml.includes(CANARY), "voller Nachname in der Sitemap");
});
