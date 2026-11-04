// /Users/js/Projekte/Vexfit/app/vexfit/preis_formulierung_test.ts
//
// Baustein "Preis-Formulierung an die AGB angleichen".
//
// Hintergrund: AGB §3 (rechtliches.html) sagt klar: Die Nutzung ist für Trainer
// kostenlos, SOLANGE sie noch KEINE Kundenanfrage über Vexfit ANGENOMMEN haben.
// Erst mit der Annahme der ersten Kundenanfrage (Schaltfläche „Annehmen") beginnt
// die Zahlungspflicht. Viele Werbetexte sagten stattdessen „kostenlos bis zum
// ersten Kunden" bzw. „bis du deinen ersten Kunden gewonnen hast" — ein
// Schweizer Berufsverband hat das am 04.11.2026 als Widerspruch zu den AGB
// beanstandet.
//
// Dieser Test scannt alle AUSGELIEFERTEN Dateien (.html/.js/.ts/.mjs) und
// schlägt fehl, wenn eine der alten, AGB-widrigen Formulierungen wieder
// auftaucht. Ausgenommen sind reine Entwürfe (entwuerfe/), Prüfartefakte
// (pruefung/), die Dokumentation (docs/) sowie die Testdateien selbst
// (*_test.ts). Zusätzlich wird geprüft, dass index.html, registrieren.html und
// die Freischalt-Mail in kern.ts die neue, einheitliche Formulierung enthalten.
//
// Aufruf:  deno test --allow-read preis_formulierung_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const wurzel = new URL("./", import.meta.url);

// Verbotene alte Formulierungen (case-insensitive geprüft).
const VERBOTEN = [
  "bis zum ersten kunden",
  "bis zu deinem ersten kunden",
  "ersten kunden gewonnen",
];

// Diese Verzeichnisse werden nicht ausgeliefert bzw. sind laut Aufgabe
// ausgenommen und nur zu listen, nicht zu ändern.
const AUSGENOMMEN_DIRS = new Set([
  "node_modules",
  ".git",
  "entwuerfe",
  "pruefung",
  "docs",
]);

const ENDUNGEN = [".html", ".js", ".ts", ".mjs"];

async function* dateien(dir: URL): AsyncGenerator<URL> {
  for await (const eintrag of Deno.readDir(dir)) {
    if (eintrag.isDirectory) {
      if (AUSGENOMMEN_DIRS.has(eintrag.name)) continue;
      yield* dateien(new URL(eintrag.name + "/", dir));
    } else if (eintrag.isFile) {
      const name = eintrag.name;
      if (name.endsWith("_test.ts")) continue; // Testdateien nicht scannen
      if (!ENDUNGEN.some((e) => name.endsWith(e))) continue;
      yield new URL(name, dir);
    }
  }
}

Deno.test("keine alte, AGB-widrige Preis-Formulierung in ausgelieferten Dateien", async () => {
  const treffer: string[] = [];
  for await (const datei of dateien(wurzel)) {
    const inhalt = (await Deno.readTextFile(datei)).toLowerCase();
    for (const phrase of VERBOTEN) {
      if (inhalt.includes(phrase)) {
        const pfad = decodeURIComponent(datei.pathname).replace(
          decodeURIComponent(wurzel.pathname),
          "",
        );
        treffer.push(`${pfad}: "${phrase}"`);
      }
    }
  }
  assert(
    treffer.length === 0,
    "AGB-widrige Formulierung gefunden (Zahlungspflicht beginnt laut §3 erst " +
      "mit der ANNAHME der ersten Kundenanfrage):\n" + treffer.join("\n"),
  );
});

Deno.test("neue, einheitliche Formulierung steht in index, registrieren und der Freischalt-Mail", async () => {
  const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

  const index = await lies("./index.html");
  assertStringIncludes(
    index,
    "Kostenlos bis zur ersten angenommenen Kundenanfrage · danach 49,99 €/Monat",
    "index.html ohne die neue Kurzform",
  );

  const registrieren = await lies("./registrieren.html");
  assertStringIncludes(
    registrieren,
    "Kostenlos, bis du die erste Kundenanfrage über Vexfit annimmst. Danach " +
      "49,99 €/Monat, monatlich kündbar. Jeder weitere Kunde über Vexfit einmalig 9,99 €.",
    "registrieren.html ohne die neue Langform",
  );

  // Hinweis: Im Quelltext ist der Satz über zwei String-Literale verteilt, daher
  // wird eine Teilzeichenkette geprüft, die innerhalb eines Literals steht. Der
  // komplette, zusammengesetzte Satz wird in admin_freischalt_mail_test.ts gegen
  // den fertigen Mailtext geprüft.
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(
    kern,
    "Annahme deiner ersten Kundenanfrage über Vexfit beginnt die Zahlungspflicht",
    "Freischalt-Mail (kern.ts) ohne die neue Formulierung",
  );
});
