// /Users/js/Projekte/Vexfit/app/vexfit/g2_wuensche_test.ts
//
// Dauerlauf 13.11.2026 – G2: Verwaltung „Wünsche" + Vermittlung.
// Geprüft (reine Logik, ohne Netz/DB):
//   * wuensche_liste nur für Admin + aal2 (401/403 sonst),
//   * wunschTrainerVorschlaege: ≤ 25 km, inkl. noch nicht freigegebener (markiert),
//     mit Entfernung und x/8, nach Entfernung sortiert,
//   * wunsch_trainer über die Edge-Aktion liefert die Vorschläge,
//   * wunsch_an_trainer legt eine Anfrage an, schickt Trainer- + interne Mail,
//     setzt den Wunsch auf an_trainer_gesendet,
//   * Integration Wunsch → Anfrage → Annahme (Stripe checkout, gestubbt) →
//     bestehende Zahlungslogik liefert die Kundendaten an den Trainer,
//   * wunsch_kein_trainer: Mail + Vormerkung + Status kein_trainer,
//   * Verwaltungs-UI + index.ts verdrahtet.
//
// Aufruf:  deno test --allow-read g2_wuensche_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  type StripeEreignis,
  wunschTrainerVorschlaege,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const T_TRAINER = {
  id: "t-1", vorname: "Max", nachname: "Berger", email: "max@beispiel.at",
  stripe_bezahlt: false, studio_standort_id: null,
};

interface Store {
  mails: Mail[];
  anfragen: Record<string, unknown>[];
  wuensche: Map<string, Record<string, unknown>>;
  wunschUpdates: { id: string; felder: Record<string, unknown> }[];
  vormerkungen: Record<string, unknown>[];
  bezahlt: string[];
}

function bau(opt: {
  nutzer?: { id: string; email: string; aal?: string | null } | null;
  kandidaten?: Record<string, unknown>[];
  mitte?: { ort: string | null; lat: number; lng: number } | null;
  trainer?: typeof T_TRAINER | null;
  ereignis?: StripeEreignis | null;
  wunsch?: Record<string, unknown>;
} = {}): { a: Anschluesse; s: Store } {
  const s: Store = { mails: [], anfragen: [], wuensche: new Map(), wunschUpdates: [], vormerkungen: [], bezahlt: [] };
  const wunsch = opt.wunsch ?? {
    id: "w-1", status: "neu", vorname: "Lena", email: "lena@beispiel.at",
    telefon: "", nachricht: "Bitte vormittags.", land: "AT", plz: "5020",
    stadt: "Salzburg", ziel: "Abnehmen", erstellt_am: new Date().toISOString(),
  };
  s.wuensche.set(String(wunsch.id), wunsch);
  let n = 0;
  const trainer = opt.trainer === undefined ? T_TRAINER : opt.trainer;
  const a: Anschluesse = {
    trainerNachId: () => Promise.resolve(trainer as never),
    trainerNachEmail: () => Promise.resolve(trainer as never),
    aeltesteOffeneAnfrage: (tid) => {
      const offen = s.anfragen
        .filter((x) => x.trainer_id === tid && x.weitergeleitet !== true && x.status !== "abgelehnt")
        .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
      return Promise.resolve((offen[0] as never) ?? null);
    },
    trainerBezahltMarkieren: (email) => { s.bezahlt.push(email); return Promise.resolve(); },
    anfrageWeitergeleitetMarkieren: (id) => {
      const an = s.anfragen.find((x) => x.id === id); if (an) an.weitergeleitet = true; return Promise.resolve();
    },
    mailSenden: (m) => { s.mails.push(m); return Promise.resolve(); },
    stripeEreignis: () => Promise.resolve(opt.ereignis ?? null),
    ereignisSchonVerarbeitet: () => Promise.resolve(false),
    ereignisVermerken: () => Promise.resolve(),
    benutzerAusToken: () => Promise.resolve(
      opt.nutzer === undefined ? { id: ADMIN_ID, email: "admin@vexfit.app", aal: "aal2" } : opt.nutzer,
    ),
    anfragenAnzahlSeit: () => Promise.resolve(0),
    spamProEmailSeit: () => Promise.resolve(0),
    spamProIpSeit: () => Promise.resolve(0),
    spamEintragVormerken: () => Promise.resolve(),
    adminTrainerSetzen: () => Promise.resolve(1),
    adminZeileLoeschen: () => Promise.resolve(1),
    // G2
    wuenscheListe: () => Promise.resolve(Array.from(s.wuensche.values()) as never),
    wunschNachId: (id) => Promise.resolve((s.wuensche.get(id) as never) ?? null),
    wunschSetzen: (id, felder) => {
      s.wunschUpdates.push({ id, felder });
      const w = s.wuensche.get(id); if (w) Object.assign(w, felder);
      return Promise.resolve(1);
    },
    anfrageAnlegen: (felder) => {
      const id = "a-" + (++n);
      s.anfragen.push({ id, created_at: new Date(Date.now() + n).toISOString(), ...felder });
      return Promise.resolve(id);
    },
    trainerAlleFuerVermittlung: () => Promise.resolve(opt.kandidaten ?? []),
    wartelisteVormerken: (felder) => { s.vormerkungen.push(felder); return Promise.resolve(); },
    plzOrtLesen: () => Promise.resolve(opt.mitte ?? null),
    melden: () => {},
  };
  return { a, s };
}

function admin(body: unknown): Request {
  return new Request(
    "https://x.supabase.co/functions/v1/vexfit-automation/admin-aktion",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" },
      body: JSON.stringify(body),
    },
  );
}

// ── Matching (rein) ──
Deno.test("G2: wunschTrainerVorschlaege – ≤25 km, inkl. nicht freigegebener, sortiert, x/8", () => {
  const mitte = { lat: 47.80, lng: 13.04 }; // Salzburg
  const kandidaten = [
    { id: "nah-aktiv", vorname: "A", nachname: "Nah", lat: 47.80, lng: 13.05, aktiv: true, verifiziert: true,
      avatar_url: "/avatars/a.jpg", trainingsart: "Studio", trainingsort: "vor_ort", preis_stunde: 50, bio: "Langer Text über mich hier.", erfahrung: "5 Jahre", spezialisierungen: ["Abnehmen"], telefon: "+43 1" },
    { id: "nah-inaktiv", vorname: "B", nachname: "Neu", lat: 47.81, lng: 13.06, aktiv: false, verifiziert: false,
      trainingsort: "beides", preis_stunde: 0, bio: "", spezialisierungen: [] },
    { id: "fern", vorname: "C", nachname: "Fern", lat: 48.21, lng: 16.37, aktiv: true }, // Wien, ~250 km
    { id: "ohne-koord", vorname: "D", nachname: "Ohne", lat: null, lng: null, aktiv: true },
  ];
  const vs = wunschTrainerVorschlaege(mitte, kandidaten, 25);
  const ids = vs.map((v) => v.id);
  assertEquals(ids, ["nah-aktiv", "nah-inaktiv"]); // fern + ohne-koord raus, nach Entfernung sortiert
  const aktiv = vs.find((v) => v.id === "nah-aktiv");
  assertEquals(aktiv?.aktiv, true);
  assertEquals(aktiv?.erfuellt, 8); // alle 8 Felder gefüllt
  const inaktiv = vs.find((v) => v.id === "nah-inaktiv");
  assertEquals(inaktiv?.aktiv, false); // noch nicht freigegeben, markiert
  assert((inaktiv?.erfuellt ?? 9) < 8);
});

// ── Zugriff ──
Deno.test("G2: wuensche_liste nur Admin + aal2", async () => {
  // kein Token
  let r = await bearbeiten(admin({ aktion: "wuensche_liste" }), bau({ nutzer: null }).a);
  assertEquals(r.status, 401);
  // Admin ohne 2. Faktor
  r = await bearbeiten(admin({ aktion: "wuensche_liste" }), bau({ nutzer: { id: ADMIN_ID, email: "a@b.at", aal: "aal1" } }).a);
  assertEquals(r.status, 403);
  // Nicht-Admin mit aal2
  r = await bearbeiten(admin({ aktion: "wuensche_liste" }), bau({ nutzer: { id: "fremd", email: "f@b.at", aal: "aal2" } }).a);
  assertEquals(r.status, 403);
  // Admin + aal2
  const { a } = bau();
  r = await bearbeiten(admin({ aktion: "wuensche_liste" }), a);
  assertEquals(r.status, 200);
  const d = await r.json();
  assertEquals(d.ok, true);
  assertEquals(d.wuensche.length, 1);
});

// ── wunsch_trainer ──
Deno.test("G2: wunsch_trainer liefert passende Trainer über die Edge-Aktion", async () => {
  const { a } = bau({
    mitte: { ort: "Salzburg", lat: 47.80, lng: 13.04 },
    kandidaten: [
      { id: "nah", vorname: "A", nachname: "N", lat: 47.80, lng: 13.05, aktiv: true, avatar_url: "/avatars/a.jpg", trainingsart: "x", trainingsort: "vor_ort", preis_stunde: 50, bio: "Text lang genug hier", erfahrung: "3", spezialisierungen: ["x"], telefon: "1" },
      { id: "fern", vorname: "C", nachname: "F", lat: 48.21, lng: 16.37, aktiv: true },
    ],
  });
  const r = await bearbeiten(admin({ aktion: "wunsch_trainer", ziel_id: "w-1" }), a);
  assertEquals(r.status, 200);
  const d = await r.json();
  assertEquals(d.ort, "Salzburg");
  assertEquals(d.vorschlaege.length, 1);
  assertEquals(d.vorschlaege[0].id, "nah");
});

// ── wunsch_an_trainer + Integration mit der Zahlungslogik ──
Deno.test("G2: wunsch_an_trainer legt Anfrage an + Mails + Status; Zahlung liefert Kundendaten", async () => {
  const { a, s } = bau();
  // 1) Vermitteln: Anfrage anlegen + Trainer-Mail (erste) + interne Mail.
  const r1 = await bearbeiten(admin({ aktion: "wunsch_an_trainer", ziel_id: "w-1", trainer_id: "t-1" }), a);
  assertEquals(r1.status, 200);
  const d1 = await r1.json();
  assertEquals(d1.mails, 2);
  assertEquals(s.anfragen.length, 1);
  const an = s.anfragen[0];
  assertEquals(an.trainer_id, "t-1");
  assertEquals(an.kunden_email, "lena@beispiel.at");
  assertEquals(an.ziel, "Abnehmen");
  assertEquals(an.weitergeleitet, false); // normaler Trainer: erst nach Zahlung
  // Wunsch-Status gesetzt
  assertEquals(s.wuensche.get("w-1")?.status, "an_trainer_gesendet");
  assertEquals(s.wuensche.get("w-1")?.anfrage_id, an.id);
  // Trainer-Mail (erste Anfrage) ging an den Trainer
  assert(s.mails.some((m) => m.an === "max@beispiel.at"), "keine Trainer-Mail");

  // 2) Annahme = Zahlung (Stripe checkout, gestubbt): bestehende Logik liefert
  //    die Kundendaten an den Trainer und markiert die Anfrage weitergeleitet.
  const ereignis = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { client_reference_id: "t-1", customer_details: { email: "max@beispiel.at" }, amount_total: 4999 } },
  } as unknown as StripeEreignis;
  const { a: a2, s: s2 } = bau({ ereignis });
  // dieselbe Anfrage in den Zahlungs-Stub übernehmen
  s2.anfragen.push({ id: an.id, trainer_id: "t-1", kunden_name: "Lena", kunden_email: "lena@beispiel.at", ziel: "Abnehmen", nachricht: "", weitergeleitet: false, created_at: new Date().toISOString() });
  const r2 = await bearbeiten(
    new Request("https://x.supabase.co/functions/v1/vexfit-automation/stripe", {
      method: "POST", headers: { "stripe-signature": "x" }, body: "{}",
    }),
    a2,
  );
  assertEquals(r2.status, 200);
  const d2 = await r2.json();
  assertEquals(d2.anfrage_weitergeleitet, true);
  // Die Kundendaten-Mail nennt die E-Mail des Wunsch-Kunden.
  const kundenMail = s2.mails.find((m) => m.text.includes("lena@beispiel.at"));
  assert(kundenMail, "Kundendaten-Mail mit der Wunsch-E-Mail fehlt");
  assertEquals(s2.anfragen[0].weitergeleitet, true);
});

Deno.test("G2: wunsch_kein_trainer – Mail + Vormerkung + Status", async () => {
  const { a, s } = bau();
  const r = await bearbeiten(admin({ aktion: "wunsch_kein_trainer", ziel_id: "w-1" }), a);
  assertEquals(r.status, 200);
  const d = await r.json();
  assertEquals(d.mails, 1);
  assertEquals(d.vorgemerkt, true);
  assertEquals(s.vormerkungen.length, 1);
  assertEquals(s.vormerkungen[0].kunden_email, "lena@beispiel.at");
  assertEquals(s.wuensche.get("w-1")?.status, "kein_trainer");
  assertStringIncludes(s.mails[0].text, "noch keinen passenden Personal Trainer");
});

Deno.test("G2: wunsch_status setzt vermittelt", async () => {
  const { a, s } = bau();
  const r = await bearbeiten(admin({ aktion: "wunsch_status", ziel_id: "w-1", status: "vermittelt" }), a);
  assertEquals(r.status, 200);
  assertEquals(s.wuensche.get("w-1")?.status, "vermittelt");
  // unbekannter Status → 400
  const r2 = await bearbeiten(admin({ aktion: "wunsch_status", ziel_id: "w-1", status: "quatsch" }), bau().a);
  assertEquals(r2.status, 400);
});

Deno.test("G2: Verwaltung-UI + index.ts verdrahtet", async () => {
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'data-tab="wuensche"');
  assertStringIncludes(html, 'id="tab-wuensche"');
  assertStringIncludes(html, 'id="wuensche-liste"');
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "async function ladeWuensche");
  assertStringIncludes(js, 'aktion: "wunsch_an_trainer"');
  assertStringIncludes(js, 'aktion: "wunsch_trainer"');
  const idx = await lies("./supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(idx, "trainerAlleFuerVermittlung");
  assertStringIncludes(idx, "anfrageAnlegen");
});
