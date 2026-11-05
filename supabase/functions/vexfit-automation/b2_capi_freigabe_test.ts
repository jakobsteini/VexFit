// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/b2_capi_freigabe_test.ts
//
// Dauerlauf 05./06.11.2026 – B2: Die serverseitige Meta Conversions API darf
// erst senden, wenn die Datenschutzerklärung die Übermittlung nennt. Bis dahin
// BLOCK: ein ausdrücklicher Freigabe-Schalter (META_CAPI_AKTIV) muss gesetzt
// sein – sonst geht nichts an Meta, auch wenn der Token da ist.
//
// Aufruf:  deno test --allow-read supabase/functions/vexfit-automation/b2_capi_freigabe_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { capiFreigeschaltet } from "./kern.ts";

Deno.test("B2: ohne Freigabe (Standard) ist die Conversions API aus", () => {
  assertEquals(capiFreigeschaltet(undefined), false);
  assertEquals(capiFreigeschaltet(null), false);
  assertEquals(capiFreigeschaltet(""), false);
  assertEquals(capiFreigeschaltet("nein"), false);
  assertEquals(capiFreigeschaltet("0"), false);
  assertEquals(capiFreigeschaltet("false"), false);
});

Deno.test("B2: nur ausdrückliche Freigabe schaltet ein", () => {
  assertEquals(capiFreigeschaltet("ja"), true);
  assertEquals(capiFreigeschaltet("JA"), true);
  assertEquals(capiFreigeschaltet(" ja "), true);
  assertEquals(capiFreigeschaltet("true"), true);
  assertEquals(capiFreigeschaltet("1"), true);
});

Deno.test("B2: index.ts prüft den Freigabe-Schalter VOR dem Senden", async () => {
  const idx = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(idx.includes('capiFreigeschaltet(Deno.env.get("META_CAPI_AKTIV"))'),
    "META_CAPI_AKTIV-Prüfung fehlt in metaConversion");
  // Die Prüfung steht vor dem Token/Netz-Zweig.
  const i = idx.indexOf("META_CAPI_AKTIV");
  const j = idx.indexOf("graph.facebook.com");
  assert(i !== -1 && j !== -1 && i < j, "Freigabe-Prüfung nicht vor dem Netz-Aufruf");
});

Deno.test("B2: Entwurf der Datenschutz-Klausel liegt als Datei vor (BLOCK dokumentiert)", async () => {
  const txt = await Deno.readTextFile(
    new URL("../../../docs/recht/entwurf-meta-capi-2026-11-06.md", import.meta.url),
  );
  assert(txt.includes("Conversions API"));
  assert(txt.toLowerCase().includes("gehasht") || txt.toLowerCase().includes("verschlüsselt"));
  assert(txt.includes("META_CAPI_AKTIV"));
});
