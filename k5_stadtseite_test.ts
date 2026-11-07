// /Users/js/Projekte/Vexfit/app/vexfit/k5_stadtseite_test.ts
//
// Dauerlauf 07.11.2026 – K5: Kunden-Stadtseite Salzburg. Geprüft:
//   * Kunden-Nutzen (kostenlos), 3 Schritte, ein Haupt-Button in die Suche,
//     vorausgefüllt mit Salzburg (suche.html?plz=5020),
//   * UTM-Weitergabe an die Suche + sessionStorage-Durchlauf im Beacon,
//   * KEINE erfundenen Zahlen/Bewertungen/Testimonials, keine Trainerzahl,
//     keine genaue Adresse,
//   * suche.html füllt ?plz= vor und sucht,
//   * der Generator lässt die handgemachte Seite in Ruhe (HANDGEMACHT).
//
// Aufruf:  deno test --allow-read k5_stadtseite_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("K5: Kunden-Nutzen, 3 Schritte, CTA in die Suche (Salzburg vorausgefüllt)", async () => {
  const s = await lies("./personal-trainer-salzburg.html");
  assertStringIncludes(s, "Für Kunden kostenlos");
  assert((s.match(/class="schritt"/g) || []).length === 3, "nicht genau drei Schritte");
  assertStringIncludes(s, 'href="suche.html?plz=5020"');
});

Deno.test("K5: UTM-Weitergabe + Kunden-Trichter-Beacon", async () => {
  const s = await lies("./personal-trainer-salzburg.html");
  assertStringIncludes(s, 'a[href^="suche.html?plz="]');
  assertStringIncludes(s, "vexfitTrichter('seite', { rolle: 'kunde'");
  // UTM laufen über sessionStorage durch.
  const js = await lies("./vexfit-trichter.js");
  assertStringIncludes(js, "vexfit_werbung");
  assertStringIncludes(js, "sessionStorage");
});

Deno.test("K5: keine erfundenen Zahlen/Bewertungen/Testimonials, keine Adresse", async () => {
  const roh = await lies("./personal-trainer-salzburg.html");
  const text = roh.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").toLowerCase();
  for (const wort of ["testimonial", "bewertung", "sterne", "★", "trainer vertrauen"]) {
    assert(!text.includes(wort), "verdächtige erfundene Angabe: " + wort);
  }
  assert(!/\d{1,4}\s*(trainer|kunden|mitglieder)/.test(text), "erfundene Trainer-/Kundenzahl");
  assert(!/\d{1,3}\s*%/.test(text), "Prozent-Statistik");
  assertStringIncludes(roh, "Salzburg, Österreich");
  assert(!/\b5\d{3}\b/.test(text), "Postleitzahl im Text (keine genaue Adresse)");
});

Deno.test("K5: suche.html füllt ?plz= vor und sucht", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "new URLSearchParams(location.search).get('plz')");
  assertStringIncludes(s, "feld.value = vorgabe.trim(); searchByPLZ();");
});

Deno.test("K5: Generator lässt die handgemachte Seite in Ruhe", async () => {
  const g = await lies("./werkzeuge/stadtseiten.mjs");
  assertStringIncludes(g, "const HANDGEMACHT = new Set(['personal-trainer-salzburg.html']);");
  assertStringIncludes(g, "if (HANDGEMACHT.has(datei)) { continue; }");
  assertStringIncludes(g, "!HANDGEMACHT.has(f)");
});
