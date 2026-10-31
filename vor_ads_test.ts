// /Users/js/Projekte/Vexfit/app/vexfit/vor_ads_test.ts
//
// Baustein "Letzter Schliff vor Ads-Start" (Zweig vor-ads-fix). Prueft OHNE Netz
// und OHNE Browser gegen die echten Quelldateien:
//   - Teil A: Profilbild-Sofort-Upload in trainer-bereich.html.
//   - Teil B: die EINE Profilberechnung (reine Funktion profilAuswertung()
//     zwischen ==KERN-ANFANG==/==KERN-ENDE== in trainer-bereich.html).
//   - Teil C: ehrliche Werbeaussagen (registrieren/index/Ad-Seiten/sitemap).
//
// Aufruf:  deno test --allow-read vor_ads_test.ts
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── Die reine Profilberechnung aus trainer-bereich.html herausloesen ─────────
// Wie in suche_test.ts: der ECHTE Seitencode wird geprueft, keine Kopie.
async function kernLaden() {
  const html = await lies("./trainer-bereich.html");
  const anfang = html.indexOf("// ==KERN-ANFANG==");
  const ende = html.indexOf("// ==KERN-ENDE==");
  assert(
    anfang !== -1 && ende !== -1 && ende > anfang,
    "Kern-Block (==KERN-ANFANG==/==KERN-ENDE==) in trainer-bereich.html nicht gefunden",
  );
  const quelle = html.slice(anfang, ende);
  const bauen = new Function(quelle + "\nreturn { profilAuswertung };");
  return bauen() as {
    profilAuswertung: (p: Record<string, unknown>) => {
      prozent: number;
      inSuche: boolean;
      vollstaendig: boolean;
      gesamt: number;
      noetigFehlt: string[];
      noetig: Array<{ name: string; ok: boolean }>;
      alle: Array<{ name: string; ok: boolean }>;
    };
  };
}

// Vollstaendiges Profil (alle 13 Punkte erfuellt) als Ausgangspunkt fuer Faelle.
function vollesProfil() {
  return {
    foto: true,
    bio: "Zehn Zeichen.", // > 10
    spezialisierungen: ["Muskelaufbau"],
    trainingsart: "Personal Training",
    preis_stunde: 60,
    erfahrung: "3-5 Jahre",
    trainingsort: "beides",
    telefon: "telefon vorhanden",
    video: true,
    galerie: ["g1"],
    sprachen: ["Deutsch"],
    trainingsorte: ["Studio"],
    zertifikat: true,
  } as Record<string, unknown>;
}

// =========================================================================
// TEIL B: eine einzige Berechnung
// =========================================================================
Deno.test("Teil B: leeres Profil -> 0 %, nicht in der Suche, nicht vollstaendig", async () => {
  const { profilAuswertung } = await kernLaden();
  const a = profilAuswertung({});
  assertEquals(a.prozent, 0);
  assertEquals(a.inSuche, false);
  assertEquals(a.vollstaendig, false);
  // Pflichtpunkte fehlen alle drei.
  assertEquals(a.noetigFehlt.sort(), ["Foto", "Kurztext", "Spezialisierungen"]);
});

Deno.test("Teil B: nur die Pflichtpunkte -> in der Suche, aber noch nicht 100 %", async () => {
  const { profilAuswertung } = await kernLaden();
  const a = profilAuswertung({
    foto: true,
    bio: "1234567890", // genau 10
    spezialisierungen: ["Abnehmen"],
  });
  assertEquals(a.inSuche, true);
  assertEquals(a.noetigFehlt.length, 0);
  assertEquals(a.vollstaendig, false);
  // 3 von 13 Punkten.
  assertEquals(a.prozent, Math.round((3 / a.gesamt) * 100));
});

Deno.test("Teil B: alles ausser Foto -> NICHT in der Suche sichtbar", async () => {
  const { profilAuswertung } = await kernLaden();
  const p = vollesProfil();
  p.foto = false;
  const a = profilAuswertung(p);
  assertEquals(a.inSuche, false);
  assert(a.noetigFehlt.includes("Foto"), "Foto muss als fehlender Pflichtpunkt gelten");
  // Trotz vieler Punkte nicht 100 % (Foto fehlt).
  assertEquals(a.vollstaendig, false);
});

Deno.test("Teil B: Kurztext genau 9 Zeichen zaehlt nicht, genau 10 zaehlt", async () => {
  const { profilAuswertung } = await kernLaden();
  const kurztext = (bio: string) =>
    profilAuswertung({ bio }).noetig.find((i) => i.name === "Kurztext")!.ok;
  assertEquals(kurztext("123456789"), false); // 9
  assertEquals(kurztext("1234567890"), true); // 10
  // Rand-Leerzeichen zaehlen nicht mit (trim): 10 Zeichen + Leerzeichen -> ok,
  // 9 Zeichen mit Leerzeichen drumherum -> nicht ok.
  assertEquals(kurztext("  1234567890  "), true);
  assertEquals(kurztext("  123456789  "), false);
});

Deno.test("Teil B: alles erfuellt -> 100 %, vollstaendig, keine Leiste (vollstaendig=true)", async () => {
  const { profilAuswertung } = await kernLaden();
  const a = profilAuswertung(vollesProfil());
  assertEquals(a.prozent, 100);
  assertEquals(a.vollstaendig, true);
  assertEquals(a.inSuche, true);
  // Bei vollstaendig=true blendet updateDots beide Leisten aus (orange + gruen).
});

Deno.test("Teil B: eine Zahl speist Balken, Uebersicht und Karte (eine Berechnung)", async () => {
  const html = await lies("./trainer-bereich.html");
  // Genau eine reine Berechnung.
  assertStringIncludes(html, "function profilAuswertung(p)");
  // Sie speist alle Anzeigen ueber aktuellesProfil().
  assertStringIncludes(html, "function aktuellesProfil()");
  assertStringIncludes(html, "profilAuswertung(aktuellesProfil())");
  // Balken/Label, Uebersicht und Nav-Punkt haengen an derselben Auswertung.
  assertStringIncludes(html, "pctLabel");
  assertStringIncludes(html, "ubProfil");
  assertStringIncludes(html, "profileComplete = a.vollstaendig;");
  // Die Pflichtgruppe spiegelt die Sicht trainers_oeffentlich.
  const sql = await lies("./migrations/2026-10-31-05-verfuegbarkeit.sql");
  assertStringIncludes(sql, "avatar_url IS NOT NULL");
  assertStringIncludes(sql, "array_length(spezialisierungen, 1) >= 1");
});

// =========================================================================
// TEIL A: Profilbild sofort hochladen
// =========================================================================
Deno.test("Teil A: kein Hochladen-Knopf mehr (btnAvatarUpload entfernt)", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(!html.includes("btnAvatarUpload"), "btnAvatarUpload ist noch vorhanden");
  // "Bild auswählen" bleibt das einzige Bild-Bedienelement.
  assertStringIncludes(html, "Bild auswählen");
});

Deno.test("Teil A: das change-Ereignis von #fAvatar ruft uploadAvatar auf", async () => {
  const html = await lies("./trainer-bereich.html");
  // Den change-Handler herausschneiden (bis zur Definition von uploadAvatar).
  const start = html.indexOf("getElementById('fAvatar').addEventListener('change'");
  assert(start !== -1, "change-Handler fuer #fAvatar nicht gefunden");
  const bis = html.indexOf("async function uploadAvatar", start);
  assert(bis !== -1, "uploadAvatar-Definition nach dem Handler nicht gefunden");
  const handler = html.slice(start, bis);
  assertStringIncludes(handler, "uploadAvatar()");
  // Waehrend des Uploads: Hinweis sichtbar, Vorschau abgedunkelt.
  assertStringIncludes(html, "Wird hochgeladen …");
  assertStringIncludes(html, "avatar-preview.laedt");
  // Erfolgsmeldung genau wie gefordert.
  assertStringIncludes(html, "✓ Profilbild gespeichert");
});

// =========================================================================
// TEIL C: ehrliche Werbeaussagen
// =========================================================================
Deno.test("Teil C: 'Monatlich kündbar' beim Trainer, 'Kein Abo' bleibt beim Kunden", async () => {
  const html = await lies("./registrieren.html");
  const iTrainer = html.indexOf('id="formTrainer"');
  const iClient = html.indexOf('id="formClient"');
  assert(iTrainer !== -1 && iClient !== -1 && iClient > iTrainer, "Formular-Abschnitte nicht gefunden");
  const trainer = html.slice(iTrainer, iClient);
  const kunde = html.slice(iClient);
  assert(!trainer.includes("Kein Abo"), "Trainer-Abschnitt sagt noch 'Kein Abo'");
  assertStringIncludes(trainer, "Monatlich kündbar");
  assertStringIncludes(kunde, "Kein Abo");
});

Deno.test("Teil C: index.html macht keine pauschale Verifizierungs-Aussage", async () => {
  const html = await lies("./index.html");
  assert(!/verifiziert/i.test(html), "index.html enthaelt noch eine pauschale 'verifiziert'-Aussage");
  // Hero-Text ist der neue Wortlaut.
  assertStringIncludes(html, "den passenden Personal Trainer");
  assert(!html.includes("den perfekten Personal Trainer"), "alter Hero-Text noch da");
});

Deno.test("Teil C: beide Ad-Seiten tragen noindex (nofollow)", async () => {
  for (const datei of ["vexfit-ad-neugier.html", "vexfit-ad-schmerz.html"]) {
    const s = await lies("./" + datei);
    assert(
      /<meta name="robots" content="noindex, nofollow">/.test(s),
      `${datei} ohne 'noindex, nofollow'`,
    );
  }
});

Deno.test("Teil C: sitemap.xml fuehrt keine Ad-Seite", async () => {
  const s = await lies("./sitemap.xml");
  assert(!s.includes("vexfit-ad"), "sitemap.xml enthaelt eine Ad-Seite");
});
