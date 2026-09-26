// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/trainer-alert/kern_test.ts
//
// Prueft die Logik des Trainer-Alerts OHNE Netz: Datenbank, PLZ-Dienst und
// SMTP sind ersetzt. Es geht keine Mail hinaus und keine Anfrage ins Netz.
//
// Aufruf:  deno test --allow-run --allow-read supabase/functions/trainer-alert/
// (--allow-run und --allow-read braucht nur die Geheimnis-Suche am Ende.)
//
// Geprueft wird gegen den gesicherten n8n-Workflow "Vexfit Trainer Alert":
// dieselbe Auswahl, dieselben Texte, dasselbe Markieren.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ABSENDER,
  type Alert,
  ALERT_SPALTEN,
  type Alertmail,
  type Anschluesse,
  bearbeiten,
  benoetigtePlz,
  betreffSaeubern,
  entfernung,
  istProbelauf,
  type Koordinate,
  mailBetreff,
  mailHtml,
  maskieren,
  profilAdresse,
  schluesselGueltig,
  sichereAdresse,
  type Trainer,
  TRAINER_SPALTEN,
  zuordnen,
} from "./kern.ts";

const SCHLUESSEL = "PLATZHALTER-TESTSCHLUESSEL";

// ---------------------------------------------------------------------------
// Ersatz fuer alles Aeussere
// ---------------------------------------------------------------------------
interface Aufzeichnung {
  gesendet: Alertmail[];
  markiert: string[];
  plzGefragt: string[];
}

function bau(opt: {
  trainer: Trainer[];
  alerts: Alert[];
  koordinaten?: Record<string, Koordinate | null>;
  smtpFehlerFuer?: (m: Alertmail) => boolean;
}): { anschluesse: Anschluesse; auf: Aufzeichnung } {
  const auf: Aufzeichnung = { gesendet: [], markiert: [], plzGefragt: [] };
  const anschluesse: Anschluesse = {
    trainerLesen: () => Promise.resolve(opt.trainer),
    alertsLesen: () => Promise.resolve(opt.alerts),
    koordinaten: (plz) => {
      auf.plzGefragt.push(plz);
      return Promise.resolve(opt.koordinaten?.[plz] ?? null);
    },
    mailSenden: (m) => {
      if (opt.smtpFehlerFuer?.(m)) {
        return Promise.reject(new Error("SMTP dicht"));
      }
      auf.gesendet.push(m);
      return Promise.resolve();
    },
    alsVerarbeitetMarkieren: (id) => {
      auf.markiert.push(id);
      return Promise.resolve();
    },
    melden: () => {},
  };
  return { anschluesse, auf };
}

function anfrage(schluessel?: string | null, abfrage = ""): Request {
  const kopf = new Headers();
  if (schluessel !== null && schluessel !== undefined) {
    kopf.set("Authorization", schluessel);
  }
  return new Request(
    `https://x.functions.supabase.co/trainer-alert${abfrage}`,
    { method: "POST", headers: kopf, body: "{}" },
  );
}

const T_WIEN: Trainer = {
  id: "t-wien",
  vorname: "Testvorname",
  nachname: "Testnachname",
  email: "trainer@beispiel.at",
  stadt: "Wien",
  plz: "1010",
  trainingsart: "Im Fitnessstudio",
  preis_stunde: 60,
  bio: "Kurze Beschreibung.",
  spezialisierungen: ["Kraft", "Ausdauer", "Reha", "Yoga"],
};

const A_WIEN: Alert = {
  id: "a-wien",
  kunden_email: "kundin@beispiel.at",
  kunden_name: "Testkundin",
  plz: "1010",
  stadt: "Wien",
  radius: 25,
};

// ---------------------------------------------------------------------------
Deno.test("Spaltenlisten und Absender stehen unveraendert wie im Workflow", () => {
  assertEquals(
    TRAINER_SPALTEN,
    "id,vorname,nachname,email,stadt,plz,trainingsart,preis_stunde,bio,spezialisierungen",
  );
  assertEquals(ALERT_SPALTEN, "id,kunden_email,kunden_name,plz,stadt,radius");
  assertEquals(ABSENDER, "vexfit.info@gmail.com");
});

// --------------------------------------------------------------- Auswahl
Deno.test("gleiche PLZ trifft, ohne den PLZ-Dienst zu fragen", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [A_WIEN] });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 200);
  assertEquals(auf.gesendet.length, 1);
  assertEquals(auf.plzGefragt, []);
});

Deno.test("andere PLZ innerhalb des Radius trifft, ausserhalb nicht", () => {
  const trainer = [{ ...T_WIEN, plz: "1010" }];
  const nah: Alert = { ...A_WIEN, id: "a-nah", plz: "1200", radius: 25 };
  const fern: Alert = {
    ...A_WIEN,
    id: "a-fern",
    kunden_email: "fern@beispiel.at",
    plz: "5020",
    radius: 25,
  };
  const koordinaten = new Map<string, Koordinate | null>([
    ["1010", { lat: 48.2083, lng: 16.3731 }], // Wien
    ["1200", { lat: 48.2400, lng: 16.3800 }], // Wien, wenige km
    ["5020", { lat: 47.8095, lng: 13.0550 }], // Salzburg, rund 250 km
  ]);
  const z = zuordnen(trainer, [nah, fern], koordinaten);
  assertEquals(z.mails.length, 1);
  assertEquals(z.mails[0].kunden_email, nah.kunden_email);
  assertEquals(z.mitEmpfaenger, ["t-wien"]);
  assertEquals(z.ohneEmpfaenger, []);
});

Deno.test("Radius des Alerts entscheidet, nicht ein fester Wert", () => {
  const koordinaten = new Map<string, Koordinate | null>([
    ["1010", { lat: 48.2083, lng: 16.3731 }],
    ["5020", { lat: 47.8095, lng: 13.0550 }],
  ]);
  const weit: Alert = { ...A_WIEN, plz: "5020", radius: 400 };
  assertEquals(zuordnen([T_WIEN], [weit], koordinaten).mails.length, 1);
  const eng: Alert = { ...A_WIEN, plz: "5020", radius: 10 };
  assertEquals(zuordnen([T_WIEN], [eng], koordinaten).mails.length, 0);
});

Deno.test("ohne Radius gilt 25 km (a.radius || 25)", () => {
  const koordinaten = new Map<string, Koordinate | null>([
    ["1010", { lat: 48.2083, lng: 16.3731 }],
    ["1200", { lat: 48.2400, lng: 16.3800 }],
    ["5020", { lat: 47.8095, lng: 13.0550 }],
  ]);
  assertEquals(
    zuordnen([T_WIEN], [{ ...A_WIEN, plz: "1200", radius: null }], koordinaten)
      .mails.length,
    1,
  );
  assertEquals(
    zuordnen([T_WIEN], [{ ...A_WIEN, plz: "5020", radius: null }], koordinaten)
      .mails.length,
    0,
  );
});

Deno.test("fehlende PLZ auf einer Seite trifft nie", () => {
  assertEquals(
    zuordnen([{ ...T_WIEN, plz: null }], [A_WIEN], new Map()).mails.length,
    0,
  );
  assertEquals(
    zuordnen([T_WIEN], [{ ...A_WIEN, plz: null }], new Map()).mails.length,
    0,
  );
});

Deno.test("unbekannte PLZ (PLZ-Dienst liefert nichts) trifft nicht", () => {
  const koordinaten = new Map<string, Koordinate | null>([["1010", null], [
    "9999",
    null,
  ]]);
  assertEquals(
    zuordnen([T_WIEN], [{ ...A_WIEN, plz: "9999" }], koordinaten).mails.length,
    0,
  );
});

Deno.test("nur ungleiche PLZ-Paare muessen aufgeloest werden", () => {
  assertEquals(benoetigtePlz([T_WIEN], [A_WIEN]), []);
  const gemischt = benoetigtePlz([T_WIEN], [A_WIEN, {
    ...A_WIEN,
    id: "a2",
    plz: "1200",
  }]).sort();
  assertEquals(gemischt, ["1010", "1200"]);
});

Deno.test("ohne aktive Alerts passiert nichts — auch kein Markieren", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [] });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 200);
  assertEquals(auf.gesendet, []);
  assertEquals(auf.markiert, []);
});

Deno.test("Trainer ohne Treffer wird markiert, bekommt aber keine Mail", async () => {
  const { anschluesse, auf } = bau({
    trainer: [T_WIEN, { ...T_WIEN, id: "t-ohne", plz: "5020" }],
    alerts: [A_WIEN],
    koordinaten: {
      "1010": { lat: 48.2083, lng: 16.3731 },
      "5020": { lat: 47.8095, lng: 13.0550 },
    },
  });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 200);
  assertEquals(auf.gesendet.map((m) => m.trainer_id), ["t-wien"]);
  assertEquals(auf.markiert.sort(), ["t-ohne", "t-wien"]);
});

Deno.test("Entfernung: gleicher Punkt 0 km, Wien–Salzburg rund 250 km", () => {
  const wien = { lat: 48.2083, lng: 16.3731 };
  const salzburg = { lat: 47.8095, lng: 13.0550 };
  assertEquals(Math.round(entfernung(wien, wien)), 0);
  const d = entfernung(wien, salzburg);
  assert(d > 240 && d < 260, `Entfernung war ${d}`);
});

// --------------------------------------------------------------- Texte
Deno.test("Betreff und Empfaenger entsprechen dem Workflow", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [A_WIEN] });
  await bearbeiten(anfrage(`Bearer ${SCHLUESSEL}`), SCHLUESSEL, anschluesse);
  const m = auf.gesendet[0];
  assertEquals(m.kunden_email, "kundin@beispiel.at");
  assertEquals(
    mailBetreff(m),
    "🎉 Neuer Trainer in deiner Nähe: Testvorname Testnachname",
  );
});

Deno.test("HTML enthaelt Anrede, Trainerdaten, Preis und den Profil-Link", () => {
  const z = zuordnen([T_WIEN], [A_WIEN], new Map());
  const html = mailHtml(z.mails[0]);
  assertStringIncludes(html, "Hallo Testkundin! 👋");
  assertStringIncludes(
    html,
    "Ein neuer Trainer ist jetzt in deiner Nähe verfügbar!",
  );
  assertStringIncludes(html, "Testvorname Testnachname");
  assertStringIncludes(html, "Im Fitnessstudio · 1010 Wien");
  assertStringIncludes(html, "ab €60");
  assertStringIncludes(html, "https://vexfit.app/profil.html?id=t-wien");
  assertStringIncludes(
    html,
    "Du erhältst diese E-Mail, weil du Trainer-Benachrichtigungen",
  );
});

Deno.test("hoechstens drei Spezialisierungen, Bio auf 200 Zeichen gekuerzt", () => {
  const lang = { ...T_WIEN, bio: "x".repeat(500) };
  const z = zuordnen([lang], [A_WIEN], new Map());
  assertEquals(z.mails[0].trainer_spez, "Kraft · Ausdauer · Reha");
  assertEquals(z.mails[0].trainer_bio.length, 200);
});

Deno.test('ohne Kundenname steht nur "Hallo!", leere Felder entfallen', () => {
  const schmal: Trainer = {
    id: "t-schmal",
    vorname: "A",
    nachname: "B",
    stadt: "",
    plz: "1010",
    trainingsart: "",
    preis_stunde: null,
    bio: null,
    spezialisierungen: null,
  };
  const z = zuordnen([schmal], [{ ...A_WIEN, kunden_name: null }], new Map());
  const html = mailHtml(z.mails[0]);
  assertStringIncludes(html, "Hallo! 👋");
  assert(!html.includes("ab €"), "Preiszeile darf ohne Preis fehlen");
});

// --------------------------------------------------------------- Doppelversand
Deno.test("zweiter Lauf direkt danach verschickt nichts doppelt", async () => {
  // Die Datenbank ist die Sperre: nach dem Markieren liefert der Filter
  // alert_sent=eq.false den Trainer nicht mehr. Hier nachgebaut.
  let markiertInDb = false;
  const anschluesse: Anschluesse = {
    trainerLesen: () => Promise.resolve(markiertInDb ? [] : [T_WIEN]),
    alertsLesen: () => Promise.resolve([A_WIEN]),
    koordinaten: () => Promise.resolve(null),
    mailSenden: () => Promise.resolve(),
    alsVerarbeitetMarkieren: () => {
      markiertInDb = true;
      return Promise.resolve();
    },
    melden: () => {},
  };
  const zaehler: number[] = [];
  for (let lauf = 0; lauf < 2; lauf++) {
    const antwort = await bearbeiten(
      anfrage(`Bearer ${SCHLUESSEL}`),
      SCHLUESSEL,
      anschluesse,
    );
    zaehler.push((await antwort.json()).mails_gesendet);
  }
  assertEquals(zaehler, [1, 0]);
});

Deno.test("derselbe Trainer wird je Lauf nur einmal markiert, auch bei zwei Treffern", async () => {
  const { anschluesse, auf } = bau({
    trainer: [T_WIEN],
    alerts: [A_WIEN, {
      ...A_WIEN,
      id: "a2",
      kunden_email: "zweite@beispiel.at",
    }],
  });
  await bearbeiten(anfrage(`Bearer ${SCHLUESSEL}`), SCHLUESSEL, anschluesse);
  assertEquals(auf.gesendet.length, 2);
  assertEquals(auf.markiert, ["t-wien"]);
});

// --------------------------------------------------------------- Schluessel
Deno.test("ohne Authorization-Kopf → 401", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [A_WIEN] });
  const antwort = await bearbeiten(anfrage(null), SCHLUESSEL, anschluesse);
  assertEquals(antwort.status, 401);
  assertEquals(auf.gesendet, []);
  assertEquals(auf.markiert, []);
});

Deno.test("falscher Schluessel → 401", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [A_WIEN] });
  const antwort = await bearbeiten(
    anfrage("Bearer FALSCH"),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 401);
  assertEquals(auf.gesendet, []);
});

Deno.test('Schluessel ohne "Bearer", leerer Kopf oder fehlender Sollwert → nicht gueltig', () => {
  assertEquals(schluesselGueltig(`Bearer ${SCHLUESSEL}`, SCHLUESSEL), true);
  assertEquals(schluesselGueltig(SCHLUESSEL, SCHLUESSEL), false);
  assertEquals(schluesselGueltig("", SCHLUESSEL), false);
  assertEquals(schluesselGueltig(null, SCHLUESSEL), false);
  assertEquals(schluesselGueltig(`Basic ${SCHLUESSEL}`, SCHLUESSEL), false);
  assertEquals(schluesselGueltig(`Bearer ${SCHLUESSEL}x`, SCHLUESSEL), false);
  // Ist in der Umgebung nichts hinterlegt, ist NICHTS gueltig.
  assertEquals(schluesselGueltig(`Bearer ${SCHLUESSEL}`, undefined), false);
  assertEquals(schluesselGueltig(`Bearer ${SCHLUESSEL}`, ""), false);
});

// --------------------------------------------------------------- SMTP-Fehler
Deno.test("SMTP-Fehler → 502 und nichts wird als erledigt markiert", async () => {
  const { anschluesse, auf } = bau({
    trainer: [T_WIEN],
    alerts: [A_WIEN],
    smtpFehlerFuer: () => true,
  });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 502);
  assertEquals(auf.gesendet, []);
  assertEquals(auf.markiert, []);
  const d = await antwort.json();
  assertEquals(d.mails_fehlgeschlagen, 1);
  assertEquals(d.markiert, 0);
});

Deno.test("faellt eine von zwei Mails aus, bleibt nur der betroffene Trainer offen", async () => {
  const { anschluesse, auf } = bau({
    trainer: [T_WIEN, { ...T_WIEN, id: "t-zwei" }],
    alerts: [A_WIEN],
    smtpFehlerFuer: (m) => m.trainer_id === "t-zwei",
  });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 502);
  assertEquals(auf.gesendet.map((m) => m.trainer_id), ["t-wien"]);
  assertEquals(auf.markiert, ["t-wien"]);
});

Deno.test("ohne neue Trainer wird nichts gelesen, gesendet oder markiert", async () => {
  const { anschluesse, auf } = bau({ trainer: [], alerts: [A_WIEN] });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 200);
  assertEquals(auf.gesendet, []);
  assertEquals(auf.markiert, []);
});

// ---------------------------------------------------------------------------
// Maskieren (Absicherung vom 26.09.2026)
// ---------------------------------------------------------------------------
Deno.test("maskieren ersetzt genau die fuenf Sonderzeichen", () => {
  assertEquals(maskieren(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  assertEquals(maskieren("harmloser Text"), "harmloser Text");
  assertEquals(maskieren(null), "");
  assertEquals(maskieren(undefined), "");
  assertEquals(maskieren(60), "60");
  // Erst maskieren, dann nichts doppelt: das & des Ersatzes bleibt stehen.
  assertEquals(maskieren("a & b"), "a &amp; b");
});

Deno.test("Trainername mit Skript, Verweis, Anfuehrungszeichen und & wird nur maskiert eingesetzt", () => {
  const boes: Trainer = {
    ...T_WIEN,
    vorname: '<script>alert("weg")</script>',
    nachname: `<a href="https://beispiel.invalid">klick</a> & 'so'`,
    bio: "<img src=x onerror=alert(1)>",
    stadt: "Wien<br>Zweitzeile",
    plz: '1010"><b>',
    trainingsart: "Studio & Freiluft",
    preis_stunde: '60"><script>',
    spezialisierungen: ["<b>Kraft</b>", "A & B"],
  };
  // Der Alert hat dieselbe (absichtlich verunstaltete) PLZ, damit der Treffer
  // ueber die gleiche PLZ zustande kommt und kein PLZ-Dienst noetig ist.
  const alert: Alert = { ...A_WIEN, plz: boes.plz as string };
  const html = mailHtml(zuordnen([boes], [alert], new Map()).mails[0]);

  // Kein einziges rohes Steuerzeichen aus den Daten darf durchkommen.
  assert(!html.includes("<script>"), "<script> steht roh im HTML");
  assert(!html.includes("</script>"), "</script> steht roh im HTML");
  assert(!html.includes("<img"), "<img steht roh im HTML");
  // `onerror=` darf als TEXT vorkommen (die spitzen Klammern sind maskiert),
  // aber in keinem echten Tag. Deshalb jedes Tag einzeln ansehen.
  const tags = html.match(/<[^>]*>/g) ?? [];
  for (const tag of tags) {
    for (
      const boese of [
        "onerror",
        "onmouseover",
        "onload",
        "script",
        "javascript:",
      ]
    ) {
      assert(
        !tag.toLowerCase().includes(boese),
        `Tag mit ${boese}: ${tag.slice(0, 60)}`,
      );
    }
  }
  assert(!html.includes("<br>"), "<br> steht roh im HTML");
  assert(!html.includes("<b>"), "<b> steht roh im HTML");
  assert(
    !html.includes('<a href="https://beispiel.invalid"'),
    "fremder Verweis steht roh im HTML",
  );

  // Stattdessen maskiert und damit als Text sichtbar.
  assertStringIncludes(
    html,
    "&lt;script&gt;alert(&quot;weg&quot;)&lt;/script&gt;",
  );
  assertStringIncludes(
    html,
    "&lt;a href=&quot;https://beispiel.invalid&quot;&gt;klick&lt;/a&gt; &amp; &#39;so&#39;",
  );
  assertStringIncludes(html, "&lt;img src=x onerror=alert(1)&gt;");
  assertStringIncludes(html, "Wien&lt;br&gt;Zweitzeile");
  assertStringIncludes(html, "Studio &amp; Freiluft");
  assertStringIncludes(html, "&lt;b&gt;Kraft&lt;/b&gt; · A &amp; B");

  // Genau ein <a> bleibt: der eigene Knopf.
  assertEquals(html.match(/<a\s/g)?.length, 1);
});

Deno.test("Kundenname wird ebenfalls maskiert", () => {
  const html = mailHtml(
    zuordnen([T_WIEN], [{ ...A_WIEN, kunden_name: "<b>Eva</b>" }], new Map())
      .mails[0],
  );
  assertStringIncludes(html, "Hallo &lt;b&gt;Eva&lt;/b&gt;! 👋");
  assert(!html.includes("<b>Eva</b>"));
});

Deno.test("href: nur https:// wird uebernommen, javascript: und http:// fallen weg", () => {
  assertEquals(
    sichereAdresse("https://vexfit.app/profil.html?id=1"),
    "https://vexfit.app/profil.html?id=1",
  );
  assertEquals(sichereAdresse("HTTPS://vexfit.app/x"), "HTTPS://vexfit.app/x");
  assertEquals(sichereAdresse("http://vexfit.app/x"), null);
  assertEquals(sichereAdresse("javascript:alert(1)"), null);
  assertEquals(sichereAdresse("JavaScript:alert(1)"), null);
  assertEquals(sichereAdresse("data:text/html,<script>"), null);
  assertEquals(sichereAdresse("//vexfit.app/x"), null);
  assertEquals(sichereAdresse(""), null);
  assertEquals(sichereAdresse("https://vexfit.app/\nSet-Cookie: x"), null);
});

Deno.test("die Profiladresse bleibt https und kodiert die Kennung", () => {
  assertEquals(
    profilAdresse("t-wien"),
    "https://vexfit.app/profil.html?id=t-wien",
  );
  assertEquals(
    profilAdresse('x" onmouseover="alert(1)'),
    "https://vexfit.app/profil.html?id=x%22%20onmouseover%3D%22alert(1)",
  );
  const html = mailHtml(
    zuordnen(
      [{ ...T_WIEN, id: 'x" onmouseover="alert(1)' }],
      [A_WIEN],
      new Map(),
    ).mails[0],
  );
  assert(
    !html.includes('onmouseover="alert(1)"'),
    "Attribut wurde eingeschleust",
  );
  assertStringIncludes(
    html,
    'href="https://vexfit.app/profil.html?id=x%22%20onmouseover%3D%22alert(1)"',
  );
});

Deno.test("ohne zulaessige Adresse entfaellt der Knopf ganz", () => {
  // profilAdresse liefert immer https; hier wird die Weiche selbst geprueft.
  assertEquals(sichereAdresse("ftp://vexfit.app"), null);
  const html = mailHtml(zuordnen([T_WIEN], [A_WIEN], new Map()).mails[0]);
  assertStringIncludes(html, "JETZT ANFRAGEN");
  assertEquals(html.match(/href=/g)?.length, 1);
});

Deno.test("Betreff: Zeilenumbrueche im Namen kommen nicht in die Kopfzeile", () => {
  const boes = {
    ...T_WIEN,
    vorname: "Eva\r\nBcc: fremd@beispiel.invalid",
    nachname: "M\nX",
  };
  const betreff = mailBetreff(zuordnen([boes], [A_WIEN], new Map()).mails[0]);
  assert(!betreff.includes("\n"), "Betreff enthaelt noch \\n");
  assert(!betreff.includes("\r"), "Betreff enthaelt noch \\r");
  assertEquals(
    betreff,
    "🎉 Neuer Trainer in deiner Nähe: Eva Bcc: fremd@beispiel.invalid M X",
  );
  // Der normale Fall bleibt Zeichen fuer Zeichen derselbe wie vorher.
  assertEquals(
    mailBetreff(zuordnen([T_WIEN], [A_WIEN], new Map()).mails[0]),
    "🎉 Neuer Trainer in deiner Nähe: Testvorname Testnachname",
  );
});

Deno.test("betreffSaeubern fasst Steuerzeichen zu einem Leerzeichen zusammen", () => {
  assertEquals(betreffSaeubern("a\r\n\r\nb"), "a b");
  assertEquals(betreffSaeubern("a\tb"), "a b");
  assertEquals(betreffSaeubern("  a  b  "), "a b");
  assertEquals(betreffSaeubern("ohne Umbruch"), "ohne Umbruch");
});

// ---------------------------------------------------------------------------
// Probelauf
// ---------------------------------------------------------------------------
Deno.test("istProbelauf erkennt den Parameter, egal mit welchem Wert", () => {
  const u = "https://x.functions.supabase.co/trainer-alert";
  assertEquals(istProbelauf(`${u}?probelauf=1`), true);
  assertEquals(istProbelauf(`${u}?probelauf=`), true);
  assertEquals(istProbelauf(`${u}?probelauf=ja`), true);
  assertEquals(istProbelauf(`${u}?a=1&probelauf=1`), true);
  assertEquals(istProbelauf(u), false);
  assertEquals(istProbelauf(`${u}?anderes=1`), false);
  assertEquals(istProbelauf("keine Adresse"), false);
});

Deno.test("Probelauf: kein SMTP-Aufruf, kein Schreiben auf trainers", async () => {
  const { anschluesse, auf } = bau({
    trainer: [T_WIEN, { ...T_WIEN, id: "t-ohne", plz: "5020" }],
    alerts: [A_WIEN],
    koordinaten: {
      "1010": { lat: 48.2083, lng: 16.3731 },
      "5020": { lat: 47.8095, lng: 13.0550 },
    },
  });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`, "?probelauf=1"),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 200);
  assertEquals(auf.gesendet, [], "es wurde versendet");
  assertEquals(auf.markiert, [], "es wurde markiert");

  const d = await antwort.json();
  assertEquals(d.probelauf, true);
  assertEquals(d.trainer_gelesen, 2);
  assertEquals(d.alerts_gelesen, 1);
  assertEquals(d.mails_wuerden_gesendet, 1);
  assertEquals(d.mails.length, 1);
  assertEquals(d.mails[0].trainer_id, "t-wien");
  assertEquals(d.mails[0].alert_id, "a-wien");
  assertEquals(d.mails[0].entfernung_km, null); // gleiche PLZ
});

Deno.test("Probelauf: Antwort enthaelt keine Adresse und keinen Namen", async () => {
  const { anschluesse } = bau({
    trainer: [T_WIEN],
    alerts: [A_WIEN, {
      ...A_WIEN,
      id: "a-nah",
      kunden_email: "zweite@beispiel.at",
      plz: "1200",
    }],
    koordinaten: {
      "1010": { lat: 48.2083, lng: 16.3731 },
      "1200": { lat: 48.2400, lng: 16.3800 },
    },
  });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`, "?probelauf=1"),
    SCHLUESSEL,
    anschluesse,
  );
  const roh = JSON.stringify(await antwort.json());
  assert(!roh.includes("@"), `Adresse in der Antwort: ${roh}`);
  for (
    const wort of [
      "Testvorname",
      "Testnachname",
      "Testkundin",
      "kundin",
      "zweite",
      "Wien",
    ]
  ) {
    assert(!roh.includes(wort), `"${wort}" steht in der Antwort: ${roh}`);
  }
  // Die Entfernung des zweiten Treffers ist eine Zahl in km.
  const d = JSON.parse(roh);
  assertEquals(d.mails.length, 2);
  const mitKm = d.mails.find((m: { entfernung_km: number | null }) =>
    m.entfernung_km !== null
  );
  assert(
    mitKm && mitKm.entfernung_km > 0 && mitKm.entfernung_km < 25,
    `km war ${mitKm?.entfernung_km}`,
  );
});

Deno.test("Probelauf ohne neue Trainer antwortet mit Nullen", async () => {
  const { anschluesse, auf } = bau({ trainer: [], alerts: [A_WIEN] });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`, "?probelauf=1"),
    SCHLUESSEL,
    anschluesse,
  );
  const d = await antwort.json();
  assertEquals(antwort.status, 200);
  assertEquals(d, {
    probelauf: true,
    trainer_gelesen: 0,
    alerts_gelesen: 0,
    mails_wuerden_gesendet: 0,
    mails: [],
  });
  assertEquals(auf.gesendet, []);
  assertEquals(auf.markiert, []);
});

Deno.test("Probelauf braucht trotzdem einen gueltigen Schluessel", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [A_WIEN] });
  const antwort = await bearbeiten(
    anfrage("Bearer FALSCH", "?probelauf=1"),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 401);
  assertEquals(auf.gesendet, []);
  assertEquals(auf.markiert, []);
});

Deno.test("ohne probelauf-Parameter wird weiterhin versendet und markiert", async () => {
  const { anschluesse, auf } = bau({ trainer: [T_WIEN], alerts: [A_WIEN] });
  const antwort = await bearbeiten(
    anfrage(`Bearer ${SCHLUESSEL}`),
    SCHLUESSEL,
    anschluesse,
  );
  assertEquals(antwort.status, 200);
  assertEquals(auf.gesendet.length, 1);
  assertEquals(auf.markiert, ["t-wien"]);
  const d = await antwort.json();
  assertEquals(d.probelauf, undefined);
  assertEquals(d.mails_gesendet, 1);
  assertEquals(d.markiert, 1);
});
