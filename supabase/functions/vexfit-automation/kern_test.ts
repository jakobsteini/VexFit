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
  LINK_ERSTE,
  LINK_WEITERE,
  type Mail,
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
  weitergeleitetMarkiert: string[];
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
};

function bau(opt: {
  trainer?: Trainer | null;
  anfrage?: Anfrage | null;
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
  const stripeClient = new Stripe("sk_test_nicht_benutzt", {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const krypto = Stripe.createSubtleCryptoProvider();

  const anschluesse: Anschluesse = {
    trainerNachId: () =>
      Promise.resolve(opt.trainer === undefined ? T_STANDARD : opt.trainer),
    trainerNachEmail: () =>
      Promise.resolve(opt.trainer === undefined ? T_STANDARD : opt.trainer),
    offeneAnfrage: () =>
      Promise.resolve(opt.anfrage === undefined ? A_STANDARD : opt.anfrage),
    trainerBezahltMarkieren: (email) => {
      auf.bezahltMarkiert.push(email);
      return Promise.resolve();
    },
    anfragenWeitergeleitetMarkieren: (id) => {
      auf.weitergeleitetMarkiert.push(id);
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
  assertEquals(m.betreff, "🆕 Neuer Trainer: Eva Muster");
  assertEquals(
    m.text,
    "Neuer Trainer registriert! 🆕\n\n" +
      "👤 Name: Eva Muster\n📧 Email: eva@beispiel.at\n📍 Stadt: Wien\n" +
      "💪 Trainingsart: Im Fitnessstudio\n\n" +
      "→ Jetzt aktivieren:\nhttps://vexfit.app/admin.html",
  );
  // Es wird nichts in die Datenbank geschrieben.
  assertEquals(auf.bezahltMarkiert, []);
  assertEquals(auf.weitergeleitetMarkiert, []);
});

Deno.test("/neuer-trainer: die Passwortzeile kommt nur aus dem Secret", async () => {
  const ohne = bau();
  await bearbeiten(
    anfrage("neuer-trainer", { email: "a@b.de" }, VOM_BROWSER),
    ohne.anschluesse,
  );
  assert(
    !ohne.auf.mails[0].text.includes("Passwort:"),
    "Zeile steht da, obwohl kein Secret gesetzt ist",
  );

  const mit = bau({ adminHinweis: "PLATZHALTER-AUS-DEM-SECRET" });
  await bearbeiten(
    anfrage("neuer-trainer", { email: "a@b.de" }, VOM_BROWSER),
    mit.anschluesse,
  );
  assertStringIncludes(
    mit.auf.mails[0].text,
    "\nPasswort: PLATZHALTER-AUS-DEM-SECRET",
  );
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
  assertEquals(auf.mails[0].betreff, "🎯 Neuer Kunde: Eva Muster");
  assertEquals(
    auf.mails[0].text,
    "Neuer Kunde registriert! 🎯\n\n" +
      "👤 Name: Eva Muster\n📧 Email: eva@beispiel.at\n📍 Stadt: Wien\n🎯 Ziel: Abnehmen\n\n" +
      "→ Supabase:\nhttps://supabase.com/dashboard/project/hbapzwxdehfgnputrfjf",
  );
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
  assertEquals(
    m.betreff,
    "🎉 Erste Kunden-Anfrage auf Vexfit – Abo aktivieren!",
  );
  assertStringIncludes(m.text, "Hi Testvorname,");
  assertStringIncludes(
    m.text,
    "du hast deine erste Kunden-Anfrage erhalten! 🚀",
  );
  assertStringIncludes(m.text, "👤 Kunde: Testkundin");
  assertStringIncludes(m.text, "🎯 Ziel: Abnehmen");
  assertStringIncludes(m.text, "💬 Nachricht: Hallo!");
  assertStringIncludes(m.text, LINK_ERSTE);
  assertStringIncludes(m.text, "€49,99/Monat · Monatlich kündbar");
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
  assertEquals(
    m.betreff,
    "🎉 Neue Kunden-Anfrage auf Vexfit – Jetzt freischalten!",
  );
  assertStringIncludes(m.text, "du hast eine neue Kunden-Anfrage! 🚀");
  assertStringIncludes(m.text, "Einmalig freischalten für €9,99:");
  assertStringIncludes(m.text, LINK_WEITERE);
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

Deno.test("/neue-anfrage: die Feldnamen von profil.html kommen im Text leer an (wie im Workflow)", async () => {
  // profil.html schickt kunde_name/kunde_ziel/kunde_nachricht, der Workflow
  // liest kunden_name/ziel/nachricht. Das ist unveraendert uebernommen.
  const { anschluesse, auf } = bau();
  await bearbeiten(
    anfrage("neue-anfrage", {
      trainer_id: "t-1",
      trainer_name: "Testvorname Testnachname",
      kunde_name: "Eva",
      kunde_email: "eva@beispiel.at",
      kunde_ziel: "Abnehmen",
      kunde_nachricht: "Hallo!",
    }, VOM_BROWSER),
    anschluesse,
  );
  assertStringIncludes(auf.mails[0].text, "👤 Kunde: \n");
  assertStringIncludes(auf.mails[0].text, "🎯 Ziel: \n");
  assert(
    !auf.mails[0].text.includes("Eva"),
    "Wert aus einem anderen Feldnamen wurde eingesetzt",
  );
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
Deno.test("HTML im Namen bleibt Text — die Mails des Workflows sind Textmails", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    anfrage("neuer-trainer", {
      email: "a@b.de",
      vorname: "<b>Eva</b>",
      nachname: "A & B",
    }, VOM_BROWSER),
    anschluesse,
  );
  // Kein HTML-Teil, deshalb auch keine Maskierung: der Text bleibt, wie er ist.
  assertStringIncludes(auf.mails[0].text, "👤 Name: <b>Eva</b> A & B");
  assertEquals(Object.keys(auf.mails[0]).sort(), ["an", "betreff", "text"]);
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
  assertEquals(b, "🆕 Neuer Trainer: Eva Bcc: fremd@beispiel.invalid M");
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
  assertEquals(auf.weitergeleitetMarkiert, ["t-1"]);
  assertEquals(auf.vermerkt, ["evt_1"]);
  assertEquals(auf.mails.length, 2);

  const anTrainer = auf.mails[0];
  assertEquals(anTrainer.an, "trainer@beispiel.at");
  assertEquals(
    anTrainer.betreff,
    "✅ Zahlung bestätigt – Hier sind deine Kunden-Daten!",
  );
  assertStringIncludes(anTrainer.text, "Hi Testvorname,");
  assertStringIncludes(anTrainer.text, "👤 Name: Testkundin");
  assertStringIncludes(anTrainer.text, "📧 Email: kundin@beispiel.at");
  assertStringIncludes(anTrainer.text, "🎯 Ziel: Abnehmen");
  assertStringIncludes(anTrainer.text, "💬 Nachricht: Ich moechte starten.");

  const anJakob = auf.mails[1];
  assertEquals(anJakob.an, "vexfit.info@gmail.com");
  assertEquals(anJakob.betreff, "💰 Zahlung: trainer@beispiel.at");
  assertStringIncludes(anJakob.text, "👤 Trainer: Testvorname Testnachname");
  assertStringIncludes(anJakob.text, "💶 Betrag: 49.99€");
  assertStringIncludes(anJakob.text, "→ Admin: https://vexfit.app/admin.html");
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

Deno.test("Stripe: kein Trainer zur Zahleradresse → nichts markiert, Ereignis vermerkt", async () => {
  const { anschluesse, auf } = bau({ trainer: null });
  const a = await bearbeiten(
    await stripeAnfrage(zahlung("evt_ohne_trainer")),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals(auf.mails, []);
  assertEquals(auf.bezahltMarkiert, []);
  assertEquals(auf.vermerkt, ["evt_ohne_trainer"]);
});

Deno.test("Stripe: keine offene Anfrage → gar nichts, auch nicht als bezahlt markiert (wie im Workflow)", async () => {
  const { anschluesse, auf } = bau({ anfrage: null });
  const a = await bearbeiten(
    await stripeAnfrage(zahlung("evt_ohne_anfrage")),
    anschluesse,
  );
  assertEquals(a.status, 200);
  assertEquals((await a.json()).uebersprungen, "keine offene Anfrage");
  assertEquals(auf.mails, []);
  assertEquals(
    auf.bezahltMarkiert,
    [],
    "im Workflow laeuft der Zweig hier nicht weiter",
  );
  assertEquals(auf.weitergeleitetMarkiert, []);
});

Deno.test("Stripe: Betrag wird wie im Workflow durch 100 geteilt", async () => {
  const { anschluesse, auf } = bau();
  await bearbeiten(
    await stripeAnfrage(zahlung("evt_betrag", "trainer@beispiel.at", 999)),
    anschluesse,
  );
  assertStringIncludes(auf.mails[1].text, "💶 Betrag: 9.99€");
});
