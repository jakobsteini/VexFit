// /Users/js/Projekte/Vexfit/app/vexfit/einstieg_test.ts
//
// Baustein "Einstieg vereinfachen". Prueft die DOM-freie Entscheidungslogik
// (vexfit-einstieg.js) hinter den geforderten Szenarien sowie die CSS-/Einbau-
// Fixes in kunden-bereich.html (ohne Browser).
//
// Aufruf:  deno test --allow-read einstieg_test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

async function ladeVexEinstieg() {
  const src = await lies("./vexfit-einstieg.js");
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", src)(g, g, undefined);
  // deno-lint-ignore no-explicit-any
  return g.vexEinstieg as any;
}

Deno.test("vollstaendiges Konto: nur Frage 1 (Ort) und 2 (Umkreis)", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(E.einstiegSchritte({ zielGesetzt: true, plzGesetzt: true }), ["ort", "umkreis"]);
  assertEquals(E.plzFeldNoetig({ plzGesetzt: true }), false);
});

Deno.test("Altkonto ohne Ziel und ohne PLZ: Ziel-Frage + PLZ-Feld", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(E.einstiegSchritte({ zielGesetzt: false, plzGesetzt: false }), ["ziel", "ort", "umkreis"]);
  assertEquals(E.plzFeldNoetig({ plzGesetzt: false }), true);
});

Deno.test("szText: Abnehmen · Vor Ort · 25 km um Zug", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(
    E.szTextBauen({ ziele: ["Abnehmen"], ort: "vor_ort", umkreis: 25, stadt: "Zug" }),
    "Abnehmen · Vor Ort · 25 km um Zug",
  );
  // 'beides' = kein Ort-Teil; ohne Ziele -> "Alle Ziele"; Umkreis 0 -> "alle · Stadt".
  assertEquals(
    E.szTextBauen({ ziele: [], ort: "beides", umkreis: 0, stadt: "Wien" }),
    "Alle Ziele · alle · Wien",
  );
  assertEquals(E.ortLabel("beides"), "");
  assertEquals(E.ortLabel("online"), "Online");
});

Deno.test("kunden-bereich.html: CSS-Fix und 2-Fragen-Umbau", async () => {
  const html = await lies("./kunden-bereich.html");
  // Befund B behoben: .hidden setzt sich jetzt durch.
  assertStringIncludes(html, ".hidden{display:none !important}");
  // Modul eingebunden.
  assertStringIncludes(html, 'src="vexfit-einstieg.js"');
  // Keine gelben Weiter-Knoepfe mehr ausser bei der Ziel-Frage (einstiegZielWeiter).
  const weiter = [...html.matchAll(/class="ein-weiter"/g)].length;
  assertEquals(weiter, 1);
  assertStringIncludes(html, "einstiegZielWeiter()");
  // Ort-Frage mit drei Knoepfen inkl. Beides; Umkreis per Tipp.
  assertStringIncludes(html, "einOrtTipp('beides')");
  assertStringIncludes(html, "einUmkreisTipp(25)");
  // Befund C: Nutzer-PLZ wird bei gesetztem Land ohne Rueckfrage aufgeloest.
  assertStringIncludes(html, "ermittleNutzerCoords(plz, status, K && K.land)");
  // Befund D: szText wird aus vexEinstieg.szTextBauen gefuellt.
  assertStringIncludes(html, "vexEinstieg.szTextBauen");
});

// ===========================================================================
// Komplettpruefung 26.10.2026: Kunden-Einstieg + Trefferliste
// ===========================================================================

Deno.test("Baustein: vollstaendiges Konto (Ziel+PLZ) bekommt keine Ziel-Frage und kein PLZ-Feld", async () => {
  const E = await ladeVexEinstieg();
  // Ziel/PLZ gesetzt (ziel 'Abnehmen', plz '5026', land 'AT') -> nur Ort+Umkreis.
  assertEquals(E.einstiegSchritte({ zielGesetzt: true, plzGesetzt: true }), ["ort", "umkreis"]);
  assertEquals(E.plzFeldNoetig({ plzGesetzt: true }), false);
});

Deno.test("Baustein: Online braucht keine Umkreis-Frage", async () => {
  const E = await ladeVexEinstieg();
  assertEquals(E.brauchtUmkreis("online"), false);
  assertEquals(E.brauchtUmkreis("vor_ort"), true);
  assertEquals(E.brauchtUmkreis("beides"), true);
});

Deno.test("Baustein C: ein Trainer in Muenchen (beides) zaehlt bei Salzburg/10km NICHT zum Umkreis", async () => {
  const E = await ladeVexEinstieg();
  // Claire: Muenchen, Vor Ort + Online (trainingsort 'beides'), ~140 km von Salzburg.
  const claire = { id: "c1", trainingsort: "beides", _dist: 140 };
  // Vor Ort, 10 km -> kein Treffer im Umkreis, Zaehlzeile 0.
  const vorOrt = E.trefferAufteilen([claire], "vor_ort", 10);
  assertEquals(vorOrt.anzahlUmkreis, 0);
  assertEquals(vorOrt.umkreis.length, 0);
  assertEquals(E.zaehlzeile("Salzburg", vorOrt.anzahlUmkreis, 10), "Salzburg · 0 Trainer im Umkreis von 10 km");
  // Online -> Claire erscheint als Online-Trainer (ortsunabhaengig).
  const online = E.trefferAufteilen([claire], "online", 0);
  assertEquals(online.online.length, 1);
  assertEquals(online.anzahlUmkreis, 0);
});

Deno.test("Baustein: Umkreis zaehlt Vor-Ort-Treffer, Online getrennt (beides)", async () => {
  const E = await ladeVexEinstieg();
  const nah = { id: "n", trainingsort: "vor_ort", _dist: 5 };
  const weitOnline = { id: "o", trainingsort: "online", _dist: null };
  const res = E.trefferAufteilen([nah, weitOnline], "beides", 10);
  assertEquals(res.anzahlUmkreis, 1);
  assertEquals(res.umkreis[0].id, "n");
  assertEquals(res.online.length, 1);
  assertEquals(res.online[0].id, "o");
  // Zaehlzeile nennt nur den Umkreis-Treffer.
  assertEquals(E.zaehlzeile("Zug", res.anzahlUmkreis, 10), "Zug · 1 Trainer im Umkreis von 10 km");
});

Deno.test("Baustein B: kunden-bereich laedt K per user_id und wartet darauf vor dem Einstieg", async () => {
  const html = await lies("./kunden-bereich.html");
  // Eigene Zeile primaer ueber user_id, Rueckfall E-Mail (ilike).
  assertStringIncludes(html, "kunden?user_id=eq.${encodeURIComponent(sess.user_id)}");
  assertStringIncludes(html, "kunden?email=ilike.${encodeURIComponent(sess.email)}");
  // Erst laden, dann routen (sonst Befund B).
  assertStringIncludes(html, "await loadKunde();");
  assertStringIncludes(html, "einstiegRouten();");
});

Deno.test("Baustein 4: Benachrichtige-mich schreibt in trainer_alerts (Tabelle der Edge Function)", async () => {
  const html = await lies("./kunden-bereich.html");
  assertStringIncludes(html, "function benachrichtigeMich()");
  assertStringIncludes(html, "/rest/v1/trainer_alerts");
  assertStringIncludes(html, "Du bist vorgemerkt");
  // Leerer Zustand mit genau dem geforderten Wortlaut + Zweitknoepfen.
  assertStringIncludes(html, "Noch kein Trainer in deinem Umkreis");
  assertStringIncludes(html, "Größeren Umkreis wählen");
  assertStringIncludes(html, "Online-Trainer ansehen");
});

Deno.test("Baustein 6: Einstieg als zentrierte Karte mit Fortschrittsbalken und grossen Kacheln", async () => {
  const html = await lies("./kunden-bereich.html");
  assertStringIncludes(html, 'class="ein-karte"');
  assertStringIncludes(html, 'id="einBarFill"');
  assertStringIncludes(html, "min-height:64px"); // grosse Kacheln
  assertStringIncludes(html, 'class="ein-kachel"');
  // Umkreis-Zeile "um <PLZ> <Stadt>" mit "ändern" statt erneutem PLZ-Feld.
  assertStringIncludes(html, "einPlzAendern()");
  assertStringIncludes(html, 'id="einOrtZeile"');
});

Deno.test("Baustein A: registrieren.html blendet 'bereits angemeldet' auf der Erfolgsseite aus", async () => {
  const html = await lies("./registrieren.html");
  // In showSuccess wird der Hinweis-Kasten ausgeblendet.
  assertStringIncludes(html, "angemeldet-hinweis'); if(hA) hA.style.display='none';");
});
