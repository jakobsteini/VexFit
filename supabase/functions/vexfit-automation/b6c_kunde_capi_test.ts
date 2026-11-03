// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/b6c_kunde_capi_test.ts
//
// B6c (Dauerlauf 2026-11-03): die Kunden-Registrierung sendet jetzt – wie der
// Trainer-Pfad – ein serverseitiges CompleteRegistration an die Meta Conversions
// API, mit derselben event_id wie das Browser-Pixel (Entdopplung). Meta-Endpunkt
// gemockt (kein Netz).
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  type MetaEreignis,
  sha256Hex,
} from "./kern.ts";

function baue(): { a: Anschluesse; capi: MetaEreignis[]; mails: Mail[] } {
  const capi: MetaEreignis[] = [];
  const mails: Mail[] = [];
  const base: Record<string, unknown> = {
    benutzerAusToken: () => Promise.resolve({ id: "u", email: "kunde@beispiel.at" }),
    mailSenden: (m: Mail) => { mails.push(m); return Promise.resolve(); },
    metaConversion: (e: MetaEreignis) => { capi.push(e); return Promise.resolve({ gesendet: true }); },
    melden: () => {},
  };
  return { a: base as unknown as Anschluesse, capi, mails };
}

function req(koerper: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/neuer-kunde",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer t" }, body: JSON.stringify(koerper) },
  );
}

Deno.test("neuer-kunde: mit Zustimmung + event_id geht das serverseitige Ereignis raus", async () => {
  const { a, capi, mails } = baue();
  const res = await bearbeiten(
    req({ email: "kunde@beispiel.at", vorname: "Mia", nachname: "K", zustimmung: true, event_id: "evt-k7", event_source_url: "https://vexfit.app/registrieren.html?typ=kunde" }),
    a,
  );
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(mails.length, 1); // interne Benachrichtigung geht weiter raus
  assertEquals(capi.length, 1);
  assertEquals(capi[0].event_id, "evt-k7");
  assertEquals(capi[0].event_name, "CompleteRegistration");
  assertEquals(capi[0].user_data.em?.[0], await sha256Hex("kunde@beispiel.at"));
  assertEquals(d.capi.gesendet, true);
});

Deno.test("neuer-kunde: ohne Zustimmung KEIN serverseitiges Ereignis", async () => {
  const { a, capi } = baue();
  const d = await (await bearbeiten(req({ email: "kunde@beispiel.at", zustimmung: false, event_id: "evt-k7" }), a)).json();
  assertEquals(capi.length, 0);
  assertEquals(d.capi.grund, "keine Zustimmung");
});

Deno.test("neuer-kunde: Warteliste (ohne event_id) löst KEIN Ereignis aus", async () => {
  // Der Wartelisten-Aufruf (suche.html) schickt keine event_id – dann nichts.
  const { a, capi } = baue();
  const d = await (await bearbeiten(req({ email: "kunde@beispiel.at", zustimmung: true }), a)).json();
  assertEquals(capi.length, 0);
  assertEquals(d.capi.grund, "keine event_id");
  assert(true);
});
