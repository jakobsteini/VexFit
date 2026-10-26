// /Users/js/Projekte/Vexfit/app/vexfit/adminaktion_test.ts
//
// Baustein "Admin-Aktionen ueber die Edge Function". Die 401/403/400- und
// Aktions-Logik von /admin-aktion ist in kern_test.ts geprueft. Hier: admin.html
// hat keinen direkten Schreibzugriff mehr auf trainers/anfragen/kunden und ruft
// stattdessen /admin-aktion auf; die Admin-ID ist ueberall dieselbe.
//
// Aufruf:  deno test --allow-read adminaktion_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("admin.html ohne direkten Schreibzugriff, nutzt /admin-aktion", async () => {
  const html = await lies("./admin.html");
  // Keine direkten Schreib-/Loeschaufrufe mehr.
  assert(!html.includes("method: 'PATCH'"), "admin.html hat noch ein direktes PATCH");
  assert(!html.includes("method: 'DELETE'"), "admin.html hat noch ein direktes DELETE");
  // Kein Schreib-Endpunkt auf die Tabellen mehr (nur noch Lese-selects erlaubt).
  assert(
    !/rest\/v1\/(trainers|anfragen|kunden)[^`'"]*`?\s*,\s*\{\s*[^}]*method/.test(html),
    "admin.html schreibt noch direkt auf eine Tabelle",
  );
  // Stattdessen der Endpunkt.
  assertStringIncludes(html, "vexfit-automation/admin-aktion");
  assertStringIncludes(html, "adminAktion(");
});

Deno.test("Admin-ID ist in Seite, Migration und Function identisch", async () => {
  const id = "ee744b01-0a70-4da5-a19b-6c905c8479b5";
  const html = await lies("./admin.html");
  const mig = await lies("./migrations/2026-09-20-admin-vollzugriff.sql");
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(html, id);
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
