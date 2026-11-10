// /Users/js/Projekte/Vexfit/app/vexfit/s6_salzburg_test.ts
//
// Dauerlauf 07./08.11.2026 – S6: Salzburg-Ziel im Admin + Abendbericht.
//
// Aufruf:  deno test --allow-read s6_salzburg_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type AbendberichtZahlen,
  istSalzburgPlz,
  mailAbendbericht,
  SALZBURG_PLZ_PRAEFIXE,
  salzburgPlzFilter,
  SALZBURG_ZIEL,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const BASIS: AbendberichtZahlen = {
  neueTrainer: 0, neueTrainerHerkunft: [], neueKunden: 0, wartenNamen: [],
  anfragenOffen: 0, anfragenNeu24h: 0, anfragenZurPruefung: 0, anfragenAngenommen24h: 0, anfragenAbgelehnt24h: 0, ersatzVersendet: 0, warteliste: 0, bezahlt: 0, zahlungFehlgeschlagen: 0, gekuendigt: 0,
  trichter24h: [], profileUnter5: 0, profilErinnerungen24h: 0, profilErinnerungenGesamt: 0,
  kundenTrichter24h: { seite: 0, suche: 0, treffer: 0, profil: 0, anfrage_start: 0, anfrage: 0 },
  salzburg: null, fehler: [], cronHinweise: [],
};

Deno.test("S6/E4: Region 50/51/52 (eine Konstante), Ziel 8", () => {
  assertEquals([...SALZBURG_PLZ_PRAEFIXE], ["50", "51", "52"]);
  assertEquals(SALZBURG_ZIEL, 8);
  // E4: Seekirchen (5201, Flachgau) zählt zu Salzburg, Wien (1010) nicht.
  assert(istSalzburgPlz("5201"));
  assert(istSalzburgPlz("5020"));
  assert(istSalzburgPlz("5110"));
  assert(!istSalzburgPlz("1010"));
  // PostgREST-Filter deckt alle Präfixe ab.
  assertEquals(salzburgPlzFilter(), "or=(plz.like.50*,plz.like.51*,plz.like.52*)");
});

Deno.test("S6/E4: Abendbericht – Zeile Raum Salzburg 50/51 plus Trainerliste", () => {
  const zahlen: AbendberichtZahlen = {
    ...BASIS,
    neueKunden: 1, // damit der Bericht nicht auf „nichts Neues" kürzt
    salzburg: {
      trainerFrei: 5, trainerReif: 3, suchen7: 7, vorm: 2, anfragen7: 4, annahmen7: 1,
      trainer: [
        { name: "Nina B.", ort: "Salzburg", erfuellt: 6, frei: true },
        { name: "Tom K.", ort: "Seekirchen", erfuellt: 3, frei: false },
      ],
    },
  };
  const m = mailAbendbericht(zahlen);
  const txt = m.text + m.html;
  assertStringIncludes(txt, "Raum Salzburg (50/51/52)");
  assertStringIncludes(txt, "3/8");          // trainerReif / Ziel
  assertStringIncludes(txt, "5 freigegeben");
  assertStringIncludes(txt, "4 Anfragen");
  assertStringIncludes(txt, "1 Annahmen");
  // E4: je Trainer „Vorname N., Ort, x/8, freigegeben ja/nein".
  assertStringIncludes(txt, "Nina B.");
  assertStringIncludes(txt, "Salzburg, 6/8, freigegeben ja");
  assertStringIncludes(txt, "Seekirchen, 3/8, freigegeben nein");
});

Deno.test("S6: Admin-Nachfrage-Reiter hat die Salzburg-Karte", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'id="salzburg-karte"');
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function renderSalzburgKarte");
  assertStringIncludes(js, "SALZBURG_ZIEL = 8");
  // E4: Region über die Präfixe 50/51 (eine Quelle).
  assertStringIncludes(js, 'SALZBURG_PLZ_PRAEFIXE = ["50", "51", "52"]');
  assert(js.includes('SALZBURG_PLZ_PRAEFIXE.some((p) => String(plz || "").startsWith(p))'));
});
