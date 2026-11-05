// /Users/js/Projekte/Vexfit/app/vexfit/b5_ladezeit_test.ts
//
// Dauerlauf 05./06.11.2026 – B5: Ladezeit/Stabilität mobil. Strukturelle
// Absicherung der getroffenen Entscheidungen (die eigentliche Messung läuft über
// rundgang/ladezeit-messung.mjs mit Playwright):
//   * Supabase ist auf den vier relevanten Seiten vorverbunden (preconnect),
//   * keine render-blockierenden Dritt-CDNs im <head>,
//   * das verworfene Schrift-Vorladen ist nicht (wieder) eingebaut,
//   * das Messskript + der Bericht liegen vor.
//
// Aufruf:  deno test --allow-read b5_ladezeit_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const SEITEN = ["index.html", "registrieren.html", "trainer.html", "trainer-bereich.html"];

Deno.test("B5: Supabase ist auf allen vier Seiten vorverbunden", async () => {
  for (const f of SEITEN) {
    const s = await lies("./" + f);
    assertStringIncludes(s, '<link rel="preconnect" href="https://hbapzwxdehfgnputrfjf.supabase.co"', `${f}: preconnect fehlt`);
  }
});

Deno.test("B5: kein render-blockierendes Dritt-CDN im Kopf der Seiten", async () => {
  for (const f of SEITEN) {
    const s = await lies("./" + f);
    const kopf = s.slice(0, s.indexOf("</head>") >= 0 ? s.indexOf("</head>") : s.length);
    for (const host of ["unpkg.com", "jsdelivr.net", "cdnjs", "code.jquery", "connect.facebook.net"]) {
      assert(!new RegExp(`<script[^>]+src=["'][^"']*${host.replace(/\./g, "\\.")}`).test(kopf),
        `${f}: render-blockierendes Skript von ${host} im <head>`);
    }
  }
});

Deno.test("B5: verworfenes Schrift-Vorladen ist nicht ausgeliefert", async () => {
  for (const f of SEITEN) {
    const s = await lies("./" + f);
    assert(!s.includes('rel="preload"'), `${f}: Schrift-Vorladen wieder eingebaut (unter Slow-4G schädlich, siehe docs/ladezeit-b5)`);
  }
});

Deno.test("B5: Messskript und Bericht vorhanden", async () => {
  const skript = await lies("./rundgang/ladezeit-messung.mjs");
  assertStringIncludes(skript, "emulateNetworkConditions");
  assertStringIncludes(skript, "first-contentful-paint");
  const bericht = await lies("./docs/ladezeit-b5-2026-11-06.md");
  assertStringIncludes(bericht, "Mobile Slow 4G");
});
