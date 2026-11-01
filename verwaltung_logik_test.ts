// /Users/js/Projekte/Vexfit/app/vexfit/verwaltung_logik_test.ts
//
// Admin-Dashboard neu: die reinen Funktionen der Verwaltungsseite (ohne Browser)
// und ein Satz Sicherheits-Prüfungen auf der HTML-Seite selbst.
//
// Aufruf:  deno test --allow-read verwaltung_logik_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  aalAusToken,
  ADMIN_ID,
  csvBauen,
  csvZelle,
  escapeHtml,
  fehlendeProfilfelder,
  freischaltMailStatus,
  istTestkonto,
  kundenFiltern,
  profilStaerke,
  qrAlsDatenUri,
  SITZUNG_SCHLUESSEL,
  sichtbar,
  sitzungGueltig,
  sortieren,
  trainerFiltern,
  unbeantwortetSeitStunden,
} from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const SEITE = "./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html";

function jwt(aal: string, expMs?: number): string {
  const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload: Record<string, unknown> = { sub: ADMIN_ID, aal };
  if (expMs) payload.exp = Math.floor(expMs / 1000);
  return `${b64u({ alg: "HS256" })}.${b64u(payload)}.sig`;
}

Deno.test("escapeHtml entschärft HTML und Attribut-Ausbruch", () => {
  assertEquals(escapeHtml(`<img src=x onerror="a">'&`), "&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&amp;");
});

Deno.test("aalAusToken liest die Stufe", () => {
  assertEquals(aalAusToken(jwt("aal2")), "aal2");
  assertEquals(aalAusToken(jwt("aal1")), "aal1");
  assertEquals(aalAusToken("xx"), null);
});

Deno.test("sitzungGueltig verlangt aal2, Admin-ID, Gültigkeit und Aktivität", () => {
  const jetzt = 1_000_000_000_000;
  const gut = { access_token: jwt("aal2", jetzt + 3600_000), user_id: ADMIN_ID, zuletzt: jetzt - 1000 };
  assert(sitzungGueltig(gut, jetzt));
  // aal1 reicht nicht
  assert(!sitzungGueltig({ ...gut, access_token: jwt("aal1", jetzt + 3600_000) }, jetzt));
  // falsches Konto
  assert(!sitzungGueltig({ ...gut, user_id: "fremd" }, jetzt));
  // abgelaufen
  assert(!sitzungGueltig({ ...gut, access_token: jwt("aal2", jetzt - 1000) }, jetzt));
  // 30 min inaktiv
  assert(!sitzungGueltig({ ...gut, zuletzt: jetzt - 31 * 60 * 1000 }, jetzt));
  assert(!sitzungGueltig(null, jetzt));
});

Deno.test("istTestkonto / sichtbar: Plus-Adresse und Liste", () => {
  assert(istTestkonto("a+1@b.at"));
  assert(istTestkonto("x@y.at", ["x@y.at"]));
  assert(!istTestkonto("echt@kunde.at"));
  const liste = [{ email: "a+1@b.at" }, { email: "echt@kunde.at" }];
  assertEquals(sichtbar(liste, true).length, 1);
  assertEquals(sichtbar(liste, false).length, 2);
});

Deno.test("fehlendeProfilfelder zählt acht Felder", () => {
  assertEquals(fehlendeProfilfelder({}).length, 8);
  const voll = {
    avatar_url: "https://hbapzwxdehfgnputrfjf.supabase.co/storage/v1/object/public/avatars/x.jpg",
    trainingsart: "Kraft", trainingsort: "studio", preis_stunde: 50, bio: "Mehr als zehn Zeichen hier",
    erfahrung: "5 Jahre", spezialisierungen: ["Kraft"], telefon: "+43 1 2345",
  };
  assertEquals(fehlendeProfilfelder(voll).length, 0);
});

Deno.test("profilStaerke 0 und voll", () => {
  assertEquals(profilStaerke({}), 0);
  assert(profilStaerke({
    avatar_url: "https://x/storage/v1/object/public/avatars/a.jpg", bio: "lang genug hier", spezialisierungen: ["a"],
    video_url: "https://youtu.be/x", galerie: ["g"], sprachen: ["de"], trainingsorte: ["studio"], zertifikat_datei: "z.pdf",
  }) === 100);
});

Deno.test("trainerFiltern: Suche und Status", () => {
  const liste = [
    { id: "1", vorname: "Anna", nachname: "Berg", email: "a@x.at", stadt: "Wien", aktiv: true },
    { id: "2", vorname: "Ben", nachname: "Clar", email: "b@x.at", stadt: "Linz", aktiv: false },
    { id: "3", vorname: "Cem", email: "c@x.at", stadt: "Wien", aktiv: true, gesperrt: true },
  ];
  assertEquals(trainerFiltern(liste, { q: "wien" }).length, 2);
  assertEquals(trainerFiltern(liste, { status: "warten" }).length, 1);
  assertEquals(trainerFiltern(liste, { status: "aktiv" }).length, 2);
  assertEquals(trainerFiltern(liste, { status: "gesperrt" }).length, 1);
});

Deno.test("kundenFiltern und sortieren", () => {
  const liste = [{ vorname: "Zoe", email: "z@x.at", created_at: "2026-01-01" }, { vorname: "Amy", email: "a@x.at", created_at: "2026-02-01" }];
  assertEquals(kundenFiltern(liste, "amy").length, 1);
  assertEquals(sortieren(liste, "name", false)[0].vorname, "Amy");
  assertEquals(sortieren(liste, "created_at", true)[0].created_at, "2026-02-01");
});

Deno.test("unbeantwortetSeitStunden nur für offene", () => {
  const jetzt = Date.parse("2026-11-01T12:00:00Z");
  assertEquals(unbeantwortetSeitStunden({ status: "offen", created_at: "2026-11-01T10:00:00Z" }, jetzt), 2);
  assertEquals(unbeantwortetSeitStunden({ status: "angenommen", created_at: "2026-11-01T10:00:00Z" }, jetzt), null);
});

Deno.test("csvZelle/csvBauen escapen Trenner und Anführungszeichen", () => {
  assertEquals(csvZelle('a;b'), '"a;b"');
  assertEquals(csvZelle('sag "hi"'), '"sag ""hi"""');
  const csv = csvBauen([{ vorname: "A;B", email: "x@y.at" }], [{ key: "vorname", label: "Vorname" }, { key: "email", label: "E-Mail" }]);
  assertStringIncludes(csv, '"A;B";x@y.at');
  assert(csv.startsWith("﻿"), "CSV braucht ein BOM für Umlaute");
});

// ── Sicherheits-Prüfungen auf der Seite selbst ──
Deno.test("Seite: noindex, strenge CSP, getrennte Sitzung, keine Inline-Skripte", async () => {
  const html = await lies(SEITE);
  assertStringIncludes(html, 'name="robots" content="noindex,nofollow"');
  assertStringIncludes(html, "Content-Security-Policy");
  assertStringIncludes(html, "script-src 'self'");
  assertStringIncludes(html, "default-src 'none'");
  // Eigene Admin-Sitzung, getrennt von vexfit_session:
  assertStringIncludes(html, 'src="vexfit-verwaltung.js"');
  assert(!html.includes("localStorage"), "Admin-Sitzung darf nicht im localStorage liegen");
  // Kein Inline-Event-Handler, kein Inline-<script>:
  assert(!/on(click|load|error|change|input)\s*=/.test(html), "Seite enthält Inline-Event-Handler");
  assert(!/<script(?![^>]*\bsrc=)[^>]*>[^<]*\S/.test(html), "Seite enthält Inline-Skriptcode");
});

Deno.test("Modul: getrennte Sitzung in sessionStorage, Pflicht zu aal2", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "sessionStorage");
  assertEquals(SITZUNG_SCHLUESSEL, "vexfit_admin_session");
  assert(!js.includes("vexfit_session"), "Admin darf nicht die Kunden/Trainer-Sitzung verwenden");
  assertStringIncludes(js, "person_kicken");
  assertStringIncludes(js, "ist_vexfit_admin");
});

Deno.test("admin.html leitet nur noch auf die Startseite (kein Dashboard, kein geheimer Pfad)", async () => {
  const html = await lies("./admin.html");
  assertStringIncludes(html.toLowerCase(), "index.html");
  assert(!html.includes("verwaltung-"), "admin.html darf den geheimen Pfad nicht verraten");
  assert(!html.includes("admin-aktion"), "admin.html soll keine Admin-Logik mehr enthalten");
});

Deno.test("login.html leitet nie auf den Admin", async () => {
  const html = await lies("./login.html");
  assert(!/admin\.html|verwaltung-/.test(html), "login.html darf nicht auf den Admin verweisen");
});

// ── QR-Code im zweiten Faktor ──
Deno.test("CSP erlaubt data: bei img-src (für den MFA-QR-Code)", async () => {
  const html = await lies(SEITE);
  const csp = (html.match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
  const img = (csp.match(/img-src([^;]+)/) || [])[1] || "";
  assert(img.includes("data:"), "img-src muss data: erlauben, sonst bleibt der QR-Code leer");
});

Deno.test("qrAlsDatenUri: rohes SVG (Supabase utf-8) wird prozentkodiert", () => {
  // So liefert es Supabase: data:-Vorsatz mit rohem SVG, '#' in der Füllfarbe.
  const roh = 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000" width="2" height="2"/></svg>';
  const uri = qrAlsDatenUri(roh);
  assertStringIncludes(uri, "data:image/svg+xml;charset=utf-8,");
  assert(!uri.includes("<svg"), "rohes SVG darf nicht unkodiert in der Adresse stehen");
  assert(!uri.includes('#000000'), "'#' muss kodiert sein (sonst Abschnitt als Fragment)");
  assertStringIncludes(uri, "%23000000"); // '#' -> %23
  // Dekodiert ergibt sich wieder das SVG.
  assertStringIncludes(decodeURIComponent(uri.split(",")[1]), "<svg");
});

Deno.test("qrAlsDatenUri: nackter <svg>-String bekommt den data:-Vorsatz", () => {
  const uri = qrAlsDatenUri('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>');
  assertStringIncludes(uri, "data:image/svg+xml;charset=utf-8,%3Csvg");
});

Deno.test("qrAlsDatenUri: base64-/PNG-Adresse bleibt unverändert", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
  assertEquals(qrAlsDatenUri(png), png);
  const svgB64 = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
  assertEquals(qrAlsDatenUri(svgB64), svgB64);
});

Deno.test("qrAlsDatenUri: schon prozentkodiertes SVG wird nicht doppelt kodiert", () => {
  const schon = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const uri = qrAlsDatenUri(schon);
  assertStringIncludes(decodeURIComponent(uri.split(",")[1]), "<svg");
  assert(!uri.includes("%253C"), "darf nicht doppelt kodiert sein (%25 = kodiertes %)");
});

// ── Freischalt-Mail: Status-Anzeige ──
Deno.test("freischaltMailStatus: Zeitstempel -> gesendet am (Date)", () => {
  const s = freischaltMailStatus({ freischalt_mail_gesendet: "2026-11-01T11:00:00.000Z" } as unknown as Record<string, unknown>);
  assertEquals(s.gesendet, true);
  assert(s.datum instanceof Date && !isNaN(s.datum.getTime()));
});

Deno.test("freischaltMailStatus: true ohne Datum -> gesendet, datum null", () => {
  const s = freischaltMailStatus({ freischalt_mail_gesendet: true } as unknown as Record<string, unknown>);
  assertEquals(s.gesendet, true);
  assertEquals(s.datum, null);
});

Deno.test("freischaltMailStatus: fehlend/leer -> noch nicht gesendet", () => {
  assertEquals(freischaltMailStatus({} as unknown as Record<string, unknown>).gesendet, false);
  assertEquals(freischaltMailStatus({ freischalt_mail_gesendet: null } as unknown as Record<string, unknown>).gesendet, false);
  assertEquals(freischaltMailStatus({ freischalt_mail_gesendet: "" } as unknown as Record<string, unknown>).gesendet, false);
});

Deno.test("Modul: Freischalt-Mail-Aktionen sind verdrahtet", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "trainer_freischalt_mail");
  assertStringIncludes(js, "Freischalt-Mail senden");
  assertStringIncludes(js, "Mail erneut senden");
  assertStringIncludes(js, "gesendet am ");
});

Deno.test("qrAlsDatenUri: leerer/ungültiger Wert ergibt leeren String", () => {
  assertEquals(qrAlsDatenUri(""), "");
  assertEquals(qrAlsDatenUri(null as unknown as string), "");
  assertEquals(qrAlsDatenUri(undefined as unknown as string), "");
});
