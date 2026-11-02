// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/gp04_freigabe_mail_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 4: „Profil vollständig – bitte freigeben".
// Alles gemockt. Geprüft wird: genau einmal pro Trainer, nur bei vollständigem
// Profil und nur solange nicht freigegeben; ohne eingespielte Migration
// (Spalte freigabe_mail_gesendet fehlt) wird NICHT gesendet (kein Mehrfachversand);
// Inhalt der Mail; Versandfehler wird geloggt.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  BETREIBER,
  ERLAUBTE_HERKUNFT,
  type Mail,
  mailProfilVollstaendig,
  profilVollstaendig,
  type TrainerProfil,
} from "./kern.ts";

function vollesProfil(ueber: Partial<TrainerProfil> = {}): TrainerProfil {
  return {
    id: "t-1", vorname: "Mara", nachname: "Blume", email: "mara@example.com", plz: "5020",
    stadt: "Salzburg", avatar_url: "https://hbapzwxdehfgnputrfjf.supabase.co/storage/v1/object/public/avatars/x.jpg", trainingsart: "Personal Training",
    trainingsort: "studio", preis_stunde: 60, bio: "Ein ausreichend langer Text über mich.",
    erfahrung: "3-5 Jahre", spezialisierungen: ["Muskelaufbau"], telefon: "0660...",
    aktiv: false, freigabe_mail_gesendet: false, ...ueber,
  };
}

interface Spur { mails: Mail[]; gesetzt: { id: string; felder: Record<string, unknown> }[]; meldungen: string[]; }

function baue(opt: {
  profil?: TrainerProfil | null;
  nutzer?: { id: string; email: string } | null;
  mailWirft?: boolean;
  setzenWirft?: unknown;
  ohneAnschluss?: boolean;
} = {}): { a: Anschluesse; spur: Spur } {
  const spur: Spur = { mails: [], gesetzt: [], meldungen: [] };
  // Teil 2: atomarer Anspruch. Startet "schon vergeben", wenn das Profil bereits
  // als gemeldet gilt; sonst bekommt genau der ERSTE Aufruf true.
  let anspruchVergeben = (opt.profil !== undefined && opt.profil?.freigabe_mail_gesendet === true);
  const base: Record<string, unknown> = {
    benutzerAusToken: () => Promise.resolve(opt.nutzer === undefined ? { id: "auth-1", email: "mara@example.com" } : opt.nutzer),
    mailSenden: (m: Mail) => { if (opt.mailWirft) return Promise.reject(new Error("SMTP dicht")); spur.mails.push(m); return Promise.resolve(); },
    adminTrainerSetzen: (id: string, felder: Record<string, unknown>) => {
      if (opt.setzenWirft) return Promise.reject(opt.setzenWirft);
      spur.gesetzt.push({ id, felder });
      if (felder.freigabe_mail_gesendet === false) anspruchVergeben = false; // Rücknahme
      return Promise.resolve(1);
    },
    freigabeMailBeanspruchen: (_id: string) => {
      if (opt.setzenWirft) return Promise.reject(opt.setzenWirft);
      if (anspruchVergeben) return Promise.resolve(false);
      anspruchVergeben = true;
      return Promise.resolve(true);
    },
    melden: (m: string) => { spur.meldungen.push(m); },
  };
  if (!opt.ohneAnschluss) {
    base.trainerProfilNachEmail = (_e: string) => Promise.resolve(opt.profil === undefined ? vollesProfil() : opt.profil);
  }
  const fehlt = (n: string) => () => { throw new Error(`${n} nicht erwartet`); };
  for (const n of ["trainerNachId","trainerNachEmail","aeltesteOffeneAnfrage","trainerBezahltMarkieren","anfrageWeitergeleitetMarkieren","stripeEreignis","ereignisSchonVerarbeitet","ereignisVermerken","anfragenAnzahlSeit","spamProEmailSeit","spamProIpSeit","spamEintragVormerken","adminZeileLoeschen"]) {
    if (!(n in base)) base[n] = fehlt(n);
  }
  return { a: base as unknown as Anschluesse, spur };
}

function req(): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/freigabe-pruefen",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" }, body: "{}" },
  );
}

Deno.test("profilVollstaendig: volles Profil true, jedes fehlende Feld false", () => {
  assert(profilVollstaendig(vollesProfil()));
  assert(!profilVollstaendig(vollesProfil({ avatar_url: null }))); // Foto
  assert(!profilVollstaendig(vollesProfil({ telefon: "" })));
  assert(!profilVollstaendig(vollesProfil({ bio: "zu kurz" }))); // <= 10 Zeichen
  assert(!profilVollstaendig(vollesProfil({ preis_stunde: 0 })));
  assert(!profilVollstaendig(vollesProfil({ spezialisierungen: [] })));
});

Deno.test("mailProfilVollstaendig: an BETREIBER mit Name/E-Mail/PLZ/Spezialisierungen/Link", () => {
  const m = mailProfilVollstaendig(vollesProfil());
  assertEquals(m.an, BETREIBER);
  assertStringIncludes(m.betreff, "bitte freigeben");
  for (const s of ["Mara Blume", "mara@example.com", "5020", "Muskelaufbau", "https://vexfit.app/admin.html"]) {
    assertStringIncludes(m.text + m.html, s);
  }
});

Deno.test("Vollständig + nicht freigegeben: beansprucht atomar und sendet einmal", async () => {
  const { a, spur } = baue();
  const res = await bearbeiten(req(), a);
  const d = await res.json();
  assertEquals(d.gesendet, true);
  assertEquals(spur.mails.length, 1);
  assertEquals(spur.mails[0].an, BETREIBER);
  // Der Anspruch setzt das Flag atomar (freigabeMailBeanspruchen); bei Erfolg
  // wird adminTrainerSetzen NICHT mehr gebraucht.
  assertEquals(spur.gesetzt, []);
});

Deno.test("Teil 2: zwei gleichzeitige Aufrufe → nur EINE Mail (Doppelversand verhindert)", async () => {
  const { a, spur } = baue();
  const [r1, r2] = await Promise.all([bearbeiten(req(), a), bearbeiten(req(), a)]);
  const d1 = await r1.json(), d2 = await r2.json();
  assertEquals(spur.mails.length, 1, "es wurde mehr als eine Mail gesendet");
  // Genau einer der beiden hat gesendet, der andere nicht.
  assertEquals([d1.gesendet, d2.gesendet].filter(Boolean).length, 1);
  assert(d1.grund === "schon gemeldet" || d2.grund === "schon gemeldet");
});

Deno.test("Teil 2: Versandfehler nimmt den Anspruch zurück (späterer Lauf darf erneut)", async () => {
  // Erster Lauf scheitert am SMTP -> Anspruch zurückgenommen.
  const { a, spur } = baue({ mailWirft: true });
  try { await bearbeiten(req(), a); } catch { /* erwartet */ }
  // Das Flag wurde atomar gesetzt und wegen des Fehlers wieder auf false gesetzt.
  assert(spur.gesetzt.some((g) => g.felder.freigabe_mail_gesendet === false), "Anspruch nicht zurückgenommen");
});

Deno.test("Unvollständiges Profil: keine Mail", async () => {
  const { a, spur } = baue({ profil: vollesProfil({ telefon: "" }) });
  const d = await (await bearbeiten(req(), a)).json();
  assertEquals(d.gesendet, false);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Schon freigegeben (aktiv): keine Mail", async () => {
  const { a, spur } = baue({ profil: vollesProfil({ aktiv: true }) });
  const d = await (await bearbeiten(req(), a)).json();
  assertEquals(d.gesendet, false);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Schon gemeldet (Flag=true): keine zweite Mail", async () => {
  const { a, spur } = baue({ profil: vollesProfil({ freigabe_mail_gesendet: true }) });
  const d = await (await bearbeiten(req(), a)).json();
  assertEquals(d.gesendet, false);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Ohne Migration (Spalte fehlt) wird NICHT gesendet, nur Hinweis", async () => {
  // Profil ohne den Schlüssel freigabe_mail_gesendet (Spalte existiert nicht).
  const p = vollesProfil();
  delete (p as unknown as Record<string, unknown>).freigabe_mail_gesendet;
  const { a, spur } = baue({ profil: p });
  const d = await (await bearbeiten(req(), a)).json();
  assertEquals(d.gesendet, false);
  assertEquals(d.grund, "migration fehlt");
  assertEquals(spur.mails.length, 0);
  assert(spur.meldungen.some((m) => m.includes("freigabe_mail_gesendet")));
});

Deno.test("Kein Trainer zur E-Mail: keine Mail, kein Fehler", async () => {
  const { a, spur } = baue({ profil: null });
  const d = await (await bearbeiten(req(), a)).json();
  assertEquals(d.gesendet, false);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Nicht angemeldet → 401", async () => {
  const { a } = baue({ nutzer: null });
  const res = await bearbeiten(req(), a);
  assertEquals(res.status, 401);
});

Deno.test("Anschluss nicht verfügbar (alte Fassung): kein Absturz, gesendet=false", async () => {
  const { a } = baue({ ohneAnschluss: true });
  const res = await bearbeiten(req(), a);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.gesendet, false);
});

Deno.test("Versandfehler wird geloggt (nicht still verschluckt)", async () => {
  const { a, spur } = baue({ mailWirft: true });
  // sendeWennAdresseTaugt wirft bei SMTP-Fehler weiter -> bearbeiten reicht durch.
  let geworfen = false;
  try { await bearbeiten(req(), a); } catch { geworfen = true; }
  assert(geworfen || spur.meldungen.length > 0, "SMTP-Fehler muss sichtbar werden");
});
