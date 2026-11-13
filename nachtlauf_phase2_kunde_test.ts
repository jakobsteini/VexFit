// /Users/js/Projekte/Vexfit/app/vexfit/nachtlauf_phase2_kunde_test.ts
//
// Nachtlauf 03.11.2026 – Phase 2, Befunde aus dem unabhaengigen Kunden-/Trainer-
// Prueflauf. Faengt kuenftig:
//  - pwMatch war toter, abstuerzender Code (las nicht vorhandene -pw2/-pw-match)
//    und wurde bei jedem Tastendruck aufgerufen -> entfernt.
//  - Enter/Go sendet jetzt ab (Suche + Registrierung), gerade mobil wichtig.
//  - Warteliste schickt den Ort (PLZ) mit, nicht das nicht vorhandene #searchInput.
//  - Online-Trainer fallen nicht aus der Umkreissuche (trainingsort beachtet).
//  - Preise ueberall "Betrag €", auch dynamisch gerenderte Trainerpreise.
//  - Startseite: Suche nach PLZ (nicht mehr "nach Stadt").
//
// Aufruf:  deno test --allow-read nachtlauf_phase2_kunde_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("registrieren.html: kein abstuerzendes pwMatch mehr", async () => {
  const s = await lies("./registrieren.html");
  assert(!s.includes("function pwMatch"), "pwMatch-Funktion noch da");
  assert(!s.includes("pwMatch("), "pwMatch wird noch aufgerufen");
  assert(!/getElementById\([^)]*-pw2'/.test(s), "Verweis auf nicht vorhandenes -pw2");
  assert(!s.includes("-pw-match"), "Verweis auf nicht vorhandenes -pw-match");
});

Deno.test("registrieren.html: Enter sendet Trainer- und Kundenformular ab", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, "if(event.key==='Enter'){event.preventDefault();submitTrainer()}");
  assertStringIncludes(s, "if(event.key==='Enter'){event.preventDefault();submitClient()}");
});

Deno.test("suche.html: Enter startet die Suche, Warteliste sendet die PLZ", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "if(event.key==='Enter'){event.preventDefault();searchByPLZ()}");
  // Warteliste liest den vorhandenen #plzInput, nicht das fehlende #searchInput.
  assert(!s.includes("getElementById('searchInput')?.value"), "submitNotify liest noch #searchInput");
  assertStringIncludes(s, "const stadt = document.getElementById('plzInput')?.value.trim() || '';");
});

Deno.test("suche.html/12.11.: KEIN Online-Abschnitt mehr – nur Vor-Ort im Umkreis", async () => {
  const s = await lies("./suche.html");
  // Online-Trainer werden nicht mehr angezeigt; die RPC liefert nur Vor-Ort.
  assert(!s.includes("vexAbschnitte.einteilen(allTrainers, sel)"), "Vor-Ort/Online-Split noch aktiv");
  assertStringIncludes(s, "functions/v1/vexfit-automation/trainer-suche");
});

Deno.test("keine Preise in falscher Reihenfolge (auch dynamisch) auf oeffentlichen Seiten", async () => {
  const seiten = [
    "index.html", "registrieren.html", "suche.html", "profil.html",
    "profil-bearbeiten.html", "kunden-bereich.html", "trainer-bereich.html",
    "anleitung.html", "login.html", "studio.html", "john-harris.html",
  ];
  for (const f of seiten) {
    const s = await lies("./" + f);
    const treffer = s.match(/€\s*\d|€\$\{|€'\s*\+|€"\s*\+/g);
    assert(treffer === null, `${f}: Preis in falscher Reihenfolge: ${treffer?.join(", ")}`);
  }
});

Deno.test("index.html: Wunsch-Flow statt Stadt-Suche", async () => {
  const s = await lies("./index.html");
  // G3 (13.11.): die Startseite führt über das Wunsch-Formular (kein öffentliches
  // „Durchsuchen" mehr). Wichtig bleibt: NICHT mit einer Stadt-Suche werben.
  assertStringIncludes(s, "Wunsch abgeben");
  assert(!s.includes("nach Stadt und Ziel"), "index.html wirbt noch mit Stadt-Suche");
  assert(!/Durchsuche Trainer/.test(s), "index.html wirbt noch mit öffentlichem Durchsuchen");
});
