// /Users/js/Projekte/Vexfit/app/vexfit/nachtlauf_phase1_test.ts
//
// Nachtlauf 02./03.11.2026 – Phase 1 "Bekannte Kleinigkeiten".
// Faengt kuenftig die in dieser Nacht behobenen Kleinigkeiten:
//  1. Wortmarke liest sich als "VEXFIT" (verstecktes V vor EXFIT) – nicht "EXFIT".
//  3. AGB-Link im Trainer-Formular springt in den AGB-Abschnitt (#agb).
//  4. Preise werden einheitlich "49,99 €" / "9,99 €" geschrieben (Betrag, dann €)
//     auf allen oeffentlichen Seiten ausser der Rechtsseite (die wird nicht angefasst).
//  5. Direkt beim Trainer-Knopf stehen alle Kosten ehrlich: gratis bis zum ersten
//     Kunden, danach 49,99 €/Monat, monatlich kuendbar, je weiterem Kunden 9,99 €.
//
// Aufruf:  deno test --allow-read nachtlauf_phase1_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));

async function oeffentlicheHtml(): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(hier("."))) {
    if (!e.isFile || !e.name.endsWith(".html")) continue;
    if (e.name === "admin.html" || e.name.startsWith("verwaltung-")) continue;
    out.push(e.name);
  }
  return out.sort();
}

Deno.test("1. Jede Wortmarke traegt ein verstecktes V, liest sich also VEXFIT", async () => {
  let geprueft = 0;
  for (const f of await oeffentlicheHtml()) {
    // rechtliches.html (AGB/Datenschutz/Impressum) wird bewusst nicht angefasst.
    if (f === "rechtliches.html") continue;
    const s = await lies("./" + f);
    // Ueberall dort, wo die Inline-V-Grafik + EXFIT steht, muss unmittelbar
    // davor das versteckte Text-V stehen (fuer Google/Screenreader/Kopieren).
    const treffer = s.match(/<\/svg>(.*?)EX<span>FIT<\/span>/gs) ?? [];
    for (const t of treffer) {
      assert(
        /white-space:nowrap">V<\/span>EX<span>FIT<\/span>/.test(t),
        `${f}: Wortmarke ohne verstecktes V (liest sich als EXFIT): ${t.slice(0, 80)}`,
      );
      geprueft++;
    }
  }
  assert(geprueft >= 19, `zu wenige Wortmarken geprueft: ${geprueft}`);
});

Deno.test("3. AGB-Link im Trainer-Formular zeigt auf den AGB-Abschnitt", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(
    s,
    'Ich akzeptiere die <a href="rechtliches.html#agb" target="_blank">AGB</a>',
  );
  // kein AGB-Link mehr, der nur auf den Seitenanfang springt
  assert(
    !s.includes('<a href="rechtliches.html" target="_blank">AGB</a>'),
    "Trainer-AGB-Link springt noch an den Seitenanfang",
  );
});

Deno.test("4. keine Preise in falscher Reihenfolge (€ vor der Zahl) auf oeffentlichen Seiten", async () => {
  for (const f of await oeffentlicheHtml()) {
    if (f === "rechtliches.html") continue; // Rechtsseite wird bewusst nicht angefasst
    const s = await lies("./" + f);
    const treffer = s.match(/€\s?\d/g);
    assert(
      treffer === null,
      `${f}: Preis in falscher Reihenfolge gefunden: ${treffer?.join(", ")}`,
    );
  }
});

Deno.test("5. Kosten stehen vollstaendig und ehrlich direkt beim Trainer-Knopf", async () => {
  const s = await lies("./registrieren.html");
  const knopf = s.indexOf('id="t-submit-btn"');
  assert(knopf > -1, "Trainer-Knopf nicht gefunden");
  // Der Kostenhinweis steht unmittelbar nach dem Knopf (naechste ~400 Zeichen).
  const umfeld = s.slice(knopf, knopf + 500);
  assertStringIncludes(umfeld, "49,99 €/Monat");
  assertStringIncludes(umfeld, "monatlich kündbar");
  assertStringIncludes(umfeld, "9,99 €");
  assertStringIncludes(umfeld, "Kundenanfrage");
});
