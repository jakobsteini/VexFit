// /Users/js/Projekte/Vexfit/app/vexfit/k8_abendbericht_texte_test.ts
//
// Dauerlauf 07.11.2026 – K8: Abendbericht + Texte angleichen. Geprüft:
//   * Abendbericht enthält die kurze Stadt-Übersicht Salzburg (50xx) und (aus
//     K1) den Kunden-Trichter,
//   * fehlende Tabellen lassen die Salzburg-Zeile einfach weg (kein Absturz),
//   * Text-Angleich: kein englisches „Login" mehr in index/suche (jetzt
//     „Anmelden").
//
// Aufruf:  deno test --allow-read k8_abendbericht_texte_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { abendberichtZahlenHolen, mailAbendbericht } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const JETZT = Date.parse("2026-11-07T12:00:00Z");

Deno.test("K8: Abendbericht enthält die Stadt-Übersicht Salzburg", async () => {
  const leser = async function <T>(pfad: string): Promise<T[]> {
    if (pfad.startsWith("trainers?plz=like.50")) return [{ ist_test: false }, { ist_test: false }, { ist_test: true }] as unknown as T[];
    if (pfad.startsWith("such_eingaben?plz=like.50")) return [{ plz: "5020" }, { plz: "5026" }] as unknown as T[];
    if (pfad.startsWith("warteliste?plz=like.50")) return [{ plz: "5020" }] as unknown as T[];
    return [] as T[];
  };
  // Etwas Tagesaktivität (z. B. neue Kunden), damit der Bericht nicht „leer"
  // ist und die Detailzeilen – inkl. Salzburg – erscheinen.
  const z = await abendberichtZahlenHolen(leser, async () => 1, JETZT);
  assert(z.salzburg, "Salzburg-Übersicht fehlt");
  assertEquals(z.salzburg.trainerFrei, 2); // Test-Konto ausgenommen
  assertEquals(z.salzburg.trainerReif, 0); // ohne Profilfelder < 5/8
  assertEquals(z.salzburg.suchen7, 2);
  assertEquals(z.salzburg.vorm, 1);
  const text = mailAbendbericht(z).text;
  assertStringIncludes(text, "Salzburg (50xx)");
  assertStringIncludes(text, "0/8"); // S6: ≥5/8 von Ziel 8
  assertStringIncludes(text, "2 freigegeben");
});

Deno.test("K8: fehlende Salzburg-Tabellen -> kein Absturz (trainerFrei aus, Rest 0)", async () => {
  const leser = async function <T>(pfad: string): Promise<T[]> {
    if (pfad.startsWith("trainers?plz=like.50")) return [{ ist_test: false }] as unknown as T[];
    throw new Error("HTTP 404"); // such_eingaben/warteliste fehlen
  };
  const z = await abendberichtZahlenHolen(leser, async () => 0, JETZT);
  assert(z.salzburg, "Salzburg sollte trotzdem gesetzt sein");
  assertEquals(z.salzburg.trainerFrei, 1);
  assertEquals(z.salzburg.suchen7, 0);
  assertEquals(z.salzburg.vorm, 0);
});

Deno.test("K8: kein englisches Login mehr (Text-Angleich)", async () => {
  for (const f of ["index.html", "suche.html"]) {
    const s = await lies("./" + f);
    assert(!s.includes(">Login<"), `${f}: englisches Login noch im Navigationslink`);
  }
});
