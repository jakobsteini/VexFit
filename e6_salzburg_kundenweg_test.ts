// /Users/js/Projekte/Vexfit/app/vexfit/e6_salzburg_kundenweg_test.ts
//
// Dauerlauf 10.11.2026 – E6: Kunden-Weg Salzburg. Statische Prüfungen (die
// End-to-End-Fassung für 0/1/2 Trainer bei 375/1440 px liegt als Spec in
// e2e/salzburg-kundenweg.spec.ts; Playwright ist hier nicht installiert).
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("E6/G3: personal-trainer-salzburg.html – ehrlich, kostenlos, Einstieg auf /wunsch.html, UTM-Weitergabe", async () => {
  const s = await lies("./personal-trainer-salzburg.html");
  assertStringIncludes(s, "Für Kunden kostenlos");
  // G3 (13.11.): der Haupt-Knopf führt auf das Wunsch-Formular (kein Konto nötig),
  // nicht mehr in die (seit dc5f884 gated) öffentliche Suche.
  assertStringIncludes(s, "wunsch.html?plz=5020&land=AT");
  assert(!/suche\.html\?plz=/.test(s), "führt noch in die öffentliche Suche statt aufs Wunsch-Formular");
  // UTM (z. B. utm_source=persoenlich) laufen aufs Wunsch-Formular durch.
  assertStringIncludes(s, 'a[href^="wunsch.html"]');
  // Kein öffentliches „oder online"-Versprechen mehr.
  assert(!/vor Ort oder online/i.test(s), "verspricht noch öffentliche Online-Trainer");
  // Keine erfundene Trainerzahl / Bewertung.
  assert(!/\d+\s*Trainer\b/i.test(s), "keine erfundene Trainerzahl auf der Seite");
});

Deno.test("E6/G3: suche.html – Mauer und Leerzustand führen aufs Wunsch-Formular, Nähe-Vormerkung bleibt", async () => {
  const s = await lies("./suche.html");
  // 0 Treffer: Nähe-Hinweis mit Vormerkung (interne Mail über /neuer-kunde, E1).
  assertStringIncludes(s, 'id="naeheHinweis"');
  assertStringIncludes(s, "function naeheVormerken(");
  assertStringIncludes(s, "vexfit-automation/neuer-kunde");
  // G3: Mauer (Anon-Gate) und Leerzustand bieten das Wunsch-Formular an.
  assertStringIncludes(s, "wunsch.html");
  // Kein „Online"-Einstieg mehr in der Matching-Auswahl (toter Pfad entfernt).
  assert(!/data-val="online"/.test(s), "toter Online-Einstieg noch vorhanden");
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
