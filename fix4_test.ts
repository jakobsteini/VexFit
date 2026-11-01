// /Users/js/Projekte/Vexfit/app/vexfit/fix4_test.ts
//
// Admin am Handy + Umsatzanzeige (jetzt in der neuen Verwaltungsseite):
// - Jede Tabelle steht in einem Container mit overflow-x:auto (Seite selbst
//   ohne seitliches Scrollen).
// - Monatsumsatz im oesterreichischen Format mit zwei Nachkommastellen
//   (Intl.NumberFormat de-AT), statt "€50" bei 49,99.
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));

Deno.test("Fix 4: Verwaltungs-Tabellen haben overflow-x:auto und jede Tabelle ist gewrappt", async () => {
  const s = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(s, ".table-wrap{overflow-x:auto");
  const tabellen = (s.match(/<table\b/g) ?? []).length;
  const wraps = (s.match(/<div class="table-wrap"[^>]*>\s*<table\b/g) ?? []).length;
  assert(tabellen > 0, "keine Tabellen gefunden");
  assert(wraps === tabellen, `nicht jede Tabelle ist in .table-wrap: ${wraps} von ${tabellen}`);
});

Deno.test("Fix 4: Monatsumsatz nutzt de-AT-Waehrungsformat, kein toFixed(0)", async () => {
  const s = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(s, 'new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" })');
  assertStringIncludes(s, "eur.format(bezahlt * 49.99)");
  assert(!s.includes("(bezahlt * 49.99).toFixed(0)"), "alte toFixed(0)-Umsatzanzeige vorhanden");
  const erwartet = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(49.99);
  assertStringIncludes(erwartet, "49,99");
});
