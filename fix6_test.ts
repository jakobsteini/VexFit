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

Deno.test("index.html macht keine pauschale Verifizierungs-Aussage mehr (Teil C, vor-ads)", async () => {
  const s = await lies("./index.html");
  // Frueher sollte "verifizierte" erhalten bleiben (nur Budget-Entfernung). Der
  // Baustein "Letzter Schliff vor Ads-Start" (Teil C) streicht die pauschalen
  // "verifizierte(n) Trainer" aber bewusst - das echte Abzeichen bleibt nur bei
  // verifiziert = true an einzelnen Trainern. Deshalb jetzt umgekehrt gesichert.
  assert(!/verifizierte/i.test(s), "index.html enthaelt noch eine pauschale Verifizierungs-Aussage");
});
