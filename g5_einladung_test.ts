// /Users/js/Projekte/Vexfit/app/vexfit/g5_einladung_test.ts
//
// Dauerlauf 13.11.2026 – G5: Einladungslink für Trainer.
// Geprüft:
//   * der Abendbericht zählt Registrierungen über die persönliche Einladung
//     (utm_source=persoenlich) aus der vorhandenen Herkunfts-Erfassung,
//   * trainer.html reicht die UTM an die Registrierung durch und meldet den
//     Trichter-Beacon mit Kampagne,
//   * docs/texte/einladung-trainer-2026-11-13.md nennt Link + exakte Preise,
//     ohne erfundene Kundenzahlen.
//
// Aufruf:  deno test --allow-read g5_einladung_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { abendberichtZahlenHolen } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("G5: Abendbericht zählt Trainer über die persönliche Einladung", async () => {
  // deno-lint-ignore no-explicit-any
  const lesen = (pfad: string): Promise<any[]> => {
    if (pfad.includes("trainers?created_at=gt") && pfad.includes("herkunft_quelle")) {
      return Promise.resolve([
        { herkunft_quelle: "persoenlich", herkunft_referrer: null },
        { herkunft_quelle: "persoenlich", herkunft_referrer: null },
        { herkunft_quelle: "instagram", herkunft_referrer: null },
      ]);
    }
    return Promise.resolve([]);
  };
  const zaehlen = (_p: string): Promise<number> => Promise.resolve(0);
  const z = await abendberichtZahlenHolen(lesen, zaehlen, Date.now(), () => Promise.resolve([]));
  assertEquals(z.neueTrainer, 3);
  assertEquals(z.einladungTrainer24h, 2); // nur die zwei „persoenlich"
  assert(z.neueTrainerHerkunft.some((h) => h.quelle === "persoenlich" && h.anzahl === 2));
});

Deno.test("G5: kern.ts zeigt die Einladungs-Zeile im Abendbericht", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, "Trainer über persönliche Einladung (24 h)");
  assertStringIncludes(kern, "einladungTrainer24h");
});

Deno.test("G5: trainer.html reicht UTM durch und meldet Kampagne", async () => {
  const s = await lies("./trainer.html");
  assertStringIncludes(s, 'a[href^="registrieren.html?typ=trainer"]');
  assertStringIncludes(s, "utm_campaign");
  assertStringIncludes(s, "kampagne");
});

Deno.test("G5: Einladungstext – Link + exakte Preise, keine erfundenen Zahlen", async () => {
  const d = await lies("./docs/texte/einladung-trainer-2026-11-13.md");
  assertStringIncludes(d, "trainer.html?utm_source=persoenlich&utm_campaign=einladung-jakob");
  assertStringIncludes(d, "kostenlos bis zur ersten angenommenen Kundenanfrage");
  assertStringIncludes(d, "49,99 €/Monat");
  assertStringIncludes(d, "monatlich kündbar");
  assertStringIncludes(d, "einmalig 9,99 €");
  // keine erfundene Kundenzahl / Trainerzahl
  assert(!/\d+\s*(Trainer|Kunden|Mitglieder)\b/i.test(d), "erfundene Zahl im Einladungstext");
});
