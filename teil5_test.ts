// /Users/js/Projekte/Vexfit/app/vexfit/teil5_test.ts
//
// Teil 5 - Stripe: Zuordnung und abgelehnte Anfragen. Ergaenzt die Pruefungen
// in supabase/functions/vexfit-automation/kern_test.ts (Zuordnung ueber
// client_reference_id, kein Treffer -> Mail an Jakob + nicht vermerkt,
// abgelehnte Anfrage uebersprungen).
//
// Aufruf:  deno test --allow-read teil5_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import {
  LINK_ERSTE,
  zahlungslink,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("zahlungslink haengt client_reference_id und prefilled_email an", () => {
  const url = zahlungslink(LINK_ERSTE, {
    id: "t-9",
    email: "Max@Beispiel.DE",
  });
  assertStringIncludes(url, LINK_ERSTE + "?");
  assertStringIncludes(url, "client_reference_id=t-9");
  assertStringIncludes(url, "prefilled_email=Max%40Beispiel.DE");
});

Deno.test("Function: E-Mail-Suche ohne Gross-/Kleinschreibung (ilike)", async () => {
  const idx = await lies("./supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(idx, "trainers?email=ilike.");
});

Deno.test("Function: aelteste offene Anfrage laesst abgelehnte aus", async () => {
  const idx = await lies("./supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(idx, "status.neq.abgelehnt");
});

Deno.test("Zahlungslinks auf den Seiten tragen client_reference_id", async () => {
  const tb = await lies("./trainer-bereich.html");
  assert(tb.includes("client_reference_id="), "trainer-bereich.html ohne client_reference_id");
  const adm = await lies("./admin.html");
  assert(adm.includes("client_reference_id="), "admin.html ohne client_reference_id");
});
