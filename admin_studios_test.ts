// /Users/js/Projekte/Vexfit/app/vexfit/admin_studios_test.ts
//
// Baustein 7 (Admin-Dashboard). Migration und admin.html ohne Browser/DB.
// Aufruf:  deno test --allow-read admin_studios_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Migration 06: vier Admin-Funktionen, alle nur fuer den Admin", async () => {
  const sql = await lies("./migrations/2026-10-31-06-admin-studios.sql");
  for (const fn of ["studios_admin_liste", "studio_admin_anlegen", "standort_admin_anlegen", "studio_admin_freigabe"]) {
    assertStringIncludes(sql, "FUNCTION public." + fn);
  }
  // Jede prueft ist_vexfit_admin().
  const treffer = (sql.match(/ist_vexfit_admin\(\)/g) || []).length;
  assert(treffer >= 4, "nicht jede Admin-Funktion prueft ist_vexfit_admin()");
  // Alle SECURITY DEFINER.
  assert((sql.match(/SECURITY DEFINER/g) || []).length >= 4);
  // anon bekommt kein EXECUTE.
  assert(!/GRANT EXECUTE[^;]*TO anon/.test(sql), "anon darf eine Admin-Funktion ausfuehren");
});

Deno.test("Ruecknahme 06 entfernt die Funktionen", async () => {
  const sql = await lies("./migrations/2026-10-31-06-admin-studios-ruecknahme.sql");
  for (const fn of ["studios_admin_liste", "studio_admin_anlegen", "standort_admin_anlegen", "studio_admin_freigabe"]) {
    assertStringIncludes(sql, "DROP FUNCTION IF EXISTS public." + fn);
  }
});

Deno.test("admin.html: drei neue Tabs und ihre Funktionen", async () => {
  const html = await lies("./admin.html");
  assertStringIncludes(html, "vexfit-video.js");
  // Tabs.
  for (const t of ["'studios'", "'zertifikate'", "'profiluebersicht'"]) {
    assertStringIncludes(html, "showTab(" + t);
  }
  // 7a Studios: liest ueber die Admin-Funktion, zeigt Links, schaltet frei.
  assertStringIncludes(html, "rpc/studios_admin_liste");
  assertStringIncludes(html, "rpc/studio_admin_freigabe");
  assertStringIncludes(html, "rpc/studio_admin_anlegen");
  // 7b Zertifikate: signierte Adresse + Verifizieren ueber die bestehende Admin-Aktion.
  assertStringIncludes(html, "storage/v1/object/sign/zertifikate/");
  assertStringIncludes(html, "adminAktion('trainer_verifizieren'");
  // 7c Profil-Übersicht: neue Felder + Filter + Profilstaerke.
  assertStringIncludes(html, "function renderProfilUebersicht()");
  assertStringIncludes(html, "function profilStaerke(t)");
  assertStringIncludes(html, "profilFilter");
});
