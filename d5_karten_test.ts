// /Users/js/Projekte/Vexfit/app/vexfit/d5_karten_test.ts
//
// Dauerlauf 08.11.2026 – D5: Karten und Seite aufräumen.
// Die einheitliche Karte (trainerKarteHtml, aus D2/D3) wird von allen Ansichten
// genutzt. Geprüft:
//   * EINE Kartenfunktion speist Standard-/Filter-/Matching- UND Abschnitts-Ansicht,
//   * Karte trägt Name, Ort bzw. „Online · aus …", Entfernung, Preis (sonst
//     „Auf Anfrage"), Schwerpunkte, Abzeichen und „Anmelden und anfragen" (anon),
//   * Abzeichen „Neu" (erste 30 Tage) bleibt erhalten,
//   * leere Felder werden sauber ausgeblendet (keine „undefined"/„null").
//
// Aufruf:  deno test --allow-read d5_karten_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("D5: EINE Kartenfunktion für alle Ansichten", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "function trainerKarteHtml(t, i, meta)");
  // Standard-/Filter-/Matching-Ansicht und Abschnitts-Ansicht nutzen sie.
  assertStringIncludes(s, "trainerKarteHtml(t, i, { online: vexAbschnitte.istOnline(t) })");
  assertStringIncludes(s, "trainerKarteHtml(t, i, { distanz:");
  assertStringIncludes(s, "trainerKarteHtml(t, i, { online: true, ausLand:");
});

Deno.test("D5: Karteninhalt – Name, Ort/Online, Preis-Rückfall, Schwerpunkte, Anfrage-Knopf", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, '<div class="cn">${name}</div>');
  assertStringIncludes(s, "'🌐 Online'");
  assertStringIncludes(s, "'<span>Auf Anfrage</span>'"); // Preis leer -> Auf Anfrage
  assertStringIncludes(s, '<div class="ctags">${tags}</div>');
  // Anmelde-Knopf für Nichtangemeldete.
  assertStringIncludes(s, "Anmelden und anfragen");
  assertStringIncludes(s, "function kontaktKnopf(istAngemeldet)");
});

Deno.test("D5: Abzeichen 'Neu' (erste 30 Tage) bleibt erhalten", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "tage >= 0 && tage <= 30");
  assertStringIncludes(s, '>Neu</div>');
});

Deno.test("D5: leere Felder sauber ausgeblendet (keine undefined/null)", async () => {
  const s = await lies("./suche.html");
  // Ort-Zeile filtert leere Teile weg, statt sie als Text zu drucken.
  assertStringIncludes(s, "const teile = [t.stadt, t.trainingsart].filter(x => x && String(x).trim()).map(vexEsc);");
  // Schwerpunkte nur, wenn vorhanden.
  assertStringIncludes(s, "${tags ? `<div class=\"ctags\">${tags}</div>` : ''}");
  // Keine rohe String-Verkettung mit t.stadt/t.trainingsart (die „undefined" drucken könnte).
  assert(!s.includes("vexEsc(t.stadt) + ' · ' + vexEsc(t.trainingsart)"), "alte, ungeschützte Ort-Verkettung noch da");
});
