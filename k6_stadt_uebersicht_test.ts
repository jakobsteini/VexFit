// /Users/js/Projekte/Vexfit/app/vexfit/k6_stadt_uebersicht_test.ts
//
// Dauerlauf 07.11.2026 – K6: Admin Stadt-Übersicht. Geprüft:
//   * stadtUebersicht aggregiert je PLZ: freigegebene Trainer (ohne Test/Spam,
//     ohne inaktiv/gesperrt), davon ≥5/8, Suchen 7/30 Tage, Vormerkungen,
//     Anfragen (über trainer_id),
//   * stadtUebersichtSortiert: Nachfrage ohne Trainer zuerst / nach Feld,
//   * Admin-HTML hat die Tabelle + sortierbare Spalten, ladeNachfrage lädt die
//     Zusatzdaten.
//
// Aufruf:  deno test --allow-read k6_stadt_uebersicht_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { stadtUebersicht, stadtUebersichtSortiert } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const JETZT = Date.parse("2026-11-07T12:00:00Z");
const vorTagen = (d: number) => new Date(JETZT - d * 86400000).toISOString();

const vollesProfil = (plz: string, stadt: string, extra: Record<string, unknown> = {}) => ({
  plz, stadt, aktiv: true, gesperrt: false,
  avatar_url: "https://x/storage/v1/object/public/avatars/a.png",
  trainingsart: "EMS", trainingsort: "online", preis_stunde: 50, bio: "langer genug text",
  erfahrung: "5 Jahre", spezialisierungen: ["Kraft"], telefon: "+43 1",
  ...extra,
});

Deno.test("K6: stadtUebersicht zählt frei/≥5/8/Suchen/Vormerk/Anfragen, ohne Test/Spam", () => {
  const trainers = [
    { id: "t1", ...vollesProfil("5020", "Salzburg") },                 // frei + reif
    { id: "t2", ...vollesProfil("5020", "Salzburg"), avatar_url: null, trainingsart: "", trainingsort: "", preis_stunde: 0, bio: "", erfahrung: "" }, // frei, nicht reif
    { id: "t3", ...vollesProfil("5020", "Salzburg"), aktiv: false },    // nicht freigegeben
    { id: "t4", ...vollesProfil("5020", "Salzburg"), ist_test: true },  // Test -> ignoriert
    { id: "t5", ...vollesProfil("1010", "Wien") },                      // anderer Ort
  ];
  const suchen = [
    { plz: "5020", erstellt_am: vorTagen(1) }, { plz: "5020", erstellt_am: vorTagen(3) },
    { plz: "5020", erstellt_am: vorTagen(20) }, { plz: "5020", erstellt_am: vorTagen(40) },
  ];
  const warteliste = [{ plz: "5020", stadt: "Salzburg" }];
  const anfragen = [{ trainer_id: "t1" }, { trainer_id: "t5" }];
  const liste = stadtUebersicht({ trainers, suchen, warteliste, anfragen }, JETZT) as Array<Record<string, number & string>>;
  const sbg = liste.find((o) => o.plz === "5020") as unknown as Record<string, number>;
  assertEquals(sbg.trainerFrei, 2);  // t1 + t2 (t3 inaktiv, t4 test)
  assertEquals(sbg.trainerReif, 1);  // nur t1
  assertEquals(sbg.suchen7, 2);
  assertEquals(sbg.suchen30, 3);     // 40 Tage draußen
  assertEquals(sbg.vorm, 1);
  assertEquals(sbg.anfragen, 1);     // t1
});

Deno.test("K6: Sortierung stellt Nachfrage ohne Trainer nach vorne", () => {
  const liste = [
    { plz: "5020", stadt: "Salzburg", trainerFrei: 3, trainerReif: 2, suchen7: 1, suchen30: 2, vorm: 0, anfragen: 1 },
    { plz: "4020", stadt: "Linz", trainerFrei: 0, trainerReif: 0, suchen7: 2, suchen30: 5, vorm: 2, anfragen: 0 },
  ];
  const s = stadtUebersichtSortiert(liste, "bedarf");
  assertEquals(s[0].plz, "4020"); // Nachfrage ohne Trainer zuerst
  const nachAnfragen = stadtUebersichtSortiert(liste, "anfragen");
  assertEquals(nachAnfragen[0].plz, "5020");
});

Deno.test("K6: Admin-HTML + Ladefunktion", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'id="stadt-uebersicht-tbody"');
  assertStringIncludes(html, 'class="stadt-sort" data-feld="suchen7"');
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function renderStadtUebersicht(");
  assertStringIncludes(js, "such_eingaben?select=plz,erstellt_am");
  assertStringIncludes(js, "anfragen?select=trainer_id");
  assertStringIncludes(js, 'th.stadt-sort');
});
