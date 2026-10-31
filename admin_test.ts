// /Users/js/Projekte/Vexfit/app/vexfit/admin_test.ts
//
// Baustein „Admin-Bereich komplett funktionsfähig" – Teil 8: automatisierte
// Tests im bestehenden Stil (ohne Netz, ohne Browser). Zwei Arten:
//   A) echte Logik: die reinen Hilfsfunktionen werden aus admin.html
//      herausgeschnitten und ausgeführt (wie suche_test.ts / vor_ads_test.ts).
//   B) Struktur: die Verdrahtung (jeder Reiter lädt, Detailfelder, Freigabe-
//      Sperre, Namens-Tippbestätigung, Meldungen statt alert) wird statisch
//      gegen die echte Datei geprüft.
// Das Verhalten der Edge Function (Sperren/Löschen, Nicht-Admin → 403) steht in
// supabase/functions/vexfit-automation/admin_sperren_loeschen_test.ts.
//
// Aufruf:  deno test --allow-read admin_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("./admin.html", import.meta.url));

// Schneidet `function name(...) { ... }` per Klammerzählung heraus (die hier
// geprüften Funktionen enthalten keine geschweiften Klammern in Strings).
function holeFunktion(src: string, name: string): string {
  const start = src.indexOf("function " + name + "(");
  assert(start >= 0, "Funktion nicht gefunden: " + name);
  const auf = src.indexOf("{", start);
  let tiefe = 0;
  for (let j = auf; j < src.length; j++) {
    if (src[j] === "{") tiefe++;
    else if (src[j] === "}") { tiefe--; if (tiefe === 0) return src.slice(start, j + 1); }
  }
  throw new Error("kein Funktionsende: " + name);
}

// Reine Hilfsfunktionen aus admin.html in einen eigenen Kontext laden.
function kern() {
  const SUPABASE_URL = "https://x.supabase.co";
  const AVATAR_PREFIX = SUPABASE_URL + "/storage/v1/object/public/avatars/";
  const TEST_EMAILS: string[] = [];
  const vexVideo = { erkenne: (u: string) => !!u };
  const quelle = [
    holeFunktion(html, "avatarAdresse"),
    holeFunktion(html, "fehlendeProfilfelder"),
    holeFunktion(html, "istTestkonto"),
    holeFunktion(html, "anfrageZustand"),
    holeFunktion(html, "profilStaerke"),
  ].join("\n");
  const bauen = new Function(
    "SUPABASE_URL", "AVATAR_PREFIX", "TEST_EMAILS", "vexVideo",
    quelle + "\nreturn { avatarAdresse, fehlendeProfilfelder, istTestkonto, anfrageZustand, profilStaerke };",
  );
  return bauen(SUPABASE_URL, AVATAR_PREFIX, TEST_EMAILS, vexVideo) as {
    avatarAdresse: (u: unknown) => string | null;
    fehlendeProfilfelder: (t: Record<string, unknown>) => string[];
    istTestkonto: (e: unknown) => boolean;
    anfrageZustand: (a: Record<string, unknown>) => string;
    profilStaerke: (t: Record<string, unknown>) => number;
  };
}
const AVATAR = "https://x.supabase.co/storage/v1/object/public/avatars/bild.jpg";
function vollerTrainer() {
  return {
    avatar_url: AVATAR, bio: "Ein ausreichend langer Text über mich.", spezialisierungen: ["Muskelaufbau"],
    trainingsart: "Personal Training", trainingsort: "studio", preis_stunde: 60, erfahrung: "3-5 Jahre",
    telefon: "telefon vorhanden", video_url: "https://youtu.be/x", galerie: ["g"], sprachen: ["Deutsch"],
    trainingsorte: ["studio"], zertifikat_datei: "z.pdf",
  } as Record<string, unknown>;
}

// ── A) Vollständigkeit zählt das Foto; 8 Felder; Liste = Detail ─────────────
Deno.test("Vollständigkeit: leeres Profil 0/8 (acht fehlen, inkl. Foto)", () => {
  const { fehlendeProfilfelder } = kern();
  const fehlt = fehlendeProfilfelder({});
  assertEquals(fehlt.length, 8);
  assert(fehlt.includes("Foto"), "Foto muss als Vollständigkeitsfeld zählen");
});

Deno.test("Vollständigkeit: volles Profil 8/8 (nichts fehlt)", () => {
  const { fehlendeProfilfelder } = kern();
  assertEquals(fehlendeProfilfelder(vollerTrainer()), []);
});

Deno.test("Vollständigkeit: fehlendes Foto wird als einziges Feld gezählt (6/7-Bug behoben)", () => {
  const { fehlendeProfilfelder } = kern();
  const t = vollerTrainer(); t.avatar_url = null;
  assertEquals(fehlendeProfilfelder(t), ["Foto"]);
});

// ── A) Testkonten, Anfragezustand, Profilstärke ─────────────────────────────

Deno.test("istTestkonto: E-Mail mit + ist Test, normale nicht", () => {
  const { istTestkonto } = kern();
  assert(istTestkonto("noah.kari+1@icloud.com"));
  assert(!istTestkonto("marco@example.com"));
  assert(!istTestkonto(""));
});

Deno.test("anfrageZustand: nur angenommen/abgelehnt, sonst offen", () => {
  const { anfrageZustand } = kern();
  assertEquals(anfrageZustand({ status: "angenommen" }), "angenommen");
  assertEquals(anfrageZustand({ status: "abgelehnt" }), "abgelehnt");
  assertEquals(anfrageZustand({}), "offen");
  assertEquals(anfrageZustand({ status: "irgendwas" }), "offen");
});

Deno.test("profilStaerke: leeres Profil 0 %, volles 100 %", () => {
  const { profilStaerke } = kern();
  assertEquals(profilStaerke({}), 0);
  assertEquals(profilStaerke(vollerTrainer()), 100);
});

// ── B) Struktur: keine alert/confirm/prompt, Fehler als Meldung ─────────────
Deno.test("keine alert/confirm/prompt mehr im Admin (echte Aufrufe)", () => {
  // Ein echter Aufruf hat ein Argument (String); das Wort in Kommentaren zählt
  // nicht. Darum nur Aufrufe mit String-Argument prüfen.
  assert(!/(?:alert|confirm|prompt)\(\s*['"`]/.test(html), "echter alert/confirm/prompt-Aufruf vorhanden");
  // Eigene Meldungs- und Bestätigungswege sind da.
  assertStringIncludes(html, "function zeigeMeldung(");
  assertStringIncludes(html, "function meldeFehler(");
  assertStringIncludes(html, "function bestaetige(");
});

Deno.test("jeder Reiter wird geladen/gerendert", () => {
  for (const fn of [
    "renderTrainerliste(", "renderKundenliste(", "ladeFreigabe(", "ladeAnfragenListe(",
    "ladeTrainerOhneAnfrage(", "ladeProfilUnvollstaendig(", "ladeZahlungen(", "ladeStudios(",
    "ladeZertifikate(", "renderProfilUebersicht(", "ladeNachfrage(", "ladeAnfragenKennzahlen(",
  ]) {
    assertStringIncludes(html, fn);
  }
});

Deno.test("Detailansicht Trainer zeigt alle wichtigen Felder", () => {
  assertStringIncludes(html, "function trainerDetail(");
  for (const label of [
    "Telefon", "PLZ / Stadt", "Trainingsart", "Trainingsort", "Preis pro Stunde",
    "Erfahrung", "Über mich", "Spezialisierungen", "Registriert am",
    "Profil-Vollständigkeit", "Anfragen",
  ]) {
    assertStringIncludes(html, label);
  }
  // Zeilen sind klickbar.
  assertStringIncludes(html, 'onclick="trainerDetail(');
});

Deno.test("Detailansicht Kunde zeigt Felder und gestellte Anfragen", () => {
  assertStringIncludes(html, "function kundeDetail(");
  assertStringIncludes(html, "function ladeKundeAnfragen(");
  assertStringIncludes(html, "Antworten aus dem Einstieg");
  assertStringIncludes(html, "Gestellte Anfragen");
  assertStringIncludes(html, 'onclick="kundeDetail(');
});

Deno.test("kein Freigabe-Gate mehr: Freigeben ist bei jedem Profil möglich", () => {
  // Die alte Sperre ist weg.
  assert(!html.includes("function sucheFehlt("), "sucheFehlt (Gate) noch vorhanden");
  assert(!html.includes("Freigeben gesperrt"), "Text 'Freigeben gesperrt' noch vorhanden");
  assert(!html.includes("Freigeben nicht möglich"), "Freigabe wird noch blockiert");
  // Stattdessen ein neutraler Hinweis in der Detailansicht.
  assertStringIncludes(html, "Freigeben ist trotzdem möglich");
  // activateTrainer gibt bei unvollständigem Profil nicht mehr früh zurück.
  assertStringIncludes(html, "Der Admin entscheidet allein");
});

Deno.test("Vollständigkeit: EINE gemeinsame Zahl (PROFIL_FELDER_GESAMT) in Liste und Detail", () => {
  assertStringIncludes(html, "const PROFIL_FELDER_GESAMT = 8;");
  // Detailansicht und Freigabe-Liste rechnen mit derselben Konstante.
  assertStringIncludes(html, "PROFIL_FELDER_GESAMT - fehlt.length");
  assertStringIncludes(html, "${voll}/${PROFIL_FELDER_GESAMT}");
  // Keine fest verdrahtete 7 mehr bei der Vollständigkeit.
  assert(!/\$\{7 - fehlt\.length\}\/7/.test(html), "alte 7er-Vollständigkeit noch vorhanden");
});

Deno.test("Löschen entfernt die Person sofort aus dem Cache (ohne Neuladen)", () => {
  assertStringIncludes(html, "window.allTrainers = (window.allTrainers || []).filter(x => String(x.id) !== String(id));");
  assertStringIncludes(html, "window.allKunden = (window.allKunden || []).filter(x => String(x.id) !== String(id));");
  assertStringIncludes(html, "renderAllesNeu();");
});

Deno.test("Sperren/Löschen laufen über die abgesicherte Edge Function", () => {
  assertStringIncludes(html, "vexfit-automation/admin-aktion");
  assertStringIncludes(html, "'login_sperren'");
  assertStringIncludes(html, "'login_entsperren'");
  assertStringIncludes(html, "'endgueltig_loeschen'");
  // Kein Service-Role-Schlüssel im Frontend (Wort in Kommentaren ist ok,
  // ein echter geheimer Schlüssel nicht).
  assert(!/sb_secret/i.test(html), "geheimer Schlüssel (sb_secret…) im Frontend");
  assert(!/service_role_key/i.test(html), "Service-Role-Schlüssel im Frontend");
});

Deno.test("endgültig Löschen verlangt den eingetippten Namen", () => {
  // Der OK-Knopf bleibt gesperrt, bis der Name exakt übereinstimmt.
  assertStringIncludes(html, "ok.disabled = eingabe.value.trim() !== opt.nameZumTippen.trim();");
  // loeschePerson übergibt den Namen als Tippbestätigung und bestaetigt=true.
  assertStringIncludes(html, "nameZumTippen: name");
  assertStringIncludes(html, "bestaetigt: true");
});

Deno.test("Darstellung: Seite ohne Querscroll, Detail am Handy Vollbild", () => {
  assertStringIncludes(html, "body{overflow-x:hidden}");
  assertStringIncludes(html, ".panel{max-width:100%}");
});

Deno.test("Suche zeigt Trainer ohne Foto mit Initialen (kein Fehler, kein undefined)", async () => {
  const suche = await Deno.readTextFile(new URL("./suche.html", import.meta.url));
  // Ohne Foto wird eine Initialen-Kachel gezeigt (avatarAdresse liefert null →
  // bgColors + initials), nicht ein kaputtes Bild.
  assertStringIncludes(suche, "avatarAdresse(t.avatar_url)");
  assertStringIncludes(suche, "(t.vorname||'?')[0]");
  assertStringIncludes(suche, "bild ? '' :");
  // Spezialisierungen/Preis tolerieren leere Werte (kein undefined).
  assertStringIncludes(suche, "(t.spezialisierungen||[])");
  assertStringIncludes(suche, "t.preis_stunde ?");
});
