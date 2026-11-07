// /Users/js/Projekte/Vexfit/app/vexfit/d4_kontrast_test.ts
//
// Dauerlauf 08.11.2026 – D4: Kontrast und Kopfzeile.
//   * Der 4-Fragen-Knopf ist eine gefüllte Fläche (Schwarz auf #E8FF00) mit
//     Kontrast >= 4,5:1 (WCAG AA) – hier echt nachgerechnet.
//   * Kleiner Text (--text-muted) auf Schwarz erreicht >= 4,5:1.
//   * Anker-Sprünge landen nicht unter der festen Kopfzeile (scroll-padding-top).
//
// Aufruf:  deno test --allow-read d4_kontrast_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// WCAG-Kontrast zweier Hex-Farben.
function kanal(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function lum(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}
function kontrast(a: string, b: string) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

Deno.test("D4: 4-Fragen-Knopf Schwarz auf #E8FF00 >= 4,5:1", () => {
  const k = kontrast("#0a0a0a", "#e8ff00");
  assert(k >= 4.5, "Kontrast zu niedrig: " + k.toFixed(2));
});

Deno.test("D4: kleiner Text (#8a8a8a) auf Schwarz >= 4,5:1", () => {
  const k = kontrast("#8a8a8a", "#0a0a0a");
  assert(k >= 4.5, "Kontrast zu niedrig: " + k.toFixed(2));
});

Deno.test("D4: suche.html nutzt gefüllten Knopf, angehobenes Muted und scroll-padding", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, '<button class="match-cta"');
  assertStringIncludes(s, ".match-cta{background:var(--accent);color:#0a0a0a");
  // alter, schwächerer Umriss-Stil ist weg.
  assert(!s.includes('class="ftag" style="border-color:var(--accent);color:var(--accent)" onclick="matchingToggle()"'),
    "alter Umriss-Knopf noch da");
  assertStringIncludes(s, "--text-muted:#8a8a8a");
  assertStringIncludes(s, "html{scroll-padding-top:76px}");
});
