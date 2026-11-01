// /Users/js/Projekte/Vexfit/app/vexfit/gp08_zahlungslink_test.ts
//
// Gesamtprüfung, Teil 8 (Admin-Reiter): „Zahlungslink offen" – freigeschaltete
// Trainer mit angenommener Anfrage, die noch nicht bezahlt haben. Nur lesend,
// aus vorhandenen Daten. Jetzt in der neuen Verwaltungsseite.
//
// Aufruf:  deno test --allow-read gp08_zahlungslink_test.ts
import { assertStringIncludes } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html", import.meta.url));
const js = await Deno.readTextFile(new URL("./vexfit-verwaltung.js", import.meta.url));

Deno.test("Reiter 'Zahlungen' enthält den Block 'Zahlungslink offen'", () => {
  assertStringIncludes(html, 'id="tab-zahlungen"');
  assertStringIncludes(html, 'id="zahlungslink-tbody"');
  assertStringIncludes(html, "Zahlungslink offen");
  assertStringIncludes(js, "function ladeZahlungslinkOffen(");
});

Deno.test("Zahlungslink-Filter: angenommene Anfrage + nicht bezahlt + aktiv", () => {
  const i = js.indexOf("async function ladeZahlungslinkOffen");
  const fn = js.slice(i, i + 1400);
  assertStringIncludes(fn, "status=eq.angenommen");
  assertStringIncludes(fn, "t.aktiv && !t.stripe_bezahlt && mitAng.has(t.id)");
});

Deno.test("Lader wird beim Laden der Daten mitgezogen", () => {
  assertStringIncludes(js, "ladeZahlungslinkOffen();");
});
