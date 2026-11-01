// /Users/js/Projekte/Vexfit/app/vexfit/gp08_zahlungslink_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 8 (optionaler Admin-Reiter): „Zahlungslink
// offen" – freigeschaltete Trainer mit angenommener Anfrage, die noch nicht
// bezahlt haben. Nur lesend, aus vorhandenen Daten.
//
// Aufruf:  deno test --allow-read gp08_zahlungslink_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("./admin.html", import.meta.url));

Deno.test("Reiter 'Zahlungslink offen' vorhanden (Tab + Inhalt + Lader)", () => {
  assertStringIncludes(html, "showTab('zahlungslink', this)");
  assertStringIncludes(html, 'id="tab-zahlungslink"');
  assertStringIncludes(html, 'id="zahlungslink-tbody"');
  assertStringIncludes(html, "function ladeZahlungslinkOffen(");
});

Deno.test("Zahlungslink-Filter: angenommene Anfrage + nicht bezahlt + aktiv", () => {
  const fn = html.slice(html.indexOf("async function ladeZahlungslinkOffen"), html.indexOf("async function ladeZahlungslinkOffen") + 1400);
  assertStringIncludes(fn, "status=eq.angenommen");
  assertStringIncludes(fn, "t.aktiv && !t.stripe_bezahlt && mitAngenommen.has(t.id)");
});

Deno.test("Lader wird mitgeladen (renderAllesNeu/loadData)", () => {
  assertStringIncludes(html, "ladeZahlungslinkOffen();");
});
