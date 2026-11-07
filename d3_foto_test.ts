// /Users/js/Projekte/Vexfit/app/vexfit/d3_foto_test.ts
//
// Dauerlauf 08.11.2026 – D3: Trainerfoto auf der Karte zentriert.
// Prueft (Datei-Pruefung) die Kartenbild-Regeln in suche.html:
//   * echtes <img class="cimg"> mit loading="lazy", festen Maßen und alt-Text,
//   * CSS: object-fit cover + object-position center top, feste Bildhoehe,
//   * ohne Foto: zentrierter Initialen-Platzhalter (.cav) in gleicher Groesse.
//
// Aufruf:  deno test --allow-read d3_foto_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("D3: CSS – gleiche Bildgröße, cover, Gesicht oben (center top)", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, ".ci{height:160px");            // feste, gleiche Bildhoehe
  assertStringIncludes(s, "overflow:hidden");
  assertStringIncludes(s, ".cimg{width:100%;height:100%;object-fit:cover;object-position:center top");
});

Deno.test("D3: Karte nutzt echtes <img> mit lazy, festen Maßen und alt", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, '<img class="cimg" src="${vexEsc(bild)}" alt="${name || \'Trainer\'}" loading="lazy" width="400" height="160">');
  // kein Hintergrundbild mehr auf der Karte (background-image im Karten-HTML raus).
  assert(!s.includes("background-image:url('${vexEsc(bild)}')"), "Kartenfoto noch als Hintergrundbild");
});

Deno.test("D3: ohne Foto zentrierter Initialen-Platzhalter in gleicher Größe", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, '<div class="cav">${initials || \'?\'}</div>');
  assertStringIncludes(s, ".ci{height:160px;display:flex;align-items:center;justify-content:center");
  assertStringIncludes(s, ".cav{font-family:'Bebas Neue'");
});
