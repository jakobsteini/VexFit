// /Users/js/Projekte/Vexfit/app/vexfit/s7_vertrauen_test.ts
//
// Dauerlauf 07./08.11.2026 – S7: Vertrauen ohne Erfindungen. Keine erfundenen
// Sterne/Bewertungen/Kundenzahlen/Testimonials auf den öffentlichen Seiten; die
// wahren Signale („geprüft", „für Kunden kostenlos") sind im Code belegt.
//
// Aufruf:  deno test --allow-read s7_vertrauen_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const OEFFENTLICH = ["index.html", "suche.html", "personal-trainer-salzburg.html", "profil.html"];

Deno.test("S7: keine erfundene Sternchen-Bewertung auf den Karten", async () => {
  const s = await lies("./suche.html");
  assert(!s.includes("⭐ Neu"), "unechte ⭐-Zeile noch in suche.html");
  assert(!s.includes('class="cr"'), "Bewertungs-Element cr noch da");
});

Deno.test("S7: keine Testimonials/Sterne/Kundenzahlen in öffentlichen Seiten", async () => {
  for (const f of OEFFENTLICH) {
    const roh = await lies("./" + f);
    const text = roh.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(/<[^>]+>/g, " ").toLowerCase();
    for (const wort of ["testimonial", "sterne", "★", "bewertung", "zufriedene kunden", "4,9", "4.9"]) {
      assert(!text.includes(wort), `${f}: verdächtiges Signal „${wort}"`);
    }
    assert(!/\b\d{2,}\s*(trainer|kunden|mitglieder|zufriedene)\b/.test(text), `${f}: erfundene Zahl`);
  }
});

Deno.test("S7: wahres Signal belegt – manuelle Freigabe erzwungen", async () => {
  const reg = await lies("./registrieren.html");
  assertStringIncludes(reg, "aktiv:false"); // Trainer startet NICHT freigegeben
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, 'case "trainer_aktivieren"'); // nur Admin schaltet frei
});

Deno.test("S7: Konzept-Doc hält die Prüfung fest", async () => {
  const d = await lies("./docs/konzept-2026-11-07.md");
  assertStringIncludes(d, "S7 (07./08.11.2026): Vertrauen ohne Erfindungen");
});
