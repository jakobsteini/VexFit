// /Users/js/Projekte/Vexfit/app/vexfit/b7_test_spam_test.ts
//
// Dauerlauf 05./06.11.2026 – B7: Test-/Spam-Konten markieren & ausblenden.
// Geprüft:
//   * markierte Konten (ist_test) bekommen keine Erinnerung (kern),
//   * sichtbar() blendet markierte Konten aus,
//   * testSpamVerdacht() schlägt +Alias / auffälligen Namen / Doppelnamen vor
//     und lässt schon markierte aus,
//   * die Admin-Aktionen setzen ist_test (kern-Switch),
//   * die Erinnerungs-Abfrage weicht ohne die Spalte zurück (index.ts),
//   * Migration + Rücknahme vorhanden.
//
// Aufruf:  deno test --allow-read b7_test_spam_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { erinnerungStufeFaellig, type TrainerProfil } from "./supabase/functions/vexfit-automation/kern.ts";
import { sichtbar, testSpamVerdacht } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const vor = (stunden: number) => new Date(Date.now() - stunden * 3_600_000).toISOString();

Deno.test("B7: markiertes Test-Konto bekommt keine Erinnerung", () => {
  const basis = { id: "t1", email: "a@b.at", aktiv: false, gesperrt: false, erinnerungen_aus: false, created_at: vor(10), bio: "" } as TrainerProfil;
  // ohne Markierung wäre Stufe 1 fällig …
  assertEquals(erinnerungStufeFaellig({ ...basis }), 1);
  // … mit Markierung nicht.
  assertEquals(erinnerungStufeFaellig({ ...basis, ist_test: true }), null);
});

Deno.test("B7: sichtbar() blendet markierte Konten aus (nur wenn Tests-aus aktiv)", () => {
  const liste = [
    { id: 1, email: "echt@beispiel.at" },
    { id: 2, email: "markiert@beispiel.at", ist_test: true },
  ];
  assertEquals(sichtbar(liste, true).map((x) => x.id), [1]);
  // Schalter aus: alle sichtbar.
  assertEquals(sichtbar(liste, false).map((x) => x.id), [1, 2]);
});

Deno.test("B7: testSpamVerdacht schlägt +Alias, auffälligen Namen und Doppelnamen vor", () => {
  const trainers = [
    { id: 1, vorname: "Max", nachname: "Muster", email: "max@beispiel.at" },     // unauffällig
    { id: 2, vorname: "Test", nachname: "Konto", email: "a+test@beispiel.at" },   // +Alias + Name
    { id: 3, vorname: "Xzxz", nachname: "Bcbc", email: "x@beispiel.at" },         // keine Vokale
    { id: 4, vorname: "Anna", nachname: "Klein", email: "anna1@beispiel.at" },    // Doppelname
    { id: 5, vorname: "Anna", nachname: "Klein", email: "anna2@beispiel.at" },    // Doppelname
    { id: 6, vorname: "Lea", nachname: "Gross", email: "lea@beispiel.at", ist_test: true }, // schon markiert
  ];
  const funde = testSpamVerdacht(trainers) as { id: number; gruende: string[] }[];
  const ids = funde.map((f) => f.id).sort();
  assertEquals(ids, [2, 3, 4, 5]);
  assert(!ids.includes(1), "unauffälliges Konto fälschlich vorgeschlagen");
  assert(!ids.includes(6), "bereits markiertes Konto erneut vorgeschlagen");
  const f2 = funde.find((f) => f.id === 2);
  assert(f2, "Konto 2 nicht vorgeschlagen");
  assertStringIncludes(f2.gruende.join(" "), "E-Mail-Alias");
});

Deno.test("B7: kern-Switch kennt Markieren und Aufheben", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, 'case "trainer_test_markieren":');
  assertStringIncludes(kern, 'case "trainer_test_aufheben":');
  assertStringIncludes(kern, 'ist_test: aktion === "trainer_test_markieren"');
});

Deno.test("B7: Erinnerungs-Abfrage weicht ohne die Spalte zurück", async () => {
  const idx = await lies("./supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(idx, "ist_test=not.is.true");
  assertStringIncludes(idx, 'basis + ",ist_test"');
});

Deno.test("B7: Migration + Rücknahme vorhanden (ist_test, umkehrbar, kein Löschen)", async () => {
  const m = await lies("./migrations/2026-11-06-02-test-spam.sql");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS ist_test boolean NOT NULL DEFAULT false");
  const r = await lies("./migrations/ruecknahmen/2026-11-06-02-test-spam-ruecknahme.sql");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS ist_test");
});
