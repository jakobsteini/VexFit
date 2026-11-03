// /Users/js/Projekte/Vexfit/app/vexfit/admin_login_schleife_test.ts
//
// Admin-Login-Schleife (Dauerlauf 2026-11-03): nach dem Login führte ein 403
// (fehlendes Spalten-Leserecht auf anfragen.beantwortet_am) zum Rauswurf, weil
// hole() bei 401 UND 403 abmeldete. Dieser Test sichert das Verhalten ab.
//
// Aufruf:  deno test --allow-read admin_login_schleife_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  bereichFehlerText,
  bereicheLaden,
  KEIN_RECHT_TEXT,
  mussAbmelden,
} from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// hole() wie in der echten Datei: 401 meldet ab (wirft), sonst Antwortobjekt.
function holeWie(status: number, abgemeldet: { wert: boolean }) {
  if (mussAbmelden(status)) { abgemeldet.wert = true; throw new Error("abgemeldet"); }
  return { ok: status < 400, status };
}

Deno.test("mussAbmelden: nur 401 meldet ab, 403/200/500 nicht", () => {
  assertEquals(mussAbmelden(401), true);
  assertEquals(mussAbmelden(403), false);
  assertEquals(mussAbmelden(200), false);
  assertEquals(mussAbmelden(500), false);
});

Deno.test("bereichFehlerText: 403 = Rechte-Hinweis, sonst allgemein", () => {
  assertEquals(bereichFehlerText(403), KEIN_RECHT_TEXT);
  assert(bereichFehlerText(404) !== KEIN_RECHT_TEXT);
  assert(bereichFehlerText(500) !== KEIN_RECHT_TEXT);
});

Deno.test("403 in einem Bereich: zeigt den Hinweis, übrige Bereiche laden, kein Abmelden", async () => {
  const abgemeldet = { wert: false };
  const anzeige: Record<string, string> = {};
  const bereiche = [
    {
      name: "heute", // der Bereich, der live 403 bekam (beantwortet_am)
      laden: () => {
        const r = holeWie(403, abgemeldet);
        anzeige.heute = r.ok ? "daten" : bereichFehlerText(r.status);
      },
    },
    { name: "anfragen", laden: () => { const r = holeWie(200, abgemeldet); anzeige.anfragen = r.ok ? "daten" : bereichFehlerText(r.status); } },
    { name: "zahlungen", laden: () => { const r = holeWie(200, abgemeldet); anzeige.zahlungen = r.ok ? "daten" : bereichFehlerText(r.status); } },
  ];
  const erg = await bereicheLaden(bereiche);
  assertEquals(abgemeldet.wert, false);            // 403 meldet NICHT ab
  assertEquals(anzeige.heute, KEIN_RECHT_TEXT);    // Bereich zeigt den Hinweis
  assertEquals(anzeige.anfragen, "daten");         // übrige Bereiche laden normal
  assertEquals(anzeige.zahlungen, "daten");
  assertEquals(erg, { heute: true, anfragen: true, zahlungen: true });
});

Deno.test("401 meldet ab; bereicheLaden isoliert einen werfenden Bereich, die anderen laufen", async () => {
  const abgemeldet = { wert: false };
  const gelaufen: string[] = [];
  const erg = await bereicheLaden([
    { name: "wirft", laden: () => { gelaufen.push("wirft"); holeWie(401, abgemeldet); } },
    { name: "a", laden: () => { gelaufen.push("a"); } },
    { name: "b", laden: () => { gelaufen.push("b"); } },
  ]) as Record<string, boolean>;
  assertEquals(abgemeldet.wert, true);   // 401 = Sitzung endet (global, korrekt)
  assertEquals(erg.wirft, false);        // werfender Bereich isoliert
  assertEquals(erg.a, true);
  assertEquals(erg.b, true);
  assertEquals(gelaufen.sort(), ["a", "b", "wirft"]);
});

Deno.test("Verdrahtung: hole() prüft nur 401, Service-Worker-Cache v2", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "if (mussAbmelden(r.status))");
  assert(!js.includes("r.status === 401 || r.status === 403"), "403 darf nicht mehr abmelden");
  assertStringIncludes(js, "bereicheLaden([");
  const sw = await lies("./sw-verwaltung.js");
  assertStringIncludes(sw, "vexfit-admin-huelle-v2");
});

Deno.test("Migration 05: GRANT SELECT (beantwortet_am) auf anfragen, nur Datei", async () => {
  const sql = await lies("./migrations/2026-11-03-05-anfragen-beantwortet-am-lesen.sql");
  assertStringIncludes(sql, "GRANT SELECT (beantwortet_am) ON public.anfragen TO authenticated");
  assertStringIncludes(sql, "NICHT eingespielt");
  const rueck = await lies("./migrations/ruecknahmen/2026-11-03-05-anfragen-beantwortet-am-lesen-ruecknahme.sql");
  assertStringIncludes(rueck, "REVOKE SELECT (beantwortet_am) ON public.anfragen FROM authenticated");
});
