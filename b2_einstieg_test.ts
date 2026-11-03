// /Users/js/Projekte/Vexfit/app/vexfit/b2_einstieg_test.ts
//
// B2 (Dauerlauf 2026-11-03): Trainer-Einstieg in 3 Schritten (Foto · PLZ · Preis)
// und der Admin-Freigabe-Hinweis. Geprüft ohne Browser/Netz:
//   - die reine Pflicht-Regel (vexfit-pflicht.js) und ihre Übereinstimmung mit
//     der Admin-Fassung (vexfit-verwaltung.js),
//   - die Einstiegsstrecke in trainer-bereich.html (Quelltext),
//   - der Admin-Hinweis an den Freigeben-Knöpfen.
//
// Aufruf:  deno test --allow-read b2_einstieg_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { pflichtVorFreigabe as adminPflicht } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// vexfit-pflicht.js laden (setzt globalThis.vexPflicht, gleiche Art wie vexfit-matching.js).
const pflichtQuelle = await lies("./vexfit-pflicht.js");
new Function(pflichtQuelle)();
// deno-lint-ignore no-explicit-any
const vexPflicht = (globalThis as any).vexPflicht;

const AVATAR = "https://hbapzwxdehfgnputrfjf.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg";

Deno.test("Pflicht-Regel: Foto, PLZ, Preis einzeln und kombiniert", () => {
  const leer = vexPflicht.pflichtVorFreigabe({});
  assertEquals(leer.fehlt, ["Foto", "PLZ", "Preis"]);
  assert(!leer.vollstaendig);

  const nurFoto = vexPflicht.pflichtVorFreigabe({ avatar_url: AVATAR });
  assertEquals(nurFoto.fehlt, ["PLZ", "Preis"]);

  const fotoUndPreis = vexPflicht.pflichtVorFreigabe({ avatar_url: AVATAR, preis_stunde: 60 });
  assertEquals(fotoUndPreis.fehlt, ["PLZ"]);

  const alles = vexPflicht.pflichtVorFreigabe({ avatar_url: AVATAR, plz: "5020", preis_stunde: 60 });
  assertEquals(alles.fehlt, []);
  assert(alles.vollstaendig);

  // Ein fremdes (Nicht-Bucket-)Bild zählt nicht als Foto; Preis 0 zählt nicht.
  const falsch = vexPflicht.pflichtVorFreigabe({ avatar_url: "https://fremd.example/x.jpg", plz: "  ", preis_stunde: 0 });
  assertEquals(falsch.fehlt, ["Foto", "PLZ", "Preis"]);
});

Deno.test("Admin-Fassung stimmt mit vexfit-pflicht.js überein (keine Drift)", () => {
  const proben = [
    {},
    { avatar_url: AVATAR },
    { plz: "1010" },
    { preis_stunde: 80 },
    { avatar_url: AVATAR, plz: "5020", preis_stunde: 60 },
    { avatar_url: AVATAR, plz: "", preis_stunde: 0 },
  ];
  for (const t of proben) {
    assertEquals(adminPflicht(t).fehlt, vexPflicht.pflichtVorFreigabe(t).fehlt);
    assertEquals(adminPflicht(t).vollstaendig, vexPflicht.pflichtVorFreigabe(t).vollstaendig);
  }
});

Deno.test("trainer-bereich.html: Einstieg mit genau drei Schritten und Fortschritt", async () => {
  const html = await lies("./trainer-bereich.html");
  assertStringIncludes(html, 'id="einstieg"');
  assertStringIncludes(html, 'id="einstiegSchritt1"');
  assertStringIncludes(html, 'id="einstiegSchritt2"');
  assertStringIncludes(html, 'id="einstiegSchritt3"');
  assert(!html.includes('id="einstiegSchritt4"'), "es darf keinen vierten Schritt geben");
  // Fortschritt "Schritt X von 3".
  assertStringIncludes(html, "Schritt 1 von 3");
  assertStringIncludes(html, "' von 3'");
  // Die drei Schritte sind Foto, PLZ, Preis.
  assertStringIncludes(html, "vexfit-plz.js");
  assertStringIncludes(html, "vexfit-pflicht.js");
  assertStringIncludes(html, 'id="einstiegPlz"');
  assertStringIncludes(html, 'id="einstiegPreis"');
});

Deno.test("trainer-bereich.html: jeder Schritt speichert sofort (eigener PATCH / Foto-Upload)", async () => {
  const html = await lies("./trainer-bereich.html");
  // PLZ und Preis speichern je für sich über denselben PATCH-Weg.
  assertStringIncludes(html, "async function einstiegFeldSpeichern(body)");
  assertStringIncludes(html, "method: 'PATCH'");
  assertStringIncludes(html, "einstiegFeldSpeichern({ preis_stunde: preis })");
  assertStringIncludes(html, "einstiegFeldSpeichern(body)"); // PLZ (plz/stadt/land)
  // Foto nutzt den bestehenden Upload und führt danach weiter.
  assertStringIncludes(html, "einstiegSchrittErledigt('foto')");
});

Deno.test("trainer-bereich.html: Strecke erscheint nach Registrierung (?neu=1)", async () => {
  const html = await lies("./trainer-bereich.html");
  // einstiegStart öffnet bei ?neu=1 oder beim ersten Mal, solange etwas fehlt.
  assertStringIncludes(html, "function einstiegStart()");
  assertStringIncludes(html, "get('neu') === '1'");
  assertStringIncludes(html, "einstiegOeffnen()");
  // Nach dem Laden des Profils wird einstiegStart aufgerufen.
  assertStringIncludes(html, "einstiegStart();   // B2");
});

Deno.test("trainer-bereich.html: 'Später erledigen' führt in den Bereich mit Hinweis", async () => {
  const html = await lies("./trainer-bereich.html");
  assertStringIncludes(html, "Später erledigen");
  assertStringIncludes(html, "function einstiegSpaeter()");
  assertStringIncludes(html, "vexfit_einstieg_gesehen");
  // Persistenter Hinweis mit Knopf, bis alle drei da sind.
  assertStringIncludes(html, 'id="einstiegHinweis"');
  assertStringIncludes(html, "Profil fertigstellen");
  assertStringIncludes(html, "function einstiegHinweisAktualisieren()");
  // Der Hinweis verschwindet, wenn alles vollständig ist.
  assertStringIncludes(html, "p.vollstaendig) { box.classList.add('hidden'); return; }");
});

Deno.test("Admin: Freigeben-Knöpfe nennen genau die fehlenden Pflichtangaben", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function freigabeFehltHinweis(t)");
  assertStringIncludes(js, "Fehlt für die Freigabe:");
  // In die Warte-Karte und die Trainer-Karte (nur solange nicht freigegeben) eingebaut.
  assertStringIncludes(js, "${freigabeFehltHinweis(t)}");
  assertStringIncludes(js, '${!t.aktiv ? freigabeFehltHinweis(t) : ""}');
  // Freigeben bleibt immer möglich (Knopf unverändert vorhanden).
  assertStringIncludes(js, 'data-aktion="freigeben"');
});
