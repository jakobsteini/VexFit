// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/kern_test.ts
//
// Prueft die Vexfit-Automation OHNE Netz: Datenbank, SMTP und die
// Stripe-Signaturpruefung sind ersetzt bzw. laufen oertlich. Es geht keine
// Mail hinaus und keine Anfrage ins Netz.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
//
// Geprueft wird gegen den gesicherten n8n-Workflow "Vexfit Komplette
// Automation v4": dieselben Empfaenger, Betreffzeilen, Mailtexte,
// Zahlungslinks, Bedingungen und Schreibvorgaenge.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import Stripe from "npm:stripe@18.5.0";
import {
  ABSENDER,
  type Anfrage,
  type Anschluesse,
  bearbeiten,
  BETREIBER,
  eingabePruefen,
  ERLAUBTE_HERKUNFT,
  kundenAngaben,
  LINK_ERSTE,
  LINK_WEITERE,
  type Mail,
  mailErsteAnfrage,
  mailKundenDaten,
  mailNeuerKunde,
  mailNeuerTrainer,
  mailWeitereAnfrage,
  mailZahlungAnJakob,
  pfadTeil,
  type StripeEreignis,
  type Trainer,
} from "./kern.ts";

const TEST_GEHEIMNIS = "whsec_nur_fuer_den_test_ohne_echten_wert";

// ---------------------------------------------------------------------------
// Ersatz fuer alles Aeussere
// ---------------------------------------------------------------------------
interface Aufzeichnung {
  mails: Mail[];
  bezahltMarkiert: string[];
  weitergeleitetMarkiert: string[]; // jetzt Anfrage-Kennungen (E2)
  vermerkt: string[];
}

const T_STANDARD: Trainer = {
  id: "t-1",
  vorname: "Testvorname",
  nachname: "Testnachname",
  email: "trainer@beispiel.at",
  stripe_bezahlt: false,
};

const A_STANDARD: Anfrage = {
  id: "a-1",
  kunden_name: "Testkundin",
  kunden_email: "kundin@beispiel.at",
  ziel: "Abnehmen",
  nachricht: "Ich moechte starten.",
  created_at: "2026-09-20T10:00:00Z",
};

function bau(opt: {
  trainer?: Trainer | null;
  anfrage?: Anfrage | null;
  /** Mehrere offene Anfragen — die Datenbank wird hier nachgebaut (E2). */
  offene?: Anfrage[];
  schonVerarbeitet?: Set<string>;
  adminHinweis?: string;
  smtpFehler?: boolean;
} = {}): { anschluesse: Anschluesse; auf: Aufzeichnung } {
  const auf: Aufzeichnung = {
    mails: [],
    bezahltMarkiert: [],
    weitergeleitetMarkiert: [],
    vermerkt: [],
  };
  const schon = opt.schonVerarbeitet ?? new Set<string>();
  /** Schon weitergeleitete Anfragen — die Sperre der Datenbank nachgebaut. */
  const erledigt = new Set<string>();
  const stripeClient = new Stripe("sk_test_nicht_benutzt", {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const krypto = Stripe.createSubtleCryptoProvider();

  const anschluesse: Anschluesse = {
    trainerNachId: () =>
      Promise.resolve(opt.trainer === undefined ? T_STANDARD : opt.trainer),
    trainerNachEmail: () =>
      Promise.resolve(opt.trainer === undefined ? T_STANDARD : opt.trainer),
    // Bildet die Abfrage nach: offen, nach created_at aufsteigend, erste Zeile.
    aeltesteOffeneAnfrage: () => {
      // Bildet die Function-Abfrage nach: nicht weitergeleitet UND nicht
      // abgelehnt, nach created_at aufsteigend, erste Zeile.
      if (opt.offene) {
        const offen = opt.offene
          .filter((x) => !erledigt.has(x.id) && x.status !== "abgelehnt")
          .sort((x, y) =>
            String(x.created_at).localeCompare(String(y.created_at))
          );
        return Promise.resolve(offen[0] ?? null);
      }
      const einzeln = opt.anfrage === undefined ? A_STANDARD : opt.anfrage;
      if (einzeln && (erledigt.has(einzeln.id) || einzeln.status === "abgelehnt")) {
        return Promise.resolve(null);
      }
      return Promise.resolve(einzeln);
    },
    trainerBezahltMarkieren: (email) => {
      auf.bezahltMarkiert.push(email);
      return Promise.resolve();
    },
    anfrageWeitergeleitetMarkieren: (anfrageId) => {
      auf.weitergeleitetMarkiert.push(anfrageId);
      erledigt.add(anfrageId);
      return Promise.resolve();
    },
    mailSenden: (m) => {
      if (opt.smtpFehler) return Promise.reject(new Error("SMTP dicht"));
      auf.mails.push(m);
      return Promise.resolve();
    },
    async stripeEreignis(rumpf, signatur) {
      if (!signatur) return null;
      try {
        const e = await stripeClient.webhooks.constructEventAsync(
          rumpf,
          signatur,
          TEST_GEHEIMNIS,
          undefined,
          krypto,
        );
        return e as unknown as StripeEreignis;
      } catch {
        return null;
      }
    },
    ereignisSchonVerarbeitet: (id) => Promise.resolve(schon.has(id)),
    ereignisVermerken: (id) => {
      auf.vermerkt.push(id);
      schon.add(id);
      return Promise.resolve();
    },
    adminHinweis: () => opt.adminHinweis,
    melden: () => {},
  };
  return { anschluesse, auf };
}

function anfrage(
  pfad: string,
  koerper: unknown,
  opt: {
    herkunft?: string | null;
    methode?: string;
    kopf?: Record<string, string>;
  } = {},
): Request {
  const kopf = new Headers({
    "Content-Type": "application/json",
    ...(opt.kopf ?? {}),
  });
  if (opt.herkunft) kopf.set("Origin", opt.herkunft);
  return new Request(
    `https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/${pfad}`,
    {
      method: opt.methode ?? "POST",
      headers: kopf,
      body: opt.methode === "OPTIONS"
        ? null
        : (typeof koerper === "string" ? koerper : JSON.stringify(koerper)),
    },
  );
}

const VOM_BROWSER = { herkunft: ERLAUBTE_HERKUNFT };

// ===========================================================================
// Grundlagen
// ===========================================================================
Deno.test("Festwerte stehen unveraendert wie im Workflow", () => {
  assertEquals(ABSENDER, "vexfit.info@gmail.com");
  assertEquals(BETREIBER, "vexfit.info@gmail.com");
  assertEquals(LINK_ERSTE, "https://buy.stripe.com/eVqdR9gopdNhczNbhw2oE00");
  assertEquals(LINK_WEITERE, "https://buy.stripe.com/7sYbJ1fkl8sX8jxfxM2oE01");
  assertEquals(ERLAUBTE_HERKUNFT, "https://vexfit.app");
});

Deno.test("der Pfad hinter dem Function-Namen wird erkannt", () => {
  const b = "https://x.supabase.co/functions/v1/vexfit-automation/";
  assertEquals(pfadTeil(b + "neuer-trainer"), "neuer-trainer");
  assertEquals(pfadTeil(b + "stripe"), "stripe");
  assertEquals(pfadTeil(b + "neue-anfrage?x=1"), "neue-anfrage");
});

// ===========================================================================
// /neuer-trainer
// ===========================================================================
Deno.test("/neuer-trainer: gueltige Eingabe → genau eine Mail an Jakob, Wortlaut wie im Workflow", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage("neuer-trainer", {
      vorname: "Eva",
      nachname: "Muster",
      email: "eva@beispiel.at",
      stadt: "Wien",
      trainingsart: "Im Fitnessstudio",
    }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(auf.mails.length, 1);
  const m = auf.mails[0];
  assertEquals(m.an, "vexfit.info@gmail.com");
  assertEquals(m.betreff, "Neuer Trainer: Eva Muster");
  assertEquals(
    m.text,
    "Neuer Trainer registriert\n\n" +
      "Name: Eva Muster\nE-Mail: eva@beispiel.at\nStadt: Wien\n" +
      "Trainingsart: Im Fitnessstudio\n\n" +
      "Im Admin öffnen: https://vexfit.app/admin.html\n\n" +
      "Interne Benachrichtigung.\nJakob Steinbacher, 5330 Fuschl am See, Österreich",
  );
  assertStringIncludes(m.html, "Neuer Trainer registriert");
  assertStringIncludes(m.html, "Jakob Steinbacher, 5330 Fuschl am See, Österreich");
  // Es wird nichts in die Datenbank geschrieben.
  assertEquals(auf.bezahltMarkiert, []);
  assertEquals(auf.weitergeleitetMarkiert, []);
});

Deno.test("/neuer-trainer: keine Passwortzeile mehr (neuer Wortlaut)", async () => {
  // Der neue, exakt vorgegebene Wortlaut hat keine Passwortzeile; ein gesetztes
  // Secret aendert daran nichts mehr.
  for (const adminHinweis of [undefined, "PLATZHALTER-AUS-DEM-SECRET"]) {
    const { anschluesse, auf } = bau({ adminHinweis });
    await bearbeiten(
      anfrage("neuer-trainer", { email: "a@b.de" }, VOM_BROWSER),
      anschluesse,
    );
    assert(
      !auf.mails[0].text.includes("Passwort"),
      "Passwortzeile steht noch in der Textfassung",
    );
    assert(
      !auf.mails[0].html.includes("Passwort"),
      "Passwortzeile steht noch im HTML",
    );
  }
});

Deno.test("/neuer-trainer: Pflichtfeld fehlt → 400 ohne Wirkung", async () => {
  for (
    const koerper of [
      {},
      { email: "" },
      { email: "keine-adresse" },
      "kein json",
    ]
  ) {
    const { anschluesse, auf } = bau();
    const a = await bearbeiten(
      anfrage("neuer-trainer", koerper, VOM_BROWSER),
      anschluesse,
    );
    assertEquals(a.status, 400, `Koerper: ${JSON.stringify(koerper)}`);
    assertEquals(auf.mails, []);
  }
});

Deno.test("/neuer-trainer: zu langes Feld → 400", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage(
      "neuer-trainer",
      { email: "a@b.de", vorname: "x".repeat(201) },
      VOM_BROWSER,
    ),
    anschluesse,
  );
  assertEquals(a.status, 400);
  assertEquals(auf.mails, []);
});

// ===========================================================================
// /neuer-kunde
// ===========================================================================
Deno.test("/neuer-kunde: gueltige Eingabe → genau eine Mail an Jakob, Wortlaut wie im Workflow", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage("neuer-kunde", {
      vorname: "Eva",
      nachname: "Muster",
      email: "eva@beispiel.at",
      stadt: "Wien",
      ziel: "Abnehmen",
    }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(auf.mails.length, 1);
  assertEquals(auf.mails[0].an, "vexfit.info@gmail.com");
  assertEquals(auf.mails[0].betreff, "Neuer Kunde: Eva Muster");
  assertEquals(
    auf.mails[0].text,
    "Neuer Kunde registriert\n\n" +
      "Name: Eva Muster\nE-Mail: eva@beispiel.at\nStadt: Wien\nZiel: Abnehmen\n\n" +
      "Im Admin öffnen: https://vexfit.app/admin.html\n\n" +
      "Interne Benachrichtigung.\nJakob Steinbacher, 5330 Fuschl am See, Österreich",
  );
  assertStringIncludes(auf.mails[0].html, "Neuer Kunde registriert");
  assertStringIncludes(auf.mails[0].html, "Jakob Steinbacher, 5330 Fuschl am See, Österreich");
});

Deno.test("/neuer-kunde: die Nutzlast von suche.html geht durch (leerer Nachname, leere Stadt)", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage("neuer-kunde", {
      vorname: "Interessent",
      nachname: "",
      email: "interessent@beispiel.at",
      stadt: "",
      ziel: "Benachrichtigung gewünscht",
      budget: "",
    }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(
    a.status,
    200,
    "suche.html prueft r.ok — eine 400 wuerde dem Besucher einen Fehler zeigen",
  );
  assertEquals(auf.mails.length, 1);
});

// ===========================================================================
// /neue-anfrage
// ===========================================================================
Deno.test("/neue-anfrage: noch nicht bezahlt → ERSTE Anfrage mit 49,99-Link an die Traineradresse", async () => {
  const { anschluesse, auf } = bau({
    trainer: { ...T_STANDARD, stripe_bezahlt: false },
  });
  const a = await bearbeiten(
    anfrage("neue-anfrage", {
      trainer_id: "t-1",
      kunden_name: "Testkundin",
      ziel: "Abnehmen",
      nachricht: "Hallo!",
    }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(auf.mails.length, 1);
  const m = auf.mails[0];
  assertEquals(m.an, "trainer@beispiel.at");
  assertEquals(m.betreff, "Deine erste Kundenanfrage auf Vexfit");
  assertStringIncludes(
    m.text,
    "Hallo Testvorname, über Vexfit hat dich jemand angefragt.",
  );
  assertStringIncludes(m.text, "Ziel: Abnehmen");
  assertStringIncludes(m.text, "Nachricht: Hallo!");
  assertStringIncludes(m.text, "Abo aktivieren: " + LINK_ERSTE);
  assertStringIncludes(m.text, "49,99 € pro Monat, monatlich kündbar");
  // Der Kundenname wird vor der Zahlung NICHT gezeigt.
  assert(
    !m.text.includes("Testkundin"),
    "Kundenname steht vor der Zahlung in der Mail",
  );
  assert(!m.html.includes("Testkundin"), "Kundenname steht im HTML");
  assert(!m.text.includes(LINK_WEITERE), "falscher Zahlungslink in der Mail");
});

Deno.test("/neue-anfrage: schon bezahlt → WEITERE Anfrage mit 9,99-Link", async () => {
  const { anschluesse, auf } = bau({
    trainer: { ...T_STANDARD, stripe_bezahlt: true },
  });
  await bearbeiten(
    anfrage("neue-anfrage", {
      trainer_id: "t-1",
      kunden_name: "K",
      ziel: "Z",
      nachricht: "N",
    }, VOM_BROWSER),
    anschluesse,
  );
  const m = auf.mails[0];
  assertEquals(m.betreff, "Neue Kundenanfrage auf Vexfit");
  assertStringIncludes(
    m.text,
    "Hallo Testvorname, du hast eine neue Anfrage erhalten.",
  );
  assertStringIncludes(m.text, "9,99 € einmalig.");
  assertStringIncludes(m.text, "Anfrage freischalten: " + LINK_WEITERE);
  assert(!m.text.includes(LINK_ERSTE), "falscher Zahlungslink in der Mail");
});

Deno.test("/neue-anfrage: ohne trainer_id → 400, unbekannte Kennung → 200 ohne Mail", async () => {
  const ohne = bau();
  const a1 = await bearbeiten(
    anfrage("neue-anfrage", { kunden_name: "K" }, VOM_BROWSER),
    ohne.anschluesse,
  );
  assertEquals(a1.status, 400);
  assertEquals(ohne.auf.mails, []);

  const leer = bau({ trainer: null });
  const a2 = await bearbeiten(
    anfrage("neue-anfrage", { trainer_id: "gibtsnicht" }, VOM_BROWSER),
    leer.anschluesse,
  );
  assertEquals(a2.status, 200);
  assertEquals(leer.auf.mails, []);
});

Deno.test("/neue-anfrage: die Feldnamen von profil.html kommen jetzt gefuellt an", async () => {
  // profil.html:350-355 schickt kunde_name / kunde_ziel / kunde_nachricht,
  // kunden-bereich.html:435-441 schickt kunden_name / ziel / nachricht.
  // Seit dem 26.09.2026 liest die Function beide Schreibweisen.
  const { anschluesse, auf } = bau();
  await bearbeiten(
    anfrage("neue-anfrage", {
      trainer_id: "t-1",
      trainer_name: "Testvorname Testnachname",
      kunde_name: "Eva Muster",
      kunde_email: "eva@beispiel.at",
      kunde_ziel: "Abnehmen",
      kunde_nachricht: "Ich moechte starten.",
    }, VOM_BROWSER),
    anschluesse,
  );
  const text = auf.mails[0].text;
  assertStringIncludes(text, "Ziel: Abnehmen");
  assertStringIncludes(text, "Nachricht: Ich moechte starten.");
});

Deno.test("/neue-anfrage: die Feldnamen von kunden-bereich.html gehen weiter", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    anfrage("neue-anfrage", {
      trainer_id: "t-1",
      kunden_name: "Eva Muster",
      kunden_email: "eva@beispiel.at",
      ziel: "Abnehmen",
      nachricht: "Ich moechte starten.",
    }, VOM_BROWSER),
    anschluesse,
  );
  const text = auf.mails[0].text;
  assertStringIncludes(text, "Ziel: Abnehmen");
  assertStringIncludes(text, "Nachricht: Ich moechte starten.");
});

Deno.test("/neue-anfrage: kundenAngaben nimmt die erste gefuellte Schreibweise", () => {
  assertEquals(kundenAngaben({ kunden_name: "A", kunde_name: "B" }).name, "A");
  assertEquals(kundenAngaben({ kunde_name: "B" }).name, "B");
  assertEquals(kundenAngaben({ kunden_name: "", kunde_name: "B" }).name, "B");
  assertEquals(kundenAngaben({ ziel: "Z", kunde_ziel: "Y" }).ziel, "Z");
  assertEquals(kundenAngaben({ kunde_ziel: "Y" }).ziel, "Y");
  assertEquals(kundenAngaben({ kunde_nachricht: "N" }).nachricht, "N");
  assertEquals(kundenAngaben({}).name, undefined);
});

// ===========================================================================
// CORS und Verfahren
// ===========================================================================
Deno.test("fremde Herkunft → 403 und keine CORS-Freigabe", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage("neuer-trainer", { email: "a@b.de" }, {
      herkunft: "https://boese.invalid",
    }),
    anschluesse,
  );
  assertEquals(a.status, 403);
  assertEquals(a.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(auf.mails, []);
});

Deno.test("eigene Herkunft → CORS-Freigabe genau fuer vexfit.app", async () => {
  const { anschluesse } = bau();
  const a = await bearbeiten(
    anfrage("neuer-trainer", { email: "a@b.de" }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(
    a.headers.get("Access-Control-Allow-Origin"),
    "https://vexfit.app",
  );
  assertEquals(a.headers.get("Vary"), "Origin");
});

Deno.test("OPTIONS wird mit 204 und Freigabe beantwortet, ohne Wirkung", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage("neuer-trainer", null, { ...VOM_BROWSER, methode: "OPTIONS" }),
    anschluesse,
  );
  assertEquals(a.status, 204);
  assertEquals(
    a.headers.get("Access-Control-Allow-Origin"),
    "https://vexfit.app",
  );
  assertEquals(a.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEquals(auf.mails, []);
});

Deno.test("ohne Herkunft (curl, Stripe) laeuft es durch, aber ohne CORS-Kopf", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    anfrage("neuer-trainer", { email: "a@b.de" }),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(a.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(auf.mails.length, 1);
});

Deno.test("unbekannter Pfad → 404", async () => {
  const { anschluesse } = bau();
  const a = await bearbeiten(
    anfrage("gibtsnicht", { email: "a@b.de" }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(a.status, 404);
});

// ===========================================================================
// Einschleusen
// ===========================================================================
Deno.test("Name mit HTML: Textfassung roh, HTML-Fassung maskiert", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    anfrage("neuer-trainer", {
      email: "a@b.de",
      vorname: "<b>Eva</b>",
      nachname: "A & B",
    }, VOM_BROWSER),
    anschluesse,
  );
  const m = auf.mails[0];
  // Textfassung bleibt roh (keine Maskierung), HTML-Fassung ist maskiert.
  assertStringIncludes(m.text, "Name: <b>Eva</b> A & B");
  assertStringIncludes(m.html, "&lt;b&gt;Eva&lt;/b&gt; A &amp; B");
  assert(!m.html.includes("<b>Eva</b>"), "Name steht roh im HTML");
  // Jede Mail traegt jetzt beide Fassungen.
  assertEquals(Object.keys(m).sort(), ["an", "betreff", "html", "text"]);
});

Deno.test("Zeilenumbruch im Namen kommt nicht in den Betreff", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    anfrage("neuer-trainer", {
      email: "a@b.de",
      vorname: "Eva\r\nBcc: fremd@beispiel.invalid",
      nachname: "M",
    }, VOM_BROWSER),
    anschluesse,
  );
  const b = auf.mails[0].betreff;
  assert(
    !b.includes("\n") && !b.includes("\r"),
    `Betreff mit Umbruch: ${JSON.stringify(b)}`,
  );
  assertEquals(b, "Neuer Trainer: Eva Bcc: fremd@beispiel.invalid M");
});

Deno.test("Zeilenumbruch in der Empfaengeradresse → kein Versand", async () => {
  const { anschluesse, auf } = bau({
    trainer: {
      ...T_STANDARD,
      email: "trainer@beispiel.at\nBcc: fremd@beispiel.invalid",
    },
  });
  const a = await bearbeiten(
    anfrage("neue-anfrage", { trainer_id: "t-1" }, VOM_BROWSER),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(auf.mails, [], "es wurde an eine Adresse mit Umbruch gesendet");
});

Deno.test("unbrauchbare Traineradresse → kein Versand", async () => {
  for (const adresse of ["", "keine-adresse", null]) {
    const { anschluesse, auf } = bau({
      trainer: { ...T_STANDARD, email: adresse },
    });
    await bearbeiten(
      anfrage("neue-anfrage", { trainer_id: "t-1" }, VOM_BROWSER),
      anschluesse,
    );
    assertEquals(
      auf.mails,
      [],
      `Adresse ${JSON.stringify(adresse)} wurde nicht abgelehnt`,
    );
  }
});

Deno.test("eingabePruefen: Pflichtfelder und Grenzen", () => {
  assertEquals(eingabePruefen({ email: "a@b.de" }, ["email"]).ok, true);
  assertEquals(eingabePruefen({ email: "a@b" }, ["email"]).ok, false);
  assertEquals(eingabePruefen({}, ["trainer_id"]).ok, false);
  assertEquals(eingabePruefen({ trainer_id: "t-1" }, ["trainer_id"]).ok, true);
  assertEquals(
    eingabePruefen({ trainer_id: "t", nachricht: "x".repeat(2001) }, [
      "trainer_id",
    ]).ok,
    false,
  );
  assertEquals(eingabePruefen(null, []).ok, false);
  assertEquals(eingabePruefen([], []).ok, false);
});

// ===========================================================================
// Stripe
// ===========================================================================
async function stripeAnfrage(
  ereignis: unknown,
  geheimnis = TEST_GEHEIMNIS,
): Promise<Request> {
  const rumpf = JSON.stringify(ereignis);
  // Die asynchrone Fassung: unter Deno rechnet das Stripe-Paket mit
  // SubtleCrypto, und das kann nicht synchron aufgerufen werden.
  const signatur = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload: rumpf,
    secret: geheimnis,
  });
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/stripe",
    { method: "POST", headers: { "stripe-signature": signatur }, body: rumpf },
  );
}

function zahlung(id = "evt_1", email = "trainer@beispiel.at", betrag = 4999) {
  return {
    id,
    type: "checkout.session.completed",
    data: { object: { customer_details: { email }, amount_total: betrag } },
  };
}

Deno.test("Stripe: gueltige Signatur → markieren, weiterleiten, zwei Mails wie im Workflow", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(await stripeAnfrage(zahlung()), anschluesse);
  assertEquals(a.status, 200);

  assertEquals(auf.bezahltMarkiert, ["trainer@beispiel.at"]);
  assertEquals(auf.weitergeleitetMarkiert, ["a-1"]); // E2: die Anfrage, nicht der Trainer
  assertEquals(auf.vermerkt, ["evt_1"]);
  assertEquals(auf.mails.length, 2);

  const anTrainer = auf.mails[0];
  assertEquals(anTrainer.an, "trainer@beispiel.at");
  assertEquals(anTrainer.betreff, "Deine Kundendaten");
  assertStringIncludes(
    anTrainer.text,
    "Hallo Testvorname, hier sind die Kontaktdaten.",
  );
  assertStringIncludes(anTrainer.text, "Name: Testkundin");
  assertStringIncludes(anTrainer.text, "E-Mail: kundin@beispiel.at");
  assertStringIncludes(anTrainer.text, "Ziel: Abnehmen");
  assertStringIncludes(anTrainer.text, "Nachricht: Ich moechte starten.");

  const anJakob = auf.mails[1];
  assertEquals(anJakob.an, "vexfit.info@gmail.com");
  assertEquals(anJakob.betreff, "Zahlung: trainer@beispiel.at");
  assertStringIncludes(anJakob.text, "Trainer: Testvorname Testnachname");
  assertStringIncludes(anJakob.text, "Betrag: 49.99 €");
  assertStringIncludes(anJakob.text, "Status: Kundendaten weitergeleitet");
  assertStringIncludes(
    anJakob.text,
    "Im Admin öffnen: https://vexfit.app/admin.html",
  );
});

Deno.test("Stripe: falsche Signatur → 400 ohne jede Wirkung", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    await stripeAnfrage(zahlung(), "whsec_falsches_geheimnis"),
    anschluesse,
  );
  assertEquals(a.status, 400);
  assertEquals(auf.mails, []);
  assertEquals(auf.bezahltMarkiert, []);
  assertEquals(auf.weitergeleitetMarkiert, []);
  assertEquals(auf.vermerkt, []);
});

Deno.test("Stripe: ohne Signaturkopf → 400 ohne Wirkung", async () => {
  const { anschluesse, auf } = bau();
  const r = new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/stripe",
    { method: "POST", body: JSON.stringify(zahlung()) },
  );
  const a = await bearbeiten(r, anschluesse);
  assertEquals(a.status, 400);
  assertEquals(auf.mails, []);
});

Deno.test("Stripe: veraenderter Rumpf bei gueltiger Signatur → 400", async () => {
  const { anschluesse, auf } = bau();
  const echt = await stripeAnfrage(zahlung());
  const gefaelscht = new Request(echt.url, {
    method: "POST",
    headers: echt.headers,
    body: JSON.stringify(zahlung("evt_1", "fremd@beispiel.invalid")),
  });
  const a = await bearbeiten(gefaelscht, anschluesse);
  assertEquals(a.status, 400);
  assertEquals(auf.mails, []);
});

Deno.test("Stripe: dasselbe Ereignis zweimal → beim zweiten Mal keine Wirkung", async () => {
  const { anschluesse, auf } = bau();
  const a1 = await bearbeiten(
    await stripeAnfrage(zahlung("evt_doppelt")),
    anschluesse,
  );
  const a2 = await bearbeiten(
    await stripeAnfrage(zahlung("evt_doppelt")),
    anschluesse,
  );
  assertEquals(a1.status, 200);
  assertEquals(a2.status, 200);
  assertEquals((await a2.json()).uebersprungen, "schon verarbeitet");
  assertEquals(
    auf.mails.length,
    2,
    "beim zweiten Mal wurde noch einmal gesendet",
  );
  assertEquals(auf.bezahltMarkiert.length, 1);
  assertEquals(auf.weitergeleitetMarkiert.length, 1);
});

Deno.test("Stripe: anderer Ereignistyp → 200 ohne Wirkung", async () => {
  const { anschluesse, auf } = bau();
  const a = await bearbeiten(
    await stripeAnfrage({
      id: "evt_x",
      type: "invoice.paid",
      data: { object: {} },
    }),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals((await a.json()).uebersprungen, "anderer Ereignistyp");
  assertEquals(auf.mails, []);
  assertEquals(auf.bezahltMarkiert, []);
  assertEquals(auf.vermerkt, []);
});

Deno.test("Stripe: kein Trainer (Kennung/E-Mail) → Mail an Jakob, Ereignis NICHT vermerkt", async () => {
  const { anschluesse, auf } = bau({ trainer: null });
  const a = await bearbeiten(
    await stripeAnfrage(zahlung("evt_ohne_trainer")),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(auf.bezahltMarkiert, []);
  assertEquals(auf.weitergeleitetMarkiert, []);
  // Teil 5: Ereignis bleibt offen (Stripe stellt erneut zu), Jakob wird gewarnt.
  assertEquals(auf.vermerkt, []);
  assertEquals(auf.mails.length, 1);
  assertEquals(auf.mails[0].an, "vexfit.info@gmail.com");
  assertStringIncludes(auf.mails[0].betreff, "ohne passenden Trainer");
  assertStringIncludes(auf.mails[0].text, "evt_ohne_trainer");
});

Deno.test("Teil 5: Zuordnung ueber client_reference_id (ohne Zahler-E-Mail)", async () => {
  // Kein customer_details.email -> Zuordnung muss ueber die Kennung gelingen.
  const { anschluesse, auf } = bau();
  const ereignis = {
    id: "evt_ref",
    type: "checkout.session.completed",
    data: { object: { client_reference_id: "t-1", amount_total: 4999 } },
  };
  const a = await bearbeiten(await stripeAnfrage(ereignis), anschluesse);
  assertEquals(a.status, 200);
  // Trainer wurde gefunden und verbucht (ueber die Trainer-E-Mail als Zielzeile).
  assertEquals(auf.bezahltMarkiert.length, 1);
  assertEquals(auf.vermerkt, ["evt_ref"]);
});

Deno.test("Teil 5: abgelehnte aeltere Anfrage wird uebersprungen", async () => {
  const abgelehntAlt = {
    id: "a-alt",
    kunden_name: "Alt",
    kunden_email: "alt@beispiel.at",
    ziel: "X",
    nachricht: "Y",
    created_at: "2026-09-01T10:00:00Z",
    status: "abgelehnt",
  };
  const offenNeu = {
    id: "a-neu",
    kunden_name: "Neu",
    kunden_email: "neu@beispiel.at",
    ziel: "Z",
    nachricht: "W",
    created_at: "2026-09-10T10:00:00Z",
    status: "ausstehend",
  };
  const { anschluesse, auf } = bau({ offene: [abgelehntAlt, offenNeu] });
  await bearbeiten(await stripeAnfrage(zahlung("evt_skip")), anschluesse);
  // Nicht die aeltere abgelehnte, sondern die juengere offene wird freigeschaltet.
  assertEquals(auf.weitergeleitetMarkiert, ["a-neu"]);
});

Deno.test("E1 — Zahlung ohne offene Anfrage: verbucht, keine Trainer-Mail, Vermerk an Jakob", async () => {
  const { anschluesse, auf } = bau({ anfrage: null });
  const a = await bearbeiten(
    await stripeAnfrage(zahlung("evt_ohne_anfrage")),
    anschluesse,
  );
  assertEquals(a.status, 200);
  const d = await a.json();
  assertEquals(d.trainer_markiert, true);
  assertEquals(d.anfrage_weitergeleitet, false);

  // verbucht wird trotzdem
  assertEquals(auf.bezahltMarkiert, ["trainer@beispiel.at"]);
  assertEquals(auf.weitergeleitetMarkiert, []);

  // genau eine Mail, und zwar die an Jakob
  assertEquals(auf.mails.length, 1);
  assertEquals(auf.mails[0].an, "vexfit.info@gmail.com");
  assertEquals(auf.mails[0].betreff, "Zahlung: trainer@beispiel.at");
  assertStringIncludes(auf.mails[0].text, "Status: keine offene Anfrage");
  assert(
    !auf.mails[0].text.includes("Kundendaten weitergeleitet"),
    "die Status-Zeile behauptet eine Weiterleitung, die es nicht gab",
  );
  assertEquals(auf.vermerkt, ["evt_ohne_anfrage"]);
});

Deno.test("E1 — mit offener Anfrage steht die urspruengliche Haken-Zeile in der Mail", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    await stripeAnfrage(zahlung("evt_mit_anfrage")),
    anschluesse,
  );
  assertStringIncludes(auf.mails[1].text, "Status: Kundendaten weitergeleitet");
  assert(!auf.mails[1].text.includes("keine offene Anfrage"));
});

// --------------------------------------------------------------------------
// E2 — genau eine Anfrage je Zahlung, die aelteste
// --------------------------------------------------------------------------
const DREI_OFFENE: Anfrage[] = [
  {
    id: "a-mitte",
    kunden_name: "Kundin Mitte",
    kunden_email: "mitte@beispiel.at",
    ziel: "Mitte",
    nachricht: "zweite",
    created_at: "2026-09-20T12:00:00Z",
  },
  {
    id: "a-alt",
    kunden_name: "Kundin Alt",
    kunden_email: "alt@beispiel.at",
    ziel: "Alt",
    nachricht: "erste",
    created_at: "2026-09-19T08:00:00Z",
  },
  {
    id: "a-neu",
    kunden_name: "Kundin Neu",
    kunden_email: "neu@beispiel.at",
    ziel: "Neu",
    nachricht: "dritte",
    created_at: "2026-09-21T09:00:00Z",
  },
];

Deno.test("E2 — drei offene Anfragen: nur die aelteste wird gemailt und markiert", async () => {
  const { anschluesse, auf } = bau({ offene: DREI_OFFENE });
  const a = await bearbeiten(
    await stripeAnfrage(zahlung("evt_e2_1")),
    anschluesse,
  );
  assertEquals(a.status, 200);

  assertEquals(
    auf.weitergeleitetMarkiert,
    ["a-alt"],
    "es wurde die falsche Anfrage markiert",
  );
  assertEquals(auf.mails.length, 2);
  const anTrainer = auf.mails[0];
  assertStringIncludes(anTrainer.text, "Name: Kundin Alt");
  assertStringIncludes(anTrainer.text, "E-Mail: alt@beispiel.at");
  assert(
    !anTrainer.text.includes("Kundin Mitte"),
    "eine zweite Anfrage steht in der Mail",
  );
  assert(
    !anTrainer.text.includes("Kundin Neu"),
    "eine dritte Anfrage steht in der Mail",
  );
});

Deno.test("E2 — zweite Zahlung: die naechstaeltere wird freigeschaltet, die juengste bleibt offen", async () => {
  const { anschluesse, auf } = bau({ offene: DREI_OFFENE });
  await bearbeiten(await stripeAnfrage(zahlung("evt_e2_a")), anschluesse);
  await bearbeiten(await stripeAnfrage(zahlung("evt_e2_b")), anschluesse);

  assertEquals(auf.weitergeleitetMarkiert, ["a-alt", "a-mitte"]);
  assertEquals(auf.mails.length, 4); // je Zahlung eine an den Trainer und eine an Jakob
  assertStringIncludes(auf.mails[0].text, "Name: Kundin Alt");
  assertStringIncludes(auf.mails[2].text, "Name: Kundin Mitte");

  // Die juengste ist weiterhin offen und kaeme bei der naechsten Zahlung dran.
  await bearbeiten(await stripeAnfrage(zahlung("evt_e2_c")), anschluesse);
  assertEquals(auf.weitergeleitetMarkiert, ["a-alt", "a-mitte", "a-neu"]);
});

Deno.test("E2 — vierte Zahlung ohne offene Anfrage: verbucht, Vermerk, nichts markiert", async () => {
  const { anschluesse, auf } = bau({ offene: DREI_OFFENE });
  for (const kennung of ["evt_v1", "evt_v2", "evt_v3", "evt_v4"]) {
    await bearbeiten(await stripeAnfrage(zahlung(kennung)), anschluesse);
  }
  assertEquals(auf.weitergeleitetMarkiert, ["a-alt", "a-mitte", "a-neu"]);
  assertEquals(
    auf.bezahltMarkiert.length,
    4,
    "jede Zahlung wird verbucht (E1)",
  );
  assertStringIncludes(
    auf.mails[auf.mails.length - 1].text,
    "Status: keine offene Anfrage",
  );
});

Deno.test("Stripe: Betrag wird wie im Workflow durch 100 geteilt", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    await stripeAnfrage(zahlung("evt_betrag", "trainer@beispiel.at", 999)),
    anschluesse,
  );
  assertStringIncludes(auf.mails[1].text, "Betrag: 9.99 €");
});

// ===========================================================================
// Gemeinsame Hygiene: fuer jede der sechs Mails dieser Function pruefen, dass
// der Betreff kein Emoji enthaelt, das HTML die Fusszeile traegt, die
// Textfassung nicht leer ist und weder "=20" noch eine andere
// Quoted-Printable-Sequenz entsteht und keine Zeile auf ein Leerzeichen endet.
// (Die siebte Mail, der Trainer-Alert, wird in trainer-alert/kern_test.ts
// genauso geprueft.)
// ===========================================================================
Deno.test("alle sechs Mails: kein Emoji im Betreff, Fusszeile im HTML, Text sauber", () => {
  const trainer: Trainer = {
    id: "t-1",
    vorname: "Testvorname",
    nachname: "Testnachname",
    email: "trainer@beispiel.at",
  };
  const body: Record<string, unknown> = {
    vorname: "Eva",
    nachname: "Muster",
    email: "eva@beispiel.at",
    stadt: "Wien",
    trainingsart: "Im Fitnessstudio",
    ziel: "Abnehmen",
    kunden_name: "Testkundin",
    nachricht: "Hallo!",
  };
  const anfrage: Anfrage = {
    id: "a-1",
    kunden_name: "Testkundin",
    kunden_email: "kundin@beispiel.at",
    ziel: "Abnehmen",
    nachricht: "Ich moechte starten.",
  };
  const mails: Mail[] = [
    mailNeuerTrainer(body),
    mailNeuerKunde(body),
    mailErsteAnfrage(trainer, body),
    mailWeitereAnfrage(trainer, body),
    mailKundenDaten(trainer, anfrage, "kundin@beispiel.at"),
    mailZahlungAnJakob(trainer, "trainer@beispiel.at", 4999, true),
  ];
  for (const m of mails) {
    assert(
      !/\p{Extended_Pictographic}/u.test(m.betreff),
      `Betreff enthaelt ein Emoji: ${m.betreff}`,
    );
    assertStringIncludes(m.html, "Jakob Steinbacher, 5330 Fuschl am See, Österreich");
    assert(m.text.trim().length > 0, `Textfassung leer: ${m.betreff}`);
    assert(
      !/=20/.test(m.betreff + "\n" + m.text),
      `Quoted-Printable =20 bei: ${m.betreff}`,
    );
    assert(
      !/=[0-9A-Fa-f]{2}/.test(m.text),
      `Quoted-Printable-Sequenz im Text bei: ${m.betreff}`,
    );
    for (const zeile of m.text.split("\n")) {
      assertEquals(zeile, zeile.replace(/[ \t]+$/, ""));
    }
  }
});
