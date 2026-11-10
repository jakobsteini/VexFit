// /Users/js/Projekte/Vexfit/app/vexfit/b3_trichter_test.ts
//
// Dauerlauf 05./06.11.2026 – B3: Trichter messen. Geprüft:
//   * reine Aggregation trichterNachQuelle (7 Tage, je Herkunft, 5 Stufen),
//   * registrieren.html feuert die Beacons (seite/formular/abgesendet/
//     bestaetigt) und verrät dabei keine Personendaten,
//   * strukturierte Herkunft (Quelle/Kampagne/Inhalt/Browser) wird getrennt
//     nachgetragen,
//   * die Migration + Rücknahme liegen als Dateien vor.
//
// Aufruf:  deno test --allow-read b3_trichter_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { TRICHTER_STUFEN, trichterNachQuelle } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("B3: trichterNachQuelle zählt je Herkunft und Stufe, alte Ereignisse fallen raus", () => {
  const jetzt = Date.parse("2026-11-06T12:00:00Z");
  const e = (stufe: string, quelle: string | null, tagVor: number) => ({
    stufe, quelle, erstellt_am: new Date(jetzt - tagVor * 86400000).toISOString(),
  });
  const daten = [
    e("seite", "meta", 0), e("seite", "meta", 1), e("formular", "meta", 0),
    e("abgesendet", "meta", 0), e("bestaetigt", "meta", 0),
    e("seite", null, 0),            // ohne Quelle -> direkt/unbekannt
    e("seite", "meta", 9),          // älter als 7 Tage -> ignoriert
    e("quatsch" as string, "meta", 0), // unbekannte Stufe -> ignoriert
  ];
  const r = trichterNachQuelle(daten, jetzt, 7) as {
    gesamt: Record<string, number>;
    quellen: Record<string, Record<string, number>>;
  };
  assertEquals(r.quellen["meta"].seite, 2);
  assertEquals(r.quellen["meta"].formular, 1);
  assertEquals(r.quellen["meta"].abgesendet, 1);
  assertEquals(r.quellen["meta"].bestaetigt, 1);
  assertEquals(r.quellen["direkt/unbekannt"].seite, 1);
  assertEquals(r.gesamt.seite, 3);
  assertEquals(r.gesamt.profil5, 0);
});

Deno.test("B3: fünf Stufen in Reihenfolge", () => {
  assertEquals(TRICHTER_STUFEN, ["seite", "formular", "abgesendet", "bestaetigt", "profil5"]);
});

Deno.test("B3: registrieren.html feuert alle vier Browser-Stufen", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, "function trichterBeacon(");
  assertStringIncludes(s, "trichterBeacon('seite'");
  assertStringIncludes(s, "trichterBeacon('formular'");
  assertEquals((s.match(/trichterBeacon\('abgesendet'/g) || []).length, 2); // Trainer + Kunde
  assertEquals((s.match(/trichterBeacon\('bestaetigt'/g) || []).length, 2);
});

Deno.test("B3: Beacon überträgt nur Kampagnen-Kennungen + Browsertyp, keine Personendaten", async () => {
  const s = await lies("./registrieren.html");
  const i = s.indexOf("function trichterBeacon(");
  // Genau den Beacon-Körper betrachten (bis zur nächsten Funktion), nicht in
  // herkunftStrukturNachtragen hineinlaufen (das hat einen Parameter „email").
  const ende = s.indexOf("herkunftStrukturNachtragen", i);
  const f = s.slice(i, ende > i ? ende : i + 700);
  assertStringIncludes(f, "trichter_ereignisse");
  assertStringIncludes(f, "quelle: VEXFIT_WERBUNG.utm_source");
  assertStringIncludes(f, "browsertyp: vexfitBrowserTyp()");
  // E3: Referrer-DOMAIN ist erlaubt (keine Personendaten).
  assertStringIncludes(f, "referrer: VEXFIT_WERBUNG.referrer");
  // Keine E-Mail/Name im Beacon-Körper.
  assert(!/email|vorname|nachname/.test(f), "Beacon enthält Personendaten");
});

Deno.test("B3: strukturierte Herkunft wird getrennt nachgetragen (Trainer + Kunde)", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, "function herkunftStrukturNachtragen(");
  assertEquals((s.match(/herkunftStrukturNachtragen\('trainers'/g) || []).length, 1);
  assertEquals((s.match(/herkunftStrukturNachtragen\('kunden'/g) || []).length, 1);
});

Deno.test("B3: Migration + Rücknahme vorhanden, Tabelle mit RLS und Stufen-CHECK", async () => {
  const m = await lies("./migrations/2026-11-06-01-trichter.sql");
  assertStringIncludes(m, "CREATE TABLE IF NOT EXISTS public.trichter_ereignisse");
  assertStringIncludes(m, "ENABLE ROW LEVEL SECURITY");
  assertStringIncludes(m, "ist_vexfit_admin()");
  assertStringIncludes(m, "'seite','formular','abgesendet','bestaetigt','profil5'");
  const r = await lies("./migrations/ruecknahmen/2026-11-06-01-trichter-ruecknahme.sql");
  assertStringIncludes(r, "DROP TABLE IF EXISTS public.trichter_ereignisse");
});
