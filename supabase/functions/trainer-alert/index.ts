// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/trainer-alert/index.ts
//
// Supabase Edge Function "trainer-alert" — Ersatz fuer den n8n-Workflow
// "Vexfit Trainer Alert" (Zeitplan alle 15 Minuten).
//
// Diese Datei enthaelt NUR die Verdrahtung nach aussen: Datenbank, PLZ-Dienst,
// SMTP. Die gesamte Logik steht in kern.ts und wird dort ohne Netz geprueft.
//
// Probelauf: ein Aufruf mit `?probelauf` an derselben Adresse rechnet Auswahl
// und Zuordnung durch, verschickt aber nichts und markiert nichts. Die Antwort
// nennt nur Zahlen, Trainer- und Alert-Kennungen sowie die Entfernung — keine
// Adressen, keine Namen. Gedacht fuer den ersten Blick vor dem Scharfschalten.
//
// Angestossen wird sie vom Zeitplan in
// supabase/migrations/20260926_193000_trainer_alert_zeitplan.sql
// (pg_cron + pg_net, alle 15 Minuten) mit dem Schluessel aus Supabase Vault.
//
// Umgebung (alles Secrets, nichts davon steht im Code):
//   TRAINER_ALERT_KEY        — derselbe Wert wie im Vault-Eintrag trainer_alert_key
//   GMAIL_PASSWORT           — App-Passwort des Gmail-Kontos des Absenders
//   SUPABASE_URL             — von Supabase gesetzt
//   SB_SECRET_KEY      — neuer geheimer Schluessel (sb_secret_…); bevorzugt, siehe restKopf()
//   SUPABASE_SERVICE_ROLE_KEY— alter Schluessel; nur noch Rueckfall, von Supabase gesetzt
//
// Zum SMTP-Port: die Supabase-Doku sagt unter „Edge Functions / Limits"
// woertlich „Outgoing connections to ports `25` and `587` are not allowed."
// Port 465 ist dort NICHT genannt, deshalb smtp.gmail.com:465 mit TLS.
//
// Die Function muss mit --no-verify-jwt deployt werden: der Zeitplan schickt
// den eigenen Schluessel aus dem Vault, kein Supabase-JWT. Die Pruefung des
// Schluessels macht die Function selbst (401, siehe kern.ts).

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  ABSENDER,
  type Alert,
  ALERT_SPALTEN,
  type Alertmail,
  type Anschluesse,
  bearbeiten,
  type Koordinate,
  LAENDER,
  mailBetreff,
  mailHtml,
  mailText,
  type Trainer,
  TRAINER_SPALTEN,
} from "./kern.ts";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;

function pflicht(name: string): string {
  const wert = Deno.env.get(name);
  if (!wert) throw new Error(`Umgebungsvariable ${name} fehlt.`);
  return wert;
}

/** PostgREST mit dem geheimen Schluessel — umgeht RLS, wie der Lauf es braucht. */
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
  const antwort = await fetch(restAdresse(pfad), { headers: restKopf() });
  if (!antwort.ok) {
    throw new Error(
      `Lesen von ${pfad.split("?")[0]} fehlgeschlagen: HTTP ${antwort.status}`,
    );
  }
  return await antwort.json() as T[];
}

const anschluesse: Anschluesse = {
  // Node "Neue aktive Trainer holen"
  trainerLesen: () =>
    lesen<Trainer>(
      `trainers?aktiv=eq.true&alert_sent=eq.false&select=${TRAINER_SPALTEN}`,
    ),

  // Node "Aktive Alerts holen"
  alertsLesen: () =>
    lesen<Alert>(`trainer_alerts?aktiv=eq.true&select=${ALERT_SPALTEN}`),

  // Der Code-Node fragte zippopotam der Reihe nach fuer at, de, ch.
  async koordinaten(plz: string): Promise<Koordinate | null> {
    for (const land of LAENDER) {
      try {
        const antwort = await fetch(`https://api.zippopotam.us/${land}/${plz}`);
        if (!antwort.ok) continue;
        const d = await antwort.json();
        if (d?.places?.length) {
          return {
            lat: parseFloat(d.places[0].latitude),
            lng: parseFloat(d.places[0].longitude),
          };
        }
      } catch {
        // stillschweigend weiter — genau wie im Workflow
      }
    }
    return null;
  },

  // Node "Alert-Mail senden"
  async mailSenden(mail: Alertmail): Promise<void> {
    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: ABSENDER, password: pflicht("GMAIL_PASSWORT") },
      },
    });
    try {
      await client.send({
        // Absendername statt nackter Adresse; die Adresse selbst bleibt gleich.
        from: `Vexfit <${ABSENDER}>`,
        to: mail.kunden_email,
        subject: mailBetreff(mail),
        // Multipart: Textfassung als text/plain, HTML als text/html, beide
        // ausdruecklich mit charset=utf-8 (senkt die Spam-Bewertung).
        mimeContent: [
          { mimeType: "text/plain; charset=utf-8", content: mailText(mail) },
          { mimeType: "text/html; charset=utf-8", content: mailHtml(mail) },
        ],
      });
    } finally {
      await client.close();
    }
  },

  // Node "Trainer als verarbeitet markieren"
  async alsVerarbeitetMarkieren(trainerId: string): Promise<void> {
    const antwort = await fetch(
      `${restAdresse("trainers")}?id=eq.${encodeURIComponent(trainerId)}`,
      {
        method: "PATCH",
        headers: { ...restKopf(), Prefer: "return=minimal" },
        body: JSON.stringify({ alert_sent: true }),
      },
    );
    if (!antwort.ok) {
      throw new Error(`Markieren fehlgeschlagen: HTTP ${antwort.status}`);
    }
  },

  melden(text, mehr) {
    console.error(`trainer-alert: ${text}`, mehr ?? "");
  },
};

Deno.serve((anfrage: Request) =>
  bearbeiten(anfrage, Deno.env.get("TRAINER_ALERT_KEY"), anschluesse)
);
