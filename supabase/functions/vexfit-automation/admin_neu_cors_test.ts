// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/admin_neu_cors_test.ts
//
// Admin-Dashboard neu, Teil 0 (Sofort-Fix): der Preflight (OPTIONS) muss den
// Authorization-Kopf erlauben, sonst scheitert jede Admin-Aktion im Browser mit
// "Failed to fetch". Die Herkunft bleibt streng https://vexfit.app: fuer eine
// fremde Herkunft darf KEIN CORS-Kopf zurueckkommen.
//
// Aufruf:  deno test --allow-read supabase/functions/vexfit-automation/admin_neu_cors_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { corsKopf, ERLAUBTE_HERKUNFT } from "./kern.ts";

Deno.test("Teil 0: Preflight der erlaubten Herkunft erlaubt authorization", () => {
  const kopf = corsKopf(ERLAUBTE_HERKUNFT);
  const erlaubt = (kopf["Access-Control-Allow-Headers"] || "").toLowerCase();
  assertStringIncludes(erlaubt, "authorization");
  assertStringIncludes(erlaubt, "content-type");
  assertEquals(kopf["Access-Control-Allow-Origin"], ERLAUBTE_HERKUNFT);
});

Deno.test("Teil 0: fremde Herkunft bekommt keinen CORS-Kopf", () => {
  const kopf = corsKopf("https://boese.example");
  assertEquals(Object.keys(kopf).length, 0, "fremde Herkunft darf keinen CORS-Kopf erhalten");
});

Deno.test("Teil 0: fehlende Herkunft (null, z. B. Stripe) bekommt keinen CORS-Kopf", () => {
  assertEquals(Object.keys(corsKopf(null)).length, 0);
});

Deno.test("Teil 0: der Preflight-Pfad aus bearbeiten liefert 204 mit den CORS-Koepfen", async () => {
  // OPTIONS auf die Funktion: 204 und, bei erlaubter Herkunft, authorization im Kopf.
  const { bearbeiten } = await import("./kern.ts");
  const unbenutzt = (name: string) => () => { throw new Error(`${name} nicht erwartet`); };
  // Fuer OPTIONS wird kein Anschluss aufgerufen; ein Attrappen-Objekt reicht.
  // deno-lint-ignore no-explicit-any
  const a: any = new Proxy({}, { get: (_t, p) => unbenutzt(String(p)) });
  const res = await bearbeiten(
    new Request("https://x/functions/v1/vexfit-automation/admin-aktion", {
      method: "OPTIONS",
      headers: { Origin: ERLAUBTE_HERKUNFT },
    }),
    a,
  );
  assertEquals(res.status, 204);
  assert(
    (res.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"),
    "Preflight-Antwort muss authorization erlauben",
  );
});
