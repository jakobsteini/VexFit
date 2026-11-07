// /Users/js/Projekte/Vexfit/app/vexfit/admin_test.ts
//
// Struktur-Prüfungen der NEUEN Verwaltungsseite (das alte admin.html ist nur
// noch eine Weiterleitung). Die reinen Hilfsfunktionen (Vollständigkeit,
// Testkonten, Profilstärke …) sind in verwaltung_logik_test.ts geprüft; das
// Verhalten der Edge Function in supabase/functions/vexfit-automation/.
//
// Aufruf:  deno test --allow-read admin_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const SEITE = "./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html";
const MODUL = "./vexfit-verwaltung.js";

Deno.test("Verwaltung: alle Reiter sind in der Seite angelegt", async () => {
  const html = await lies(SEITE);
  for (const tab of ["uebersicht", "trainer", "kunden", "anfragen", "zahlungen", "studios", "zertifikate", "nachfrage", "protokoll"]) {
    assertStringIncludes(html, `data-tab="${tab}"`);
    assertStringIncludes(html, `id="tab-${tab}"`);
  }
});

Deno.test("Verwaltung: jeder Bereich wird im Modul geladen/gerendert", async () => {
  const js = await lies(MODUL);
  for (const fn of [
    "renderTrainer", "renderKunden", "renderFreigabe", "ladeAnfragen",
    "ladeZahlungslinkOffen", "ladeZahlungen", "ladeStudios", "ladeZertifikate",
    "ladeNachfrage", "ladeProtokoll", "renderStats",
  ]) assertStringIncludes(js, fn);
});

Deno.test("Verwaltung: kein alert/confirm/prompt, eigener Dialog/Meldungsweg", async () => {
  const js = await lies(MODUL);
  assert(!/(?:^|[^.\w])(?:alert|confirm|prompt)\(\s*['"`]/.test(js), "echter alert/confirm/prompt-Aufruf vorhanden");
  assertStringIncludes(js, "function bestaetige(");
  assertStringIncludes(js, "function meldung(");
});

Deno.test("Verwaltung: Detailansicht Trainer/Kunde zeigt die wichtigen Felder", async () => {
  const js = await lies(MODUL);
  assertStringIncludes(js, "function trainerDetail(");
  assertStringIncludes(js, "function kundeDetail(");
  for (const label of ["Telefon", "PLZ / Stadt", "Trainingsart", "Trainingsort", "Preis pro Stunde", "Erfahrung", "Über mich", "Spezialisierungen", "Profil-Vollständigkeit"]) {
    assertStringIncludes(js, label);
  }
  assertStringIncludes(js, "Antworten aus dem Einstieg");
  assertStringIncludes(js, "Gestellte Anfragen");
});

Deno.test("Verwaltung: kein Freigabe-Gate – der Admin entscheidet allein", async () => {
  const js = await lies(MODUL);
  assertStringIncludes(js, "Freigeben ist trotzdem möglich");
  assert(!js.includes("Freigeben gesperrt"));
  assert(!js.includes("Freigeben nicht möglich"));
});

Deno.test("Verwaltung: Kicken = EIN Dialog ohne Namen-Eintippen, bestaetigt=true", async () => {
  const js = await lies(MODUL);
  assertStringIncludes(js, "person_kicken");
  assertStringIncludes(js, "bestaetigt: true");
  assertStringIncludes(js, "Ja, endgültig löschen");
  // KEIN Namen-Eintippen mehr (anders als im alten admin.html).
  assert(!/nameZumTippen/.test(js), "Kicken verlangt noch das Eintippen des Namens");
});

Deno.test("Verwaltung: Aktionen laufen über die Edge Function, kein Geheimschlüssel im Frontend", async () => {
  const js = await lies(MODUL);
  assertStringIncludes(js, "vexfit-automation/admin-aktion");
  for (const a of ["trainer_aktivieren", "trainer_sperren", "login_sperren", "login_entsperren", "person_kicken"]) {
    assertStringIncludes(js, a);
  }
  assert(!/sb_secret/i.test(js), "geheimer Schlüssel (sb_secret…) im Frontend");
  assert(!/service_role/i.test(js), "Service-Role-Schlüssel im Frontend");
});

Deno.test("Verwaltung: Darstellung ohne Querscroll am Handy (Panel Vollbild)", async () => {
  const html = await lies(SEITE);
  assertStringIncludes(html, "overflow-x:auto"); // Tabellen scrollen in sich
  assertStringIncludes(html, "max-width:520px"); // Panel, am Handy 100% breit
});

// Nicht admin-bezogen, bleibt unverändert: Suche zeigt Trainer ohne Foto sauber.
Deno.test("Suche zeigt Trainer ohne Foto mit Initialen (kein Fehler, kein undefined)", async () => {
  const suche = await lies("./suche.html");
  assertStringIncludes(suche, "avatarAdresse(t.avatar_url)");
  assertStringIncludes(suche, "(t.vorname||'?')[0]");
  // D3: Foto -> echtes <img>, ohne Foto zentrierter Initialen-Platzhalter.
  assertStringIncludes(suche, "const bildHtml = bild");
  assertStringIncludes(suche, '<div class="cav">${initials || \'?\'}</div>');
  assertStringIncludes(suche, "(t.spezialisierungen || [])");
  assertStringIncludes(suche, "t.preis_stunde ?");
});
