// /Users/js/Projekte/Vexfit/app/vexfit/b5_admin_test.ts
//
// B5 (Dauerlauf 2026-11-03): Admin-Seite (Abo-Status im Zahlungen-Reiter) und
// die Migration für die Abo-Spalten.
//
// Aufruf:  deno test --allow-read b5_admin_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { aboStatusLabel } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("B5.3: Abo-Status-Beschriftungen", () => {
  assertEquals(aboStatusLabel("aktiv"), "Aktiv");
  assertEquals(aboStatusLabel("zahlung_fehlgeschlagen"), "Zahlung fehlgeschlagen");
  assertEquals(aboStatusLabel("gekuendigt"), "Gekündigt");
  assertEquals(aboStatusLabel(undefined), "–");
});

Deno.test("B5.3: Zahlungen-Reiter zeigt Abo-Status je Trainer", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, "Abo-Status je Trainer");
  assertStringIncludes(html, 'id="abo-status-tbody"');
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function renderAboStatus()");
  assertStringIncludes(js, "t.abo_status_am"); // Datum wird angezeigt
});

Deno.test("B5: Migration legt die Abo-Spalten NUR als Datei an", async () => {
  const sql = await lies("./migrations/2026-11-03-03-abo-abrechnung.sql");
  assertStringIncludes(sql, "ADD COLUMN IF NOT EXISTS stripe_customer_id text");
  assertStringIncludes(sql, "abo_status");
  assertStringIncludes(sql, "abo_status_am");
  assertStringIncludes(sql, "NICHT eingespielt");
  assert(!/\bGRANT\b|\bCREATE POLICY\b/i.test(sql), "keine Rechte-/Policy-Lockerung erwartet");
});
