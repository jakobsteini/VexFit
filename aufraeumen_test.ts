// /Users/js/Projekte/Vexfit/app/vexfit/aufraeumen_test.ts
//
// Feinschliff Teil 6a: anleitung.html (Betriebs-Interna) nicht indexieren und
// nirgends öffentlich verlinken.
//
// Aufruf:  deno test --allow-read aufraeumen_test.ts
import { assert } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("6a: anleitung.html trägt noindex,nofollow", async () => {
  const html = await lies("./anleitung.html");
  assert(/<meta name="robots" content="noindex,nofollow">/.test(html), "anleitung.html ist nicht noindex,nofollow");
});

Deno.test("6a: keine öffentliche Seite verlinkt auf anleitung.html", async () => {
  // Alle HTML-Dateien außer anleitung.html selbst dürfen keinen Link (href) auf
  // anleitung.html führen. og:url/twitter/canonical der Seite selbst zählt nicht.
  for await (const eintrag of Deno.readDir(new URL("./", import.meta.url))) {
    if (!eintrag.isFile || !eintrag.name.endsWith(".html")) continue;
    if (eintrag.name === "anleitung.html") continue;
    const html = await lies("./" + eintrag.name);
    assert(!/href=["'][^"']*anleitung\.html/.test(html), `${eintrag.name} verlinkt auf anleitung.html`);
  }
});

Deno.test("6a: sitemap.xml führt anleitung.html nicht", async () => {
  const sm = await lies("./sitemap.xml");
  assert(!sm.includes("anleitung.html"), "anleitung.html steht in der sitemap");
});
