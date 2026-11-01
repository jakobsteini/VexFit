// /Users/js/Projekte/Vexfit/app/vexfit/gp05_admin_feinschliff_test.ts
//
// Admin-Feinschliff, jetzt gegen die neue Verwaltungsseite:
//   * jede Aktion aktualisiert sofort ohne Neuladen (Cache + neuZeichnen),
//   * Reiter Anfragen/Zahlungen/Studios/Zertifikate laden echte Felder,
//   * Vollständigkeit kommt aus EINER Zahl (PROFIL_FELDER_GESAMT),
//   * Darstellung am Handy (Panel Vollbild, Tabellen scrollen in sich).
//
// Aufruf:  deno test --allow-read gp05_admin_feinschliff_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const js = await Deno.readTextFile(new URL("./vexfit-verwaltung.js", import.meta.url));
const html = await Deno.readTextFile(new URL("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html", import.meta.url));

Deno.test("Sperren aktualisiert sofort (Cache + neuZeichnen)", () => {
  const sperre = js.slice(js.indexOf("async function sperren("), js.indexOf("async function kicken("));
  assertStringIncludes(sperre, "p.gesperrt = !ent;");
  assertStringIncludes(sperre, "neuZeichnen();");
});

Deno.test("Freigeben aktualisiert sofort (t.aktiv im Cache + neuZeichnen)", () => {
  const f = js.slice(js.indexOf("async function freigeben("), js.indexOf("async function freigeben(") + 700);
  assertStringIncludes(f, "t.aktiv = true;");
  assertStringIncludes(f, "neuZeichnen();");
});

Deno.test("Kicken entfernt sofort aus dem Cache", () => {
  const k = js.slice(js.indexOf("async function kicken("), js.indexOf("async function kicken(") + 1200);
  assertStringIncludes(k, "daten.trainers = daten.trainers.filter((x) => String(x.id) !== String(id));");
  assertStringIncludes(k, "daten.kunden = daten.kunden.filter((x) => String(x.id) !== String(id));");
});

Deno.test("Reiter Anfragen/Zahlungen/Studios/Zertifikate werden geladen", () => {
  for (const fn of ["ladeAnfragen(", "ladeZahlungen(", "ladeStudios(", "ladeZertifikate("]) {
    assertStringIncludes(js, "function " + fn);
  }
});

Deno.test("Zahlungen-Reiter zeigt echte Felder und fängt fehlende Tabelle ab", () => {
  const z = js.slice(js.indexOf("async function ladeZahlungen"), js.indexOf("async function ladeZahlungen") + 1200);
  assertStringIncludes(z, "verarbeitet_am");
  assert(/Migration|nicht eingespielt|nicht freigeschaltet/i.test(z), "Zahlungen-Reiter ohne Migrationshinweis");
});

Deno.test("Studios-Reiter zeigt Slug, Veröffentlicht-Status und Einladungsschlüssel", () => {
  assertStringIncludes(js, "function ladeStudios");
  assertStringIncludes(js, ".slug");
  assertStringIncludes(js, "veroeffentlicht");
  assertStringIncludes(js, "einladungs_schluessel");
});

Deno.test("Vollständigkeit: EINE Zahl PROFIL_FELDER_GESAMT = 8, Foto zählt", () => {
  assertStringIncludes(js, "PROFIL_FELDER_GESAMT = 8");
  assertStringIncludes(js, 'fehlt.push("Foto")');
});

Deno.test("Handy: Panel am Handy voll, Tabellen scrollen in sich (kein Querscroll)", () => {
  assertStringIncludes(html, "overflow-x:auto");
  assertStringIncludes(html, "max-width:520px");
});

Deno.test("Aktionen laufen über die Edge Function; Kicken = EIN Dialog ohne Namen-Eintippen", () => {
  assertStringIncludes(js, "vexfit-automation/admin-aktion");
  assertStringIncludes(js, "Ja, endgültig löschen");
  assert(!/nameZumTippen/.test(js), "Kicken verlangt noch das Eintippen des Namens");
});
