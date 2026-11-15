// /Users/js/Projekte/Vexfit/app/vexfit/p1_anon_intern_test.ts
//
// Nachtlauf 15.11.2026 – P1-Härtung: interne Tabellen gegen anon abschotten
// (Migration 2026-11-15-01). Geprüft (reine Dateien/Funktionen, kein Netz):
//   * die Migration entzieht anon das Lesen von admin_protokoll und
//     trichter_ereignisse, BEHÄLT aber das Trichter-INSERT (sonst bricht das
//     anonyme Seitenaufruf-Tracking),
//   * die Rücknahme stellt genau diesen Lesezugriff wieder her,
//   * das Live-Prüfskript prüft anon-SELECT auf die internen Tabellen,
//   * der Trichter-Beacon kommt ohne SELECT aus (POST, return=minimal) und
//     übersteht den Entzug,
//   * der Abendbericht zählt den Trichter weiter (service_role, von anon-Grants
//     unabhängig).
//
// Aufruf:  deno test --allow-read p1_anon_intern_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { abendberichtZahlenHolen } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const JETZT = Date.parse("2026-11-15T12:00:00Z");

Deno.test("P1: Migration entzieht anon das Lesen, behält aber Trichter-INSERT", async () => {
  const m = await lies("./migrations/2026-11-15-01-anon-intern-abschotten.sql");
  // admin_protokoll: anon komplett abgeschottet.
  assertStringIncludes(m, "REVOKE ALL ON public.admin_protokoll FROM anon");
  // trichter_ereignisse: Lesen/Ändern weg ...
  assertStringIncludes(
    m,
    "REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.trichter_ereignisse FROM anon",
  );
  // ... aber INSERT bleibt (Tracking).
  assertStringIncludes(m, "GRANT INSERT ON public.trichter_ereignisse TO anon");
  // Kein REVOKE, das dem Trichter das INSERT nimmt.
  assert(
    !/REVOKE[^;]*INSERT[^;]*trichter_ereignisse/i.test(m),
    "Migration darf dem Trichter das INSERT nicht entziehen",
  );
  // Vorsorge-Liste deckt weitere interne Objekte ab.
  for (const obj of ["public.such_eingaben", "public.wuensche", "public.warteliste", "public.anfragen_sichtbar"]) {
    assertStringIncludes(m, obj);
  }
});

Deno.test("P1: Rücknahme stellt den anon-Lesezugriff wieder her", async () => {
  const r = await lies("./migrations/ruecknahmen/2026-11-15-01-anon-intern-abschotten-ruecknahme.sql");
  assertStringIncludes(r, "GRANT SELECT ON public.admin_protokoll TO anon");
  assertStringIncludes(r, "GRANT SELECT ON public.trichter_ereignisse TO anon");
});

Deno.test("P1: Prüfskript prüft anon-SELECT auf interne Tabellen", async () => {
  const s = await lies("./werkzeuge/pruef-anon-rest.mjs");
  assertStringIncludes(s, "admin_protokoll");
  assertStringIncludes(s, "trichter_ereignisse");
  // Der Fall h) verlangt einen Fehlerstatus (nicht 200) und keine Zeile.
  assertStringIncludes(s, "res.status !== 200 && zeilen === 0");
});

Deno.test("P1: Trichter-Beacon kommt ohne SELECT aus (POST + return=minimal)", async () => {
  for (const datei of ["./vexfit-trichter.js", "./trainer.html", "./registrieren.html"]) {
    const t = await lies(datei);
    assertStringIncludes(t, "/rest/v1/trichter_ereignisse");
    assert(/method:\s*['"]POST['"]/.test(t), `${datei}: Trichter-Beacon ist kein POST`);
    assertStringIncludes(t, "return=minimal");
  }
});

Deno.test("P1: Abendbericht zählt den Trichter weiter (service_role)", async () => {
  const leser = <T>(pfad: string): Promise<T[]> => {
    if (pfad.startsWith("trichter_ereignisse")) {
      return Promise.resolve([
        { stufe: "seite", rolle: "trainer", quelle: "meta" },
        { stufe: "seite", rolle: "trainer", quelle: "meta" },
      ] as unknown as T[]);
    }
    return Promise.resolve([] as T[]);
  };
  const z = await abendberichtZahlenHolen(leser, () => Promise.resolve(0), JETZT);
  const meta = z.trichter24h.find((q) => q.quelle === "meta");
  assert(meta, "Trichter-Herkunft meta fehlt");
  assertEquals(meta.seite, 2);
});
