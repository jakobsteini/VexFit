// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/b4_warteliste_test.ts
//
// B4 (Dauerlauf 2026-11-03): Warteliste, die Kunden zurückholt.
//   B4.1 Bestätigungsmail sofort nach dem Eintrag ("Benachrichtige mich").
//   B4.2 Bei Trainer-Freigabe: alle offenen Einträge in der PLZ-Region des
//        Trainers genau einmal benachrichtigen, danach schließen (nie doppelt).
// DB/SMTP gemockt – nichts geht ins Netz.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type Mail,
  mailTrainerDa,
  mailWartelisteBestaetigung,
} from "./kern.ts";

interface Alert { id: string; kunden_email: string; kunden_name?: string; plz: string; stadt?: string; abmelde_token?: string; aktiv: boolean }

function baue(opt: { alerts?: Alert[]; trainerPlz?: string | null; nutzerEmail?: string } = {}) {
  const alerts = opt.alerts ?? [];
  const mails: Mail[] = [];
  const abgemeldet: string[] = [];
  const base: Record<string, unknown> = {
    benutzerAusToken: () => Promise.resolve({ id: ADMIN_ID, email: opt.nutzerEmail ?? "admin@vexfit.app", aal: "aal2" }),
    mailSenden: (m: Mail) => { mails.push(m); return Promise.resolve(); },
    // B4.2
    adminTrainerSetzen: () => Promise.resolve(1),
    trainerProfilNachId: () => Promise.resolve({ id: "t1", email: "t@x.at", freischalt_mail_gesendet: "2026-11-03" }), // Freischalt-Mail schon gesendet -> hier kein zusätzlicher Versand
    trainerPlzNachId: () => Promise.resolve(opt.trainerPlz ?? "5020"),
    alertsOffeneFuerPlz: (plz: string) => Promise.resolve(alerts.filter((a) => a.plz === plz && a.aktiv)),
    alertSchliessen: (id: string) => {
      const a = alerts.find((x) => x.id === id);
      if (a && a.aktiv) { a.aktiv = false; return Promise.resolve(true); }
      return Promise.resolve(false);
    },
    // B4.1
    alertFuerBestaetigung: (email: string, plz: string) =>
      Promise.resolve(alerts.find((a) => a.kunden_email === email && a.aktiv && (!plz || a.plz === plz)) ?? null),
    alertAbmelden: (token: string) => { abgemeldet.push(token); const a = alerts.find((x) => x.abmelde_token === token); if (a) a.aktiv = false; return Promise.resolve(!!a); },
    protokoll: () => Promise.resolve(),
    melden: () => {},
  };
  return { a: base as unknown as Anschluesse, mails, alerts, abgemeldet };
}

function adminReq(payload: Record<string, unknown>): Request {
  return new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/admin-aktion",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer t" }, body: JSON.stringify(payload) },
  );
}

const AL = (id: string, plz: string, over: Partial<Alert> = {}): Alert => ({ id, plz, kunden_email: `${id}@kunde.at`, abmelde_token: `tok-${id}`, aktiv: true, ...over });

Deno.test("B4.2: Freigabe benachrichtigt genau die Einträge in der PLZ-Region, je einmal", async () => {
  const { a, mails, alerts } = baue({
    trainerPlz: "5020",
    alerts: [AL("a", "5020"), AL("b", "5020"), AL("c", "1010")], // c ist woanders
  });
  const res = await bearbeiten(adminReq({ aktion: "trainer_aktivieren", ziel_id: "t1" }), a);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.warteliste.mails, 2); // a und b, nicht c
  assertEquals(mails.map((m) => m.an).sort(), ["a@kunde.at", "b@kunde.at"]);
  // a und b sind jetzt geschlossen, c unberührt.
  assertEquals(alerts.find((x) => x.id === "a")!.aktiv, false);
  assertEquals(alerts.find((x) => x.id === "b")!.aktiv, false);
  assertEquals(alerts.find((x) => x.id === "c")!.aktiv, true);
});

Deno.test("B4.2: ausserhalb der PLZ-Region keine Mail", async () => {
  const { a, mails } = baue({ trainerPlz: "9999", alerts: [AL("a", "5020"), AL("b", "1010")] });
  const d = await (await bearbeiten(adminReq({ aktion: "trainer_aktivieren", ziel_id: "t1" }), a)).json();
  assertEquals(d.warteliste.mails, 0);
  assertEquals(mails.length, 0);
});

Deno.test("B4.2: zweite Freigabe löst keine zweite Mail aus; abgemeldete bekommen nichts", async () => {
  const bau = baue({ trainerPlz: "5020", alerts: [AL("a", "5020"), AL("b", "5020", { aktiv: false })] }); // b ist abgemeldet
  const d1 = await (await bearbeiten(adminReq({ aktion: "trainer_aktivieren", ziel_id: "t1" }), bau.a)).json();
  assertEquals(d1.warteliste.mails, 1); // nur a (b abgemeldet)
  // zweite Freigabe: a ist jetzt geschlossen -> keine weitere Mail
  const d2 = await (await bearbeiten(adminReq({ aktion: "trainer_aktivieren", ziel_id: "t1" }), bau.a)).json();
  assertEquals(d2.warteliste.mails, 0);
  assertEquals(bau.mails.length, 1);
});

Deno.test("B4.1: Bestätigung wird an die eigene E-Mail (aus dem Token) gesendet", async () => {
  const { a, mails } = baue({ nutzerEmail: "a@kunde.at", alerts: [AL("a", "5020", { stadt: "Salzburg" })] });
  const req = new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/warteliste-bestaetigung",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer t" }, body: JSON.stringify({ plz: "5020", stadt: "Salzburg" }) },
  );
  const d = await (await bearbeiten(req, a)).json();
  assertEquals(d.mails, 1);
  assertEquals(mails[0].an, "a@kunde.at");
  assertStringIncludes(mails[0].betreff, "Wir haben deine Anfrage");
});

Deno.test("B4.1: Abmelde-Link (GET) schließt den Eintrag und zeigt eine Seite", async () => {
  const { a, alerts } = baue({ alerts: [AL("a", "5020")] });
  const req = new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/warteliste-abmelden?token=tok-a",
    { method: "GET", headers: { Origin: ERLAUBTE_HERKUNFT } },
  );
  const res = await bearbeiten(req, a);
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") || "", "text/html");
  assertEquals(alerts.find((x) => x.id === "a")!.aktiv, false);
});

Deno.test("B4: Mail-Texte und Abmelde-Link stimmen", () => {
  const e = { id: "a", kunden_email: "a@kunde.at", kunden_name: "Mia", plz: "5020", stadt: "Salzburg", abmelde_token: "tok-a" };
  const best = mailWartelisteBestaetigung(e);
  assertStringIncludes(best.text + best.html, "Salzburg (5020)");
  assertStringIncludes(best.html, "warteliste-abmelden?token=tok-a");
  const da = mailTrainerDa(e);
  assertStringIncludes(da.betreff, "Ein Trainer in deiner Nähe ist da");
  assertStringIncludes(da.html, "/suche.html");
  assertStringIncludes(da.html, "warteliste-abmelden?token=tok-a");
});
