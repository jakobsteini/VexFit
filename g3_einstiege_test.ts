// /Users/js/Projekte/Vexfit/app/vexfit/g3_einstiege_test.ts
//
// Dauerlauf 13.11.2026 – G3: Alle Kunden-Einstiege führen aufs Wunsch-Formular.
// Geprüft (Datei-Prüfung):
//   * index.html: die Kunden-CTAs zeigen auf /wunsch.html (nicht mehr auf die
//     Registrierung), Trainer-CTAs bleiben,
//   * personal-trainer-salzburg.html + suche.html verweisen auf /wunsch.html,
//   * toter „Online"-Einstieg aus suche.html entfernt,
//   * keine toten internen Links über alle öffentlichen Seiten.
//
// Aufruf:  deno test --allow-read g3_einstiege_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));
async function existiert(p: string): Promise<boolean> {
  try { await Deno.stat(hier(p)); return true; } catch { return false; }
}
async function htmlDateien(): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(hier("."))) {
    if (e.isFile && e.name.endsWith(".html")) out.push(e.name);
  }
  return out.sort();
}

Deno.test("G3: index.html – Kunden-CTAs führen aufs Wunsch-Formular, Trainer-CTAs bleiben", async () => {
  const s = await lies("./index.html");
  assertStringIncludes(s, 'href="wunsch.html?utm_source=startseite"');
  // Kein Kunden-CTA mehr in die Registrierung (Trainer-Registrierung bleibt).
  assert(!/registrieren\.html\?typ=kunde/.test(s), "index.html hat noch einen Kunden-CTA in die Registrierung");
  assertStringIncludes(s, "registrieren.html?typ=trainer");
});

Deno.test("G3: personal-trainer-salzburg.html + suche.html führen auf /wunsch.html", async () => {
  const salz = await lies("./personal-trainer-salzburg.html");
  assertStringIncludes(salz, "wunsch.html?plz=5020&land=AT");
  const suche = await lies("./suche.html");
  assertStringIncludes(suche, "wunsch.html");
});

Deno.test("G3: toter Online-Einstieg aus suche.html entfernt", async () => {
  const s = await lies("./suche.html");
  assert(!/data-val="online"/.test(s), "Online-Matching-Kachel noch vorhanden");
});

Deno.test("G3: keine toten internen Links auf öffentlichen Seiten", async () => {
  const dateien = new Set(await htmlDateien());
  // zusätzliche existierende Seiten, die verlinkt sein dürfen
  const probleme: string[] = [];
  for (const f of dateien) {
    const s = await lies("./" + f);
    const treffer = s.matchAll(/href="([^"#?][^"]*\.html)(?:[?#][^"]*)?"/g);
    for (const m of treffer) {
      const ziel = m[1];
      if (/^https?:\/\//.test(ziel) || ziel.startsWith("mailto:") || ziel.startsWith("//")) continue;
      if (!(await existiert("./" + ziel))) probleme.push(`${f} → ${ziel}`);
    }
  }
  assert(probleme.length === 0, "Tote interne Links:\n" + probleme.join("\n"));
});
