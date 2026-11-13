// /Users/js/Projekte/Vexfit/app/vexfit/g1_wunsch_test.ts
//
// Dauerlauf 13.11.2026 – G1: „Wunsch abgeben" (Kunde ohne Konto).
// Geprüft (reine Logik, ohne Netz/DB):
//   * /wunsch speichert ohne Konto und schickt BEIDE Mails (intern + Bestätigung),
//   * Pflichtfelder fehlen → 400, nichts gespeichert,
//   * Honeypot gefüllt → still verworfen (kein Speichern, keine Mail), außen Erfolg,
//   * Spam-Grenze pro E-Mail → 429,
//   * Wegwerf-Mail → gespeichert mit Verdacht, KEINE Bestätigung an den Kontakt,
//   * 48 Stunden als Konstante im Bestätigungstext,
//   * keine Trainerdaten in der Antwort / im Bestätigungstext,
//   * wunsch.html: Überschrift, Honeypot, Einwilligung, Post-Ziel, kein Trainer-Netzaufruf,
//   * Migration + Rücknahme vorhanden.
//
// Aufruf:  deno test --allow-read g1_wunsch_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  mailWunschBestaetigung,
  WUNSCH_FRIST_STUNDEN,
  wunschGeprueft,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

interface Auf {
  mails: Mail[];
  angelegt: Record<string, unknown>[];
  spam: { email: string; ip: string }[];
}

function bau(opt: {
  spamEmail?: number;
  spamIp?: number;
  wegwerf?: Set<string>;
  ohneWunschAnlegen?: boolean;
} = {}): { a: Anschluesse; auf: Auf } {
  const auf: Auf = { mails: [], angelegt: [], spam: [] };
  const nop = () => Promise.resolve();
  const a: Anschluesse = {
    trainerNachId: () => Promise.resolve(null),
    trainerNachEmail: () => Promise.resolve(null),
    aeltesteOffeneAnfrage: () => Promise.resolve(null),
    trainerBezahltMarkieren: () => nop(),
    anfrageWeitergeleitetMarkieren: () => nop(),
    mailSenden: (m) => { auf.mails.push(m); return Promise.resolve(); },
    stripeEreignis: () => Promise.resolve(null),
    ereignisSchonVerarbeitet: () => Promise.resolve(false),
    ereignisVermerken: () => nop(),
    benutzerAusToken: () => Promise.resolve(null),
    anfragenAnzahlSeit: () => Promise.resolve(0),
    spamProEmailSeit: () => Promise.resolve(opt.spamEmail ?? 0),
    spamProIpSeit: () => Promise.resolve(opt.spamIp ?? 0),
    spamEintragVormerken: (email, ip) => { auf.spam.push({ email, ip }); return Promise.resolve(); },
    adminTrainerSetzen: () => Promise.resolve(1),
    adminZeileLoeschen: () => Promise.resolve(1),
    wegwerfDomains: () => opt.wegwerf ?? new Set<string>(),
    melden: () => {},
  };
  if (!opt.ohneWunschAnlegen) {
    a.wunschAnlegen = (felder) => { auf.angelegt.push(felder); return Promise.resolve("w-1"); };
  }
  return { a, auf };
}

function req(koerper: unknown): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/wunsch",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT },
      body: JSON.stringify(koerper),
    },
  );
}

const GUT = {
  vorname: "Lena",
  email: "lena@beispiel.at",
  land: "AT",
  plz: "5020",
  ziel: "Abnehmen",
  haeufigkeit: "2× pro Woche",
  zeiten: "Morgens, Abends",
  budget: "40–60 €",
  telefon: "Rueckruf erwuenscht",
  nachricht: "Bitte vormittags.",
  einwilligung: true,
  webseite: "", // Honeypot leer = Mensch
  utm_source: "sn.at",
  utm_campaign: "artikel-19-11",
};

Deno.test("G1: Wunsch ohne Konto wird gespeichert, beide Mails raus", async () => {
  const { a, auf } = bau();
  const res = await bearbeiten(req(GUT), a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertEquals(d.mails, 2);
  // gespeichert, ohne Konto (kein Token nötig)
  assertEquals(auf.angelegt.length, 1);
  const f = auf.angelegt[0];
  assertEquals(f.status, "neu");
  assertEquals(f.vorname, "Lena");
  assertEquals(f.email, "lena@beispiel.at");
  assertEquals(f.land, "AT");
  assertEquals(f.plz, "5020");
  assertEquals(f.ziel, "Abnehmen");
  assertEquals(f.zeiten, "Morgens, Abends");
  assertEquals(f.quelle, "sn.at");
  assertEquals(f.kampagne, "artikel-19-11");
  assertEquals(f.verdacht, null);
  // beide Mails: eine intern (office@), eine Bestätigung (an den Kunden)
  const intern = auf.mails.find((m) => m.an === "office@vexfit.app");
  const best = auf.mails.find((m) => m.an === "lena@beispiel.at");
  assert(intern, "interne Mail fehlt");
  assert(best, "Bestätigungsmail fehlt");
  assertStringIncludes(intern.betreff, "Neuer Wunsch");
  assertStringIncludes(intern.text, "Abnehmen");
  assertStringIncludes(intern.text, "sn.at");
  assertStringIncludes(best.text, "Jakob von Vexfit meldet sich");
  assertStringIncludes(best.text, "48 Stunden");
  // keine Trainerdaten in der Bestätigung
  assert(!/preis|€\/Std|trainer_id/i.test(best.text), "Bestätigung enthält Trainerdaten");
});

Deno.test("G1: Pflichtfeld fehlt → 400, nichts gespeichert, keine Mail", async () => {
  for (
    const koerper of [
      { ...GUT, vorname: "" },
      { ...GUT, email: "keine-adresse" },
      { ...GUT, land: "" },
      { ...GUT, plz: "12" },
      { ...GUT, ziel: "" },
      { ...GUT, einwilligung: false },
    ]
  ) {
    const { a, auf } = bau();
    const res = await bearbeiten(req(koerper), a);
    assertEquals(res.status, 400);
    assertEquals(auf.angelegt.length, 0);
    assertEquals(auf.mails.length, 0);
  }
});

Deno.test("G1: Honeypot gefüllt → still verworfen, kein Speichern, keine Mail, außen Erfolg", async () => {
  const { a, auf } = bau();
  const res = await bearbeiten(req({ ...GUT, webseite: "https://bot.example" }), a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertEquals(d.mails, 0);
  assertEquals(auf.angelegt.length, 0);
  assertEquals(auf.mails.length, 0);
});

Deno.test("G1: Spam-Grenze pro E-Mail → 429", async () => {
  const { a, auf } = bau({ spamEmail: 1 });
  const res = await bearbeiten(req(GUT), a);
  assertEquals(res.status, 429);
  assertEquals(auf.angelegt.length, 0);
});

Deno.test("G1: Wegwerf-Mail → gespeichert mit Verdacht, KEINE Bestätigung an den Kontakt", async () => {
  const { a, auf } = bau({ wegwerf: new Set(["wegwerf.xy"]) });
  const res = await bearbeiten(req({ ...GUT, email: "x@wegwerf.xy" }), a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertEquals(d.zur_pruefung, true);
  assertEquals(auf.angelegt.length, 1);
  assertEquals(auf.angelegt[0].verdacht, "wegwerf-mail");
  // nur die interne Mail, keine Bestätigung an die Wegwerf-Adresse
  assertEquals(auf.mails.length, 1);
  assertEquals(auf.mails[0].an, "office@vexfit.app");
  assertStringIncludes(auf.mails[0].text, "Verdacht");
});

Deno.test("G1: ohne Verdrahtung (wunschAnlegen fehlt) → 501, keine Mail", async () => {
  const { a, auf } = bau({ ohneWunschAnlegen: true });
  const res = await bearbeiten(req(GUT), a);
  assertEquals(res.status, 501);
  assertEquals(auf.mails.length, 0);
});

Deno.test("G1: 48 als Konstante und im Bestätigungstext", () => {
  assertEquals(WUNSCH_FRIST_STUNDEN, 48);
  const m = mailWunschBestaetigung({ vorname: "Tom", email: "tom@beispiel.at" });
  assertStringIncludes(m.text, "48 Stunden");
  assertStringIncludes(m.betreff, "Danke");
});

Deno.test("G1: wunschGeprueft normalisiert und begrenzt", () => {
  const g = wunschGeprueft({
    vorname: "  Mia ", email: "MIA@Beispiel.AT", land: "at", plz: "5020",
    ziel: "Muskelaufbau", einwilligung: "ja",
  });
  assert(g.ok, g.grund);
  assertEquals(g.felder?.email, "mia@beispiel.at");
  assertEquals(g.felder?.land, "AT");
  assertEquals(g.felder?.vorname, "Mia");
});

Deno.test("G1: wunsch.html – Überschrift, Honeypot, Einwilligung, Post-Ziel, kein Trainer-Netzaufruf", async () => {
  const html = await lies("./wunsch.html");
  assertStringIncludes(html, "wir finden deinen Personal Trainer in Salzburg");
  assertStringIncludes(html, 'name="webseite"');
  assertStringIncludes(html, 'id="fEinwilligung"');
  assertStringIncludes(html, "/functions/v1/vexfit-automation/wunsch");
  // Keine öffentliche Trainerliste: die Seite ruft NICHT die Trainertabelle/Sichten ab.
  assert(!/trainers_oeffentlich|trainers_vorschau|rest\/v1\/trainers/.test(html), "wunsch.html lädt Trainerdaten");
});

Deno.test("G1: Migration + Rücknahme vorhanden", async () => {
  const m = await lies("./migrations/2026-11-13-01-wuensche.sql");
  assertStringIncludes(m, "CREATE TABLE IF NOT EXISTS public.wuensche");
  assertStringIncludes(m, "ENABLE ROW LEVEL SECURITY");
  assertStringIncludes(m, "REVOKE ALL ON public.wuensche FROM anon, authenticated");
  const r = await lies("./migrations/ruecknahmen/2026-11-13-01-wuensche-ruecknahme.sql");
  assertStringIncludes(r, "DROP TABLE IF EXISTS public.wuensche");
});
