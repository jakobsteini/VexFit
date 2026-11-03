// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/b5_abo_test.ts
//
// B5 (Dauerlauf 2026-11-03): Abo-Lebenszyklus im /stripe-Webhook.
//   invoice.paid            -> Zahlung verbucht, Trainer bleibt aktiv
//   invoice.payment_failed  -> Admin-Mail + Push, NICHT sperren
//   customer.subscription.deleted -> sperren (aktiv=false) + Admin-Mail + Push
// Zuordnung über client_reference_id / Stripe-Kunden-ID / E-Mail, Entdopplung,
// Signaturprüfung. Stripe/DB/SMTP/Push gemockt.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  type Mail,
  mailAboEreignis,
  type PushNachricht,
  pushAboEreignis,
  type StripeEreignis,
  type Trainer,
} from "./kern.ts";

const TRAINER: Trainer = { id: "t-1", vorname: "Max", nachname: "Muster", email: "max@trainer.at" };

function baue(opt: { trainer?: Trainer | null; perCustomer?: boolean; perEmail?: boolean } = {}) {
  const t = opt.trainer === undefined ? TRAINER : opt.trainer;
  const schon = new Set<string>();
  const gesetzt: { id: string; felder: Record<string, unknown> }[] = [];
  const mails: Mail[] = [];
  const pushes: PushNachricht[] = [];
  const vermerkt: string[] = [];
  const base: Record<string, unknown> = {
    // Einfache "Signaturprüfung": fehlt die Signatur oder ist sie "bad" -> null.
    stripeEreignis: (rumpf: string, sig: string | null) =>
      Promise.resolve(!sig || sig === "bad" ? null : (JSON.parse(rumpf) as StripeEreignis)),
    ereignisSchonVerarbeitet: (id: string) => Promise.resolve(schon.has(id)),
    ereignisVermerken: (id: string) => { vermerkt.push(id); schon.add(id); return Promise.resolve(); },
    trainerNachId: (id: string) => Promise.resolve(t && id === t.id ? t : null),
    trainerNachStripeCustomer: (c: string) => Promise.resolve(opt.perCustomer && t && c === "cus_1" ? t : null),
    trainerNachEmail: (e: string) => Promise.resolve(opt.perEmail && t && e === t.email ? t : null),
    adminTrainerSetzen: (id: string, felder: Record<string, unknown>) => { gesetzt.push({ id, felder }); return Promise.resolve(1); },
    mailSenden: (m: Mail) => { mails.push(m); return Promise.resolve(); },
    // Push verdrahtet, damit der Admin-Push wirklich ausgelöst wird.
    vapidVorhanden: () => true,
    pushAbosLesen: () => Promise.resolve([{ endpoint: "https://push/x", p256dh: "k", auth: "a" }]),
    pushEinzelSenden: (_abo: unknown, n: PushNachricht) => { pushes.push(n); return Promise.resolve(201); },
    melden: () => {},
  };
  return { a: base as unknown as Anschluesse, gesetzt, mails, pushes, vermerkt, schon };
}

function stripeReq(ereignis: Record<string, unknown>, sig: string | null = "ok"): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/stripe",
    { method: "POST", headers: sig ? { "stripe-signature": sig } : {}, body: JSON.stringify(ereignis) },
  );
}

const ereignis = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } });

Deno.test("invoice.paid: verbucht, Trainer bleibt aktiv (kein aktiv=false)", async () => {
  const b = baue({ perCustomer: true });
  const res = await bearbeiten(stripeReq(ereignis("evt_1", "invoice.paid", { customer: "cus_1", customer_email: "max@trainer.at" })), b.a);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.typ, "invoice.paid");
  assert(b.gesetzt.some((g) => g.felder.abo_status === "aktiv"));
  assert(!b.gesetzt.some((g) => g.felder.aktiv === false), "invoice.paid darf nicht sperren");
  assertEquals(b.vermerkt, ["evt_1"]);
});

Deno.test("invoice.payment_failed: Admin-Mail + Push, NICHT sperren", async () => {
  const b = baue({ perCustomer: true });
  const d = await (await bearbeiten(stripeReq(ereignis("evt_2", "invoice.payment_failed", { customer: "cus_1" })), b.a)).json();
  assertEquals(d.gesperrt, false);
  assert(b.gesetzt.some((g) => g.felder.abo_status === "zahlung_fehlgeschlagen"));
  assert(!b.gesetzt.some((g) => g.felder.aktiv === false), "payment_failed darf nicht sperren");
  assert(b.mails.some((m) => m.an === "office@vexfit.app" && m.betreff.includes("Zahlung fehlgeschlagen")));
  assert(b.pushes.some((p) => p.titel.includes("Zahlung fehlgeschlagen")));
});

Deno.test("customer.subscription.deleted: sperrt (aktiv=false) + Admin-Mail + Push", async () => {
  const b = baue({ perCustomer: true });
  const d = await (await bearbeiten(stripeReq(ereignis("evt_3", "customer.subscription.deleted", { customer: "cus_1" })), b.a)).json();
  assertEquals(d.gesperrt, true);
  assert(b.gesetzt.some((g) => g.felder.aktiv === false), "Kündigung muss sperren");
  assert(b.gesetzt.some((g) => g.felder.abo_status === "gekuendigt"));
  assert(b.mails.some((m) => m.an === "office@vexfit.app" && m.betreff.includes("Abo gekündigt")));
  assert(b.pushes.some((p) => p.titel.includes("Abo gekündigt")));
});

Deno.test("Entdopplung: doppelte Zustellung wird nicht erneut verarbeitet", async () => {
  const b = baue({ perCustomer: true });
  const e = ereignis("evt_dup", "invoice.paid", { customer: "cus_1" });
  await bearbeiten(stripeReq(e), b.a);
  const d2 = await (await bearbeiten(stripeReq(e), b.a)).json();
  assertEquals(d2.uebersprungen, "schon verarbeitet");
  assertEquals(b.gesetzt.filter((g) => g.felder.abo_status === "aktiv").length, 1); // nur einmal
});

Deno.test("Zuordnung: Stripe-Kunden-ID, dann E-Mail", async () => {
  // nur per E-Mail auffindbar (keine Kunden-ID gespeichert)
  const b = baue({ perEmail: true });
  const d = await (await bearbeiten(stripeReq(ereignis("evt_m", "invoice.paid", { customer_email: "max@trainer.at" })), b.a)).json();
  assertEquals(d.typ, "invoice.paid");
  assert(b.gesetzt.some((g) => g.felder.abo_status === "aktiv"));
});

Deno.test("Unbekannter Trainer: kein Absturz, NICHT vermerkt (Stripe stellt erneut zu)", async () => {
  const b = baue({ trainer: null });
  const d = await (await bearbeiten(stripeReq(ereignis("evt_x", "invoice.paid", { customer: "cus_unbekannt" })), b.a)).json();
  assertEquals(d.uebersprungen, "kein Trainer");
  assertEquals(b.vermerkt.length, 0);
});

Deno.test("Falsche Signatur: 400, nichts verarbeitet", async () => {
  const b = baue({ perCustomer: true });
  const res = await bearbeiten(stripeReq(ereignis("evt_bad", "invoice.paid", { customer: "cus_1" }), "bad"), b.a);
  assertEquals(res.status, 400);
  assertEquals(b.gesetzt.length, 0);
  assertEquals(b.vermerkt.length, 0);
});

Deno.test("Unbekannter Ereignistyp wird übersprungen", async () => {
  const b = baue({ perCustomer: true });
  const d = await (await bearbeiten(stripeReq(ereignis("evt_o", "charge.refunded", { customer: "cus_1" })), b.a)).json();
  assertEquals(d.uebersprungen, "anderer Ereignistyp");
});

Deno.test("Mail-/Push-Texte", () => {
  assertEquals(mailAboEreignis(TRAINER, "gekuendigt").an, "office@vexfit.app");
  assert(pushAboEreignis(TRAINER, "zahlung_fehlgeschlagen").text.includes("Max"));
});
