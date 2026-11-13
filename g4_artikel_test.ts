// /Users/js/Projekte/Vexfit/app/vexfit/g4_artikel_test.ts
//
// Dauerlauf 13.11.2026 – G4: Artikel-Banner (vorbereitet, versteckt).
// Geprüft:
//   * ARTIKEL_URL steht in vexfit-config.js, Standard LEER,
//   * sichereArtikelUrl lässt nur https zu (leer/http/javascript: → ""),
//   * Startseite + /wunsch.html binden vexfit-artikel.js ein und haben den
//     Banner-Container,
//   * vexfit-artikel.js bindet KEINE fremden Logos ein (nur Text),
//   * docs/artikel-19-11.md nennt die eine Zeile + den Push-Befehl.
//
// Aufruf:  deno test --allow-read g4_artikel_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const q = await lies("./vexfit-artikel.js");
new Function(q)();
// deno-lint-ignore no-explicit-any
const sicher = (globalThis as any).sichereArtikelUrl as (u: unknown) => string;

Deno.test("G4: ARTIKEL_URL in der Konfiguration, Standard leer", async () => {
  const cfg = await lies("./vexfit-config.js");
  assertStringIncludes(cfg, 'ARTIKEL_URL: ""');
});

Deno.test("G4: sichereArtikelUrl lässt nur https zu", () => {
  assertEquals(sicher(""), "");
  assertEquals(sicher("   "), "");
  assertEquals(sicher("javascript:alert(1)"), "");
  assertEquals(sicher("http://sn.at/x"), ""); // kein http
  assertEquals(sicher("https://www.sn.at/artikel"), "https://www.sn.at/artikel");
});

Deno.test("G4: Startseite + Wunsch-Formular binden den Banner ein", async () => {
  for (const f of ["index.html", "wunsch.html"]) {
    const s = await lies("./" + f);
    assertStringIncludes(s, "vexfit-artikel.js");
    assertStringIncludes(s, 'id="artikelBanner"');
  }
});

Deno.test("G4: keine Logos fremder Medien (nur Text)", async () => {
  const s = await lies("./vexfit-artikel.js");
  assert(!/<img|\.svg|\.png|\.jpe?g|\.gif/i.test(s), "vexfit-artikel.js bindet ein fremdes Logo/Bild ein");
  assertStringIncludes(s, "Bekannt aus der Flachgauer Woche / SN.at");
});

Deno.test("G4: docs/artikel-19-11.md nennt die Zeile + den Push-Befehl", async () => {
  const d = await lies("./docs/artikel-19-11.md");
  assertStringIncludes(d, 'ARTIKEL_URL: ""');
  assertStringIncludes(d, "git push origin main");
});
