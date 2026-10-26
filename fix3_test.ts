// /Users/js/Projekte/Vexfit/app/vexfit/fix3_test.ts
//
// Fix 3 (Komplettpruefung 26.10.2026): Der feste WhatsApp-Knopf verdeckt am Handy
// Inhalte. Jede Seite mit dem Knopf bekommt unter 640px genug Abstand am Seitenende
// (Knopfhoehe + Abstand), damit Fusszeile und letzte Inhalte frei bleiben.
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));
async function htmlDateien(): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(hier("."))) {
    if (e.isFile && e.name.endsWith(".html")) out.push(e.name);
  }
  return out.sort();
}

Deno.test("Fix 3: jede Seite mit WhatsApp-Knopf hat unten Abstand unter 640px", async () => {
  let geprueft = 0;
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    if (!/class="wa(-btn)?"/.test(s)) continue;
    assertStringIncludes(s, "/* Platz fuer WhatsApp-Knopf (Fix 3) */", `${f}: Marker fehlt`);
    const block = s.match(/\/\* Platz fuer WhatsApp-Knopf \(Fix 3\) \*\/[\s\S]*?<\/style>/);
    assert(block, `${f}: Fix-3-Style-Block fehlt`);
    assertStringIncludes(block[0], "@media (max-width:640px)", `${f}: Media-Query fehlt`);
    assertStringIncludes(block[0], "padding-bottom:84px", `${f}: Abstand fehlt`);
    geprueft++;
  }
  assert(geprueft >= 11, `zu wenige Seiten mit Knopf geprueft: ${geprueft}`);
});
