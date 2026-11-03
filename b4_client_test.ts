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

Deno.test("B4: Migration legt trainer_alerts mit engem Zeilenschutz an (+ Token), nicht eingespielt", async () => {
  const sql = await lies("./migrations/2026-11-03-02-warteliste-mail.sql");
  // Die Tabelle wird jetzt in dieser Datei selbst angelegt (sie fehlte live).
  assertStringIncludes(sql, "CREATE TABLE IF NOT EXISTS public.trainer_alerts");
  assertStringIncludes(sql, "ADD COLUMN IF NOT EXISTS abmelde_token uuid");
  assertStringIncludes(sql, "NICHT eingespielt");
  // Zeilenschutz an und eng gefasst: Kunde nur eigene Zeilen (E-Mail aus JWT),
  // Admin über die vorhandene Hilfsfunktion – KEINE pauschale Freigabe.
  assertStringIncludes(sql, "ENABLE ROW LEVEL SECURITY");
  assertStringIncludes(sql, "kunden_email = (auth.jwt() ->> 'email')");
  assertStringIncludes(sql, "public.ist_vexfit_admin()");
  assert(
    !/USING\s*\(\s*true\s*\)|TO\s+anon/i.test(sql),
    "keine pauschale/anon-Freigabe erlaubt",
  );
  // Das Abmelde-Token darf NICHT im Leserecht der Rolle authenticated stehen.
  const grantSelect = sql.slice(sql.indexOf("GRANT SELECT ("));
  const grantSelectKopf = grantSelect.slice(0, grantSelect.indexOf(")"));
  assert(
    !grantSelectKopf.includes("abmelde_token"),
    "abmelde_token darf nicht an authenticated lesbar sein",
  );
});
