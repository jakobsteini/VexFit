// /Users/js/Projekte/Vexfit/app/vexfit/suche_test.ts
//
// Prueft den Baustein "Trainerprofile ohne Anmeldung sichtbar" OHNE Netz und
// OHNE Browser. Geprueft wird gegen die echten Quelldateien:
//   - migrations/2026-10-26-oeffentliche-trainer.sql (die oeffentliche Sicht)
//   - suche.html (die DOM-freien Kern-Hilfen zwischen ==KERN-ANFANG==/==ENDE==)
//
// Aufruf:  deno test --allow-read suche_test.ts
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

// ── Quelldateien einlesen (Pfade relativ zu dieser Testdatei) ───────────────
const migration = await Deno.readTextFile(
  new URL("./migrations/2026-10-26-oeffentliche-trainer.sql", import.meta.url),
);
const sucheHtml = await Deno.readTextFile(
  new URL("./suche.html", import.meta.url),
);

// ── Die DOM-freien Kern-Hilfen aus suche.html herausloesen und auswerten ─────
// So wird der ECHTE Seitencode geprueft, keine Kopie.
function kernAusSuche() {
  const anfang = sucheHtml.indexOf("// ==KERN-ANFANG==");
  const ende = sucheHtml.indexOf("// ==KERN-ENDE==");
  assert(anfang !== -1 && ende !== -1 && ende > anfang,
    "Kern-Block (==KERN-ANFANG==/==KERN-ENDE==) in suche.html nicht gefunden");
  const quelle = sucheHtml.slice(anfang, ende);
  const bauen = new Function(
    quelle +
      "\nreturn { OEFFENTLICHE_SPALTEN, kontaktKnopf, ladeOeffentlich };",
  );
  return bauen() as {
    OEFFENTLICHE_SPALTEN: string;
    kontaktKnopf: (angemeldet: boolean) => string;
    ladeOeffentlich: (
      fetchImpl: typeof fetch,
      basisUrl: string,
      apikey: string,
    ) => Promise<Array<Record<string, unknown>>>;
  };
}

// Liest die Spaltenliste zwischen SELECT und "FROM public.trainers" aus der
// Sicht-Definition in der Migration.
function sichtSpalten(): string[] {
  const m = migration.match(
    /CREATE VIEW public\.trainers_oeffentlich[\s\S]*?SELECT([\s\S]*?)FROM public\.trainers/i,
  );
  assert(m, "CREATE VIEW public.trainers_oeffentlich ... SELECT ... FROM nicht gefunden");
  return m![1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Test 1: Die Sicht enthaelt keine Spalte email und keine Spalte telefon ──
Deno.test("trainers_oeffentlich hat keine Spalte email und keine Spalte telefon", () => {
  const spalten = sichtSpalten();
  assert(!spalten.includes("email"), "email darf in der Sicht nicht vorkommen");
  assert(!spalten.includes("telefon"), "telefon darf in der Sicht nicht vorkommen");
  // Ausdruecklich auch diese nicht (laut Aufgabe):
  assert(!spalten.includes("user_id"), "user_id darf in der Sicht nicht vorkommen");
  assert(!spalten.includes("created_at"), "created_at darf in der Sicht nicht vorkommen");
  // Die geforderten unbedenklichen Spalten sind da:
  assertEquals(spalten, [
    "id",
    "vorname",
    "nachname",
    "stadt",
    "plz",
    "trainingsart",
    "trainingsort",
    "spezialisierungen",
    "bio",
    "preis_stunde",
    "preis_monat",
    "avatar_url",
  ]);
  // Rechtevergabe an anon und authenticated ist vorhanden.
  assertStringIncludes(
    migration.replace(/\s+/g, " "),
    "GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated",
  );
  // Sicherheitskontext bewusst gesetzt.
  assertStringIncludes(migration, "security_invoker = false");
});

// ── Test 2: Abruf ohne Sitzung liefert Profile und keine Kontaktdaten ───────
Deno.test("Abruf ohne Sitzung liefert Profile und keine Kontaktdaten", async () => {
  const { OEFFENTLICHE_SPALTEN, ladeOeffentlich } = kernAusSuche();

  // Die angefragten Spalten enthalten keine Kontaktdaten.
  assert(!OEFFENTLICHE_SPALTEN.split(",").includes("email"));
  assert(!OEFFENTLICHE_SPALTEN.split(",").includes("telefon"));

  // So, wie die oeffentliche Sicht antworten wuerde: nur unbedenkliche Spalten.
  const sichtZeilen = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      vorname: "Mara",
      nachname: "Berg",
      stadt: "Salzburg",
      plz: "5020",
      trainingsart: "Vor Ort",
      trainingsort: "vor_ort",
      spezialisierungen: ["Kraft", "Reha"],
      bio: "Trainerin seit 2018.",
      preis_stunde: 60,
      preis_monat: null,
      avatar_url: null,
    },
  ];

  let gesehenUrl = "";
  const mockFetch = ((url: string, _init?: unknown) => {
    gesehenUrl = String(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sichtZeilen),
    });
  }) as unknown as typeof fetch;

  const profile = await ladeOeffentlich(
    mockFetch,
    "https://beispiel.supabase.co",
    "sb_publishable_TEST",
  );

  // Profile werden geliefert.
  assert(Array.isArray(profile) && profile.length === 1, "Es sollte ein Profil geliefert werden");
  assertEquals(profile[0].vorname, "Mara");
  assertEquals(profile[0].stadt, "Salzburg");

  // Gegen die oeffentliche Sicht wird abgefragt, nicht gegen die Tabelle.
  assertStringIncludes(gesehenUrl, "/rest/v1/trainers_oeffentlich");
  assert(!gesehenUrl.includes("email"), "Die Abfrage darf keine email-Spalte anfragen");
  assert(!gesehenUrl.includes("telefon"), "Die Abfrage darf keine telefon-Spalte anfragen");

  // Kein geliefertes Profil enthaelt Kontaktdaten.
  for (const p of profile) {
    assert(!("email" in p), "Profil darf keine email enthalten");
    assert(!("telefon" in p), "Profil darf kein telefon enthalten");
    assert(!("user_id" in p), "Profil darf keine user_id enthalten");
  }
});

// ── Test 3: Kontaktknopf ohne Sitzung zeigt auf registrieren.html ───────────
Deno.test("Kontaktknopf ohne Sitzung zeigt auf registrieren.html", () => {
  const { kontaktKnopf } = kernAusSuche();

  const ohneSitzung = kontaktKnopf(false);
  assertStringIncludes(ohneSitzung, 'href="registrieren.html?typ=kunde"');
  assertStringIncludes(ohneSitzung, "Anmelden und anfragen");

  // Fuer Angemeldete bleibt die Karte unveraendert: kein zusaetzlicher Knopf.
  assertEquals(kontaktKnopf(true), "");
});
