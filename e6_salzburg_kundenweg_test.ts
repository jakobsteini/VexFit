// /Users/js/Projekte/Vexfit/app/vexfit/e6_salzburg_kundenweg_test.ts
//
// Dauerlauf 10.11.2026 – E6: Kunden-Weg Salzburg. Statische Prüfungen (die
// End-to-End-Fassung für 0/1/2 Trainer bei 375/1440 px liegt als Spec in
// e2e/salzburg-kundenweg.spec.ts; Playwright ist hier nicht installiert).
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("E6: personal-trainer-salzburg.html – ehrlich, kostenlos, vor Ort + online, UTM-Weitergabe", async () => {
  const s = await lies("./personal-trainer-salzburg.html");
  assertStringIncludes(s, "Für Kunden kostenlos");
  assertStringIncludes(s, "Vor Ort oder online");
  assertStringIncludes(s, "suche.html?plz=5020&land=AT");
  // UTM (z. B. utm_source=persoenlich) laufen in die Suche durch.
  assertStringIncludes(s, 'a[href^="suche.html?plz="]');
  // Keine erfundene Trainerzahl / Bewertung.
  assert(!/\d+\s*Trainer\b/i.test(s), "keine erfundene Trainerzahl auf der Seite");
});

Deno.test("E6: suche.html – Leerzustand, Nähe-Vormerkung (interne Mail) und Online-Abschnitt", async () => {
  const s = await lies("./suche.html");
  // 0 Treffer: Leerzustand bzw. Nähe-Hinweis mit Vormerkung.
  assertStringIncludes(s, 'id="emptyState"');
  assertStringIncludes(s, 'id="naeheHinweis"');
  assertStringIncludes(s, "function naeheVormerken(");
  // Vormerkung geht über /neuer-kunde -> interne Meldung an office@ (E1).
  assertStringIncludes(s, "vexfit-automation/neuer-kunde");
  // Online-Trainer als Alternative (eigener Abschnitt).
  assert(/Online/.test(s), "Online-Abschnitt fehlt");
});

Deno.test("E6: teilbarer Link + Beitragstext dokumentiert (utm_source=persoenlich)", async () => {
  const d = await lies("./docs/links-2026-11-10.md");
  assertStringIncludes(d, "utm_source=persoenlich");
  assertStringIncludes(d, "personal-trainer-salzburg.html");
  assertStringIncludes(d, "Beitragstext");
  // Ehrlich: keine erfundene Zahl im Beitragstext.
  assert(!/\d+\s*Trainer\b/i.test(d), "keine erfundene Trainerzahl im Beitragstext");
});

Deno.test("E6: Playwright-Spec deckt 0/1/2 Trainer bei 375 und 1440 px ab", async () => {
  const spec = await lies("./e2e/salzburg-kundenweg.spec.ts");
  assertStringIncludes(spec, "[375, 1440]");
  assertStringIncludes(spec, "[0, 1, 2]");
  assertStringIncludes(spec, "neuer-kunde");
});
