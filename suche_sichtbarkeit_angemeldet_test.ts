// /Users/js/Projekte/Vexfit/app/vexfit/suche_sichtbarkeit_angemeldet_test.ts
//
// B1 (Dauerlauf 2026-11-03): angemeldete Kunden sehen alle freigegebenen
// Trainer. Entscheidung Jakob (Migration 2026-10-31-10, "Admin entscheidet
// allein"): sichtbar ist, wer freigegeben (aktiv=true) und nicht gesperrt ist.
// Foto/Über-mich/Spezialisierung sind KEINE Bedingung.
//
// Geprüft wird OHNE Netz/Browser gegen die echten Quelldateien:
//   - suche.html          (angemeldeter Pfad: Tabellen-Abfrage + kein Nachfilter)
//   - migrations/2026-10-31-10-sichtbarkeit-admin-entscheidet.sql (öffentliche Sicht)
//
// Aufruf:  deno test --allow-read suche_sichtbarkeit_angemeldet_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const suche = await Deno.readTextFile(new URL("./suche.html", import.meta.url));
const sichtSql = await Deno.readTextFile(
  new URL("./migrations/2026-10-31-10-sichtbarkeit-admin-entscheidet.sql", import.meta.url),
);

// Die eine Regel, die beide Pfade (angemeldet wie nicht angemeldet) abbilden
// müssen: freigegeben UND nicht gesperrt. Foto spielt keine Rolle.
function sichtbar(t: { aktiv: boolean; gesperrt?: boolean }) {
  return t.aktiv === true && t.gesperrt !== true;
}

const freigegebenOhneFoto = { aktiv: true, gesperrt: false, avatar_url: null };
const gesperrt = { aktiv: true, gesperrt: true, avatar_url: "x/avatars/a.jpg" };
const nichtFreigegeben = { aktiv: false, gesperrt: false, avatar_url: "x/avatars/b.jpg" };

Deno.test("Regel: freigegeben ohne Foto sichtbar, gesperrt/nicht-freigegeben nicht", () => {
  assert(sichtbar(freigegebenOhneFoto), "freigegeben ohne Foto muss sichtbar sein");
  assert(!sichtbar(gesperrt), "gesperrt darf nicht sichtbar sein");
  assert(!sichtbar(nichtFreigegeben), "nicht freigegeben darf nicht sichtbar sein");
});

Deno.test("Angemeldeter Pfad: Abfrage begrenzt auf aktiv=true UND nicht gesperrt", () => {
  // Die Tabellen-Abfrage des angemeldeten Pfads filtert server-seitig genau die
  // Regel ab – so kann ein gesperrter Trainer gar nicht erst ankommen.
  assertStringIncludes(suche, "trainers?aktiv=eq.true&gesperrt=is.false&select=");
});

Deno.test("Angemeldeter Pfad: KEIN zusätzlicher Mindeststärke-/Foto-Nachfilter", () => {
  // Beide Pfade nutzen die geladene Liste unverändert.
  assertStringIncludes(suche, "allTrainers = daten;");
  assert(
    !suche.includes("daten.filter(mindeststaerkeErfuellt)"),
    "angemeldeter Pfad filtert nicht mehr nach Mindeststärke",
  );
  // Freigegebene Trainer OHNE Foto fallen damit nicht mehr aus der Suche.
  assert(
    !suche.includes("function mindeststaerkeErfuellt"),
    "Mindeststärke-Funktion sollte entfernt sein",
  );
});

Deno.test("Nicht angemeldeter Pfad: öffentliche Sicht bildet dieselbe Regel ab", () => {
  // Der nicht angemeldete Pfad liest trainers_oeffentlich; die Sicht begrenzt
  // genau auf aktiv=true AND gesperrt IS NOT TRUE (Foto keine Bedingung).
  assertStringIncludes(suche, "trainers_oeffentlich?select=");
  assertStringIncludes(sichtSql, "aktiv = true AND gesperrt IS NOT TRUE");
});
