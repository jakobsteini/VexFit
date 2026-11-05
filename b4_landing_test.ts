// /Users/js/Projekte/Vexfit/app/vexfit/b4_landing_test.ts
//
// Dauerlauf 05./06.11.2026 – B4: mobile-first Trainer-Landingpage (trainer.html).
// Geprüft: klarer Nutzen, Preis exakt nach AGB §3, drei Schritte, EIN
// Haupt-Button zur Registrierung mit UTM-Weitergabe, keine erfundenen Zahlen/
// Bewertungen, keine genaue Geschäftsadresse.
//
// Aufruf:  deno test --allow-read b4_landing_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("B4: Preis exakt nach AGB §3 (kanonische Formulierung)", async () => {
  const s = await lies("./trainer.html");
  assertStringIncludes(s, "Kostenlos bis zur ersten angenommenen Kundenanfrage · danach 49,99 €/Monat");
  assertStringIncludes(s, "monatlich kündbar");
  assertStringIncludes(s, "Jeder weitere Kunde über Vexfit kostet zusätzlich einmalig 9,99 €");
});

Deno.test("B4: ein Haupt-Button zur Registrierung, Rolle Trainer", async () => {
  const s = await lies("./trainer.html");
  assert(s.includes('registrieren.html?typ=trainer'), "CTA fehlt");
  // Genau zwei CTA-Knöpfe (oben + unten), beide auf die Registrierung.
  const n = (s.match(/class="cta"/g) || []).length;
  assert(n >= 1 && n <= 2, "zu viele/keine Haupt-Buttons: " + n);
});

Deno.test("B4: UTM werden an die Registrierung weitergereicht", async () => {
  const s = await lies("./trainer.html");
  assertStringIncludes(s, 'a[href^="registrieren.html?typ=trainer"]');
  assertStringIncludes(s, "location.search");
});

Deno.test("B4: drei Schritte", async () => {
  const s = await lies("./trainer.html");
  const n = (s.match(/class="schritt"/g) || []).length;
  assert(n === 3, "nicht genau drei Schritte: " + n);
});

Deno.test("B4: keine erfundenen Zahlen/Bewertungen/Testimonials", async () => {
  const roh = await lies("./trainer.html");
  // Nur die sichtbaren Textknoten prüfen (Style/Script/Tags raus) – sonst
  // schlagen CSS-Werte wie width:100% oder clip-path:inset(50%) fälschlich an.
  const text = roh
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  for (const wort of ["testimonial", "bewertung", "sterne", "★", "kunden vertrauen", "trainer vertrauen"]) {
    assert(!text.includes(wort), "verdächtige erfundene Angabe: " + wort);
  }
  // Keine Prozent-Statistik-Behauptungen wie "73 %" im Textteil.
  assert(!/\d{1,3}\s*%/.test(text), "Prozent-Statistik auf der Seite (potenziell erfunden)");
});

Deno.test("B4: keine genaue Geschäftsadresse, nur Salzburg/Österreich", async () => {
  const s = await lies("./trainer.html");
  assertStringIncludes(s, "Salzburg, Österreich");
  // Keine Straße/PLZ wie "5330 Fuschl" auf der öffentlichen Landingpage.
  assert(!/\b5\d{3}\b/.test(s), "Postleitzahl auf der Landingpage");
  assert(!s.toLowerCase().includes("fuschl"), "Wohnort auf der Landingpage");
});

Deno.test("B4: schnell – Hauptschrift vorab geladen, keine schweren Bibliotheken", async () => {
  const s = await lies("./trainer.html");
  assertStringIncludes(s, 'rel="preload"');
  assert(!/<script[^>]+src=/.test(s), "externes Skript auf der Landingpage");
});
