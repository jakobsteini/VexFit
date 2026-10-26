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
//   SB_SECRET_KEY       — neuer geheimer Schluessel (sb_secret_…); bevorzugt, siehe restKopf()
//   SUPABASE_SERVICE_ROLE_KEY — alter Schluessel; nur noch Rueckfall, von Supabase gesetzt
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

/** PostgREST mit dem geheimen Schluessel — umgeht RLS, wie der Ablauf es braucht. */
function restKopf(): HeadersInit {
  // Zwei Quellen, weil Supabase die Schluessel-Generationen umstellt: bevorzugt
  // der neue geheime Schluessel aus SB_SECRET_KEY (sb_secret_…), sonst der
  // alte SUPABASE_SERVICE_ROLE_KEY, den Supabase bisher selbst setzt. So faellt
  // zwischen dem Ausliefern dieser Fassung und dem Setzen des neuen Geheimnisses
  // nichts aus. Der Rueckfall auf SUPABASE_SERVICE_ROLE_KEY darf entfallen,
  // sobald SB_SECRET_KEY gesetzt ist und die alten Schluessel im
  // Supabase-Dashboard abgeschaltet wurden.
  const schluessel = Deno.env.get("SB_SECRET_KEY") ||
    pflicht("SUPABASE_SERVICE_ROLE_KEY");
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

  // Node "Trainer finden". Ohne Gross-/Kleinschreibung (ilike): bei Stripe kann
  // die E-Mail anders geschrieben eingetippt werden als im Profil gespeichert.
  // E-Mails enthalten normal keine ilike-Platzhalter (% _), daher exakter
  // case-insensitiver Vergleich.
  async trainerNachEmail(email: string): Promise<Trainer | null> {
    const zeilen = await lesen<Trainer>(
      `trainers?email=ilike.${
        encodeURIComponent(email)
      }&select=id,vorname,nachname,email,stripe_bezahlt`,
    );
    return zeilen[0] ?? null;
  },

  // Node "Offene Anfrage holen", erweitert um E2: die AELTESTE Anfrage.
  // Die Zeitspalte ist belegt: kunden-bereich.html:257 liest sie mit
  // (`select=id,trainer_name,status,created_at`), trainer-bereich.html:647
  // sortiert danach (`order=created_at.desc`).
  async aeltesteOffeneAnfrage(trainerId: string): Promise<Anfrage | null> {
    // Weder bereits weitergeleitet noch abgelehnt: eine Zahlung schaltet keine
    // vom Trainer abgelehnte Anfrage frei. status='abgelehnt' kommt aus
    // trainer-bereich.html (beantworteAnfrage); Altzeilen ohne status (NULL)
    // gelten als offen (or=...status.is.null).
    const zeilen = await lesen<Anfrage>(
      `anfragen?trainer_id=eq.${
        encodeURIComponent(trainerId)
      }&weitergeleitet=eq.false&or=(status.neq.abgelehnt,status.is.null)` +
        `&select=id,kunden_name,kunden_email,ziel,nachricht,created_at,status` +
        `&order=created_at.asc&limit=1`,
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

  // Node "Anfrage als weitergeleitet markieren", erweitert um E2: genau
  // DIESE eine Zeile, nicht mehr alle offenen Anfragen des Trainers.
  anfrageWeitergeleitetMarkieren(anfrageId: string): Promise<void> {
    return schreiben(
      `anfragen?id=eq.${encodeURIComponent(anfrageId)}`,
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
        // Absendername statt nackter Adresse; die Adresse selbst bleibt gleich.
        from: `Vexfit <${ABSENDER}>`,
        to: mail.an,
        subject: mail.betreff,
        // Multipart: Textfassung als text/plain, HTML als text/html, beide
        // ausdruecklich mit charset=utf-8 (senkt die Spam-Bewertung).
        mimeContent: [
          { mimeType: "text/plain; charset=utf-8", content: mail.text },
          { mimeType: "text/html; charset=utf-8", content: mail.html },
        ],
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

  // Teil 8: Nutzer zu einem Zugangs-Token ueber die Supabase-Auth-API. apikey
  // ist der geheime Schluessel (wie restKopf), Authorization das Nutzer-Token.
  async benutzerAusToken(
    token: string,
  ): Promise<{ id: string; email: string } | null> {
    const schluessel = Deno.env.get("SB_SECRET_KEY") ||
      pflicht("SUPABASE_SERVICE_ROLE_KEY");
    const a = await fetch(
      `${pflicht("SUPABASE_URL").replace(/\/+$/, "")}/auth/v1/user`,
      { headers: { apikey: schluessel, Authorization: `Bearer ${token}` } },
    );
    if (!a.ok) return null;
    const u = await a.json().catch(() => null);
    if (!u || !u.id) return null;
    return { id: String(u.id), email: String(u.email ?? "") };
  },

  // Teil 8: Anzahl Anfragen dieses Kunden seit einem Zeitpunkt. Nutzt den
  // vorhandenen created_at-Zeitstempel der Tabelle anfragen (keine neue Tabelle).
  async anfragenAnzahlSeit(kundenEmail: string, seitISO: string): Promise<number> {
    const a = await fetch(
      restAdresse(
        `anfragen?kunden_email=ilike.${encodeURIComponent(kundenEmail)}` +
          `&created_at=gte.${encodeURIComponent(seitISO)}&select=id`,
      ),
      { headers: { ...restKopf(), Prefer: "count=exact" } },
    );
    if (!a.ok) {
      throw new Error(`Anfragen zaehlen fehlgeschlagen: HTTP ${a.status}`);
    }
    // PostgREST liefert die Gesamtzahl im Content-Range-Kopf ("*/<n>").
    const bereich = a.headers.get("content-range");
    const n = bereich && bereich.includes("/")
      ? parseInt(bereich.split("/")[1], 10)
      : (await a.json() as unknown[]).length;
    return Number.isFinite(n) ? n : 0;
  },

  adminHinweis(): string | undefined {
    return Deno.env.get("ADMIN_PASSWORT_HINWEIS") || undefined;
  },

  melden(text, mehr) {
    console.error(`vexfit-automation: ${text}`, mehr ?? "");
  },
};

Deno.serve((anfrage: Request) => bearbeiten(anfrage, anschluesse));
