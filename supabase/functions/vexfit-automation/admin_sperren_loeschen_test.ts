// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/admin_sperren_loeschen_test.ts
//
// Baustein „Admin-Bereich", Teil 5: Anmeldung sperren/entsperren und endgültig
// löschen über /admin-aktion. Supabase Auth-Admin-API und Datenbank sind
// gemockt – es geht nichts ins Netz. Geprüft wird die Logik in kern.ts:
//   * nur das Admin-Konto darf (sonst 403),
//   * Sperren ruft authSperren mit der richtigen user_id und setzt gesperrt,
//   * Löschen verlangt bestaetigt=true, löscht den Auth-Benutzer und die Zeile,
//     bzw. anonymisiert bei verknüpften Daten.
//
// Aufruf:  deno test --allow-run --allow-read --allow-env supabase/functions/vexfit-automation/
import { assertEquals } from "jsr:@std/assert@1";
import { ADMIN_ID, type Anschluesse, bearbeiten, ERLAUBTE_HERKUNFT } from "./kern.ts";

interface Spur {
  authSperren: { userId: string; gesperrt: boolean }[];
  authGeloescht: string[];
  gesperrtGesetzt: { tabelle: string; id: string; gesperrt: boolean }[];
  loeschVersuche: string[];
  protokoll: { aktion: string; ziel_tabelle: string; ziel_id: string }[];
}

function baue(opt: { nutzerId?: string; userId?: string | null; fkKonflikt?: boolean } = {}): {
  anschluesse: Anschluesse;
  spur: Spur;
} {
  const spur: Spur = { authSperren: [], authGeloescht: [], gesperrtGesetzt: [], loeschVersuche: [], protokoll: [] };
  const unbenutzt = (name: string) => () => { throw new Error(`${name} nicht erwartet`); };
  const anschluesse = {
    benutzerAusToken: (_t: string) => Promise.resolve({ id: opt.nutzerId ?? ADMIN_ID, email: "admin@vexfit.app" }),
    personUserId: (_tabelle: string, _id: string) => Promise.resolve(opt.userId === undefined ? "auth-1" : opt.userId),
    authSperren: (userId: string, gesperrt: boolean) => { spur.authSperren.push({ userId, gesperrt }); return Promise.resolve(); },
    authNutzerLoeschen: (userId: string) => { spur.authGeloescht.push(userId); return Promise.resolve(); },
    personGesperrtSetzen: (tabelle: string, id: string, gesperrt: boolean) => { spur.gesperrtGesetzt.push({ tabelle, id, gesperrt }); return Promise.resolve(1); },
    zeileLoeschenOderAnonymisieren: (_tabelle: string, id: string) => {
      spur.loeschVersuche.push(id);
      return Promise.resolve(opt.fkKonflikt ? { geloescht: false, anonymisiert: true } : { geloescht: true, anonymisiert: false });
    },
    protokoll: (e: { admin_id: string; aktion: string; ziel_tabelle: string; ziel_id: string }) => { spur.protokoll.push({ aktion: e.aktion, ziel_tabelle: e.ziel_tabelle, ziel_id: e.ziel_id }); return Promise.resolve(); },
    melden: () => {},
    // nicht benutzte Anschlüsse:
    trainerNachId: unbenutzt("trainerNachId"),
    trainerNachEmail: unbenutzt("trainerNachEmail"),
    aeltesteOffeneAnfrage: unbenutzt("aeltesteOffeneAnfrage"),
    trainerBezahltMarkieren: unbenutzt("trainerBezahltMarkieren"),
    anfrageWeitergeleitetMarkieren: unbenutzt("anfrageWeitergeleitetMarkieren"),
    mailSenden: unbenutzt("mailSenden"),
    stripeEreignis: unbenutzt("stripeEreignis"),
    ereignisSchonVerarbeitet: unbenutzt("ereignisSchonVerarbeitet"),
    ereignisVermerken: unbenutzt("ereignisVermerken"),
    anfragenAnzahlSeit: unbenutzt("anfragenAnzahlSeit"),
    spamProEmailSeit: unbenutzt("spamProEmailSeit"),
    spamProIpSeit: unbenutzt("spamProIpSeit"),
    spamEintragVormerken: unbenutzt("spamEintragVormerken"),
    adminTrainerSetzen: unbenutzt("adminTrainerSetzen"),
    adminZeileLoeschen: unbenutzt("adminZeileLoeschen"),
  } as unknown as Anschluesse;
  return { anschluesse, spur };
}

function aufruf(payload: Record<string, unknown>, nutzerId?: string, extra?: { userId?: string | null; fkKonflikt?: boolean }): { req: Request; bau: ReturnType<typeof baue> } {
  const bau = baue({ nutzerId, ...(extra || {}) });
  const req = new Request(
    "https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/admin-aktion",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer test" }, body: JSON.stringify(payload) },
  );
  return { req, bau };
}

Deno.test("login_sperren: bannt den Auth-Benutzer und setzt gesperrt=true", async () => {
  const { req, bau } = aufruf({ aktion: "login_sperren", art: "trainer", ziel_id: "t-1" });
  const res = await bearbeiten(req, bau.anschluesse);
  const d = await res.json();
  assertEquals(res.status, 200);
  assertEquals(d.gesperrt, true);
  assertEquals(d.konto, true);
  assertEquals(bau.spur.authSperren, [{ userId: "auth-1", gesperrt: true }]);
  assertEquals(bau.spur.gesperrtGesetzt, [{ tabelle: "trainers", id: "t-1", gesperrt: true }]);
  assertEquals(bau.spur.protokoll.length, 1);
});

Deno.test("login_entsperren: hebt die Sperre auf", async () => {
  const { req, bau } = aufruf({ aktion: "login_entsperren", art: "kunde", ziel_id: "k-9" });
  const res = await bearbeiten(req, bau.anschluesse);
  const d = await res.json();
  assertEquals(d.gesperrt, false);
  assertEquals(bau.spur.authSperren, [{ userId: "auth-1", gesperrt: false }]);
  assertEquals(bau.spur.gesperrtGesetzt, [{ tabelle: "kunden", id: "k-9", gesperrt: false }]);
});

Deno.test("login_sperren ohne Auth-Konto: nur Markierung, konto=false", async () => {
  const { req, bau } = aufruf({ aktion: "login_sperren", art: "trainer", ziel_id: "t-2" }, undefined, { userId: null });
  const res = await bearbeiten(req, bau.anschluesse);
  const d = await res.json();
  assertEquals(d.konto, false);
  assertEquals(bau.spur.authSperren.length, 0);
  assertEquals(bau.spur.gesperrtGesetzt, [{ tabelle: "trainers", id: "t-2", gesperrt: true }]);
});

Deno.test("endgueltig_loeschen ohne bestaetigt → 400, nichts passiert", async () => {
  const { req, bau } = aufruf({ aktion: "endgueltig_loeschen", art: "trainer", ziel_id: "t-1" });
  const res = await bearbeiten(req, bau.anschluesse);
  assertEquals(res.status, 400);
  assertEquals(bau.spur.authGeloescht.length, 0);
  assertEquals(bau.spur.loeschVersuche.length, 0);
});

Deno.test("endgueltig_loeschen: löscht Auth-Benutzer und Zeile", async () => {
  const { req, bau } = aufruf({ aktion: "endgueltig_loeschen", art: "trainer", ziel_id: "t-1", bestaetigt: true });
  const res = await bearbeiten(req, bau.anschluesse);
  const d = await res.json();
  assertEquals(d.geloescht, true);
  assertEquals(d.anonymisiert, false);
  assertEquals(bau.spur.authGeloescht, ["auth-1"]);
  assertEquals(bau.spur.loeschVersuche, ["t-1"]);
  assertEquals(bau.spur.protokoll.length, 1);
});

Deno.test("endgueltig_loeschen bei verknüpften Daten: anonymisiert statt löschen", async () => {
  const { req, bau } = aufruf({ aktion: "endgueltig_loeschen", art: "trainer", ziel_id: "t-1", bestaetigt: true }, undefined, { fkKonflikt: true });
  const res = await bearbeiten(req, bau.anschluesse);
  const d = await res.json();
  assertEquals(d.geloescht, false);
  assertEquals(d.anonymisiert, true);
  assertEquals(bau.spur.authGeloescht, ["auth-1"]);
});

Deno.test("Nicht-Admin darf nicht sperren → 403", async () => {
  const { req, bau } = aufruf({ aktion: "login_sperren", art: "trainer", ziel_id: "t-1" }, "00000000-0000-0000-0000-000000000000");
  const res = await bearbeiten(req, bau.anschluesse);
  assertEquals(res.status, 403);
  assertEquals(bau.spur.authSperren.length, 0);
});

Deno.test("fehlende art → 400", async () => {
  const { req, bau } = aufruf({ aktion: "login_sperren", ziel_id: "t-1" });
  const res = await bearbeiten(req, bau.anschluesse);
  assertEquals(res.status, 400);
  assertEquals(bau.spur.authSperren.length, 0);
});
