// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/cron_robust_test.ts
//
// Baustein 2026-11-04c: die Cron-Routen „erinnerungen" und „unbeantwortet-pruefen"
// sind fehlertolerant – ein einzelnes Element, das wirft, bricht den Lauf nicht
// mehr ab. Geprüft je Route: (a) ein Element wirft -> übrige verarbeitet,
// Protokoll „teilweise"; (b) leerer Lauf -> kein Protokolleintrag; (c) Bulk-Load
// wirft -> Protokoll „fehlgeschlagen", Antwort sauber (HTTP 200); (d) keine
// Doppel-Benachrichtigung nach Teilfehler (Beanspruchen/Vermerken greift).
// DB/SMTP/Push gemockt.
//
// Aufruf:  deno test --allow-read --allow-env supabase/functions/vexfit-automation/
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  type TrainerProfil,
} from "./kern.ts";

type Protokolleintrag = { admin_id?: string; aktion: string; ziel_tabelle?: string; ziel_id?: string; ergebnis?: string };

function cronReq(pfad: string, key: string | null = "geheim"): Request {
  const h: Record<string, string> = { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT };
  if (key) h["x-vexfit-cron"] = key;
  return new Request(`https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/${pfad}`, { method: "POST", headers: h, body: "{}" });
}

// ── erinnerungen ────────────────────────────────────────────────────────────

// Unvollständiges, fälliges Trainerprofil (Telefon fehlt, 3 h alt => Stufe 1).
function faelligerTrainer(id: string, email: string): TrainerProfil {
  return {
    id, vorname: "a", nachname: "b", email,
    avatar_url: "https://hbapzwxdehfgnputrfjf.supabase.co/storage/v1/object/public/avatars/x.jpg",
    trainingsart: "Personal Training", trainingsort: "vor_ort", preis_stunde: 60,
    bio: "Ein ausreichend langer Text über mich.", erfahrung: "3-5 Jahre",
    spezialisierungen: ["Muskelaufbau"], telefon: "",
    aktiv: false, gesperrt: false, erinnerungen_aus: false, erinnerung_stufe: 0,
    erinnerung_token: "tok", created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  } as TrainerProfil;
}

function baueErinnerung(opt: { kandidaten?: TrainerProfil[]; ladeWirft?: unknown; sendeWirftFuer?: string } = {}) {
  const mails: Mail[] = [];
  const prot: Protokolleintrag[] = [];
  const stufeGesetzt: { id: string; stufe: unknown }[] = [];
  const a = {
    cronGeheimnis: () => "geheim",
    trainerFuerErinnerung: () => opt.ladeWirft ? Promise.reject(opt.ladeWirft) : Promise.resolve(opt.kandidaten ?? []),
    erinnerungStufeBeanspruchen: (_id: string, _stufe: number) => Promise.resolve(true),
    mailSenden: (m: Mail) => {
      if (opt.sendeWirftFuer && m.an === opt.sendeWirftFuer) return Promise.reject(new Error("SMTP dicht"));
      mails.push(m);
      return Promise.resolve();
    },
    adminTrainerSetzen: (id: string, felder: Record<string, unknown>) => { stufeGesetzt.push({ id, stufe: felder.erinnerung_stufe }); return Promise.resolve(1); },
    protokoll: (e: Protokolleintrag) => { prot.push(e); return Promise.resolve(); },
    melden: () => {},
  } as unknown as Anschluesse;
  return { a, mails, prot, stufeGesetzt };
}

Deno.test("erinnerungen (a): ein Versandfehler bricht nicht ab, übrige laufen, Protokoll 'teilweise'", async () => {
  const b = baueErinnerung({
    kandidaten: [faelligerTrainer("t-a", "a@ex.at"), faelligerTrainer("t-b", "b@ex.at")],
    sendeWirftFuer: "a@ex.at",
  });
  const d = await (await bearbeiten(cronReq("erinnerungen"), b.a)).json();
  assertEquals(d.mails, 1); // nur b@ex.at
  assertEquals(b.mails.length, 1);
  assertEquals(b.mails[0].an, "b@ex.at");
  assertEquals(b.prot.length, 1);
  assertEquals(b.prot[0].aktion, "erinnerungen");
  assertStringIncludes(b.prot[0].ergebnis ?? "", "teilweise (1 von 2");
});

Deno.test("erinnerungen (b): leerer Lauf schreibt KEIN Protokoll", async () => {
  const b = baueErinnerung({ kandidaten: [] });
  const res = await bearbeiten(cronReq("erinnerungen"), b.a);
  assertEquals(res.status, 200);
  assertEquals(b.prot.length, 0);
  assertEquals(b.mails.length, 0);
});

Deno.test("erinnerungen (c): Bulk-Load wirft -> Protokoll 'fehlgeschlagen', Antwort 200", async () => {
  const b = baueErinnerung({ ladeWirft: new Error("Laden fehlgeschlagen: HTTP 500") });
  const res = await bearbeiten(cronReq("erinnerungen"), b.a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertStringIncludes(d.fehlgeschlagen ?? "", "HTTP 500");
  assertEquals(b.prot.length, 1);
  assertStringIncludes(b.prot[0].ergebnis ?? "", "fehlgeschlagen");
});

Deno.test("erinnerungen (d): nach Teilfehler keine Doppel-Mail; Stufe des gescheiterten zurückgesetzt", async () => {
  const b = baueErinnerung({
    kandidaten: [faelligerTrainer("t-a", "a@ex.at"), faelligerTrainer("t-b", "b@ex.at")],
    sendeWirftFuer: "a@ex.at",
  });
  await bearbeiten(cronReq("erinnerungen"), b.a);
  // a@ex.at wurde NICHT verschickt und seine Stufe für einen späteren Neuversuch
  // zurückgesetzt – kein zweiter (doppelter) Versand im selben Lauf.
  assertEquals(b.mails.filter((m) => m.an === "a@ex.at").length, 0);
  assertEquals(b.stufeGesetzt, [{ id: "t-a", stufe: 0 }]);
});

// ── unbeantwortet-pruefen ────────────────────────────────────────────────────

type Faellig = { id: string; trainer_id: string; kunden_email: string; kunden_name?: string; alternativen_gesendet?: boolean };

function baueUnbeantwortet(opt: { faellig?: Faellig[]; ladeWirft?: unknown; sendeWirftFuer?: string } = {}) {
  const mails: Mail[] = [];
  const prot: Protokolleintrag[] = [];
  const vermerkt: string[] = [];
  const a = {
    cronGeheimnis: () => "geheim",
    offeneAnfragenVor: () => opt.ladeWirft ? Promise.reject(opt.ladeWirft) : Promise.resolve(opt.faellig ?? []),
    aktiveTrainerFuerAlternativen: () => Promise.resolve([
      { id: "t-2", vorname: "Anna", nachname: "B", stadt: "Wien", spezialisierungen: ["Yoga"] },
      { id: "t-3", vorname: "Max", nachname: "C", stadt: "Graz", spezialisierungen: ["Yoga"] },
    ]),
    trainerVollNachId: (_id: string) => Promise.resolve({ id: "t-1", stadt: "Wien", spezialisierungen: ["Yoga"] }),
    alternativenVermerken: (id: string) => { vermerkt.push(id); return Promise.resolve(); },
    mailSenden: (m: Mail) => {
      if (opt.sendeWirftFuer && m.an === opt.sendeWirftFuer) return Promise.reject(new Error("SMTP dicht"));
      mails.push(m);
      return Promise.resolve();
    },
    protokoll: (e: Protokolleintrag) => { prot.push(e); return Promise.resolve(); },
    melden: () => {},
  } as unknown as Anschluesse;
  return { a, mails, prot, vermerkt };
}

const A_OFFEN = (id: string, email: string): Faellig => ({ id, trainer_id: "t-1", kunden_email: email, kunden_name: "K", alternativen_gesendet: false });

Deno.test("unbeantwortet (a): ein Element wirft -> übriges verarbeitet, Protokoll 'teilweise'", async () => {
  const b = baueUnbeantwortet({ faellig: [A_OFFEN("an-a", "ka@ex.at"), A_OFFEN("an-b", "kb@ex.at")], sendeWirftFuer: "ka@ex.at" });
  const d = await (await bearbeiten(cronReq("unbeantwortet-pruefen"), b.a)).json();
  assertEquals(d.geprueft, 2);
  assertEquals(d.mails, 1); // nur kb@ex.at
  assertEquals(b.mails.map((m) => m.an), ["kb@ex.at"]);
  assertEquals(b.prot.length, 1);
  assertEquals(b.prot[0].aktion, "unbeantwortet");
  assertStringIncludes(b.prot[0].ergebnis ?? "", "teilweise (1 von 2");
});

Deno.test("unbeantwortet (b): leerer Lauf schreibt KEIN Protokoll", async () => {
  const b = baueUnbeantwortet({ faellig: [] });
  const res = await bearbeiten(cronReq("unbeantwortet-pruefen"), b.a);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).geprueft, 0);
  assertEquals(b.prot.length, 0);
});

Deno.test("unbeantwortet (c): Bulk-Load wirft -> Protokoll 'fehlgeschlagen', Antwort 200", async () => {
  const b = baueUnbeantwortet({ ladeWirft: new Error("offeneAnfragenVor HTTP 503") });
  const res = await bearbeiten(cronReq("unbeantwortet-pruefen"), b.a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertStringIncludes(d.fehlgeschlagen ?? "", "HTTP 503");
  assertEquals(b.prot.length, 1);
  assertStringIncludes(b.prot[0].ergebnis ?? "", "fehlgeschlagen");
});

Deno.test("unbeantwortet (d): nach Teilfehler keine Doppel-Benachrichtigung (beide vermerkt, gescheitertes ohne Mail)", async () => {
  const b = baueUnbeantwortet({ faellig: [A_OFFEN("an-a", "ka@ex.at"), A_OFFEN("an-b", "kb@ex.at")], sendeWirftFuer: "ka@ex.at" });
  await bearbeiten(cronReq("unbeantwortet-pruefen"), b.a);
  // Beide Anfragen sind vermerkt (vor dem Versand) -> kein zweiter Anlauf, kein Doppelversand.
  assertEquals(b.vermerkt.sort(), ["an-a", "an-b"]);
  // Die gescheiterte Anfrage hat keine Mail erzeugt.
  assertEquals(b.mails.filter((m) => m.an === "ka@ex.at").length, 0);
  assertEquals(b.mails.map((m) => m.an), ["kb@ex.at"]);
});
