// /Users/js/Projekte/Vexfit/app/vexfit/pixel_registrierung_test.ts
//
// Teil 1: Meta-Pixel CompleteRegistration nach erfolgreicher Registrierung.
// Prüft strukturell (die Logik steckt inline in registrieren.html):
//   - genau 1× nach Erfolg, für Trainer UND Kunde, mit content_name trainer/kunde
//   - nur mit Zustimmung (vexfit_consent === 'zugestimmt')
//   - 0× bei Fehler (Aufruf liegt NACH dem Insert-Fehler-Guard)
//   - 0× beim Neuladen (nur in den Submit-Handlern, kein Aufruf auf oberster Ebene)
//   - Weiterleitung verzögert, damit die Pixel-Meldung nicht abgebrochen wird
//
// Aufruf:  deno test --allow-read pixel_registrierung_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Teil 1: ein gemeinsamer, zustimmungsgebundener Helfer feuert CompleteRegistration", async () => {
  const s = await lies("./registrieren.html");
  const i = s.indexOf("function pixelRegistrierungFertig(");
  assert(i !== -1, "Helfer fehlt");
  const helfer = s.slice(i, i + 500);
  assert(helfer.includes("vexfit_consent") && helfer.includes("'zugestimmt'"), "keine Zustimmungsprüfung im Helfer");
  assert(helfer.includes("typeof fbq !== 'function'"), "kein fbq-Vorhanden-Schutz");
  assert(helfer.includes("'CompleteRegistration'"), "feuert nicht CompleteRegistration");
});

Deno.test("Teil 1: Trainer und Kunde rufen den Helfer genau einmal mit dem richtigen Namen", async () => {
  const s = await lies("./registrieren.html");
  assertEquals((s.match(/pixelRegistrierungFertig\('trainer'/g) || []).length, 1, "Trainer-Aufruf nicht genau 1×");
  assertEquals((s.match(/pixelRegistrierungFertig\('kunde'/g) || []).length, 1, "Kunde-Aufruf nicht genau 1×");
  // fbq('track','CompleteRegistration' steht ausschließlich im Helfer (mit/ohne
  // eventID), nicht in den Submit-Handlern selbst.
  assert(s.includes("fbq('track','CompleteRegistration'"), "CompleteRegistration fehlt");
  for (const start of ["async function submitTrainer(", "async function submitClient("]) {
    const b = s.slice(s.indexOf(start), s.indexOf(start) + 5000);
    assert(!b.includes("fbq('track'"), `${start}: direkter fbq-Track statt über den Helfer`);
  }
  // Das alte Lead-Ereignis ist entfernt.
  assert(!s.includes("fbq('track','Lead'"), "altes Lead-Ereignis noch da");
});

Deno.test("Teil 1: Pixel feuert NUR im Erfolgszweig (nach dem Insert-Guard), nicht bei Fehler", async () => {
  const s = await lies("./registrieren.html");
  for (const [start, tabelle, aufruf] of [
    ["async function submitTrainer(", "rest/v1/trainers", "pixelRegistrierungFertig('trainer'"],
    ["async function submitClient(", "rest/v1/kunden", "pixelRegistrierungFertig('kunde', capiEventId)"],
  ] as const) {
    // Fenster großzügig (E2 fügte die Standort-Pflichtprüfung vor dem Insert ein).
    const b = s.slice(s.indexOf(start), s.indexOf(start) + 6500);
    const guard = b.indexOf("if(!ir.ok)");
    const fire = b.indexOf(aufruf);
    assert(guard !== -1 && fire !== -1, `${start}: Guard oder Aufruf fehlt`);
    assert(fire > guard, `${start}: Pixel feuert vor dem Insert-Fehler-Guard (würde bei Fehler feuern)`);
    assert(b.includes(tabelle), `${start}: Insert-Tabelle nicht gefunden`);
  }
});

Deno.test("Teil 1: kein Pixel-Track auf oberster Ebene (0× beim Neuladen)", async () => {
  const s = await lies("./registrieren.html");
  // CompleteRegistration darf nur im Helfer stehen, nicht beim Seitenaufbau.
  // (Der Helfer wird ausschließlich aus den Submit-Handlern gerufen.)
  const vorHelfer = s.slice(0, s.indexOf("function pixelRegistrierungFertig("));
  assert(!vorHelfer.includes("'CompleteRegistration'"), "CompleteRegistration wird außerhalb des Helfers ausgelöst");
});

Deno.test("Teil 1: Weiterleitung des Trainers ist verzögert (Pixel/Webhook nicht abbrechen)", async () => {
  const s = await lies("./registrieren.html");
  assert(s.includes("function weiterNach("), "verzögerte Weiterleitung fehlt");
  assert(/weiterNach\('trainer-bereich\.html\?neu=1'\)/.test(s), "non-Studio-Weiterleitung nicht über weiterNach");
  assert(/weiterNach\('trainer-bereich\.html\?neu=1&studio=1'\)/.test(s), "Studio-Weiterleitung nicht über weiterNach");
  // Keine direkte, sofortige Weiterleitung mehr im Trainer-Erfolgszweig.
  assert(!s.includes("window.location.href = 'trainer-bereich.html?neu=1'"), "noch eine sofortige Weiterleitung vorhanden");
});
