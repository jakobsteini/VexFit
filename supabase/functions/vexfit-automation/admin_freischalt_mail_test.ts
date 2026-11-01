// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/admin_freischalt_mail_test.ts
//
// Baustein „Freischalt-Mail an den Trainer" (Edge-Logik, ohne Netz, gemockt):
//   * Freigeben (trainer_aktivieren) sendet GENAU EINMAL die Mail „Dein Vexfit-
//     Profil ist freigeschaltet" an die Trainer-Adresse und vermerkt den Versand.
//   * Zweites Freigeben (Vermerk schon gesetzt) -> kein zweiter Versand.
//   * Mailfehler -> Freigabe bleibt (aktiv ist gesetzt), Grund kommt zurueck,
//     kein Vermerk -> erneutes Senden (trainer_freischalt_mail) ist moeglich.
//   * Ohne eingespielte Migration (Spalte fehlt) -> Mail geht raus, sperre_fehlt.
//   * Mailtext: fehlende Punkte werden aufgelistet; vollstaendig -> „vollständig".
//
// Aufruf:  deno test --allow-read supabase/functions/vexfit-automation/admin_freischalt_mail_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  freischaltFehlendeFelder,
  type Mail,
  mailFreischaltung,
  type TrainerProfil,
} from "./kern.ts";

function jwt(aal = "aal2"): string {
  const b64u = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: ADMIN_ID, aal })}.sig`;
}

function anfrage(koerper: unknown): Request {
  return new Request("https://x/functions/v1/vexfit-automation/admin-aktion", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: `Bearer ${jwt()}` },
    body: JSON.stringify(koerper),
  });
}

const VOLL: TrainerProfil = {
  id: "t-1",
  vorname: "Marco",
  nachname: "Blome",
  email: "marco.blome@live.de",
  avatar_url: "https://x/a.jpg",
  trainingsart: "online",
  trainingsort: "studio",
  preis_stunde: 60,
  bio: "Langjährige Erfahrung im Krafttraining.",
  erfahrung: "10 Jahre",
  spezialisierungen: ["Kraft"],
  telefon: "+43 660 1",
  aktiv: false,
  freischalt_mail_gesendet: null,
};

interface Spur {
  mails: Mail[];
  gesetzt: { id: string; felder: Record<string, unknown> }[];
  protokoll: { aktion: string; ergebnis?: string }[];
}

function baue(opt: { profil?: TrainerProfil | null; ohneProfilAnschluss?: boolean; mailWirft?: Error } = {}): { a: Anschluesse; spur: Spur } {
  const spur: Spur = { mails: [], gesetzt: [], protokoll: [] };
  const profil = opt.profil === undefined ? { ...VOLL } : opt.profil;
  const a = {
    benutzerAusToken: () => Promise.resolve({ id: ADMIN_ID, email: "admin@vexfit.app", aal: "aal2" }),
    adminTrainerSetzen: (id: string, felder: Record<string, unknown>) => {
      spur.gesetzt.push({ id, felder });
      // Der Vermerk landet im Profil (fuer ein zweites Freigeben im selben Test).
      if (profil && "freischalt_mail_gesendet" in felder) profil.freischalt_mail_gesendet = felder.freischalt_mail_gesendet as string;
      return Promise.resolve(1);
    },
    mailSenden: (m: Mail) => {
      if (opt.mailWirft) return Promise.reject(opt.mailWirft);
      spur.mails.push(m);
      return Promise.resolve();
    },
    protokoll: (e: { aktion: string; ergebnis?: string }) => { spur.protokoll.push({ aktion: e.aktion, ergebnis: e.ergebnis }); return Promise.resolve(); },
    melden: () => {},
  } as unknown as Record<string, unknown>;
  if (!opt.ohneProfilAnschluss) a.trainerProfilNachId = (_id: string) => Promise.resolve(profil);
  return { a: a as unknown as Anschluesse, spur };
}

Deno.test("Freigeben: genau EIN Versand an die Trainer-Adresse, Betreff + Vermerk", async () => {
  const { a, spur } = baue();
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }), a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.geaendert, 1);
  assertEquals(d.mail.gesendet, true);
  assertEquals(spur.mails.length, 1);
  assertEquals(spur.mails[0].an, "marco.blome@live.de");
  assertEquals(spur.mails[0].betreff, "Dein Vexfit-Profil ist freigeschaltet");
  // aktiv gesetzt UND der Versand-Vermerk gesetzt (zwei Schreibvorgänge).
  assertEquals(spur.gesetzt[0].felder, { aktiv: true });
  assert(spur.gesetzt.some((g) => "freischalt_mail_gesendet" in g.felder), "Vermerk muss gesetzt werden");
});

Deno.test("Zweites Freigeben: Vermerk schon gesetzt -> kein zweiter Versand", async () => {
  const { a, spur } = baue();
  await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }), a);
  const res2 = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }), a);
  const d2 = await res2.json();
  assertEquals(spur.mails.length, 1, "nur der erste Versand");
  assertEquals(d2.mail.gesendet, false);
  assertEquals(d2.mail.schon, true);
});

Deno.test("Mailfehler: Freigabe bleibt, Grund kommt zurueck, kein Vermerk", async () => {
  const { a, spur } = baue({ mailWirft: new Error("SMTP_PASSWORT fehlt") });
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }), a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.geaendert, 1, "aktiv bleibt gesetzt (Freigabe besteht)");
  assertEquals(d.mail.gesendet, false);
  assertStringIncludes(d.mail.grund, "SMTP_PASSWORT");
  // Kein Versand-Vermerk -> erneutes Senden bleibt moeglich.
  assert(!spur.gesetzt.some((g) => "freischalt_mail_gesendet" in g.felder), "Vermerk darf NICHT gesetzt sein");
});

Deno.test("Erneut senden (trainer_freischalt_mail) nach Fehler: sendet und vermerkt", async () => {
  const { a, spur } = baue();
  const res = await bearbeiten(anfrage({ aktion: "trainer_freischalt_mail", ziel_id: "t-1" }), a);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.mail.gesendet, true);
  assertEquals(spur.mails.length, 1);
  assert(spur.gesetzt.some((g) => "freischalt_mail_gesendet" in g.felder));
  assertEquals(spur.protokoll.at(-1)?.aktion, "trainer_freischalt_mail");
});

Deno.test("Ohne eingespielte Migration (Spalte fehlt): Mail geht raus, sperre_fehlt", async () => {
  // Profil OHNE Schluessel freischalt_mail_gesendet (select=* ohne die Spalte).
  const ohneSpalte: TrainerProfil = { id: "t-1", vorname: "Max", email: "max@example.com", aktiv: false };
  const { a, spur } = baue({ profil: ohneSpalte });
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }), a);
  const d = await res.json();
  assertEquals(d.mail.gesendet, true);
  assertEquals(d.mail.sperre_fehlt, true);
  assertEquals(spur.mails.length, 1);
  // Nur aktiv wurde gesetzt, KEIN Vermerk-Schreibversuch (Spalte fehlt).
  assert(!spur.gesetzt.some((g) => "freischalt_mail_gesendet" in g.felder));
});

Deno.test("Mailtext: fehlende Punkte werden aufgelistet", () => {
  const luecke: TrainerProfil = { id: "t", vorname: "Sofi", email: "s@example.com", preis_stunde: 0, spezialisierungen: [] };
  const fehlt = freischaltFehlendeFelder(luecke);
  assertStringIncludes(fehlt.join(","), "Foto");
  assertStringIncludes(fehlt.join(","), "Preis pro Stunde");
  const mail = mailFreischaltung(luecke);
  assertStringIncludes(mail.text, "Hallo Sofi");
  assertStringIncludes(mail.text, "fehlen in deinem Profil noch:");
  assertStringIncludes(mail.text, "Foto");
  // Link in den eigenen Bereich (als Knopf -> steht in der Textfassung).
  assertStringIncludes(mail.text, "https://vexfit.app/login.html");
  assert(!mail.text.includes("vollständig – perfekt"));
});

Deno.test("Mailtext: vollstaendiges Profil -> Satz 'Dein Profil ist vollständig'", () => {
  const mail = mailFreischaltung(VOLL);
  assertEquals(freischaltFehlendeFelder(VOLL).length, 0);
  assertStringIncludes(mail.text, "Dein Profil ist vollständig – perfekt.");
  assert(!mail.text.includes("login.html"), "kein Vervollständigen-Link bei vollständigem Profil");
  assertStringIncludes(mail.betreff, "freigeschaltet");
  assertStringIncludes(mail.text, "Bis zu deinem ersten Kunden bleibt alles kostenlos");
});

Deno.test("Ohne trainerProfilNachId-Anschluss: Freigabe läuft, Mail nicht verfügbar", async () => {
  const { a } = baue({ ohneProfilAnschluss: true });
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }), a);
  const d = await res.json();
  assertEquals(d.geaendert, 1);
  assertEquals(d.mail.gesendet, false);
});
