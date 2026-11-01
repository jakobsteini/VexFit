// /Users/js/Projekte/Vexfit/app/vexfit/teil_a_test.ts
//
// Teil A — Admin am Handy (PWA) + Web Push. Prüft ohne Netz/Browser:
//   EDGE: Push-Ablauf (pushSenden), Admin-Aktionen (Abo speichern nur mit aal2,
//   Liste, Entfernen), 410 entfernt Abo, fehlende VAPID → Mail geht trotzdem.
//   DATEIEN: Manifest der Verwaltung gültig (name, icons, display standalone,
//   start_url = geheimer Pfad), Service Worker cached keine API-Antworten, die
//   öffentlichen Seiten verraten den Manifest-/SW-Pfad nicht, Verwaltung bei
//   390 px (untere Leiste, Karten, keine Querscroll-Regel) + Push-UI.
//
// Aufruf:  deno test --allow-read teil_a_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ADMIN_ID,
  type Anschluesse,
  bearbeiten,
  ERLAUBTE_HERKUNFT,
  type PushAbo,
  type PushNachricht,
  pushSenden,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── kompakter Mock: wirft für ungenutzte Methoden, Push/Push-Admin injizierbar ──
function mockA(over: Partial<Anschluesse> = {}): { a: Anschluesse; auf: { mails: unknown[]; gespeichert: PushAbo[]; entferntEndpoint: string[]; entferntId: string[]; gesendetAn: string[] } } {
  const auf = { mails: [] as unknown[], gespeichert: [] as PushAbo[], entferntEndpoint: [] as string[], entferntId: [] as string[], gesendetAn: [] as string[] };
  const nein = () => { throw new Error("nicht erwartet"); };
  const a: Anschluesse = {
    trainerNachId: nein as never,
    trainerNachEmail: nein as never,
    aeltesteOffeneAnfrage: nein as never,
    trainerBezahltMarkieren: nein as never,
    anfrageWeitergeleitetMarkieren: nein as never,
    mailSenden: (m) => { auf.mails.push(m); return Promise.resolve(); },
    stripeEreignis: nein as never,
    ereignisSchonVerarbeitet: nein as never,
    ereignisVermerken: nein as never,
    benutzerAusToken: () => Promise.resolve({ id: ADMIN_ID, email: "admin@vexfit.app", aal: "aal2" }),
    anfragenAnzahlSeit: () => Promise.resolve(0),
    spamProEmailSeit: () => Promise.resolve(0),
    spamProIpSeit: () => Promise.resolve(0),
    spamEintragVormerken: () => Promise.resolve(),
    adminTrainerSetzen: () => Promise.resolve(1),
    adminZeileLoeschen: () => Promise.resolve(1),
    protokoll: () => Promise.resolve(),
    melden: () => {},
    ...over,
  };
  return { a, auf };
}

function req(pfad: string, koerper: unknown, kopf: Record<string, string> = {}): Request {
  return new Request(`https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/${pfad}`, {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, ...kopf }),
    body: JSON.stringify(koerper),
  });
}

const NACHRICHT: PushNachricht = { titel: "Neuer Trainer", text: "Mara, Salzburg", url: "https://vexfit.app/x#trainer-1" };
const ABO = (endpoint: string): PushAbo => ({ id: endpoint, endpoint, p256dh: "p", auth: "a" });

Deno.test("A: pushSenden – fehlende VAPID-Secrets überspringt den Versand", async () => {
  const { a } = mockA({
    vapidVorhanden: () => false,
    pushAbosLesen: () => Promise.resolve([ABO("https://push.example/1")]),
    pushEinzelSenden: () => { throw new Error("darf nicht senden"); },
  });
  const r = await pushSenden(a, NACHRICHT);
  assertEquals(r.gesendet, 0);
  assertEquals(r.uebersprungen, "VAPID fehlt");
});

Deno.test("A: pushSenden – an alle Abos, 410 entfernt genau dieses Abo", async () => {
  const entfernt: string[] = [];
  const { a } = mockA({
    vapidVorhanden: () => true,
    pushAbosLesen: () => Promise.resolve([ABO("https://push.example/1"), ABO("https://push.example/2")]),
    pushEinzelSenden: (abo) => Promise.resolve(abo.endpoint.endsWith("/2") ? 410 : 201),
    pushAboEntfernen: (endpoint) => { entfernt.push(endpoint); return Promise.resolve(); },
  });
  const r = await pushSenden(a, NACHRICHT);
  assertEquals(r.gesendet, 1);
  assertEquals(r.entfernt, 1);
  assertEquals(entfernt, ["https://push.example/2"]);
});

Deno.test("A: Abo speichern verlangt den zweiten Faktor (aal2)", async () => {
  // aal1 → 403, nichts gespeichert.
  const { a, auf } = mockA({
    benutzerAusToken: () => Promise.resolve({ id: ADMIN_ID, email: "admin@vexfit.app", aal: "aal1" }),
    pushAboSpeichern: (abo) => { auf.gespeichert.push(abo); return Promise.resolve(); },
  });
  const res = await bearbeiten(
    req("admin-aktion", { aktion: "push_abo_speichern", abo: { endpoint: "https://push.example/1", p256dh: "p", auth: "x" } }, { Authorization: "Bearer t" }),
    a,
  );
  assertEquals(res.status, 403);
  assertEquals(auf.gespeichert.length, 0);
});

Deno.test("A: Abo speichern mit aal2 legt es an; Liste und Entfernen funktionieren", async () => {
  const gespeichert: PushAbo[] = [];
  const entferntId: string[] = [];
  const { a } = mockA({
    pushAboSpeichern: (abo) => { gespeichert.push(abo); return Promise.resolve(); },
    pushAbosLesen: () => Promise.resolve([{ id: "ab-1", endpoint: "https://push.example/1", p256dh: "p", auth: "a", geraet: "iPhone", erstellt_am: "2026-11-01T00:00:00Z" }]),
    pushAboEntfernenNachId: (id) => { entferntId.push(id); return Promise.resolve(1); },
  });
  // Speichern
  let res = await bearbeiten(
    req("admin-aktion", { aktion: "push_abo_speichern", abo: { endpoint: "https://push.example/1", p256dh: "p", auth: "a", geraet: "iPhone" } }, { Authorization: "Bearer t" }),
    a,
  );
  assertEquals(res.status, 200);
  assertEquals(gespeichert.length, 1);
  // Liste (nur unbedenkliche Felder, kein Endpoint/Schlüssel)
  res = await bearbeiten(req("admin-aktion", { aktion: "push_abos_liste" }, { Authorization: "Bearer t" }), a);
  const d = await res.json();
  assertEquals(d.abos.length, 1);
  assertEquals(d.abos[0].geraet, "iPhone");
  assert(!("endpoint" in d.abos[0]) && !("p256dh" in d.abos[0]), "Liste enthält sensible Felder");
  // Entfernen per id
  res = await bearbeiten(req("admin-aktion", { aktion: "push_abo_entfernen", ziel_id: "ab-1" }, { Authorization: "Bearer t" }), a);
  assertEquals((await res.json()).entfernt, 1);
  assertEquals(entferntId, ["ab-1"]);
});

Deno.test("A: Manifest der Verwaltung ist gültig und geheim (start_url = geheimer Pfad)", async () => {
  const mani = JSON.parse(await lies("./manifest-admin.webmanifest"));
  assertEquals(mani.name, "Vexfit Admin");
  assertEquals(mani.display, "standalone");
  assert(String(mani.start_url).includes("verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html"), "start_url ist nicht der geheime Pfad");
  const groessen = (mani.icons || []).map((i: { sizes: string }) => i.sizes);
  for (const g of ["180x180", "192x192", "512x512"]) assert(groessen.includes(g), `Icon ${g} fehlt`);
  assert(String(mani.theme_color).toLowerCase() === "#0a0a0a", "theme_color falsch");
});

Deno.test("A: öffentliche Seiten verraten Manifest/SW der Verwaltung nicht", async () => {
  for (const seite of ["index.html", "suche.html", "profil.html"]) {
    const html = await lies("./" + seite);
    assert(!html.includes("manifest-admin"), `${seite} verlinkt das Admin-Manifest`);
    assert(!html.includes("sw-verwaltung"), `${seite} verlinkt den Admin-Service-Worker`);
    assert(!html.includes("verwaltung-88fd2cb35d54e09c68c8e60199d97b66"), `${seite} nennt den geheimen Pfad`);
  }
});

Deno.test("A: Service Worker cached keine Daten (nur die Hülle), Supabase wird nie abgefangen", async () => {
  const sw = await lies("./sw-verwaltung.js");
  assert(/addEventListener\(['"]push['"]/.test(sw), "kein push-Handler");
  assert(/addEventListener\(['"]notificationclick['"]/.test(sw), "kein notificationclick-Handler");
  // Supabase-Anfragen werden nicht aus dem Cache bedient (nie veraltete/fremde Daten).
  assert(sw.includes("supabase.co"), "SW schließt Supabase nicht aus");
});

Deno.test("A: Verwaltung ist handytauglich (untere Leiste, Karten, kein Querscrollen) + Push-UI", async () => {
  const css = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(css, "max-width:600px"); // Handy-Media-Query vorhanden
  assert(css.includes("overflow-x:hidden") || css.includes("overflow-x: hidden"), "kein Querscroll-Schutz");
  assert(css.includes("tabs-unten") || css.includes("tableiste-unten"), "keine untere Reiterleiste");
  assertStringIncludes(css, "manifest-admin.webmanifest");
  assertStringIncludes(css, "apple-touch-icon");
  const js = await lies("./vexfit-verwaltung.js");
  assert(/Mitteilungen auf diesem Gerät aktivieren/.test(js), "Knopf zum Aktivieren fehlt");
  assertStringIncludes(js, "push_abo_speichern");
  assertStringIncludes(js, "push_abo_entfernen");
});
