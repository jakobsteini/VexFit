// /Users/js/Projekte/Vexfit/app/vexfit/pixel_id_test.ts
//
// Baustein "Meta Pixel auf neue ID umstellen" (Zweig pixel-neu). Prueft ohne
// Netz gegen die echten Dateien des Arbeitsordners:
//   - keine ausgelieferte Datei (.html/.js/.mjs) traegt noch die ALTE Pixel-ID,
//   - jede Datei, die fbq('init' aufruft, nutzt die NEUE ID,
//   - das Laden bleibt an die Zustimmung gebunden ('zugestimmt' vor dem Aufruf
//     von vexfitPixelLaden).
//
// Aufruf:  deno test --allow-read pixel_id_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const WURZEL = new URL("./", import.meta.url);
const ALT = "1034036285801133";
const NEU = "1105307262121912";

// Alle ausgelieferten Quelldateien einsammeln (.html/.js/.mjs), ohne
// node_modules/.git. Reine .ts-Testdateien bleiben aussen vor - diese Datei
// selbst nennt die alte ID nur als Suchbegriff.
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

Deno.test("keine ausgelieferte Datei enthaelt noch die alte Pixel-ID", async () => {
  const funde: string[] = [];
  for (const d of DATEIEN) {
    if ((await inhalt(d)).includes(ALT)) funde.push(d);
  }
  assert(funde.length === 0, `alte Pixel-ID ${ALT} noch in: ${funde.join(", ")}`);
});

Deno.test("jede Datei mit fbq('init' nutzt die neue ID und bleibt zustimmungsgebunden", async () => {
  const initDateien: string[] = [];
  for (const d of DATEIEN) {
    const s = await inhalt(d);
    if (!s.includes("fbq('init'")) continue;
    initDateien.push(d);
    // Die Init-Zeile traegt genau die neue ID.
    assertStringIncludes(s, `fbq('init', '${NEU}')`, `${d}: fbq('init' ohne neue ID`);
    assert(!s.includes(ALT), `${d}: alte ID noch vorhanden`);
    // Der Pixel laedt beim Seitenaufruf nur nach Zustimmung: die Auto-Ladezeile
    // ist an 'zugestimmt' gebunden (Text 'zugestimmt' vor dem Aufruf von
    // vexfitPixelLaden).
    assertStringIncludes(
      s,
      "=== 'zugestimmt') vexfitPixelLaden()",
      `${d}: Auto-Laden nicht an Zustimmung gebunden`,
    );
  }
  // Es muss solche Dateien ueberhaupt geben (sonst griffe der Test ins Leere).
  assert(initDateien.length >= 14, `zu wenige fbq('init'-Dateien gefunden: ${initDateien.length}`);
});
