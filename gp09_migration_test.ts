// /Users/js/Projekte/Vexfit/app/vexfit/gp09_migration_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 9: EINE Migration für alle DB-Änderungen
// dieser Sitzung, idempotent, mit Rücknahme. NICHT eingespielt (nur Datei).
//
// Aufruf:  deno test --allow-read gp09_migration_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const mig = await Deno.readTextFile(new URL("./migrations/2026-11-01-01-gesamtpruefung.sql", import.meta.url));
const ruck = await Deno.readTextFile(new URL("./migrations/2026-11-01-01-gesamtpruefung-ruecknahme.sql", import.meta.url));

Deno.test("Migration legt freigabe_mail_gesendet idempotent an", () => {
  assertStringIncludes(mig, "ADD COLUMN IF NOT EXISTS freigabe_mail_gesendet boolean NOT NULL DEFAULT false");
  assertStringIncludes(mig, "public.trainers");
});

Deno.test("Migration ist idempotent (nur IF-NOT-EXISTS-Schreibweisen)", () => {
  // Keine nackten ADD COLUMN ohne IF NOT EXISTS.
  assert(!/ADD COLUMN(?!\s+IF NOT EXISTS)/i.test(mig), "nacktes ADD COLUMN gefunden");
});

Deno.test("Rücknahme entfernt genau diese Spalte", () => {
  assertStringIncludes(ruck, "DROP COLUMN IF EXISTS freigabe_mail_gesendet");
});

Deno.test("Reihenfolge-Hinweis zu 09/10 steht im Kopf", () => {
  assertStringIncludes(mig, "2026-11-01-01");
  assert(/09.*10.*2026-11-01-01|09 .* 10 /s.test(mig), "Reihenfolge-Hinweis fehlt");
});
