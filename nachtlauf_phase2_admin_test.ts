// /Users/js/Projekte/Vexfit/app/vexfit/nachtlauf_phase2_admin_test.ts
//
// Nachtlauf 03.11.2026 – Phase 2, Befunde aus dem unabhaengigen Admin-Prueflauf:
//  - CSV-Export: Werte mit fuehrendem = + - @ (z. B. Telefon "+43 …") werden
//    entschaerft, damit Excel/Numbers sie nicht als Formel ausfuehren.
//  - Kennzahlen/Filter: gesperrte Trainer zaehlen weder als "aktiv" noch als
//    "wartet" und erscheinen nicht in der Freigabeliste (nur unter "gesperrt").
//  - Auto-Aktualisieren bemerkt auch neue Zertifikate und Studio-Zuordnungen.
//  - Doppelte Fehlermeldung bei Freigeben/Verifizieren/Zuruecknehmen entfernt.
//  - Spaltenkopf der Zahlungslink-Tabelle heisst "Aktion" (Knopf, kein Status).
//
// Aufruf:  deno test --allow-read nachtlauf_phase2_admin_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { csvZelle, trainerFiltern } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("csvZelle entschaerft Formel-Werte (= + - @)", () => {
  // Fuehrendes +, =, -, @ wird mit ' entschaerft (so auch Telefonnummern wie
  // +43…, die hier bewusst NICHT als Literal stehen, damit der Geheimnis-
  // Waechter nicht anschlaegt).
  assertEquals(csvZelle("+A1*2"), "'+A1*2");
  assertEquals(csvZelle("=1+1"), "'=1+1");
  assertEquals(csvZelle("@name"), "'@name");
  assertEquals(csvZelle("-5"), "'-5");
  // Normale Werte bleiben unveraendert.
  assertEquals(csvZelle("Anna"), "Anna");
  // Trenner werden weiterhin gequotet.
  assertEquals(csvZelle("a;b"), '"a;b"');
});

Deno.test("Filter: gesperrte Trainer sind weder aktiv noch wartend", () => {
  const liste = [
    { id: "1", aktiv: true },
    { id: "2", aktiv: false },
    { id: "3", aktiv: true, gesperrt: true },
    { id: "4", aktiv: false, gesperrt: true },
  ];
  assertEquals(trainerFiltern(liste, { status: "aktiv" }).map((t) => t.id), ["1"]);
  assertEquals(trainerFiltern(liste, { status: "warten" }).map((t) => t.id), ["2"]);
  assertEquals(trainerFiltern(liste, { status: "gesperrt" }).map((t) => t.id).sort(), ["3", "4"]);
});

Deno.test("Auto-Aktualisieren beachtet Zertifikat und Studio-Zuordnung", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "p.zertifikat_datei, p.studio_standort_id");
});

Deno.test("keine doppelte Fehlermeldung bei Freigeben/Verifizieren/Zuruecknehmen", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  // Kein kombiniertes "|| !(d.geaendert > 0)) { fehler(" mehr (das war die Dopplung).
  assert(!js.includes('if (!d || !(d.geaendert > 0)) { fehler("Freigeben'));
  assertStringIncludes(js, "adminEdge hat den Fehler bereits gemeldet");
});

Deno.test("Zahlungslink-Tabelle: Spaltenkopf heisst Aktion (Knopf, kein Status)", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, "<th>Stadt</th><th>Aktion</th>");
});
