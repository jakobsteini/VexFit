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
//   SMTP_BENUTZER             — SMTP-Anmeldename (z. B. jakob@jsvision.at)
//   SMTP_PASSWORT             — App-Passwort fuer diesen SMTP-Zugang (Workspace)
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
  aalAusToken,
  ABSENDER,
  type Anfrage,
  abendberichtZahlenHolen,
  type Anschluesse,
  bearbeiten,
  capiFreigeschaltet,
  type Mail,
  type MetaEreignis,
  type ProfilErinnerungArt,
  type ProfilErinnerungLetzte,
  type PushAbo,
  type StripeEreignis,
  type Trainer,
  type TrainerProfil,
} from "./kern.ts";
// Teil A: Web-Push-Krypto (VAPID + aes128gcm) – nur hier, damit kern.ts
// netz-/bibliotheksfrei bleibt.
import { pushEinzelSenden as webPushEinzelSenden, vapidKonfig } from "../_shared/webpush.ts";
// S3: Wegwerf-Mail-Domains (erweiterbare Liste als Datei im Repo).
import { WEGWERF_DOMAINS } from "./wegwerf-domains.ts";
const WEGWERF_SET = new Set(WEGWERF_DOMAINS.map((d) => d.toLowerCase().trim()).filter(Boolean));

// Teil 7: Meta-Pixel-ID (dieselbe wie im Browser) und Merker, damit der Hinweis
// bei fehlendem Secret nur einmal pro Instanz im Log steht.
const META_PIXEL_ID = "1034036285801133";
let capiHinweisGeloggt = false;

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

/** Zahl der Treffer eines Lesepfads (count=exact, Content-Range "*\/<n>"). */
async function zaehlen(pfad: string): Promise<number> {
  const a = await fetch(restAdresse(pfad), {
    headers: { ...restKopf(), Prefer: "count=exact" },
  });
  if (!a.ok) throw new Error(`Zaehlen von ${pfad.split("?")[0]} fehlgeschlagen: HTTP ${a.status}`);
  const bereich = a.headers.get("content-range");
  const n = bereich && bereich.includes("/")
    ? parseInt(bereich.split("/")[1], 10)
    : (await a.json() as unknown[]).length;
  return Number.isFinite(n) ? n : 0;
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
      }&select=id,vorname,nachname,email,stripe_bezahlt,studio_standort_id`,
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

  // B5: Trainer über die gespeicherte Stripe-Kunden-ID. Fehlt die Spalte
  // (Migration 2026-11-03-03 nicht eingespielt), null statt Fehler – dann greift
  // der Rückfall auf die E-Mail-Suche.
  async trainerNachStripeCustomer(customerId: string): Promise<Trainer | null> {
    try {
      const zeilen = await lesen<Trainer>(
        `trainers?stripe_customer_id=eq.${
          encodeURIComponent(customerId)
        }&select=id,vorname,nachname,email,stripe_bezahlt&limit=1`,
      );
      return zeilen[0] ?? null;
    } catch {
      return null;
    }
  },

  // Teil 4: vollstaendige Profilzeile per E-Mail. select=* – fehlt die Spalte
  // freigabe_mail_gesendet (Migration nicht eingespielt), fehlt der Schluessel
  // im Ergebnis einfach; kern.ts erkennt das und sendet dann nicht.
  async trainerProfilNachEmail(email: string): Promise<TrainerProfil | null> {
    const zeilen = await lesen<TrainerProfil>(
      `trainers?email=ilike.${encodeURIComponent(email)}&select=*`,
    );
    return zeilen[0] ?? null;
  },

  // Teil M: Kundenzeile per E-Mail (select=*), fuer den Deep-Link #kunde-<id> und
  // die Inhalte der Betreiber-Mail. Fehlt die Zeile, null – dann ohne Deep-Link.
  async kundeProfilNachEmail(email: string): Promise<Record<string, unknown> | null> {
    const zeilen = await lesen<Record<string, unknown>>(
      `kunden?email=ilike.${encodeURIComponent(email)}&select=*`,
    );
    return zeilen[0] ?? null;
  },

  // Freischalt-Mail: vollstaendige Profilzeile per Kennung. select=* – fehlt die
  // Spalte freischalt_mail_gesendet (Migration 2026-11-01-04 nicht eingespielt),
  // fehlt der Schluessel im Ergebnis; kern.ts erkennt das (sperre_fehlt).
  async trainerProfilNachId(id: string): Promise<TrainerProfil | null> {
    const zeilen = await lesen<TrainerProfil>(
      `trainers?id=eq.${encodeURIComponent(id)}&select=*`,
    );
    return zeilen[0] ?? null;
  },

  // Teil 7: ein Ereignis an die Meta Conversions API senden. Der Zugriffsschluessel
  // kommt NUR aus META_CAPI_TOKEN. Fehlt er, macht die Funktion nichts und loggt
  // genau einen Hinweis (kein Fehler) – die Registrierung laeuft weiter.
  async metaConversion(ereignis: MetaEreignis): Promise<{ gesendet: boolean; grund?: string }> {
    // B2: Freigabe-Schalter. Ohne ausdrückliche Freigabe (META_CAPI_AKTIV) wird
    // NICHTS an Meta gesendet – auch wenn der Token gesetzt ist. Erst freischalten,
    // wenn die Datenschutzerklärung die serverseitige Übermittlung nennt
    // (docs/recht/entwurf-meta-capi-2026-11-06.md).
    if (!capiFreigeschaltet(Deno.env.get("META_CAPI_AKTIV"))) {
      if (!capiHinweisGeloggt) {
        capiHinweisGeloggt = true;
        console.log("vexfit-automation: META_CAPI_AKTIV nicht gesetzt – Conversions API bleibt aus (Datenschutz-Freigabe fehlt).");
      }
      return { gesendet: false, grund: "nicht freigeschaltet" };
    }
    const token = Deno.env.get("META_CAPI_TOKEN");
    if (!token) {
      if (!capiHinweisGeloggt) {
        capiHinweisGeloggt = true;
        console.log("vexfit-automation: META_CAPI_TOKEN nicht gesetzt – Conversions API deaktiviert.");
      }
      return { gesendet: false, grund: "kein Token" };
    }
    const url = `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [ereignis] }),
    });
    if (!res.ok) {
      console.error("vexfit-automation: Conversions API HTTP", res.status);
      return { gesendet: false, grund: "HTTP " + res.status };
    }
    return { gesendet: true };
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

  // ── S3: Missbrauchs-Pruefung ──
  wegwerfDomains(): Set<string> {
    return WEGWERF_SET;
  },
  // Markiert die NEUESTE (noch ok/offene) Anfrage dieses Kunden an diesen Trainer
  // als „zur Pruefung". Zwei Schritte, weil PostgREST-PATCH kein order/limit kann:
  // erst die neueste Kennung holen, dann genau diese Zeile setzen.
  async anfrageZurPruefung(trainerId: string, kundenEmail: string, grund: string): Promise<boolean> {
    const liste = await lesen<{ id: string }>(
      `anfragen?trainer_id=eq.${encodeURIComponent(trainerId)}` +
        `&kunden_email=eq.${encodeURIComponent(kundenEmail)}` +
        `&or=(pruef_status.is.null,pruef_status.eq.ok)` +
        `&select=id&order=created_at.desc&limit=1`,
    );
    const id = liste[0]?.id;
    if (!id) return false;
    const r = await fetch(restAdresse(`anfragen?id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ pruef_status: "zur_pruefung", pruef_grund: grund }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`anfrageZurPruefung fehlgeschlagen: HTTP ${r.status} ${t}`); }
    const zeilen = await r.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen.length >= 1;
  },
  async anfragePruefSetzen(id: string, status: string): Promise<number> {
    const r = await fetch(restAdresse(`anfragen?id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ pruef_status: status }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`anfragePruefSetzen fehlgeschlagen: HTTP ${r.status} ${t}`); }
    const zeilen = await r.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen.length : 0;
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
    // Teil M: Versand ueber Google Workspace. Anmeldung mit den Secrets
    // SMTP_BENUTZER (z. B. jakob@jsvision.at) und SMTP_PASSWORT (App-Passwort).
    // Fehlt eines, wirft pflicht() einen klaren Fehler (kein stiller Versand).
    const client = new SMTPClient({
      connection: {
        hostname: SMTP.host,
        port: SMTP.port,
        tls: true,
        auth: { username: pflicht("SMTP_BENUTZER"), password: pflicht("SMTP_PASSWORT") },
      },
    });
    try {
      await client.send({
        // Sichtbarer Absender und Reply-To: office@vexfit.app (ABSENDER).
        from: `Vexfit <${ABSENDER}>`,
        replyTo: ABSENDER,
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
  ): Promise<{ id: string; email: string; aal?: string | null } | null> {
    const schluessel = Deno.env.get("SB_SECRET_KEY") ||
      pflicht("SUPABASE_SERVICE_ROLE_KEY");
    const a = await fetch(
      `${pflicht("SUPABASE_URL").replace(/\/+$/, "")}/auth/v1/user`,
      { headers: { apikey: schluessel, Authorization: `Bearer ${token}` } },
    );
    if (!a.ok) return null;
    const u = await a.json().catch(() => null);
    if (!u || !u.id) return null;
    // Admin-Dashboard neu, Teil 1: die MFA-Stufe (aal) steht im geprueften Token.
    return { id: String(u.id), email: String(u.email ?? ""), aal: aalAusToken(token) };
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

  // Fix 7b: Spam-Grenze fuer das anonyme suche.html-Formular. Zaehlt bzw. legt
  // Eintraege in der Tabelle spam_schutz an (Migration 2026-10-26-06). Beide
  // Zaehler lesen die Gesamtzahl aus dem Content-Range-Kopf (count=exact).
  async spamProEmailSeit(email: string, seitISO: string): Promise<number> {
    return await zaehlen(
      `spam_schutz?email=ilike.${encodeURIComponent(email)}` +
        `&erstellt_am=gte.${encodeURIComponent(seitISO)}&select=id`,
    );
  },

  async spamProIpSeit(ip: string, seitISO: string): Promise<number> {
    return await zaehlen(
      `spam_schutz?ip=eq.${encodeURIComponent(ip)}` +
        `&erstellt_am=gte.${encodeURIComponent(seitISO)}&select=id`,
    );
  },

  async spamEintragVormerken(email: string, ip: string): Promise<void> {
    const a = await fetch(restAdresse("spam_schutz"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "return=minimal" },
      body: JSON.stringify({ email, ip }),
    });
    if (!a.ok) {
      throw new Error(`spamEintragVormerken fehlgeschlagen: HTTP ${a.status}`);
    }
  },

  // Admin-Aktion: setzt feste Felder einer Trainerzeile mit service_role.
  // Welche Felder erlaubt sind, entscheidet kern.ts (feste Liste). Gibt die
  // Zahl geaenderter Zeilen zurueck (return=representation).
  async adminTrainerSetzen(
    id: string,
    felder: Record<string, unknown>,
  ): Promise<number> {
    const a = await fetch(
      restAdresse(`trainers?id=eq.${encodeURIComponent(id)}`),
      {
        method: "PATCH",
        headers: { ...restKopf(), Prefer: "return=representation" },
        body: JSON.stringify(felder),
      },
    );
    if (!a.ok) throw new Error(`adminTrainerSetzen fehlgeschlagen: HTTP ${a.status}`);
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen.length : 0;
  },

  // Teil 2: „Profil vollständig"-Mail ATOMAR beanspruchen. Ein bedingter PATCH:
  // setzt freigabe_mail_gesendet nur, solange es false ODER null ist. Bei zwei
  // gleichzeitigen Aufrufen aktualisiert nur EINER eine Zeile; der andere trifft
  // auf keine passende Zeile mehr (0 zurückgegebene Zeilen). Fehlt die Spalte
  // (Migration 2026-11-01-01 nicht eingespielt), wirft PostgREST einen Fehler,
  // den freigabePruefen als „Migration fehlt" behandelt.
  async freigabeMailBeanspruchen(id: string): Promise<boolean> {
    const filter = `trainers?id=eq.${encodeURIComponent(id)}` +
      `&or=(freigabe_mail_gesendet.is.false,freigabe_mail_gesendet.is.null)`;
    const a = await fetch(restAdresse(filter), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ freigabe_mail_gesendet: true }),
    });
    if (!a.ok) throw new Error(`freigabeMailBeanspruchen fehlgeschlagen: HTTP ${a.status}`);
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen.length === 1;
  },

  // Teil 4: Kandidaten für Erinnerungs-Mails – noch nicht freigegeben, nicht
  // gesperrt, nicht abgemeldet, in den letzten 14 Tagen registriert. Die Stufen
  // liegen bei 2 h / 3 Tagen / 7 Tagen; eine wegen des 3-Tage-Abstands
  // verschobene Stufe kann noch einige Tage später fällig werden – deshalb 14
  // Tage (statt der früheren 96 h) als Fenster. Vollständigkeit, Zeitpunkt und
  // Abstand entscheidet der Kern. Fehlen die Spalten (Migration 2026-11-02 nicht
  // eingespielt), antwortet PostgREST mit Fehler → "migration fehlt".
  async trainerFuerErinnerung(): Promise<TrainerProfil[]> {
    const seit = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const basis = "id,vorname,email,created_at,avatar_url,trainingsart,trainingsort,preis_stunde,bio,erfahrung,spezialisierungen,telefon,aktiv,gesperrt,erinnerung_stufe,erinnerungen_aus,erinnerung_token";
    // B7: Test-/Spam-Konten (ist_test) ausschließen. Zuerst MIT Spalte/Filter;
    // schlägt das fehl, weil die Migration 2026-11-06-02 noch nicht eingespielt
    // ist (Spalte fehlt → HTTP 400), ohne ist_test erneut versuchen. So bleiben
    // die Erinnerungen in jedem Fall funktionsfähig.
    for (const spalten of [basis + ",ist_test", basis]) {
      const filter = spalten.includes("ist_test") ? "&ist_test=not.is.true" : "";
      const pfad = `trainers?select=${spalten}` +
        `&aktiv=eq.false&gesperrt=eq.false&erinnerungen_aus=eq.false${filter}` +
        `&created_at=gte.${encodeURIComponent(seit)}&order=created_at.desc&limit=500`;
      const a = await fetch(restAdresse(pfad), { headers: restKopf() });
      if (a.ok) {
        const zeilen = await a.json().catch(() => []);
        return Array.isArray(zeilen) ? zeilen as TrainerProfil[] : [];
      }
      if (a.status !== 400) throw new Error(`trainerFuerErinnerung fehlgeschlagen: HTTP ${a.status}`);
      // 400: wahrscheinlich fehlende Spalte – nächster Versuch ohne ist_test.
    }
    throw new Error("trainerFuerErinnerung fehlgeschlagen: auch ohne ist_test HTTP 400");
  },

  // Teil 4: Erinnerungsstufe atomar beanspruchen (bedingter PATCH, nur wenn die
  // bisherige Stufe kleiner ist). 1 geänderte Zeile = Anspruch bekommen.
  async erinnerungStufeBeanspruchen(id: string, stufe: number): Promise<boolean> {
    const filter = `trainers?id=eq.${encodeURIComponent(id)}&erinnerung_stufe=lt.${stufe}`;
    const a = await fetch(restAdresse(filter), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ erinnerung_stufe: stufe }),
    });
    if (!a.ok) throw new Error(`erinnerungStufeBeanspruchen fehlgeschlagen: HTTP ${a.status}`);
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen.length === 1;
  },

  // Teil 4: Abmeldung per Token (ohne Login). Setzt erinnerungen_aus=true, wo das
  // Token passt. 1 geänderte Zeile = erfolgreich.
  async erinnerungAbmelden(token: string): Promise<boolean> {
    const filter = `trainers?erinnerung_token=eq.${encodeURIComponent(token)}`;
    const a = await fetch(restAdresse(filter), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ erinnerungen_aus: true }),
    });
    if (!a.ok) throw new Error(`erinnerungAbmelden fehlgeschlagen: HTTP ${a.status}`);
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen.length >= 1;
  },

  // ── Manuelle Profil-Erinnerung (Verwaltung) ──
  // Alle Trainer mit vollem Datensatz (service_role). select=* ist robust gegen
  // noch fehlende Spalten (land/ist_test/user_id). Der Kern blendet Test/Spam aus.
  async profilErinnerungKandidaten(): Promise<TrainerProfil[]> {
    return await lesen<TrainerProfil>("trainers?select=*&order=created_at.desc&limit=2000");
  },
  // Trainer-ID → letzte manuelle Erinnerung (ISO). gesendet_am absteigend; der
  // erste Treffer je Trainer ist die jüngste. Fehlt die Tabelle (Migration nicht
  // eingespielt), wirft lesen – der Kern fängt das als "migration fehlt" ab.
  async profilErinnerungLetzteMap(): Promise<Record<string, ProfilErinnerungLetzte>> {
    // Mit Art (Spalte art aus Migration 2026-11-09-01). Fehlt sie noch (HTTP 400),
    // ohne art erneut lesen und Art als "manuell" annehmen (Vorgabe der Spalte).
    type Zeile = { trainer_id: string; gesendet_am: string; art?: string };
    let zeilen: Zeile[];
    try {
      zeilen = await lesen<Zeile>(
        "profil_erinnerungen?select=trainer_id,gesendet_am,art&order=gesendet_am.desc&limit=100000",
      );
    } catch (_f) {
      zeilen = await lesen<Zeile>(
        "profil_erinnerungen?select=trainer_id,gesendet_am&order=gesendet_am.desc&limit=100000",
      );
    }
    const map: Record<string, ProfilErinnerungLetzte> = {};
    for (const z of zeilen) {
      if (z.trainer_id && !(z.trainer_id in map)) {
        const art: ProfilErinnerungArt = z.art === "automatisch" ? "automatisch" : "manuell";
        map[z.trainer_id] = { am: z.gesendet_am, art };
      }
    }
    return map;
  },
  // Letzter Versand EINES Trainers (ISO), egal welcher Art – für den gemeinsamen
  // 3-Tage-Abstand beim manuellen Senden.
  async profilErinnerungLetzte(trainerId: string): Promise<string | null> {
    const zeilen = await lesen<{ gesendet_am: string }>(
      `profil_erinnerungen?trainer_id=eq.${encodeURIComponent(trainerId)}&select=gesendet_am&order=gesendet_am.desc&limit=1`,
    );
    return zeilen[0]?.gesendet_am ?? null;
  },
  // Protokolliert eine verschickte Erinnerung (service_role) mit Art. gesendet_am
  // wird von der DB gesetzt (default now()).
  async profilErinnerungProtokollieren(trainerId: string, fehlende: string[], art: ProfilErinnerungArt): Promise<void> {
    const a = await fetch(restAdresse("profil_erinnerungen"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "return=minimal" },
      body: JSON.stringify({ trainer_id: trainerId, fehlende_angaben: fehlende, art }),
    });
    if (!a.ok) throw new Error(`profil_erinnerungen schreiben fehlgeschlagen: HTTP ${a.status}`);
  },
  // Best effort: Auth-user_id → E-Mail bestätigt (email_confirmed_at gesetzt).
  // Scheitert der Zugriff, leere Map → der Kern markiert "unbekannt" statt falsch.
  async emailBestaetigtMap(): Promise<Record<string, boolean>> {
    try {
      const basis = pflicht("SUPABASE_URL").replace(/\/+$/, "");
      const map: Record<string, boolean> = {};
      for (let seite = 1; seite <= 20; seite++) {
        const r = await fetch(`${basis}/auth/v1/admin/users?per_page=200&page=${seite}`, { headers: restKopf() });
        if (!r.ok) break;
        const d = await r.json().catch(() => null) as { users?: { id: string; email_confirmed_at?: string | null }[] } | null;
        const users = d?.users ?? [];
        for (const u of users) if (u && u.id) map[u.id] = !!u.email_confirmed_at;
        if (users.length < 200) break;
      }
      return map;
    } catch {
      return {};
    }
  },

  // ── B4: Warteliste ("Benachrichtige mich" = trainer_alerts) ──
  // B4.1: ein noch aktiver Eintrag einer E-Mail (optional auf eine PLZ begrenzt),
  // inkl. Abmelde-Token – für die Bestätigungsmail. Fehlerkörper weitergeben,
  // damit kern.ts eine fehlende Spalte (Migration) erkennt.
  async alertFuerBestaetigung(email: string, plz: string) {
    let filter = `trainer_alerts?kunden_email=ilike.${encodeURIComponent(email)}` +
      `&aktiv=eq.true&select=id,kunden_email,kunden_name,plz,stadt,abmelde_token&limit=1`;
    if (plz) filter += `&plz=eq.${encodeURIComponent(plz)}`;
    const r = await fetch(restAdresse(filter), { headers: restKopf() });
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`alertFuerBestaetigung fehlgeschlagen: HTTP ${r.status} ${t}`); }
    const zeilen = await r.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen[0] ? zeilen[0] : null;
  },

  // B4.2: offene (aktiv=true) Einträge einer PLZ – mit land (Rückfall ohne land,
  // falls Migration 2026-11-07-02 noch nicht eingespielt).
  async alertsOffeneFuerPlz(plz: string) {
    const basis = `trainer_alerts?plz=eq.${encodeURIComponent(plz)}&aktiv=eq.true`;
    const spalten = "id,kunden_email,kunden_name,plz,stadt,abmelde_token";
    let r = await fetch(restAdresse(`${basis}&select=${spalten},land&limit=500`), { headers: restKopf() });
    if (!r.ok && r.status === 400) {
      r = await fetch(restAdresse(`${basis}&select=${spalten}&limit=500`), { headers: restKopf() });
    }
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`alertsOffeneFuerPlz fehlgeschlagen: HTTP ${r.status} ${t}`); }
    const zeilen = await r.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen : [];
  },

  // B4.2: EINEN Eintrag atomar schließen (aktiv=true -> false). 1 Zeile = beansprucht.
  async alertSchliessen(id: string): Promise<boolean> {
    const filter = `trainer_alerts?id=eq.${encodeURIComponent(id)}&aktiv=eq.true`;
    const r = await fetch(restAdresse(filter), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ aktiv: false }),
    });
    if (!r.ok) throw new Error(`alertSchliessen fehlgeschlagen: HTTP ${r.status}`);
    const zeilen = await r.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen.length >= 1;
  },

  // B4.1: Abmeldung per Token (ohne Login). Setzt aktiv=false, wo das Token passt.
  async alertAbmelden(token: string): Promise<boolean> {
    const filter = `trainer_alerts?abmelde_token=eq.${encodeURIComponent(token)}`;
    const r = await fetch(restAdresse(filter), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ aktiv: false }),
    });
    if (!r.ok) throw new Error(`alertAbmelden fehlgeschlagen: HTTP ${r.status}`);
    const zeilen = await r.json().catch(() => []);
    return Array.isArray(zeilen) && zeilen.length >= 1;
  },

  // B4.2: PLZ eines Trainers per Kennung.
  async trainerPlzNachId(id: string): Promise<string | null> {
    const zeilen = await lesen<{ plz?: string | null }>(
      `trainers?id=eq.${encodeURIComponent(id)}&select=plz`,
    );
    const p = zeilen[0]?.plz;
    return p ? String(p) : null;
  },

  // Land eindeutig: Land eines Trainers per Kennung. Fehlt die Spalte land
  // (HTTP 400), null -> es wird nicht nach Land gefiltert (Verhalten wie zuvor).
  async trainerLandNachId(id: string): Promise<string | null> {
    const r = await fetch(
      restAdresse(`trainers?id=eq.${encodeURIComponent(id)}&select=land`),
      { headers: restKopf() },
    );
    if (!r.ok) return null;
    const zeilen = await r.json().catch(() => []);
    const l = Array.isArray(zeilen) && zeilen[0] ? zeilen[0].land : null;
    return l ? String(l) : null;
  },

  // B7: alle Zahlen für den Abendbericht. Die Logik (jeder Zählwert einzeln
  // abgesichert, Fehler werden gesammelt) liegt testbar in kern.ts; hier nur die
  // echten REST-Helfer lesen/zaehlen hineingeben. Ein einzelner fehlgeschlagener
  // Zählwert (z. B. HTTP 404 auf trainer_alerts) bricht den Bericht nicht mehr ab.
  async abendberichtZahlen() {
    // Zusätzlich: fehlgeschlagene/teilweise Cron-Läufe der letzten 24 h aus
    // admin_protokoll (erinnerungen/unbeantwortet/abendbericht) für den Abschnitt
    // „Technische Hinweise". Gefiltert wird in abendberichtZahlenHolen.
    return await abendberichtZahlenHolen(lesen, zaehlen, Date.now(), (seitISO) =>
      lesen<{ aktion: string; ergebnis: string | null }>(
        `admin_protokoll?aktion=in.(erinnerungen,unbeantwortet,abendbericht)&zeitpunkt=gt.${encodeURIComponent(seitISO)}&select=aktion,ergebnis&order=zeitpunkt.desc&limit=50`,
      ).then((r) => r.map((x) => ({ aktion: x.aktion, ergebnis: String(x.ergebnis ?? "") }))));
  },

  // Admin-Aktion: loescht eine Zeile in trainers oder kunden (service_role).
  // Tabelle zusaetzlich hier abgesichert (nur diese zwei).
  async adminZeileLoeschen(tabelle: string, id: string): Promise<number> {
    if (tabelle !== "trainers" && tabelle !== "kunden") {
      throw new Error("adminZeileLoeschen: unzulaessige Tabelle");
    }
    const a = await fetch(
      restAdresse(`${tabelle}?id=eq.${encodeURIComponent(id)}`),
      {
        method: "DELETE",
        headers: { ...restKopf(), Prefer: "return=representation" },
      },
    );
    if (!a.ok) throw new Error(`adminZeileLoeschen fehlgeschlagen: HTTP ${a.status}`);
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen.length : 0;
  },

  // ── Teil 5: Sperren/Entsperren/endgueltiges Loeschen (service_role) ──
  async personUserId(tabelle, id) {
    const zeilen = await lesen<{ user_id: string | null }>(
      `${tabelle}?id=eq.${encodeURIComponent(id)}&select=user_id`,
    );
    return zeilen[0]?.user_id ?? null;
  },

  // Auth-Admin-API: ban_duration setzt/loest die Sperre. "876000h" ~ 100 Jahre
  // (dauerhaft), "none" entsperrt. apikey/Authorization sind der geheime
  // Schluessel aus restKopf().
  async authSperren(userId, gesperrt) {
    const basis = pflicht("SUPABASE_URL").replace(/\/+$/, "");
    const a = await fetch(`${basis}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: restKopf(),
      body: JSON.stringify({ ban_duration: gesperrt ? "876000h" : "none" }),
    });
    if (!a.ok) throw new Error(`authSperren fehlgeschlagen: HTTP ${a.status}`);
  },

  async authNutzerLoeschen(userId) {
    const basis = pflicht("SUPABASE_URL").replace(/\/+$/, "");
    const a = await fetch(`${basis}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: restKopf(),
    });
    // 404 = schon weg; alles andere ist ein Fehler.
    if (!a.ok && a.status !== 404) throw new Error(`authNutzerLoeschen fehlgeschlagen: HTTP ${a.status}`);
  },

  async personGesperrtSetzen(tabelle, id, gesperrt) {
    const a = await fetch(restAdresse(`${tabelle}?id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ gesperrt }),
    });
    // Der Antwort-Rumpf traegt den Postgres-Fehlercode (z. B. 42703 „column
    // gesperrt does not exist", falls Migration 2026-10-31-09 fehlt). kern.ts
    // leitet daraus einen verstaendlichen Hinweis ab, darum den Text mitgeben.
    if (!a.ok) {
      const txt = await a.text().catch(() => "");
      throw new Error(`personGesperrtSetzen fehlgeschlagen: HTTP ${a.status} ${txt}`);
    }
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen.length : 0;
  },

  // Land eindeutig (07.11.2026): die Spalte land einer trainers/kunden-Zeile
  // setzen – fuer die Admin-Zuordnung „PLZ ohne Land". Der Antwort-Rumpf traegt
  // bei fehlender Spalte den Postgres-Fehlercode, den kern.ts in einen Hinweis
  // uebersetzt.
  async adminLandSetzen(tabelle, id, land) {
    const a = await fetch(restAdresse(`${tabelle}?id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ land }),
    });
    if (!a.ok) {
      const txt = await a.text().catch(() => "");
      throw new Error(`adminLandSetzen fehlgeschlagen: HTTP ${a.status} ${txt}`);
    }
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen.length : 0;
  },
  async adminKoordinatenSetzen(trainerId, lat, lng) {
    const a = await fetch(restAdresse(`trainers?id=eq.${encodeURIComponent(trainerId)}`), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!a.ok) {
      const txt = await a.text().catch(() => "");
      throw new Error(`adminKoordinatenSetzen fehlgeschlagen: HTTP ${a.status} ${txt}`);
    }
    const zeilen = await a.json().catch(() => []);
    return Array.isArray(zeilen) ? zeilen.length : 0;
  },

  // ── Weg B (12.11.): serverseitige Umkreis-Suche mit Zwischenspeicher ──

  // Zwischenspeicher lesen. Fehlt die Tabelle (Migration 2026-11-12-01 nicht
  // eingespielt) → null, dann fragt plzAufloesen den externen Dienst.
  async plzOrtLesen(land: string, plz: string) {
    try {
      const r = await fetch(
        restAdresse(`plz_orte?land=eq.${encodeURIComponent(land)}&plz=eq.${encodeURIComponent(plz)}&select=ort,lat,lng&limit=1`),
        { headers: restKopf() },
      );
      if (!r.ok) return null;
      const zeilen = await r.json().catch(() => []);
      const z = Array.isArray(zeilen) ? zeilen[0] : null;
      if (!z || z.lat == null || z.lng == null) return null;
      return { ort: z.ort ?? null, lat: Number(z.lat), lng: Number(z.lng) };
    } catch {
      return null;
    }
  },

  // Zwischenspeicher schreiben (Upsert auf PK (land,plz)).
  async plzOrtSpeichern(e) {
    const a = await fetch(restAdresse("plz_orte"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        land: e.land, plz: e.plz, ort: e.ort, lat: e.lat, lng: e.lng,
        quelle: e.quelle, abgerufen_am: new Date().toISOString(),
      }),
    });
    if (!a.ok) {
      const txt = await a.text().catch(() => "");
      throw new Error(`plzOrtSpeichern fehlgeschlagen: HTTP ${a.status} ${txt}`);
    }
  },

  // Externer Standortdienst. Supabase Edge Functions (Deno Deploy) erlauben
  // ausgehende HTTPS-Aufrufe (443) – dieselbe Art Aufruf wie die Meta-CAPI; nur
  // ausgehendes SMTP (25/587) ist gesperrt. Zeitlimit 5 s. null = PLZ dort
  // unbekannt; { netzfehler:true } = Dienst nicht erreichbar/Zeitüberschreitung.
  async plzAbrufExtern(land: string, plz: string) {
    const lk = String(land).toLowerCase();
    try {
      const r = await fetch(`https://api.zippopotam.us/${lk}/${encodeURIComponent(plz)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (r.status === 404) return null; // PLZ dort unbekannt
      if (!r.ok) return { netzfehler: true as const };
      const d = await r.json().catch(() => null);
      const p = d && Array.isArray(d.places) ? d.places[0] : null;
      if (!p) return null;
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { ort: p["place name"] ?? null, lat, lng };
    } catch {
      return { netzfehler: true as const };
    }
  },

  // Suchkandidaten: gleiches Land, aktiv, nicht gesperrt, nicht Test, Vor-Ort/
  // beides, mit Koordinaten. Nur erlaubte Felder + lat/lng. land case-insensitiv.
  async trainerKandidatenFuerSuche(land: string) {
    const cols = "id,created_at,vorname,nachname,stadt,plz,land,trainingsart,trainingsort,erfahrung,spezialisierungen,sprachen,trainingsorte,bio,preis_stunde,preis_monat,zertifikate,calendly,avatar_url,verifiziert,verfuegbarkeit,lat,lng";
    return await lesen<import("./kern.ts").TrainerKandidat>(
      `trainers?select=${cols}` +
        `&aktiv=eq.true&gesperrt=not.is.true&ist_test=not.is.true` +
        `&trainingsort=in.(vor_ort,beides)` +
        `&land=ilike.${encodeURIComponent(land)}` +
        `&lat=not.is.null&lng=not.is.null&limit=2000`,
    );
  },

  // Ein einzelner freigegebener Trainer (für /trainer-profil): erlaubte Felder +
  // lat/lng, nur aktiv, nicht gesperrt, nicht Test.
  async trainerFuerProfil(id: string) {
    const cols = "id,created_at,vorname,nachname,stadt,plz,land,trainingsart,trainingsort,erfahrung,spezialisierungen,sprachen,trainingsorte,bio,preis_stunde,preis_monat,zertifikate,calendly,avatar_url,verifiziert,verfuegbarkeit,lat,lng";
    const zeilen = await lesen<import("./kern.ts").TrainerKandidat>(
      `trainers?id=eq.${encodeURIComponent(id)}&select=${cols}` +
        `&aktiv=eq.true&gesperrt=not.is.true&ist_test=not.is.true&limit=1`,
    );
    return zeilen[0] ?? null;
  },

  // Kurze Kundenzeile zur Sitzung: zuerst über user_id, sonst E-Mail. Fehlen die
  // letzte_such_*-Spalten (Migration nicht eingespielt), ohne sie laden.
  async kundeKurzNachAuth(userId: string, email: string) {
    const voll = "id,email,letzte_such_lat,letzte_such_lng";
    const knapp = "id,email";
    for (const spalten of [voll, knapp]) {
      for (const filter of [
        userId ? `user_id=eq.${encodeURIComponent(userId)}` : "",
        email ? `email=ilike.${encodeURIComponent(email)}` : "",
      ]) {
        if (!filter) continue;
        const r = await fetch(
          restAdresse(`kunden?${filter}&select=${spalten}&limit=1`),
          { headers: restKopf() },
        );
        if (!r.ok) break; // Spaltenfehler → nächste (knappe) Spaltenliste
        const zeilen = await r.json().catch(() => []);
        const z = Array.isArray(zeilen) ? zeilen[0] : null;
        if (z) {
          return {
            id: String(z.id),
            email: String(z.email ?? email ?? ""),
            letzte_such_lat: z.letzte_such_lat != null ? Number(z.letzte_such_lat) : null,
            letzte_such_lng: z.letzte_such_lng != null ? Number(z.letzte_such_lng) : null,
          };
        }
      }
    }
    return null;
  },

  // Letzte Such-Mitte des Kunden speichern (für die Profil-Sichtprüfung).
  async kundeSuchMitteSetzen(kundeId: string, lat: number, lng: number) {
    await schreiben(`kunden?id=eq.${encodeURIComponent(kundeId)}`, {
      letzte_such_lat: lat, letzte_such_lng: lng, letzte_such_am: new Date().toISOString(),
    });
  },

  // Hat der Kunde (E-Mail) bereits eine Anfrage an diesen Trainer?
  async kundeHatAnfrageAnTrainer(kundenEmail: string, trainerId: string) {
    const zeilen = await lesen<{ id: string }>(
      `anfragen?kunden_email=ilike.${encodeURIComponent(kundenEmail)}` +
        `&trainer_id=eq.${encodeURIComponent(trainerId)}&select=id&limit=1`,
    );
    return zeilen.length >= 1;
  },

  // Trainer mit PLZ, aber ohne Koordinaten (für den Admin-Nachtrag „alle").
  async trainerOhneKoordinaten() {
    return await lesen<{ id: string; plz: string | null; land: string | null; vorname?: string | null; nachname?: string | null }>(
      `trainers?select=id,plz,land,vorname,nachname` +
        `&or=(lat.is.null,lng.is.null)&plz=not.is.null&ist_test=not.is.true&limit=2000`,
    );
  },

  // Erst loeschen; verhindert ein Fremdschluessel das Loeschen (HTTP 409,
  // PostgreSQL 23503 – z. B. verknuepfte Anfragen), dann die personenbezogenen
  // Felder anonymisieren, statt die Fremddaten (Anfragen des Kunden) zu loeschen.
  async zeileLoeschenOderAnonymisieren(tabelle, id) {
    const del = await fetch(restAdresse(`${tabelle}?id=eq.${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: { ...restKopf(), Prefer: "return=representation" },
    });
    if (del.ok) {
      const z = await del.json().catch(() => []);
      return { geloescht: Array.isArray(z) && z.length > 0, anonymisiert: false };
    }
    if (del.status === 409) {
      const felder: Record<string, unknown> = {
        vorname: "Gelöscht",
        nachname: "",
        email: `geloescht+${id}@vexfit.invalid`,
        gesperrt: true,
      };
      if (tabelle === "trainers") felder.aktiv = false;
      const pa = await fetch(restAdresse(`${tabelle}?id=eq.${encodeURIComponent(id)}`), {
        method: "PATCH",
        headers: { ...restKopf(), Prefer: "return=representation" },
        body: JSON.stringify(felder),
      });
      if (!pa.ok) throw new Error(`Anonymisieren fehlgeschlagen: HTTP ${pa.status}`);
      const z = await pa.json().catch(() => []);
      return { geloescht: false, anonymisiert: Array.isArray(z) && z.length > 0 };
    }
    throw new Error(`Loeschen fehlgeschlagen: HTTP ${del.status}`);
  },

  // Protokoll (Tabelle admin_protokoll). Best effort: ein Fehler hier soll die
  // eigentliche Aktion nicht scheitern lassen, wird aber geloggt.
  async protokoll(eintrag) {
    try {
      const a = await fetch(restAdresse("admin_protokoll"), {
        method: "POST",
        headers: { ...restKopf(), Prefer: "return=minimal" },
        body: JSON.stringify(eintrag),
      });
      if (!a.ok) console.error("vexfit-automation: protokoll HTTP", a.status);
    } catch (fehler) {
      console.error("vexfit-automation: protokoll", String(fehler));
    }
  },

  // B4e: eine Anfrage mit Kundendaten (service_role).
  async anfrageNachId(id: string) {
    // trainer_name und nachricht zusaetzlich fuer die S3-Admin-Freigabe.
    const zeilen = await lesen<Record<string, unknown>>(
      `anfragen?id=eq.${encodeURIComponent(id)}` +
        `&select=id,trainer_id,trainer_name,kunden_email,kunden_name,ziel,nachricht,alternativen_gesendet`,
    );
    const z = zeilen[0];
    return z
      ? {
        id: String(z.id),
        trainer_id: z.trainer_id as string | null,
        trainer_name: z.trainer_name as string | null,
        kunden_email: z.kunden_email as string | null,
        kunden_name: z.kunden_name as string | null,
        ziel: z.ziel as string | null,
        nachricht: z.nachricht as string | null,
        alternativen_gesendet: z.alternativen_gesendet as boolean | null,
      }
      : null;
  },

  // B4e: ein Trainer mit den Feldern fuer die Zuordnung.
  async trainerVollNachId(id: string) {
    // S4: land zusaetzlich (fuer den Gleiches-Land-Filter der Alternativen),
    // mit Rueckfall ohne land, falls die Spalte fehlt.
    const basis = `trainers?id=eq.${encodeURIComponent(id)}`;
    const sp = "id,vorname,nachname,stadt,spezialisierungen";
    let r = await fetch(restAdresse(`${basis}&select=${sp},land`), { headers: restKopf() });
    if (!r.ok && r.status === 400) r = await fetch(restAdresse(`${basis}&select=${sp}`), { headers: restKopf() });
    if (!r.ok) throw new Error(`trainerVollNachId fehlgeschlagen: HTTP ${r.status}`);
    const zeilen = await r.json().catch(() => []);
    const z = Array.isArray(zeilen) ? zeilen[0] : null;
    return z
      ? {
        id: String(z.id),
        vorname: z.vorname as string | null,
        nachname: z.nachname as string | null,
        stadt: z.stadt as string | null,
        spezialisierungen: z.spezialisierungen as string[] | null,
        land: (z.land ?? null) as string | null,
      }
      : null;
  },

  // B4e: freigegebene, nicht gesperrte Trainer als Kandidaten fuer die
  // "Passt nicht?"-/48-Stunden-Alternativen. "Admin entscheidet allein"
  // (Migration 2026-10-31-10): sichtbar/vorschlagbar = aktiv=true UND nicht
  // gesperrt; verifiziert ist KEINE Bedingung - sonst bekaemen frisch
  // freigegebene, noch nicht verifizierte Trainer nie eine Empfehlung.
  async aktiveTrainerFuerAlternativen() {
    // S4: zusaetzliche Felder fuer Land-/Mindeststaerke-/Test-Filter in kern.ts.
    // ist_test wird mitgelesen, damit Test/Spam-Konten NICHT vorgeschlagen werden;
    // fehlt die Spalte (Migration 2026-11-06-02 nicht eingespielt), Rueckfall ohne.
    const basis = `trainers?aktiv=eq.true&gesperrt=is.false`;
    const sp = "id,vorname,nachname,stadt,spezialisierungen,land,avatar_url,trainingsart,trainingsort,preis_stunde,bio";
    let r = await fetch(restAdresse(`${basis}&select=${sp},ist_test`), { headers: restKopf() });
    if (!r.ok && r.status === 400) r = await fetch(restAdresse(`${basis}&select=${sp}`), { headers: restKopf() });
    if (!r.ok) throw new Error(`aktiveTrainerFuerAlternativen fehlgeschlagen: HTTP ${r.status}`);
    const zeilen = await r.json().catch(() => []);
    return (Array.isArray(zeilen) ? zeilen : []) as {
      id: string;
      vorname?: string | null;
      nachname?: string | null;
      stadt?: string | null;
      spezialisierungen?: string[] | null;
      land?: string | null;
      avatar_url?: string | null;
      trainingsart?: string | null;
      trainingsort?: string | null;
      preis_stunde?: number | string | null;
      bio?: string | null;
      ist_test?: boolean | null;
    }[];
  },

  // B4e: vermerkt, dass Alternativen verschickt wurden (einmal je Anfrage).
  alternativenVermerken(anfrageId: string) {
    return schreiben(
      `anfragen?id=eq.${encodeURIComponent(anfrageId)}`,
      { alternativen_gesendet: true },
    );
  },

  // B4e (48-Stunden-Fall): offene, unbeantwortete Anfragen aelter als vorISO,
  // fuer die noch keine Alternativen raus sind. beantwortet_am steht nur, wenn
  // der Trainer angenommen/abgelehnt hat (Trigger) - das ist der echte
  // Antwort-Nachweis. Der Status-Ausschluss faengt Altbestand ab, der noch vor
  // dem Trigger angenommen/abgelehnt wurde (beantwortet_am dort leer);
  // weitergeleitet=false schliesst bereits bezahlte/zugestellte Anfragen aus.
  async offeneAnfragenVor(vorISO: string) {
    const zeilen = await lesen<Record<string, unknown>>(
      `anfragen?beantwortet_am=is.null&alternativen_gesendet=eq.false` +
        `&weitergeleitet=eq.false&created_at=lt.${encodeURIComponent(vorISO)}` +
        `&or=(status.is.null,status.not.in.(angenommen,abgelehnt))` +
        `&select=id,trainer_id,kunden_email,kunden_name,ziel,alternativen_gesendet` +
        `&order=created_at.asc&limit=200`,
    );
    return zeilen.map((z) => ({
      id: String(z.id),
      trainer_id: z.trainer_id as string | null,
      kunden_email: z.kunden_email as string | null,
      kunden_name: z.kunden_name as string | null,
      ziel: z.ziel as string | null,
      alternativen_gesendet: z.alternativen_gesendet as boolean | null,
    }));
  },

  // B4e (48-Stunden-Fall): Geheimnis fuer den Zeitplan-Aufruf.
  cronGeheimnis(): string | undefined {
    return Deno.env.get("VEXFIT_CRON_KEY") || undefined;
  },

  adminHinweis(): string | undefined {
    return Deno.env.get("ADMIN_PASSWORT_HINWEIS") || undefined;
  },

  // ── Admin-Dashboard neu, Teil 3: Kicken (vollstaendiges Loeschen) ──

  // Die Speicher-Dateien einer Person. Nur Trainer haben Uploads: avatar_url und
  // galerie[] sind vollstaendige oeffentliche Adressen (Pfad extrahieren),
  // zertifikat_datei ist bereits ein Pfad. video_url ist ein externer Link
  // (YouTube/Vimeo) – keine hochgeladene Datei, daher nicht im Storage.
  async personDateien(tabelle, id) {
    const leer = { avatars: [] as string[], galerie: [] as string[], zertifikate: [] as string[] };
    if (tabelle !== "trainers") return leer;
    const zeilen = await lesen<{ avatar_url?: string | null; galerie?: string[] | null; zertifikat_datei?: string | null }>(
      `trainers?id=eq.${encodeURIComponent(id)}&select=avatar_url,galerie,zertifikat_datei`,
    );
    const t = zeilen[0];
    if (!t) return leer;
    const pfadAus = (url: unknown, prefix: string): string | null => {
      const s = String(url ?? "");
      const i = s.indexOf(prefix);
      return i >= 0 ? decodeURIComponent(s.slice(i + prefix.length)) : null;
    };
    const avatars: string[] = [];
    const galerie: string[] = [];
    const zertifikate: string[] = [];
    const av = pfadAus(t.avatar_url, "/storage/v1/object/public/avatars/");
    if (av) avatars.push(av);
    for (const g of (Array.isArray(t.galerie) ? t.galerie : [])) {
      const p = pfadAus(g, "/storage/v1/object/public/galerie/");
      if (p) galerie.push(p);
    }
    if (t.zertifikat_datei) zertifikate.push(String(t.zertifikat_datei));
    return { avatars, galerie, zertifikate };
  },

  // Objekte aus einem Storage-Bucket loeschen (Bulk-Endpunkt, service_role).
  async storageLoeschen(bucket, pfade) {
    if (!pfade.length) return;
    const basis = pflicht("SUPABASE_URL").replace(/\/+$/, "");
    const a = await fetch(`${basis}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: restKopf(),
      body: JSON.stringify({ prefixes: pfade }),
    });
    if (!a.ok && a.status !== 404) {
      throw new Error(`storageLoeschen ${bucket}: HTTP ${a.status}`);
    }
  },

  // DB-Transaktion admin_person_kicken(p_art, p_id): loescht Person + eigene
  // Daten, laesst Zahlungen anonymisiert erhalten. Fehlt die Funktion (Migration
  // 2026-11-01-02 nicht eingespielt), meldet PostgREST PGRST202/42883 – der
  // Fehlertext geht mit, damit kern.ts einen klaren Hinweis daraus macht.
  async personKickenDb(tabelle, id) {
    const art = tabelle === "trainers" ? "trainer" : "kunde";
    const a = await fetch(restAdresse("rpc/admin_person_kicken"), {
      method: "POST",
      headers: restKopf(),
      body: JSON.stringify({ p_art: art, p_id: id }),
    });
    const txt = await a.text().catch(() => "");
    if (!a.ok) throw new Error(`personKickenDb: HTTP ${a.status} ${txt}`);
    try {
      const d = JSON.parse(txt);
      return (d && typeof d === "object" && !Array.isArray(d)) ? d as Record<string, number> : {};
    } catch {
      return {};
    }
  },

  // ── Teil A: Web Push ──
  vapidVorhanden(): boolean {
    return vapidKonfig() !== null;
  },

  // Alle Abos lesen. Fehlt die Tabelle (Migration 2026-11-01-05 nicht
  // eingespielt), leere Liste statt Fehler – Push ist dann einfach aus.
  async pushAbosLesen(): Promise<PushAbo[]> {
    try {
      return await lesen<PushAbo>(
        "push_abos?select=id,endpoint,p256dh,auth,geraet,erstellt_am&order=erstellt_am.asc",
      );
    } catch (fehler) {
      console.log("vexfit-automation: push_abos nicht lesbar (Migration?)", String(fehler));
      return [];
    }
  },

  // Abo anlegen bzw. bei gleichem Endpoint aktualisieren (Upsert auf endpoint).
  async pushAboSpeichern(abo: PushAbo): Promise<void> {
    const a = await fetch(restAdresse("push_abos?on_conflict=endpoint"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        endpoint: abo.endpoint,
        p256dh: abo.p256dh,
        auth: abo.auth,
        geraet: abo.geraet ?? null,
      }),
    });
    if (!a.ok) throw new Error(`pushAboSpeichern fehlgeschlagen: HTTP ${a.status}`);
  },

  async pushAboEntfernen(endpoint: string): Promise<void> {
    await fetch(
      restAdresse(`push_abos?endpoint=eq.${encodeURIComponent(endpoint)}`),
      { method: "DELETE", headers: { ...restKopf(), Prefer: "return=minimal" } },
    );
  },

  async pushAboEntfernenNachId(id: string): Promise<number> {
    const a = await fetch(
      restAdresse(`push_abos?id=eq.${encodeURIComponent(id)}`),
      { method: "DELETE", headers: { ...restKopf(), Prefer: "return=representation" } },
    );
    if (!a.ok) throw new Error(`pushAboEntfernenNachId fehlgeschlagen: HTTP ${a.status}`);
    const z = await a.json().catch(() => []);
    return Array.isArray(z) ? z.length : 0;
  },

  pushEinzelSenden(abo, nachricht) {
    return webPushEinzelSenden(abo, nachricht);
  },

  // ── G1 (13.11.): „Wunsch abgeben" ──
  // Legt einen Wunsch an (service_role) und gibt die neue Kennung zurueck.
  async wunschAnlegen(felder) {
    const a = await fetch(restAdresse("wuensche"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify(felder),
    });
    if (!a.ok) {
      const t = await a.text().catch(() => "");
      throw new Error(`wunschAnlegen fehlgeschlagen: HTTP ${a.status} ${t}`);
    }
    const z = await a.json().catch(() => []);
    return Array.isArray(z) && z[0] ? String(z[0].id) : null;
  },

  // ── G2 (13.11.): Verwaltung „Wünsche" + Vermittlung ──
  // Alle Wünsche, neueste zuerst (service_role).
  async wuenscheListe() {
    const cols =
      "id,status,vorname,email,telefon,nachricht,land,plz,stadt,ziel,haeufigkeit,zeiten,budget,trainer_id,anfrage_id,quelle,kampagne,referrer,verdacht,erstellt_am";
    return await lesen<import("./kern.ts").WunschZeile>(
      `wuensche?select=${cols}&order=erstellt_am.desc&limit=1000`,
    );
  },
  // Ein Wunsch per Kennung.
  async wunschNachId(id: string) {
    const cols =
      "id,status,vorname,email,telefon,nachricht,land,plz,stadt,ziel,haeufigkeit,zeiten,budget,trainer_id,anfrage_id,erstellt_am";
    const zeilen = await lesen<import("./kern.ts").WunschZeile>(
      `wuensche?id=eq.${encodeURIComponent(id)}&select=${cols}&limit=1`,
    );
    return zeilen[0] ?? null;
  },
  // Status/Felder eines Wunsches setzen; gibt die Zahl geänderter Zeilen zurück.
  async wunschSetzen(id: string, felder: Record<string, unknown>) {
    const r = await fetch(restAdresse(`wuensche?id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify(felder),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`wunschSetzen fehlgeschlagen: HTTP ${r.status} ${t}`);
    }
    const z = await r.json().catch(() => []);
    return Array.isArray(z) ? z.length : 0;
  },
  // Eine Anfrage anlegen (für die Vermittlung eines Wunsches) und id zurückgeben.
  async anfrageAnlegen(felder: Record<string, unknown>) {
    const a = await fetch(restAdresse("anfragen"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "return=representation" },
      body: JSON.stringify(felder),
    });
    if (!a.ok) {
      const t = await a.text().catch(() => "");
      throw new Error(`anfrageAnlegen fehlgeschlagen: HTTP ${a.status} ${t}`);
    }
    const z = await a.json().catch(() => []);
    return Array.isArray(z) && z[0] ? String(z[0].id) : null;
  },
  // Trainer-Kandidaten für die Vermittlung: gleiches Land, mit lat/lng, Vor Ort/
  // beides, nicht Test/gesperrt – AUCH noch nicht freigegebene (kein aktiv-Filter).
  async trainerAlleFuerVermittlung(land: string) {
    const cols =
      "id,vorname,nachname,stadt,plz,land,trainingsart,trainingsort,erfahrung,spezialisierungen,bio,preis_stunde,telefon,avatar_url,verifiziert,aktiv,lat,lng";
    return await lesen<Record<string, unknown>>(
      `trainers?select=${cols}` +
        `&gesperrt=not.is.true&ist_test=not.is.true` +
        `&trainingsort=in.(vor_ort,beides)` +
        `&land=ilike.${encodeURIComponent(land)}` +
        `&lat=not.is.null&lng=not.is.null&limit=2000`,
    );
  },
  // Vormerkung in die Warteliste (trainer_alerts). Mit land, Rückfall ohne land,
  // falls die Spalte fehlt (Migration 2026-11-07-02 nicht eingespielt).
  async wartelisteVormerken(felder) {
    const basis: Record<string, unknown> = {
      kunden_email: felder.kunden_email,
      kunden_name: felder.kunden_name ?? null,
      plz: felder.plz ?? null,
      stadt: felder.stadt ?? null,
      aktiv: true,
    };
    const mitLand = { ...basis, land: felder.land ?? null };
    let r = await fetch(restAdresse("trainer_alerts"), {
      method: "POST",
      headers: { ...restKopf(), Prefer: "return=minimal" },
      body: JSON.stringify(mitLand),
    });
    if (!r.ok && r.status === 400) {
      r = await fetch(restAdresse("trainer_alerts"), {
        method: "POST",
        headers: { ...restKopf(), Prefer: "return=minimal" },
        body: JSON.stringify(basis),
      });
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`wartelisteVormerken fehlgeschlagen: HTTP ${r.status} ${t}`);
    }
  },

  melden(text, mehr) {
    console.error(`vexfit-automation: ${text}`, mehr ?? "");
  },
};

Deno.serve((anfrage: Request) => bearbeiten(anfrage, anschluesse));
