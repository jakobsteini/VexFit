// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/profil_erinnerung_test.ts
//
// Baustein „Profil-Erinnerung an registrierte Trainer" (08.11.2026). Supabase und
// Mailweg sind gemockt – es geht nichts ins Netz, keine echte Mail. Geprüft:
//   * Mailinhalt: fehlende Angaben korrekt, Link korrekt, keine Adresse, kein
//     voller Nachname; AGB-konforme Preis-Formulierung.
//   * 14-Tage-Sperre, Ablehnung für 8/8 und Test/Spam (serverseitig).
//   * nur Admin mit aal2 darf auslösen; Vorschau sendet NICHT.
//   * Liste schließt Test/Spam aus, Raum Salzburg zuerst, nach x/8 aufsteigend.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  erinnerungZiel,
  ERLAUBTE_HERKUNFT,
  istSalzburgPlz,
  type Mail,
  mailProfilErinnerung,
  profilErinnerungDarf,
  profilErinnerungListe,
  SALZBURG_PLZ_PRAEFIXE,
  type TrainerProfil,
} from "./kern.ts";

// Ein Trainer, dem genau Foto und Preis fehlen → 6 von 8. Nachname als Köder.
function trainer(ueber: Partial<TrainerProfil> = {}): TrainerProfil {
  return {
    id: "t6",
    vorname: "Max",
    nachname: "Mustermann",
    email: "max@example.com",
    stadt: "Salzburg",
    plz: "5020",
    avatar_url: null, // kein Foto
    trainingsart: "Functional",
    trainingsort: "vor ort",
    preis_stunde: 0, // kein Preis
    bio: "Hallo, ich bin Max und trainiere seit Jahren.",
    erfahrung: "5 Jahre",
    spezialisierungen: ["Kraft"],
    telefon: "+43 660 0000000",
    ...ueber,
  };
}
function vollstaendig(ueber: Partial<TrainerProfil> = {}): TrainerProfil {
  return trainer({
    avatar_url: "https://x.supabase.co/storage/v1/object/public/avatars/t.png",
    preis_stunde: 55,
    ...ueber,
  });
}
const vorTagen = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// ── Reine Logik ──

Deno.test("mailProfilErinnerung: fehlende Angaben, Link, kein Nachname, keine Adresse, AGB-Preis", () => {
  const m = mailProfilErinnerung(trainer());
  assertStringIncludes(m.betreff, "zu 6 von 8");
  assertStringIncludes(m.text, "6 von 8");
  assertStringIncludes(m.text, "Foto, Preis pro Stunde");
  // Die Liste der fehlenden Angaben steht genau EINMAL – im Fließtext –, nicht
  // doppelt als eigene Zeile; die (falsch eingezahlte) Zeile „Es fehlt noch" ist weg.
  const zaehle = (s: string, teil: string) => s.split(teil).length - 1;
  assertEquals(zaehle(m.text, "Foto, Preis pro Stunde"), 1);
  assertEquals(zaehle(m.html, "Foto, Preis pro Stunde"), 1);
  assert(!m.text.includes("Es fehlt noch"), "Doppelzeile im Text vorhanden");
  assert(!m.html.includes("Es fehlt noch"), "Doppelzeile im HTML vorhanden");
  // Link zur ersten fehlenden Angabe (Foto → Trainer-Bereich).
  assertStringIncludes(m.html, erinnerungZiel("Foto"));
  // AGB-konforme Preis-Formulierung, keine verbotene Variante.
  assertStringIncludes(m.text, "kostenlos, bis du die erste Kundenanfrage über Vexfit annimmst");
  // Nach der Gratisphase wird der Preis genannt (kein Überraschungseffekt):
  // Monatspreis UND „monatlich kündbar" UND der Preis je weiterem Kunden.
  assertStringIncludes(m.text, "49,99 €/Monat");
  assertStringIncludes(m.text, "monatlich kündbar");
  assertStringIncludes(m.text, "9,99 €");
  assert(!/bis zum ersten kunden|ersten kunden gewonnen/i.test(m.text));
  // Kein voller Nachname (auch nicht in HTML), nur „Max".
  assert(!m.text.includes("Mustermann"), "voller Nachname im Text");
  assert(!m.html.includes("Mustermann"), "voller Nachname im HTML");
  // Keine Adresse außer „Salzburg, Österreich"; keine Straße/Hausnummer.
  assertStringIncludes(m.html, "Vexfit · Salzburg, Österreich");
  assert(!/stra(ß|ss)e|\bweg\b|hausnummer/i.test(m.text), "Adresse im Text");
});

Deno.test("profilErinnerungDarf: 8/8, Test/Spam, 3-Tage-Abstand – unbestätigt egal", () => {
  // vollständig → abgelehnt
  assertEquals(profilErinnerungDarf(vollstaendig(), null).erlaubt, false);
  // Test/Spam → abgelehnt
  assertEquals(profilErinnerungDarf(trainer({ ist_test: true }), null).erlaubt, false);
  // innerhalb 3 Tagen (letzte Erinnerung, egal welcher Art) → abgelehnt
  assertEquals(profilErinnerungDarf(trainer(), vorTagen(1)).erlaubt, false);
  assertStringIncludes(profilErinnerungDarf(trainer(), vorTagen(1)).grund, "3-Tage-Abstand");
  // ab 3 Tagen → erlaubt
  assertEquals(profilErinnerungDarf(trainer(), vorTagen(5)).erlaubt, true);
  // noch nie erinnert → erlaubt (E-Mail-Bestätigung ist kein Faktor)
  assertEquals(profilErinnerungDarf(trainer(), null).erlaubt, true);
});

Deno.test("Salzburg-Präfixe 50/51", () => {
  assertEquals([...SALZBURG_PLZ_PRAEFIXE], ["50", "51"]);
  assert(istSalzburgPlz("5020"));
  assert(istSalzburgPlz("5110"));
  assert(!istSalzburgPlz("1010"));
  assert(!istSalzburgPlz(""));
});

Deno.test("profilErinnerungListe: ohne Test/Spam, Salzburg zuerst, x/8 aufsteigend", () => {
  const a = trainer({ id: "a", plz: "5020", spezialisierungen: [], erfahrung: "" }); // Salzburg, wenig
  const b = vollstaendig({ id: "b", plz: "5110", telefon: "" }); // Salzburg, fast voll (7/8)
  const c = trainer({ id: "c", plz: "1010", stadt: "Wien" }); // nicht Salzburg
  const d = trainer({ id: "d", plz: "5020", ist_test: true }); // ausgeschlossen
  const liste = profilErinnerungListe([b, c, a, d], {}, { "u-a": false });
  assertEquals(liste.map((e) => e.id), ["a", "b", "c"]);
  assert(liste[0].salzburg && liste[1].salzburg && !liste[2].salzburg);
  assert(liste[0].erfuellt <= liste[1].erfuellt);
  // E-Mail-Kennzeichen wird durchgereicht (user_id → bestätigt).
  const mitUser = profilErinnerungListe([trainer({ id: "x", user_id: "u-a" } as Partial<TrainerProfil>)], {}, { "u-a": false });
  assertEquals(mitUser[0].email_bestaetigt, false);
});

// ── Edge-Aktionen über bearbeiten() ──

interface Spur { mails: Mail[]; protokolliert: { trainerId: string; fehlende: string[]; art: string }[] }
function baue(opt: {
  aal?: string;
  profil?: TrainerProfil | null;
  letzte?: string | null;
  kandidaten?: TrainerProfil[];
} = {}): { anschluesse: Anschluesse; spur: Spur } {
  const spur: Spur = { mails: [], protokolliert: [] };
  const anschluesse = {
    benutzerAusToken: () => Promise.resolve({ id: ADMIN_ID, email: "a@vexfit.app", aal: opt.aal ?? "aal2" }),
    trainerProfilNachId: () => Promise.resolve(opt.profil === undefined ? trainer() : opt.profil),
    profilErinnerungLetzte: () => Promise.resolve(opt.letzte ?? null),
    profilErinnerungKandidaten: () => Promise.resolve(opt.kandidaten ?? []),
    profilErinnerungLetzteMap: () => Promise.resolve({}),
    emailBestaetigtMap: () => Promise.resolve({}),
    profilErinnerungProtokollieren: (trainerId: string, fehlende: string[], art: string) => { spur.protokolliert.push({ trainerId, fehlende, art }); return Promise.resolve(); },
    mailSenden: (m: Mail) => { spur.mails.push(m); return Promise.resolve(); },
    protokoll: () => Promise.resolve(),
    melden: () => {},
  } as unknown as Anschluesse;
  return { anschluesse, spur };
}
function req(payload: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/admin-aktion",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" }, body: JSON.stringify(payload) },
  );
}

Deno.test("Edge: nur aal2 darf auslösen (aal1 → 403)", async () => {
  const { anschluesse, spur } = baue({ aal: "aal1" });
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_senden", ziel_id: "t6" }), anschluesse);
  assertEquals(res.status, 403);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Edge: Vorschau sendet NICHT, liefert Betreff/Text", async () => {
  const { anschluesse, spur } = baue();
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_vorschau", ziel_id: "t6" }), anschluesse);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.darf, true);
  assertStringIncludes(d.betreff, "6 von 8");
  assertEquals(d.fehlend, ["Foto", "Preis pro Stunde"]);
  assertEquals(spur.mails.length, 0); // nichts gesendet
});

Deno.test("Edge: senden schickt Mail + protokolliert fehlende Angaben", async () => {
  const { anschluesse, spur } = baue();
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_senden", ziel_id: "t6" }), anschluesse);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.gesendet, true);
  assertEquals(spur.mails.length, 1);
  assertEquals(spur.protokolliert, [{ trainerId: "t6", fehlende: ["Foto", "Preis pro Stunde"], art: "manuell" }]);
});

Deno.test("Edge: 8/8 abgelehnt, nichts gesendet", async () => {
  const { anschluesse, spur } = baue({ profil: vollstaendig() });
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_senden", ziel_id: "t6" }), anschluesse);
  assertEquals(res.status, 400);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Edge: 3-Tage-Abstand – letzte Erinnerung < 3 Tage (auch automatisch) → manuell abgelehnt", async () => {
  // „manuell nach Automatik": letzte ist eine automatische Erinnerung von vor 1 Tag.
  const { anschluesse, spur } = baue({ letzte: vorTagen(1) });
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_senden", ziel_id: "t6" }), anschluesse);
  const d = await res.json();
  assertEquals(res.status, 400);
  assertStringIncludes(String(d.fehler), "3-Tage-Abstand");
  assertEquals(spur.mails.length, 0);
});

Deno.test("Edge: 3-Tage-Abstand – letzte Erinnerung ≥ 3 Tage → manuell erlaubt + protokolliert als manuell", async () => {
  const { anschluesse, spur } = baue({ letzte: vorTagen(5) });
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_senden", ziel_id: "t6" }), anschluesse);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.gesendet, true);
  assertEquals(spur.mails.length, 1);
  assertEquals(spur.protokolliert, [{ trainerId: "t6", fehlende: ["Foto", "Preis pro Stunde"], art: "manuell" }]);
});

Deno.test("Edge: Test/Spam abgelehnt", async () => {
  const { anschluesse, spur } = baue({ profil: trainer({ ist_test: true }) });
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_senden", ziel_id: "t6" }), anschluesse);
  assertEquals(res.status, 400);
  assertEquals(spur.mails.length, 0);
});

Deno.test("Edge: Liste schließt Test/Spam aus, Salzburg zuerst", async () => {
  const kandidaten = [
    vollstaendig({ id: "b", plz: "5110", telefon: "" }),
    trainer({ id: "c", plz: "1010", stadt: "Wien" }),
    trainer({ id: "a", plz: "5020", spezialisierungen: [], erfahrung: "" }),
    trainer({ id: "d", plz: "5020", ist_test: true }),
  ];
  const { anschluesse } = baue({ kandidaten });
  const res = await bearbeiten(req({ aktion: "profil_erinnerung_liste" }), anschluesse);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.eintraege.map((e: { id: string }) => e.id), ["a", "b", "c"]);
});
