// /Users/js/Projekte/Vexfit/app/vexfit/namen_test.ts
//
// Feinschliff Teil 3: die gemeinsame Namensfunktion. Prüft die geforderten Fälle
// und dass die drei Fassungen (vexfit-namen.js = window.vexName, die Verwaltung
// und die Edge/Mails) WORTGLEICH arbeiten.
//
// Aufruf:  deno test --allow-read namen_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { nameFormatieren as ausVerwaltung } from "./vexfit-verwaltung.js";
import { nameFormatieren as ausKern } from "./supabase/functions/vexfit-automation/kern.ts";

// vexfit-namen.js ist ein klassisches Skript (kein ES-Export). Für den Test wird
// es ausgewertet; dabei setzt es globalThis.vexName.
const quelle = await Deno.readTextFile(new URL("./vexfit-namen.js", import.meta.url));
(0, eval)(quelle);
// deno-lint-ignore no-explicit-any
const vexName = (globalThis as any).vexName as (s: unknown) => string;

Deno.test("vexfit-namen.js stellt vexName bereit", () => {
  assertEquals(typeof vexName, "function");
});

Deno.test("Teil 3: die geforderten Fälle", () => {
  assertEquals(vexName("jajajaa hebebee"), "Jajajaa Hebebee");
  assertEquals(vexName("anna-lena müller"), "Anna-Lena Müller");
  assertEquals(vexName("ludwig van beethoven"), "Ludwig van Beethoven");
  assertEquals(vexName("McDonald"), "McDonald");
});

Deno.test("Teil 3: weitere sinnvolle Fälle", () => {
  assertEquals(vexName("MÜLLER"), "Müller");               // ganz groß wird normalisiert
  assertEquals(vexName("  max   mustermann  "), "Max Mustermann"); // Mehrfach-Leerzeichen
  assertEquals(vexName("o'brien"), "O'Brien");             // Apostroph
  assertEquals(vexName("de vries"), "De Vries");           // Zusatz am Anfang bleibt groß
  assertEquals(vexName("lisa de wit"), "Lisa de Wit");     // Zusatz in der Mitte klein
  assertEquals(vexName(""), "");
  assertEquals(vexName(null), "");
  assertEquals(vexName(undefined), "");
  assertEquals(vexName("DeWitt"), "DeWitt");               // gewollte Binnengroßschreibung bleibt
});

Deno.test("Teil 3: alle drei Fassungen sind wortgleich", () => {
  const faelle = [
    "jajajaa hebebee", "anna-lena müller", "ludwig van beethoven", "McDonald",
    "MÜLLER", "o'brien", "de vries", "lisa de wit", "", "  max   mustermann  ",
    "josé GARCÍA", "van der berg", "jean-luc PICARD", "ANNA-MARIA", "DeWitt",
    "hans-peter von der leyen", "mc gregor", "XÆ a-12",
  ];
  for (const f of faelle) {
    const a = vexName(f);
    assertEquals(ausVerwaltung(f), a, `Verwaltung weicht ab bei "${f}"`);
    assertEquals(ausKern(f), a, `kern.ts weicht ab bei "${f}"`);
  }
});

Deno.test("Teil 3: ändert gespeicherte Daten nicht (reine Funktion, kein Nebeneffekt)", () => {
  const eingabe = "jajajaa hebebee";
  vexName(eingabe);
  assertEquals(eingabe, "jajajaa hebebee");
});
