// /Users/js/Projekte/Vexfit/app/vexfit/teil6_test.ts
//
// Teil 6 - Preise. rechtliches.html (§3) und index.html nennen beide Preise.
//
// Hinweis Nachtlauf 03.11.2026: Die oeffentlichen Seiten schreiben Preise jetzt
// einheitlich "49,99 €" (Betrag, dann €). rechtliches.html (AGB/Datenschutz/
// Impressum) wird NICHT angefasst und schreibt weiterhin "€49,99"; die
// Umstellung dort ist dem Anwalt vorbehalten (siehe docs/recht/).
//
// Aufruf:  deno test --allow-read teil6_test.ts
import { assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("rechtliches.html nennt beide Preise (49,99 und 9,99)", async () => {
  const html = await lies("./rechtliches.html");
  assertStringIncludes(html, "49,99");
  assertStringIncludes(html, "9,99");
  assertStringIncludes(html, "Jeder weitere Kunde über Vexfit kostet zusätzlich einmalig €9,99.");
});

Deno.test("index.html nennt 49,99 € und 9,99 € (Betrag dann €)", async () => {
  const html = await lies("./index.html");
  assertStringIncludes(html, "49,99 €");
  assertStringIncludes(html, "9,99 €");
});
