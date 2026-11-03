// /Users/js/Projekte/Vexfit/app/vexfit/b4_client_test.ts
//
// B4 (Dauerlauf 2026-11-03): Client-/Migrationsseite der Warteliste.
//
// Aufruf:  deno test --allow-read b4_client_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("B4.1: kunden-bereich stößt nach dem Eintrag die Bestätigungsmail an", async () => {
  const html = await lies("./kunden-bereich.html");
  assertStringIncludes(html, "/vexfit-automation/warteliste-bestaetigung");
  // erst nach erfolgreichem Eintrag (markBenachrichtigt davor).
  const i = html.indexOf("warteliste-bestaetigung");
  const vor = html.slice(Math.max(0, i - 400), i);
  assertStringIncludes(vor, "markBenachrichtigt();");
});

Deno.test("B4: Migration ergänzt nur das Abmelde-Token (keine Lockerung), nicht eingespielt", async () => {
  const sql = await lies("./migrations/2026-11-03-02-warteliste-mail.sql");
  assertStringIncludes(sql, "ADD COLUMN IF NOT EXISTS abmelde_token uuid");
  assertStringIncludes(sql, "trainer_alerts");
  assertStringIncludes(sql, "NICHT eingespielt");
  // Keine GRANT-/POLICY-Lockerung in dieser Datei.
  assert(!/\bGRANT\b|\bCREATE POLICY\b/i.test(sql), "unerwartete Rechte-/Policy-Änderung");
});
