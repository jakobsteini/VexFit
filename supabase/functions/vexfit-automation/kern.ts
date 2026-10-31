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
// Gemeinsames Mail-Geruest (HTML + Textfassung) fuer beide Edge Functions.
import {
  mailRahmen,
  type MailAngaben,
  mailText as baueText,
} from "../_shared/mailgeruest.ts";

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

/** Das einzige Konto mit Admin-Zugriff. WORTGLEICH wie in admin.html:348
 *  (ADMIN_USER_ID) und in migrations/2026-09-20-admin-vollzugriff.sql
 *  (ist_vexfit_admin). Keine neue Kennung erfunden. */
export const ADMIN_ID = "ee744b01-0a70-4da5-a19b-6c905c8479b5";

/** Obergrenze fuer den Anfragekoerper der Browser-Pfade. */
export const KOERPER_GRENZE = 20000;

/**
 * Fix 7b (Spam-Schutz): verstecktes Koederfeld des anonymen suche.html-Formulars.
 * Steht dieser Feldname im Koerper, ist der Aufruf das anonyme
 * Benachrichtigungs-Formular (Honeypot + Ratengrenze). Fehlt er, gilt der
 * angemeldete Pfad (z. B. Registrierung): dann ist ein gueltiges Zugangs-Token
 * noetig, genau wie bei /neue-anfrage.
 */
export const KOEDER_FELD = "webseite";

/** Fix 7b: hoechstens 1 anonymer Eintrag je E-Mail in 24 h. */
export const SPAM_PRO_EMAIL_24H = 1;
/** Fix 7b: hoechstens 20 anonyme Eintraege je IP-Adresse in 1 h. */
export const SPAM_PRO_IP_1H = 20;

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
  /** Baustein 1: gesetzt = Studio-Trainer (angestellt), zahlt nichts. NULL =
   *  normaler Trainer, dann gilt die unveraenderte Zahlungslogik. */
  studio_standort_id?: string | null;
}

export interface Anfrage {
  /** Pflicht: seit E2 wird genau DIESE Zeile als weitergeleitet markiert. */
  id: string;
  kunden_name?: string | null;
  kunden_email?: string | null;
  ziel?: string | null;
  nachricht?: string | null;
  created_at?: string | null;
  /** Bearbeitungsstand: 'ausstehend' | 'angenommen' | 'abgelehnt' (Beleg:
   *  trainer-bereich.html beantworteAnfrage). Abgelehnte werden nicht freigeschaltet. */
  status?: string | null;
}

/** B4e: eine Anfrage mit den Feldern, die der "Passt nicht"-Pfad braucht. */
export interface AnfrageVoll {
  id: string;
  trainer_id?: string | null;
  kunden_email?: string | null;
  kunden_name?: string | null;
  ziel?: string | null;
  alternativen_gesendet?: boolean | null;
}

/** B4e: ein Trainer mit den Feldern fuer die Alternativen-Zuordnung. */
export interface TrainerVoll {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  stadt?: string | null;
  spezialisierungen?: string[] | null;
}

export interface Mail {
  an: string;
  betreff: string;
  /** Reine Textfassung (text/plain). */
  text: string;
  /** HTML-Fassung (text/html). */
  html: string;
}

export interface StripeSitzung {
  customer_details?: { email?: string | null } | null;
  amount_total?: number | null;
  /** Vom Zahlungslink durchgereicht: die Trainer-Kennung (bevorzugte Zuordnung). */
  client_reference_id?: string | null;
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
  /** Die AELTESTE offene Anfrage des Trainers (E2), oder null. */
  aeltesteOffeneAnfrage(trainerId: string): Promise<Anfrage | null>;
  trainerBezahltMarkieren(email: string): Promise<void>;
  /** Genau EINE Anfrage als weitergeleitet markieren (E2). */
  anfrageWeitergeleitetMarkieren(anfrageId: string): Promise<void>;
  mailSenden(mail: Mail): Promise<void>;
  /** Signatur pruefen. Gibt null zurueck, wenn sie nicht stimmt. */
  stripeEreignis(
    rumpf: string,
    signatur: string | null,
  ): Promise<StripeEreignis | null>;
  ereignisSchonVerarbeitet(id: string): Promise<boolean>;
  ereignisVermerken(id: string, typ: string): Promise<void>;
  /** Teil 8: Nutzer zu einem Zugangs-Token (ueber Supabase Auth), sonst null. */
  benutzerAusToken(token: string): Promise<{ id: string; email: string } | null>;
  /** Teil 8: Anzahl Anfragen dieses Kunden seit einem Zeitpunkt (Ratenbremse). */
  anfragenAnzahlSeit(kundenEmail: string, seitISO: string): Promise<number>;
  /** Fix 7b: Zahl anonymer Formular-Eintraege dieser E-Mail seit einem Zeitpunkt. */
  spamProEmailSeit(email: string, seitISO: string): Promise<number>;
  /** Fix 7b: Zahl anonymer Formular-Eintraege dieser IP-Adresse seit einem Zeitpunkt. */
  spamProIpSeit(ip: string, seitISO: string): Promise<number>;
  /** Fix 7b: einen anonymen Formular-Eintrag vormerken (fuer die Grenze). */
  spamEintragVormerken(email: string, ip: string): Promise<void>;
  /** Admin-Aktion: setzt feste Felder (aktiv/stripe_bezahlt) einer Trainerzeile
   *  mit service_role. Gibt die Zahl geaenderter Zeilen zurueck. */
  adminTrainerSetzen(id: string, felder: Record<string, unknown>): Promise<number>;
  /** B4e: eine Anfrage per Kennung (mit Kundendaten, service_role). */
  anfrageNachId?(id: string): Promise<AnfrageVoll | null>;
  /** B4e: ein Trainer mit den fuer die Zuordnung noetigen Feldern. */
  trainerVollNachId?(id: string): Promise<TrainerVoll | null>;
  /** B4e: alle freigeschalteten, verifizierten Trainer (Kandidaten). */
  aktiveVerifizierteTrainer?(): Promise<TrainerVoll[]>;
  /** B4e: vermerkt, dass fuer eine Anfrage Alternativen verschickt wurden. */
  alternativenVermerken?(anfrageId: string): Promise<void>;
  /** Admin-Aktion: loescht eine Zeile in trainers oder kunden (service_role).
   *  Gibt die Zahl geloeschter Zeilen zurueck. */
  adminZeileLoeschen(tabelle: string, id: string): Promise<number>;
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

/**
 * Kundenname, Ziel und Nachricht aus dem Webhook-Rumpf.
 *
 * Die beiden ausgelieferten Aufrufer schicken UNTERSCHIEDLICHE Namen:
 *   kunden-bereich.html:435-441  kunden_name, ziel, nachricht
 *   profil.html:350-355          kunde_name, kunde_ziel, kunde_nachricht
 * Der n8n-Workflow las nur die erste Schreibweise, deshalb kamen die drei
 * Zeilen bei Anfragen ueber profil.html leer an. Hier werden beide gelesen.
 *
 * Warum nicht aus der Tabelle `anfragen`? profil.html ruft den Webhook in
 * Schritt 0 auf und legt die Zeile erst in Schritt 1 an (profil.html:344-378)
 * — zum Zeitpunkt des Aufrufs gibt es die Zeile also noch gar nicht.
 * kunden-bereich.html macht es umgekehrt (Zeile 445 anlegen, Zeile 455 rufen).
 * Der Rumpf ist die einzige Quelle, die in beiden Faellen da ist.
 */
export function kundenAngaben(
  body: Record<string, unknown>,
): { name: unknown; ziel: unknown; nachricht: unknown } {
  const erste = (a: unknown, b: unknown) =>
    a === undefined || a === null || a === "" ? b : a;
  return {
    name: erste(body.kunden_name, body.kunde_name),
    ziel: erste(body.ziel, body.kunde_ziel),
    nachricht: erste(body.nachricht, body.kunde_nachricht),
  };
}

/** Wert so einsetzen, wie n8n es tat: fehlt er, steht dort nichts. */
function w(wert: unknown): string {
  return wert === null || wert === undefined ? "" : String(wert);
}

// ============================================================================
// Mails — Wortlaut, Zeilenumbrueche und Reihenfolge 1:1 aus dem Workflow
// ============================================================================

/** Baut aus Betreff und Angaben eine fertige Mail (Text + HTML aus dem Geruest). */
function baueMail(an: string, betreff: string, angaben: MailAngaben): Mail {
  return {
    an,
    betreff: betreffSaeubern(betreff),
    text: baueText(angaben),
    html: mailRahmen(angaben),
  };
}

const ADMIN_LINK = "https://vexfit.app/admin.html";

/** Mail 5 (intern an BETREIBER): neuer Trainer. */
export function mailNeuerTrainer(body: Record<string, unknown>): Mail {
  return baueMail(
    BETREIBER,
    `Neuer Trainer: ${w(body.vorname)} ${w(body.nachname)}`,
    {
      ueberschrift: "Neuer Trainer registriert",
      datenZeilen: [
        {
          beschriftung: "Name",
          wert: `${w(body.vorname)} ${w(body.nachname)}`.trim(),
        },
        { beschriftung: "E-Mail", wert: w(body.email) },
        { beschriftung: "Stadt", wert: w(body.stadt) },
        { beschriftung: "Trainingsart", wert: w(body.trainingsart) },
      ],
      knopfText: "Im Admin öffnen",
      knopfLink: ADMIN_LINK,
      grundZeile: "Interne Benachrichtigung.",
    },
  );
}

/** Mail 6 (intern an BETREIBER): neuer Kunde. */
export function mailNeuerKunde(body: Record<string, unknown>): Mail {
  return baueMail(
    BETREIBER,
    `Neuer Kunde: ${w(body.vorname)} ${w(body.nachname)}`,
    {
      ueberschrift: "Neuer Kunde registriert",
      datenZeilen: [
        {
          beschriftung: "Name",
          wert: `${w(body.vorname)} ${w(body.nachname)}`.trim(),
        },
        { beschriftung: "E-Mail", wert: w(body.email) },
        { beschriftung: "Stadt", wert: w(body.stadt) },
        { beschriftung: "Ziel", wert: w(body.ziel) },
      ],
      knopfText: "Im Admin öffnen",
      knopfLink: ADMIN_LINK,
      grundZeile: "Interne Benachrichtigung.",
    },
  );
}

/**
 * Haengt an einen Zahlungslink die Trainer-Zuordnung an:
 * ?client_reference_id=<trainer-id>&prefilled_email=<E-Mail URL-kodiert>.
 * Stripe stellt client_reference_id und die vorausgefuellte E-Mail im
 * checkout.session.completed-Ereignis wieder bereit, damit die Zahlung sicher
 * dem richtigen Trainer zugeordnet werden kann - auch wenn bei Stripe eine
 * andere Adresse eingetippt wird.
 */
export function zahlungslink(basis: string, trainer: Trainer): string {
  const teile: string[] = [];
  if (trainer.id) teile.push("client_reference_id=" + encodeURIComponent(trainer.id));
  if (trainer.email) teile.push("prefilled_email=" + encodeURIComponent(trainer.email));
  return teile.length ? basis + "?" + teile.join("&") : basis;
}

/** Mail 1 (an den Trainer): erste Anfrage (stripe_bezahlt ist nicht true). */
export function mailErsteAnfrage(
  trainer: Trainer,
  body: Record<string, unknown>,
): Mail {
  const kunde = kundenAngaben(body);
  return baueMail(w(trainer.email), "Deine erste Kundenanfrage auf Vexfit", {
    ueberschrift: "Deine erste Kundenanfrage",
    absatz:
      `Hallo ${w(trainer.vorname)}, über Vexfit hat dich jemand angefragt. ` +
      "Um Name und E-Mail-Adresse zu sehen, aktiviere dein Abo.",
    datenZeilen: [
      { beschriftung: "Ziel", wert: w(kunde.ziel) },
      { beschriftung: "Nachricht", wert: w(kunde.nachricht) },
    ],
    knopfText: "Abo aktivieren",
    knopfLink: zahlungslink(LINK_ERSTE, trainer),
    hinweis:
      "49,99 € pro Monat, monatlich kündbar. Die Kontaktdaten erhältst du " +
      "unmittelbar nach der Zahlung.",
    grundZeile:
      "Du erhältst diese E-Mail, weil du ein Trainerprofil auf Vexfit angelegt hast.",
  });
}

/** Mail 2 (an den Trainer): weitere Anfrage (stripe_bezahlt ist true). */
export function mailWeitereAnfrage(
  trainer: Trainer,
  body: Record<string, unknown>,
): Mail {
  const kunde = kundenAngaben(body);
  return baueMail(w(trainer.email), "Neue Kundenanfrage auf Vexfit", {
    ueberschrift: "Neue Kundenanfrage",
    absatz: `Hallo ${w(trainer.vorname)}, du hast eine neue Anfrage erhalten.`,
    datenZeilen: [
      { beschriftung: "Ziel", wert: w(kunde.ziel) },
      { beschriftung: "Nachricht", wert: w(kunde.nachricht) },
    ],
    knopfText: "Anfrage freischalten",
    knopfLink: zahlungslink(LINK_WEITERE, trainer),
    hinweis:
      "9,99 € einmalig. Die Kontaktdaten erhältst du unmittelbar nach der Zahlung.",
    grundZeile:
      "Du erhältst diese E-Mail, weil du ein Trainerprofil auf Vexfit angelegt hast.",
  });
}

/**
 * Baustein 1 (Studio-Trainer): eine Anfrage an einen angestellten Studio-Trainer.
 * Er zahlt NICHTS, deshalb kein Zahlungslink: die Kontaktdaten stehen direkt in
 * der Mail (wie mailKundenDaten nach einer Zahlung). Quelle der Daten ist der
 * Anfrage-Rumpf (kundenAngaben + kunden_email), der bei /neue-anfrage vorliegt.
 */
export function mailStudioAnfrage(
  trainer: Trainer,
  body: Record<string, unknown>,
): Mail {
  const kunde = kundenAngaben(body);
  const kundenEmail = String(body.kunden_email ?? body.kunde_email ?? "");
  return baueMail(w(trainer.email), "Neue Kundenanfrage auf Vexfit", {
    ueberschrift: "Neue Kundenanfrage",
    absatz:
      `Hallo ${w(trainer.vorname)}, du hast über Vexfit eine neue Anfrage ` +
      "erhalten. Als Studio-Trainer siehst du die Kontaktdaten sofort - ohne " +
      "Zusatzkosten. Melde dich am besten noch heute.",
    datenZeilen: [
      { beschriftung: "Name", wert: w(kunde.name) },
      { beschriftung: "E-Mail", wert: kundenEmail },
      { beschriftung: "Ziel", wert: w(kunde.ziel) },
      { beschriftung: "Nachricht", wert: w(kunde.nachricht) },
    ],
    grundZeile:
      "Du erhältst diese E-Mail, weil du als Studio-Trainer auf Vexfit gelistet bist.",
  });
}

/** Mail 3 (an den Trainer, nach der Zahlung): Kundendaten. */
export function mailKundenDaten(
  trainer: Trainer,
  anfrage: Anfrage,
  zahlerEmail: string,
): Mail {
  return baueMail(zahlerEmail, "Deine Kundendaten", {
    ueberschrift: "Zahlung bestätigt",
    absatz:
      `Hallo ${w(trainer.vorname)}, hier sind die Kontaktdaten. Melde dich am ` +
      "besten noch heute - Anfragen werden kalt, wenn man wartet.",
    datenZeilen: [
      { beschriftung: "Name", wert: w(anfrage.kunden_name) },
      { beschriftung: "E-Mail", wert: w(anfrage.kunden_email) },
      { beschriftung: "Ziel", wert: w(anfrage.ziel) },
      { beschriftung: "Nachricht", wert: w(anfrage.nachricht) },
    ],
    grundZeile:
      "Du erhältst diese E-Mail, weil du eine Anfrage auf Vexfit freigeschaltet hast.",
  });
}

/** Mail 7 (intern an BETREIBER): Zahlung eingegangen. */
export function mailZahlungAnJakob(
  trainer: Trainer,
  zahlerEmail: string,
  betragCent: number | null | undefined,
  anfrageWeitergeleitet: boolean,
): Mail {
  const betrag = betragCent === null || betragCent === undefined
    ? ""
    : String(betragCent / 100);
  // E1 (Jakob, 26.09.2026): eine Zahlung ohne offene Anfrage wird trotzdem
  // verbucht; dann lautet der Status "keine offene Anfrage".
  const status = anfrageWeitergeleitet
    ? "Kundendaten weitergeleitet"
    : "keine offene Anfrage";
  return baueMail(BETREIBER, `Zahlung: ${zahlerEmail}`, {
    ueberschrift: "Zahlung eingegangen",
    datenZeilen: [
      {
        beschriftung: "Trainer",
        wert: `${w(trainer.vorname)} ${w(trainer.nachname)}`.trim(),
      },
      { beschriftung: "E-Mail", wert: zahlerEmail },
      { beschriftung: "Betrag", wert: betrag ? `${betrag} €` : "" },
      { beschriftung: "Status", wert: status },
    ],
    knopfText: "Im Admin öffnen",
    knopfLink: ADMIN_LINK,
    grundZeile: "Interne Benachrichtigung.",
  });
}

/**
 * Mail an Jakob, wenn eine Stripe-Zahlung KEINEM Trainer zugeordnet werden kann
 * (weder ueber client_reference_id noch ueber die eingetippte E-Mail). Das
 * Ereignis wird dann NICHT als erledigt vermerkt, damit Stripe es erneut
 * zustellt und das Geld nicht still verfaellt.
 */
export function mailKeinTrainer(
  zahlerEmail: string,
  ereignisId: string,
  betragCent: number | null | undefined,
): Mail {
  const betrag = betragCent === null || betragCent === undefined
    ? ""
    : String(betragCent / 100);
  return baueMail(BETREIBER, "Stripe-Zahlung ohne passenden Trainer", {
    ueberschrift: "Zahlung ohne passenden Trainer",
    absatz:
      "Zu dieser Stripe-Zahlung wurde kein Trainer gefunden. Das Ereignis " +
      "wurde NICHT als erledigt vermerkt (Stripe stellt es erneut zu). Bitte pruefen.",
    datenZeilen: [
      { beschriftung: "Betrag", wert: betrag ? `${betrag} €` : "" },
      { beschriftung: "Stripe-Ereignis", wert: ereignisId },
      { beschriftung: "Eingegebene E-Mail", wert: zahlerEmail },
    ],
    knopfText: "Im Admin öffnen",
    knopfLink: ADMIN_LINK,
    grundZeile: "Interne Benachrichtigung.",
  });
}

// ============================================================================
// B4e - "Passt nicht?": zwei passende Alternativen
// ============================================================================

/** Profiladresse eines Trainers (die einzige Adresse in der Alternativen-Mail). */
function profilAdresse(id: string): string {
  return `${ERLAUBTE_HERKUNFT}/profil.html?id=${encodeURIComponent(id)}`;
}

/**
 * Waehlt bis zu zwei Alternativen zu einer Anfrage: andere Trainer mit
 * mindestens einer gemeinsamen Spezialisierung. Gleiche Stadt zuerst, der Rest
 * danach. Der urspruengliche Trainer wird ausgeschlossen. Reine Funktion (die
 * Kandidatenliste kommt von aussen), damit ohne Netz pruefbar.
 */
export function alternativenFinden(
  original: TrainerVoll,
  kandidaten: TrainerVoll[],
): TrainerVoll[] {
  const spez = new Set((original.spezialisierungen ?? []).map((s) => s.toLowerCase()));
  const stadt = (original.stadt ?? "").trim().toLowerCase();
  const passend = kandidaten.filter((t) =>
    t.id !== original.id &&
    (t.spezialisierungen ?? []).some((s) => spez.has(s.toLowerCase()))
  );
  passend.sort((a, b) => {
    const aStadt = (a.stadt ?? "").trim().toLowerCase() === stadt ? 0 : 1;
    const bStadt = (b.stadt ?? "").trim().toLowerCase() === stadt ? 0 : 1;
    return aStadt - bStadt;
  });
  return passend.slice(0, 2);
}

/** Mail an den Kunden mit zwei vorgeschlagenen Trainern. */
export function mailAlternativen(
  kundenEmail: string,
  kundenName: string | null | undefined,
  alternativen: TrainerVoll[],
): Mail {
  const anrede = kundenName ? `Hallo ${kundenName}, ` : "Hallo, ";
  return baueMail(kundenEmail, "Passende Trainer für dich auf Vexfit", {
    ueberschrift: "Zwei passende Trainer für dich",
    absatz:
      `${anrede}deine letzte Anfrage hat leider nicht geklappt. Damit du ` +
      "trotzdem schnell weiterkommst, haben wir zwei passende Trainer für dich herausgesucht.",
    datenZeilen: alternativen.map((t, i) => ({
      beschriftung: `Vorschlag ${i + 1}`,
      wert: `${w(t.vorname)} ${w(t.nachname)}`.trim() +
        (t.stadt ? ` (${w(t.stadt)})` : ""),
    })),
    knopfText: alternativen[0] ? "Erstes Profil ansehen" : undefined,
    knopfLink: alternativen[0] ? profilAdresse(alternativen[0].id) : undefined,
    bioAbsatz: alternativen[1]
      ? `Zweiter Vorschlag: ${profilAdresse(alternativen[1].id)}`
      : "",
    grundZeile:
      "Du erhältst diese E-Mail, weil deine Anfrage auf Vexfit nicht angenommen wurde.",
  });
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

/** Liest das Bearer-Token aus dem Authorization-Kopf, sonst null. */
function bearerToken(r: Request): string | null {
  const h = r.headers.get("authorization") || r.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Fix 7b: Klient-IP aus dem X-Forwarded-For-Kopf (erste Adresse), sonst "". */
function klientIp(r: Request): string {
  const h = r.headers.get("x-forwarded-for") || "";
  return h.split(",")[0].trim();
}

/**
 * Fix 7b: Torwache fuer /neuer-trainer und /neuer-kunde.
 *   - OHNE Koederfeld (angemeldeter Pfad, z. B. Registrierung): gueltiges
 *     Zugangs-Token noetig, sonst 401 — genau wie bei /neue-anfrage.
 *   - MIT Koederfeld (anonymes suche.html-Formular): ist der Koeder gefuellt,
 *     kein Eintrag und keine Mail (nach aussen Erfolg); sonst Ratengrenze
 *     (1 je E-Mail/24 h, 20 je IP/1 h) -> 429, darunter Eintrag vormerken.
 * Gibt eine Antwort zurueck, wenn der Aufruf hier endet, sonst null (weiter).
 */
async function torwacheMailEndpunkt(
  r: Request,
  a: Anschluesse,
  body: Record<string, unknown>,
  herkunft: string | null,
): Promise<Response | null> {
  const istFormular = Object.prototype.hasOwnProperty.call(body, KOEDER_FELD);
  if (!istFormular) {
    // Angemeldeter Pfad: Token verlangen wie bei /neue-anfrage.
    const token = bearerToken(r);
    const nutzer = token ? await a.benutzerAusToken(token) : null;
    if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);
    return null;
  }
  // Anonymes Formular: versteckter Koeder. Ein Bot fuellt ihn aus — dann still
  // verwerfen (kein Eintrag, keine Mail), nach aussen aber wie Erfolg.
  if (text(body[KOEDER_FELD])) {
    return antwort(200, { ok: true, mails: 0 }, herkunft);
  }
  const email = text(body.email).toLowerCase();
  const ip = klientIp(r);
  const vor24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const vor1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  if (email && (await a.spamProEmailSeit(email, vor24h)) >= SPAM_PRO_EMAIL_24H) {
    return antwort(429, { fehler: "Zu viele Eintraege. Bitte spaeter erneut." }, herkunft);
  }
  if (ip && (await a.spamProIpSeit(ip, vor1h)) >= SPAM_PRO_IP_1H) {
    return antwort(429, { fehler: "Zu viele Eintraege von dieser Verbindung." }, herkunft);
  }
  await a.spamEintragVormerken(email, ip);
  return null;
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
    case "admin-aktion":
      return await adminAktion(anfrageObjekt, a, herkunft);
    case "passt-nicht":
      return await passtNicht(anfrageObjekt, a, herkunft);
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
  const tor = await torwacheMailEndpunkt(r, a, body, herkunft);
  if (tor) return tor;
  const geprueft = eingabePruefen(body, ["email"]);
  if (!geprueft.ok) return antwort(400, { fehler: geprueft.grund }, herkunft);

  // Die fruehere Passwort-Zeile des alten Workflows faellt mit dem neuen,
  // exakt vorgegebenen Wortlaut der Trainer-Mail weg; a.adminHinweis bleibt im
  // Anschluss, wird aber nicht mehr verwendet.
  const gesendet = await sendeWennAdresseTaugt(a, mailNeuerTrainer(body));
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
  const tor = await torwacheMailEndpunkt(r, a, body, herkunft);
  if (tor) return tor;
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
  // Teil 8: Nur fuer angemeldete Nutzer, und nur fuer die eigene E-Mail. Ohne
  // gueltiges Zugangs-Token 401; passt die Kunden-E-Mail nicht zum Konto 403;
  // mehr als 10 Anfragen in der letzten Stunde 429. So kann niemand ueber den
  // offenen Endpunkt fremde Trainer mit Mails zuschuetten.
  const token = bearerToken(r);
  const nutzer = token ? await a.benutzerAusToken(token) : null;
  if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);

  const body = await koerperLesen(r);
  if (!body) {
    return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  }
  const geprueft = eingabePruefen(body, ["trainer_id"]);
  if (!geprueft.ok) return antwort(400, { fehler: geprueft.grund }, herkunft);

  const kundenEmail = String(body.kunden_email ?? body.kunde_email ?? "")
    .trim().toLowerCase();
  if (!kundenEmail || kundenEmail !== String(nutzer.email ?? "").toLowerCase()) {
    return antwort(403, { fehler: "E-Mail gehoert nicht zum Konto" }, herkunft);
  }

  const seitISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  if (await a.anfragenAnzahlSeit(kundenEmail, seitISO) >= 10) {
    return antwort(429, { fehler: "Zu viele Anfragen in kurzer Zeit." }, herkunft);
  }

  const trainer = await a.trainerNachId(String(body.trainer_id));
  if (!trainer) {
    a.melden?.("kein Trainer zu dieser Kennung", {
      trainer_id: body.trainer_id,
    });
    return antwort(200, { ok: true, mails: 0 }, herkunft);
  }

  // Baustein 1: Studio-Trainer (angestellt) zahlen nichts. Erkennung allein an
  // trainers.studio_standort_id. Dann KEIN Zahlungslink: Kontaktdaten direkt in
  // die Mail, und die aelteste offene Anfrage wird freigeschaltet, damit sie
  // auch im Trainerbereich ohne Zahlung sichtbar ist (weitergeleitet = true).
  // Der Zweig fuer normale Trainer darunter bleibt unveraendert.
  if (trainer.studio_standort_id) {
    const gingStudio = await sendeWennAdresseTaugt(
      a,
      mailStudioAnfrage(trainer, body),
    );
    const offene = await a.aeltesteOffeneAnfrage(trainer.id);
    if (offene) await a.anfrageWeitergeleitetMarkieren(offene.id);
    return antwort(
      200,
      { ok: true, mails: gingStudio ? 1 : 0, studio: true },
      herkunft,
    );
  }

  const mail = trainer.stripe_bezahlt === true
    ? mailWeitereAnfrage(trainer, body)
    : mailErsteAnfrage(trainer, body);
  const gesendet = await sendeWennAdresseTaugt(a, mail);
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0 }, herkunft);
}

/**
 * Admin-Pfad. Fuehrt die Schreib-/Loeschaktionen aus, die admin.html seit
 * 2026-10-26-01 nicht mehr direkt darf, mit service_role - aber nur fuer das
 * eine Admin-Konto (serverseitig ueber Supabase Auth geprueft) und nur aus
 * einer festen Liste von Aktionen und Spalten.
 *   ohne gueltiges Token   -> 401
 *   kein Admin             -> 403
 *   unbekannte Aktion      -> 400
 * Jede Aktion wird protokolliert (Zeitpunkt, Admin-ID, Aktion, Ziel-ID).
 */
async function adminAktion(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = bearerToken(r);
  const nutzer = token ? await a.benutzerAusToken(token) : null;
  if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);
  if (nutzer.id !== ADMIN_ID) return antwort(403, { fehler: "kein Admin" }, herkunft);

  const body = await koerperLesen(r);
  if (!body) return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  const aktion = String(body.aktion ?? "");
  const zielId = String(body.ziel_id ?? "");
  if (!zielId) return antwort(400, { fehler: "ziel_id fehlt" }, herkunft);

  // Protokoll: Zeitpunkt, Admin-ID, Aktion, Ziel-ID (keine neue Tabelle).
  a.melden?.(
    `admin-aktion ${new Date().toISOString()} admin=${nutzer.id} aktion=${aktion} ziel=${zielId}`,
  );

  let geaendert = 0;
  switch (aktion) {
    case "trainer_aktivieren":
      geaendert = await a.adminTrainerSetzen(zielId, { aktiv: true });
      break;
    case "trainer_sperren":
      geaendert = await a.adminTrainerSetzen(zielId, { aktiv: false });
      break;
    case "trainer_bezahlt":
      geaendert = await a.adminTrainerSetzen(zielId, { stripe_bezahlt: true });
      break;
    case "trainer_verifizieren":
      geaendert = await a.adminTrainerSetzen(zielId, { verifiziert: true });
      break;
    case "trainer_entverifizieren":
      geaendert = await a.adminTrainerSetzen(zielId, { verifiziert: false });
      break;
    case "trainer_loeschen":
      geaendert = await a.adminZeileLoeschen("trainers", zielId);
      break;
    case "kunde_loeschen":
      geaendert = await a.adminZeileLoeschen("kunden", zielId);
      break;
    default:
      return antwort(400, { fehler: "unbekannte Aktion" }, herkunft);
  }
  return antwort(200, { ok: true, geaendert }, herkunft);
}

/**
 * B4e "Passt nicht?": nach einer Absage bekommt der Kunde per Mail zwei passende
 * andere Trainer vorgeschlagen (gleiche Spezialisierung, gleiche Stadt zuerst).
 *
 * Nur der an der Anfrage beteiligte Trainer darf das ausloesen (Token noetig,
 * sein Trainer muss der trainer_id der Anfrage entsprechen). Je Anfrage nur
 * einmal (alternativen_gesendet). Findet sich keine Alternative, geht keine Mail
 * hinaus - nach aussen trotzdem Erfolg.
 */
async function passtNicht(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = bearerToken(r);
  const nutzer = token ? await a.benutzerAusToken(token) : null;
  if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);

  const body = await koerperLesen(r);
  if (!body) return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  const anfrageId = String(body.anfrage_id ?? "");
  if (!anfrageId) return antwort(400, { fehler: "anfrage_id fehlt" }, herkunft);

  if (!a.anfrageNachId || !a.trainerVollNachId || !a.aktiveVerifizierteTrainer) {
    return antwort(200, { ok: true, mails: 0, uebersprungen: "nicht verdrahtet" }, herkunft);
  }

  const anfrage = await a.anfrageNachId(anfrageId);
  if (!anfrage) return antwort(200, { ok: true, mails: 0 }, herkunft);
  if (anfrage.alternativen_gesendet === true) {
    return antwort(200, { ok: true, mails: 0, uebersprungen: "schon gesendet" }, herkunft);
  }

  // Nur der beteiligte Trainer darf ausloesen: sein Profil (ueber die E-Mail des
  // Kontos) muss der trainer_id der Anfrage entsprechen.
  const eigen = nutzer.email ? await a.trainerNachEmail(nutzer.email) : null;
  if (!eigen || eigen.id !== String(anfrage.trainer_id ?? "")) {
    return antwort(403, { fehler: "nicht berechtigt" }, herkunft);
  }

  const kundenEmail = String(anfrage.kunden_email ?? "");
  if (!adresseGueltig(kundenEmail)) {
    return antwort(200, { ok: true, mails: 0, uebersprungen: "keine Kundenadresse" }, herkunft);
  }

  const original = await a.trainerVollNachId(String(anfrage.trainer_id ?? ""));
  if (!original) return antwort(200, { ok: true, mails: 0 }, herkunft);

  const kandidaten = await a.aktiveVerifizierteTrainer();
  const alternativen = alternativenFinden(original, kandidaten);
  if (!alternativen.length) {
    if (a.alternativenVermerken) await a.alternativenVermerken(anfrageId);
    return antwort(200, { ok: true, mails: 0, uebersprungen: "keine Alternative" }, herkunft);
  }

  const gesendet = await sendeWennAdresseTaugt(
    a,
    mailAlternativen(kundenEmail, anfrage.kunden_name, alternativen),
  );
  if (a.alternativenVermerken) await a.alternativenVermerken(anfrageId);
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0, alternativen: alternativen.length }, herkunft);
}

/**
 * Stripe-Pfad.
 *
 * Reihenfolge wie im Workflow: Trainer finden → Trainer als bezahlt markieren
 * → Kundendaten an den Trainer + Anfrage als weitergeleitet markieren →
 * Zahlungsmail an Jakob.
 *
 * Zwei Entscheidungen von Jakob vom 26.09.2026 weichen bewusst vom Workflow ab:
 *
 * E1  Jede erfolgreiche Zahlung setzt `stripe_bezahlt` und `aktiv` auf true —
 *     auch ohne offene Anfrage. Frueher lief der Zweig hinter einem leeren
 *     "Offene Anfrage holen" gar nicht weiter, die Zahlung blieb folgenlos.
 *     Ohne offene Anfrage geht KEINE Kundendaten-Mail hinaus; die Zahlungsmail
 *     an Jakob geht trotzdem, mit dem Vermerk "keine offene Anfrage".
 *
 * E2  Bei mehreren offenen Anfragen wird pro Zahlung genau EINE freigeschaltet:
 *     die aelteste (`anfragen.created_at` aufsteigend). Nur sie wird gemailt
 *     und nur sie wird markiert; die uebrigen bleiben offen. Frueher traf das
 *     Markieren alle offenen Anfragen des Trainers auf einmal.
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
  const refId = String(sitzung.client_reference_id ?? "");
  const zahlerEmail = String(sitzung.customer_details?.email ?? "");

  // Zuordnung: zuerst ueber die mitgegebene Trainer-Kennung
  // (client_reference_id aus dem Zahlungslink), sonst ueber die E-Mail. Die
  // E-Mail-Suche ist in der Function ohne Gross-/Kleinschreibung umgesetzt
  // (index.ts: ilike).
  let trainer: Trainer | null = null;
  if (refId) trainer = await a.trainerNachId(refId);
  if (!trainer && zahlerEmail) trainer = await a.trainerNachEmail(zahlerEmail);
  if (!trainer) {
    // Kein Treffer: Ereignis NICHT vermerken (Stripe stellt erneut zu) und
    // Jakob mit Betrag, Ereignis-ID und eingegebener E-Mail benachrichtigen.
    await sendeWennAdresseTaugt(
      a,
      mailKeinTrainer(zahlerEmail || "(keine)", ereignis.id, sitzung.amount_total),
    );
    a.melden?.("kein Trainer zu dieser Zahlung — gemeldet, nicht vermerkt");
    return antwort(200, { ok: true, uebersprungen: "kein Trainer", gemeldet: true });
  }

  // Zielzeile sicher ueber die E-Mail des gefundenen Trainers (bei Zuordnung per
  // Kennung kann die eingetippte Zahler-E-Mail abweichen oder fehlen). Im
  // Normalfall ist zahlerEmail gesetzt und gleich.
  const zielEmail = zahlerEmail || w(trainer.email);

  // E1: die Zahlung wird in jedem Fall verbucht.
  await a.trainerBezahltMarkieren(zielEmail);

  // E2: genau die aelteste offene Anfrage (die Function laesst abgelehnte aus).
  const anfrage = await a.aeltesteOffeneAnfrage(trainer.id);

  let mails = 0;
  if (anfrage) {
    const ging = await sendeWennAdresseTaugt(
      a,
      mailKundenDaten(trainer, anfrage, zielEmail),
    );
    if (ging) mails++;
    await a.anfrageWeitergeleitetMarkieren(anfrage.id);
  } else {
    a.melden?.(
      "Zahlung ohne offene Anfrage — verbucht, aber nichts weitergeleitet",
    );
  }

  const anJakob = await sendeWennAdresseTaugt(
    a,
    mailZahlungAnJakob(
      trainer,
      zielEmail,
      sitzung.amount_total,
      Boolean(anfrage),
    ),
  );
  if (anJakob) mails++;

  await a.ereignisVermerken(ereignis.id, ereignis.type);
  return antwort(200, {
    ok: true,
    mails,
    trainer_markiert: true,
    anfrage_weitergeleitet: Boolean(anfrage),
  });
}
