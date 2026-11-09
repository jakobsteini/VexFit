// /Users/js/Projekte/Vexfit/app/vexfit/b6_profil_test.ts
//
// Dauerlauf 05./06.11.2026 – B6: Profil vollständig machen. Geprüft (ohne
// Browser, strukturell an trainer-bereich.html):
//   * die acht Kernangaben als eigene Auswertung (achtAngaben),
//   * Anzeige „x von 8" in der Profilstärke-Karte,
//   * ein Knopf zur NÄCHSTEN fehlenden Angabe (Foto im Bereich, Rest im
//     Profilformular mit passendem Anker),
//   * die anonyme Trichter-Stufe „profil5" (>=5/8) wird gemeldet,
//   * Erinnerungs-Mails nennen weiterhin „x von 8" und verlinken zur ersten
//     fehlenden Angabe (kern.ts).
//
// Aufruf:  deno test --allow-read b6_profil_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("B6: achtAngaben – acht Kernangaben, Foto zuerst", async () => {
  const s = await lies("./trainer-bereich.html");
  assertStringIncludes(s, "function achtAngaben(");
  const f = s.slice(s.indexOf("function achtAngaben("), s.indexOf("function achtAngaben(") + 900);
  for (const name of ["Foto", "Trainingsart", "Trainingsort", "Preis pro Stunde", "Über mich", "Erfahrung", "Spezialisierungen", "Telefon"]) {
    assertStringIncludes(f, "'" + name + "'");
  }
  // Foto ist der erste Eintrag (mobil zuerst).
  assert(f.indexOf("'Foto'") < f.indexOf("'Trainingsart'"), "Foto nicht zuerst");
});

Deno.test("B6: Profilstärke zeigt x von 8 und führt zur nächsten fehlenden Angabe", async () => {
  const s = await lies("./trainer-bereich.html");
  assertStringIncludes(s, "${acht.erfuellt} von 8");
  assertStringIncludes(s, "Nächste Angabe:");
  assertStringIncludes(s, "class=\"staerke-cta\"");
  // Anker für die Nicht-Foto-Felder ins Profilformular.
  assertStringIncludes(s, "profil-bearbeiten.html#fTrainingsart");
  assertStringIncludes(s, "profil-bearbeiten.html#fTelefon");
});

Deno.test("B6: profil5-Trichter-Beacon ab 5/8, Rolle Trainer, einmalig", async () => {
  const s = await lies("./trainer-bereich.html");
  assertStringIncludes(s, "function trichterProfil5(");
  const f = s.slice(s.indexOf("function trichterProfil5("), s.indexOf("function trichterProfil5(") + 700);
  assertStringIncludes(f, "a.erfuellt < 5");
  assertStringIncludes(f, "stufe: 'profil5'");
  assertStringIncludes(f, "rolle: 'trainer'");
  assertStringIncludes(f, "profil5Gemeldet");
  // Keine Personendaten im Beacon.
  assert(!/email|vorname|nachname/.test(f), "profil5-Beacon enthält Personendaten");
});

Deno.test("B6: Erinnerungs-Mails nennen x/8 und verlinken zur ersten fehlenden Angabe", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  // Betreff/Einstieg richten sich nach der Vollständigkeit: „x von 8 fertig".
  assertStringIncludes(kern, "von 8 fertig");
  assertStringIncludes(kern, "function erinnerungZiel(");
  assertStringIncludes(kern, "profil-bearbeiten.html#");
});
