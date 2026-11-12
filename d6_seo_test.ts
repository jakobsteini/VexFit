// /Users/js/Projekte/Vexfit/app/vexfit/d6_seo_test.ts
//
// Dauerlauf 08.11.2026 – D6: SEO und Teilen (ohne Datenbankänderung).
//   * suche.html: canonical gesetzt, Seite bleibt noindex, Titel/Beschreibung
//     passend zu Ort/Land (setzeSucheSeo), keine personenbezogenen Daten in
//     Meta-Tags.
//   * robots.txt und sitemap.xml indexieren die Suche nicht schädlich
//     (kein /suche.html, keine PLZ-Varianten).
//
// Aufruf:  deno test --allow-read d6_seo_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("D6: suche.html – canonical, noindex, dynamischer Titel nach Ort/Land", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, '<link rel="canonical" href="https://vexfit.app/suche.html">');
  assertStringIncludes(s, '<meta name="robots" content="noindex">');
  assertStringIncludes(s, "function setzeSucheSeo(stadt, land)");
  assertStringIncludes(s, "setzeSucheSeo(ort, land)");
  assertStringIncludes(s, "Personal Trainer in ${ort} finden | Vexfit");
  // Keine personenbezogenen Daten in den Titel/Beschreibung-Bausteinen.
  const fn = s.slice(s.indexOf("function setzeSucheSeo"), s.indexOf("function urlStand"));
  for (const verboten of ["nachname", "email", "telefon", "vorname"]) {
    assert(!fn.includes(verboten), `setzeSucheSeo darf ${verboten} nicht verwenden`);
  }
});

Deno.test("D6: robots.txt und sitemap indexieren die Suche nicht schädlich", async () => {
  const robots = await lies("./robots.txt");
  assertStringIncludes(robots, "Disallow: /suche.html");
  const sitemap = await lies("./sitemap.xml");
  assert(!sitemap.includes("suche.html"), "sitemap listet die Suche (PLZ-Varianten-Risiko)");
  // Keine PLZ-Varianten in der sitemap.
  assert(!/suche\.html\?plz=/.test(sitemap), "sitemap enthält PLZ-Varianten der Suche");
});
