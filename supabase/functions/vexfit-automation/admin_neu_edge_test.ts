// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/admin_neu_edge_test.ts
//
// Admin-Dashboard neu – Edge-Function-Logik (ohne Netz, alles gemockt):
//   Teil 1: /admin-aktion verlangt gueltiges JWT (401), Admin-Konto (403),
//           zweiten Faktor aal2 (403), begrenzt die Menge je Minute (429) und
//           prueft Eingaben (400). aalAusToken liest die Stufe aus dem JWT.
//   Teil 3: /admin-aktion person_kicken loescht Person + eigene Daten, loescht
//           das Anmeldekonto, raeumt den Speicher auf, haelt Zahlungen
//           anonymisiert und schreibt ins Protokoll. Fehlt die DB-Funktion
//           (Migration nicht eingespielt) -> klarer 400-Hinweis. Scheitert die
//           DB-Transaktion -> kein halber Zustand (kein Konto-/Storage-Loeschen).
//
// Aufruf:  deno test --allow-read supabase/functions/vexfit-automation/admin_neu_edge_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  aalAusToken,
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  ratenGrenzeUeberschritten,
} from "./kern.ts";

// Ein JWT (nur Nutzdaten zaehlen hier) mit frei waehlbarer aal-Stufe bauen.
function jwtMit(aal: string): string {
  const b64u = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: ADMIN_ID, aal })}.sig`;
}

interface Spur {
  adminGesetzt: { id: string; felder: Record<string, unknown> }[];
  authGeloescht: string[];
  storage: { bucket: string; pfade: string[] }[];
  kickenDb: { tabelle: string; id: string }[];
  protokoll: { aktion: string; ergebnis?: string }[];
}

function baue(opt: {
  nutzer?: { id: string; email: string; aal?: string | null } | null;
  kickenWirft?: Error;
  dateien?: { avatars: string[]; galerie: string[]; zertifikate: string[] };
  userId?: string | null;
} = {}): { anschluesse: Anschluesse; spur: Spur } {
  const spur: Spur = { adminGesetzt: [], authGeloescht: [], storage: [], kickenDb: [], protokoll: [] };
  const nutzer = opt.nutzer === undefined
    ? { id: ADMIN_ID, email: "admin@vexfit.app", aal: "aal2" }
    : opt.nutzer;
  const anschluesse = {
    benutzerAusToken: (_t: string) => Promise.resolve(nutzer),
    adminTrainerSetzen: (id: string, felder: Record<string, unknown>) => { spur.adminGesetzt.push({ id, felder }); return Promise.resolve(1); },
    personUserId: (_t: string, _id: string) => Promise.resolve(opt.userId === undefined ? "auth-1" : opt.userId),
    authNutzerLoeschen: (userId: string) => { spur.authGeloescht.push(userId); return Promise.resolve(); },
    personDateien: (_t: string, _id: string) => Promise.resolve(opt.dateien ?? { avatars: ["a/1.jpg"], galerie: ["g/1.jpg", "g/2.jpg"], zertifikate: ["z/1.pdf"] }),
    storageLoeschen: (bucket: string, pfade: string[]) => { spur.storage.push({ bucket, pfade }); return Promise.resolve(); },
    personKickenDb: (tabelle: string, id: string) => {
      spur.kickenDb.push({ tabelle, id });
      if (opt.kickenWirft) return Promise.reject(opt.kickenWirft);
      return Promise.resolve({ anfragen: 3, alerts: 1, warteliste: 0, person: 1, zahlungen_anonymisiert: 2 });
    },
    protokoll: (e: { aktion: string; ergebnis?: string }) => { spur.protokoll.push({ aktion: e.aktion, ergebnis: e.ergebnis }); return Promise.resolve(); },
    melden: () => {},
  } as unknown as Anschluesse;
  return { anschluesse, spur };
}

function anfrage(koerper: unknown, token: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request("https://x/functions/v1/vexfit-automation/admin-aktion", {
    method: "POST",
    headers,
    body: JSON.stringify(koerper),
  });
}

// ── aalAusToken (rein) ─────────────────────────────────────────────────────
Deno.test("aalAusToken liest aal2 bzw. aal1 aus dem JWT, sonst null", () => {
  assertEquals(aalAusToken(jwtMit("aal2")), "aal2");
  assertEquals(aalAusToken(jwtMit("aal1")), "aal1");
  assertEquals(aalAusToken("keinjwt"), null);
  assertEquals(aalAusToken(null), null);
});

// ── Rate-Limit (rein) ──────────────────────────────────────────────────────
Deno.test("ratenGrenzeUeberschritten: ueber dem Maximum je Minute -> true", () => {
  const id = "rate-test-" + crypto.randomUUID();
  const t0 = 1_000_000;
  for (let i = 0; i < 60; i++) assert(!ratenGrenzeUeberschritten(id, t0, 60));
  assert(ratenGrenzeUeberschritten(id, t0, 60), "61. Aufruf in derselben Minute muss greifen");
  // Eine Minute spaeter ist das Fenster wieder frei.
  assert(!ratenGrenzeUeberschritten(id, t0 + 61_000, 60));
});

// ── Teil 1: Torwache ───────────────────────────────────────────────────────
Deno.test("Teil 1: ohne Token -> 401", async () => {
  const { anschluesse } = baue();
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }, null), anschluesse);
  assertEquals(res.status, 401);
});

Deno.test("Teil 1: Nicht-Admin -> 403", async () => {
  const { anschluesse, spur } = baue({ nutzer: { id: "u-9", email: "kein@admin.at", aal: "aal2" } });
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }, jwtMit("aal2")), anschluesse);
  assertEquals(res.status, 403);
  assertEquals(spur.adminGesetzt.length, 0);
});

Deno.test("Teil 1: Admin ohne aal2 -> 403, nichts geschrieben", async () => {
  const { anschluesse, spur } = baue({ nutzer: { id: ADMIN_ID, email: "admin@vexfit.app", aal: "aal1" } });
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }, jwtMit("aal1")), anschluesse);
  assertEquals(res.status, 403);
  const d = await res.json();
  assertStringIncludes(d.fehler, "Zweiter Faktor");
  assertEquals(spur.adminGesetzt.length, 0);
});

Deno.test("Teil 1: Admin mit aal2 -> Aktion wird ausgefuehrt und protokolliert", async () => {
  const { anschluesse, spur } = baue();
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "t-1" }, jwtMit("aal2")), anschluesse);
  assertEquals(res.status, 200);
  assertEquals(spur.adminGesetzt[0].felder, { aktiv: true });
  assertEquals(spur.protokoll.at(-1)?.aktion, "trainer_aktivieren");
});

Deno.test("Teil 1: ungueltige Eingabe (zu lange ziel_id) -> 400", async () => {
  const { anschluesse } = baue();
  const res = await bearbeiten(anfrage({ aktion: "trainer_aktivieren", ziel_id: "x".repeat(200) }, jwtMit("aal2")), anschluesse);
  assertEquals(res.status, 400);
});

// ── Teil 3: Kicken ─────────────────────────────────────────────────────────
Deno.test("Teil 3: person_kicken loescht Daten, Konto, Speicher und protokolliert", async () => {
  const { anschluesse, spur } = baue();
  const res = await bearbeiten(anfrage({ aktion: "person_kicken", art: "trainer", ziel_id: "t-7", bestaetigt: true }, jwtMit("aal2")), anschluesse);
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.ok, true);
  assertEquals(d.konto, true);
  assertEquals(d.anfragen, 3);
  assertEquals(d.zahlungen_anonymisiert, 2);
  // DB-Transaktion zuerst, dann Konto, dann Speicher (drei Buckets).
  assertEquals(spur.kickenDb, [{ tabelle: "trainers", id: "t-7" }]);
  assertEquals(spur.authGeloescht, ["auth-1"]);
  assertEquals(spur.storage.map((s) => s.bucket), ["avatars", "galerie", "zertifikate"]);
  assertEquals(spur.protokoll.at(-1)?.aktion, "person_kicken");
});

Deno.test("Teil 3: person_kicken ohne Bestaetigung -> 400, nichts geloescht", async () => {
  const { anschluesse, spur } = baue();
  const res = await bearbeiten(anfrage({ aktion: "person_kicken", art: "trainer", ziel_id: "t-7" }, jwtMit("aal2")), anschluesse);
  assertEquals(res.status, 400);
  assertEquals(spur.kickenDb.length, 0);
});

Deno.test("Teil 3: fehlende DB-Funktion -> 400 mit Migrationshinweis", async () => {
  const { anschluesse, spur } = baue({ kickenWirft: new Error("personKickenDb: HTTP 404 Could not find the function public.admin_person_kicken") });
  const res = await bearbeiten(anfrage({ aktion: "person_kicken", art: "kunde", ziel_id: "k-1", bestaetigt: true }, jwtMit("aal2")), anschluesse);
  assertEquals(res.status, 400);
  const d = await res.json();
  assertStringIncludes(d.fehler, "2026-11-01-02");
  // Kein halber Zustand: Konto NICHT geloescht, Speicher NICHT angefasst.
  assertEquals(spur.authGeloescht.length, 0);
  assertEquals(spur.storage.length, 0);
});

Deno.test("Teil 3: scheitert die DB-Transaktion generisch -> kein halber Zustand (500)", async () => {
  const { anschluesse, spur } = baue({ kickenWirft: new Error("deadlock detected") });
  let status = 0;
  try {
    const res = await bearbeiten(anfrage({ aktion: "person_kicken", art: "trainer", ziel_id: "t-7", bestaetigt: true }, jwtMit("aal2")), anschluesse);
    status = res.status;
  } catch {
    status = 500; // ein durchgereichter Fehler wird von Deno.serve zu 500
  }
  assert(status === 500 || status >= 500, "generischer DB-Fehler darf nicht als Erfolg enden");
  assertEquals(spur.authGeloescht.length, 0);
  assertEquals(spur.storage.length, 0);
});
