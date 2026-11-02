// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/benachrichtigung_teil2_test.ts
//
// Teil 2: Admin-Benachrichtigungen. Eine Trainer-Registrierung erzeugt genau
// EINE Mail "Neuer Trainer …" UND genau EINEN Push. Eine Kunden-Registrierung
// löst KEINE "Neuer Trainer"-Mail aus. Dazu: registrieren.html setzt die
// Webhook-Aufrufe mit keepalive ab, damit die Weiterleitung sie nicht abbricht
// (Ursache der ausgebliebenen Mails am 02.11.).
//
// Aufruf:  deno test --allow-read --allow-env supabase/functions/vexfit-automation/benachrichtigung_teil2_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  type PushAbo,
  type PushNachricht,
} from "./kern.ts";

interface Spur { mails: Mail[]; pushs: PushNachricht[]; }

function baue(): { a: Anschluesse; spur: Spur } {
  const spur: Spur = { mails: [], pushs: [] };
  const fehlt = (n: string) => () => { throw new Error(`${n} nicht erwartet`); };
  const base: Record<string, unknown> = {
    benutzerAusToken: () => Promise.resolve({ id: "u-1", email: "neu@beispiel.at" }),
    mailSenden: (m: Mail) => { spur.mails.push(m); return Promise.resolve(); },
    melden: () => {},
    // Profil-Nachschlag (Deep-Link / Vollständigkeit) – hier leer.
    trainerProfilNachEmail: () => Promise.resolve(null),
    kundeProfilNachEmail: () => Promise.resolve(null),
    // Push: ein aktives Gerät; jedes Senden wird aufgezeichnet.
    vapidVorhanden: () => true,
    pushAbosLesen: () => Promise.resolve([{ endpoint: "https://push/abo-1", p256dh: "k", auth: "a" } as PushAbo]),
    pushEinzelSenden: (_abo: PushAbo, n: PushNachricht) => { spur.pushs.push(n); return Promise.resolve(201); },
  };
  for (const n of ["trainerNachId","trainerNachEmail","aeltesteOffeneAnfrage","trainerBezahltMarkieren","anfrageWeitergeleitetMarkieren","stripeEreignis","ereignisSchonVerarbeitet","ereignisVermerken","anfragenAnzahlSeit","spamProEmailSeit","spamProIpSeit","spamEintragVormerken","adminTrainerSetzen","adminZeileLoeschen"]) {
    if (!(n in base)) base[n] = fehlt(n);
  }
  return { a: base as unknown as Anschluesse, spur };
}

function req(pfad: string, koerper: Record<string, unknown>): Request {
  return new Request(
    `https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/${pfad}`,
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" }, body: JSON.stringify(koerper) },
  );
}

Deno.test("Teil 2: neuer-trainer → genau 1 Mail und genau 1 Push", async () => {
  const { a, spur } = baue();
  const res = await bearbeiten(req("neuer-trainer", { vorname: "Lukas", nachname: "Pichler", email: "lukas@beispiel.at", stadt: "Wien" }), a);
  assertEquals(res.status, 200);
  assertEquals(spur.mails.length, 1, "nicht genau eine Mail");
  assertStringIncludes(spur.mails[0].betreff, "Neuer Trainer: Lukas Pichler");
  assertEquals(spur.pushs.length, 1, "nicht genau ein Push");
  assertEquals(spur.pushs[0].titel, "🟡 Neuer Trainer");
  assertStringIncludes(spur.pushs[0].text, "Lukas Pichler");
});

Deno.test("Teil 2: neuer-kunde löst KEINE 'Neuer Trainer'-Mail aus (Kunde unverändert)", async () => {
  const { a, spur } = baue();
  const res = await bearbeiten(req("neuer-kunde", { vorname: "Tina", nachname: "Kurz", email: "tina@beispiel.at", stadt: "Graz" }), a);
  assertEquals(res.status, 200);
  assert(!spur.mails.some((m) => m.betreff.includes("Neuer Trainer")), "Kunde löste eine Neuer-Trainer-Mail aus");
  // Der Kunden-Push ist "Neuer Kunde", nicht "Neuer Trainer".
  assert(!spur.pushs.some((p) => p.titel.includes("Neuer Trainer")), "Kunde löste einen Neuer-Trainer-Push aus");
});

Deno.test("Teil 2: registrieren.html setzt die Webhooks mit keepalive ab (Weiterleitung bricht sie nicht ab)", async () => {
  const reg = await Deno.readTextFile(new URL("../../../registrieren.html", import.meta.url));
  const tr = reg.slice(reg.indexOf("vexfit-automation/neuer-trainer"), reg.indexOf("vexfit-automation/neuer-trainer") + 120);
  const ku = reg.slice(reg.indexOf("vexfit-automation/neuer-kunde"), reg.indexOf("vexfit-automation/neuer-kunde") + 120);
  assertStringIncludes(tr, "keepalive:true");
  assertStringIncludes(ku, "keepalive:true");
});
