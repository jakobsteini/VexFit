// /Users/js/Projekte/Vexfit/app/vexfit/k8_abendbericht_texte_test.ts
//
// Dauerlauf 07.11.2026 – K8: Abendbericht + Texte angleichen. Geprüft:
//   * Abendbericht enthält die kurze Stadt-Übersicht Raum Salzburg (50/51/52) und (aus
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
    // E4: Region über or=(plz.like.50*,plz.like.51*); Seekirchen (5201) zählt mit.
    if (pfad.startsWith("trainers?or=")) {
      return [
        { ist_test: false, aktiv: true, plz: "5020", vorname: "A" },
        { ist_test: false, aktiv: true, plz: "5201", vorname: "B" }, // Seekirchen
        { ist_test: true, aktiv: true, plz: "5020", vorname: "T" },
      ] as unknown as T[];
    }
    if (pfad.startsWith("such_eingaben?or=")) return [{ plz: "5020" }, { plz: "5201" }] as unknown as T[];
    if (pfad.startsWith("warteliste?or=")) return [{ plz: "5020" }] as unknown as T[];
    return [] as T[];
  };
  // Etwas Tagesaktivität (z. B. neue Kunden), damit der Bericht nicht „leer"
  // ist und die Detailzeilen – inkl. Salzburg – erscheinen.
  const z = await abendberichtZahlenHolen(leser, async () => 1, JETZT);
  assert(z.salzburg, "Salzburg-Übersicht fehlt");
  assertEquals(z.salzburg.trainerFrei, 2); // Test-Konto ausgenommen
  assertEquals(z.salzburg.trainerReif, 0); // ohne Profilfelder < 5/8
  assertEquals(z.salzburg.suchen7, 2);     // 5020 + 5201 (Seekirchen)
  assertEquals(z.salzburg.vorm, 1);
  assertEquals(z.salzburg.trainer.length, 2); // E4: beide Nicht-Test-Trainer gelistet
  const text = mailAbendbericht(z).text;
  assertStringIncludes(text, "Raum Salzburg (50/51/52)");
  assertStringIncludes(text, "0/8"); // S6: ≥5/8 von Ziel 8
  assertStringIncludes(text, "2 freigegeben");
});

Deno.test("K8: fehlende Salzburg-Tabellen -> kein Absturz (trainerFrei aus, Rest 0)", async () => {
  const leser = async function <T>(pfad: string): Promise<T[]> {
    if (pfad.startsWith("trainers?or=")) return [{ ist_test: false, aktiv: true, plz: "5020" }] as unknown as T[];
    throw new Error("HTTP 404"); // such_eingaben/warteliste fehlen
  };
  const z = await abendberichtZahlenHolen(leser, async () => 0, JETZT);
  assert(z.salzburg, "Salzburg sollte trotzdem gesetzt sein");
  assertEquals(z.salzburg.trainerFrei, 1);
  assertEquals(z.salzburg.suchen7, 0);
  assertEquals(z.salzburg.vorm, 0);
});

// E5 (10.11.): „Warten auf Freigabe" ohne Test/Spam; „Bereit zur Freigabe" (≥5/8).
Deno.test("E5: Abendbericht – Warten ohne Test-Konten, Bereit-zur-Freigabe-Liste", async () => {
  const voll = {
    avatar_url: "https://x/storage/v1/object/public/avatars/u/a.jpg",
    trainingsart: "EMS", trainingsort: "vor_ort", preis_stunde: 50,
    bio: "ein ausreichend langer Text", erfahrung: "5 Jahre",
    spezialisierungen: ["Kraft"], telefon: "+43 1 2",
  };
  const leser = function <T>(pfad: string): Promise<T[]> {
    if (pfad.startsWith("trainers?aktiv=eq.false")) {
      return Promise.resolve([
        { vorname: "Reif", nachname: "Eins", email: "r@b.at", ...voll },      // 8/8, echt
        { vorname: "Roh", nachname: "Zwei", email: "roh@b.at", trainingsart: "EMS" }, // <5
        { vorname: "Test", nachname: "Drei", email: "t+x@b.at", ...voll },     // Test-Alias
      ] as unknown as T[]);
    }
    return Promise.resolve([] as T[]);
  };
  const z = await abendberichtZahlenHolen(leser, () => Promise.resolve(0), JETZT);
  // Test-Alias ausgeschlossen.
  assertEquals(z.wartenNamen, ["Reif Eins", "Roh Zwei"]);
  // Nur der reife (≥5/8) ist „bereit".
  assertEquals(z.bereitFreigabe.map((t) => t.name), ["Reif Eins"]);
  assertEquals(z.bereitFreigabe[0].erfuellt, 8);
  const text = mailAbendbericht({ ...z, neueKunden: 1 }).text;
  assertStringIncludes(text, "Bereit zur Freigabe (≥5/8): 1 (Reif Eins 8/8)");
});

Deno.test("K8: kein englisches Login mehr (Text-Angleich)", async () => {
  for (const f of ["index.html", "suche.html"]) {
    const s = await lies("./" + f);
    assert(!s.includes(">Login<"), `${f}: englisches Login noch im Navigationslink`);
  }
});
