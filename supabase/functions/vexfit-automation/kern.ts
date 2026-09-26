// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/kern.ts
//
// Die Logik der Vexfit-Automation: Eingaben pruefen, Mails bauen, entscheiden
// was in die Datenbank geschrieben wird. Kein Netz, keine Datenbank, kein SMTP
// — alles Aeussere kommt als Anschluesse herein. Dadurch ohne Netz pruefbar
// (kern_test.ts).
//
// Inhalte sind 1:1 aus dem gesicherten n8n-Workflow "Vexfit Komplette
// Automation v4" (id Y5kidNvNEvIbGDeC, aktiv, Stand 2026-09-19) uebernommen:
// Betreffzeilen, Mailtexte, Zahlungslinks, Bedingungen, Tabellen und Spalten.
//
// Zum Maskieren: alle sechs Mail-Nodes des Workflows stehen auf
// `emailFormat: "text"` — es gibt keine HTML-Mail. HTML zu maskieren wuerde
// den sichtbaren Text veraendern (aus "A & B" wuerde "A &amp; B") und damit
// genau das brechen, was 1:1 bleiben soll. Was hier stattdessen geschieht:
// Betreffzeilen werden von Zeilenumbruechen befreit und jede Empfaengeradresse
// wird vor dem Versand geprueft. Die gemeinsame Maskier-Funktion liegt in
// ../_shared/text.ts und wird von trainer-alert benutzt, das HTML verschickt.

import { adresseGueltig, betreffSaeubern } from "../_shared/text.ts";

// ============================================================================
// Festwerte aus dem Workflow
// ============================================================================

/** Absender aller sechs Mail-Nodes. */
export const ABSENDER = "vexfit.info@gmail.com";

/** Empfaenger der drei Benachrichtigungen an Jakob. */
export const BETREIBER = "vexfit.info@gmail.com";

/** Zahlungslink aus "Email Trainer - ERSTE Anfrage 49,99€". */
export const LINK_ERSTE = "https://buy.stripe.com/eVqdR9gopdNhczNbhw2oE00";

/** Zahlungslink aus "Email Trainer - WEITERE Anfrage 9,99€". */
export const LINK_WEITERE = "https://buy.stripe.com/7sYbJ1fkl8sX8jxfxM2oE01";

/** Der einzige Stripe-Ereignistyp, den der Workflow abonniert hatte. */
export const STRIPE_EREIGNIS = "checkout.session.completed";

/** Herkunft, die im Browser erlaubt ist. Beleg: CNAME enthaelt vexfit.app,
 *  und alle 58 Verweise im Repo lauten https://vexfit.app — kein www. */
export const ERLAUBTE_HERKUNFT = "https://vexfit.app";

/** Obergrenze fuer den Anfragekoerper der Browser-Pfade. */
export const KOERPER_GRENZE = 20000;

/**
 * Laengengrenzen je Feld. Der Workflow hatte keine — n8n nahm alles an.
 * Bewusst weit: sie halten Unsinn heraus, ohne eine echte Eingabe zu kuerzen.
 */
export const GRENZEN: Record<string, number> = {
  vorname: 200,
  nachname: 200,
  email: 320,
  stadt: 200,
  trainingsart: 200,
  ziel: 500,
  kunden_name: 200,
  kunden_email: 320,
  nachricht: 2000,
  trainer_id: 100,
  trainer_name: 400,
};

// ============================================================================
// Typen
// ============================================================================

export interface Trainer {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  stripe_bezahlt?: boolean | null;
}

export interface Anfrage {
  id?: string;
  kunden_name?: string | null;
  kunden_email?: string | null;
  ziel?: string | null;
  nachricht?: string | null;
}

export interface Mail {
  an: string;
  betreff: string;
  text: string;
}

export interface StripeSitzung {
  customer_details?: { email?: string | null } | null;
  amount_total?: number | null;
}

export interface StripeEreignis {
  id: string;
  type: string;
  data: { object: StripeSitzung };
}

/** Alles Aeussere. Die Function setzt hier die echten Zugriffe ein. */
export interface Anschluesse {
  trainerNachId(id: string): Promise<Trainer | null>;
  trainerNachEmail(email: string): Promise<Trainer | null>;
  offeneAnfrage(trainerId: string): Promise<Anfrage | null>;
  trainerBezahltMarkieren(email: string): Promise<void>;
  anfragenWeitergeleitetMarkieren(trainerId: string): Promise<void>;
  mailSenden(mail: Mail): Promise<void>;
  /** Signatur pruefen. Gibt null zurueck, wenn sie nicht stimmt. */
  stripeEreignis(
    rumpf: string,
    signatur: string | null,
  ): Promise<StripeEreignis | null>;
  ereignisSchonVerarbeitet(id: string): Promise<boolean>;
  ereignisVermerken(id: string, typ: string): Promise<void>;
  /** Optionaler Zusatz fuer die Trainer-Mail an Jakob, aus einem Secret. */
  adminHinweis?(): string | undefined;
  melden?(text: string, mehr?: unknown): void;
}

// ============================================================================
// Eingaben pruefen
// ============================================================================

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

export interface Pruefergebnis {
  ok: boolean;
  grund?: string;
}

/**
 * Gemeinsame Pruefung der Browser-Pfade.
 *
 * Der Workflow prueft NICHTS — n8n nahm jeden Koerper an. Pflicht ist deshalb
 * nur, was der Ablauf zwingend braucht, damit kein heutiger Aufrufer ploetzlich
 * eine 400 bekommt:
 *   /neuer-trainer, /neuer-kunde → email (gueltiges Format)
 *   /neue-anfrage               → trainer_id
 * `suche.html` schickt zum Beispiel einen leeren `nachname` und eine leere
 * `stadt`; das muss weiter durchgehen.
 */
export function eingabePruefen(
  koerper: unknown,
  pflicht: string[],
): Pruefergebnis {
  if (!koerper || typeof koerper !== "object" || Array.isArray(koerper)) {
    return { ok: false, grund: "Es wurden keine Angaben uebermittelt." };
  }
  const daten = koerper as Record<string, unknown>;
  for (const feld of pflicht) {
    if (!text(daten[feld])) {
      return { ok: false, grund: `Das Feld "${feld}" fehlt.` };
    }
  }
  for (const [feld, grenze] of Object.entries(GRENZEN)) {
    if (text(daten[feld]).length > grenze) {
      return {
        ok: false,
        grund: `Das Feld "${feld}" ist zu lang (hoechstens ${grenze} Zeichen).`,
      };
    }
  }
  if (pflicht.includes("email") && !adresseGueltig(text(daten.email))) {
    return { ok: false, grund: "Die E-Mail-Adresse ist nicht gueltig." };
  }
  return { ok: true };
}

/** Wert so einsetzen, wie n8n es tat: fehlt er, steht dort nichts. */
function w(wert: unknown): string {
  return wert === null || wert === undefined ? "" : String(wert);
}

// ============================================================================
// Mails — Wortlaut, Zeilenumbrueche und Reihenfolge 1:1 aus dem Workflow
// ============================================================================

/** Node "Email Jakob - Neuer Trainer". */
export function mailNeuerTrainer(
  body: Record<string, unknown>,
  adminHinweis?: string,
): Mail {
  const hinweis = adminHinweis ? `\nPasswort: ${adminHinweis}` : "";
  return {
    an: BETREIBER,
    betreff: betreffSaeubern(
      `🆕 Neuer Trainer: ${w(body.vorname)} ${w(body.nachname)}`,
    ),
    text: "Neuer Trainer registriert! 🆕\n" +
      "\n" +
      `👤 Name: ${w(body.vorname)} ${w(body.nachname)}\n` +
      `📧 Email: ${w(body.email)}\n` +
      `📍 Stadt: ${w(body.stadt)}\n` +
      `💪 Trainingsart: ${w(body.trainingsart)}\n` +
      "\n" +
      "→ Jetzt aktivieren:\n" +
      "https://vexfit.app/admin.html" + hinweis,
  };
}

/** Node "Email Jakob - Neuer Kunde". */
export function mailNeuerKunde(body: Record<string, unknown>): Mail {
  return {
    an: BETREIBER,
    betreff: betreffSaeubern(
      `🎯 Neuer Kunde: ${w(body.vorname)} ${w(body.nachname)}`,
    ),
    text: "Neuer Kunde registriert! 🎯\n" +
      "\n" +
      `👤 Name: ${w(body.vorname)} ${w(body.nachname)}\n` +
      `📧 Email: ${w(body.email)}\n` +
      `📍 Stadt: ${w(body.stadt)}\n` +
      `🎯 Ziel: ${w(body.ziel)}\n` +
      "\n" +
      "→ Supabase:\n" +
      "https://supabase.com/dashboard/project/hbapzwxdehfgnputrfjf",
  };
}

/** Node "Email Trainer - ERSTE Anfrage 49,99€" (stripe_bezahlt ist nicht true). */
export function mailErsteAnfrage(
  trainer: Trainer,
  body: Record<string, unknown>,
): Mail {
  return {
    an: w(trainer.email),
    betreff: betreffSaeubern(
      "🎉 Erste Kunden-Anfrage auf Vexfit – Abo aktivieren!",
    ),
    text: `Hi ${w(trainer.vorname)},\n` +
      "\n" +
      "du hast deine erste Kunden-Anfrage erhalten! 🚀\n" +
      "\n" +
      `👤 Kunde: ${w(body.kunden_name)}\n` +
      `🎯 Ziel: ${w(body.ziel)}\n` +
      `💬 Nachricht: ${w(body.nachricht)}\n` +
      "\n" +
      "Um die Kontaktdaten zu erhalten aktiviere dein Abo:\n" +
      "\n" +
      `👉 ${LINK_ERSTE}\n` +
      "\n" +
      "€49,99/Monat · Monatlich kündbar\n" +
      "Nach der Zahlung bekommst du sofort alle Kunden-Daten!\n" +
      "\n" +
      "Viel Erfolg! 💪\n" +
      "Jakob von Vexfit",
  };
}

/** Node "Email Trainer - WEITERE Anfrage 9,99€" (stripe_bezahlt ist true). */
export function mailWeitereAnfrage(
  trainer: Trainer,
  body: Record<string, unknown>,
): Mail {
  return {
    an: w(trainer.email),
    betreff: betreffSaeubern(
      "🎉 Neue Kunden-Anfrage auf Vexfit – Jetzt freischalten!",
    ),
    text: `Hi ${w(trainer.vorname)},\n` +
      "\n" +
      "du hast eine neue Kunden-Anfrage! 🚀\n" +
      "\n" +
      `👤 Kunde: ${w(body.kunden_name)}\n` +
      `🎯 Ziel: ${w(body.ziel)}\n` +
      `💬 Nachricht: ${w(body.nachricht)}\n` +
      "\n" +
      "Einmalig freischalten für €9,99:\n" +
      "\n" +
      `👉 ${LINK_WEITERE}\n` +
      "\n" +
      "Nach der Zahlung bekommst du sofort alle Kunden-Daten!\n" +
      "\n" +
      "Viel Erfolg! 💪\n" +
      "Jakob von Vexfit",
  };
}

/** Node "Kunden-Daten an Trainer". */
export function mailKundenDaten(
  trainer: Trainer,
  anfrage: Anfrage,
  zahlerEmail: string,
): Mail {
  return {
    an: zahlerEmail,
    betreff: betreffSaeubern(
      "✅ Zahlung bestätigt – Hier sind deine Kunden-Daten!",
    ),
    text: `Hi ${w(trainer.vorname)},\n` +
      "\n" +
      "deine Zahlung war erfolgreich! ✅\n" +
      "\n" +
      "Hier sind deine Kunden-Daten:\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      `👤 Name: ${w(anfrage.kunden_name)}\n` +
      `📧 Email: ${w(anfrage.kunden_email)}\n` +
      `🎯 Ziel: ${w(anfrage.ziel)}\n` +
      `💬 Nachricht: ${w(anfrage.nachricht)}\n` +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "\n" +
      "Viel Erfolg! 💪\n" +
      "Jakob von Vexfit",
  };
}

/** Node "💰 Email Jakob - Zahlung". */
export function mailZahlungAnJakob(
  trainer: Trainer,
  zahlerEmail: string,
  betragCent: number | null | undefined,
): Mail {
  const betrag = betragCent === null || betragCent === undefined
    ? ""
    : String(betragCent / 100);
  return {
    an: BETREIBER,
    betreff: betreffSaeubern(`💰 Zahlung: ${zahlerEmail}`),
    text: "💰 Neue Zahlung eingegangen!\n" +
      "\n" +
      `👤 Trainer: ${w(trainer.vorname)} ${w(trainer.nachname)}\n` +
      `📧 Email: ${zahlerEmail}\n` +
      `💶 Betrag: ${betrag}€\n` +
      "\n" +
      "✅ Als bezahlt markiert\n" +
      "✅ Kunden-Daten weitergeleitet\n" +
      "\n" +
      "→ Admin: https://vexfit.app/admin.html",
  };
}

// ============================================================================
// Antworten und CORS
// ============================================================================

export function corsKopf(herkunft: string | null): Record<string, string> {
  if (herkunft !== ERLAUBTE_HERKUNFT) return {};
  return {
    "Access-Control-Allow-Origin": ERLAUBTE_HERKUNFT,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function antwort(
  status: number,
  koerper: unknown,
  herkunft: string | null = null,
): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsKopf(herkunft),
    },
  });
}

/** Der Pfad hinter dem Function-Namen, z. B. "/neuer-trainer" → "neuer-trainer". */
export function pfadTeil(adresse: string): string {
  try {
    const teile = new URL(adresse).pathname.split("/").filter(Boolean);
    const i = teile.indexOf("vexfit-automation");
    return i >= 0 ? (teile[i + 1] ?? "") : (teile[teile.length - 1] ?? "");
  } catch {
    return "";
  }
}

// ============================================================================
// Der Ablauf
// ============================================================================

/** Eine Mail nur verschicken, wenn die Adresse taugt. Gibt zurueck, ob gesendet wurde. */
async function sendeWennAdresseTaugt(
  a: Anschluesse,
  mail: Mail,
): Promise<boolean> {
  if (!adresseGueltig(mail.an)) {
    a.melden?.("Empfaengeradresse abgelehnt", { betreff: mail.betreff });
    return false;
  }
  await a.mailSenden(mail);
  return true;
}

async function koerperLesen(
  anfrageObjekt: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const roh = await anfrageObjekt.text();
    if (roh.length > KOERPER_GRENZE) return null;
    const d = JSON.parse(roh);
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    return d as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Ein Aufruf. Vier Pfade, genau die vier Ausloeser des Workflows:
 *   /neuer-trainer  Webhook 1  → Mail an Jakob
 *   /neuer-kunde    Webhook 2  → Mail an Jakob
 *   /neue-anfrage   Webhook 3  → Trainer nachschlagen, erste oder weitere Anfrage
 *   /stripe         Stripe     → checkout.session.completed
 */
export async function bearbeiten(
  anfrageObjekt: Request,
  a: Anschluesse,
): Promise<Response> {
  const herkunft = anfrageObjekt.headers.get("Origin");
  const pfad = pfadTeil(anfrageObjekt.url);

  // Stripe schickt keine Herkunft; der Browser schickt immer eine.
  if (herkunft !== null && herkunft !== ERLAUBTE_HERKUNFT) {
    return antwort(403, { fehler: "Herkunft nicht erlaubt" }, null);
  }

  if (anfrageObjekt.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsKopf(herkunft) });
  }
  if (anfrageObjekt.method !== "POST") {
    return antwort(405, { fehler: "nur POST" }, herkunft);
  }

  switch (pfad) {
    case "neuer-trainer":
      return await neuerTrainer(anfrageObjekt, a, herkunft);
    case "neuer-kunde":
      return await neuerKunde(anfrageObjekt, a, herkunft);
    case "neue-anfrage":
      return await neueAnfrage(anfrageObjekt, a, herkunft);
    case "stripe":
      return await stripe(anfrageObjekt, a);
    default:
      return antwort(404, { fehler: "unbekannter Pfad" }, herkunft);
  }
}

async function neuerTrainer(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const body = await koerperLesen(r);
  if (!body) {
    return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  }
  const geprueft = eingabePruefen(body, ["email"]);
  if (!geprueft.ok) return antwort(400, { fehler: geprueft.grund }, herkunft);

  const gesendet = await sendeWennAdresseTaugt(
    a,
    mailNeuerTrainer(body, a.adminHinweis?.()),
  );
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0 }, herkunft);
}

async function neuerKunde(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const body = await koerperLesen(r);
  if (!body) {
    return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  }
  const geprueft = eingabePruefen(body, ["email"]);
  if (!geprueft.ok) return antwort(400, { fehler: geprueft.grund }, herkunft);

  const gesendet = await sendeWennAdresseTaugt(a, mailNeuerKunde(body));
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0 }, herkunft);
}

/**
 * Node "Trainer Status prüfen" → "Erste oder weitere Anfrage?".
 * Die Weiche im Workflow: stripe_bezahlt === true → WEITERE (9,99 €),
 * sonst → ERSTE (49,99 €). Findet der Nachschlag keinen Trainer, endet der
 * Zweig in n8n ohne Wirkung — hier genauso.
 */
async function neueAnfrage(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const body = await koerperLesen(r);
  if (!body) {
    return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  }
  const geprueft = eingabePruefen(body, ["trainer_id"]);
  if (!geprueft.ok) return antwort(400, { fehler: geprueft.grund }, herkunft);

  const trainer = await a.trainerNachId(String(body.trainer_id));
  if (!trainer) {
    a.melden?.("kein Trainer zu dieser Kennung", {
      trainer_id: body.trainer_id,
    });
    return antwort(200, { ok: true, mails: 0 }, herkunft);
  }

  const mail = trainer.stripe_bezahlt === true
    ? mailWeitereAnfrage(trainer, body)
    : mailErsteAnfrage(trainer, body);
  const gesendet = await sendeWennAdresseTaugt(a, mail);
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0 }, herkunft);
}

/**
 * Stripe-Pfad. Reihenfolge wie im Workflow:
 * Trainer finden → offene Anfrage holen → Trainer als bezahlt markieren →
 * Kundendaten an den Trainer + Anfrage als weitergeleitet markieren →
 * Zahlungsmail an Jakob.
 *
 * Wichtig und 1:1 uebernommen: findet "Offene Anfrage holen" nichts, laeuft in
 * n8n der ganze Rest des Zweiges nicht — dann wird auch NICHT als bezahlt
 * markiert. Eine Zahlung ohne offene Anfrage bleibt also folgenlos.
 */
async function stripe(r: Request, a: Anschluesse): Promise<Response> {
  const rumpf = await r.text();
  const ereignis = await a.stripeEreignis(
    rumpf,
    r.headers.get("stripe-signature"),
  );
  if (!ereignis) return antwort(400, { fehler: "Signatur nicht gueltig" });

  if (ereignis.type !== STRIPE_EREIGNIS) {
    return antwort(200, { ok: true, uebersprungen: "anderer Ereignistyp" });
  }
  if (await a.ereignisSchonVerarbeitet(ereignis.id)) {
    return antwort(200, { ok: true, uebersprungen: "schon verarbeitet" });
  }

  const sitzung = ereignis.data?.object ?? {};
  const zahlerEmail = String(sitzung.customer_details?.email ?? "");
  if (!zahlerEmail) {
    await a.ereignisVermerken(ereignis.id, ereignis.type);
    return antwort(200, { ok: true, uebersprungen: "keine Zahleradresse" });
  }

  const trainer = await a.trainerNachEmail(zahlerEmail);
  if (!trainer) {
    await a.ereignisVermerken(ereignis.id, ereignis.type);
    a.melden?.("kein Trainer zu dieser Zahlung");
    return antwort(200, { ok: true, uebersprungen: "kein Trainer" });
  }

  const anfrage = await a.offeneAnfrage(trainer.id);
  if (!anfrage) {
    await a.ereignisVermerken(ereignis.id, ereignis.type);
    a.melden?.("keine offene Anfrage — wie im Workflow passiert nichts weiter");
    return antwort(200, { ok: true, uebersprungen: "keine offene Anfrage" });
  }

  await a.trainerBezahltMarkieren(zahlerEmail);
  const mailsGesendet = await sendeWennAdresseTaugt(
      a,
      mailKundenDaten(trainer, anfrage, zahlerEmail),
    )
    ? 1
    : 0;
  await a.anfragenWeitergeleitetMarkieren(trainer.id);
  const jakobGesendet = await sendeWennAdresseTaugt(
    a,
    mailZahlungAnJakob(trainer, zahlerEmail, sitzung.amount_total),
  );

  await a.ereignisVermerken(ereignis.id, ereignis.type);
  return antwort(200, {
    ok: true,
    mails: mailsGesendet + (jakobGesendet ? 1 : 0),
    trainer_markiert: true,
    anfrage_weitergeleitet: true,
  });
}
