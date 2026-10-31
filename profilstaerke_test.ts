// /Users/js/Projekte/Vexfit/app/vexfit/profilstaerke_test.ts
//
// Baustein 3 (Blitz-Registrierung & Profilstaerke, 31.10.2026). Prueft ohne
// Browser: die Mindeststaerke-Sicht, die Profilstaerke-Karte und den
// Suchfilter.
//
// Aufruf:  deno test --allow-read profilstaerke_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Migration 03: oeffentliche Sicht verlangt Foto, Kurztext und Spezialisierung", async () => {
  const sql = await lies("./migrations/2026-10-31-03-mindeststaerke.sql");
  assertStringIncludes(sql, "avatar_url IS NOT NULL");
  assertStringIncludes(sql, "length(btrim(bio)) > 0");
  assertStringIncludes(sql, "array_length(spezialisierungen, 1) >= 1");
  // Gleiche Spalten wie Baustein 2 (keine Kontaktdaten, kein zertifikat_datei).
  assert(!sql.includes("zertifikat_datei"), "zertifikat_datei in der Sicht");
  assert(!sql.includes("email") && !sql.includes("telefon"), "Kontaktdaten in der Sicht");
});

Deno.test("Ruecknahme 03: Sicht nur noch aktiv = true", async () => {
  const sql = await lies("./migrations/2026-10-31-03-mindeststaerke-ruecknahme.sql");
  assertStringIncludes(sql, "WHERE aktiv = true");
  assert(!sql.includes("avatar_url IS NOT NULL"), "Mindeststaerke noch in der Ruecknahme");
});

Deno.test("trainer-bereich.html: Profilstaerke mit 8 Punkten, Tipps und Mindeststaerke-Warnung", async () => {
  const html = await lies("./trainer-bereich.html");
  assertStringIncludes(html, "function renderProfilstaerke()");
  assertStringIncludes(html, "vexfit-video.js");
  // Die acht geforderten Punkte.
  for (const p of ["Foto", "Kurztext", "Spezialisierungen", "Vorstellungsvideo", "Galerie", "Sprachen", "Trainingsorte", "Zertifikat"]) {
    assertStringIncludes(html, "'" + p + "'");
  }
  // Mindeststaerke = Foto + Spezialisierung + Kurztext.
  assertStringIncludes(html, "Dafür brauchst du mindestens Foto, Spezialisierung und Kurztext");
  // renderProfilstaerke wird aus updateDots aufgerufen (bleibt zusaetzlich zur
  // bestehenden Vollstaendigkeits-Anzeige).
  assertStringIncludes(html, "renderProfilstaerke();");
  assertStringIncludes(html, 'id="pctLabel"'); // die bestehende Anzeige bleibt
});

Deno.test("suche.html: Mindeststaerke-Filter wird auf die Liste angewendet", async () => {
  const html = await lies("./suche.html");
  assertStringIncludes(html, "function mindeststaerkeErfuellt(t)");
  assertStringIncludes(html, "daten.filter(mindeststaerkeErfuellt)");
});

Deno.test("Blitz-Registrierung: Trainerformular verlangt nur die Pflichtfelder", async () => {
  const html = await lies("./registrieren.html");
  // Pflichtpruefung bei submitTrainer: Vorname, Nachname, E-Mail, PLZ (Passwort
  // separat). Keine weiteren Pflichtfelder beim Anmelden.
  assertStringIncludes(html, "if(!fn||!ln||!email||!plz){showError('t-error','Bitte alle Felder ausfüllen!')");
  // Nach der Registrierung geht es ins Profilformular weiter (neu=1).
  assertStringIncludes(html, "trainer-bereich.html?neu=1");
});
