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

/** Sichtbarer Absender aller Mails: "Vexfit <office@vexfit.app>". Zuvor war das
 *  das inzwischen geloeschte Gmail-Absenderkonto — seitdem schlug
 *  jeder Versand fehl. Der Versand laeuft jetzt ueber Google Workspace: die
 *  SMTP-Anmeldung kommt aus den Secrets SMTP_BENUTZER/SMTP_PASSWORT (index.ts),
 *  die sichtbare From-Adresse ist office@vexfit.app. */
export const ABSENDER = "office@vexfit.app";

/** Empfaenger der internen Benachrichtigungen an Jakob (neuer Trainer, neuer
 *  Kunde, Zahlung) und Reply-To aller Mails: das aktiv ueberwachte Workspace-
 *  Postfach office@vexfit.app. */
export const BETREIBER = "office@vexfit.app";

/** Zahlungslink aus "Email Trainer - ERSTE Anfrage 49,99€". */
export const LINK_ERSTE = "https://buy.stripe.com/eVqdR9gopdNhczNbhw2oE00";

/** Zahlungslink aus "Email Trainer - WEITERE Anfrage 9,99€". */
export const LINK_WEITERE = "https://buy.stripe.com/7sYbJ1fkl8sX8jxfxM2oE01";

/** Der Stripe-Ereignistyp der Erstzahlung (checkout). */
export const STRIPE_EREIGNIS = "checkout.session.completed";
/** B5: die zusätzlich verarbeiteten Abo-Ereignisse. */
export const STRIPE_INVOICE_PAID = "invoice.paid";
export const STRIPE_INVOICE_FAILED = "invoice.payment_failed";
export const STRIPE_SUB_DELETED = "customer.subscription.deleted";

/** Herkunft, die im Browser erlaubt ist. Beleg: CNAME enthaelt vexfit.app,
 *  und alle 58 Verweise im Repo lauten https://vexfit.app — kein www. */
export const ERLAUBTE_HERKUNFT = "https://vexfit.app";

/** Das einzige Konto mit Admin-Zugriff. WORTGLEICH wie in admin.html:348
 *  (ADMIN_USER_ID) und in migrations/2026-09-20-admin-vollzugriff.sql
 *  (ist_vexfit_admin). Keine neue Kennung erfunden. */
export const ADMIN_ID = "ee744b01-0a70-4da5-a19b-6c905c8479b5";

/** Obergrenze fuer den Anfragekoerper der Browser-Pfade. */
export const KOERPER_GRENZE = 20000;

/** B4e, 48-Stunden-Fall: hat ein Trainer eine Anfrage so lange nicht
 *  beantwortet, bekommt der Kunde automatisch dieselben zwei Vorschlaege wie
 *  bei "Passt nicht?" - zeitgesteuert statt per Klick. */
export const ALTERNATIVEN_NACH_STUNDEN = 48;

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

// ============================================================================
// S3 (07./08.11.2026): Missbrauchsverdacht einer Anfrage (reine Logik).
// Verdaechtige Anfragen werden MARKIERT (zur Pruefung), NICHT hart geblockt:
// sie gehen nicht an den Trainer, sondern in die Admin-Liste „Zur Pruefung".
// ============================================================================

/** Domain einer E-Mail (Kleinbuchstaben), oder "" wenn keine gueltige. */
export function emailDomain(email: unknown): string {
  const s = String(email ?? "").toLowerCase().trim();
  const i = s.lastIndexOf("@");
  return i > 0 && i < s.length - 1 ? s.slice(i + 1) : "";
}

/** Gehoert die E-Mail zu einer Wegwerf-/Einmal-Mail-Domain? */
export function istWegwerfDomain(email: unknown, domains: Set<string>): boolean {
  const d = emailDomain(email);
  return !!d && domains.has(d);
}

/** Offensichtlich unsinniger Name (markieren, nicht blockieren). */
export function nameUnsinnig(name: unknown): boolean {
  const s = String(name ?? "").trim();
  if (s.length < 2) return true;
  if ((s.match(/\p{L}/gu) || []).length === 0) return true; // keine Buchstaben
  if (/(.)\1{4,}/u.test(s)) return true; // 5x dasselbe Zeichen am Stueck
  if (/https?:\/\/|www\.|\.(com|net|ru|xyz|top|info)\b/i.test(s)) return true; // URL im Namen
  return false;
}

/** Offensichtlich unsinnige Nachricht. Leer ist erlaubt (Nachricht optional). */
export function nachrichtUnsinnig(text: unknown): boolean {
  const s = String(text ?? "").trim();
  if (!s) return false;
  if ((s.match(/\p{L}/gu) || []).length === 0) return true; // keine Buchstaben
  if (/(.)\1{7,}/u.test(s)) return true; // 8x dasselbe Zeichen am Stueck
  return false;
}

/**
 * Gesamturteil zu einer Anfrage. Rueckgabe { verdaechtig, grund }.
 * grund ist eine kurze, nicht personenbezogene Kennung fuer die Admin-Liste.
 */
export function anfrageVerdacht(opts: {
  email?: unknown;
  name?: unknown;
  nachricht?: unknown;
  domains?: Set<string>;
}): { verdaechtig: boolean; grund: string } {
  const domains = opts.domains ?? new Set<string>();
  if (istWegwerfDomain(opts.email, domains)) return { verdaechtig: true, grund: "wegwerf-mail" };
  if (nameUnsinnig(opts.name)) return { verdaechtig: true, grund: "name-unsinnig" };
  if (nachrichtUnsinnig(opts.nachricht)) return { verdaechtig: true, grund: "nachricht-unsinnig" };
  return { verdaechtig: false, grund: "" };
}

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
  trainer_id?: string | null;
  trainer_name?: string | null;
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
  trainer_name?: string | null;
  kunden_email?: string | null;
  kunden_name?: string | null;
  ziel?: string | null;
  nachricht?: string | null;
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

/** Teil 4: ein Trainer mit allen Feldern, die fuer die Vollstaendigkeits-Pruefung
 *  und die Freigabe-Bitte gebraucht werden. */
export interface TrainerProfil {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  plz?: string | null;
  stadt?: string | null;
  avatar_url?: string | null;
  trainingsart?: string | null;
  trainingsort?: string | null;
  preis_stunde?: number | null;
  bio?: string | null;
  erfahrung?: string | null;
  spezialisierungen?: string[] | null;
  telefon?: string | null;
  aktiv?: boolean | null;
  /** Migration 2026-11-01-01: einmalige Freigabe-Bitte schon verschickt?
   *  Fehlt die Spalte (Migration nicht eingespielt), ist das Feld undefined. */
  freigabe_mail_gesendet?: boolean | null;
  /** Migration 2026-11-01-04: Zeitpunkt der Freischalt-Mail an den Trainer
   *  (timestamptz, kommt als ISO-String). NULL/undefined = noch nicht gesendet;
   *  undefined zugleich, wenn die Spalte fehlt (Migration nicht eingespielt). */
  freischalt_mail_gesendet?: string | boolean | null;
  /** Registrierzeitpunkt (timestamptz als ISO-String) – für die Zeitfenster der
   *  Erinnerungs-Mails (Teil 4). */
  created_at?: string | null;
  /** Anmeldung gesperrt (Admin) – dann keine Erinnerung. */
  gesperrt?: boolean | null;
  /** Migration 2026-11-02: höchste bereits verschickte Erinnerungsstufe (0–3). */
  erinnerung_stufe?: number | null;
  /** Migration 2026-11-02: Trainer hat Erinnerungen abbestellt. */
  erinnerungen_aus?: boolean | null;
  /** Migration 2026-11-02: geheimes Token für den Abmelde-Link (ohne Login). */
  erinnerung_token?: string | null;
  /** B7 (Migration 2026-11-06-02): vom Admin als Test-/Spam-Konto markiert –
   *  keine Erinnerungen, nicht im Abendbericht. Fehlt die Spalte, ist das Feld
   *  undefined (altes Verhalten). */
  ist_test?: boolean | null;
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
  /** B5: Stripe-Kunden-ID (checkout.session.completed, invoice- und
   *  subscription-Ereignisse). Für die Zuordnung späterer Rechnungen. */
  customer?: string | null;
  /** B5: bei invoice.* steht die E-Mail als customer_email am Objekt. */
  customer_email?: string | null;
}

export interface StripeEreignis {
  id: string;
  type: string;
  data: { object: StripeSitzung };
}

/** Alles Aeussere. Die Function setzt hier die echten Zugriffe ein. */
/** Teil A: ein gespeichertes Web-Push-Abo (ein Gerät). */
export interface PushAbo {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  geraet?: string | null;
  erstellt_am?: string;
}

/** Teil A: Inhalt einer Push-Mitteilung. url ist das Ziel beim Antippen
 *  (Deep-Link in die Verwaltung). Keine E-Mail/Telefon im Text. */
export interface PushNachricht {
  titel: string;
  text: string;
  url: string;
}

/** B4: ein „Benachrichtige mich"-Eintrag (trainer_alerts) für die Mails. */
export interface WartelistenEintrag {
  id: string;
  kunden_email: string;
  kunden_name?: string | null;
  plz?: string | null;
  stadt?: string | null;
  land?: string | null;
  abmelde_token?: string | null;
}

/** Land normalisieren: 'AT'|'DE'|'CH' oder null. */
function landNorm(x: unknown): "AT" | "DE" | "CH" | null {
  const s = String(x ?? "").trim().toUpperCase();
  return (s === "AT" || s === "DE" || s === "CH") ? s : null;
}

/** Zwei Laender vertraeglich? Nur zwei BEKANNTE, VERSCHIEDENE sind es nicht. */
function landVertraeglich(a: unknown, b: unknown): boolean {
  const la = landNorm(a), lb = landNorm(b);
  return !la || !lb || la === lb;
}

export interface Anschluesse {
  trainerNachId(id: string): Promise<Trainer | null>;
  trainerNachEmail(email: string): Promise<Trainer | null>;
  /** B5: Trainer über die gespeicherte Stripe-Kunden-ID finden (für spätere
   *  Rechnungen ohne client_reference_id). service_role. Fehlt die Spalte
   *  stripe_customer_id (Migration 2026-11-03-03 nicht eingespielt), gibt es
   *  null zurück (Rückfall auf die E-Mail-Suche). */
  trainerNachStripeCustomer?(customerId: string): Promise<Trainer | null>;
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
  /** Teil 8: Nutzer zu einem Zugangs-Token (ueber Supabase Auth), sonst null.
   *  aal (Admin-Dashboard neu, Teil 1): die MFA-Stufe aus dem Token ("aal1"
   *  ohne, "aal2" mit bestaetigtem zweiten Faktor). index.ts liest sie ueber
   *  aalAusToken aus dem JWT. /admin-aktion verlangt aal2. */
  benutzerAusToken(token: string): Promise<{ id: string; email: string; aal?: string | null } | null>;
  /** Teil 8: Anzahl Anfragen dieses Kunden seit einem Zeitpunkt (Ratenbremse). */
  anfragenAnzahlSeit(kundenEmail: string, seitISO: string): Promise<number>;
  /** S3: Liste der Wegwerf-Mail-Domains (aus wegwerf-domains.ts). Default leer. */
  wegwerfDomains?(): Set<string>;
  /** S3: markiert die NEUESTE Anfrage eines Kunden an einen Trainer als
   *  „zur Pruefung" (pruef_status) mit Grund. Gibt true zurueck, wenn eine Zeile
   *  gesetzt wurde. Fehlt die Spalte (Migration 2026-11-08-02 nicht eingespielt),
   *  wirft es nicht – dann false (die Anfrage wird dann wie bisher behandelt). */
  anfrageZurPruefung?(trainerId: string, kundenEmail: string, grund: string): Promise<boolean>;
  /** S3: setzt pruef_status einer Anfrage ('ok'|'zur_pruefung'|'verworfen'). */
  anfragePruefSetzen?(id: string, status: string): Promise<number>;
  /** Fix 7b: Zahl anonymer Formular-Eintraege dieser E-Mail seit einem Zeitpunkt. */
  spamProEmailSeit(email: string, seitISO: string): Promise<number>;
  /** Fix 7b: Zahl anonymer Formular-Eintraege dieser IP-Adresse seit einem Zeitpunkt. */
  spamProIpSeit(ip: string, seitISO: string): Promise<number>;
  /** Fix 7b: einen anonymen Formular-Eintrag vormerken (fuer die Grenze). */
  spamEintragVormerken(email: string, ip: string): Promise<void>;
  /** Admin-Aktion: setzt feste Felder (aktiv/stripe_bezahlt) einer Trainerzeile
   *  mit service_role. Gibt die Zahl geaenderter Zeilen zurueck. */
  adminTrainerSetzen(id: string, felder: Record<string, unknown>): Promise<number>;
  /** Teil 2: die „Profil vollständig"-Mail ATOMAR beanspruchen. Setzt
   *  freigabe_mail_gesendet nur dann auf true, wenn es noch false/null ist, und
   *  gibt zurück, ob genau DIESER Aufruf den Anspruch bekommen hat. So kann bei
   *  zwei gleichzeitigen Aufrufen nur einer die Mail senden (verhindert den
   *  Doppelversand in derselben Sekunde). Fehlt die Verdrahtung, degradiert
   *  freigabePruefen auf den bisherigen (nicht-atomaren) Weg. */
  freigabeMailBeanspruchen?(id: string): Promise<boolean>;
  /** B4e: eine Anfrage per Kennung (mit Kundendaten, service_role). */
  anfrageNachId?(id: string): Promise<AnfrageVoll | null>;
  /** B4e: ein Trainer mit den fuer die Zuordnung noetigen Feldern. */
  trainerVollNachId?(id: string): Promise<TrainerVoll | null>;
  /** B4e: alle freigegebenen, nicht gesperrten Trainer (Kandidaten fuer die
   *  Alternativen). Verifizierung ist KEINE Bedingung ("Admin entscheidet
   *  allein", Migration 2026-10-31-10). */
  aktiveTrainerFuerAlternativen?(): Promise<TrainerVoll[]>;
  /** Teil 4: Trainer mit allen Profilfeldern per E-Mail (service_role). */
  trainerProfilNachEmail?(email: string): Promise<TrainerProfil | null>;
  /** Teil 4 (Erinnerungen): noch nicht freigegebene, nicht gesperrte, nicht
   *  abgemeldete Trainer, die in den letzten 96 h registriert wurden – als
   *  Kandidaten für eine Erinnerungs-Mail (Vollständigkeit/Fenster prüft der
   *  Kern). Fehlt die Verdrahtung/Migration, ist der Pfad still zu. */
  trainerFuerErinnerung?(): Promise<TrainerProfil[]>;
  /** Teil 4: Erinnerungsstufe ATOMAR beanspruchen – setzt erinnerung_stufe nur,
   *  wenn sie kleiner als `stufe` ist, und meldet, ob dieser Aufruf sie bekam
   *  (kein Doppelversand bei überlappenden Läufen). */
  erinnerungStufeBeanspruchen?(id: string, stufe: number): Promise<boolean>;
  /** Teil 4: Abmeldung per Token (ohne Login). Setzt erinnerungen_aus=true und
   *  meldet, ob ein Token passte. */
  erinnerungAbmelden?(token: string): Promise<boolean>;
  /** Teil M: Kundenzeile per E-Mail (service_role) für Deep-Link #kunde-<id> und
   *  die Inhalte der Betreiber-Mail. Fehlt sie, wird ohne Deep-Link gebaut. */
  kundeProfilNachEmail?(email: string): Promise<Record<string, unknown> | null>;
  /** Freischalt-Mail: Trainer mit allen Profilfeldern per Kennung (service_role).
   *  select=* – fehlt die Spalte freischalt_mail_gesendet (Migration nicht
   *  eingespielt), fehlt der Schluessel im Ergebnis einfach. */
  trainerProfilNachId?(id: string): Promise<TrainerProfil | null>;
  /** Teil 7: ein Ereignis an die Meta Conversions API senden. Holt den Schluessel
   *  aus META_CAPI_TOKEN; fehlt er, passiert nichts (gesendet=false, einmal
   *  geloggt). Wirft nicht – die Registrierung laeuft immer weiter. */
  metaConversion?(ereignis: MetaEreignis): Promise<{ gesendet: boolean; grund?: string }>;
  /** B4e: vermerkt, dass fuer eine Anfrage Alternativen verschickt wurden. */
  alternativenVermerken?(anfrageId: string): Promise<void>;
  /** B4e (48-Stunden-Fall): offene, noch unbeantwortete Anfragen, die vor dem
   *  Zeitpunkt vorISO gestellt wurden und fuer die noch keine Alternativen
   *  verschickt sind. service_role. */
  offeneAnfragenVor?(vorISO: string): Promise<AnfrageVoll[]>;
  /** B4e (48-Stunden-Fall): das Geheimnis, mit dem sich der Zeitplan-Aufruf
   *  ausweist (Function-Secret VEXFIT_CRON_KEY). Fehlt es, ist der Pfad zu. */
  cronGeheimnis?(): string | undefined;
  /** Admin-Aktion: loescht eine Zeile in trainers oder kunden (service_role).
   *  Gibt die Zahl geloeschter Zeilen zurueck. */
  adminZeileLoeschen(tabelle: string, id: string): Promise<number>;
  /** Optionaler Zusatz fuer die Trainer-Mail an Jakob, aus einem Secret. */
  adminHinweis?(): string | undefined;
  melden?(text: string, mehr?: unknown): void;

  // ── Teil 5 (Admin): Sperren/Entsperren/endgueltiges Loeschen ──
  /** Liefert die Auth-Benutzer-Kennung (user_id) einer trainers/kunden-Zeile,
   *  oder null, wenn die Zeile keine hat. */
  personUserId?(tabelle: "trainers" | "kunden", id: string): Promise<string | null>;
  /** Sperrt (ban_duration) bzw. entsperrt einen Auth-Benutzer ueber die Supabase
   *  Auth-Admin-API mit service_role. gesperrt=true sperrt, false entsperrt. */
  authSperren?(userId: string, gesperrt: boolean): Promise<void>;
  /** Loescht einen Auth-Benutzer ueber die Auth-Admin-API (service_role). */
  authNutzerLoeschen?(userId: string): Promise<void>;
  /** Setzt die Spalte gesperrt einer trainers/kunden-Zeile (service_role).
   *  Gibt die Zahl geaenderter Zeilen zurueck. */
  personGesperrtSetzen?(tabelle: "trainers" | "kunden", id: string, gesperrt: boolean): Promise<number>;
  /** Setzt die Spalte land ('AT'|'DE'|'CH') einer trainers/kunden-Zeile
   *  (service_role) – fuer die Admin-Zuordnung „PLZ ohne Land". Gibt die Zahl
   *  geaenderter Zeilen zurueck. */
  adminLandSetzen?(tabelle: "trainers" | "kunden", id: string, land: "AT" | "DE" | "CH"): Promise<number>;
  /** Loescht die Zeile; verhindert ein Fremdschluessel (z. B. Anfragen) das
   *  Loeschen, werden stattdessen die personenbezogenen Felder anonymisiert
   *  (Fremddaten bleiben erhalten). */
  zeileLoeschenOderAnonymisieren?(tabelle: "trainers" | "kunden", id: string): Promise<{ geloescht: boolean; anonymisiert: boolean }>;
  /** Schreibt einen Protokolleintrag (Zeitpunkt/Admin/Aktion/Ziel/Ergebnis).
   *  Keine Klartext-Personendaten. Best effort. admin_id/ziel_* sind optional,
   *  damit auch nicht-Admin-Läufe (z. B. der Abendbericht vom Zeitplan) einen
   *  Eintrag ohne Admin/Ziel schreiben können (DB-Spalten sind nullable). */
  protokoll?(eintrag: { admin_id?: string; aktion: string; ziel_tabelle?: string; ziel_id?: string; ergebnis?: string }): Promise<void>;

  // ── Admin-Dashboard neu, Teil 3: Kicken (endgueltig loeschen, vollstaendig) ──
  /** Die Speicher-Dateien einer Person: avatars/galerie (public) und zertifikate
   *  (privat). Fuer das Loeschen aus dem Storage beim Kicken. */
  personDateien?(tabelle: "trainers" | "kunden", id: string): Promise<{ avatars: string[]; galerie: string[]; zertifikate: string[] }>;
  /** Loescht Objekte aus einem Storage-Bucket (best effort). */
  storageLoeschen?(bucket: string, pfade: string[]): Promise<void>;
  /** Ruft die DB-Funktion admin_person_kicken(p_art, p_id) auf: loescht in EINER
   *  Transaktion die Person und ihre eigenen Daten (Anfragen, Alerts, Warteliste)
   *  und laesst Zahlungs-/Buchhaltungsdaten anonymisiert erhalten. Gibt die
   *  Trefferzahlen zurueck. Fehlt die Funktion (Migration 2026-11-01-02 nicht
   *  eingespielt), wirft sie – kern.ts macht daraus einen klaren Hinweis. */
  personKickenDb?(tabelle: "trainers" | "kunden", id: string): Promise<Record<string, number>>;

  // ── Teil A: Web Push ──
  /** true, wenn die VAPID-Secrets gesetzt sind. Fehlen sie, wird Push
   *  übersprungen (die Mail geht trotzdem), mit klarem Log-Eintrag. */
  vapidVorhanden?(): boolean;
  /** Alle Push-Abos lesen (service_role). */
  pushAbosLesen?(): Promise<PushAbo[]>;
  /** Ein Abo speichern bzw. (bei gleichem Endpoint) aktualisieren (service_role). */
  pushAboSpeichern?(abo: PushAbo): Promise<void>;
  /** Ein Abo per Endpoint entfernen – für die 404/410-Bereinigung. */
  pushAboEntfernen?(endpoint: string): Promise<void>;
  /** Ein Abo per Kennung entfernen – für die Geräteliste in der Verwaltung. */
  pushAboEntfernenNachId?(id: string): Promise<number>;
  /** Eine Mitteilung an EIN Abo senden; gibt den HTTP-Status zurück
   *  (404/410 = Abo abgelaufen → wird entfernt). Wirft nicht nach oben. */
  pushEinzelSenden?(abo: PushAbo, nachricht: PushNachricht): Promise<number>;

  // ── B4: Warteliste ("Benachrichtige mich" = trainer_alerts) ──
  /** B4.1: noch aktiver „Benachrichtige mich"-Eintrag einer E-Mail (optional auf
   *  eine PLZ begrenzt) – für die Bestätigungsmail (Ort + Abmelde-Token).
   *  service_role. Fehlt die Spalte abmelde_token (Migration 2026-11-03-02 nicht
   *  eingespielt), wirft es. */
  alertFuerBestaetigung?(email: string, plz: string): Promise<WartelistenEintrag | null>;
  /** B4.2: offene (aktiv=true) Einträge einer PLZ – bei der Freigabe eines
   *  Trainers in dieser PLZ-Region zu benachrichtigen. service_role. */
  alertsOffeneFuerPlz?(plz: string): Promise<WartelistenEintrag[]>;
  /** B4.2: schließt EINEN Eintrag ATOMAR (aktiv=true→false) und meldet, ob dieser
   *  Aufruf ihn bekam (nie doppelt). service_role. */
  alertSchliessen?(id: string): Promise<boolean>;
  /** B4.1: Abmeldung per Token (ohne Login): setzt aktiv=false. service_role. */
  alertAbmelden?(token: string): Promise<boolean>;
  /** B4.2: PLZ eines Trainers per Kennung (service_role). */
  trainerPlzNachId?(id: string): Promise<string | null>;
  /** Land ('AT'|'DE'|'CH') eines Trainers per Kennung (service_role). Fehlt die
   *  Spalte land (Migration nicht eingespielt), null – dann wird nicht nach Land
   *  gefiltert (Verhalten wie zuvor). */
  trainerLandNachId?(id: string): Promise<string | null>;

  // ── B7: Abendbericht ──
  /** B7: alle Zahlen für den Abendbericht in einem Rutsch (service_role).
   *  Einzelne nicht lesbare Teile (fehlende Migration) zählen als 0/leer. */
  abendberichtZahlen?(): Promise<AbendberichtZahlen>;
  /** B7 (nur Test): aktuelle Zeit injizieren, um die 16-Uhr-Prüfung zu testen.
   *  In Produktion nicht gesetzt → new Date(). */
  jetzt?(): Date;
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

// Feinschliff Teil 3: Namen schön anzeigen (Mail-Betreff/-Text + Push). NUR
// Anzeige – der gespeicherte Wert bleibt. Wortgleich zu vexfit-namen.js
// (window.vexName) und vexfit-verwaltung.js (nameFormatieren), abgesichert durch
// namen_test.ts.
const NAME_PARTIKEL = new Set([
  "von", "van", "de", "der", "den", "del", "della", "di", "da", "dos", "du",
  "la", "le", "ter", "ten", "zu", "zum", "zur", "of", "and",
]);
function nameGewollteMischung(s: string): boolean {
  return /[a-zäöüéèàçñ][A-ZÄÖÜ]/.test(s);
}
function nameTeilGross(seg: string): string {
  if (!seg) return seg;
  if (nameGewollteMischung(seg)) return seg;
  const klein = seg.toLowerCase();
  return klein.charAt(0).toUpperCase() + klein.slice(1);
}
export function nameFormatieren(roh: unknown): string {
  if (roh === null || roh === undefined) return "";
  const s = String(roh).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.split(" ").map((wort, i) => {
    const klein = wort.toLowerCase();
    if (i > 0 && NAME_PARTIKEL.has(klein) && !nameGewollteMischung(wort)) {
      return klein;
    }
    return wort.split(/(['’-])/).map((seg) =>
      (seg === "-" || seg === "'" || seg === "’") ? seg : nameTeilGross(seg)
    ).join("");
  }).join(" ");
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

// admin.html ist stillgelegt; die Freigabe-Bitte (Teil 4) verweist weiter darauf
// (unveraendert, eigene Mail). Die drei Betreiber-Benachrichtigungen (Teil M)
// verlinken dagegen in die geschuetzte Verwaltung (verwaltungLink).
const ADMIN_LINK = "https://vexfit.app/admin.html";

// Teil M: Deep-Link in die geschuetzte Verwaltung. Der geheime Pfad steht NUR in
// diesen internen Mails an den Betreiber (office@vexfit.app), nie auf einer
// oeffentlichen Seite. Der Anker springt nach Login + zweitem Faktor direkt zum
// Datensatz (#trainer-/#kunde-/#anfrage-<id>).
export const VERWALTUNG_URL =
  "https://vexfit.app/verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html";
export function verwaltungLink(anker?: string | null): string {
  const a = w(anker).trim();
  return a ? `${VERWALTUNG_URL}#${a}` : VERWALTUNG_URL;
}

/** Herkunft als ein Text: "utm_source – utm_campaign" (oder nur eines, oder leer). */
function herkunftText(body: Record<string, unknown>): string {
  const src = w(body.utm_source);
  const camp = w(body.utm_campaign);
  if (src && camp) return `${src} – ${camp}`;
  return camp || src || "";
}

/** Profil-Vollstaendigkeit x/8 aus einer Trainer-Profilzeile – dieselben acht
 *  Felder wie in der Verwaltung (fehlendeProfilfelder): Foto, Trainingsart,
 *  Trainingsort, Preis pro Stunde, Ueber mich (>10 Zeichen), Erfahrung,
 *  Spezialisierungen, Telefon. */
// Foto gilt NUR als vorhanden, wenn die Adresse aus dem Avatar-Bucket kommt –
// genau wie im Admin (vexfit-verwaltung.js avatarVorhanden). So zählen „X von 8"
// in Mail/Erinnerung und im Admin dasselbe (sonst gälte ein beliebiger
// avatar_url für die Freigabe-/Erinnerungslogik als Foto, im Admin aber nicht).
function fotoDa(v: unknown): boolean {
  return typeof v === "string" && v.includes("/avatars/");
}

export function profilVollstaendigkeitAcht(
  t: Record<string, unknown>,
): { erfuellt: number; gesamt: number } {
  const txt = (v: unknown) => (v == null ? "" : String(v)).trim();
  const liste = (v: unknown) => (Array.isArray(v) ? v : []);
  const felder = [
    fotoDa(t.avatar_url),
    txt(t.trainingsart) !== "",
    txt(t.trainingsort) !== "",
    Number(t.preis_stunde) > 0,
    txt(t.bio).length > 10,
    txt(t.erfahrung) !== "",
    liste(t.spezialisierungen).length > 0,
    txt(t.telefon) !== "",
  ];
  return { erfuellt: felder.filter(Boolean).length, gesamt: 8 };
}

/** Mail 5 (intern an BETREIBER): neuer Trainer. Teil M: schöner Betreff mit
 *  gelbem Punkt, Deep-Link in die Verwaltung (#trainer-<id>), Inhalt inkl.
 *  Ort/PLZ, Telefon, Registrierzeit, Herkunft und Profil-Vollständigkeit x/8.
 *  `profil` ist die (per E-Mail nachgeschlagene) Trainerzeile; fehlt sie, wird
 *  mit den Formularwerten gebaut und auf den Deep-Link verzichtet. */
export function mailNeuerTrainer(
  body: Record<string, unknown>,
  profil?: Record<string, unknown> | null,
): Mail {
  const p = profil || {};
  const name = nameFormatieren(`${w(body.vorname) || w(p.vorname)} ${w(body.nachname) || w(p.nachname)}`.trim());
  const ort = w(p.stadt) || w(body.stadt);
  const plz = w(p.plz) || w(body.plz);
  const ortPlz = [ort, plz].filter((x) => x).join(" · ");
  const id = w(p.id);
  const vollst = profil ? profilVollstaendigkeitAcht(p) : null;
  return baueMail(
    BETREIBER,
    `🟡 Neuer Trainer: ${name}${ort ? ` (${ort})` : ""}`,
    {
      ueberschrift: "Neuer Trainer registriert",
      datenZeilen: [
        { beschriftung: "Name", wert: name },
        { beschriftung: "Ort / PLZ", wert: ortPlz },
        { beschriftung: "E-Mail", wert: w(body.email) || w(p.email) },
        { beschriftung: "Telefon", wert: w(p.telefon) || w(body.telefon) },
        { beschriftung: "Registriert", wert: w(body.zeitpunkt) },
        { beschriftung: "Herkunft", wert: herkunftText(body) },
        ...(vollst ? [{ beschriftung: "Profil-Vollständigkeit", wert: `${vollst.erfuellt}/${vollst.gesamt}` }] : []),
      ],
      knopfText: "Im Admin öffnen",
      knopfLink: verwaltungLink(id ? `trainer-${id}` : ""),
      hinweis: id
        ? "„Freigeben“ findest du dort direkt beim Trainer – aus Sicherheitsgründen keine Aktion per Mail."
        : undefined,
      grundZeile: "Interne Benachrichtigung.",
    },
  );
}

/** Mail 6 (intern an BETREIBER): neuer Kunde. Teil M: Deep-Link #kunde-<id>,
 *  Inhalt mit Ort/PLZ, Telefon, Registrierzeit, Herkunft und Ziel. */
export function mailNeuerKunde(
  body: Record<string, unknown>,
  profil?: Record<string, unknown> | null,
): Mail {
  const p = profil || {};
  const name = nameFormatieren(`${w(body.vorname) || w(p.vorname)} ${w(body.nachname) || w(p.nachname)}`.trim());
  const ort = w(p.stadt) || w(body.stadt);
  const plz = w(p.plz) || w(body.plz);
  const ortPlz = [ort, plz].filter((x) => x).join(" · ");
  const id = w(p.id);
  return baueMail(BETREIBER, `Neuer Kunde: ${name}${ort ? ` (${ort})` : ""}`, {
    ueberschrift: "Neuer Kunde registriert",
    datenZeilen: [
      { beschriftung: "Name", wert: name },
      { beschriftung: "Ort / PLZ", wert: ortPlz },
      { beschriftung: "E-Mail", wert: w(body.email) || w(p.email) },
      { beschriftung: "Telefon", wert: w(p.telefon) || w(body.telefon) },
      { beschriftung: "Registriert", wert: w(body.zeitpunkt) },
      { beschriftung: "Herkunft", wert: herkunftText(body) },
      { beschriftung: "Ziel", wert: w(p.ziel) || w(body.ziel) },
    ],
    knopfText: "Im Admin öffnen",
    knopfLink: verwaltungLink(id ? `kunde-${id}` : ""),
    grundZeile: "Interne Benachrichtigung.",
  });
}

/** Mail (intern an BETREIBER): neue Anfrage. Teil M: Betreff "Neue Anfrage:
 *  <Kunde> → <Trainer>", Deep-Link #anfrage-<id> (sonst #anfragen). Keine Aktion
 *  aus der Mail – nur der Weg in die Verwaltung. */
export function mailNeueAnfrageIntern(
  body: Record<string, unknown>,
  anfrageId?: string | null,
): Mail {
  const kunde = nameFormatieren(w(body.kunden_name)) || w(body.kunden_email) || "Kunde";
  const trainerName = nameFormatieren(w(body.trainer_name)) || "Trainer";
  const anker = w(anfrageId) ? `anfrage-${w(anfrageId)}` : "anfragen";
  const k = kundenAngaben(body);
  return baueMail(BETREIBER, `Neue Anfrage: ${kunde} → ${trainerName}`, {
    ueberschrift: "Neue Anfrage",
    datenZeilen: [
      { beschriftung: "Kunde", wert: kunde },
      { beschriftung: "Trainer", wert: trainerName },
      { beschriftung: "Ziel", wert: w(k.ziel) },
      { beschriftung: "Nachricht", wert: w(k.nachricht) },
    ],
    knopfText: "Im Admin öffnen",
    knopfLink: verwaltungLink(anker),
    grundZeile: "Interne Benachrichtigung.",
  });
}

// ── Teil A: Web-Push-Mitteilungen ──

/** Push-Mitteilung „Neuer Trainer: <Name>, <Ort>" (ohne E-Mail/Telefon). */
export function pushNeuerTrainer(
  body: Record<string, unknown>,
  profil?: Record<string, unknown> | null,
): PushNachricht {
  const p = profil || {};
  const name = nameFormatieren(`${w(body.vorname) || w(p.vorname)} ${w(body.nachname) || w(p.nachname)}`.trim()) || "Trainer";
  const ort = nameFormatieren(w(p.stadt) || w(body.stadt));
  const id = w(p.id);
  return {
    // Teil 4: gelber Punkt im Titel, Name formatiert, Ort mit „ · " und nur wenn
    // vorhanden. Keine E-Mail/Telefon im Push.
    titel: "🟡 Neuer Trainer",
    text: `${name}${ort ? ` · ${ort}` : ""}`,
    url: verwaltungLink(id ? `trainer-${id}` : ""),
  };
}

/** Push-Mitteilung „Neuer Kunde: <Name> · <Ort>" (Teil 4). */
export function pushNeuerKunde(
  body: Record<string, unknown>,
  profil?: Record<string, unknown> | null,
): PushNachricht {
  const p = profil || {};
  const name = nameFormatieren(`${w(body.vorname) || w(p.vorname)} ${w(body.nachname) || w(p.nachname)}`.trim()) || "Kunde";
  const ort = nameFormatieren(w(p.stadt) || w(body.stadt));
  const id = w(p.id);
  return {
    titel: "Neuer Kunde",
    text: `${name}${ort ? ` · ${ort}` : ""}`,
    url: verwaltungLink(id ? `kunde-${id}` : ""),
  };
}

/** Push-Mitteilung „Neue Anfrage: <Kunde> → <Trainer>" (Teil 4, Namen formatiert). */
export function pushNeueAnfrage(
  body: Record<string, unknown>,
  anfrageId?: string | null,
): PushNachricht {
  const kunde = nameFormatieren(w(body.kunden_name)) || "Kunde";
  const trainerName = nameFormatieren(w(body.trainer_name)) || "Trainer";
  return {
    titel: "Neue Anfrage",
    text: `${kunde} → ${trainerName}`,
    url: verwaltungLink(w(anfrageId) ? `anfrage-${w(anfrageId)}` : "anfragen"),
  };
}

export interface PushErgebnis {
  gesendet: number;
  entfernt: number;
  /** gesetzt, wenn gar nicht gesendet wurde (z. B. VAPID-Secrets fehlen). */
  uebersprungen?: string;
}

/**
 * Teil A: eine Mitteilung an ALLE Abos senden. Reine Ablaufsteuerung (ohne
 * Krypto – die steckt in pushEinzelSenden/webpush.ts): fehlen die VAPID-Secrets,
 * wird NICHTS gesendet (uebersprungen, ein Log-Eintrag) – die Mail läuft davon
 * unberührt. Pro Abo wird der HTTP-Status geholt; 404/410 entfernt das Abo.
 * Wirft nie nach oben.
 */
export async function pushSenden(
  a: Anschluesse,
  nachricht: PushNachricht,
): Promise<PushErgebnis> {
  if (!a.pushAbosLesen || !a.pushEinzelSenden) {
    return { gesendet: 0, entfernt: 0, uebersprungen: "nicht verfügbar" };
  }
  if (a.vapidVorhanden && !a.vapidVorhanden()) {
    a.melden?.("push: VAPID-Secrets fehlen – Mitteilung übersprungen, Mail geht trotzdem");
    return { gesendet: 0, entfernt: 0, uebersprungen: "VAPID fehlt" };
  }
  let abos: PushAbo[] = [];
  try {
    abos = await a.pushAbosLesen();
  } catch (fehler) {
    a.melden?.("push: Abos lesen fehlgeschlagen", String(fehler));
    return { gesendet: 0, entfernt: 0, uebersprungen: "Lesefehler" };
  }
  let gesendet = 0;
  let entfernt = 0;
  for (const abo of abos) {
    try {
      const status = await a.pushEinzelSenden(abo, nachricht);
      if (status === 404 || status === 410) {
        if (a.pushAboEntfernen) await a.pushAboEntfernen(abo.endpoint);
        entfernt++;
      } else if (status >= 200 && status < 300) {
        gesendet++;
      } else {
        a.melden?.("push: unerwarteter Status", { status, endpoint: abo.endpoint.slice(0, 40) });
      }
    } catch (fehler) {
      a.melden?.("push: Senden an ein Abo fehlgeschlagen", String(fehler));
    }
  }
  return { gesendet, entfernt };
}

/** Push best effort auslösen – wirft nie, damit die Mail nie darunter leidet. */
async function pushBenachrichtigung(a: Anschluesse, nachricht: PushNachricht): Promise<void> {
  try {
    await pushSenden(a, nachricht);
  } catch (fehler) {
    a.melden?.("push: unerwarteter Fehler", String(fehler));
  }
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
      `Hallo ${nameFormatieren(w(trainer.vorname))}, über Vexfit hat dich jemand angefragt. ` +
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
    absatz: `Hallo ${nameFormatieren(w(trainer.vorname))}, du hast eine neue Anfrage erhalten.`,
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
      `Hallo ${nameFormatieren(w(trainer.vorname))}, du hast über Vexfit eine neue Anfrage ` +
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
      `Hallo ${nameFormatieren(w(trainer.vorname))}, hier sind die Kontaktdaten. Melde dich am ` +
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
        wert: nameFormatieren(`${w(trainer.vorname)} ${w(trainer.nachname)}`.trim()),
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

/** B5: interne Mail an den Betreiber (office@) bei Zahlungsproblem/Kündigung. */
export function mailAboEreignis(
  trainer: Trainer,
  art: "zahlung_fehlgeschlagen" | "gekuendigt",
): Mail {
  const name = nameFormatieren(`${w(trainer.vorname)} ${w(trainer.nachname)}`.trim()) || "Trainer";
  const titel = art === "gekuendigt" ? "Abo gekündigt" : "Zahlung fehlgeschlagen";
  const absatz = art === "gekuendigt"
    ? "Das Stripe-Abo wurde gekündigt. Der Trainer wurde gesperrt und erscheint nicht " +
      "mehr in der Suche; seine bereits bezahlten Kundenkontakte bleiben für ihn sichtbar."
    : "Eine wiederkehrende Zahlung ist fehlgeschlagen. Der Trainer bleibt aktiv – " +
      "du entscheidest, ob du nachfasst.";
  return baueMail(BETREIBER, `${titel}: ${name}`, {
    ueberschrift: titel,
    absatz,
    datenZeilen: [
      { beschriftung: "Trainer", wert: name },
      { beschriftung: "E-Mail", wert: w(trainer.email) },
    ],
    knopfText: "Im Admin öffnen",
    knopfLink: verwaltungLink(w(trainer.id) ? `trainer-${w(trainer.id)}` : ""),
    grundZeile: "Interne Benachrichtigung.",
  });
}

/** B5: Admin-Push bei Zahlungsproblem/Kündigung. */
export function pushAboEreignis(
  trainer: Trainer,
  art: "zahlung_fehlgeschlagen" | "gekuendigt",
): PushNachricht {
  const name = nameFormatieren(`${w(trainer.vorname)} ${w(trainer.nachname)}`.trim()) || "Trainer";
  const titel = art === "gekuendigt" ? "❌ Abo gekündigt" : "⚠️ Zahlung fehlgeschlagen";
  return { titel, text: name, url: verwaltungLink(w(trainer.id) ? `trainer-${w(trainer.id)}` : "") };
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
  const anrede = kundenName ? `Hallo ${nameFormatieren(kundenName)}, ` : "Hallo, ";
  return baueMail(kundenEmail, "Passende Trainer für dich auf Vexfit", {
    ueberschrift: "Zwei passende Trainer für dich",
    absatz:
      `${anrede}deine letzte Anfrage hat leider nicht geklappt. Damit du ` +
      "trotzdem schnell weiterkommst, haben wir zwei passende Trainer für dich herausgesucht.",
    datenZeilen: alternativen.map((t, i) => ({
      beschriftung: `Vorschlag ${i + 1}`,
      wert: nameFormatieren(`${w(t.vorname)} ${w(t.nachname)}`.trim()) +
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
    // Teil 0 (Sofort-Fix): admin.html schickt bei /admin-aktion einen
    // Authorization-Kopf (Bearer-Token). Zuvor stand hier nur "content-type" —
    // der Browser-Preflight (OPTIONS) scheiterte deshalb, und JEDE Admin-Aktion
    // endete im Browser mit "Failed to fetch" / "Verbindungsfehler". authorization
    // (und die von supabase-js ueblichen apikey, x-client-info) werden jetzt
    // erlaubt. Die Herkunft bleibt streng auf ERLAUBTE_HERKUNFT begrenzt: fuer
    // jede fremde Herkunft gibt corsKopf weiter {} zurueck (kein CORS-Kopf).
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
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
  try {
    await a.mailSenden(mail);
  } catch (fehler) {
    // Nicht still verschlucken: ein fehlgeschlagener Versand (SMTP-Fehler,
    // fehlende SMTP-Zugangsdaten, gesperrter Port) wird ausdruecklich gemeldet und
    // dann erneut geworfen. So liefert der Endpunkt 500 und der Fehler steht in
    // den Function-Logs, statt dass eine Registrierung lautlos ohne
    // Benachrichtigung durchlaeuft.
    a.melden?.("Mailversand fehlgeschlagen", {
      an: mail.an,
      betreff: mail.betreff,
      fehler: String(fehler),
    });
    throw fehler;
  }
  return true;
}

// ── Teil 7: Meta Conversions API (serverseitiges CompleteRegistration) ──

/** SHA-256 als Hex-String. Rein (crypto.subtle, kein Netz) – für die
 *  Nutzerdaten der Conversions API (E-Mail klein/getrimmt, dann gehasht). */
/**
 * B2 (05.11.2026): Freigabe-Schalter für die serverseitige Meta Conversions
 * API. Auch wenn der Zugriffsschlüssel (META_CAPI_TOKEN) gesetzt ist, darf
 * NICHTS an Meta gesendet werden, solange die Datenschutzerklärung die
 * serverseitige Übermittlung (gehashte E-Mail, Drittlandübermittlung USA) nicht
 * ausdrücklich nennt. Der Betreiber schaltet erst frei, wenn der Rechtstext live
 * ist – über META_CAPI_AKTIV = "ja" (bzw. "true"/"1"). Standard: aus.
 * Siehe docs/recht/entwurf-meta-capi-2026-11-06.md.
 */
export function capiFreigeschaltet(aktivWert: string | undefined | null): boolean {
  const v = (aktivWert ?? "").trim().toLowerCase();
  return v === "ja" || v === "true" || v === "1";
}

export async function sha256Hex(text: string): Promise<string> {
  const roh = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(roh)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface MetaEreignis {
  event_name: string;
  event_id: string;
  event_time: number;
  action_source: "website";
  event_source_url?: string;
  user_data: { em?: string[] };
}

/** Baut das CAPI-Ereignis (E-Mail gehasht: lowercase, getrimmt, SHA-256). */
export async function metaEreignisBauen(
  body: Record<string, unknown>,
): Promise<MetaEreignis> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const ereignis: MetaEreignis = {
    event_name: "CompleteRegistration",
    event_id: String(body.event_id ?? ""),
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: {},
  };
  const url = String(body.event_source_url ?? "");
  if (url) ereignis.event_source_url = url;
  if (email) ereignis.user_data.em = [await sha256Hex(email)];
  return ereignis;
}

/**
 * Teil 7: schickt CompleteRegistration serverseitig an Meta – aber nur, wenn der
 * Nutzer zugestimmt hat UND eine event_id zum Entdoppeln vorliegt. Die Function
 * holt den Zugriffsschluessel ausschliesslich aus dem Secret META_CAPI_TOKEN
 * (im Anschluss metaConversion); fehlt es, passiert nichts (ein Hinweis wird
 * dort einmal geloggt). Best effort: Fehler werden geschluckt, die Registrierung
 * laeuft immer weiter.
 */
async function sendeMetaConversion(
  a: Anschluesse,
  body: Record<string, unknown>,
): Promise<{ gesendet: boolean; grund?: string }> {
  if (body.zustimmung !== true) return { gesendet: false, grund: "keine Zustimmung" };
  if (!String(body.event_id ?? "")) return { gesendet: false, grund: "keine event_id" };
  if (!a.metaConversion) return { gesendet: false, grund: "nicht verfuegbar" };
  try {
    const ereignis = await metaEreignisBauen(body);
    const r = await a.metaConversion(ereignis);
    return { gesendet: !!r?.gesendet, grund: r?.grund };
  } catch (fehler) {
    a.melden?.("Meta-Conversions-Fehler", { fehler: String(fehler) });
    return { gesendet: false, grund: "fehler" };
  }
}

/** Liest das Bearer-Token aus dem Authorization-Kopf, sonst null. */
function bearerToken(r: Request): string | null {
  const h = r.headers.get("authorization") || r.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Admin-Dashboard neu, Teil 1: liest die MFA-Stufe ("aal1"/"aal2") aus dem
 * Nutzdaten-Teil des Supabase-Zugangs-Tokens (JWT). Das Token ist zu diesem
 * Zeitpunkt bereits von der Auth-API geprueft (benutzerAusToken/getUser) —
 * hier wird nur der schon vertrauenswuerdige Nutzdaten-Teil ausgelesen, keine
 * Signaturpruefung. Gibt null, wenn das Token kein JWT ist oder keine aal traegt.
 */
export function aalAusToken(token: string | null): string | null {
  if (!token) return null;
  const teile = token.split(".");
  if (teile.length < 2) return null;
  try {
    let b64 = teile[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const roh = atob(b64);
    const daten = JSON.parse(roh) as { aal?: unknown };
    return typeof daten.aal === "string" ? daten.aal : null;
  } catch {
    return null;
  }
}

/**
 * Admin-Dashboard neu, Teil 1: einfache Mengenbegrenzung je Admin und Minute.
 * Haelt die Zeitpunkte der letzten Aufrufe je Kennung im Arbeitsspeicher (pro
 * Function-Instanz). Mehr als ADMIN_RATE_MAX Aktionen in 60 Sekunden -> true.
 */
export const ADMIN_RATE_MAX = 60;
const _ratenFenster = new Map<string, number[]>();
export function ratenGrenzeUeberschritten(
  id: string,
  jetzt: number = Date.now(),
  max: number = ADMIN_RATE_MAX,
): boolean {
  const vor60 = jetzt - 60_000;
  const liste = (_ratenFenster.get(id) || []).filter((t) => t > vor60);
  liste.push(jetzt);
  _ratenFenster.set(id, liste);
  return liste.length > max;
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
  // Teil 4: der Abmelde-Link aus der Erinnerungs-Mail wird im Browser per GET
  // geöffnet (ein Klick, ohne Login). Alle übrigen Pfade bleiben POST-only.
  if (pfad === "erinnerung-abmelden" && anfrageObjekt.method === "GET") {
    try {
      return await erinnerungAbmeldenEndpunkt(anfrageObjekt, a, herkunft);
    } catch (fehler) {
      a.melden?.("erinnerung-abmelden fehlgeschlagen", String(fehler));
      return antwort(500, { fehler: "Fehler" }, herkunft);
    }
  }
  // B4: Abmelde-Link aus den Warteliste-Mails, auch per GET (ein Klick, ohne Login).
  if (pfad === "warteliste-abmelden" && anfrageObjekt.method === "GET") {
    try {
      return await wartelisteAbmeldenEndpunkt(anfrageObjekt, a, herkunft);
    } catch (fehler) {
      a.melden?.("warteliste-abmelden fehlgeschlagen", String(fehler));
      return antwort(500, { fehler: "Fehler" }, herkunft);
    }
  }
  if (anfrageObjekt.method !== "POST") {
    return antwort(405, { fehler: "nur POST" }, herkunft);
  }

  // Teil M: unerwartete Fehler (z. B. SMTP-Versand/fehlende Secrets) nicht als
  // nackten 500 durchreichen, sondern als klaren Fehler in der Antwort – und,
  // ueber a.melden in den Aufrufern, auch im Log. Nie still verschlucken.
  try {
    switch (pfad) {
      case "neuer-trainer":
        return await neuerTrainer(anfrageObjekt, a, herkunft);
      case "neuer-kunde":
        return await neuerKunde(anfrageObjekt, a, herkunft);
      case "neue-anfrage":
        return await neueAnfrage(anfrageObjekt, a, herkunft);
      case "admin-aktion":
        return await adminAktion(anfrageObjekt, a, herkunft);
      case "freigabe-pruefen":
        return await freigabePruefen(anfrageObjekt, a, herkunft);
      case "passt-nicht":
        return await passtNicht(anfrageObjekt, a, herkunft);
      case "unbeantwortet-pruefen":
        return await unbeantwortetePruefen(anfrageObjekt, a, herkunft);
      case "erinnerungen":
        return await erinnerungenPruefen(anfrageObjekt, a, herkunft);
      case "abendbericht":
        return await abendberichtPruefen(anfrageObjekt, a, herkunft);
      case "erinnerung-abmelden":
        return await erinnerungAbmeldenEndpunkt(anfrageObjekt, a, herkunft);
      case "warteliste-bestaetigung":
        return await wartelisteBestaetigung(anfrageObjekt, a, herkunft);
      case "warteliste-abmelden":
        return await wartelisteAbmeldenEndpunkt(anfrageObjekt, a, herkunft);
      case "stripe":
        return await stripe(anfrageObjekt, a);
      default:
        return antwort(404, { fehler: "unbekannter Pfad" }, herkunft);
    }
  } catch (fehler) {
    const nachricht = String((fehler as { message?: string })?.message ?? fehler);
    a.melden?.("bearbeiten: unerwarteter Fehler", { pfad, fehler: nachricht });
    return antwort(500, { fehler: nachricht }, herkunft);
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
  // Teil M: die (gerade angelegte) Trainerzeile nachschlagen – für den Deep-Link
  // #trainer-<id> und die Profil-Vollständigkeit x/8. Best effort: schlägt das
  // fehl, geht die Mail mit den Formularwerten (ohne Deep-Link) raus.
  let profil: Record<string, unknown> | null = null;
  try {
    profil = a.trainerProfilNachEmail
      ? ((await a.trainerProfilNachEmail(String(body.email))) as Record<string, unknown> | null)
      : null;
  } catch (fehler) {
    a.melden?.("neuer-trainer: Profil-Nachschlag fehlgeschlagen", String(fehler));
  }
  const gesendet = await sendeWennAdresseTaugt(a, mailNeuerTrainer(body, profil));
  // Teil A: Push-Mitteilung an alle Admin-Geräte (best effort, nach der Mail –
  // ohne VAPID-Secrets übersprungen, die Mail bleibt davon unberührt).
  await pushBenachrichtigung(a, pushNeuerTrainer(body, profil));
  // Teil 7: CompleteRegistration zusaetzlich serverseitig an die Meta Conversions
  // API (nur bei Zustimmung, mit event_id zum Entdoppeln). Best effort: ein
  // Fehler oder ein fehlendes Secret bremst die Registrierung nicht.
  const capi = await sendeMetaConversion(a, body);
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0, capi }, herkunft);
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

  // Teil M: Kundenzeile nachschlagen (Deep-Link #kunde-<id> + Inhalte). Best effort.
  let profil: Record<string, unknown> | null = null;
  try {
    profil = a.kundeProfilNachEmail ? await a.kundeProfilNachEmail(String(body.email)) : null;
  } catch (fehler) {
    a.melden?.("neuer-kunde: Profil-Nachschlag fehlgeschlagen", String(fehler));
  }
  const gesendet = await sendeWennAdresseTaugt(a, mailNeuerKunde(body, profil));
  await pushBenachrichtigung(a, pushNeuerKunde(body, profil));
  // B6c: CompleteRegistration auch fuer den Kunden-Pfad serverseitig an die Meta
  // Conversions API, mit derselben event_id wie das Browser-Pixel (Entdopplung).
  // Genau wie beim Trainer-Pfad: nur bei Zustimmung UND vorhandener event_id;
  // der Wartelisten-Aufruf (/neuer-kunde ohne event_id, suche.html) sendet nichts.
  const capi = await sendeMetaConversion(a, body);
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0, capi }, herkunft);
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

  // S3: Missbrauchsverdacht (Wegwerf-Mail, unsinniger Name/Nachricht). Verdaechtige
  // Anfragen gehen NICHT an den Trainer, sondern in die Admin-Liste „Zur Pruefung".
  // Best effort: fehlt die Spalte pruef_status, laeuft es wie bisher weiter.
  const verdacht = anfrageVerdacht({
    email: kundenEmail,
    name: body.kunde_name ?? body.kunden_name,
    nachricht: body.kunde_nachricht ?? body.nachricht,
    domains: a.wegwerfDomains ? a.wegwerfDomains() : new Set<string>(),
  });
  if (verdacht.verdaechtig && a.anfrageZurPruefung) {
    let gesetzt = false;
    try { gesetzt = await a.anfrageZurPruefung(String(body.trainer_id), kundenEmail, verdacht.grund); }
    catch (fehler) { a.melden?.("anfrageZurPruefung fehlgeschlagen", String(fehler)); }
    if (gesetzt) {
      a.melden?.("Anfrage zur Pruefung (kein Trainer-Versand)", { grund: verdacht.grund });
      return antwort(200, { ok: true, mails: 0, zur_pruefung: true, grund: verdacht.grund }, herkunft);
    }
    // Konnte nicht markiert werden (Spalte fehlt) -> wie bisher ausliefern.
  }

  // Baustein 1: Studio-Trainer (angestellt) zahlen nichts. Erkennung allein an
  // trainers.studio_standort_id. Dann KEIN Zahlungslink: Kontaktdaten direkt in
  // die Mail, und die aelteste offene Anfrage wird freigeschaltet, damit sie
  // auch im Trainerbereich ohne Zahlung sichtbar ist (weitergeleitet = true).
  // Der Zweig fuer normale Trainer darunter bleibt unveraendert.
  // Trainer-spezifische Mail zuerst (bleibt mails[0]): Studio-Trainer bekommen die
  // Kontaktdaten direkt, normale Trainer die erste/weitere Anfrage mit Zahlungslink.
  let trainerMail = false;
  if (trainer.studio_standort_id) {
    trainerMail = await sendeWennAdresseTaugt(a, mailStudioAnfrage(trainer, body));
    const offene = await a.aeltesteOffeneAnfrage(trainer.id);
    if (offene) await a.anfrageWeitergeleitetMarkieren(offene.id);
  } else {
    const mail = trainer.stripe_bezahlt === true
      ? mailWeitereAnfrage(trainer, body)
      : mailErsteAnfrage(trainer, body);
    trainerMail = await sendeWennAdresseTaugt(a, mail);
  }
  // Teil M: zusätzlich die interne Benachrichtigung an Jakob (Deep-Link
  // #anfrage-<id>, falls der Browser die Anfrage-Kennung mitschickt, sonst
  // #anfragen). BETREIBER ist immer gültig – daher in der Regel +1 Mail.
  const anJakob = await sendeWennAdresseTaugt(
    a,
    mailNeueAnfrageIntern(body, w(body.anfrage_id) || null),
  );
  const mails = (trainerMail ? 1 : 0) + (anJakob ? 1 : 0);
  await pushBenachrichtigung(a, pushNeueAnfrage(body, w(body.anfrage_id) || null));
  return antwort(
    200,
    { ok: true, mails, ...(trainer.studio_standort_id ? { studio: true } : {}) },
    herkunft,
  );
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
/** 'trainer'/'trainers' -> "trainers", 'kunde'/'kunden' -> "kunden", sonst null. */
function artTabelle(art: unknown): "trainers" | "kunden" | null {
  const s = String(art ?? "");
  if (s === "trainer" || s === "trainers") return "trainers";
  if (s === "kunde" || s === "kunden") return "kunden";
  return null;
}

/**
 * Abwaertskompatibilitaet (Teil 1): Sperren/Loeschen brauchen die Spalte
 * `gesperrt` aus Migration 2026-10-31-09. Fehlt sie (Migration nicht
 * eingespielt), antwortet PostgREST mit 42703 („column ... does not exist").
 * Daraus machen wir einen verstaendlichen Hinweis statt eines rohen HTTP-Fehlers.
 */
export function istMigrationFehlt(fehler: unknown): boolean {
  const s = String((fehler as { message?: string })?.message ?? fehler ?? "");
  return /42703|42P01|does not exist|column .*gesperrt|admin_protokoll/i.test(s);
}
const MIGRATION_HINWEIS =
  "Die Datenbank-Erweiterung fehlt (Migration 2026-10-31-09 gesperrt/Protokoll nicht eingespielt). Bitte im Supabase-SQL-Editor einspielen, dann erneut versuchen.";

/** Admin-Dashboard neu, Teil 3: erkennt die noch fehlende Kick-Funktion
 *  admin_person_kicken (Migration 2026-11-01-02 nicht eingespielt). PostgREST
 *  meldet dann PGRST202/42883 bzw. „Could not find the function". */
export function istKickenMigrationFehlt(fehler: unknown): boolean {
  const s = String((fehler as { message?: string })?.message ?? fehler ?? "");
  return /admin_person_kicken|PGRST202|42883|Could not find the function/i.test(s);
}
const KICKEN_MIGRATION_HINWEIS =
  "Die Lösch-Funktion fehlt noch (Migration 2026-11-01-02-admin-neu.sql nicht eingespielt). Bitte im Supabase-SQL-Editor einspielen, dann erneut versuchen.";

/** Kurztext aus einem Fehler (message oder String), fuer die Rueckmeldung an die
 *  Verwaltung. Ohne Zeilenumbrueche, begrenzt. */
function fehlerText(fehler: unknown): string {
  const s = String((fehler as { message?: string })?.message ?? fehler ?? "");
  return s.replace(/\s+/g, " ").trim().slice(0, 200) || "unbekannter Fehler";
}

/** Freischalt-Mail: ist der Versand laut Profil schon vermerkt? Ein gesetzter
 *  Zeitstempel (String) oder true zaehlen als „gesendet". Fehlt die Spalte
 *  (undefined), gilt: noch nicht gesendet (dann laesst sich nicht entdoppeln). */
export function freischaltMailSchonGesendet(t: TrainerProfil): boolean {
  const v = t.freischalt_mail_gesendet;
  return v === true || (typeof v === "string" && v.trim() !== "");
}

/** Freischalt-Mail: fehlt die Spalte (Migration 2026-11-01-04 nicht eingespielt)?
 *  Dann steht der Schluessel gar nicht im select=*-Ergebnis. */
function freischaltSpalteFehlt(t: TrainerProfil): boolean {
  return !("freischalt_mail_gesendet" in t);
}

export interface FreischaltMailErgebnis {
  gesendet: boolean;
  grund?: string;
  /** true, wenn die Mail schon einmal gesendet war (kein erneuter Versand). */
  schon?: boolean;
  /** true, wenn die Einmal-Sperre fehlt (Spalte/Migration nicht da). */
  sperre_fehlt?: boolean;
  /** Zeitpunkt des Versands (ISO), wenn gerade gesendet. */
  datum?: string;
}

/**
 * Schickt die Freischalt-Mail an den Trainer und vermerkt den Versand (Einmal-
 * Sperre). „Genau einmal": ist der Zeitstempel schon gesetzt, passiert nichts
 * (schon=true). Scheitert der Versand, bleibt die Freigabe bestehen (der Aufrufer
 * hat aktiv schon gesetzt) und der Grund geht zurueck – nie geworfen. Fehlt die
 * Spalte, wird trotzdem gesendet (sperre_fehlt=true), nur ohne Entdopplung.
 */
async function freischaltMailAbwickeln(
  a: Anschluesse,
  zielId: string,
): Promise<FreischaltMailErgebnis> {
  if (!a.trainerProfilNachId) return { gesendet: false, grund: "in dieser Fassung nicht verfuegbar" };
  let t: TrainerProfil | null = null;
  try {
    t = await a.trainerProfilNachId(zielId);
  } catch (fehler) {
    return { gesendet: false, grund: fehlerText(fehler) };
  }
  if (!t) return { gesendet: false, grund: "Trainer nicht gefunden" };
  if (freischaltMailSchonGesendet(t)) return { gesendet: false, schon: true, grund: "schon gesendet" };
  const sperreFehlt = freischaltSpalteFehlt(t);
  try {
    const ok = await sendeWennAdresseTaugt(a, mailFreischaltung(t));
    if (!ok) return { gesendet: false, grund: "E-Mail-Adresse des Trainers ist ungueltig" };
  } catch (fehler) {
    return { gesendet: false, grund: fehlerText(fehler) };
  }
  const datum = new Date().toISOString();
  // Versand vermerken. Mail ist raus; schlaegt NUR der Vermerk fehl, gilt die
  // Mail trotzdem als gesendet (sonst wuerde die Verwaltung „erneut senden"
  // anbieten und doppelt senden) – wir melden dann die fehlende Sperre.
  if (!sperreFehlt) {
    try {
      await a.adminTrainerSetzen(zielId, { freischalt_mail_gesendet: datum });
    } catch (fehler) {
      if (!istMigrationFehlt(fehler)) a.melden?.("freischalt-mail: Vermerk nicht gesetzt", String(fehler));
      return { gesendet: true, datum, sperre_fehlt: true };
    }
  }
  return { gesendet: true, datum, sperre_fehlt: sperreFehlt };
}

/**
 * Teil A: Push-Aktionen der Verwaltung (Gerät aktivieren, Geräteliste, Gerät
 * entfernen). Wird nur aus adminAktion aufgerufen, NACH Admin-Konto- und
 * aal2-Prüfung. Abos werden nur hier (service_role) geschrieben/gelesen.
 */
async function adminPushAktion(
  aktion: string,
  body: Record<string, unknown>,
  a: Anschluesse,
  adminId: string,
  herkunft: string | null,
): Promise<Response> {
  if (aktion === "push_abo_speichern") {
    const abo = (body.abo ?? {}) as Record<string, unknown>;
    const endpoint = String(abo.endpoint ?? "");
    const p256dh = String(abo.p256dh ?? "");
    const auth = String(abo.auth ?? "");
    if (!endpoint.startsWith("https://") || !p256dh || !auth) {
      return antwort(400, { fehler: "Abo unvollständig" }, herkunft);
    }
    if (!a.pushAboSpeichern) {
      return antwort(501, { fehler: "Push ist in dieser Fassung nicht verfügbar" }, herkunft);
    }
    await a.pushAboSpeichern({ endpoint, p256dh, auth, geraet: String(abo.geraet ?? "") || null });
    await a.protokoll?.({ admin_id: adminId, aktion, ziel_tabelle: "push_abos", ziel_id: "-", ergebnis: "gespeichert" });
    return antwort(200, { ok: true }, herkunft);
  }
  if (aktion === "push_abos_liste") {
    if (!a.pushAbosLesen) return antwort(200, { ok: true, abos: [] }, herkunft);
    const abos = await a.pushAbosLesen();
    // Nur unbedenkliche Felder zurückgeben (kein Endpoint, keine Schlüssel).
    return antwort(200, {
      ok: true,
      abos: abos.map((x) => ({ id: x.id ?? "", geraet: x.geraet ?? "", erstellt_am: x.erstellt_am ?? "" })),
    }, herkunft);
  }
  if (aktion === "push_abo_entfernen") {
    const id = String(body.ziel_id ?? body.id ?? "");
    if (!id) return antwort(400, { fehler: "id fehlt" }, herkunft);
    if (!a.pushAboEntfernenNachId) {
      return antwort(501, { fehler: "Push ist in dieser Fassung nicht verfügbar" }, herkunft);
    }
    const n = await a.pushAboEntfernenNachId(id);
    await a.protokoll?.({ admin_id: adminId, aktion, ziel_tabelle: "push_abos", ziel_id: id, ergebnis: `entfernt=${n}` });
    return antwort(200, { ok: true, entfernt: n }, herkunft);
  }
  return antwort(400, { fehler: "unbekannte Push-Aktion" }, herkunft);
}

async function adminAktion(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = bearerToken(r);
  const nutzer = token ? await a.benutzerAusToken(token) : null;
  if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);
  if (nutzer.id !== ADMIN_ID) return antwort(403, { fehler: "kein Admin" }, herkunft);
  // Admin-Dashboard neu, Teil 1: zweiter Faktor (MFA, aal2) ist Pflicht. Ein
  // Admin-Token ohne bestaetigten zweiten Faktor (aal1) darf keine Aktion
  // ausloesen. aal kommt aus dem Token (index.ts: aalAusToken).
  if ((nutzer.aal ?? null) !== "aal2") {
    return antwort(403, { fehler: "Zweiter Faktor erforderlich (aal2)." }, herkunft);
  }
  // Einfache Mengenbegrenzung je Admin und Minute.
  if (ratenGrenzeUeberschritten(nutzer.id)) {
    return antwort(429, { fehler: "Zu viele Aktionen in kurzer Zeit. Bitte kurz warten." }, herkunft);
  }

  const body = await koerperLesen(r);
  if (!body) return antwort(400, { fehler: "Die Anfrage war nicht lesbar." }, herkunft);
  const aktion = String(body.aktion ?? "");
  // Teil A: Push-Aktionen tragen kein ziel_id (sie betreffen Geräte-Abos, nicht
  // einen Trainer/Kunden) – vor der ziel_id-Pflicht abhandeln. Sie laufen genau
  // wie die übrigen Aktionen nur mit Admin-Konto + aal2 (oben geprüft).
  if (aktion.startsWith("push_")) {
    return await adminPushAktion(aktion, body, a, nutzer.id, herkunft);
  }
  // B7: Test-Auslöser „Abendbericht jetzt senden" (Reiter Protokoll). Kein
  // ziel_id – vor der ziel_id-Pflicht. Läuft über dieselbe Admin-Prüfung
  // (Admin-Konto + aal2, oben) wie alle Aktionen und schickt den Bericht sofort,
  // ohne die 16-Uhr-Prüfung. Jeder Versuch landet im admin_protokoll.
  if (aktion === "abendbericht_jetzt") {
    try {
      const erg = await abendberichtSenden(a, "admin", nutzer.id);
      return antwort(200, { ok: true, gesendet: true, mail: erg.mail, zahlen: erg.zahlen }, herkunft);
    } catch (fehler) {
      return antwort(500, {
        fehler: "Abendbericht konnte nicht gesendet werden.",
        grund: String((fehler as { message?: string })?.message ?? fehler),
      }, herkunft);
    }
  }
  const zielId = String(body.ziel_id ?? "");
  if (!zielId) return antwort(400, { fehler: "ziel_id fehlt" }, herkunft);
  // Eingaben begrenzen (Typ/Laenge): Kennungen sind UUIDs/kurze Strings.
  if (zielId.length > 100) return antwort(400, { fehler: "ziel_id ungueltig" }, herkunft);
  if (aktion.length > 50) return antwort(400, { fehler: "aktion ungueltig" }, herkunft);

  // Protokoll (Konsole zusaetzlich; die verbindliche Spur steht in admin_protokoll,
  // geschrieben am Ende jeder Aktion). Keine Klartext-Personendaten.
  a.melden?.(
    `admin-aktion ${new Date().toISOString()} admin=${nutzer.id} aktion=${aktion} ziel=${zielId}`,
  );

  let geaendert = 0;
  switch (aktion) {
    case "trainer_aktivieren": {
      // Freigeben: aktiv setzen, dann EINMALIG die Freischalt-Mail an den Trainer.
      // Scheitert die Mail, bleibt die Freigabe bestehen (aktiv ist schon gesetzt);
      // der Grund geht an die Verwaltung, die „erneut senden" anbietet.
      const n = await a.adminTrainerSetzen(zielId, { aktiv: true });
      const mail: FreischaltMailErgebnis = n > 0
        ? await freischaltMailAbwickeln(a, zielId)
        : { gesendet: false, grund: "keine Zeile geaendert" };
      // B4.2: Warteliste in der PLZ-Region des Trainers benachrichtigen (best effort,
      // bricht die Freigabe nicht). Jeder Eintrag höchstens einmal.
      let warteliste = { mails: 0 };
      if (n > 0) {
        try { warteliste = await wartelisteAufFreigabe(a, zielId); }
        catch (fehler) { a.melden?.("warteliste bei Freigabe fehlgeschlagen", String(fehler)); }
      }
      await a.protokoll?.({
        admin_id: nutzer.id,
        aktion,
        ziel_tabelle: "trainers",
        ziel_id: zielId,
        ergebnis: `geaendert=${n} mail=${mail.gesendet} warteliste=${warteliste.mails}${mail.grund ? " (" + mail.grund + ")" : ""}`,
      });
      return antwort(200, { ok: true, geaendert: n, mail, warteliste }, herkunft);
    }

    // Freischalt-Mail einzeln senden / nach einem Fehler erneut senden
    // (Verwaltung: Knopf beim Trainer). Dieselbe Einmal-Sperre wie beim Freigeben.
    case "trainer_freischalt_mail": {
      const mail = await freischaltMailAbwickeln(a, zielId);
      await a.protokoll?.({
        admin_id: nutzer.id,
        aktion,
        ziel_tabelle: "trainers",
        ziel_id: zielId,
        ergebnis: `mail=${mail.gesendet}${mail.grund ? " (" + mail.grund + ")" : ""}`,
      });
      return antwort(200, { ok: true, mail }, herkunft);
    }
    case "trainer_sperren":
      geaendert = await a.adminTrainerSetzen(zielId, { aktiv: false });
      break;
    // B7: Test-/Spam-Konto markieren bzw. die Markierung aufheben. Nichts wird
    // gelöscht; markierte Konten werden ausgeblendet, bekommen keine
    // Erinnerungen und zählen nicht im Abendbericht. Fehlt die Spalte ist_test
    // (Migration 2026-11-06-02 noch nicht eingespielt), kommt ein klarer Hinweis.
    case "trainer_test_markieren":
    case "trainer_test_aufheben":
      try {
        geaendert = await a.adminTrainerSetzen(zielId, { ist_test: aktion === "trainer_test_markieren" });
      } catch (fehler) {
        if (istMigrationFehlt(fehler)) return antwort(400, { fehler: MIGRATION_HINWEIS }, herkunft);
        throw fehler;
      }
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

    // ── Teil 5: Login sperren/entsperren (umkehrbar) ──
    case "login_sperren":
    case "login_entsperren": {
      const tabelle = artTabelle(body.art);
      if (!tabelle) return antwort(400, { fehler: "art fehlt (trainer/kunde)" }, herkunft);
      if (!a.personUserId || !a.personGesperrtSetzen || !a.authSperren) {
        return antwort(501, { fehler: "Sperren ist in dieser Fassung nicht verfuegbar" }, herkunft);
      }
      const an = aktion === "login_sperren";
      try {
        const userId = await a.personUserId(tabelle, zielId);
        let konto = false;
        if (userId) { await a.authSperren(userId, an); konto = true; }
        const n = await a.personGesperrtSetzen(tabelle, zielId, an);
        await a.protokoll?.({ admin_id: nutzer.id, aktion, ziel_tabelle: tabelle, ziel_id: zielId, ergebnis: `gesperrt=${an} konto=${konto}` });
        return antwort(200, { ok: true, geaendert: n, gesperrt: an, konto }, herkunft);
      } catch (fehler) {
        if (istMigrationFehlt(fehler)) return antwort(400, { fehler: MIGRATION_HINWEIS }, herkunft);
        throw fehler;
      }
    }

    // ── Teil 5: endgueltig loeschen (Auth-Benutzer + Zeile, sonst anonymisieren) ──
    case "endgueltig_loeschen": {
      if (body.bestaetigt !== true) return antwort(400, { fehler: "Bestaetigung fehlt" }, herkunft);
      const tabelle = artTabelle(body.art);
      if (!tabelle) return antwort(400, { fehler: "art fehlt (trainer/kunde)" }, herkunft);
      if (!a.zeileLoeschenOderAnonymisieren) {
        return antwort(501, { fehler: "Loeschen ist in dieser Fassung nicht verfuegbar" }, herkunft);
      }
      try {
        const userId = a.personUserId ? await a.personUserId(tabelle, zielId) : null;
        if (userId && a.authNutzerLoeschen) await a.authNutzerLoeschen(userId);
        const res = await a.zeileLoeschenOderAnonymisieren(tabelle, zielId);
        await a.protokoll?.({ admin_id: nutzer.id, aktion, ziel_tabelle: tabelle, ziel_id: zielId, ergebnis: `geloescht=${res.geloescht} anonymisiert=${res.anonymisiert} konto=${!!userId}` });
        return antwort(200, { ok: true, geloescht: res.geloescht, anonymisiert: res.anonymisiert, konto: !!userId }, herkunft);
      } catch (fehler) {
        if (istMigrationFehlt(fehler)) return antwort(400, { fehler: MIGRATION_HINWEIS }, herkunft);
        throw fehler;
      }
    }

    // ── Admin-Dashboard neu, Teil 3: Kicken (endgueltig loeschen, vollstaendig) ──
    // Loescht Person + eigene Daten (Anfragen, Alerts, Warteliste) in EINER
    // DB-Transaktion (admin_person_kicken), dann Anmeldekonto und Speicher-Dateien.
    // Zahlungs-/Buchhaltungsdaten bleiben anonymisiert erhalten (7-Jahres-Frist).
    case "person_kicken": {
      if (body.bestaetigt !== true) return antwort(400, { fehler: "Bestaetigung fehlt" }, herkunft);
      const tabelle = artTabelle(body.art);
      if (!tabelle) return antwort(400, { fehler: "art fehlt (trainer/kunde)" }, herkunft);
      if (!a.personKickenDb) {
        return antwort(501, { fehler: "Kicken ist in dieser Fassung nicht verfuegbar" }, herkunft);
      }
      try {
        // 1. Speicher-Dateien einsammeln, solange die Zeile noch steht.
        let dateien = { avatars: [] as string[], galerie: [] as string[], zertifikate: [] as string[] };
        if (a.personDateien) {
          try { dateien = await a.personDateien(tabelle, zielId); } catch (f) { a.melden?.("kicken: personDateien", String(f)); }
        }
        // 2. Auth-Kennung merken (fuer das Konto-Loeschen nach der Transaktion).
        const userId = a.personUserId ? await a.personUserId(tabelle, zielId) : null;
        // 3. DB-Transaktion: Person + eigene Daten weg, Zahlungen anonymisiert.
        //    Scheitert sie, ist nichts geloescht (atomar) und der echte Fehler
        //    geht zurueck – kein halber Zustand.
        const zahlen = await a.personKickenDb(tabelle, zielId);
        // 4. Anmeldekonto loeschen. Scheitert das (selten), ist die Person in der
        //    DB bereits weg; dann nur vermerken (konto=false), nicht abbrechen.
        let konto = false;
        if (userId && a.authNutzerLoeschen) {
          try { await a.authNutzerLoeschen(userId); konto = true; } catch (f) { a.melden?.("kicken: authNutzerLoeschen", String(f)); }
        }
        // 5. Speicher aufraeumen (best effort; verwaiste Dateien sind harmlos).
        if (a.storageLoeschen) {
          for (const [bucket, pfade] of [["avatars", dateien.avatars], ["galerie", dateien.galerie], ["zertifikate", dateien.zertifikate]] as const) {
            if (pfade.length) {
              try { await a.storageLoeschen(bucket, pfade); } catch (f) { a.melden?.("kicken: storage " + bucket, String(f)); }
            }
          }
        }
        const zahlenText = Object.entries(zahlen).map(([k, v]) => `${k}=${v}`).join(" ");
        await a.protokoll?.({ admin_id: nutzer.id, aktion, ziel_tabelle: tabelle, ziel_id: zielId, ergebnis: `konto=${konto} ${zahlenText}` });
        return antwort(200, { ok: true, konto, ...zahlen }, herkunft);
      } catch (fehler) {
        if (istKickenMigrationFehlt(fehler)) return antwort(400, { fehler: KICKEN_MIGRATION_HINWEIS }, herkunft);
        if (istMigrationFehlt(fehler)) return antwort(400, { fehler: MIGRATION_HINWEIS }, herkunft);
        throw fehler;
      }
    }

    // ── S3: verdaechtige Anfrage aus „Zur Pruefung" FREIGEBEN: pruef_status auf
    // 'ok' setzen und den Trainer jetzt doch benachrichtigen. ──
    case "anfrage_freigeben": {
      if (!a.anfrageNachId || !a.anfragePruefSetzen) {
        return antwort(501, { fehler: "Anfrage-Pruefung in dieser Fassung nicht verfuegbar" }, herkunft);
      }
      const anfrage = await a.anfrageNachId(zielId);
      if (!anfrage) return antwort(404, { fehler: "Anfrage nicht gefunden" }, herkunft);
      const n = await a.anfragePruefSetzen(zielId, "ok");
      let mails = 0;
      const trainer = anfrage.trainer_id ? await a.trainerNachId(String(anfrage.trainer_id)) : null;
      if (trainer) {
        const mailBody = {
          trainer_id: anfrage.trainer_id,
          trainer_name: anfrage.trainer_name,
          kunde_name: anfrage.kunden_name,
          kunden_name: anfrage.kunden_name,
          kunde_email: anfrage.kunden_email,
          kunden_email: anfrage.kunden_email,
          kunde_ziel: anfrage.ziel,
          ziel: anfrage.ziel,
          kunde_nachricht: anfrage.nachricht,
          nachricht: anfrage.nachricht,
        };
        const mail = trainer.studio_standort_id
          ? mailStudioAnfrage(trainer, mailBody)
          : (trainer.stripe_bezahlt === true ? mailWeitereAnfrage(trainer, mailBody) : mailErsteAnfrage(trainer, mailBody));
        if (await sendeWennAdresseTaugt(a, mail)) mails++;
      }
      await a.protokoll?.({ admin_id: nutzer.id, aktion, ziel_tabelle: "anfragen", ziel_id: zielId, ergebnis: `freigegeben geaendert=${n} mail=${mails}` });
      return antwort(200, { ok: true, geaendert: n, mails }, herkunft);
    }

    // ── S3: verdaechtige Anfrage VERWERFEN: pruef_status auf 'verworfen'. ──
    case "anfrage_verwerfen": {
      if (!a.anfragePruefSetzen) {
        return antwort(501, { fehler: "Anfrage-Pruefung in dieser Fassung nicht verfuegbar" }, herkunft);
      }
      const n = await a.anfragePruefSetzen(zielId, "verworfen");
      await a.protokoll?.({ admin_id: nutzer.id, aktion, ziel_tabelle: "anfragen", ziel_id: zielId, ergebnis: `verworfen geaendert=${n}` });
      return antwort(200, { ok: true, geaendert: n }, herkunft);
    }

    // ── Land eindeutig (07.11.2026): fehlendes Land einer Person von Hand
    // zuordnen. Fuer die Admin-Liste „PLZ ohne Land". Nur 'AT'/'DE'/'CH'. ──
    case "land_setzen": {
      const tabelle = artTabelle(body.art);
      if (!tabelle) return antwort(400, { fehler: "art fehlt (trainer/kunde)" }, herkunft);
      const land = String(body.land ?? "").trim().toUpperCase();
      if (land !== "AT" && land !== "DE" && land !== "CH") {
        return antwort(400, { fehler: "land muss AT, DE oder CH sein" }, herkunft);
      }
      if (!a.adminLandSetzen) {
        return antwort(501, { fehler: "Land-Zuordnung ist in dieser Fassung nicht verfuegbar" }, herkunft);
      }
      try {
        const n = await a.adminLandSetzen(tabelle, zielId, land as "AT" | "DE" | "CH");
        await a.protokoll?.({ admin_id: nutzer.id, aktion, ziel_tabelle: tabelle, ziel_id: zielId, ergebnis: `land=${land} geaendert=${n}` });
        return antwort(200, { ok: true, geaendert: n, land }, herkunft);
      } catch (fehler) {
        if (istMigrationFehlt(fehler)) return antwort(400, { fehler: MIGRATION_HINWEIS }, herkunft);
        throw fehler;
      }
    }

    default:
      return antwort(400, { fehler: "unbekannte Aktion" }, herkunft);
  }
  // Protokoll fuer die einfachen Aktionen (Freigeben/Sperren/Bezahlt/
  // Verifizieren/Loeschen). Keine Personendaten, nur Aktion/Ziel/Ergebnis.
  await a.protokoll?.({
    admin_id: nutzer.id,
    aktion,
    ziel_tabelle: aktion.startsWith("kunde") ? "kunden" : "trainers",
    ziel_id: zielId,
    ergebnis: `geaendert=${geaendert}`,
  });
  return antwort(200, { ok: true, geaendert }, herkunft);
}

/**
 * Teil 4: wird nach dem Speichern aus dem Trainerbereich aufgerufen und prueft
 * das EIGENE Profil des angemeldeten Trainers. Ist es erstmals vollstaendig und
 * der Trainer noch nicht freigegeben, geht EINMALIG eine Freigabe-Bitte an
 * BETREIBER (office@vexfit.app). „Genau einmal" sichert das Feld
 * freigabe_mail_gesendet. Fehlt die Spalte (Migration 2026-11-01-01 nicht
 * eingespielt) oder der Anschluss, passiert nichts (nur ein Log-Hinweis) – so
 * laeuft der Trainerbereich auch ohne Migration fehlerfrei weiter (Teil 1).
 */
async function freigabePruefen(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = bearerToken(r);
  const nutzer = token ? await a.benutzerAusToken(token) : null;
  if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);
  if (!a.trainerProfilNachEmail) {
    a.melden?.("freigabe-pruefen: Anschluss nicht verfuegbar");
    return antwort(200, { ok: true, gesendet: false, grund: "nicht verfuegbar" }, herkunft);
  }
  const t = nutzer.email ? await a.trainerProfilNachEmail(nutzer.email) : null;
  if (!t) return antwort(200, { ok: true, gesendet: false, grund: "kein Trainer" }, herkunft);
  if (t.aktiv === true) return antwort(200, { ok: true, gesendet: false, grund: "schon aktiv" }, herkunft);
  if (t.freigabe_mail_gesendet === true) {
    return antwort(200, { ok: true, gesendet: false, grund: "schon gemeldet" }, herkunft);
  }
  if (!profilVollstaendig(t)) {
    return antwort(200, { ok: true, gesendet: false, grund: "unvollstaendig" }, herkunft);
  }
  // Ohne die Spalte laesst sich „genau einmal" nicht sichern -> nicht senden
  // (verhindert Mehrfachversand bei jedem Speichern), nur Hinweis.
  if (!("freigabe_mail_gesendet" in t) || t.freigabe_mail_gesendet === undefined) {
    a.melden?.("freigabe-pruefen: Spalte freigabe_mail_gesendet fehlt (Migration 2026-11-01-01)");
    return antwort(200, { ok: true, gesendet: false, grund: "migration fehlt" }, herkunft);
  }
  // Teil 2: Doppelversand (zwei gleichzeitige Aufrufe lasen beide „noch nicht
  // gesendet") verhindern. Erst ATOMAR beanspruchen – nur wer den Anspruch
  // bekommt, sendet. Danach erst die Mail. Scheitert der Versand, Anspruch
  // zurücknehmen, damit ein späterer Lauf es erneut versuchen darf.
  if (a.freigabeMailBeanspruchen) {
    let beansprucht = false;
    try {
      beansprucht = await a.freigabeMailBeanspruchen(t.id);
    } catch (fehler) {
      if (istMigrationFehlt(fehler)) {
        a.melden?.("freigabe-pruefen: Anspruch nicht möglich (Migration fehlt)");
        return antwort(200, { ok: true, gesendet: false, grund: "migration fehlt" }, herkunft);
      }
      throw fehler;
    }
    if (!beansprucht) {
      return antwort(200, { ok: true, gesendet: false, grund: "schon gemeldet" }, herkunft);
    }
    let gesendet = false;
    try {
      gesendet = await sendeWennAdresseTaugt(a, mailProfilVollstaendig(t));
    } catch (fehler) {
      // Versand scheiterte -> Anspruch zurücknehmen, damit ein späterer Lauf
      // erneut senden darf, und den Fehler sichtbar lassen.
      try { await a.adminTrainerSetzen(t.id, { freigabe_mail_gesendet: false }); } catch { /* best effort */ }
      throw fehler;
    }
    if (!gesendet) {
      try { await a.adminTrainerSetzen(t.id, { freigabe_mail_gesendet: false }); } catch { /* best effort */ }
    }
    return antwort(200, { ok: true, gesendet }, herkunft);
  }
  // Rückfall ohne atomaren Anspruch (alte Verdrahtung): wie bisher.
  const gesendet = await sendeWennAdresseTaugt(a, mailProfilVollstaendig(t));
  if (gesendet) {
    try {
      await a.adminTrainerSetzen(t.id, { freigabe_mail_gesendet: true });
    } catch (fehler) {
      if (istMigrationFehlt(fehler)) {
        a.melden?.("freigabe-pruefen: Flag konnte nicht gesetzt werden (Migration fehlt)");
      } else throw fehler;
    }
  }
  return antwort(200, { ok: true, gesendet }, herkunft);
}

/**
 * Teil 4: dieselben acht Vollstaendigkeitsfelder wie im Admin
 * (admin.html fehlendeProfilfelder), inkl. Foto. Gibt true, wenn alle erfuellt
 * sind. Rein, damit es ohne Netz pruefbar ist.
 */
export function profilVollstaendig(t: TrainerProfil): boolean {
  const hatText = (v: unknown, minLen = 1) =>
    typeof v === "string" && v.trim().length >= minLen;
  return (
    fotoDa(t.avatar_url) && // Foto (nur aus dem Avatar-Bucket)
    hatText(t.trainingsart) &&
    hatText(t.trainingsort) &&
    Number(t.preis_stunde) > 0 && // Preis pro Stunde
    hatText(t.bio, 11) && // Ueber mich (> 10 Zeichen)
    hatText(t.erfahrung) &&
    Array.isArray(t.spezialisierungen) && t.spezialisierungen.length > 0 &&
    hatText(t.telefon)
  );
}

/** Teil 4 (intern an BETREIBER): Profil ist vollstaendig – bitte freigeben. */
export function mailProfilVollstaendig(t: TrainerProfil): Mail {
  const name = nameFormatieren(`${w(t.vorname)} ${w(t.nachname)}`.trim());
  const spez = Array.isArray(t.spezialisierungen) ? t.spezialisierungen.join(", ") : "";
  return baueMail(
    BETREIBER,
    `Profil vollständig – bitte freigeben: ${name}`,
    {
      ueberschrift: "Profil vollständig – bitte freigeben",
      datenZeilen: [
        { beschriftung: "Name", wert: name },
        { beschriftung: "E-Mail", wert: w(t.email) },
        { beschriftung: "PLZ", wert: w(t.plz) },
        { beschriftung: "Spezialisierungen", wert: spez },
      ],
      knopfText: "Im Admin freigeben",
      knopfLink: ADMIN_LINK,
      grundZeile: "Dieser Trainer hat erstmals alle Profilfelder ausgefüllt.",
    },
  );
}

/** Baustein Freischalt-Mail: dieselben acht Vollstaendigkeitspunkte wie im
 *  Frontend (vexfit-verwaltung.js fehlendeProfilfelder), als deutsche
 *  Beschriftungen und in derselben Reihenfolge. Rein (ohne Netz pruefbar). */
export function freischaltFehlendeFelder(t: TrainerProfil): string[] {
  const hatText = (v: unknown, minLen = 1) =>
    typeof v === "string" && v.trim().length >= minLen;
  const fehlt: string[] = [];
  if (!fotoDa(t.avatar_url)) fehlt.push("Foto");
  if (!hatText(t.trainingsart)) fehlt.push("Trainingsart");
  if (!hatText(t.trainingsort)) fehlt.push("Trainingsort");
  if (!(Number(t.preis_stunde) > 0)) fehlt.push("Preis pro Stunde");
  if (!hatText(t.bio, 11)) fehlt.push("Über mich");
  if (!hatText(t.erfahrung)) fehlt.push("Erfahrung");
  if (!(Array.isArray(t.spezialisierungen) && t.spezialisierungen.length > 0)) fehlt.push("Spezialisierungen");
  if (!hatText(t.telefon)) fehlt.push("Telefon");
  return fehlt;
}

const LOGIN_LINK = "https://vexfit.app/login.html";

/**
 * Baustein Freischalt-Mail (an den TRAINER): „Dein Vexfit-Profil ist
 * freigeschaltet". Du-Form, Wortlaut nach Jakobs Handmail. Der Profil-Hinweis
 * nennt die konkret fehlenden Punkte (mit Knopf/Link in den eigenen Bereich)
 * oder bestaetigt die Vollstaendigkeit. KEINE genaue Adresse in der Mail.
 */
export function mailFreischaltung(t: TrainerProfil): Mail {
  const fehlt = freischaltFehlendeFelder(t);
  const hinweis = fehlt.length === 0
    ? "Dein Profil ist vollständig – perfekt."
    : `Für noch mehr Anfragen fehlen in deinem Profil noch: ${fehlt.join(", ")} – die kannst du jederzeit in deinem Bereich ergänzen.`;
  const absatz =
    `Hallo ${nameFormatieren(w(t.vorname))}, gute Nachrichten: Dein Profil auf Vexfit ist ab sofort ` +
    "freigeschaltet und für Kundinnen und Kunden in deiner Nähe sichtbar. Wir suchen " +
    `jetzt Kunden für dich in deiner Region. ${hinweis} Sobald jemand anfragt, ` +
    "bekommst du eine Mail – du entscheidest selbst, ob du sie annimmst. Erst mit der " +
    "Annahme deiner ersten Kundenanfrage über Vexfit beginnt die Zahlungspflicht – bis " +
    "dahin bleibt alles kostenlos. Bei Fragen einfach auf diese Mail " +
    "antworten. Liebe Grüße, Jakob – Vexfit · office@vexfit.app · +43 660 3675175";
  return baueMail(w(t.email), "Dein Vexfit-Profil ist freigeschaltet", {
    ueberschrift: "Dein Profil ist freigeschaltet",
    absatz,
    datenZeilen: [],
    ...(fehlt.length > 0 ? { knopfText: "Profil vervollständigen", knopfLink: LOGIN_LINK } : {}),
    grundZeile: "Du erhältst diese E-Mail, weil dein Trainerprofil auf Vexfit freigeschaltet wurde.",
  });
}

// ============================================================================
// Teil 4: Erinnerungs-Mails für unvollständige Trainerprofile
// ============================================================================

const VEXFIT_BASIS = "https://vexfit.app";
// Edge-Functions laufen NICHT unter vexfit.app (GitHub Pages, nur statisch),
// sondern unter der Supabase-Functions-Domain – genau wie der Cron-Aufruf in
// der Migration. Der Abmelde-Link MUSS hierher zeigen, sonst läuft er ins Leere.
const FUNKTIONEN_BASIS = "https://hbapzwxdehfgnputrfjf.supabase.co";

/** Feste Zeitfenster nach der Registrierung (in Stunden). Damit Altkonten nicht
 *  auf einmal mehrere Mails bekommen: jede Stufe gilt nur in IHREM Fenster. */
export const ERINNERUNG_FENSTER = [
  { stufe: 1, abStunden: 2, bisStunden: 24 },
  { stufe: 2, abStunden: 24, bisStunden: 72 },
  { stufe: 3, abStunden: 72, bisStunden: 96 },
] as const;

/**
 * Welche Erinnerungsstufe ist für diesen Trainer JETZT fällig – oder null?
 * Rein (ohne Netz prüfbar). Keine Erinnerung, wenn das Profil vollständig,
 * freigeschaltet (aktiv), gesperrt oder abgemeldet ist; außerhalb von 2–96 h
 * nach der Registrierung; oder wenn die Stufe des aktuellen Fensters schon
 * verschickt wurde. Höchstens eine Stufe je Aufruf.
 */
export function erinnerungStufeFaellig(
  t: TrainerProfil,
  jetzt: number = Date.now(),
): number | null {
  if (t.aktiv === true) return null;
  if (t.gesperrt === true) return null;
  if (t.ist_test === true) return null; // B7: Test-/Spam-Konten bekommen keine Erinnerung
  if (t.erinnerungen_aus === true) return null;
  if (profilVollstaendig(t)) return null;
  const ms = t.created_at ? Date.parse(String(t.created_at)) : NaN;
  if (Number.isNaN(ms)) return null;
  const stunden = (jetzt - ms) / 3_600_000;
  const bereits = Number(t.erinnerung_stufe) || 0;
  for (const f of ERINNERUNG_FENSTER) {
    if (stunden >= f.abStunden && stunden < f.bisStunden) {
      return bereits < f.stufe ? f.stufe : null;
    }
  }
  return null; // vor dem ersten Fenster, in keiner Lücke oder ab 96 h
}

/** Ziel-Adresse „zur ersten fehlenden Angabe". Das Profilfoto wird im
 *  Trainer-Bereich hochgeladen, die übrigen Felder stehen in profil-bearbeiten.
 *  Unbekannt/leer → der Profil-Editor ohne Sprungmarke. */
export function erinnerungZiel(erstesFehlend?: string | null): string {
  const anker: Record<string, string> = {
    "Trainingsart": "fTrainingsart",
    "Trainingsort": "dotTrainingsort",
    "Preis pro Stunde": "fPreis",
    "Über mich": "fBio",
    "Erfahrung": "fErfahrung",
    "Spezialisierungen": "chipWrap",
    "Telefon": "fTelefon",
  };
  if (erstesFehlend === "Foto") return `${VEXFIT_BASIS}/trainer-bereich.html`;
  const a = erstesFehlend ? anker[erstesFehlend] : undefined;
  return a ? `${VEXFIT_BASIS}/profil-bearbeiten.html#${a}` : `${VEXFIT_BASIS}/profil-bearbeiten.html`;
}

/** Die drei Erinnerungstexte (Du-Form, österreichisches Deutsch, keine
 *  erfundenen Zahlen). Wortgleich auch in docs/erinnerungs-mails.md. Die
 *  Sichtbarkeit hängt an der Freigabe durch Jakob – genau so steht es hier. */
export const ERINNERUNG_TEXTE: Record<number, { betreff: string; absatz: (vorname: string, offen: number) => string }> = {
  1: {
    betreff: "Dein Vexfit.app-Profil ist fast fertig",
    absatz: (vn, offen) =>
      `Hallo ${vn}, schön, dass du bei Vexfit.app dabei bist! Dein Profil ist ` +
      `noch nicht ganz fertig – es fehlen noch ${offen} von 8 Angaben. Mit einem ` +
      `vollständigen Profil wirkst du auf Interessentinnen und Interessenten ` +
      `gleich überzeugender. Das dauert nur ein paar Minuten.`,
  },
  2: {
    betreff: "Noch ein paar Minuten bis zu deinem fertigen Profil",
    absatz: (vn, offen) =>
      `Hallo ${vn}, dein Profil auf Vexfit.app wartet noch auf dich: ${offen} von ` +
      `8 Angaben fehlen. Je vollständiger dein Profil, desto eher entscheiden sich ` +
      `Interessentinnen und Interessenten für dich. Ergänze die fehlenden Punkte ` +
      `am besten gleich – es geht schnell.`,
  },
  3: {
    betreff: "Letzte Erinnerung zu deinem Vexfit.app-Profil",
    absatz: (vn, offen) =>
      `Hallo ${vn}, das ist unsere letzte Erinnerung: In deinem Profil auf ` +
      `Vexfit.app fehlen noch ${offen} von 8 Angaben. Sobald dein Profil ` +
      `vollständig ist, prüfen wir es und schalten dich frei – dann bist du für ` +
      `Kundinnen und Kunden in deiner Nähe sichtbar. Melde dich gern, wenn du ` +
      `Fragen hast.`,
  },
};

/**
 * Erinnerungs-Mail an den Trainer für eine Stufe (1–3). Anrede mit Vorname,
 * Stand „X von 8 fehlen" aus der bestehenden Logik, die fehlenden Angaben beim
 * Namen, EIN Knopf zur ersten fehlenden Angabe, Abmelde-Link mit Token. Fußzeile
 * ohne genaue Adresse. `abmeldeToken` kommt aus der Trainerzeile.
 */
export function mailErinnerung(
  t: TrainerProfil,
  stufe: number,
  abmeldeToken: string,
): Mail {
  const text = ERINNERUNG_TEXTE[stufe] || ERINNERUNG_TEXTE[1];
  const fehlt = freischaltFehlendeFelder(t);
  const vorname = nameFormatieren(w(t.vorname)) || "du";
  const abmeldeLink = w(abmeldeToken)
    ? `${FUNKTIONEN_BASIS}/functions/v1/vexfit-automation/erinnerung-abmelden?token=${encodeURIComponent(w(abmeldeToken))}`
    : undefined;
  // Teil (Fußzeile): feste 3 Zeilen OHNE Straße/PLZ/Telefon –
  //   1) Vexfit.app · Salzburg · Österreich
  //   2) Impressum-Link (dort steht die vollständige Anschrift, § 5 ECG)
  //   3) Abmelde-Link „Keine Erinnerungen mehr"
  // Daher kein grundZeile-Satz mehr in den Erinnerungen.
  return baueMail(w(t.email), text.betreff, {
    ueberschrift: "Dein Profil ist fast fertig",
    absatz: text.absatz(vorname, fehlt.length),
    datenZeilen: fehlt.length ? [{ beschriftung: "Es fehlt noch", wert: fehlt.join(", ") }] : [],
    knopfText: "Profil jetzt vervollständigen",
    knopfLink: erinnerungZiel(fehlt[0]),
    fusszeile: "Vexfit.app · Salzburg · Österreich",
    impressumLink: `${VEXFIT_BASIS}/rechtliches.html`,
    impressumText: "Impressum",
    ...(abmeldeLink ? { abmeldeLink, abmeldeText: "Keine Erinnerungen mehr" } : {}),
  });
}

/**
 * Teil 4: vom Zeitplan (pg_cron, alle 15 min) gerufen. Prüft den eigenen
 * Schlüssel (x-vexfit-cron / VEXFIT_CRON_KEY, wie unbeantwortet-pruefen), lädt
 * die Kandidaten, bestimmt je Trainer die fällige Stufe, beansprucht sie atomar
 * und schickt höchstens EINE Erinnerung je Trainer. Ohne Verdrahtung/Migration
 * bleibt der Pfad still zu.
 */
async function erinnerungenPruefen(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const geheim = a.cronGeheimnis?.();
  const mitgeschickt = r.headers.get("x-vexfit-cron");
  if (!geheim || !mitgeschickt || mitgeschickt !== geheim) {
    return antwort(401, { fehler: "nicht berechtigt" }, herkunft);
  }
  if (!a.trainerFuerErinnerung || !a.erinnerungStufeBeanspruchen) {
    return antwort(200, { ok: true, geprueft: 0, mails: 0, uebersprungen: "nicht verdrahtet" }, herkunft);
  }
  let kandidaten: TrainerProfil[] = [];
  try {
    kandidaten = await a.trainerFuerErinnerung();
  } catch (fehler) {
    if (istMigrationFehlt(fehler)) {
      a.melden?.("erinnerungen: Spalten fehlen (Migration 2026-11-02 nicht eingespielt)");
      return antwort(200, { ok: true, geprueft: 0, mails: 0, uebersprungen: "migration fehlt" }, herkunft);
    }
    // Bulk-Load gescheitert: ganzen Lauf als fehlgeschlagen protokollieren, aber
    // sauber (HTTP 200) antworten – der Zeitplan soll nicht als Fehler gelten.
    const grund = abendberichtGrund(fehler);
    a.melden?.("erinnerungen: Laden fehlgeschlagen", grund);
    await a.protokoll?.({ aktion: "erinnerungen", ergebnis: `fehlgeschlagen (${grund})` });
    return antwort(200, { ok: true, geprueft: 0, mails: 0, fehlgeschlagen: grund }, herkunft);
  }
  const jetzt = Date.now();
  let mails = 0;
  let behandelt = 0;
  const fehlerListe: string[] = [];
  for (const t of kandidaten) {
    const stufe = erinnerungStufeFaellig(t, jetzt);
    if (!stufe) continue;
    const vorher = Number(t.erinnerung_stufe) || 0;
    const kurz = String(t.id).slice(0, 8);
    // Atomar beanspruchen: nur wer die Stufe bekommt, sendet (ein Lauf = eine
    // Mail je Trainer; keine Doppelung bei Überlappung).
    let beansprucht = false;
    try {
      beansprucht = await a.erinnerungStufeBeanspruchen(t.id, stufe);
    } catch (fehler) {
      // Dieses Element scheitert, die übrigen laufen weiter.
      behandelt++;
      fehlerListe.push(`${kurz}: Beanspruchen ${abendberichtGrund(fehler)}`);
      continue;
    }
    if (!beansprucht) continue;
    behandelt++;
    try {
      const gesendet = await sendeWennAdresseTaugt(a, mailErinnerung(t, stufe, w(t.erinnerung_token)));
      if (gesendet) mails++;
      else {
        // Ungültige Adresse: Stufe auf den Stand vor dem Anspruch zurück, damit
        // ein späterer Lauf es erneut versuchen darf (kein Doppelversand, da die
        // Stufe zurückgesetzt wird).
        try { await a.adminTrainerSetzen(t.id, { erinnerung_stufe: vorher }); } catch { /* best effort */ }
      }
    } catch (fehler) {
      // Versandfehler (z. B. SMTP): dieses Element zählt als Fehler, Stufe zurück
      // (kein Doppelversand, späterer Neuversuch möglich), der Rest läuft weiter.
      fehlerListe.push(`${kurz}: Versand ${abendberichtGrund(fehler)}`);
      try { await a.adminTrainerSetzen(t.id, { erinnerung_stufe: vorher }); } catch { /* best effort */ }
    }
  }
  // Protokoll nur, wenn etwas passiert ist oder ein Fehler auftrat (kein
  // 15-Minuten-Rauschen bei leerem Lauf).
  if (behandelt > 0 || fehlerListe.length > 0) {
    await a.protokoll?.({
      aktion: "erinnerungen",
      ergebnis: cronLaufErgebnis(behandelt, fehlerListe, `${mails} Mail(s) verschickt`),
    });
  }
  return antwort(200, { ok: true, geprueft: kandidaten.length, mails, fehler: fehlerListe.length }, herkunft);
}

/**
 * Teil 4: Abmelde-Link aus der Erinnerungs-Mail (ohne Login). Nimmt das Token
 * aus der Query, stellt weitere Erinnerungen ab und antwortet mit einer kurzen
 * Seite. Unbekanntes/fehlendes Token: freundlicher Hinweis, kein Fehler, keine
 * Preisgabe, ob es das Token gab.
 */
async function erinnerungAbmeldenEndpunkt(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = new URL(r.url).searchParams.get("token") || "";
  if (token && a.erinnerungAbmelden) {
    try { await a.erinnerungAbmelden(token); } catch (fehler) { a.melden?.("erinnerung-abmelden fehlgeschlagen", String(fehler)); }
  }
  const seite = `<!doctype html><html lang="de"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Vexfit.app</title><style>body{margin:0;background:#0a0a0a;color:#f5f5f0;` +
    `font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}` +
    `.k{max-width:420px;text-align:center}h1{color:#e8ff00;font-size:22px}a{color:#e8ff00}</style></head>` +
    `<body><div class="k"><h1>Erledigt</h1><p>Du bekommst keine Erinnerungen mehr zu deinem Vexfit.app-Profil. ` +
    `Du kannst dein Profil jederzeit in deinem <a href="${VEXFIT_BASIS}/login.html">Trainer-Bereich</a> fertigstellen.</p></div></body></html>`;
  return new Response(seite, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...(herkunft ? { "Access-Control-Allow-Origin": herkunft } : {}) },
  });
}

// ============================================================================
// B4: Warteliste, die Kunden zurückholt (Bestätigung + Trainer-da-Mail)
// ============================================================================

/** "Stadt (PLZ)" bzw. nur eines – für die Warteliste-Mails. */
function wartelisteOrt(e: WartelistenEintrag): string {
  const stadt = nameFormatieren(w(e.stadt));
  const plz = w(e.plz);
  if (stadt && plz) return `${stadt} (${plz})`;
  return stadt || plz;
}
/** Abmelde-Link (ohne Login) für die Warteliste-Mails. */
function wartelisteAbmeldeLink(token: string | null | undefined): string | undefined {
  return w(token)
    ? `${FUNKTIONEN_BASIS}/functions/v1/vexfit-automation/warteliste-abmelden?token=${encodeURIComponent(w(token))}`
    : undefined;
}

/** B4.1: Bestätigung direkt nach dem Eintrag in die Warteliste. */
export function mailWartelisteBestaetigung(e: WartelistenEintrag): Mail {
  const ort = wartelisteOrt(e);
  const anrede = w(e.kunden_name) ? `Hallo ${nameFormatieren(w(e.kunden_name))}, ` : "Hallo, ";
  const abmeldeLink = wartelisteAbmeldeLink(e.abmelde_token);
  return baueMail(w(e.kunden_email), "Wir haben deine Anfrage – Vexfit", {
    ueberschrift: "Deine Anfrage ist bei uns",
    absatz: `${anrede}wir haben deine Anfrage für ${ort || "deine Region"}. ` +
      "Sobald ein Trainer in deiner Nähe startet, melden wir uns bei dir.",
    datenZeilen: [],
    fusszeile: "Vexfit.app · Salzburg · Österreich",
    impressumLink: `${VEXFIT_BASIS}/rechtliches.html`,
    impressumText: "Impressum",
    ...(abmeldeLink ? { abmeldeLink, abmeldeText: "Keine Benachrichtigung mehr" } : {}),
  });
}

/** B4.2: „Ein Trainer in deiner Nähe ist da" bei Freigabe in der PLZ-Region. */
export function mailTrainerDa(e: WartelistenEintrag): Mail {
  const ort = wartelisteOrt(e);
  const anrede = w(e.kunden_name) ? `Hallo ${nameFormatieren(w(e.kunden_name))}, ` : "Hallo, ";
  const abmeldeLink = wartelisteAbmeldeLink(e.abmelde_token);
  return baueMail(w(e.kunden_email), "Ein Trainer in deiner Nähe ist da – Vexfit", {
    ueberschrift: "Ein Trainer in deiner Nähe ist da",
    absatz: `${anrede}gute Nachricht: In ${ort || "deiner Region"} ist jetzt ein Personal ` +
      "Trainer auf Vexfit verfügbar. Schau dir die Trainer an und frag direkt an.",
    datenZeilen: [],
    knopfText: "Trainer ansehen",
    knopfLink: `${VEXFIT_BASIS}/suche.html`,
    fusszeile: "Vexfit.app · Salzburg · Österreich",
    impressumLink: `${VEXFIT_BASIS}/rechtliches.html`,
    impressumText: "Impressum",
    ...(abmeldeLink ? { abmeldeLink, abmeldeText: "Keine Benachrichtigung mehr" } : {}),
  });
}

/**
 * B4.1: /warteliste-bestaetigung (angemeldet). Nach dem Eintrag in die
 * Warteliste schickt der Kunden-Bereich best-effort hierher; wir lesen die
 * E-Mail NUR aus dem Token (niemand bestätigt fremde Adressen) und senden die
 * Bestätigung an den neuesten noch offenen Eintrag. Ohne Verdrahtung/Migration
 * still (keine Mail, kein Fehler).
 */
async function wartelisteBestaetigung(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = bearerToken(r);
  const nutzer = token ? await a.benutzerAusToken(token) : null;
  if (!nutzer) return antwort(401, { fehler: "Anmeldung erforderlich" }, herkunft);
  const email = w((nutzer as { email?: string }).email).toLowerCase();
  if (!email || !a.alertFuerBestaetigung) {
    return antwort(200, { ok: true, mails: 0, uebersprungen: "nicht verdrahtet" }, herkunft);
  }
  const body = (await koerperLesen(r)) || {};
  const plz = w(body.plz);
  let eintrag: WartelistenEintrag | null = null;
  try {
    eintrag = await a.alertFuerBestaetigung(email, plz);
  } catch (fehler) {
    if (istMigrationFehlt(fehler)) {
      a.melden?.("warteliste-bestaetigung: Spalte fehlt (Migration 2026-11-03-02 nicht eingespielt)");
      return antwort(200, { ok: true, mails: 0, uebersprungen: "migration fehlt" }, herkunft);
    }
    throw fehler;
  }
  if (!eintrag) return antwort(200, { ok: true, mails: 0 }, herkunft);
  const gesendet = await sendeWennAdresseTaugt(a, mailWartelisteBestaetigung(eintrag));
  return antwort(200, { ok: true, mails: gesendet ? 1 : 0 }, herkunft);
}

/**
 * B4.2: bei der Freigabe eines Trainers (trainer_aktivieren) alle noch offenen
 * Warteliste-Einträge in SEINER PLZ-Region (gleiche PLZ – Konzept Punkt 3b, weil
 * die Suche keinen festen km-Umkreis hat) genau einmal benachrichtigen und den
 * Eintrag danach schließen (nie doppelt; abgemeldete/geschlossene sind aktiv=
 * false und fallen hier raus). Der km-Umkreis bleibt der bestehenden
 * trainer-alert-Funktion (Cron) überlassen. Best effort.
 */
async function wartelisteAufFreigabe(
  a: Anschluesse,
  trainerId: string,
): Promise<{ mails: number }> {
  if (!a.trainerPlzNachId || !a.alertsOffeneFuerPlz || !a.alertSchliessen) return { mails: 0 };
  let plz: string | null = null;
  try { plz = await a.trainerPlzNachId(trainerId); } catch { return { mails: 0 }; }
  if (!w(plz)) return { mails: 0 };
  // Land eindeutig (07.11.2026): nur Vormerkungen im GLEICHEN Land benachrichtigen
  // (5020 in AT trifft nicht 5020 in CH). Fehlt das Land irgendwo, bleibt es wie
  // bisher vertraeglich. trainerLandNachId ist best effort (null -> kein Filter).
  let trainerLand: string | null = null;
  if (a.trainerLandNachId) {
    try { trainerLand = await a.trainerLandNachId(trainerId); } catch { trainerLand = null; }
  }
  let eintraege: WartelistenEintrag[] = [];
  try {
    eintraege = await a.alertsOffeneFuerPlz(w(plz));
  } catch (fehler) {
    if (istMigrationFehlt(fehler)) {
      a.melden?.("warteliste: Spalte fehlt (Migration 2026-11-03-02 nicht eingespielt)");
      return { mails: 0 };
    }
    throw fehler;
  }
  eintraege = eintraege.filter((e) => landVertraeglich(trainerLand, e.land));
  let mails = 0;
  for (const e of eintraege) {
    // Erst ATOMAR beanspruchen (aktiv true->false): nur wer den Eintrag bekommt,
    // sendet. So nie doppelt – auch nicht bei paralleler Freigabe derselben PLZ.
    // Schlägt das Beanspruchen fehl, wird NICHT gesendet (der Eintrag bleibt für
    // einen späteren Lauf offen statt eine doppelte Mail zu riskieren).
    let beansprucht = false;
    try { beansprucht = await a.alertSchliessen(e.id); } catch { continue; }
    if (!beansprucht) continue;
    if (await sendeWennAdresseTaugt(a, mailTrainerDa(e))) mails++;
  }
  return { mails };
}

/**
 * B4.1: /warteliste-abmelden?token= (GET, ohne Login). Setzt den Eintrag auf
 * aktiv=false und zeigt eine kurze Seite. Unbekanntes Token: freundlicher
 * Hinweis, kein Fehler, keine Preisgabe.
 */
async function wartelisteAbmeldenEndpunkt(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const token = new URL(r.url).searchParams.get("token") || "";
  if (token && a.alertAbmelden) {
    try { await a.alertAbmelden(token); } catch (fehler) { a.melden?.("warteliste-abmelden fehlgeschlagen", String(fehler)); }
  }
  const seite = `<!doctype html><html lang="de"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Vexfit.app</title><style>body{margin:0;background:#0a0a0a;color:#f5f5f0;` +
    `font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}` +
    `.k{max-width:420px;text-align:center}h1{color:#e8ff00;font-size:22px}a{color:#e8ff00}</style></head>` +
    `<body><div class="k"><h1>Erledigt</h1><p>Du bekommst keine Benachrichtigung mehr, wenn Trainer in deiner Region starten. ` +
    `Du kannst jederzeit wieder auf <a href="${VEXFIT_BASIS}/suche.html">Vexfit.app</a> nach Trainern suchen.</p></div></body></html>`;
  return new Response(seite, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...(herkunft ? { "Access-Control-Allow-Origin": herkunft } : {}) },
  });
}

// ============================================================================
// B7: Abendbericht um 16:00 (Wiener Zeit)
// ============================================================================

/** B7: aktuelle Stunde (0–23) in Wiener Zeit (Europe/Vienna). Zwei UTC-Zeitpläne
 *  (14:00 und 15:00 UTC) rufen den Bericht; nur der, der auf 16 Uhr Wien fällt,
 *  sendet – so ganzjährig genau einmal, egal ob Sommer- oder Winterzeit. */
export function wienerStunde(datum: Date = new Date()): number {
  try {
    const s = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna", hour: "2-digit", hour12: false,
    }).format(datum);
    const n = parseInt(s, 10);
    if (Number.isNaN(n)) return -1;
    return n === 24 ? 0 : n;
  } catch {
    return -1;
  }
}

/** B7: ein einzelner Zählwert, der nicht geladen werden konnte (Feld + Grund,
 *  z. B. "HTTP 404"). So bricht kein Fehlwert den ganzen Bericht ab. */
export interface AbendberichtFehler {
  feld: string;
  grund: string;
}

/** K1: Kunden-Trichter-Summen über 24 h (die sechs anonymen Kunden-Stufen). */
export interface KundeTrichter24h {
  seite: number;
  suche: number;
  treffer: number;
  profil: number;
  anfrage_start: number;
  anfrage: number;
}
export function leererKundenTrichter(): KundeTrichter24h {
  return { seite: 0, suche: 0, treffer: 0, profil: 0, anfrage_start: 0, anfrage: 0 };
}

/** B8: Trichter einer Herkunft über 24 h (die fünf anonymen Stufen). */
export interface TrichterQuelle {
  quelle: string;
  seite: number;
  formular: number;
  abgesendet: number;
  bestaetigt: number;
  profil5: number;
}

export interface AbendberichtZahlen {
  neueTrainer: number;
  neueTrainerHerkunft: { quelle: string; anzahl: number }[];
  neueKunden: number;
  wartenNamen: string[];
  anfragenOffen: number;
  warteliste: number;
  bezahlt: number;
  zahlungFehlgeschlagen: number;
  gekuendigt: number;
  /** K1: Kunden-Trichter der letzten 24 h (anonym, Summen je Stufe). */
  kundenTrichter24h: KundeTrichter24h;
  /** K8: kurze Stadt-Übersicht Salzburg (PLZ 50xx). null = nicht geladen. */
  salzburg: { trainerFrei: number; suchen7: number; vorm: number } | null;
  /** B8: Trichter der letzten 24 h nach Herkunft (anonym, aus trichter_ereignisse). */
  trichter24h: TrichterQuelle[];
  /** B8: freigegebene bzw. in Prüfung befindliche Trainer mit < 5/8 Angaben,
   *  ohne als Test/Spam markierte Konten. */
  profileUnter5: number;
  /** Zählwerte, die nicht geladen werden konnten (leer = alles ok). */
  fehler: AbendberichtFehler[];
  /** Fehlgeschlagene/teilweise Cron-Läufe der letzten 24 h aus admin_protokoll
   *  (erinnerungen/unbeantwortet/abendbericht) – erscheinen unter „Technische
   *  Hinweise". Leer = kein Cron-Lauf meldete einen Fehler. */
  cronHinweise: { aktion: string; ergebnis: string }[];
}

/** B7: kurzer Grund aus einem Fehler (bevorzugt "HTTP <code>", sonst gekürzt). */
export function abendberichtGrund(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  const t = m.match(/HTTP \d{3}/);
  return t ? t[0] : (m.length > 120 ? m.slice(0, 120) : m);
}

/**
 * Cron-Routen (erinnerungen/unbeantwortet): Protokolltext aus den Zählern eines
 * Laufs. Alle Elemente ok → „erfolgreich: …", sonst „teilweise (x von y
 * fehlgeschlagen: Gründe)". Der Bulk-Load-Ausfall wird vom Aufrufer gesondert
 * als „fehlgeschlagen (Grund)" protokolliert.
 */
export function cronLaufErgebnis(behandelt: number, fehler: string[], erfolgText: string): string {
  if (!fehler.length) return `erfolgreich: ${erfolgText}`;
  return `teilweise (${fehler.length} von ${behandelt} fehlgeschlagen: ${fehler.join("; ")})`;
}

/** Zeigt ein admin_protokoll-Ergebnis einen fehlgeschlagenen/teilweisen Lauf an? */
export function istFehlerErgebnis(ergebnis: string | null | undefined): boolean {
  return /^(teilweise|fehlgeschlagen|Fehler)\b/.test(String(ergebnis ?? ""));
}

/** B7: leere Zahlen (Grundwert bzw. Rückfall, wenn nichts geladen werden kann). */
export function leereAbendberichtZahlen(): AbendberichtZahlen {
  return {
    neueTrainer: 0, neueTrainerHerkunft: [], neueKunden: 0, wartenNamen: [],
    anfragenOffen: 0, warteliste: 0, bezahlt: 0, zahlungFehlgeschlagen: 0, gekuendigt: 0,
    trichter24h: [], profileUnter5: 0, kundenTrichter24h: leererKundenTrichter(),
    salzburg: null,
    fehler: [], cronHinweise: [],
  };
}

/** B8: Summe aller Trichter-Ereignisse (24 h) über alle Herkünfte/Stufen. */
export function trichterSumme(t: TrichterQuelle[]): number {
  return (t || []).reduce((n, q) => n + q.seite + q.formular + q.abgesendet + q.bestaetigt + q.profil5, 0);
}

/** B7: nichts Nennenswertes passiert? Nur wenn alle Werte 0 sind UND kein
 *  Zählwert fehlte UND kein Cron-Lauf (24 h) einen Fehler meldete. */
export function abendberichtLeer(z: AbendberichtZahlen): boolean {
  return z.fehler.length === 0 && z.cronHinweise.length === 0 &&
    z.neueTrainer === 0 && z.neueKunden === 0 && z.wartenNamen.length === 0 &&
    z.anfragenOffen === 0 && z.warteliste === 0 &&
    (z.bezahlt + z.zahlungFehlgeschlagen + z.gekuendigt) === 0 &&
    trichterSumme(z.trichter24h) === 0 && z.profileUnter5 === 0 &&
    kundenTrichterSumme(z.kundenTrichter24h) === 0;
}

function abendberichtZeilen(z: AbendberichtZahlen): { beschriftung: string; wert: string }[] {
  const herk = z.neueTrainerHerkunft.length
    ? z.neueTrainerHerkunft.map((h) => `${h.quelle}: ${h.anzahl}`).join(", ")
    : "–";
  // Konnte ein Feld nicht geladen werden, steht an seiner Stelle „nicht
  // verfügbar (Fehler: …)" statt einer irreführenden 0.
  const zeile = (beschriftung: string, wert: string) => {
    const f = z.fehler.find((x) => x.feld === beschriftung);
    return { beschriftung, wert: f ? `nicht verfügbar (Fehler: ${f.grund})` : wert };
  };
  const basis = [
    zeile("Neue Trainer (24 h)", `${z.neueTrainer}${z.neueTrainer ? ` (${herk})` : ""}`),
    zeile("Neue Kunden (24 h)", String(z.neueKunden)),
    zeile("Warten auf Freigabe", z.wartenNamen.length ? `${z.wartenNamen.length} (${z.wartenNamen.join(", ")})` : "0"),
    zeile("Anfragen ohne Antwort > 24 h", String(z.anfragenOffen)),
    zeile("Wartelisten-Einträge ohne Trainer", String(z.warteliste)),
    zeile("Zahlungen (24 h)", `bezahlt ${z.bezahlt}, fehlgeschlagen ${z.zahlungFehlgeschlagen}, gekündigt ${z.gekuendigt}`),
    // B8: Profile mit < 5/8 Angaben (ohne Test-/Spam-Konten).
    zeile("Trainerprofile < 5/8 Angaben", String(z.profileUnter5)),
  ];
  // B8: Trichter der letzten 24 h nach Herkunft (anonym). Eine Zeile je
  // Herkunft mit den fünf Stufen; fehlt die Tabelle, steht „nicht verfügbar".
  const trichterFehler = z.fehler.find((x) => x.feld === "Trichter (24 h)");
  if (trichterFehler) {
    basis.push({ beschriftung: "Trichter (24 h)", wert: `nicht verfügbar (Fehler: ${trichterFehler.grund})` });
  } else if (z.trichter24h.length) {
    basis.push({ beschriftung: "— Trainer-Trichter (24 h) nach Herkunft —", wert: "Seite → Formular → Abgeschickt → Bestätigt → Profil≥5" });
    for (const q of z.trichter24h) {
      basis.push({ beschriftung: q.quelle, wert: `${q.seite} · ${q.formular} · ${q.abgesendet} · ${q.bestaetigt} · ${q.profil5}` });
    }
  }
  // K1: Kunden-Trichter der letzten 24 h (Summen je Stufe). Nur wenn es dort
  // überhaupt Ereignisse gab – sonst spart es eine Null-Zeile.
  const k = z.kundenTrichter24h;
  if (!trichterFehler && kundenTrichterSumme(k) > 0) {
    basis.push({ beschriftung: "— Kunden-Trichter (24 h) —", wert: "Seite → Suche → Treffer → Profil → Anfrage begonnen → abgeschickt" });
    basis.push({ beschriftung: "Kunden", wert: `${k.seite} · ${k.suche} · ${k.treffer} · ${k.profil} · ${k.anfrage_start} · ${k.anfrage}` });
  }
  // K8: kurze Stadt-Übersicht Salzburg.
  if (z.salzburg) {
    basis.push({ beschriftung: "Salzburg (50xx)", wert: `${z.salzburg.trainerFrei} freigegebene Trainer · ${z.salzburg.suchen7} Suchen (7 T) · ${z.salzburg.vorm} Vormerkungen` });
  }
  return basis;
}

/** K1: Summe aller Kunden-Trichter-Ereignisse (24 h). */
export function kundenTrichterSumme(k: KundeTrichter24h): number {
  return k.seite + k.suche + k.treffer + k.profil + k.anfrage_start + k.anfrage;
}

/** B7: Abschnitt „Technische Hinweise" – nur wenn Zählwerte fehlten ODER ein
 *  Cron-Lauf der letzten 24 h einen Fehler meldete. */
function abendberichtHinweisZeilen(z: AbendberichtZahlen): { beschriftung: string; wert: string }[] {
  if (!z.fehler.length && !z.cronHinweise.length) return [];
  const zeilen: { beschriftung: string; wert: string }[] = [
    { beschriftung: "— Technische Hinweise —", wert: `${z.fehler.length} Wert(e) nicht geladen, ${z.cronHinweise.length} Cron-Fehler (24 h):` },
    ...z.fehler.map((f) => ({ beschriftung: f.feld, wert: f.grund })),
  ];
  if (z.cronHinweise.length) {
    zeilen.push({ beschriftung: "Cron-Läufe mit Fehler (24 h)", wert: String(z.cronHinweise.length) });
    for (const h of z.cronHinweise) zeilen.push({ beschriftung: h.aktion, wert: h.ergebnis });
  }
  return zeilen;
}

/** B7: der ausführliche Abendbericht an office@ (Mail = alles). Fehlende
 *  Zählwerte stehen als „nicht verfügbar" drin und werden unten unter
 *  „Technische Hinweise" gesammelt – der Bericht geht trotzdem raus. */
export function mailAbendbericht(z: AbendberichtZahlen): Mail {
  const leer = abendberichtLeer(z);
  const absatz = leer
    ? "Heute nichts Neues."
    : (z.fehler.length
      ? "Die Zahlen des Tages (einige Werte waren nicht abrufbar – siehe Technische Hinweise):"
      : "Die Zahlen des Tages:");
  return baueMail(BETREIBER, "Vexfit – Abendbericht", {
    ueberschrift: "Abendbericht",
    absatz,
    datenZeilen: leer ? [] : [...abendberichtZeilen(z), ...abendberichtHinweisZeilen(z)],
    knopfText: "Im Admin öffnen",
    knopfLink: verwaltungLink(),
    grundZeile: "Interne Benachrichtigung.",
  });
}

/** B7: Admin-Push = Kurzfassung in einer Zeile. */
export function pushAbendbericht(z: AbendberichtZahlen): PushNachricht {
  if (abendberichtLeer(z)) {
    return { titel: "Vexfit – Abendbericht", text: "Heute nichts Neues.", url: verwaltungLink() };
  }
  const warn = z.fehler.length ? ` · ⚠️ ${z.fehler.length} Wert(e) fehlen` : "";
  return {
    titel: "Vexfit – Abendbericht",
    text: `${z.neueTrainer} Trainer · ${z.neueKunden} Kunden · ${z.wartenNamen.length} warten · ${z.anfragenOffen} offen${warn}`,
    url: verwaltungLink(),
  };
}

/**
 * B7: alle Zählwerte für den Abendbericht – jeder EINZELN abgesichert. `lesenFn`
 * und `zaehlenFn` werden injiziert (in Produktion die REST-Helfer aus index.ts,
 * im Test Attrappen), damit diese Logik ohne Netz prüfbar ist. Schlägt ein
 * Zählwert fehl, wird er in `fehler` vermerkt (Feld + kurzer Grund) und der Rest
 * trotzdem geliefert – nie ein Abbruch wegen einer einzelnen Zahl.
 */
export async function abendberichtZahlenHolen(
  lesenFn: <T>(pfad: string) => Promise<T[]>,
  zaehlenFn: (pfad: string) => Promise<number>,
  jetztMs: number = Date.now(),
  protokollFehlerFn?: (seitISO: string) => Promise<{ aktion: string; ergebnis: string }[]>,
): Promise<AbendberichtZahlen> {
  const seit = new Date(jetztMs - 24 * 60 * 60 * 1000).toISOString();
  const z = leereAbendberichtZahlen();
  const merkeFehler = (feld: string, e: unknown) => z.fehler.push({ feld, grund: abendberichtGrund(e) });

  // Neue Trainer (24 h) + Herkunft (innerer Rückfall ohne herkunft-Spalte ist
  // kein Fehler; erst wenn auch das Zählen scheitert, wird es vermerkt).
  try {
    let zeilen: { herkunft?: string | null }[];
    try {
      zeilen = await lesenFn<{ herkunft?: string | null }>(`trainers?created_at=gt.${encodeURIComponent(seit)}&select=herkunft`);
    } catch {
      zeilen = await lesenFn<{ herkunft?: string | null }>(`trainers?created_at=gt.${encodeURIComponent(seit)}&select=id`);
    }
    z.neueTrainer = zeilen.length;
    const proQuelle: Record<string, number> = {};
    for (const t of zeilen) {
      const q = (t.herkunft != null && String(t.herkunft).trim()) ? String(t.herkunft).trim() : "direkt/unbekannt";
      proQuelle[q] = (proQuelle[q] || 0) + 1;
    }
    z.neueTrainerHerkunft = Object.keys(proQuelle).sort().map((q) => ({ quelle: q, anzahl: proQuelle[q] }));
  } catch (e) { merkeFehler("Neue Trainer (24 h)", e); }

  // Neue Kunden (24 h).
  try {
    z.neueKunden = await zaehlenFn(`kunden?created_at=gt.${encodeURIComponent(seit)}&select=id`);
  } catch (e) { merkeFehler("Neue Kunden (24 h)", e); }

  // Warten auf Freigabe (mit Namen).
  try {
    let zeilen: { vorname?: string | null; nachname?: string | null }[];
    try {
      zeilen = await lesenFn<{ vorname?: string | null; nachname?: string | null }>(`trainers?aktiv=eq.false&gesperrt=eq.false&select=vorname,nachname&order=created_at.desc&limit=100`);
    } catch {
      zeilen = await lesenFn<{ vorname?: string | null; nachname?: string | null }>(`trainers?aktiv=eq.false&select=vorname,nachname&order=created_at.desc&limit=100`);
    }
    z.wartenNamen = zeilen.map((t) => `${t.vorname ?? ""} ${t.nachname ?? ""}`.trim()).filter(Boolean);
  } catch (e) { merkeFehler("Warten auf Freigabe", e); }

  // Anfragen ohne Antwort > 24 h.
  try {
    z.anfragenOffen = await zaehlenFn(`anfragen?beantwortet_am=is.null&created_at=lt.${encodeURIComponent(seit)}&or=(status.is.null,status.not.in.(angenommen,abgelehnt))&select=id`);
  } catch (e) { merkeFehler("Anfragen ohne Antwort > 24 h", e); }

  // Wartelisten-Einträge ohne Trainer (offene „Benachrichtige mich").
  try {
    z.warteliste = await zaehlenFn(`trainer_alerts?aktiv=eq.true&select=id`);
  } catch (e) { merkeFehler("Wartelisten-Einträge ohne Trainer", e); }

  // Zahlungsereignisse (24 h) aus B5.
  try {
    const zeilen = await lesenFn<{ abo_status?: string | null }>(`trainers?abo_status_am=gt.${encodeURIComponent(seit)}&select=abo_status`);
    for (const t of zeilen) {
      if (t.abo_status === "aktiv") z.bezahlt++;
      else if (t.abo_status === "zahlung_fehlgeschlagen") z.zahlungFehlgeschlagen++;
      else if (t.abo_status === "gekuendigt") z.gekuendigt++;
    }
  } catch (e) { merkeFehler("Zahlungen (24 h)", e); }

  // Fehlgeschlagene/teilweise Cron-Läufe der letzten 24 h (aus admin_protokoll).
  if (protokollFehlerFn) {
    try {
      const zeilen = await protokollFehlerFn(seit);
      z.cronHinweise = zeilen.filter((h) => istFehlerErgebnis(h.ergebnis))
        .map((h) => ({ aktion: h.aktion, ergebnis: h.ergebnis }));
    } catch (e) { merkeFehler("Cron-Läufe (24 h)", e); }
  }

  // B8: Trichter der letzten 24 h nach Herkunft (anonym, aus trichter_ereignisse).
  // Fehlt die Tabelle (Migration 2026-11-06-01 nicht eingespielt), wird es als
  // „nicht verfügbar" vermerkt – der Bericht geht trotzdem raus.
  try {
    const ev = await lesenFn<{ stufe: string; quelle?: string | null; rolle?: string | null }>(
      `trichter_ereignisse?erstellt_am=gt.${encodeURIComponent(seit)}&select=stufe,quelle,rolle&limit=5000`,
    );
    const map: Record<string, TrichterQuelle> = {};
    const k = leererKundenTrichter();
    for (const e of ev) {
      if (e.rolle === "kunde") {
        // K1: Kunden-Trichter (Summen je Stufe).
        if (e.stufe === "seite") k.seite++;
        else if (e.stufe === "suche") k.suche++;
        else if (e.stufe === "treffer") k.treffer++;
        else if (e.stufe === "profil") k.profil++;
        else if (e.stufe === "anfrage_start") k.anfrage_start++;
        else if (e.stufe === "anfrage") k.anfrage++;
        continue;
      }
      const q = (e.quelle != null && String(e.quelle).trim()) ? String(e.quelle).trim() : "direkt/unbekannt";
      const o = map[q] || (map[q] = { quelle: q, seite: 0, formular: 0, abgesendet: 0, bestaetigt: 0, profil5: 0 });
      if (e.stufe === "seite") o.seite++;
      else if (e.stufe === "formular") o.formular++;
      else if (e.stufe === "abgesendet") o.abgesendet++;
      else if (e.stufe === "bestaetigt") o.bestaetigt++;
      else if (e.stufe === "profil5") o.profil5++;
    }
    z.trichter24h = Object.keys(map).sort().map((q) => map[q]);
    z.kundenTrichter24h = k;
  } catch (e) { merkeFehler("Trichter (24 h)", e); }

  // B8: Trainerprofile mit < 5/8 Angaben, ohne als Test/Spam markierte Konten.
  // Rückfall ohne ist_test-Spalte (Migration 2026-11-06-02 nicht eingespielt).
  try {
    const felder = "avatar_url,trainingsart,trainingsort,preis_stunde,bio,erfahrung,spezialisierungen,telefon";
    let zeilen: TrainerProfil[];
    try {
      zeilen = await lesenFn<TrainerProfil>(`trainers?ist_test=not.is.true&select=${felder},ist_test&limit=2000`);
    } catch {
      zeilen = await lesenFn<TrainerProfil>(`trainers?select=${felder}&limit=2000`);
    }
    z.profileUnter5 = zeilen.filter((t) => t.ist_test !== true && (8 - freischaltFehlendeFelder(t).length) < 5).length;
  } catch (e) { merkeFehler("Trainerprofile < 5/8 Angaben", e); }

  // K8: kurze Stadt-Übersicht Salzburg (PLZ 50xx): freigegebene Trainer (ohne
  // Test), Kundensuchen der letzten 7 Tage, Vormerkungen. Best effort – fehlt
  // eine Tabelle/Spalte, bleibt salzburg einfach null (keine Zeile, kein Fehler).
  try {
    const seit7 = new Date(jetztMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const trainer = await lesenFn<{ ist_test?: boolean | null }>(
      `trainers?plz=like.50*&aktiv=eq.true&gesperrt=not.is.true&select=id,ist_test`,
    ).catch(() => lesenFn<{ ist_test?: boolean | null }>(`trainers?plz=like.50*&aktiv=eq.true&select=id`));
    const trainerFrei = trainer.filter((t) => t.ist_test !== true).length;
    let suchen7 = 0, vorm = 0;
    try { suchen7 = (await lesenFn<unknown>(`such_eingaben?plz=like.50*&erstellt_am=gte.${seit7}&select=plz`)).length; } catch { /* Tabelle fehlt */ }
    try { vorm = (await lesenFn<unknown>(`warteliste?plz=like.50*&select=plz`)).length; } catch { /* Tabelle fehlt */ }
    z.salzburg = { trainerFrei, suchen7, vorm };
  } catch (e) { merkeFehler("Stadt-Übersicht Salzburg", e); }

  return z;
}

/** B7: die Zahlen als eine Zeile fürs Protokoll (ohne Personen-Klartext). */
function abendberichtKurz(z: AbendberichtZahlen): string {
  if (abendberichtLeer(z)) return "Heute nichts Neues";
  return `${z.neueTrainer} Trainer, ${z.neueKunden} Kunden, ${z.wartenNamen.length} warten, ` +
    `${z.anfragenOffen} offen, Warteliste ${z.warteliste}, ` +
    `Zahlungen ${z.bezahlt}/${z.zahlungFehlgeschlagen}/${z.gekuendigt}`;
}

/**
 * B7 Kern: Zahlen holen, Abendbericht an BETREIBER (office@) mailen + Admin-Push,
 * und den Lauf im admin_protokoll festhalten. Ergebnis ist „erfolgreich", wenn
 * alle Werte geladen wurden, „teilweise", wenn einzelne Zählwerte fehlten (der
 * Bericht geht trotzdem raus), und „Fehler", wenn der Versand selbst scheiterte.
 * Auch bei 0 Ereignissen geht die Mail hinaus („Heute nichts Neues").
 *
 * Wird vom Zeitplan (nach der 16-Uhr-Prüfung) und vom Admin-Test-Auslöser
 * (sofort) genutzt. `quelle` nur fürs Protokoll ("zeitplan" bzw. "admin").
 * Schlägt der Versand fehl, steht der Grund im Protokoll und der Fehler wird
 * weitergeworfen (Aufrufer antwortet mit 500) – nie still verschluckt. Das
 * Zahlen-Holen selbst ist zusätzlich abgesichert, damit es den Lauf nicht
 * abbricht, falls eine Attrappe/Implementierung doch wirft.
 */
async function abendberichtSenden(
  a: Anschluesse,
  quelle: string,
  adminId?: string,
): Promise<{ mail: boolean; zahlen: AbendberichtZahlen }> {
  let z: AbendberichtZahlen;
  try {
    z = a.abendberichtZahlen ? await a.abendberichtZahlen() : leereAbendberichtZahlen();
  } catch (e) {
    z = leereAbendberichtZahlen();
    z.fehler.push({ feld: "Alle Zahlen", grund: abendberichtGrund(e) });
  }
  let mailGesendet = false;
  let sendeFehler: string | null = null;
  try {
    mailGesendet = await sendeWennAdresseTaugt(a, mailAbendbericht(z));
    await pushBenachrichtigung(a, pushAbendbericht(z));
  } catch (f) {
    sendeFehler = abendberichtGrund(f);
  }
  const status = z.fehler.length ? "teilweise" : "erfolgreich";
  const fehlendTxt = z.fehler.length
    ? ` – fehlend: ${z.fehler.map((f) => `${f.feld} (${f.grund})`).join("; ")}`
    : "";
  await a.protokoll?.({
    ...(adminId ? { admin_id: adminId } : {}),
    aktion: "abendbericht",
    ergebnis: sendeFehler
      ? `Fehler (${quelle}): ${sendeFehler}`
      : `${status} (${quelle}): Mail an ${BETREIBER} ${mailGesendet ? "ok" : "nicht zugestellt"} – ${abendberichtKurz(z)}${fehlendTxt}`,
  });
  if (sendeFehler) throw new Error(sendeFehler);
  return { mail: mailGesendet, zahlen: z };
}

/**
 * B7: vom Zeitplan (pg_cron, 14:00 und 15:00 UTC) gerufen. Prüft den eigenen
 * Schlüssel (x-vexfit-cron / VEXFIT_CRON_KEY, wie die Erinnerungen), sendet aber
 * NUR, wenn es gerade 16 Uhr Wiener Zeit ist (so genau einmal pro Tag). Mail an
 * office@ (alles) + Admin-Push (Kurzfassung).
 *
 * Jeder Lauf, der sich korrekt ausgewiesen hat, hinterlässt eine Spur in
 * admin_protokoll: der sendende Aufruf über abendberichtSenden, der übersprungene
 * (nicht 16 Uhr) mit eigener Zeile – so ist im Admin erkennbar, dass der
 * Zeitplan überhaupt ausgelöst hat.
 */
async function abendberichtPruefen(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const geheim = a.cronGeheimnis?.();
  const mitgeschickt = r.headers.get("x-vexfit-cron");
  if (!geheim || !mitgeschickt || mitgeschickt !== geheim) {
    // Kein Protokoll vor der Prüfung: der Pfad ist öffentlich (ohne JWT), ein
    // Eintrag je unberechtigtem Aufruf wäre von außen flutbar.
    return antwort(401, { fehler: "nicht berechtigt" }, herkunft);
  }
  const jetzt = a.jetzt ? a.jetzt() : new Date();
  const stunde = wienerStunde(jetzt);
  if (stunde !== 16) {
    await a.protokoll?.({
      aktion: "abendbericht",
      ergebnis: `übersprungen (zeitplan): nicht 16 Uhr Wien (${stunde} Uhr) – kein Versand`,
    });
    return antwort(200, { ok: true, gesendet: false, uebersprungen: "nicht 16 Uhr Wien" }, herkunft);
  }
  try {
    const erg = await abendberichtSenden(a, "zeitplan");
    return antwort(200, { ok: true, gesendet: true, mail: erg.mail, zahlen: erg.zahlen }, herkunft);
  } catch (fehler) {
    return antwort(500, {
      fehler: "Abendbericht konnte nicht gesendet werden.",
      grund: String((fehler as { message?: string })?.message ?? fehler),
    }, herkunft);
  }
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

  if (!a.anfrageNachId || !a.trainerVollNachId || !a.aktiveTrainerFuerAlternativen) {
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

  const kandidaten = await a.aktiveTrainerFuerAlternativen();
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
 * B4e, 48-Stunden-Fall: der zeitgesteuerte Gegenpart zu "Passt nicht?".
 *
 * Findet offene Anfragen, die der Trainer seit mehr als 48 Stunden nicht
 * beantwortet hat, und schickt dem Kunden dieselben zwei Vorschlaege. Je
 * Anfrage nur einmal (alternativen_gesendet wird immer gesetzt, auch wenn keine
 * Alternative gefunden wurde - sonst liefe der Fall jede Stunde neu an).
 *
 * Kein Browser, kein Trainer-Token: der Zeitplan (pg_cron) ruft den Pfad auf
 * und weist sich mit dem Kopf x-vexfit-cron aus - demselben Wert wie das
 * Function-Secret VEXFIT_CRON_KEY. Stimmt er nicht, kommt 401, so kann ihn
 * niemand von aussen ausloesen. Ohne gesetztes Geheimnis bleibt der Pfad zu.
 */
async function unbeantwortetePruefen(
  r: Request,
  a: Anschluesse,
  herkunft: string | null,
): Promise<Response> {
  const geheim = a.cronGeheimnis?.();
  const mitgeschickt = r.headers.get("x-vexfit-cron");
  if (!geheim || !mitgeschickt || mitgeschickt !== geheim) {
    return antwort(401, { fehler: "nicht berechtigt" }, herkunft);
  }

  if (
    !a.offeneAnfragenVor || !a.trainerVollNachId || !a.aktiveTrainerFuerAlternativen
  ) {
    return antwort(
      200,
      { ok: true, geprueft: 0, mails: 0, uebersprungen: "nicht verdrahtet" },
      herkunft,
    );
  }

  const grenzeISO = new Date(
    Date.now() - ALTERNATIVEN_NACH_STUNDEN * 60 * 60 * 1000,
  ).toISOString();
  let faellig: Awaited<ReturnType<NonNullable<Anschluesse["offeneAnfragenVor"]>>>;
  let kandidaten: Awaited<ReturnType<NonNullable<Anschluesse["aktiveTrainerFuerAlternativen"]>>>;
  try {
    faellig = await a.offeneAnfragenVor(grenzeISO);
    if (!faellig.length) {
      return antwort(200, { ok: true, geprueft: 0, mails: 0 }, herkunft);
    }
    // Kandidaten nur einmal laden, nicht je Anfrage.
    kandidaten = await a.aktiveTrainerFuerAlternativen();
  } catch (fehler) {
    // Bulk-Load gescheitert: ganzen Lauf als fehlgeschlagen protokollieren, aber
    // sauber (HTTP 200) antworten.
    const grund = abendberichtGrund(fehler);
    a.melden?.("unbeantwortet: Laden fehlgeschlagen", grund);
    await a.protokoll?.({ aktion: "unbeantwortet", ergebnis: `fehlgeschlagen (${grund})` });
    return antwort(200, { ok: true, geprueft: 0, mails: 0, fehlgeschlagen: grund }, herkunft);
  }

  let mails = 0;
  let behandelt = 0;
  const fehlerListe: string[] = [];
  for (const anfrage of faellig) {
    // Doppelte Sicherheit gegen einen falsch gefuellten Port.
    if (anfrage.alternativen_gesendet === true) continue;
    behandelt++;
    const kurz = String(anfrage.id).slice(0, 8);
    try {
      // Zuerst vermerken (beanspruchen), DANN senden: so wird eine Anfrage nie
      // doppelt angeschrieben, auch wenn der Versand danach scheitert (sie bleibt
      // dann unbeantwortet, wird aber nicht erneut angestoßen).
      if (a.alternativenVermerken) await a.alternativenVermerken(String(anfrage.id));
      const original = await a.trainerVollNachId(String(anfrage.trainer_id ?? ""));
      const kundenEmail = String(anfrage.kunden_email ?? "");
      const alternativen = original ? alternativenFinden(original, kandidaten) : [];
      if (original && alternativen.length && adresseGueltig(kundenEmail)) {
        if (await sendeWennAdresseTaugt(a, mailAlternativen(kundenEmail, anfrage.kunden_name, alternativen))) {
          mails++;
        }
      }
    } catch (fehler) {
      // Dieses Element scheitert, die übrigen werden weiter verarbeitet.
      fehlerListe.push(`${kurz}: ${abendberichtGrund(fehler)}`);
    }
  }
  // Protokoll nur, wenn etwas passiert ist oder ein Fehler auftrat.
  if (behandelt > 0 || fehlerListe.length > 0) {
    await a.protokoll?.({
      aktion: "unbeantwortet",
      ergebnis: cronLaufErgebnis(behandelt, fehlerListe, `${mails} Mail(s), ${behandelt} Anfrage(n) bearbeitet`),
    });
  }
  return antwort(
    200,
    { ok: true, geprueft: faellig.length, bearbeitet: behandelt, mails, fehler: fehlerListe.length },
    herkunft,
  );
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
/** B5: Abo-Felder best effort setzen; fehlt die Migration 2026-11-03-03, still
 *  überspringen (die Zahlung ist dann über stripe_bezahlt/aktiv schon verbucht). */
async function aboFelderSetzen(
  a: Anschluesse,
  trainerId: string,
  felder: Record<string, unknown>,
): Promise<void> {
  try {
    await a.adminTrainerSetzen(trainerId, felder);
  } catch (fehler) {
    if (istMigrationFehlt(fehler)) {
      a.melden?.("abo-status: Spalten fehlen (Migration 2026-11-03-03 nicht eingespielt)");
      return;
    }
    a.melden?.("abo-status setzen fehlgeschlagen", String(fehler));
  }
}

async function stripe(r: Request, a: Anschluesse): Promise<Response> {
  const rumpf = await r.text();
  const ereignis = await a.stripeEreignis(
    rumpf,
    r.headers.get("stripe-signature"),
  );
  if (!ereignis) return antwort(400, { fehler: "Signatur nicht gueltig" });

  const handhabbar = ereignis.type === STRIPE_EREIGNIS ||
    ereignis.type === STRIPE_INVOICE_PAID ||
    ereignis.type === STRIPE_INVOICE_FAILED ||
    ereignis.type === STRIPE_SUB_DELETED;
  if (!handhabbar) {
    return antwort(200, { ok: true, uebersprungen: "anderer Ereignistyp" });
  }
  // B5: die bestehende Entdopplung gilt jetzt für ALLE verarbeiteten Ereignisse.
  if (await a.ereignisSchonVerarbeitet(ereignis.id)) {
    return antwort(200, { ok: true, uebersprungen: "schon verarbeitet" });
  }

  const sitzung = ereignis.data?.object ?? {};
  const refId = String(sitzung.client_reference_id ?? "");
  const custId = String(sitzung.customer ?? "");
  // Bei checkout: customer_details.email; bei invoice.*: customer_email.
  const zahlerEmail = String(sitzung.customer_details?.email ?? sitzung.customer_email ?? "");

  // Zuordnung wie bisher: client_reference_id, sonst Stripe-Kunden-ID, sonst
  // E-Mail (ilike in der Function).
  let trainer: Trainer | null = null;
  if (refId) trainer = await a.trainerNachId(refId);
  if (!trainer && custId && a.trainerNachStripeCustomer) {
    try { trainer = await a.trainerNachStripeCustomer(custId); } catch { /* Rückfall E-Mail */ }
  }
  if (!trainer && zahlerEmail) trainer = await a.trainerNachEmail(zahlerEmail);

  // ── Erstzahlung (checkout.session.completed): unveränderter Ablauf ──
  if (ereignis.type === STRIPE_EREIGNIS) {
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
    const zielEmail = zahlerEmail || w(trainer.email);
    // E1: die Zahlung wird in jedem Fall verbucht.
    await a.trainerBezahltMarkieren(zielEmail);
    // B5: Stripe-Kunden-ID merken (für spätere Rechnungen) + Abo-Status aktiv.
    await aboFelderSetzen(a, trainer.id, {
      abo_status: "aktiv",
      abo_status_am: new Date().toISOString(),
      ...(custId ? { stripe_customer_id: custId } : {}),
    });
    // E2: genau die aelteste offene Anfrage (die Function laesst abgelehnte aus).
    const anfrage = await a.aeltesteOffeneAnfrage(trainer.id);
    let mails = 0;
    if (anfrage) {
      if (await sendeWennAdresseTaugt(a, mailKundenDaten(trainer, anfrage, zielEmail))) mails++;
      await a.anfrageWeitergeleitetMarkieren(anfrage.id);
    } else {
      a.melden?.("Zahlung ohne offene Anfrage — verbucht, aber nichts weitergeleitet");
    }
    if (await sendeWennAdresseTaugt(a, mailZahlungAnJakob(trainer, zielEmail, sitzung.amount_total, Boolean(anfrage)))) mails++;
    await a.ereignisVermerken(ereignis.id, ereignis.type);
    return antwort(200, {
      ok: true,
      mails,
      trainer_markiert: true,
      anfrage_weitergeleitet: Boolean(anfrage),
    });
  }

  // ── Abo-Lebenszyklus (invoice.paid / invoice.payment_failed / subscription.deleted) ──
  if (!trainer) {
    // Nicht vermerken (Stripe stellt erneut zu). Kein Nutzerfehler.
    a.melden?.(`kein Trainer zu Stripe-Ereignis ${ereignis.type} (${custId || zahlerEmail || "ohne Kennung"})`);
    return antwort(200, { ok: true, uebersprungen: "kein Trainer" });
  }
  const jetzt = new Date().toISOString();
  let mails = 0;
  let gesperrt = false;
  if (ereignis.type === STRIPE_INVOICE_PAID) {
    // Zahlung protokolliert; Trainer bleibt aktiv.
    await aboFelderSetzen(a, trainer.id, {
      abo_status: "aktiv",
      abo_status_am: jetzt,
      ...(custId ? { stripe_customer_id: custId } : {}),
    });
  } else if (ereignis.type === STRIPE_INVOICE_FAILED) {
    await aboFelderSetzen(a, trainer.id, { abo_status: "zahlung_fehlgeschlagen", abo_status_am: jetzt });
    if (await sendeWennAdresseTaugt(a, mailAboEreignis(trainer, "zahlung_fehlgeschlagen"))) mails++;
    await pushBenachrichtigung(a, pushAboEreignis(trainer, "zahlung_fehlgeschlagen"));
    // Bewusst NICHT sperren.
  } else { // STRIPE_SUB_DELETED
    // Sperren: keine neuen Anfragen, nicht mehr in der Suche. Bezahlte
    // Kundenkontakte bleiben für ihn sichtbar (eigene anfragen-Zeilen).
    await a.adminTrainerSetzen(trainer.id, { aktiv: false });
    gesperrt = true;
    await aboFelderSetzen(a, trainer.id, { abo_status: "gekuendigt", abo_status_am: jetzt });
    if (await sendeWennAdresseTaugt(a, mailAboEreignis(trainer, "gekuendigt"))) mails++;
    await pushBenachrichtigung(a, pushAboEreignis(trainer, "gekuendigt"));
  }
  await a.ereignisVermerken(ereignis.id, ereignis.type);
  return antwort(200, { ok: true, typ: ereignis.type, mails, gesperrt });
}
