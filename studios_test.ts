// /Users/js/Projekte/Vexfit/app/vexfit/studios_test.ts
//
// Baustein 1 (John Harris / Studios, 31.10.2026). Prueft ohne Browser und ohne
// Datenbank die sicherheits- und verhaltensrelevanten Eigenschaften:
//   - die Migration vergibt KEIN Schreibrecht auf studio_standort_id an
//     anon/authenticated (sonst koennte sich ein Trainer selbst kostenlos
//     einem Studio zuordnen);
//   - der oeffentliche Lesezugriff laeuft ueber SECURITY-DEFINER-Funktionen,
//     die auf Freigabe bzw. Schluessel pruefen;
//   - die Ruecknahme entfernt alles;
//   - die Studio-Seite zeigt Beispielprofile nur in der Vorschau, nie in der
//     echten Suche, und traegt noindex;
//   - der Trainerbereich zeigt Studio-Trainern KEINEN Zahlungslink;
//   - profil.html erzwingt die Mitglieds-Frage bei Studio-Anfragen;
//   - keine Strasse/Hausnummer von Jakob auf den oeffentlichen Studio-Seiten.
//
// Aufruf:  deno test --allow-read studios_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ---- Migration: Sicherheit ----------------------------------------------
Deno.test("Migration: studio_standort_id ist NICHT fuer anon/authenticated schreibbar", async () => {
  const sql = await lies("./migrations/2026-10-31-01-studios.sql");
  // Es darf keine GRANT-Zeile geben, die studio_standort_id auf der Tabelle
  // trainers an anon oder authenticated vergibt. (Auf anfragen ist die Spalte
  // nur eine harmlose Markierung und darf mitgeschrieben werden.)
  const zeilen = sql.split("\n");
  for (const z of zeilen) {
    const low = z.toLowerCase();
    if (low.includes("grant") && low.includes("studio_standort_id") &&
        low.includes("public.trainers") &&
        (low.includes("anon") || low.includes("authenticated"))) {
      throw new Error("studio_standort_id auf trainers wird an anon/authenticated vergeben: " + z);
    }
  }
  // Positivprobe: die Spalte existiert und verweist auf studio_standorte.
  assertStringIncludes(sql, "ADD COLUMN studio_standort_id uuid REFERENCES public.studio_standorte");
});

Deno.test("Migration: Lesezugriff nur ueber SECURITY-DEFINER-Funktionen mit Pruefung", async () => {
  const sql = await lies("./migrations/2026-10-31-01-studios.sql");
  // Drei Funktionen, alle SECURITY DEFINER.
  for (const fn of ["studio_einladung_einloesen", "studio_anzeigen", "studio_uebersicht"]) {
    assertStringIncludes(sql, "FUNCTION public." + fn);
  }
  const anzahlDefiner = (sql.match(/SECURITY DEFINER/g) || []).length;
  assert(anzahlDefiner >= 3, "nicht alle Funktionen sind SECURITY DEFINER");
  // studio_anzeigen prueft Freigabe ODER Vorschau-Schluessel.
  assertStringIncludes(sql, "veroeffentlicht IS NOT TRUE");
  assertStringIncludes(sql, "vorschau_schluessel");
  // studio_uebersicht prueft den Uebersichts-Schluessel.
  assertStringIncludes(sql, "uebersicht_schluessel = p_schluessel");
  // Einladung setzt nur die eigene Zeile (auth.uid()).
  assertStringIncludes(sql, "WHERE user_id = auth.uid()");
  // Die Studio-Tabellen geben anon/authenticated keine Tabellenrechte.
  assertStringIncludes(sql, "REVOKE ALL ON public.studios          FROM anon, authenticated");
  // anon darf Einladungen NICHT einloesen (nur authenticated).
  assertStringIncludes(sql, "GRANT EXECUTE ON FUNCTION public.studio_einladung_einloesen(text) TO authenticated");
});

Deno.test("Migration: Seed John Harris mit zwei Standorten, Adressen als Platzhalter", async () => {
  const sql = await lies("./migrations/2026-10-31-01-studios.sql");
  assertStringIncludes(sql, "'john-harris', 'John Harris Fitness', false");
  assertStringIncludes(sql, "'salzburg'");
  assertStringIncludes(sql, "'wien'");
  assertStringIncludes(sql, "HIER EINFÜGEN");
});

Deno.test("Ruecknahme entfernt Funktionen, Spalten und Tabellen", async () => {
  const sql = await lies("./migrations/2026-10-31-01-studios-ruecknahme.sql");
  for (const teil of [
    "DROP FUNCTION IF EXISTS public.studio_uebersicht",
    "DROP FUNCTION IF EXISTS public.studio_anzeigen",
    "DROP FUNCTION IF EXISTS public.studio_einladung_einloesen",
    "DROP COLUMN IF EXISTS studio_standort_id",
    "DROP TABLE IF EXISTS public.studio_standorte",
    "DROP TABLE IF EXISTS public.studios",
  ]) {
    assertStringIncludes(sql, teil);
  }
});

// ---- Oeffentliche Studio-Seite -------------------------------------------
Deno.test("john-harris.html: noindex, RPC-Lesezugriff, Beispielprofile nur in der Vorschau", async () => {
  const html = await lies("./john-harris.html");
  assertStringIncludes(html, '<meta name="robots" content="noindex">');
  assertStringIncludes(html, "rpc/studio_anzeigen");
  // Beispielprofile als solche beschriftet.
  assertStringIncludes(html, "Beispielprofil");
  // Beispielprofile werden nur erzeugt, wenn vorschau wahr ist: der Aufruf von
  // beispielProfile(...) steht ausschliesslich im vorschau-Zweig.
  const vorschauZweig = html.slice(html.indexOf("} else if(studio.vorschau){"));
  assertStringIncludes(vorschauZweig.split("} else {")[0], "beispielProfile(");
  // Der oeffentliche (nicht-vorschau) Zweig enthaelt KEIN beispielProfile.
  const idxElse = html.indexOf("} else {", html.indexOf("studio.vorschau"));
  const nichtVorschau = html.slice(idxElse, html.indexOf("}", idxElse + 10));
  assert(!nichtVorschau.includes("beispielProfile("),
    "Beispielprofile erscheinen auch ohne Vorschau");
});

Deno.test("Studio-Seiten nennen keine Strasse/Hausnummer von Jakob", async () => {
  for (const p of ["./john-harris.html", "./john-harris-aufsteller.html", "./john-harris-uebersicht.html"]) {
    const html = await lies(p);
    // Keine Hausnummer-Muster wie "Musterstrasse 12" (Wort + Zahl) ausser den
    // bekannten unbedenklichen (John-Harris-Standorte als Platzhalter). Grobe
    // Probe: die Dateien duerfen keine typische Strassen-Endung mit Zahl haben.
    assert(!/stra(ss|ß)e\s*\d/i.test(html.replace(/Innsbrucker Bundesstraße/g, "")),
      p + " enthaelt eine Strasse mit Hausnummer");
  }
});

// ---- Aufsteller (Druck) ---------------------------------------------------
Deno.test("Aufsteller: eigener QR-Erzeuger, A5, geforderte Texte, keine Adresse", async () => {
  const html = await lies("./john-harris-aufsteller.html");
  assertStringIncludes(html, "vexfit-qr.js");
  assertStringIncludes(html, "vexQR.svg");
  assertStringIncludes(html, "size:A5");
  assertStringIncludes(html, "FINDE EINEN");
  assertStringIncludes(html, "PERSONAL TRAINER");
  assertStringIncludes(html, "Partner von <b>John Harris</b>");
  // Kein externer QR-Dienst.
  assert(!/api\.qrserver|chart\.googleapis|qrcode.*\.com/i.test(html),
    "Aufsteller nutzt einen externen QR-Dienst");
});

// ---- Uebersicht -----------------------------------------------------------
Deno.test("Uebersicht: RPC, keine Kundendaten (kunden_email/kunden_name)", async () => {
  const html = await lies("./john-harris-uebersicht.html");
  assertStringIncludes(html, "rpc/studio_uebersicht");
  assert(!html.includes("kunden_email"), "Uebersicht liest kunden_email");
  // Die Uebersicht fragt per Schluessel ab.
  assertStringIncludes(html, "p_schluessel");
});

// ---- Einladung (Registrierung) -------------------------------------------
Deno.test("registrieren.html: Einladung loest studio_einladung_einloesen ein", async () => {
  const html = await lies("./registrieren.html");
  assertStringIncludes(html, "einladung");
  assertStringIncludes(html, "rpc/studio_einladung_einloesen");
  assertStringIncludes(html, "trainer-bereich.html?neu=1&studio=1");
});

// ---- Trainerbereich: Studio-Trainer zahlen nichts ------------------------
Deno.test("trainer-bereich.html: Studio-Trainer sehen keinen Zahlungslink", async () => {
  const html = await lies("./trainer-bereich.html");
  assertStringIncludes(html, "studio_standort_id");
  assertStringIncludes(html, "const istStudio");
  // Im gesperrten Anfrage-Block steht der Studio-Zweig VOR dem Zahlungslink.
  const block = html.slice(html.indexOf("if(a.weitergeleitet === true)"));
  const idxStudio = block.indexOf("else if(istStudio)");
  const idxLink = block.indexOf("LINK_ERSTE");
  assert(idxStudio > -1 && idxStudio < idxLink,
    "Studio-Zweig fehlt oder steht nicht vor dem Zahlungslink");
});

// ---- profil.html: Pflichtfrage bei Studio-Anfragen -----------------------
Deno.test("profil.html: Studio-Kontext erzwingt die Mitglieds-Frage und taggt die Anfrage", async () => {
  const html = await lies("./profil.html");
  assertStringIncludes(html, "vexfit_studio");
  // Pflichtpruefung: ohne Antwort (mitgliedWahl === null) keine Anfrage.
  assertStringIncludes(html, "mitgliedWahl === null");
  // Die Anfrage bekommt Standort und Mitgliedschaft mit.
  assertStringIncludes(html, "studio_standort_id: studioKontext.standort_id");
  assertStringIncludes(html, "studio_mitglied: (mitgliedWahl === 'ja')");
  assertStringIncludes(html, "...studioFelder");
});

// ---- Nicht in Sitemap/Navigation (Vorschauphase) -------------------------
Deno.test("john-harris steht nicht in der Sitemap und nicht in der Startseiten-Navigation", async () => {
  const sitemap = await lies("./sitemap.xml");
  assert(!sitemap.includes("john-harris"), "john-harris steht in der Sitemap");
  const index = await lies("./index.html");
  assert(!index.includes("john-harris"), "john-harris ist in der Startseite verlinkt");
});
