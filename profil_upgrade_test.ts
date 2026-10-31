// /Users/js/Projekte/Vexfit/app/vexfit/profil_upgrade_test.ts
//
// Baustein 2 (Profil-Upgrade, 31.10.2026). Prueft Migration und Seiten ohne
// Browser/DB. Die Video-Erkennung selbst hat eine eigene Pruefung
// (vexfit-video_test.ts).
//
// Aufruf:  deno test --allow-read profil_upgrade_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Migration: neue Spalten, Rechte, Sicht ohne Zertifikat, Storage-Behaelter", async () => {
  const sql = await lies("./migrations/2026-10-31-02-profil-upgrade.sql");
  for (const sp of ["video_url", "sprachen", "trainingsorte", "galerie", "zertifikat_datei"]) {
    assertStringIncludes(sql, "ADD COLUMN " + sp);
  }
  // UPDATE-Recht fuer die Profilspalten.
  assertStringIncludes(sql, "GRANT UPDATE (video_url, sprachen, trainingsorte, galerie, zertifikat_datei)");
  // Sicht enthaelt die oeffentlichen neuen Spalten, aber NICHT zertifikat_datei.
  const sicht = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW"));
  assertStringIncludes(sicht, "video_url, sprachen, trainingsorte, galerie");
  assert(!sicht.includes("zertifikat_datei"), "zertifikat_datei steckt in der oeffentlichen Sicht");
  // Zwei Behaelter: galerie oeffentlich, zertifikate privat.
  assertStringIncludes(sql, "('galerie', 'galerie', true)");
  assertStringIncludes(sql, "('zertifikate', 'zertifikate', false)");
  // Zertifikate nur Eigentuemer ODER Admin lesen.
  assertStringIncludes(sql, "ist_vexfit_admin()");
  // Galerie-Schreibrecht nur im eigenen Ordner.
  assertStringIncludes(sql, "(storage.foldername(name))[1] = auth.uid()::text");
});

Deno.test("Ruecknahme entfernt Spalten, Behaelter, Regeln und setzt die Sicht zurueck", async () => {
  const sql = await lies("./migrations/2026-10-31-02-profil-upgrade-ruecknahme.sql");
  for (const sp of ["video_url", "sprachen", "trainingsorte", "galerie", "zertifikat_datei"]) {
    assertStringIncludes(sql, "DROP COLUMN IF EXISTS " + sp);
  }
  assertStringIncludes(sql, "DELETE FROM storage.buckets WHERE id = 'galerie'");
  assertStringIncludes(sql, "DROP POLICY IF EXISTS \"galerie_oeffentlich_lesen\"");
});

Deno.test("profil-bearbeiten.html: Video-Pruefung blockiert Speichern, neue Felder vorhanden", async () => {
  const html = await lies("./profil-bearbeiten.html");
  assertStringIncludes(html, "vexfit-video.js");
  // Ungueltiger Video-Link blockiert das Speichern.
  assertStringIncludes(html, "if(videoWert && !videoErkannt)");
  // Galerie-Verkleinerung: max. 1600 px und 400 KB.
  assertStringIncludes(html, "bildVerkleinern(f, 1600, 400 * 1024)");
  // Zertifikat in den privaten Behaelter.
  assertStringIncludes(html, "/storage/v1/object/zertifikate/");
  // Galerie in den eigenen Ordner.
  assertStringIncludes(html, "/storage/v1/object/galerie/");
  // Neue erweiterte Spezialisierungen.
  for (const s of ["Schwimmen", "Boxen und Kampfsport", "Kinder und Jugendliche"]) {
    assertStringIncludes(html, s);
  }
  // Neue Fortschritts-Punkte.
  for (const d of ["dotVideo", "dotSprachen", "dotOrte", "dotGalerie", "dotZert"]) {
    assertStringIncludes(html, d);
  }
});

Deno.test("profil.html: bettet Video ein, zeigt Sprachen/Orte/Galerie, Galerie-Herkunft geprueft", async () => {
  const html = await lies("./profil.html");
  assertStringIncludes(html, "vexfit-video.js");
  assertStringIncludes(html, "vexVideo.erkenne(t.video_url");
  // Galerie nur aus dem eigenen oeffentlichen Behaelter.
  assertStringIncludes(html, "/storage/v1/object/public/galerie/");
  assertStringIncludes(html, "u.indexOf(GALERIE_PREFIX) === 0");
  // Neue Spalten werden geladen.
  assertStringIncludes(html, "video_url,sprachen,trainingsorte,galerie");
});

Deno.test("suche.html: Filter nach Sprache und Trainingsort", async () => {
  const html = await lies("./suche.html");
  assertStringIncludes(html, "spracheFilter");
  assertStringIncludes(html, "ortFilter");
  assertStringIncludes(html, "function anwendenFilter()");
  // Lade-Spalten enthalten sprachen/trainingsorte.
  assertStringIncludes(html, "avatar_url,sprachen,trainingsorte");
});
