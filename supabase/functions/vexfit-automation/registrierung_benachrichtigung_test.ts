// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/registrierung_benachrichtigung_test.ts
//
// Baustein "Benachrichtigung bei neuer Trainer-Registrierung reparieren".
//
// Am 31.10.2026 hat sich ein Trainer registriert, Jakob bekam in
// office@vexfit.app aber KEINE Mail. Ursache: die interne Benachrichtigung ging
// an vexfit.info@gmail.com (nur noch Absenderkonto), nicht an das ueberwachte
// Postfach office@vexfit.app. Die Korrektur: BETREIBER = "office@vexfit.app".
//
// Dieser Test prueft ohne Netz (Datenbank, Auth und SMTP sind ersetzt) genau
// zwei Dinge:
//   1. Eine Trainer-Registrierung loest die Benachrichtigung aus, und zwar an
//      office@vexfit.app.
//   2. Scheitert der Versand (z. B. SMTP-Fehler), wird der Fehler NICHT still
//      verschluckt, sondern ueber a.melden gemeldet und weitergeworfen (500),
//      damit er in den Function-Logs steht.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  BETREIBER,
  ERLAUBTE_HERKUNFT,
  type Mail,
} from "./kern.ts";

// Aufzeichnung dessen, was nach aussen ginge.
interface Spur {
  mails: Mail[];
  meldungen: { text: string; mehr: unknown }[];
}

// Minimaler Ersatz fuer alles Aeussere. Nur die Anschluesse, die der Pfad
// /neuer-trainer wirklich benutzt, sind echt belegt; der Rest wirft, falls er
// wider Erwarten doch aufgerufen wird (macht einen falschen Pfad sichtbar).
function baueAnschluss(opt: { smtpFehler?: boolean } = {}): {
  anschluesse: Anschluesse;
  spur: Spur;
} {
  const spur: Spur = { mails: [], meldungen: [] };
  const unbenutzt = (name: string) => () => {
    throw new Error(`Anschluss ${name} haette hier nicht aufgerufen werden duerfen`);
  };
  const anschluesse = {
    // Token-Pruefung der Torwache: ein angemeldeter Trainer.
    benutzerAusToken: (_token: string) =>
      Promise.resolve({ id: "u-trainer", email: "neu@beispiel.at" }),
    mailSenden: (m: Mail) => {
      if (opt.smtpFehler) return Promise.reject(new Error("SMTP dicht"));
      spur.mails.push(m);
      return Promise.resolve();
    },
    melden: (text: string, mehr?: unknown) => {
      spur.meldungen.push({ text, mehr });
    },
    trainerNachId: unbenutzt("trainerNachId"),
    trainerNachEmail: unbenutzt("trainerNachEmail"),
    aeltesteOffeneAnfrage: unbenutzt("aeltesteOffeneAnfrage"),
    trainerBezahltMarkieren: unbenutzt("trainerBezahltMarkieren"),
    anfrageWeitergeleitetMarkieren: unbenutzt("anfrageWeitergeleitetMarkieren"),
    stripeEreignis: unbenutzt("stripeEreignis"),
    ereignisSchonVerarbeitet: unbenutzt("ereignisSchonVerarbeitet"),
    ereignisVermerken: unbenutzt("ereignisVermerken"),
    anfragenAnzahlSeit: unbenutzt("anfragenAnzahlSeit"),
    spamProEmailSeit: unbenutzt("spamProEmailSeit"),
    spamProIpSeit: unbenutzt("spamProIpSeit"),
    spamEintragVormerken: unbenutzt("spamEintragVormerken"),
    adminTrainerSetzen: unbenutzt("adminTrainerSetzen"),
    adminZeileLoeschen: unbenutzt("adminZeileLoeschen"),
    anfrageNachId: unbenutzt("anfrageNachId"),
    trainerVollNachId: unbenutzt("trainerVollNachId"),
    aktiveVerifizierteTrainer: unbenutzt("aktiveVerifizierteTrainer"),
    alternativenVermerken: unbenutzt("alternativenVermerken"),
    offeneAnfragenVor: unbenutzt("offeneAnfragenVor"),
    cronGeheimnis: () => undefined,
    adminHinweis: () => undefined,
  } as unknown as Anschluesse;
  return { anschluesse, spur };
}

// Ein angemeldeter POST von vexfit.app auf /neuer-trainer, wie ihn
// registrieren.html nach dem Signup absetzt (mit Bearer-Token).
function registrierung(koerper: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/neuer-trainer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ERLAUBTE_HERKUNFT,
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify(koerper),
    },
  );
}

Deno.test("Trainer-Registrierung: Benachrichtigung geht an office@vexfit.app", async () => {
  // Der Empfaenger ist der Kern der Reparatur.
  assertEquals(BETREIBER, "office@vexfit.app");

  const { anschluesse, spur } = baueAnschluss();
  const antwort = await bearbeiten(
    registrierung({
      vorname: "Max",
      nachname: "Muster",
      email: "neu@beispiel.at",
      stadt: "Salzburg",
      trainingsart: "Personal Training",
    }),
    anschluesse,
  );

  assertEquals(antwort.status, 200);
  assertEquals(spur.mails.length, 1, "genau eine Benachrichtigung");
  assertEquals(spur.mails[0].an, "office@vexfit.app");
  assertStringIncludes(spur.mails[0].betreff, "Neuer Trainer: Max Muster");
  // Kein Fehler, also auch keine Fehlermeldung.
  assertEquals(spur.meldungen.length, 0);
});

Deno.test("Trainer-Registrierung: ein Versandfehler wird geloggt, nicht still verschluckt", async () => {
  const { anschluesse, spur } = baueAnschluss({ smtpFehler: true });

  let geworfen = false;
  try {
    await bearbeiten(
      registrierung({ vorname: "Max", nachname: "Muster", email: "neu@beispiel.at" }),
      anschluesse,
    );
  } catch (_fehler) {
    // Erwartet: der Fehler wird weitergeworfen, damit der Endpunkt 500 liefert
    // und der Supabase-Function-Log den Fehlschlag sieht.
    geworfen = true;
  }

  assert(geworfen, "ein SMTP-Fehler muss sichtbar werden (weitergeworfen), nicht verschluckt");
  // Und er wird ausdruecklich gemeldet (Function-Log).
  const fehlerMeldung = spur.meldungen.find((m) => m.text === "Mailversand fehlgeschlagen");
  assert(fehlerMeldung, "der Fehlschlag wurde nicht ueber a.melden geloggt");
  assertEquals(
    (fehlerMeldung!.mehr as { an?: string }).an,
    "office@vexfit.app",
    "die Fehlermeldung nennt den gewollten Empfaenger",
  );
  // Keine Mail ist hinausgegangen.
  assertEquals(spur.mails.length, 0);
});
