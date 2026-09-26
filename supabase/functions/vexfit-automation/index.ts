// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/index.ts
//
// Supabase Edge Function "vexfit-automation" — Ersatz fuer den n8n-Workflow
// "Vexfit Komplette Automation v4" (id Y5kidNvNEvIbGDeC).
//
// Vier Pfade, genau die vier Ausloeser des Workflows:
//   POST /functions/v1/vexfit-automation/neuer-trainer
//   POST /functions/v1/vexfit-automation/neuer-kunde
//   POST /functions/v1/vexfit-automation/neue-anfrage
//   POST /functions/v1/vexfit-automation/stripe        (checkout.session.completed)
//
// Diese Datei enthaelt NUR die Verdrahtung nach aussen: Datenbank, SMTP,
// Stripe-Signatur. Die gesamte Logik steht in kern.ts und wird dort ohne Netz
// geprueft.
//
// Deploy mit --no-verify-jwt: weder der Browser noch Stripe schicken einen
// Supabase-Schluessel. Der Schutz besteht aus drei Dingen: CORS nur fuer
// https://vexfit.app, Eingabepruefung auf allen Browser-Pfaden, und die
// Stripe-Signatur auf /stripe.
//
// Umgebung (alles Secrets, nichts davon steht im Code):
//   GMAIL_PASSWORT            — App-Passwort des Absenderkontos (schon gesetzt)
//   STRIPE_WEBHOOK_SECRET     — Signaturgeheimnis des Stripe-Endpunkts
//   ADMIN_PASSWORT_HINWEIS    — optional; siehe unten
//   SUPABASE_URL              — von Supabase gesetzt
//   SUPABASE_SERVICE_ROLE_KEY — von Supabase gesetzt
//
// Zu ADMIN_PASSWORT_HINWEIS: die Trainer-Mail des Workflows endete mit einer
// Zeile "Passwort: …" im Klartext. Dieses Repository ist oeffentlich, deshalb
// steht der Wert hier nicht im Code. Ist das Secret nicht gesetzt, entfaellt
// die Zeile — die Mail ist sonst unveraendert. Seit admin.html eine echte
// Anmeldung verlangt, wird die Zeile vermutlich gar nicht mehr gebraucht.
//
// Zum SMTP-Port: die Supabase-Doku sperrt ausgehend die Ports 25 und 587,
// 465 ist nicht genannt — deshalb smtp.gmail.com:465 mit TLS, wie in
// trainer-alert.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import Stripe from "npm:stripe@18.5.0";
import {
  ABSENDER,
  type Anfrage,
  type Anschluesse,
  bearbeiten,
  type Mail,
  type StripeEreignis,
  type Trainer,
} from "./kern.ts";

const SMTP = { host: "smtp.gmail.com", port: 465 };

function pflicht(name: string): string {
  const wert = Deno.env.get(name);
  if (!wert) throw new Error(`Umgebungsvariable ${name} fehlt.`);
  return wert;
}

/** PostgREST mit dem Service-Role-Schluessel — umgeht RLS, wie der Ablauf es braucht. */
function restKopf(): HeadersInit {
  const schluessel = pflicht("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: schluessel,
    Authorization: `Bearer ${schluessel}`,
    "Content-Type": "application/json",
  };
}

function restAdresse(pfad: string): string {
  return `${pflicht("SUPABASE_URL").replace(/\/+$/, "")}/rest/v1/${pfad}`;
}

async function lesen<T>(pfad: string): Promise<T[]> {
  const a = await fetch(restAdresse(pfad), { headers: restKopf() });
  if (!a.ok) {
    throw new Error(
      `Lesen von ${pfad.split("?")[0]} fehlgeschlagen: HTTP ${a.status}`,
    );
  }
  return await a.json() as T[];
}

async function schreiben(pfad: string, daten: unknown): Promise<void> {
  const a = await fetch(restAdresse(pfad), {
    method: "PATCH",
    headers: { ...restKopf(), Prefer: "return=minimal" },
    body: JSON.stringify(daten),
  });
  if (!a.ok) {
    throw new Error(
      `Schreiben auf ${pfad.split("?")[0]} fehlgeschlagen: HTTP ${a.status}`,
    );
  }
}

const stripeClient = new Stripe(
  Deno.env.get("STRIPE_API_KEY") ?? "nicht_gesetzt",
  {
    httpClient: Stripe.createFetchHttpClient(),
  },
);
const kryptoAnbieter = Stripe.createSubtleCryptoProvider();

const anschluesse: Anschluesse = {
  // Node "Trainer Status prüfen"
  async trainerNachId(id: string): Promise<Trainer | null> {
    const zeilen = await lesen<Trainer>(
      `trainers?id=eq.${
        encodeURIComponent(id)
      }&select=id,vorname,nachname,email,stripe_bezahlt`,
    );
    return zeilen[0] ?? null;
  },

  // Node "Trainer finden"
  async trainerNachEmail(email: string): Promise<Trainer | null> {
    const zeilen = await lesen<Trainer>(
      `trainers?email=eq.${
        encodeURIComponent(email)
      }&select=id,vorname,nachname,email,stripe_bezahlt`,
    );
    return zeilen[0] ?? null;
  },

  // Node "Offene Anfrage holen"
  async offeneAnfrage(trainerId: string): Promise<Anfrage | null> {
    const zeilen = await lesen<Anfrage>(
      `anfragen?trainer_id=eq.${
        encodeURIComponent(trainerId)
      }&weitergeleitet=eq.false` +
        `&select=id,kunden_name,kunden_email,ziel,nachricht`,
    );
    return zeilen[0] ?? null;
  },

  // Node "Trainer als bezahlt markieren"
  trainerBezahltMarkieren(email: string): Promise<void> {
    return schreiben(`trainers?email=eq.${encodeURIComponent(email)}`, {
      stripe_bezahlt: true,
      aktiv: true,
    });
  },

  // Node "Anfrage als weitergeleitet markieren"
  anfragenWeitergeleitetMarkieren(trainerId: string): Promise<void> {
    return schreiben(
      `anfragen?trainer_id=eq.${
        encodeURIComponent(trainerId)
      }&weitergeleitet=eq.false`,
      { weitergeleitet: true },
    );
  },

  async mailSenden(mail: Mail): Promise<void> {
    const client = new SMTPClient({
      connection: {
        hostname: SMTP.host,
        port: SMTP.port,
        tls: true,
        auth: { username: ABSENDER, password: pflicht("GMAIL_PASSWORT") },
      },
    });
    try {
      await client.send({
        from: ABSENDER,
        to: mail.an,
        subject: mail.betreff,
        content: mail.text,
      });
    } finally {
      await client.close();
    }
  },

  // Signatur mit dem offiziellen Stripe-Paket pruefen (SubtleCrypto, kein Netz).
  async stripeEreignis(
    rumpf: string,
    signatur: string | null,
  ): Promise<StripeEreignis | null> {
    if (!signatur) return null;
    try {
      const ereignis = await stripeClient.webhooks.constructEventAsync(
        rumpf,
        signatur,
        pflicht("STRIPE_WEBHOOK_SECRET"),
        undefined,
        kryptoAnbieter,
      );
      return ereignis as unknown as StripeEreignis;
    } catch (fehler) {
      console.error(
        "vexfit-automation: Stripe-Signatur abgelehnt",
        String(fehler),
      );
      return null;
    }
  },

  async ereignisSchonVerarbeitet(id: string): Promise<boolean> {
    const zeilen = await lesen<{ event_id: string }>(
      `stripe_events_verarbeitet?event_id=eq.${
        encodeURIComponent(id)
      }&select=event_id`,
    );
    return zeilen.length > 0;
  },

  async ereignisVermerken(id: string, typ: string): Promise<void> {
    const a = await fetch(restAdresse("stripe_events_verarbeitet"), {
      method: "POST",
      headers: {
        ...restKopf(),
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify({ event_id: id, typ }),
    });
    if (!a.ok) {
      throw new Error(`Ereignis vermerken fehlgeschlagen: HTTP ${a.status}`);
    }
  },

  adminHinweis(): string | undefined {
    return Deno.env.get("ADMIN_PASSWORT_HINWEIS") || undefined;
  },

  melden(text, mehr) {
    console.error(`vexfit-automation: ${text}`, mehr ?? "");
  },
};

Deno.serve((anfrage: Request) => bearbeiten(anfrage, anschluesse));
