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

// --------------------------------------------------------------------------
// Baustein 7, Nachtrag: Standort-Adresse im Admin bearbeiten (Migration 08).
// --------------------------------------------------------------------------
Deno.test("Migration 08: standort_admin_bearbeiten nur fuer den Admin, Liste traegt 'land'", async () => {
  const sql = await lies("./migrations/2026-10-31-08-studio-adresse-bearbeiten.sql");
  assertStringIncludes(sql, "FUNCTION public.standort_admin_bearbeiten");
  // Admin-Pruefung + SECURITY DEFINER + abgeschottetes search_path.
  assertStringIncludes(sql, "ist_vexfit_admin()");
  assertStringIncludes(sql, "SECURITY DEFINER");
  assertStringIncludes(sql, "SET search_path = ''");
  // Leere Felder ueberschreiben nichts.
  assertStringIncludes(sql, "COALESCE(NULLIF(btrim(p_adresse), ''), adresse)");
  // anon bekommt kein EXECUTE.
  assert(!/GRANT EXECUTE[^;]*TO anon/.test(sql), "anon darf die Bearbeiten-Funktion ausfuehren");
  assertStringIncludes(sql, "GRANT EXECUTE ON FUNCTION public.standort_admin_bearbeiten");
  // Die Liste gibt jetzt auch 'land' aus (fuer die Vorbelegung im Dialog).
  assertStringIncludes(sql, "'land', st.land");
});

Deno.test("Ruecknahme 08 entfernt die Funktion und nimmt 'land' aus der Liste", async () => {
  const sql = await lies("./migrations/2026-10-31-08-studio-adresse-bearbeiten-ruecknahme.sql");
  assertStringIncludes(sql, "DROP FUNCTION IF EXISTS public.standort_admin_bearbeiten");
  // Liste wieder ohne 'land'.
  assert(!sql.includes("'land', st.land"), "Rueckbau laesst 'land' in der Liste stehen");
});

Deno.test("admin.html: Standort bearbeiten - Knopf, Dialog, RPC", async () => {
  const html = await lies("./admin.html");
  assertStringIncludes(html, "Adresse bearbeiten");
  assertStringIncludes(html, "function standortBearbeiten(");
  assertStringIncludes(html, "function studioAdresse(");
  assertStringIncludes(html, "rpc/standort_admin_bearbeiten");
  // Standortdaten werden gemerkt, nicht durch onclick geschleust.
  assertStringIncludes(html, "window._adminStudios");
});
