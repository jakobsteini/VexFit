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
  erinnerungBetreff,
  erinnerungStufeFaellig,
  erinnerungZiel,
  ERLAUBTE_HERKUNFT,
  type Mail,
  mailErinnerung,
  type ProfilErinnerungArt,
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
    avatar_url: "https://hbapzwxdehfgnputrfjf.supabase.co/storage/v1/object/public/avatars/x.jpg", trainingsart: "Personal Training",
    trainingsort: "vor_ort", preis_stunde: 60, bio: "Ein ausreichend langer Text über mich.",
    erfahrung: "3-5 Jahre", spezialisierungen: ["Muskelaufbau"], telefon: "",
    aktiv: false, gesperrt: false, erinnerungen_aus: false, erinnerung_stufe: 0,
    erinnerung_token: "tok-1", created_at: vorStunden(3), ...ueber,
  };
}

// ── Pure: Zeitpunkte/Stufen (Schwellen 2 h / 3 Tage / 7 Tage) ────────────────
const H_TAG = 24;
Deno.test("Teil 4: Stufen-Schwellen 2 h / 3 Tage / 7 Tage, nichts vor 2 h", () => {
  // bereits = 0 → immer die NÄCHSTE offene Stufe ist 1, sobald 2 h erreicht sind.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(1) }), JETZT), null); // < 2 h
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(3) }), JETZT), 1); // ≥ 2 h
  // Auch viel später bleibt die nächste offene Stufe 1 (keine zwei auf einmal,
  // kein Überspringen): ein spät entdecktes Konto bekommt zuerst Stufe 1.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(3 * H_TAG) }), JETZT), 1);
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(10 * H_TAG) }), JETZT), 1);
});

Deno.test("Teil 4: nächste Stufe erst ab ihrer Schwelle; nie zwei auf einmal; max 3", () => {
  // Stufe 1 verschickt, aber 3 Tage noch nicht erreicht → nichts (verschoben).
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(2 * H_TAG), erinnerung_stufe: 1 }), JETZT), null);
  // Stufe 1 verschickt, ≥ 3 Tage → Stufe 2 fällig.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(3 * H_TAG + 3), erinnerung_stufe: 1 }), JETZT), 2);
  // Stufe 2 verschickt, aber 7 Tage noch nicht erreicht → nichts.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(5 * H_TAG), erinnerung_stufe: 2 }), JETZT), null);
  // Stufe 2 verschickt, ≥ 7 Tage → Stufe 3 fällig.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(7 * H_TAG + 3), erinnerung_stufe: 2 }), JETZT), 3);
  // Alle drei verschickt → nie mehr etwas.
  assertEquals(erinnerungStufeFaellig(trainer({ created_at: vorStunden(30 * H_TAG), erinnerung_stufe: 3 }), JETZT), null);
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
Deno.test("Teil 4: mailErinnerung – Anrede, x von 8 fertig, fehlende Angaben, Knopf, Abmelde-Link, Fußzeile", () => {
  const m = mailErinnerung(trainer(), 1, "tok-1");
  assertEquals(m.an, "lukas@example.com");
  assertStringIncludes(m.text, "Hallo Lukas,");          // Vorname formatiert
  assertStringIncludes(m.text, "7 von 8 fertig");        // nur Telefon fehlt → 7/8
  assertStringIncludes(m.text, "Telefon");               // fehlende Angabe benannt
  assertStringIncludes(m.text, "Profil jetzt vervollständigen");
  assertStringIncludes(m.text, "profil-bearbeiten.html#fTelefon");
  // Abmelde-Link zeigt auf die Supabase-Functions-Domain (NICHT vexfit.app,
  // dort gibt es keine Functions – Fund B1 aus der Prüfung).
  assertStringIncludes(m.text, "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/erinnerung-abmelden?token=tok-1");
  assert(!m.text.includes("vexfit.app/functions/v1"), "Abmelde-Link zeigt auf den falschen Host");
  assertStringIncludes(m.text, "Keine Erinnerungen mehr");
  // Fußzeile ohne genaue Adresse.
  assertStringIncludes(m.text, "Salzburg · Österreich");
  assert(!m.text.includes("Fuschl am See"), "genaue Adresse in der Erinnerung");
  assert(!m.html.includes("Fuschl am See"), "genaue Adresse im HTML");
});

// Betreff/Einstieg richten sich nach der Vollständigkeit (nicht nach der Stufe).
Deno.test("Teil 4: Betreff je Vollständigkeitsstufe; kein fast-fertig unter 4/8", () => {
  // 0/8: nichts gesetzt außer Pflichtfeldern leer → „wartet auf dich".
  const leer = trainer({
    avatar_url: "", trainingsart: "", trainingsort: "", preis_stunde: 0,
    bio: "", erfahrung: "", spezialisierungen: [], telefon: "",
  });
  const m0 = mailErinnerung(leer, 1, "t");
  assertEquals(m0.betreff, "Dein Vexfit-Profil wartet auf dich");
  assert(!/fast fertig/i.test(m0.text + m0.html), "fast-fertig bei 0/8");
  assert(!/fast fertig/i.test(m0.betreff), "fast-fertig im Betreff bei 0/8");
  assertStringIncludes(m0.text, "0 von 8 fertig");

  // 5/8: drei fehlen (Foto, Preis, Telefon) → „zu 5 von 8 fertig".
  const m5 = mailErinnerung(trainer({ avatar_url: "", preis_stunde: 0, telefon: "" }), 1, "t");
  assertEquals(m5.betreff, "Dein Vexfit-Profil ist zu 5 von 8 fertig");

  // 7/8: nur Telefon fehlt → „Nur noch eine Angabe …".
  const m7 = mailErinnerung(trainer(), 1, "t");
  assertEquals(m7.betreff, "Nur noch eine Angabe bis zu deinem fertigen Profil");

  // Reine Betreff-Funktion deckt die drei Bänder ab.
  assertEquals(erinnerungBetreff(0), "Dein Vexfit-Profil wartet auf dich");
  assertEquals(erinnerungBetreff(3), "Dein Vexfit-Profil wartet auf dich");
  assertEquals(erinnerungBetreff(4), "Dein Vexfit-Profil ist zu 4 von 8 fertig");
  assertEquals(erinnerungBetreff(6), "Dein Vexfit-Profil ist zu 6 von 8 fertig");
  assertEquals(erinnerungBetreff(7), "Nur noch eine Angabe bis zu deinem fertigen Profil");
});

// Fehlende Angaben genau einmal; Preis-Hinweis wie in der manuellen Mail.
Deno.test("Teil 4: fehlende Angaben genau einmal + Preiszeile (kostenlos/49,99/monatlich kündbar)", () => {
  const m = mailErinnerung(trainer({ avatar_url: "", preis_stunde: 0, telefon: "" }), 1, "t");
  const zaehle = (s: string, teil: string) => s.split(teil).length - 1;
  assertEquals(zaehle(m.text, "Foto, Preis pro Stunde, Telefon"), 1);
  assertEquals(zaehle(m.html, "Foto, Preis pro Stunde, Telefon"), 1);
  assert(!m.text.includes("Es fehlt noch:"), "eigene Es-fehlt-noch-Zeile doppelt");
  // Preis-Hinweis wortgleich zur manuellen Erinnerung.
  assertStringIncludes(m.text, "kostenlos, bis du die erste Kundenanfrage über Vexfit annimmst");
  assertStringIncludes(m.text, "49,99 €/Monat");
  assertStringIncludes(m.text, "monatlich kündbar");
  assertStringIncludes(m.text, "9,99 €");
});

Deno.test("Fußzeile: alle drei Stufen – Salzburg · Österreich, Impressum-Link, Abmelde-Link; keine Adresse/Telefon", () => {
  for (const stufe of [1, 2, 3]) {
    const m = mailErinnerung(trainer(), stufe, "tok-9");
    for (const fassung of [m.text, m.html]) {
      // Pflichtinhalt.
      assertStringIncludes(fassung, "Salzburg · Österreich");
      assertStringIncludes(fassung, "https://vexfit.app/rechtliches.html");
      assertStringIncludes(fassung, "erinnerung-abmelden?token=tok-9");
      // Keine Straße/PLZ/Telefon in der Fußzeile.
      assert(!fassung.includes("Kreuzbichl"), `Stufe ${stufe}: Straße in der Fußzeile`);
      assert(!fassung.includes("5330"), `Stufe ${stufe}: PLZ in der Fußzeile`);
      assert(!fassung.includes("Fuschl am See"), `Stufe ${stufe}: Ort/Anschrift in der Fußzeile`);
      assert(!/\+?\d[\d /()-]{6,}\d/.test(fassung), `Stufe ${stufe}: Telefonnummer in der Mail`);
    }
    // Erste Zeile der Fußzeile beginnt mit "Vexfit.app · Salzburg · Österreich".
    assertStringIncludes(m.text, "Vexfit.app · Salzburg · Österreich");
  }
});

Deno.test("Fußzeile: Reihenfolge Adresse → Impressum → Abmelde", () => {
  const t = mailErinnerung(trainer(), 1, "tok-r").text;
  const pAdr = t.indexOf("Salzburg · Österreich");
  const pImp = t.indexOf("rechtliches.html");
  const pAb = t.indexOf("erinnerung-abmelden");
  assert(pAdr >= 0 && pImp > pAdr && pAb > pImp, `falsche Reihenfolge: Adresse@${pAdr} Impressum@${pImp} Abmelde@${pAb}`);
});

// ── Endpunkt: Cron-Schlüssel + Versand ──────────────────────────────────────
interface Spur { mails: Mail[]; stufen: { id: string; stufe: number }[]; protokoll: { id: string; art: ProfilErinnerungArt }[]; }
function baue(
  opt: {
    kandidaten?: TrainerProfil[];
    mailWirft?: boolean;
    ohneVerdrahtung?: boolean;
    letzteMap?: Record<string, { am: string; art: ProfilErinnerungArt }>;
  } = {},
): { a: Anschluesse; spur: Spur } {
  const spur: Spur = { mails: [], stufen: [], protokoll: [] };
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
    // Gemeinsamer letzter Versand (für den 3-Tage-Abstand) und Protokoll.
    base.profilErinnerungLetzteMap = () => Promise.resolve(opt.letzteMap ?? {});
    base.profilErinnerungProtokollieren = (id: string, _fehlende: string[], art: ProfilErinnerungArt) => {
      spur.protokoll.push({ id, art });
      return Promise.resolve();
    };
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

Deno.test("Teil 4: ein fälliger Trainer → genau 1 Mail (Stufe 1); zweiter Lauf ohne neue Schwelle → keine", async () => {
  const { a, spur } = baue({ kandidaten: [trainer({ created_at: vorStundenNun(3) })] });
  const d1 = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d1.mails, 1);
  assertEquals(spur.mails.length, 1);
  assertEquals(spur.mails[0].betreff, mailErinnerung(trainer(), 1, "t").betreff);
  // Zweiter Lauf: Stufe 1 schon beansprucht, Stufe 2 (3 Tage) noch nicht fällig → keine Mail.
  const d2 = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d2.mails, 0);
  assertEquals(spur.mails.length, 1);
});

Deno.test("Teil 4: nicht fällige Kandidaten bekommen nichts", async () => {
  const { a, spur } = baue({ kandidaten: [
    trainer({ id: "voll", telefon: "+43 1" }),       // vollständig
    trainer({ id: "fertig", created_at: vorStundenNun(240), erinnerung_stufe: 3 }), // alle drei Stufen verschickt
    trainer({ id: "frisch", created_at: vorStundenNun(0.5) }), // zu früh (< 2 h)
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

Deno.test("Teil 4: automatischer Versand wird mit Art automatisch protokolliert", async () => {
  const { a, spur } = baue({ kandidaten: [trainer({ id: "auto", created_at: vorStundenNun(3) })] });
  const d = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d.mails, 1);
  assertEquals(spur.protokoll.length, 1);
  assertEquals(spur.protokoll[0], { id: "auto", art: "automatisch" });
});

Deno.test("Teil 4: 3-Tage-Abstand – letzte (manuelle) Erinnerung < 3 Tage → Automatik sendet nicht", async () => {
  const vor1Tag = new Date(Date.now() - 1 * 86_400_000).toISOString();
  const { a, spur } = baue({
    kandidaten: [trainer({ id: "x", created_at: vorStundenNun(30) })], // Stufe 1 wäre nach Zeit fällig
    letzteMap: { x: { am: vor1Tag, art: "manuell" } }, // aber vor 1 Tag schon manuell erinnert
  });
  const d = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d.mails, 0);
  assertEquals(d.abstand_uebersprungen, 1);
  assertEquals(spur.mails.length, 0);
  assertEquals(spur.stufen.length, 0); // keine Stufe verbraucht
});

Deno.test("Teil 4: 3-Tage-Abstand – letzte Erinnerung ≥ 3 Tage → Automatik sendet wieder", async () => {
  const vor5Tagen = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { a, spur } = baue({
    kandidaten: [trainer({ id: "y", created_at: vorStundenNun(30) })],
    letzteMap: { y: { am: vor5Tagen, art: "automatisch" } },
  });
  const d = await (await bearbeiten(cronReq(), a)).json();
  assertEquals(d.mails, 1);
  assertEquals(spur.mails.length, 1);
});

// Simulierte Uhr: ein Cron-Lauf zum Zeitpunkt „elapsedH Stunden nach
// Registrierung", mit bereits verschickter Stufe und – wenn gesetzt – einem
// letzten Versand vor sinceLastH Stunden (egal welcher Art).
async function lauf(opt: { elapsedH: number; bereits: number; sinceLastH?: number; extra?: Partial<TrainerProfil> }) {
  const kand = trainer({ id: "sim", created_at: vorStundenNun(opt.elapsedH), erinnerung_stufe: opt.bereits, ...opt.extra });
  const letzteMap = opt.sinceLastH != null
    ? { sim: { am: new Date(Date.now() - opt.sinceLastH * 3_600_000).toISOString(), art: "automatisch" as const } }
    : undefined;
  const { a, spur } = baue({ kandidaten: [kand], letzteMap });
  const d = await (await bearbeiten(cronReq(), a)).json();
  return { d, spur };
}
const TAG = 24;

Deno.test("Teil 4: Zeitstrahl ohne manuelle Mail – 2 h, 3 Tage (+2 h), 7 Tage, danach nichts", async () => {
  // 2 h nach Registrierung, noch nichts verschickt → Stufe 1.
  let r = await lauf({ elapsedH: 2, bereits: 0 });
  assertEquals(r.d.mails, 1);
  assertEquals(r.spur.stufen[0].stufe, 1);

  // Genau 3 Tage: Stufe 1 ging vor 70 h (bei 2 h) → 3-Tage-Abstand noch nicht
  // erfüllt → verschoben, keine Mail.
  r = await lauf({ elapsedH: 3 * TAG, bereits: 1, sinceLastH: 3 * TAG - 2 });
  assertEquals(r.d.mails, 0);
  assertEquals(r.d.abstand_uebersprungen, 1);

  // 3 Tage + 2 h: Abstand zur 2-h-Mail jetzt 72 h → Stufe 2 geht raus.
  r = await lauf({ elapsedH: 3 * TAG + 2, bereits: 1, sinceLastH: 3 * TAG });
  assertEquals(r.d.mails, 1);
  assertEquals(r.spur.stufen[0].stufe, 2);

  // 7 Tage: Stufe 2 ging vor ~94 h → Abstand erfüllt, Schwelle 7 Tage erreicht → Stufe 3.
  r = await lauf({ elapsedH: 7 * TAG, bereits: 2, sinceLastH: 7 * TAG - (3 * TAG + 2) });
  assertEquals(r.d.mails, 1);
  assertEquals(r.spur.stufen[0].stufe, 3);

  // Danach: alle drei verschickt → nie mehr etwas.
  r = await lauf({ elapsedH: 30 * TAG, bereits: 3, sinceLastH: 20 * TAG });
  assertEquals(r.d.mails, 0);
});

Deno.test("Teil 4: manuelle Mail an Tag 2 verschiebt Stufe 2 auf Tag 5 (nie zwei Mails in 3 Tagen)", async () => {
  // Tag 3: Stufe 2 wäre nach Zeit fällig, aber die manuelle Mail an Tag 2 ist
  // erst 1 Tag her → verschoben.
  let r = await lauf({ elapsedH: 3 * TAG, bereits: 1, sinceLastH: 1 * TAG });
  assertEquals(r.d.mails, 0);
  assertEquals(r.d.abstand_uebersprungen, 1);

  // Tag 4: manuelle Mail 2 Tage her → noch gesperrt.
  r = await lauf({ elapsedH: 4 * TAG, bereits: 1, sinceLastH: 2 * TAG });
  assertEquals(r.d.mails, 0);

  // Tag 5: manuelle Mail 3 Tage her → Stufe 2 wird nachgeholt.
  r = await lauf({ elapsedH: 5 * TAG, bereits: 1, sinceLastH: 3 * TAG });
  assertEquals(r.d.mails, 1);
  assertEquals(r.spur.stufen[0].stufe, 2);
});

Deno.test("Teil 4: 8/8 oder Test/Spam während der Wartezeit stoppt die Folge", async () => {
  // Profil inzwischen vollständig (Telefon ergänzt) → keine weitere Stufe.
  let r = await lauf({ elapsedH: 7 * TAG, bereits: 1, extra: { telefon: "+43 660 2" } });
  assertEquals(r.d.mails, 0);
  // Konto als Test/Spam markiert → keine weitere Stufe.
  r = await lauf({ elapsedH: 7 * TAG, bereits: 1, extra: { ist_test: true } });
  assertEquals(r.d.mails, 0);
});

Deno.test("Teil 4: docs/erinnerungs-mails.md enthält die drei Betreffe (nach Vollständigkeit)", async () => {
  const doc = await Deno.readTextFile(new URL("../../../docs/erinnerungs-mails.md", import.meta.url));
  for (const erfuellt of [0, 5, 7]) {
    assertStringIncludes(doc, erinnerungBetreff(erfuellt));
  }
  assertStringIncludes(doc, "Salzburg · Österreich");
  assertStringIncludes(doc, "monatlich kündbar"); // Preis-Hinweis dokumentiert
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
