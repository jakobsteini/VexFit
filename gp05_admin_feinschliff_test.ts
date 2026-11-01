// /Users/js/Projekte/Vexfit/app/vexfit/gp05_admin_feinschliff_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 5: Admin-Feinschliff.
// Ergänzt admin_test.ts um die neuen Punkte dieser Sitzung:
//   * jede Aktion aktualisiert sofort ohne Neuladen (Cache + renderAllesNeu),
//   * Reiter Anfragen/Zahlungen/Studios/Zertifikate zeigen echte Felder,
//   * Vollständigkeit kommt aus EINER Zahl (PROFIL_FELDER_GESAMT),
//   * Darstellung am Handy (Panel Vollbild, kein Querscroll).
//
// Aufruf:  deno test --allow-read gp05_admin_feinschliff_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("./admin.html", import.meta.url));

Deno.test("Sperren/Entsperren aktualisiert sofort (Cache + renderAllesNeu)", () => {
  // In sperrePerson wird die Markierung im Cache gesetzt und neu gezeichnet.
  assertStringIncludes(html, "if(p) p.gesperrt = !entsperren;");
  const sperre = html.slice(html.indexOf("async function sperrePerson"), html.indexOf("async function loeschePerson"));
  assertStringIncludes(sperre, "renderAllesNeu();");
});

Deno.test("Freigeben aktualisiert sofort (t.aktiv im Cache + renderAllesNeu)", () => {
  const akt = html.slice(html.indexOf("async function activateTrainer"), html.indexOf("async function activateTrainer") + 900);
  assertStringIncludes(akt, "if(t) t.aktiv = true;");
  assertStringIncludes(akt, "renderAllesNeu();");
});

Deno.test("Löschen entfernt sofort aus dem Cache", () => {
  assertStringIncludes(html, "window.allTrainers = (window.allTrainers || []).filter(x => String(x.id) !== String(id));");
  assertStringIncludes(html, "window.allKunden = (window.allKunden || []).filter(x => String(x.id) !== String(id));");
});

Deno.test("Reiter Anfragen/Zahlungen/Studios/Zertifikate werden geladen", () => {
  for (const fn of ["ladeAnfragenListe(", "ladeZahlungen(", "ladeStudios(", "ladeZertifikate("]) {
    assertStringIncludes(html, "function " + fn);
  }
});

Deno.test("Zahlungen-Reiter zeigt echte Felder und fängt fehlende Tabelle ab", () => {
  const z = html.slice(html.indexOf("function ladeZahlungen"), html.indexOf("function ladeZahlungen") + 1500);
  assertStringIncludes(z, "verarbeitet_am");
  // Hinweis statt Absturz, falls die Tabelle/Migration fehlt.
  assert(/Migration|nicht eingespielt|noch nicht/i.test(z), "Zahlungen-Reiter ohne Migrationshinweis");
});

Deno.test("Studios-Reiter zeigt Slug, Veröffentlicht-Status und Einladungsschlüssel", () => {
  const s = html.slice(html.indexOf("function ladeStudios"), html.indexOf("function ladeStudios") + 2500);
  assertStringIncludes(s, "slug");
  assertStringIncludes(s, "veroeffentlicht");
  assertStringIncludes(s, "einladungs_schluessel");
});

Deno.test("Vollständigkeit: EINE Zahl PROFIL_FELDER_GESAMT = 8, Foto zählt", () => {
  assertStringIncludes(html, "const PROFIL_FELDER_GESAMT = 8;");
  assertStringIncludes(html, "fehlt.push('Foto');");
});

Deno.test("Handy: Panel Vollbild, kein Querscroll", () => {
  assertStringIncludes(html, "body{overflow-x:hidden}");
  assertStringIncludes(html, ".panel{max-width:100%}");
});

Deno.test("Aktionen laufen über die abgesicherte Edge Function, Löschen mit Namen", () => {
  assertStringIncludes(html, "vexfit-automation/admin-aktion");
  assertStringIncludes(html, "ok.disabled = eingabe.value.trim() !== opt.nameZumTippen.trim();");
});
