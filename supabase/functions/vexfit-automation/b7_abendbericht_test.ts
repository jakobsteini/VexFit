// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/b7_abendbericht_test.ts
//
// B7 (Dauerlauf 2026-11-03): Abendbericht um 16:00 Wiener Zeit.
//   - wienerStunde: zwei UTC-Zeitpläne (14:00/15:00), ganzjährig genau einer auf
//     16 Uhr Wien -> keine Doppelsendung.
//   - Inhalt/Zahlen (Mail = alles, Push = Kurzfassung), leerer Tag.
//   - Schutz ohne Schlüssel (401).
// DB/SMTP/Push gemockt.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type AbendberichtZahlen,
  abendberichtZahlenHolen,
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  mailAbendbericht,
  type PushNachricht,
  pushAbendbericht,
  wienerStunde,
} from "./kern.ts";

const VOLL: AbendberichtZahlen = {
  neueTrainer: 2,
  neueTrainerHerkunft: [{ quelle: "meta – t1", anzahl: 1 }, { quelle: "direkt/unbekannt", anzahl: 1 }],
  neueKunden: 3,
  wartenNamen: ["Max Muster", "Lea Berg"],
  bereitFreigabe: [{ name: "Lea Berg", erfuellt: 6 }],
  anfragenOffen: 1, anfragenNeu24h: 2, anfragenZurPruefung: 0, anfragenAngenommen24h: 1, anfragenAbgelehnt24h: 0, ersatzVersendet: 0,
  warteliste: 4,
  bezahlt: 2,
  zahlungFehlgeschlagen: 1,
  gekuendigt: 0,
  trichter24h: [],
  profileUnter5: 0,
  profilErinnerungen24h: 0,
  profilErinnerungenGesamt: 0,
  kundenTrichter24h: { seite: 0, suche: 0, treffer: 0, profil: 0, anfrage_start: 0, anfrage: 0 },
  salzburg: null,
  fehler: [],
  cronHinweise: [],
};
const LEER: AbendberichtZahlen = {
  neueTrainer: 0, neueTrainerHerkunft: [], neueKunden: 0, wartenNamen: [], bereitFreigabe: [],
  anfragenOffen: 0, anfragenNeu24h: 0, anfragenZurPruefung: 0, anfragenAngenommen24h: 0, anfragenAbgelehnt24h: 0, ersatzVersendet: 0, warteliste: 0, bezahlt: 0, zahlungFehlgeschlagen: 0, gekuendigt: 0,
  trichter24h: [], profileUnter5: 0, profilErinnerungen24h: 0, profilErinnerungenGesamt: 0, kundenTrichter24h: { seite: 0, suche: 0, treffer: 0, profil: 0, anfrage_start: 0, anfrage: 0 }, salzburg: null, fehler: [], cronHinweise: [],
};
// Wie VOLL, aber trainer_alerts lieferte 404 (Wartelisten-Zahl fehlt).
const TEILWEISE: AbendberichtZahlen = {
  ...VOLL,
  warteliste: 0,
  fehler: [{ feld: "Wartelisten-Einträge ohne Trainer", grund: "HTTP 404" }],
};

Deno.test("wienerStunde: ganzjährig trifft genau ein UTC-Zeitplan 16 Uhr Wien", () => {
  // Sommerzeit (CEST, UTC+2): 14:00 UTC = 16:00 Wien.
  assertEquals(wienerStunde(new Date("2026-07-01T14:00:00Z")), 16);
  assertEquals(wienerStunde(new Date("2026-07-01T15:00:00Z")), 17); // sendet nicht
  // Winterzeit (CET, UTC+1): 15:00 UTC = 16:00 Wien.
  assertEquals(wienerStunde(new Date("2026-01-01T15:00:00Z")), 16);
  assertEquals(wienerStunde(new Date("2026-01-01T14:00:00Z")), 15); // sendet nicht
});

Deno.test("Mail = alles, Push = Kurzfassung", () => {
  const m = mailAbendbericht(VOLL);
  assertEquals(m.an, "office@vexfit.app");
  const inhalt = m.text + m.html;
  assertStringIncludes(inhalt, "Neue Trainer (24 h)");
  assertStringIncludes(inhalt, "meta – t1: 1");
  assertStringIncludes(inhalt, "Max Muster");
  assertStringIncludes(inhalt, "Anfragen ohne Antwort");
  assertStringIncludes(inhalt, "bezahlt 2, fehlgeschlagen 1, gekündigt 0");
  const p = pushAbendbericht(VOLL);
  assertStringIncludes(p.text, "2 Trainer · 3 Kunden · 2 warten · 1 offen");
});

Deno.test("Leerer Tag: trotzdem 'Heute nichts Neues'", () => {
  assertStringIncludes((mailAbendbericht(LEER).text + mailAbendbericht(LEER).html), "Heute nichts Neues");
  assertStringIncludes(pushAbendbericht(LEER).text, "Heute nichts Neues");
});

type Protokolleintrag = { admin_id?: string; aktion: string; ergebnis?: string };

function baue(opt: { geheim?: string; jetzt?: Date; zahlen?: AbendberichtZahlen; mailFehler?: boolean } = {}) {
  const mails: Mail[] = [];
  const pushes: PushNachricht[] = [];
  const prot: Protokolleintrag[] = [];
  const base: Record<string, unknown> = {
    cronGeheimnis: () => opt.geheim ?? "geheim",
    jetzt: () => opt.jetzt ?? new Date("2026-07-01T14:00:00Z"), // 16 Uhr Wien
    abendberichtZahlen: () => Promise.resolve(opt.zahlen ?? VOLL),
    mailSenden: (m: Mail) => {
      if (opt.mailFehler) return Promise.reject(new Error("SMTP kaputt"));
      mails.push(m);
      return Promise.resolve();
    },
    vapidVorhanden: () => true,
    pushAbosLesen: () => Promise.resolve([{ endpoint: "https://push/x", p256dh: "k", auth: "a" }]),
    pushEinzelSenden: (_abo: unknown, n: PushNachricht) => { pushes.push(n); return Promise.resolve(201); },
    protokoll: (e: Protokolleintrag) => { prot.push(e); return Promise.resolve(); },
    melden: () => {},
  };
  return { a: base as unknown as Anschluesse, mails, pushes, prot };
}

function req(key: string | null): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/abendbericht",
    { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-vexfit-cron": key } : {}) }, body: "{}" },
  );
}

Deno.test("Schutz: ohne/falscher Schlüssel -> 401, nichts gesendet", async () => {
  const b1 = baue();
  assertEquals((await bearbeiten(req(null), b1.a)).status, 401);
  const b2 = baue();
  assertEquals((await bearbeiten(req("falsch"), b2.a)).status, 401);
  assertEquals(b2.mails.length, 0);
});

Deno.test("Um 16 Uhr Wien: Mail + Push gehen raus", async () => {
  const b = baue({ jetzt: new Date("2026-07-01T14:00:00Z") }); // 16 Uhr Wien
  const d = await (await bearbeiten(req("geheim"), b.a)).json();
  assertEquals(d.gesendet, true);
  assertEquals(b.mails.length, 1);
  assertEquals(b.pushes.length, 1);
});

Deno.test("Nicht 16 Uhr Wien: kein Versand (keine Doppelsendung)", async () => {
  const b = baue({ jetzt: new Date("2026-07-01T15:00:00Z") }); // 17 Uhr Wien
  const d = await (await bearbeiten(req("geheim"), b.a)).json();
  assertEquals(d.gesendet, false);
  assertEquals(d.uebersprungen, "nicht 16 Uhr Wien");
  assertEquals(b.mails.length, 0);
  assert(b.pushes.length === 0);
});

Deno.test("B7: Migration legt zwei Zeitpläne an (nur Datei)", async () => {
  const sql = await Deno.readTextFile(new URL("../../../migrations/2026-11-03-04-abendbericht.sql", import.meta.url));
  assertStringIncludes(sql, "'0 14 * * *'");
  assertStringIncludes(sql, "'0 15 * * *'");
  assertStringIncludes(sql, "/vexfit-automation/abendbericht");
  assertStringIncludes(sql, "vexfit_cron_key");
  assertStringIncludes(sql, "NICHT eingespielt");
});

// ── Fix-Baustein 2026-11-04: Lauf sichtbar machen + Admin-Test-Auslöser ──

Deno.test("Leerer Tag um 16 Uhr: Bericht geht trotzdem raus und wird protokolliert", async () => {
  const b = baue({ jetzt: new Date("2026-07-01T14:00:00Z"), zahlen: LEER }); // 16 Uhr Wien
  const d = await (await bearbeiten(req("geheim"), b.a)).json();
  assertEquals(d.gesendet, true);
  assertEquals(b.mails.length, 1);
  assertStringIncludes(b.mails[0].text + b.mails[0].html, "Heute nichts Neues");
  assertEquals(b.prot.length, 1);
  assertEquals(b.prot[0].aktion, "abendbericht");
  assertStringIncludes(b.prot[0].ergebnis ?? "", "erfolgreich (zeitplan)");
});

Deno.test("Jeder Lauf schreibt einen Protokolleintrag (Versand UND Übersprungen)", async () => {
  const gesendet = baue({ jetzt: new Date("2026-07-01T14:00:00Z") }); // 16 Uhr Wien
  await bearbeiten(req("geheim"), gesendet.a);
  assertEquals(gesendet.prot.length, 1);
  assertStringIncludes(gesendet.prot[0].ergebnis ?? "", "erfolgreich (zeitplan)");

  const uebersprungen = baue({ jetzt: new Date("2026-07-01T15:00:00Z") }); // 17 Uhr Wien
  await bearbeiten(req("geheim"), uebersprungen.a);
  assertEquals(uebersprungen.prot.length, 1);
  assertStringIncludes(uebersprungen.prot[0].ergebnis ?? "", "übersprungen");
  assertEquals(uebersprungen.mails.length, 0);
});

Deno.test("Versandfehler wird nicht verschluckt: Fehler im Protokoll, Antwort 500", async () => {
  const b = baue({ jetzt: new Date("2026-07-01T14:00:00Z"), mailFehler: true });
  const res = await bearbeiten(req("geheim"), b.a);
  assertEquals(res.status, 500);
  assertEquals(b.prot.length, 1);
  assertStringIncludes(b.prot[0].ergebnis ?? "", "Fehler (zeitplan)");
});

function baueAdmin(opt: { aal?: string; nutzerId?: string; zahlen?: AbendberichtZahlen } = {}) {
  const b = baue({ zahlen: opt.zahlen });
  (b.a as unknown as Record<string, unknown>).benutzerAusToken = (_t: string) =>
    Promise.resolve({ id: opt.nutzerId ?? ADMIN_ID, email: "admin@vexfit.app", aal: opt.aal ?? "aal2" });
  return b;
}
function adminReq(payload: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/admin-aktion",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" }, body: JSON.stringify(payload) },
  );
}

Deno.test("Test-Auslöser: Admin mit aal2 sendet sofort, ohne 16-Uhr-Prüfung", async () => {
  const b = baueAdmin({ zahlen: LEER });
  // Uhrzeit absichtlich NICHT 16 Uhr Wien – der Knopf ignoriert sie.
  (b.a as unknown as Record<string, unknown>).jetzt = () => new Date("2026-07-01T09:00:00Z");
  const res = await bearbeiten(adminReq({ aktion: "abendbericht_jetzt" }), b.a);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.gesendet, true);
  assertEquals(b.mails.length, 1);
  assertEquals(b.prot.length, 1);
  assertEquals(b.prot[0].admin_id, ADMIN_ID);
  assertStringIncludes(b.prot[0].ergebnis ?? "", "erfolgreich (admin)");
});

Deno.test("Test-Auslöser verlangt zweiten Faktor: aal1 -> 403, kein Versand, kein Protokoll", async () => {
  const b = baueAdmin({ aal: "aal1" });
  const res = await bearbeiten(adminReq({ aktion: "abendbericht_jetzt" }), b.a);
  assertEquals(res.status, 403);
  assertEquals(b.mails.length, 0);
  assertEquals(b.prot.length, 0);
});

Deno.test("Test-Auslöser: Nicht-Admin -> 403", async () => {
  const b = baueAdmin({ nutzerId: "nicht-admin", aal: "aal2" });
  const res = await bearbeiten(adminReq({ aktion: "abendbericht_jetzt" }), b.a);
  assertEquals(res.status, 403);
  assertEquals(b.mails.length, 0);
});

// ── Fix-Baustein 2026-11-04b: eine einzelne 404-Zahl darf den Bericht nicht kippen ──

Deno.test("(a) trainer_alerts 404: Bericht geht raus, zeigt 'nicht verfügbar' + Technische Hinweise, Protokoll 'teilweise'", async () => {
  const b = baue({ jetzt: new Date("2026-07-01T14:00:00Z"), zahlen: TEILWEISE }); // 16 Uhr Wien
  const d = await (await bearbeiten(req("geheim"), b.a)).json();
  assertEquals(d.gesendet, true);
  assertEquals(b.mails.length, 1);
  const inhalt = b.mails[0].text + b.mails[0].html;
  assertStringIncludes(inhalt, "nicht verfügbar (Fehler: HTTP 404)");
  assertStringIncludes(inhalt, "Technische Hinweise");
  assertEquals(b.prot.length, 1);
  assertStringIncludes(b.prot[0].ergebnis ?? "", "teilweise (zeitplan)");
  assertStringIncludes(b.prot[0].ergebnis ?? "", "HTTP 404");
});

Deno.test("(b) alle Werte ok: kein Hinweis-Abschnitt, Protokoll 'erfolgreich'", async () => {
  const b = baue({ jetzt: new Date("2026-07-01T14:00:00Z"), zahlen: VOLL }); // 16 Uhr Wien
  await (await bearbeiten(req("geheim"), b.a)).json();
  const inhalt = b.mails[0].text + b.mails[0].html;
  assert(!inhalt.includes("Technische Hinweise"), "kein Hinweis-Abschnitt erwartet");
  assert(!inhalt.includes("nicht verfügbar"), "kein 'nicht verfügbar' erwartet");
  assertStringIncludes(b.prot[0].ergebnis ?? "", "erfolgreich (zeitplan)");
});

Deno.test("abendberichtZahlenHolen: ein 404 beim Zählen bricht nicht ab, wird als fehler erfasst", async () => {
  const lesenStub = <T>(pfad: string): Promise<T[]> => {
    if (pfad.startsWith("trainers?created_at")) return Promise.resolve([{ herkunft: "meta" }] as T[]);
    return Promise.resolve([] as T[]); // warten + zahlungen: leer
  };
  const zaehlenStub = (pfad: string): Promise<number> => {
    if (pfad.startsWith("trainer_alerts")) {
      return Promise.reject(new Error("Zaehlen von trainer_alerts fehlgeschlagen: HTTP 404"));
    }
    return Promise.resolve(0); // kunden + anfragen
  };
  const z = await abendberichtZahlenHolen(lesenStub, zaehlenStub, Date.now());
  // Der 404 landet als Fehler, der Rest ist da (kein Abbruch, kein throw).
  assertEquals(z.neueTrainer, 1);
  assertEquals(z.warteliste, 0);
  assertEquals(z.fehler.length, 1);
  assertEquals(z.fehler[0].feld, "Wartelisten-Einträge ohne Trainer");
  assertEquals(z.fehler[0].grund, "HTTP 404");
});

Deno.test("Abendbericht: fehlgeschlagene Cron-Läufe (24 h) erscheinen unter Technische Hinweise", async () => {
  const lesenStub = <T>(_p: string): Promise<T[]> => Promise.resolve([] as T[]);
  const zaehlenStub = (_p: string): Promise<number> => Promise.resolve(0);
  // Aus admin_protokoll: nur teilweise/fehlgeschlagen zählen, „erfolgreich" nicht.
  const protokollStub = (_seitISO: string) => Promise.resolve([
    { aktion: "erinnerungen", ergebnis: "teilweise (1 von 3 fehlgeschlagen: SMTP dicht)" },
    { aktion: "unbeantwortet", ergebnis: "erfolgreich: 2 Mail(s)" },
    { aktion: "abendbericht", ergebnis: "fehlgeschlagen (HTTP 500)" },
  ]);
  const z = await abendberichtZahlenHolen(lesenStub, zaehlenStub, Date.now(), protokollStub);
  assertEquals(z.cronHinweise.length, 2); // erfolgreich wird herausgefiltert
  const m = mailAbendbericht(z);
  const inhalt = m.text + m.html;
  assertStringIncludes(inhalt, "Technische Hinweise");
  assertStringIncludes(inhalt, "Cron-Läufe mit Fehler (24 h)");
  assertStringIncludes(inhalt, "teilweise (1 von 3");
});
