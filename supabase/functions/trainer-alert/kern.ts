// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/trainer-alert/kern.ts
//
// Die Logik des Trainer-Alerts: auswaehlen, Texte bauen, Doppelversand
// verhindern. Kein Netz, keine Datenbank, kein SMTP — alles Aeussere kommt als
// Anschluesse (Ports) herein. Dadurch ohne Netz pruefbar (kern_test.ts).
//
// Inhalte sind 1:1 aus dem gesicherten n8n-Workflow "Vexfit Trainer Alert"
// (id HJ82CozuBrH4HFes, aktiv, Stand 2026-07-04) uebernommen: Spaltenlisten,
// Filter, Zuordnung ueber PLZ und Radius, Betreff, HTML-Mail, das Setzen von
// trainers.alert_sent.
//
// Keine Adressen, Nummern oder Schluessel als Festwerte — ausser dem Absender
// vexfit.info@gmail.com, der auf der Seite selbst schon oeffentlich steht
// (index.html, admin.html) und fuer die Pruefung des Mailwegs gebraucht wird.
//
// Zwei Dinge weichen bewusst vom Workflow ab, beide zur Absicherung vor dem
// ersten Einsatz: jeder Wert aus der Datenbank wird vor dem Einsetzen ins
// Mail-HTML maskiert (der Workflow setzte Freitexte roh ein), und ein Aufruf
// mit `?probelauf` rechnet alles durch, ohne zu versenden oder zu markieren.

// ============================================================================
// Spaltenlisten — genau die aus dem Workflow, Reihenfolge unveraendert
// ============================================================================

/** `select` des Nodes "Neue aktive Trainer holen". */
export const TRAINER_SPALTEN =
  "id,vorname,nachname,email,stadt,plz,trainingsart,preis_stunde,bio,spezialisierungen";

/** `select` des Nodes "Aktive Alerts holen". */
export const ALERT_SPALTEN = "id,kunden_email,kunden_name,plz,stadt,radius";

/** Absender des Nodes "Alert-Mail senden". */
export const ABSENDER = "vexfit.info@gmail.com";

/** Radius in km, wenn der Alert keinen hat — `a.radius || 25` im Workflow. */
export const RADIUS_STANDARD = 25;

/** Laender, in dieser Reihenfolge, fuer die PLZ-Auflösung (wie im Workflow). */
export const LAENDER = ["at", "de", "ch"] as const;

// ============================================================================
// Typen
// ============================================================================

export interface Trainer {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  stadt?: string | null;
  plz?: string | null;
  trainingsart?: string | null;
  preis_stunde?: number | string | null;
  bio?: string | null;
  spezialisierungen?: string[] | null;
}

export interface Alert {
  id: string;
  kunden_email: string;
  kunden_name?: string | null;
  plz?: string | null;
  stadt?: string | null;
  radius?: number | null;
}

export interface Koordinate {
  lat: number;
  lng: number;
}

/** Ein Versand: ein Trainer an eine Kundenadresse. Felder wie im Code-Node. */
export interface Alertmail {
  trainer_id: string;
  trainer_vorname: string;
  trainer_nachname: string;
  trainer_stadt: string;
  trainer_plz: string;
  trainer_trainingsart: string;
  trainer_preis: number | string;
  trainer_bio: string;
  trainer_spez: string;
  kunden_email: string;
  kunden_name: string;
}

/**
 * Eine Zeile fuer den Probelauf. Bewusst OHNE Adresse und OHNE Namen — der
 * Probelauf soll zeigen, wie viel hinausginge, nicht an wen.
 *
 * `entfernung_km` ist `null`, wenn der Treffer ueber die gleiche PLZ zustande
 * kam: dann rechnet der Ablauf keine Entfernung aus (so schon im Workflow).
 */
export interface Probe {
  trainer_id: string;
  alert_id: string;
  entfernung_km: number | null;
}

export interface Zuordnung {
  /** Alle Mails, in der Reihenfolge des Workflows (je Trainer, je Alert). */
  mails: Alertmail[];
  /** Zu jeder Mail die Kennungen und die Entfernung — fuer den Probelauf. */
  proben: Probe[];
  /** Trainer mit mindestens einer Mail. */
  mitEmpfaenger: string[];
  /** Trainer ohne Empfaenger — im Workflow die `_mark_only`-Zeilen. */
  ohneEmpfaenger: string[];
}

/** Alles Aeussere. Die Function setzt hier die echten Zugriffe ein. */
export interface Anschluesse {
  trainerLesen(): Promise<Trainer[]>;
  alertsLesen(): Promise<Alert[]>;
  koordinaten(plz: string): Promise<Koordinate | null>;
  mailSenden(mail: Alertmail): Promise<void>;
  alsVerarbeitetMarkieren(trainerId: string): Promise<void>;
  melden?(text: string, mehr?: unknown): void;
}

// ============================================================================
// Schluesselpruefung
// ============================================================================

/** Vergleich ohne Zeitunterschied, damit der Schluessel nicht erratbar wird. */
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}

/**
 * Prueft den Authorization-Kopf gegen den erwarteten Schluessel.
 * Nur `Bearer <schluessel>` wird angenommen. Fehlt der erwartete Schluessel in
 * der Umgebung, ist NICHTS gueltig — lieber 401 als eine offene Tuer.
 */
export function schluesselGueltig(
  kopf: string | null,
  erwartet: string | undefined,
): boolean {
  if (!erwartet) return false;
  if (!kopf) return false;
  const teile = kopf.trim().split(/\s+/);
  if (teile.length !== 2 || teile[0] !== "Bearer") return false;
  return gleich(teile[1], erwartet);
}

// ============================================================================
// Entfernung und Zuordnung
// ============================================================================

/** Haversine, Erdradius 6371 km — Rechenweg wie im Code-Node. */
export function entfernung(a: Koordinate, b: Koordinate): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Welche Postleitzahlen muessen aufgeloest werden? Nur die aus Paaren mit
 * UNGLEICHER PLZ — bei gleicher PLZ passt der Workflow ohne Koordinaten.
 */
export function benoetigtePlz(trainer: Trainer[], alerts: Alert[]): string[] {
  const raus = new Set<string>();
  for (const t of trainer) {
    for (const a of alerts) {
      if (!t.plz || !a.plz) continue;
      if (t.plz === a.plz) continue;
      raus.add(t.plz);
      raus.add(a.plz);
    }
  }
  return [...raus];
}

/**
 * Trainer und Alerts zuordnen: gleiche PLZ ODER Entfernung <= Radius des
 * Alerts. `koordinaten` ist der Zwischenspeicher aus `benoetigtePlz` —
 * fehlt ein Eintrag oder ist er null, kommt kein Treffer ueber die Entfernung
 * zustande (genau wie im Workflow, wenn zippopotam nichts liefert).
 */
export function zuordnen(
  trainer: Trainer[],
  alerts: Alert[],
  koordinaten: Map<string, Koordinate | null>,
): Zuordnung {
  const mails: Alertmail[] = [];
  const proben: Probe[] = [];
  const mitEmpfaenger: string[] = [];
  const ohneEmpfaenger: string[] = [];

  // Wie im Workflow: ohne Trainer ODER ohne Alerts passiert gar nichts —
  // auch kein Markieren. Die Trainer kommen im naechsten Lauf wieder dran.
  if (!trainer.length || !alerts.length) {
    return { mails, proben, mitEmpfaenger, ohneEmpfaenger };
  }

  for (const t of trainer) {
    const treffer: { alert: Alert; km: number | null }[] = [];
    for (const a of alerts) {
      if (!t.plz || !a.plz) continue;
      if (t.plz === a.plz) {
        treffer.push({ alert: a, km: null });
        continue;
      }
      const tk = koordinaten.get(t.plz) ?? null;
      const ak = koordinaten.get(a.plz) ?? null;
      if (!tk || !ak) continue;
      const km = entfernung(tk, ak);
      if (km <= (a.radius || RADIUS_STANDARD)) {
        treffer.push({ alert: a, km: Math.round(km * 10) / 10 });
      }
    }
    for (const { alert: a, km } of treffer) {
      proben.push({ trainer_id: t.id, alert_id: a.id, entfernung_km: km });
      mails.push({
        trainer_id: t.id,
        trainer_vorname: t.vorname || "",
        trainer_nachname: t.nachname || "",
        trainer_stadt: t.stadt || "",
        trainer_plz: t.plz || "",
        trainer_trainingsart: t.trainingsart || "",
        trainer_preis: t.preis_stunde || "",
        trainer_bio: (t.bio || "").substring(0, 200),
        trainer_spez: (t.spezialisierungen || []).slice(0, 3).join(" · "),
        kunden_email: a.kunden_email,
        kunden_name: a.kunden_name || "",
      });
    }
    // Der Workflow schickt fuer JEDEN Trainer eine `_mark_only`-Zeile; bei
    // Treffern kommt das Markieren zusaetzlich nach der Mail.
    if (treffer.length) mitEmpfaenger.push(t.id);
    else ohneEmpfaenger.push(t.id);
  }
  return { mails, proben, mitEmpfaenger, ohneEmpfaenger };
}

/** Der Node "Hat Empfänger?" — String nicht leer. */
export function hatEmpfaenger(mail: Pick<Alertmail, "kunden_email">): boolean {
  return typeof mail.kunden_email === "string" && mail.kunden_email !== "";
}

// ============================================================================
// Maskieren — alles, was aus der Datenbank kommt, geht nur maskiert ins HTML
// ============================================================================

// Maskieren, Betreff saeubern und die href-Pruefung stehen seit dem
// 26.09.2026 in ../_shared/text.ts — dieselbe Fassung benutzt auch
// vexfit-automation. Hier nur weitergereicht, damit alle bisherigen Aufrufer
// und Pruefungen unveraendert `from "./kern.ts"` importieren koennen.
import { betreffSaeubern, maskieren, sichereAdresse } from "../_shared/text.ts";
export { betreffSaeubern, maskieren, sichereAdresse };

/** Adresse der Profilseite eines Trainers — die einzige Adresse in der Mail. */
export function profilAdresse(trainerId: string): string | null {
  return sichereAdresse(
    `https://vexfit.app/profil.html?id=${
      encodeURIComponent(String(trainerId ?? ""))
    }`,
  );
}

// ============================================================================
// Betreff und HTML — Wortlaut und Auszeichnung 1:1 aus dem Workflow
// ============================================================================

export function mailBetreff(m: Alertmail): string {
  // Wortlaut unveraendert; nur Zeilenumbrueche aus dem Namen fallen heraus.
  return betreffSaeubern(
    `🎉 Neuer Trainer in deiner Nähe: ${m.trainer_vorname} ${m.trainer_nachname}`,
  );
}

export function mailHtml(m: Alertmail): string {
  // Aufbau und Wortlaut sind die des Workflows. Der Unterschied: jeder Wert
  // aus der Datenbank laeuft durch `maskieren`, und der Knopf entfaellt, wenn
  // die Profiladresse nicht `https://` ist (`profilAdresse` gibt dann null).
  const vorname = maskieren(m.trainer_vorname);
  const nachname = maskieren(m.trainer_nachname);
  const stadt = maskieren(m.trainer_stadt);
  const plz = maskieren(m.trainer_plz);
  const trainingsart = maskieren(m.trainer_trainingsart);
  const preis = maskieren(m.trainer_preis);
  const bio = maskieren(m.trainer_bio);
  const spez = maskieren(m.trainer_spez);
  const kundenName = maskieren(m.kunden_name);
  const adresse = profilAdresse(m.trainer_id);

  const knopf = adresse
    ? `<a href="${
      maskieren(adresse)
    }" style="display:block;background:#e8ff00;color:#0a0a0a;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:900;font-size:15px;letter-spacing:1px">JETZT ANFRAGEN →</a>`
    : "";

  return `<div style="background:#0a0a0a;padding:40px 20px;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">
    <div style="background:#e8ff00;padding:18px;text-align:center">
      <span style="font-size:22px;font-weight:900;letter-spacing:4px;color:#0a0a0a">VEXFIT</span>
    </div>
    <div style="padding:32px 28px">
      <p style="color:#f5f5f0;font-size:16px;margin:0 0 8px">Hallo${
    kundenName ? " " + kundenName : ""
  }! 👋</p>
      <h1 style="color:#e8ff00;font-size:24px;margin:0 0 20px;line-height:1.3">Ein neuer Trainer ist jetzt in deiner Nähe verfügbar!</h1>
      <div style="background:#0f0f0f;border:1px solid rgba(232,255,0,0.2);border-radius:6px;padding:20px;margin-bottom:24px">
        <p style="color:#f5f5f0;font-size:19px;font-weight:700;margin:0 0 4px">${vorname} ${nachname}</p>
        <p style="color:#999;font-size:14px;margin:0 0 12px">${trainingsart} · ${plz} ${stadt}</p>
        ${
    spez
      ? '<p style="color:#e8ff00;font-size:13px;margin:0 0 12px">' + spez +
        "</p>"
      : ""
  }
        ${
    bio
      ? '<p style="color:#bbb;font-size:14px;line-height:1.6;margin:0 0 12px">' +
        bio + "</p>"
      : ""
  }
        ${
    preis
      ? '<p style="color:#f5f5f0;font-size:14px;margin:0">ab €' + preis +
        "</p>"
      : ""
  }
      </div>
      ${knopf}
      <p style="color:#666;font-size:12px;margin:24px 0 0;text-align:center">Du erhältst diese E-Mail, weil du Trainer-Benachrichtigungen für deine Region aktiviert hast.</p>
    </div>
  </div>
</div>`;
}

// ============================================================================
// Der Ablauf
// ============================================================================

export interface Ergebnis {
  trainer_gelesen: number;
  alerts_gelesen: number;
  mails_gesendet: number;
  mails_fehlgeschlagen: number;
  markiert: number;
}

/** Antwort eines Probelaufs. Enthaelt keine Adresse und keinen Namen. */
export interface Probeergebnis {
  probelauf: true;
  trainer_gelesen: number;
  alerts_gelesen: number;
  mails_wuerden_gesendet: number;
  mails: Probe[];
}

/**
 * Ist der Parameter `probelauf` in der Adresse gesetzt?
 *
 * Absichtlich genuegt es, dass er DA ist — der Wert spielt keine Rolle. Ein
 * Vertipper (`?probelauf=ja`, `?probelauf=`) fuehrt so zum Trockenlauf und
 * nicht zu einem echten Versand. Der Zeitplan haengt keinen Parameter an und
 * laeuft deshalb unveraendert.
 */
export function istProbelauf(adresse: string): boolean {
  try {
    return new URL(adresse).searchParams.has("probelauf");
  } catch {
    return false;
  }
}

function antwort(status: number, koerper: unknown): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Ein Lauf. Reihenfolge wie im Workflow:
 * Schluessel pruefen → Trainer lesen → Alerts lesen → zuordnen → Mail →
 * `alert_sent = true`.
 *
 * Zum Doppelversand: markiert wird nur, wenn fuer diesen Trainer alle Mails
 * durchgegangen sind. Schlaegt eine fehl, bleibt `alert_sent = false` und der
 * Lauf antwortet mit 502 — der Trainer kommt in 15 Minuten wieder dran.
 * Trainer ohne Empfaenger werden markiert (im Workflow die `_mark_only`-Zeile),
 * sonst wuerden sie fuer immer wiederkommen.
 *
 * Mit `?probelauf` in der Adresse laeuft alles bis einschliesslich der
 * Zuordnung, danach ist Schluss: keine Mail, kein Schreiben auf `trainers`.
 * Die Antwort nennt nur Zahlen und Kennungen, keine Adressen und keine Namen.
 */
export async function bearbeiten(
  anfrage: Request,
  erwarteterSchluessel: string | undefined,
  a: Anschluesse,
): Promise<Response> {
  if (
    !schluesselGueltig(
      anfrage.headers.get("Authorization"),
      erwarteterSchluessel,
    )
  ) {
    return antwort(401, { fehler: "nicht berechtigt" });
  }

  const probelauf = istProbelauf(anfrage.url);

  const trainer = await a.trainerLesen();
  if (!trainer.length) {
    if (probelauf) {
      return antwort(
        200,
        {
          probelauf: true,
          trainer_gelesen: 0,
          alerts_gelesen: 0,
          mails_wuerden_gesendet: 0,
          mails: [],
        } satisfies Probeergebnis,
      );
    }
    return antwort(
      200,
      {
        trainer_gelesen: 0,
        alerts_gelesen: 0,
        mails_gesendet: 0,
        mails_fehlgeschlagen: 0,
        markiert: 0,
      } satisfies Ergebnis,
    );
  }

  const alerts = await a.alertsLesen();

  const plz = benoetigtePlz(trainer, alerts);
  const koordinaten = new Map<string, Koordinate | null>();
  for (const p of plz) koordinaten.set(p, await a.koordinaten(p));

  const { mails, proben, mitEmpfaenger, ohneEmpfaenger } = zuordnen(
    trainer,
    alerts,
    koordinaten,
  );

  // Probelauf: Auswahl und Zuordnung sind gelaufen, ab hier passiert nichts
  // mehr. Kein Versand, kein Schreiben auf trainers.
  if (probelauf) {
    return antwort(
      200,
      {
        probelauf: true,
        trainer_gelesen: trainer.length,
        alerts_gelesen: alerts.length,
        mails_wuerden_gesendet: mails.filter(hatEmpfaenger).length,
        mails: proben,
      } satisfies Probeergebnis,
    );
  }

  // Trainer, deren Mails alle durchgegangen sind, werden markiert.
  const offen = new Map<string, number>();
  for (const id of mitEmpfaenger) offen.set(id, 0);

  let gesendet = 0;
  let fehlgeschlagen = 0;
  for (const m of mails) {
    if (!hatEmpfaenger(m)) continue;
    try {
      await a.mailSenden(m);
      gesendet++;
    } catch (fehler) {
      fehlgeschlagen++;
      offen.set(m.trainer_id, (offen.get(m.trainer_id) ?? 0) + 1);
      a.melden?.("Mail fehlgeschlagen", {
        trainer_id: m.trainer_id,
        fehler: String(fehler),
      });
    }
  }

  let markiert = 0;
  const zuMarkieren = [
    ...mitEmpfaenger.filter((id) => (offen.get(id) ?? 0) === 0),
    ...ohneEmpfaenger,
  ];
  for (const id of zuMarkieren) {
    await a.alsVerarbeitetMarkieren(id);
    markiert++;
  }

  const ergebnis: Ergebnis = {
    trainer_gelesen: trainer.length,
    alerts_gelesen: alerts.length,
    mails_gesendet: gesendet,
    mails_fehlgeschlagen: fehlgeschlagen,
    markiert,
  };
  return antwort(fehlgeschlagen ? 502 : 200, ergebnis);
}
