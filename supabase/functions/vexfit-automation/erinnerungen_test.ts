// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/erinnerungen_test.ts
//
// Teil 4: Erinnerungs-Mails. Alles gemockt, nichts Echtes verschickt.
//   - erinnerungStufeFaellig: Zeitfenster 2/24/72 h (bis 96 h), jede Stufe
//     einmal, Abbruch bei vollständig/aktiv/gesperrt/abgemeldet/zu alt.
//   - mailErinnerung: Anrede, X von 8, fehlende Angaben, Knopf zur ersten
//     fehlenden Angabe, Abmelde-Link mit Token, Fußzeile ohne genaue Adresse.
//   - Endpunkt /erinnerungen: Cron-Schlüssel nötig; je Trainer 1 Mail/Lauf;
//     zweiter Lauf im selben Fenster → keine weitere; /erinnerung-abmelden.
//
// Aufruf:  deno test --allow-read --allow-env supabase/functions/vexfit-automation/erinnerungen_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type Anschluesse,
  bearbeiten,
  erinnerungStufeFaellig,
  erinnerungZiel,
  ERLAUBTE_HERKUNFT,
  type Mail,
  mailErinnerung,
  type TrainerProfil,
} from "./kern.ts";

const JETZT = Date.parse("2026-11-02T12:00:00Z");
const vorStunden = (h: number) => new Date(JETZT - h * 3_600_000).toISOString();
// Der Endpunkt rechnet mit Date.now(); Kandidaten der Endpunkt-Tests bekommen
// ihr Alter deshalb relativ zur echten Uhr (unabhängig von JETZT).
const vorStundenNun = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

// Unvollständiges Profil (Telefon fehlt), frei konfigurierbar.
function trainer(ueber: Partial<TrainerProfil> = {}): TrainerProfil {
  return {
    id: "t-1", vorname: "lukas", nachname: "pichler", email: "lukas@example.com",
    avatar_url: "https://x/y.jpg", trainingsart: "Personal Training",
    trainingsort: "vor_ort", preis_stunde: 60, bio: "Ein ausreichend langer Text über mich.",
    erfahrung: "3-5 Jahre", spezialisierungen: ["Muskelaufbau"], telefon: "",
    aktiv: false, gesperrt: false, erinnerungen_aus: false, erinnerung_stufe: 0,
    erinnerung_token: "tok-1", created_at: vorStunden(3), ...ueber,
  };
}

// ── Pure: Zeitfenster/Stufen ────────────────────────────────────────────────
Deno.test("Teil 4: Stufen nach 2/24/72 h, nichts vor 2 h und ab 96 h", () => {
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(1) }), JETZT), null); // zu früh
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(3) }), JETZT), 1);
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(30) }), JETZT), 2);
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(80) }), JETZT), 3);
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(100) }), JETZT), null); // > 96 h
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(240) }), JETZT), null); // 10 Tage
});

Deno.test("Teil 4: jede Stufe nur einmal (erinnerung_stufe)", () => {
  // In Fenster 1, aber Stufe 1 schon verschickt → nichts.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(3), erinnerung_stufe: 1 }), JETZT), null);
  // In Fenster 2, Stufe 1 verschickt → Stufe 2 fällig.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(30), erinnerung_stufe: 1 }), JETZT), 2);
  // In Fenster 2, Stufe 2 schon verschickt → nichts.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(30), erinnerung_stufe: 2 }), JETZT), null);
});

Deno.test("Teil 4: keine Erinnerung bei vollständig/aktiv/gesperrt/abgemeldet", () => {
  assertEquals(erinnerungStufeFaellig(trainer({ telefon: "+43 660 1" }), JETZT), null); // vollständig
  assertEquals(erinnerungStufeFaellig(trainer({ aktiv: true }), JETZT), null); // freigeschaltet
  assertEquals(erinnerungStufeFaellig(trainer({ gesperrt: true }), JETZT), null);
  assertEquals(erinnerungStufeFaellig(trainer({ erinnerungen_aus: true }), JETZT), null); // abgemeldet
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: null }), JETZT), null); // kein Datum
});

// ── Pure: Ziel-Link zur ersten fehlenden Angabe ─────────────────────────────
Deno.test("Teil 4: Knopf-Ziel je erster fehlender Angabe", () => {
  assert(erinnerungZiel("Foto").endsWith("/trainer-bereich.html"));
  assertStringIncludes(erinnerungZiel("Telefon"), "/profil-bearbeiten.html#fTelefon");
  assertStringIncludes(erinnerungZiel("Über mich"), "/profil-bearbeiten.html#fBio");
  assert(erinnerungZiel("Unbekannt").endsWith("/profil-bearbeiten.html"));
});

// ── Pure: Mailinhalt ────────────────────────────────────────────────────────
Deno.test("Teil 4: mailErinnerung – Anrede, X von 8, fehlende Angaben, Knopf, Abmelde-Link, Fußzeile", () => {
  const m = mailErinnerung(trainer(), 1, "tok-1");
  assertEquals(m.an, "lukas@example.com");
  assertStringIncludes(m.betreff, "Vexfit.app");
  assertStringIncludes(m.text, "Hallo Lukas,");          // Vorname formatiert
  assertStringIncludes(m.text, "1 von 8");               // nur Telefon fehlt
  assertStringIncludes(m.text, "Telefon");               // fehlende Angabe benannt
  assertStringIncludes(m.text, "Profil jetzt vervollständigen");
  assertStringIncludes(m.text, "profil-bearbeiten.html#fTelefon");
  assertStringIncludes(m.text, "erinnerung-abmelden?token=tok-1");
  assertStringIncludes(m.text, "Keine Erinnerungen mehr");
  // Fußzeile ohne genaue Adresse.
  assertStringIncludes(m.text, "Salzburg · Österreich");
  assert(!m.text.includes("Fuschl am See"), "genaue Adresse in der Erinnerung");
  assert(!m.html.includes("Fuschl am See"), "genaue Adresse im HTML");
  // Drei verschiedene Betreffzeilen.
  assert(mailErinnerung(trainer(), 1, "t").betreff !== mailErinnerung(trainer(), 3, "t").betreff);
});

// ── Endpunkt: Cron-Schlüssel + Versand ──────────────────────────────────────
interface Spur { mails: Mail[]; stufen: { id: string; stufe: number }[]; }
function baue(opt: { kandidaten?: TrainerProfil[]; mailWirft?: boolean; ohneVerdrahtung?: boolean } = {}): { a: Anschluesse; spur: Spur } {
  const spur: Spur = { mails: [], stufen: [] };
  // Simuliert den atomaren Anspruch je Trainer (bereits verschickte Stufe).
  const stand = new Map<string, number>();
  const fehlt = (n: string) => () => { throw new Error(`${n} nicht erwartet`); };
  const base: Record<string, unknown> = {
    cronGeheimnis: () => "geheim",
    mailSenden: (m: Mail) => { if (opt.mailWirft) return Promise.reject(new Error("SMTP")); spur.mails.push(m); return Promise.resolve(); },
    melden: () => {},
    adminTrainerSetzen: (id: string, felder: Record<string, unknown>) => {
      if (typeof felder.erinnerung_stufe === "number") stand.set(id, felder.erinnerung_stufe as number);
      return Promise.resolve(1);
    },
  };
  if (!opt.ohneVerdrahtung) {
    base.trainerFuerErinnerung = () => Promise.resolve((opt.kandidaten ?? [trainer()]).map((t) => ({ ...t, erinnerung_stufe: stand.get(t.id) ?? t.erinnerung_stufe ?? 0 })));
    base.erinnerungStufeBeanspruchen = (id: string, stufe: number) => {
      const bereits = stand.get(id) ?? 0;
      if (bereits < stufe) { stand.set(id, stufe); spur.stufen.push({ id, stufe }); return Promise.resolve(true); }
      return Promise.resolve(false);
    };
    base.erinnerungAbmelden = (_token: string) => Promise.resolve(true);
  }
  for (const n of ["trainerNachId","trainerNachEmail","aeltesteOffeneAnfrage","trainerBezahltMarkieren","anfrageWeitergeleitetMarkieren","stripeEreignis","ereignisSchonVerarbeitet","ereignisVermerken","anfragenAnzahlSeit","spamProEmailSeit","spamProIpSeit","spamEintragVormerken","adminZeileLoeschen"]) {
    if (!(n in base)) base[n] = fehlt(n);
  }
  return { a: base as unknown as Anschluesse, spur };
}
function cronReq(pfad = "erinnerungen", mitSchluessel = true): Request {
  const h: Record<string, string> = { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT };
  if (mitSchluessel) h["x-vexfit-cron"] = "geheim";
  return new Request(`https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/${pfad}`, { method: "POST", headers: h, body: "{}" });
}

Deno.test("Teil 4: ohne Cron-Schlüssel → 401", async () => {
  const { a } = baue();
  assertEquals((await bearbeiten(cronReq("erinnerungen", false), a)).status, 401);
});

Deno.test("Teil 4: ein fälliger Trainer → genau 1 Mail; zweiter Lauf im selben Fenster → keine", async () => {
  const { a, spur } = baue({ kandidaten: [trainer({ created_at: vorStundenNun(3) })] });
  const d1 = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d1.mails, 1);
  assertEquals(spur.mails.length, 1);
  assertEquals(spur.mails[0].betreff, mailErinnerung(trainer(), 1, "t").betreff);
  // Zweiter Lauf: Stufe 1 schon beansprucht → keine weitere Mail.
  const d2 = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d2.mails, 0);
  assertEquals(spur.mails.length, 1);
});

Deno.test("Teil 4: nicht fällige Kandidaten bekommen nichts", async () => {
  const { a, spur } = baue({ kandidaten: [
    trainer({ id: "voll", telefon: "+43 1" }),       // vollständig
    trainer({ id: "alt", created_at: vorStundenNun(200) }), // zu alt
    trainer({ id: "frisch", created_at: vorStundenNun(0.5) }), // zu früh
  ] });
  const d = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d.mails, 0);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Teil 4: ohne Verdrahtung/Migration bleibt der Pfad still (kein Absturz)", async () => {
  const { a } = baue({ ohneVerdrahtung: true });
  const res = await bearbeiten(cronReq(), a);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).uebersprungen, "nicht verdrahtet");
});

Deno.test("Teil 4: docs/erinnerungs-mails.md enthält die drei Texte", async () => {
  const doc = await Deno.readTextFile(new URL("../../../docs/erinnerungs-mails.md", import.meta.url));
  for (const stufe of [1, 2, 3]) {
    assertStringIncludes(doc, mailErinnerung(trainer(), stufe, "t").betreff);
  }
  assertStringIncludes(doc, "Salzburg · Österreich");
  assert(!doc.includes("Fuschl am See"), "genaue Adresse im Doku-Text");
});

Deno.test("Teil 4: /erinnerung-abmelden stellt ab und liefert eine Seite", async () => {
  const { a } = baue();
  const r = new Request("https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/erinnerung-abmelden?token=tok-1", { method: "GET", headers: { Origin: ERLAUBTE_HERKUNFT } });
  const res = await bearbeiten(r, a);
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("Content-Type") || "", "text/html");
  assertStringIncludes(await res.text(), "keine Erinnerungen mehr");
});
