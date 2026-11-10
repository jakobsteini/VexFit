// /Users/js/Projekte/Vexfit/app/vexfit/e3_herkunft_test.ts
//
// Dauerlauf 10.11.2026 – E3 „Herkunft messen". Geprüft (ohne Netz/DOM):
//   * referrerDomain liefert NUR die Domain (ohne Pfad/Parameter), eigene
//     Domain = kein Verweis,
//   * herkunftEinordnen: utm_source gewinnt, sonst Referrer-Domain grob
//     zugeordnet, ohne beides „direkt",
//   * Server-Spiegel in kern.ts verhält sich gleich,
//   * registrieren.html erfasst/überträgt Referrer + utm_medium,
//   * Migration + Rücknahme liegen als Dateien vor.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { herkunftEinordnen as serverEinordnen } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// vexfit-trichter.js laden (module.exports), ohne Browser.
// deno-lint-ignore no-explicit-any
async function ladeTrichter(): Promise<any> {
  const src = await lies("./vexfit-trichter.js");
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const g: Record<string, unknown> = {};
  new Function("window", "module", "globalThis", src)(g, mod, g);
  return mod.exports;
}

Deno.test("E3: referrerDomain liefert nur die Domain (ohne Pfad/Parameter)", async () => {
  const t = await ladeTrichter();
  assertEquals(t.referrerDomain("https://www.google.com/search?q=personal+trainer", "vexfit.app"), "google.com");
  assertEquals(t.referrerDomain("https://l.instagram.com/?u=abc", "vexfit.app"), "l.instagram.com");
  // eigene Domain = kein externer Verweis.
  assertEquals(t.referrerDomain("https://vexfit.app/suche.html", "vexfit.app"), "");
  assertEquals(t.referrerDomain("https://www.vexfit.app/x", "vexfit.app"), "");
  // leer / unbrauchbar.
  assertEquals(t.referrerDomain("", "vexfit.app"), "");
  assertEquals(t.referrerDomain("kein-url", "vexfit.app"), "");
});

Deno.test("E3: herkunftEinordnen – utm_source gewinnt, sonst Referrer, sonst direkt", async () => {
  const t = await ladeTrichter();
  for (const f of [t.herkunftEinordnen, serverEinordnen]) {
    // utm_source gewinnt und wird normalisiert.
    assertEquals(f({ quelle: "persoenlich" }), "persoenlich");
    assertEquals(f({ quelle: "brief" }), "brief");
    assertEquals(f({ quelle: "ig" }), "instagram");
    assertEquals(f({ quelle: "facebook" }), "meta");
    assertEquals(f({ quelle: "google", referrer: "instagram.com" }), "google"); // Quelle schlägt Referrer
    // ohne Quelle: Referrer grob zuordnen.
    assertEquals(f({ referrer: "www.google.com" }), "google");
    assertEquals(f({ referrer: "instagram.com" }), "instagram");
    assertEquals(f({ referrer: "m.facebook.com" }), "meta");
    assertEquals(f({ referrer: "example.org" }), "example.org");
    // ohne Angaben: direkt.
    assertEquals(f({}), "direkt");
    assertEquals(f({ quelle: "", referrer: "" }), "direkt");
  }
});

Deno.test("E3: registrieren.html erfasst Referrer-Domain und überträgt Referrer + utm_medium", async () => {
  const html = await lies("./registrieren.html");
  // Modul geladen + Referrer-Domain beim ersten Aufruf gemerkt.
  assertStringIncludes(html, 'src="vexfit-trichter.js"');
  assertStringIncludes(html, "window.vexHerkunft.referrerDomain(document.referrer, location.hostname)");
  // strukturierter Nachtrag um Medium + Referrer.
  assertStringIncludes(html, "koerper.herkunft_medium   = VEXFIT_WERBUNG.utm_medium");
  assertStringIncludes(html, "koerper.herkunft_referrer = VEXFIT_WERBUNG.referrer");
  // an die interne Meldung (Trainer + Kunde) weitergereicht.
  assert(
    (html.match(/utm_medium: utmMed, referrer: ref/g) || []).length >= 2,
    "Referrer/Medium nicht an beide internen Meldungen übergeben",
  );
  // anonymer Trichter-Beacon trägt den Referrer.
  assertStringIncludes(html, "referrer: VEXFIT_WERBUNG.referrer||null");
});

Deno.test("E3: Migration + Rücknahme liegen als Dateien vor (nur Datei)", async () => {
  const m = await lies("./migrations/2026-11-10-01-herkunft-referrer.sql");
  assertStringIncludes(m, "trichter_ereignisse ADD COLUMN IF NOT EXISTS referrer");
  // Je zweimal (trainers + kunden) – Ausrichtung/Abstand ignorieren.
  assertEquals((m.match(/ADD COLUMN IF NOT EXISTS herkunft_referrer/g) || []).length, 2);
  assertEquals((m.match(/ADD COLUMN IF NOT EXISTS herkunft_medium/g) || []).length, 2);
  for (const tab of ["public.trainers", "public.kunden"]) assertStringIncludes(m, tab);
  const r = await lies("./migrations/ruecknahmen/2026-11-10-01-herkunft-referrer-ruecknahme.sql");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS referrer");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS herkunft_referrer");
});
