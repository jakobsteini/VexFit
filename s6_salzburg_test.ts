// /Users/js/Projekte/Vexfit/app/vexfit/s6_salzburg_test.ts
//
// Dauerlauf 07./08.11.2026 – S6: Salzburg-Ziel im Admin + Abendbericht.
//
// Aufruf:  deno test --allow-read s6_salzburg_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type AbendberichtZahlen,
  mailAbendbericht,
  SALZBURG_PLZ_PRAEFIX,
  SALZBURG_ZIEL,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const BASIS: AbendberichtZahlen = {
  neueTrainer: 0, neueTrainerHerkunft: [], neueKunden: 0, wartenNamen: [],
  anfragenOffen: 0, anfragenNeu24h: 0, anfragenZurPruefung: 0, anfragenAngenommen24h: 0, anfragenAbgelehnt24h: 0, ersatzVersendet: 0, warteliste: 0, bezahlt: 0, zahlungFehlgeschlagen: 0, gekuendigt: 0,
  trichter24h: [], profileUnter5: 0,
  kundenTrichter24h: { seite: 0, suche: 0, treffer: 0, profil: 0, anfrage_start: 0, anfrage: 0 },
  salzburg: null, fehler: [], cronHinweise: [],
};

Deno.test("S6: Konstanten (Region 50, Ziel 8)", () => {
  assertEquals(SALZBURG_PLZ_PRAEFIX, "50");
  assertEquals(SALZBURG_ZIEL, 8);
});

Deno.test("S6: Abendbericht enthält die Salzburg-Zeile mit ≥5/8, Ziel, Anfragen, Annahmen", () => {
  const zahlen: AbendberichtZahlen = {
    ...BASIS,
    neueKunden: 1, // damit der Bericht nicht auf „nichts Neues" kürzt
    salzburg: { trainerFrei: 5, trainerReif: 3, suchen7: 7, vorm: 2, anfragen7: 4, annahmen7: 1 },
  };
  const m = mailAbendbericht(zahlen);
  const txt = m.text + m.html;
  assertStringIncludes(txt, "Salzburg (50xx)");
  assertStringIncludes(txt, "3/8");          // trainerReif / Ziel
  assertStringIncludes(txt, "5 freigegeben");
  assertStringIncludes(txt, "4 Anfragen");
  assertStringIncludes(txt, "1 Annahmen");
});

Deno.test("S6: Admin-Nachfrage-Reiter hat die Salzburg-Karte", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'id="salzburg-karte"');
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function renderSalzburgKarte");
  assertStringIncludes(js, "SALZBURG_ZIEL = 8");
  assert(js.includes('startsWith(SALZBURG_PRAEFIX)'));
});
