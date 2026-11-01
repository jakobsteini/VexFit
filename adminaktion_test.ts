// /Users/js/Projekte/Vexfit/app/vexfit/adminaktion_test.ts
//
// Baustein "Admin-Aktionen ueber die Edge Function". Die 401/403/400- und
// Aktions-Logik von /admin-aktion ist in kern_test.ts geprueft. Hier: das neue
// Verwaltungs-Modul (vexfit-verwaltung.js) schreibt nicht direkt auf
// trainers/anfragen/kunden, sondern ruft /admin-aktion auf; die Admin-ID ist
// ueberall dieselbe. Das alte admin.html ist nur noch eine Weiterleitung.
//
// Aufruf:  deno test --allow-read adminaktion_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Verwaltung ohne direkten Schreibzugriff, nutzt /admin-aktion", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  // Keine direkten Schreib-/Loeschaufrufe auf die Tabellen (nur Lese-GETs).
  assert(!/method:\s*["']PATCH["']/.test(js), "Modul hat noch ein direktes PATCH");
  assert(!/method:\s*["']DELETE["']/.test(js), "Modul hat noch ein direktes DELETE");
  // Stattdessen der Endpunkt.
  assertStringIncludes(js, "vexfit-automation/admin-aktion");
});

Deno.test("Admin-ID ist in Modul, Migration und Function identisch", async () => {
  const id = "ee744b01-0a70-4da5-a19b-6c905c8479b5";
  const js = await lies("./vexfit-verwaltung.js");
  const mig = await lies("./migrations/2026-09-20-admin-vollzugriff.sql");
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(js, id);
  assertStringIncludes(mig, id);
  assertStringIncludes(kern, id);
});

Deno.test("Function kennt /admin-aktion und die festen Aktionen", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, '"admin-aktion"');
  assertStringIncludes(kern, "trainer_aktivieren");
  assertStringIncludes(kern, "trainer_sperren");
  assertStringIncludes(kern, "trainer_bezahlt");
  assertStringIncludes(kern, "trainer_loeschen");
  assertStringIncludes(kern, "kunde_loeschen");
});
