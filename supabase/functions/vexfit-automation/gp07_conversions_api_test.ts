// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/gp07_conversions_api_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 7: Conversions API (serverseitiges
// CompleteRegistration). Meta-Endpunkt gemockt (kein Netz). Geprüft:
//   * E-Mail wird SHA-256, kleingeschrieben, getrimmt gehasht,
//   * event_id wird durchgereicht (Entdopplung), action_source "website",
//     event_source_url dabei,
//   * nur mit Zustimmung UND event_id wird gesendet,
//   * fehlt der Anschluss (altes Deployment), bricht nichts.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  type MetaEreignis,
  metaEreignisBauen,
  sha256Hex,
} from "./kern.ts";

function baue(opt: { ohneCapi?: boolean } = {}): { a: Anschluesse; capi: MetaEreignis[]; mails: Mail[] } {
  const capi: MetaEreignis[] = [];
  const mails: Mail[] = [];
  const base: Record<string, unknown> = {
    benutzerAusToken: () => Promise.resolve({ id: "u", email: "neu@beispiel.at" }),
    mailSenden: (m: Mail) => { mails.push(m); return Promise.resolve(); },
    melden: () => {},
  };
  if (!opt.ohneCapi) {
    base.metaConversion = (e: MetaEreignis) => { capi.push(e); return Promise.resolve({ gesendet: true }); };
  }
  const fehlt = (n: string) => () => { throw new Error(`${n} nicht erwartet`); };
  for (const n of ["trainerNachId","trainerNachEmail","aeltesteOffeneAnfrage","trainerBezahltMarkieren","anfrageWeitergeleitetMarkieren","stripeEreignis","ereignisSchonVerarbeitet","ereignisVermerken","anfragenAnzahlSeit","spamProEmailSeit","spamProIpSeit","spamEintragVormerken","adminTrainerSetzen","adminZeileLoeschen"]) {
    base[n] = fehlt(n);
  }
  return { a: base as unknown as Anschluesse, capi, mails };
}

function req(koerper: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/neuer-trainer",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer t" }, body: JSON.stringify(koerper) },
  );
}

Deno.test("sha256Hex: E-Mail klein/getrimmt ergibt denselben Hash", async () => {
  const a = await sha256Hex("foo@bar.com");
  const b = await metaEreignisBauen({ email: "  Foo@BAR.com ", event_id: "x" });
  assertEquals(b.user_data.em?.[0], a);
  // SHA-256 ist 64 Hex-Zeichen.
  assertEquals(a.length, 64);
});

Deno.test("metaEreignisBauen: Pflichtfelder", async () => {
  const e = await metaEreignisBauen({ email: "a@b.de", event_id: "evt-1", event_source_url: "https://vexfit.app/registrieren.html?typ=trainer" });
  assertEquals(e.event_name, "CompleteRegistration");
  assertEquals(e.action_source, "website");
  assertEquals(e.event_id, "evt-1");
  assertEquals(e.event_source_url, "https://vexfit.app/registrieren.html?typ=trainer");
  assert(Array.isArray(e.user_data.em));
});

Deno.test("Mit Zustimmung + event_id: serverseitiges Ereignis geht raus", async () => {
  const { a, capi } = baue();
  const res = await bearbeiten(req({ email: "neu@beispiel.at", vorname: "Max", nachname: "M", zustimmung: true, event_id: "evt-7", event_source_url: "https://vexfit.app/registrieren.html" }), a);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(capi.length, 1);
  assertEquals(capi[0].event_id, "evt-7");
  assertEquals(capi[0].event_name, "CompleteRegistration");
  assertEquals(capi[0].user_data.em?.[0], await sha256Hex("neu@beispiel.at"));
  assertEquals(d.capi.gesendet, true);
});

Deno.test("Ohne Zustimmung: KEIN serverseitiges Ereignis", async () => {
  const { a, capi } = baue();
  const d = await (await bearbeiten(req({ email: "neu@beispiel.at", zustimmung: false, event_id: "evt-7" }), a)).json();
  assertEquals(capi.length, 0);
  assertEquals(d.capi.grund, "keine Zustimmung");
});

Deno.test("Ohne event_id: KEIN serverseitiges Ereignis (keine Entdopplung möglich)", async () => {
  const { a, capi } = baue();
  const d = await (await bearbeiten(req({ email: "neu@beispiel.at", zustimmung: true }), a)).json();
  assertEquals(capi.length, 0);
  assertEquals(d.capi.grund, "keine event_id");
});

Deno.test("Browser: gemeinsame event_id + Zustimmung an die Function, Pixel-ID unverändert", async () => {
  const reg = await Deno.readTextFile(new URL("../../../registrieren.html", import.meta.url));
  // event_id wird an fbq (Entdopplung) UND an die Function gegeben. Teil 1: der
  // Browser-Track läuft über den Helfer, der die eventID weiterreicht.
  assertStringIncludes(reg, "{eventID: eventId}");
  assertStringIncludes(reg, "pixelRegistrierungFertig('trainer', capiEventId)");
  assertStringIncludes(reg, "event_id: capiEventId");
  assertStringIncludes(reg, "zustimmung: zugestimmt");
  assertStringIncludes(reg, "event_source_url: location.href");
  // Pixel-ID und Ereignis bleiben, nichts umgebaut.
  assertStringIncludes(reg, "'1034036285801133'");
  assertStringIncludes(reg, "fbq('track','CompleteRegistration'");
  assert(!reg.includes("1105307262121912"));
});

Deno.test("Altes Deployment ohne metaConversion-Anschluss: kein Absturz, Registrierung läuft", async () => {
  const { a, mails } = baue({ ohneCapi: true });
  const res = await bearbeiten(req({ email: "neu@beispiel.at", vorname: "Max", nachname: "M", zustimmung: true, event_id: "evt-7" }), a);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(mails.length, 1); // Benachrichtigung ging trotzdem raus
  assertEquals(d.capi.grund, "nicht verfuegbar");
});
