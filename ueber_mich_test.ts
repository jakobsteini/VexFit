// /Users/js/Projekte/Vexfit/app/vexfit/ueber_mich_test.ts
//
// Baustein 14.11.2026 – Abschnitt „Wer steckt hinter Vexfit?" mit Foto.
// Geprüft (reine Datei-/Textprüfung, ohne Netz/DB):
//   * index.html: Abschnitt #ueber-mich mit EXAKT dem vorgegebenen Text
//     (Überschrift, Absatz, Kontaktzeile) + Bildnachweis „Foto: Tatjana Weber",
//   * Kontaktzeile zusätzlich als mailto-/tel-Link,
//   * Knopf „Personal Trainer finden lassen" → wunsch.html mit Herkunfts-Parameter,
//   * responsive Bilder (400/800 WebP + JPG), alt-Text, feste Maße, loading=lazy,
//   * Abschnitt ohne dauerhaftes opacity:0 (keine reveal-Logik, standardmäßig sichtbar),
//   * keine Straße/Hausnummer/PLZ/Alter im Abschnitt,
//   * alle Bildfassungen existieren und sind nicht leer (entspricht Status 200),
//   * wunsch.html: kompakte persönliche Zeile mit kleinem Rundfoto.
//
// Aufruf:  deno test --allow-read ueber_mich_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const nurText = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const ABSATZ =
  "Ich bin Jakob Steinbacher aus Salzburg. Mit Vexfit finde ich für dich den " +
  "passenden Personal Trainer in deiner Nähe. Du sagst mir, was du suchst – ich " +
  "kümmere mich um den Rest. Für dich ist das kostenlos.";

async function abschnitt(): Promise<string> {
  const s = await lies("./index.html");
  const m = s.match(/<section class="section ueber"[\s\S]*?<\/section>/);
  assert(m, "Abschnitt #ueber-mich fehlt in index.html");
  return m[0];
}

Deno.test("Ueber: Abschnitt mit exakt vorgegebenem Text (Überschrift, Absatz, Kontakt)", async () => {
  const sec = await abschnitt();

  const titel = sec.match(/<h2 class="ueber-titel">([\s\S]*?)<\/h2>/);
  assert(titel, "Überschrift fehlt");
  assertEquals(titel[1].trim(), "Wer steckt hinter Vexfit?");

  const absatz = sec.match(/<p class="ueber-abs">([\s\S]*?)<\/p>/);
  assert(absatz, "Absatz fehlt");
  assertEquals(absatz[1].trim(), ABSATZ);

  const kontakt = sec.match(/<p class="ueber-kontakt">([\s\S]*?)<\/p>/);
  assert(kontakt, "Kontaktzeile fehlt");
  assertEquals(nurText(kontakt[1]), "Fragen? office@vexfit.app · +43 660 3675175");
  assertStringIncludes(kontakt[1], 'href="mailto:office@vexfit.app"');
  assertStringIncludes(kontakt[1], 'href="tel:+436603675175"');

  assertStringIncludes(sec, '<figcaption class="ueber-credit">Foto: Tatjana Weber</figcaption>');
});

Deno.test("Ueber: Knopf führt mit Herkunfts-Parameter auf das Wunsch-Formular", async () => {
  const sec = await abschnitt();
  assertStringIncludes(sec, 'href="wunsch.html?utm_source=startseite"');
  assertStringIncludes(sec, "Personal Trainer finden lassen");
});

Deno.test("Ueber: responsive Bilder, alt-Text, feste Maße, lazy", async () => {
  const sec = await abschnitt();
  for (const q of [
    "bilder/jakob-400.webp 400w",
    "bilder/jakob-800.webp 800w",
    "bilder/jakob-400.jpg 400w",
    "bilder/jakob-800.jpg 800w",
  ]) assertStringIncludes(sec, q);
  assertStringIncludes(sec, 'type="image/webp"');
  assertStringIncludes(sec, 'alt="Jakob Steinbacher, Gründer von Vexfit"');
  assertStringIncludes(sec, 'loading="lazy"');
  assertStringIncludes(sec, 'width="800" height="600"');
});

Deno.test("Ueber: standardmäßig sichtbar – kein dauerhaftes opacity:0, keine reveal-Logik", async () => {
  const s = await lies("./index.html");
  const sec = await abschnitt();
  // Der Abschnitt nutzt NICHT die reveal-Klasse (die setzt dauerhaft opacity:0).
  assert(!/\breveal\b/.test(sec), "Abschnitt nutzt die reveal-Logik (opacity:0)");
  // .ueber-inner ist standardmäßig sichtbar.
  const regel = s.match(/\.ueber-inner\{([^}]*)\}/);
  assert(regel, "CSS-Regel .ueber-inner fehlt");
  assertStringIncludes(regel[1], "opacity:1");
  // Einblende-Logik vorhanden, aber mit Rücksicht auf reduzierte Bewegung.
  assertStringIncludes(s, "@keyframes ueberIn");
  assertStringIncludes(s, "prefers-reduced-motion:reduce");
});

Deno.test("Ueber: keine Straße/Hausnummer/PLZ/Alter im Abschnitt", async () => {
  const sec = await abschnitt();
  assert(!/fuschl/i.test(sec), "Wohnort im Abschnitt");
  assert(!/\b5330\b/.test(sec), "PLZ im Abschnitt");
  assert(!/stra(ß|ss)e|gasse|\bweg\s+\d/i.test(sec), "Straße/Hausnummer im Abschnitt");
  assert(!/\d+\s*Jahre?\b/i.test(sec), "Altersangabe im Abschnitt");
});

Deno.test("Ueber: alle Bildfassungen existieren und sind nicht leer (Status 200)", async () => {
  for (
    const f of [
      "bilder/jakob-steinbacher.jpg",
      "bilder/jakob-400.jpg",
      "bilder/jakob-400.webp",
      "bilder/jakob-800.jpg",
      "bilder/jakob-800.webp",
      "bilder/jakob-rund-320.jpg",
      "bilder/jakob-rund-320.webp",
    ]
  ) {
    const info = await Deno.stat(new URL("./" + f, import.meta.url));
    assert(info.isFile && info.size > 0, f + " fehlt oder ist leer");
  }
  // Das Original bleibt unter 300 KB (sonst gehörte es in .gitignore).
  const orig = await Deno.stat(new URL("./bilder/jakob-steinbacher.jpg", import.meta.url));
  assert(orig.size <= 300 * 1024, "Original über 300 KB");
});

Deno.test("Ueber: wunsch.html hat persönliche Zeile mit kleinem Rundfoto", async () => {
  const s = await lies("./wunsch.html");
  const m = s.match(/<div class="jakob-zeile">[\s\S]*?<\/div>/);
  assert(m, "jakob-zeile fehlt auf wunsch.html");
  const zeile = m[0];
  assertStringIncludes(zeile, "Hier antwortet dir Jakob persönlich.");
  assertStringIncludes(zeile, "bilder/jakob-rund-320.webp");
  assertStringIncludes(zeile, "bilder/jakob-rund-320.jpg");
  assertStringIncludes(zeile, 'alt="Jakob Steinbacher, Gründer von Vexfit"');
  assertStringIncludes(zeile, 'loading="lazy"');
});
