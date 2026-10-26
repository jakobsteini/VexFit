// /Users/js/Projekte/Vexfit/app/vexfit/fix6_test.ts
//
// Fix 6 (Komplettpruefung 26.10.2026): Das Wort "Budget" aus sichtbarem Text und
// Meta-Beschreibungen streichen (es gibt keinen Budget-Filter). "verifiziert"
// bleibt unangetastet.
import { assert } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));
async function htmlDateien(): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(hier("."))) {
    if (e.isFile && e.name.endsWith(".html")) out.push(e.name);
  }
  return out.sort();
}

Deno.test("Fix 6: keine .html enthaelt noch das Wort Budget", async () => {
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    assert(!s.includes("Budget"), `${f} enthaelt noch 'Budget'`);
  }
});

Deno.test("Fix 6: 'verifiziert' bleibt erhalten (nicht versehentlich mitgeloescht)", async () => {
  const s = await lies("./index.html");
  assert(s.includes("verifizierte"), "index.html hat 'verifizierte' verloren");
});
