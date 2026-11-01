// /Users/js/Projekte/Vexfit/app/vexfit/gp06_studio_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 6: Studio-Seite + A4-Plakat.
// Statische Prüfungen (die Datenwege sind die bestehende, abgesicherte
// studio_anzeigen-Funktion; live geprüft wird nach dem Push):
//   * studio.html zeigt NUR die Trainer des aufgelösten Standorts (studio_anzeigen,
//     keine allgemeine Suche, kein trainers_oeffentlich), Hinweis „Trainer bei …",
//     kein Pixel (also auch keiner ohne Zustimmung), noindex,
//   * docs/studio-plakat.html ist A4, QR zeigt auf die Studio-Seite, trägt das
//     Vexfit-Logo, KEIN John-Harris-Logo, keine Adresse, Platzhalter-Monogramm.
//
// Aufruf:  deno test --allow-read gp06_studio_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const studio = await Deno.readTextFile(new URL("./studio.html", import.meta.url));
const plakat = await Deno.readTextFile(new URL("./docs/studio-plakat.html", import.meta.url));

Deno.test("studio.html liest ?s= und löst über studio_anzeigen auf", () => {
  assertStringIncludes(studio, "params.get('s')");
  assertStringIncludes(studio, "rpc/studio_anzeigen");
});

Deno.test("studio.html zeigt nur den aufgelösten Standort (keine allgemeine Suche)", () => {
  assertStringIncludes(studio, "alle.filter(s => s.slug === standort)");
  // Keine allgemeine Trainersuche: nicht die oeffentliche Sicht/Tabelle abfragen.
  assert(!studio.includes("trainers_oeffentlich"), "studio.html darf keine allgemeine Suche machen");
  assert(!/rest\/v1\/trainers\?/.test(studio), "studio.html darf nicht direkt alle Trainer laden");
});

Deno.test("studio.html: Hinweis 'Trainer bei STUDIONAME' auf der Karte", () => {
  assertStringIncludes(studio, "Trainer bei ${vexEsc(studioName)}");
});

Deno.test("studio.html: kein Pixel (also keiner ohne Zustimmung), noindex", () => {
  assert(!/fbq\(/.test(studio), "studio.html soll keinen Pixel feuern");
  assert(/<meta[^>]*robots[^>]*noindex/i.test(studio), "studio.html ohne noindex");
});

Deno.test("Plakat: A4, QR auf die Studio-Seite", () => {
  assertStringIncludes(plakat, "size:A4 portrait");
  assertStringIncludes(plakat, "210mm");
  assertStringIncludes(plakat, "'https://vexfit.app/studio.html?s=' + encodeURIComponent(s)");
  assertStringIncludes(plakat, "vexQR.svg(ZIEL");
});

Deno.test("Plakat: Vexfit-Logo, KEIN John-Harris-Logo, keine Adresse, Platzhalter", () => {
  assertStringIncludes(plakat, 'class="logo">V<span>EXFIT</span>');
  // Platzhalter-Monogramm, ausdruecklich kein echtes Logo.
  assertStringIncludes(plakat, "Platzhalter");
  // Keine erfundene Adresse auf dem Plakat.
  assert(!/straße|strasse|platz \d|Medicent|Schillerplatz/i.test(plakat), "Plakat zeigt eine Adresse");
  // Kein echtes Logo-Bild (das trägt das Studio selbst bei) – überhaupt kein <img>.
  assert(!/<img/i.test(plakat), "Plakat bindet ein Logo-Bild ein");
});

Deno.test("Plakat ist noindex und liegt unter docs/", () => {
  assert(/<meta[^>]*robots[^>]*noindex/i.test(plakat), "Plakat ohne noindex");
});

Deno.test("Plakat-PDF ist erzeugt", async () => {
  const stat = await Deno.stat(new URL("./docs/studio-plakat-john-harris-salzburg.pdf", import.meta.url));
  assert(stat.isFile && stat.size > 2000, "PDF fehlt oder ist zu klein");
});
