// /Users/js/Projekte/Vexfit/app/vexfit/pixel_id_test.ts
//
// Baustein "Meta-Pixel auf die alte ID zurueck" (Revert von 751420d).
//
// Das echte Werbekonto (1367005783915710) nutzt den Pixel 1034036285801133 und
// optimiert auf CompleteRegistration. Die kurzzeitig gesetzte ID 1105307262121912
// (751420d) darf NIRGENDS mehr vorkommen. Dieser Test prueft ohne Netz gegen die
// echten Dateien des Arbeitsordners:
//   - keine ausgelieferte Datei (.html/.js/.mjs) traegt noch die VERBOTENE ID,
//   - jede Datei, die fbq('init' aufruft, nutzt die RICHTIGE (alte) ID,
//   - das Laden bleibt an die Zustimmung gebunden ('zugestimmt' vor dem Aufruf
//     von vexfitPixelLaden) — insbesondere auf registrieren.html und index.html,
//   - die Ereignisse Lead (Kunde) und CompleteRegistration (Trainer) stehen
//     unveraendert auf registrieren.html.
//
// Aufruf:  deno test --allow-read pixel_id_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const WURZEL = new URL("./", import.meta.url);
// Die kurzzeitig gesetzte ID aus 751420d — nach dem Revert verboten.
const VERBOTEN = "1105307262121912";
// Der Pixel des echten Werbekontos — muss ueberall stehen, wo der Pixel laedt.
const RICHTIG = "1034036285801133";

// Alle ausgelieferten Quelldateien einsammeln (.html/.js/.mjs), ohne
// node_modules/.git. Reine .ts-Testdateien bleiben aussen vor - diese Datei
// selbst nennt die verbotene ID nur als Suchbegriff.
async function quellDateien(): Promise<string[]> {
  const out: string[] = [];
  async function lauf(ordner: URL, pfad: string) {
    for await (const e of Deno.readDir(ordner)) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const rel = pfad ? `${pfad}/${e.name}` : e.name;
      if (e.isDirectory) {
        await lauf(new URL(rel + "/", WURZEL), rel);
      } else if (/\.(html|js|mjs)$/.test(e.name)) {
        out.push(rel);
      }
    }
  }
  await lauf(WURZEL, "");
  return out.sort();
}

const DATEIEN = await quellDateien();
const inhalt = (rel: string) => Deno.readTextFile(new URL(rel, WURZEL));

Deno.test("keine ausgelieferte Datei enthaelt noch die verbotene (neue) Pixel-ID", async () => {
  const funde: string[] = [];
  for (const d of DATEIEN) {
    if ((await inhalt(d)).includes(VERBOTEN)) funde.push(d);
  }
  assert(funde.length === 0, `verbotene Pixel-ID ${VERBOTEN} noch in: ${funde.join(", ")}`);
});

Deno.test("jede Datei mit fbq('init' nutzt die richtige (alte) ID und bleibt zustimmungsgebunden", async () => {
  const initDateien: string[] = [];
  for (const d of DATEIEN) {
    const s = await inhalt(d);
    if (!s.includes("fbq('init'")) continue;
    initDateien.push(d);
    // Die Init-Zeile traegt genau die ID des echten Werbekontos.
    assertStringIncludes(s, `fbq('init', '${RICHTIG}')`, `${d}: fbq('init' ohne die richtige ID`);
    assert(!s.includes(VERBOTEN), `${d}: verbotene ID noch vorhanden`);
    // Der Pixel laedt beim Seitenaufruf nur nach Zustimmung.
    assertStringIncludes(
      s,
      "=== 'zugestimmt') vexfitPixelLaden()",
      `${d}: Auto-Laden nicht an Zustimmung gebunden`,
    );
  }
  // Es muss solche Dateien ueberhaupt geben (sonst griffe der Test ins Leere).
  assert(initDateien.length >= 14, `zu wenige fbq('init'-Dateien gefunden: ${initDateien.length}`);
});

Deno.test("index.html und registrieren.html laden den Pixel mit der richtigen ID", async () => {
  for (const seite of ["index.html", "registrieren.html"]) {
    const s = await inhalt(seite);
    assertStringIncludes(s, `fbq('init', '${RICHTIG}')`, `${seite}: richtige Init-ID fehlt`);
    assert(!s.includes(VERBOTEN), `${seite}: verbotene ID noch vorhanden`);
  }
});

Deno.test("registrieren.html: Zustimmung schaltet den Pixel frei, Lead und CompleteRegistration unveraendert", async () => {
  const s = await inhalt("registrieren.html");
  // Nach dem Zustimmen wird der Pixel geladen (Einwilligungs-Knopf).
  assertStringIncludes(s, "setItem('vexfit_consent','zugestimmt')");
  assertStringIncludes(s, "vexfitPixelLaden()");
  // Die beiden Kampagnen-Ereignisse stehen unveraendert.
  assertStringIncludes(s, "fbq('track','CompleteRegistration',{content_name:'Trainer'");
  assertStringIncludes(s, "fbq('track','Lead',{content_name:'Kunde'");
});
