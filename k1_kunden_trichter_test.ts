// /Users/js/Projekte/Vexfit/app/vexfit/k1_kunden_trichter_test.ts
//
// Dauerlauf 07.11.2026 – K1: Kunden-Trichter messen. Geprüft:
//   * reine Aggregation trichterKundeNachQuelle (6 Stufen, nach Herkunft UND
//     PLZ-Bereich; Trainer-Ereignisse bleiben draußen),
//   * trichterNachQuelle (Trainer) schließt Kunden-Ereignisse jetzt aus,
//   * plzBereich kürzt auf zwei Ziffern,
//   * suche.html/kunden-bereich.html feuern die Kunden-Beacons,
//   * Abendbericht enthält die Kunden-Trichter-Summen (24 h),
//   * Migration + Rücknahme vorhanden.
//
// Aufruf:  deno test --allow-read k1_kunden_trichter_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { KUNDE_TRICHTER_STUFEN, trichterKundeNachQuelle, trichterNachQuelle } from "./vexfit-verwaltung.js";
import { abendberichtZahlenHolen, kundenTrichterSumme } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const JETZT = Date.parse("2026-11-07T12:00:00Z");
const vor = (h: number) => new Date(JETZT - h * 3_600_000).toISOString();

Deno.test("K1: sechs Kunden-Stufen in Reihenfolge", () => {
  assertEquals(KUNDE_TRICHTER_STUFEN, ["seite", "suche", "treffer", "profil", "anfrage_start", "anfrage"]);
});

Deno.test("K1: trichterKundeNachQuelle zählt nach Herkunft und PLZ-Bereich, nur Kunde", () => {
  const ev = [
    { stufe: "seite", rolle: "kunde", quelle: "google", plz_bereich: "50", erstellt_am: vor(1) },
    { stufe: "suche", rolle: "kunde", quelle: "google", plz_bereich: "50", erstellt_am: vor(1) },
    { stufe: "treffer", rolle: "kunde", quelle: "google", plz_bereich: "50", erstellt_am: vor(1) },
    { stufe: "anfrage", rolle: "kunde", quelle: null, plz_bereich: "40", erstellt_am: vor(2) },
    { stufe: "seite", rolle: "trainer", quelle: "meta", erstellt_am: vor(1) }, // Trainer: ignoriert
    { stufe: "suche", rolle: "kunde", quelle: "google", plz_bereich: "50", erstellt_am: vor(240) }, // zu alt
  ];
  const r = trichterKundeNachQuelle(ev, JETZT, 7) as unknown as {
    gesamt: Record<string, number>;
    quellen: Record<string, Record<string, number>>;
    plzBereiche: Record<string, Record<string, number>>;
  };
  assertEquals(r.quellen["google"].seite, 1);
  assertEquals(r.quellen["google"].suche, 1);
  assertEquals(r.quellen["direkt/unbekannt"].anfrage, 1);
  assertEquals(r.plzBereiche["50"].treffer, 1);
  assertEquals(r.plzBereiche["40"].anfrage, 1);
  assertEquals(r.gesamt.seite, 1); // nur der Kunde-seite, nicht der Trainer
});

Deno.test("K1: Trainer-Trichter schließt Kunden-Ereignisse aus", () => {
  const ev = [
    { stufe: "seite", rolle: "kunde", quelle: "google", erstellt_am: vor(1) },
    { stufe: "seite", rolle: "trainer", quelle: "meta", erstellt_am: vor(1) },
  ];
  const r = trichterNachQuelle(ev, JETZT, 7) as unknown as { gesamt: Record<string, number> };
  assertEquals(r.gesamt.seite, 1); // nur Trainer
});

Deno.test("K1: Beacons in suche.html und kunden-bereich.html", async () => {
  const suche = await lies("./suche.html");
  assertStringIncludes(suche, "vexfit-trichter.js");
  assertStringIncludes(suche, "vexfitTrichter('seite'");
  assertStringIncludes(suche, "vexfitTrichter('suche'");
  assertStringIncludes(suche, "vexfitTrichter('treffer'");
  assertStringIncludes(suche, "vexfitTrichter('profil'");
  const kb = await lies("./kunden-bereich.html");
  assertStringIncludes(kb, "vexfitTrichter('anfrage_start'");
  assertStringIncludes(kb, "vexfitTrichter('anfrage'");
});

Deno.test("K1: Beacon trägt keine Personendaten", async () => {
  const js = await lies("./vexfit-trichter.js");
  // Nur utm/browsertyp/plz_bereich, keine email/name im Körper.
  const i = js.indexOf("var koerper");
  const f = js.slice(i, i + 400);
  assert(!/email|vorname|nachname/.test(f), "Beacon-Körper enthält Personendaten");
  assertStringIncludes(js, "slice(0, 2)"); // PLZ nur zwei Ziffern
});

Deno.test("K1: Abendbericht enthält die Kunden-Trichter-Summen (24 h)", async () => {
  const leser = async function <T>(pfad: string): Promise<T[]> {
    if (pfad.startsWith("trichter_ereignisse")) {
      return [
        { stufe: "seite", rolle: "kunde", quelle: "google" },
        { stufe: "suche", rolle: "kunde", quelle: "google" },
        { stufe: "anfrage", rolle: "kunde", quelle: "google" },
      ] as unknown as T[];
    }
    return [] as T[];
  };
  const z = await abendberichtZahlenHolen(leser, async () => 0, JETZT);
  assertEquals(z.kundenTrichter24h.seite, 1);
  assertEquals(z.kundenTrichter24h.anfrage, 1);
  assertEquals(kundenTrichterSumme(z.kundenTrichter24h), 3);
});

Deno.test("K1: Migration + Rücknahme vorhanden (Stufen-CHECK + plz_bereich)", async () => {
  const m = await lies("./migrations/2026-11-07-01-kunden-trichter.sql");
  assertStringIncludes(m, "'suche','treffer','profil','anfrage_start','anfrage'");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS plz_bereich text");
  const r = await lies("./migrations/ruecknahmen/2026-11-07-01-kunden-trichter-ruecknahme.sql");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS plz_bereich");
});
