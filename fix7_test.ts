// /Users/js/Projekte/Vexfit/app/vexfit/fix7_test.ts
//
// Fix 7 (Komplettpruefung 26.10.2026):
//   a) "Eingeloggt bleiben": refresh_token speichern; gemeinsame Datei
//      vexfit-sitzung.js erneuert das Token vor Ablauf, loggt bei Fehler aus.
//   b) Spam-Schutz (Server-Logik in kern_test.ts): hier die Seiten-Seite
//      (suche.html Honeypot + 429-Meldung, registrieren.html mit Token) und
//      die Migration.
//   c) Stadt-Links: Marker in index.html/suche.html, die der Generator fuellt.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  fussblock,
  fussblockErsetzen,
  MARKER_ANFANG,
  MARKER_ENDE,
  stadtDateien,
} from "./werkzeuge/stadtseiten.mjs";
import {
  mussErneuern,
  sitzungErneuern,
  tokenAblaufMs,
} from "./vexfit-sitzung.js";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));

// Baut ein minimales JWT (header.payload.signature) mit gegebenem exp (Sekunden).
function jwt(expSek: number): string {
  const payload = btoa(JSON.stringify({ exp: expSek }));
  return `kopf.${payload}.signatur`;
}

const SITZUNG_SEITEN = [
  "admin.html",
  "index.html",
  "kunden-bereich.html",
  "login.html",
  "profil-bearbeiten.html",
  "profil.html",
  "registrieren.html",
  "suche.html",
  "trainer-bereich.html",
];

// ---------------------------------------------------------------------------
// 7a: Eingeloggt bleiben
// ---------------------------------------------------------------------------
Deno.test("Fix 7a: vexfit-sitzung.js ist auf allen Seiten mit Anmeldung eingebunden", async () => {
  for (const f of SITZUNG_SEITEN) {
    const s = await lies("./" + f);
    assertStringIncludes(
      s,
      '<script type="module" src="vexfit-sitzung.js"></script>',
      `${f}: Einbindung fehlt`,
    );
  }
});

Deno.test("Fix 7a: login.html speichert refresh_token nur mit gesetztem Haken", async () => {
  const s = await lies("./login.html");
  assertStringIncludes(s, "const bleibe = document.getElementById('stayLoggedIn').checked;");
  assertStringIncludes(s, "refresh_token: bleibe ? (data.refresh_token || null) : null,");
});

Deno.test("Fix 7a: tokenAblaufMs liest exp aus dem JWT", () => {
  assertEquals(tokenAblaufMs(jwt(1700)), 1700 * 1000);
  assertEquals(tokenAblaufMs("unsinn"), 0);
});

Deno.test("Fix 7a: mussErneuern erst kurz vor Ablauf und nur mit refresh_token", () => {
  const jetzt = 1_000_000_000_000;
  const fast = { access_token: jwt((jetzt + 30_000) / 1000), refresh_token: "r" };
  const weit = { access_token: jwt((jetzt + 600_000) / 1000), refresh_token: "r" };
  const ohneR = { access_token: jwt((jetzt + 30_000) / 1000) };
  assert(mussErneuern(fast, jetzt), "kurz vor Ablauf -> erneuern");
  assert(!mussErneuern(weit, jetzt), "noch lange gueltig -> nicht erneuern");
  assert(!mussErneuern(ohneR, jetzt), "ohne refresh_token -> nie erneuern");
});

Deno.test("Fix 7a: sitzungErneuern ruft den refresh_token-Endpunkt und liefert neues Token", async () => {
  let gesehen = "";
  const holen = (url: string, _opt: unknown) => {
    gesehen = String(url);
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "NEU", refresh_token: "R2" }), {
        status: 200,
      }),
    );
  };
  const neu = await sitzungErneuern({ access_token: "ALT", refresh_token: "R1" }, holen);
  assertStringIncludes(gesehen, "/auth/v1/token?grant_type=refresh_token");
  assertEquals(neu.access_token, "NEU");
  assertEquals(neu.refresh_token, "R2");
});

Deno.test("Fix 7a: sitzungErneuern wirft bei Fehler (Aufrufer loggt dann aus)", async () => {
  const holen = () => Promise.resolve(new Response("nein", { status: 401 }));
  let geworfen = false;
  try {
    await sitzungErneuern({ access_token: "ALT", refresh_token: "R1" }, holen);
  } catch {
    geworfen = true;
  }
  assert(geworfen, "fehlgeschlagene Erneuerung muss werfen");
  // Der Browser-Teil loggt bei diesem Fehler aus (removeItem + login.html).
  const quelle = await lies("./vexfit-sitzung.js");
  assertStringIncludes(quelle, 'localStorage.removeItem("vexfit_session")');
  assertStringIncludes(quelle, 'location.href = "login.html"');
});

// ---------------------------------------------------------------------------
// 7b: Spam-Schutz (Seiten-Seite + Migration)
// ---------------------------------------------------------------------------
Deno.test("Fix 7b: suche.html hat den Honeypot und schickt ihn mit, 429 ruhig behandelt", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, 'id="notif-webseite"');
  assertStringIncludes(s, "webseite: koeder");
  assertStringIncludes(s, "r.status === 429");
});

Deno.test("Fix 7b: registrieren.html schickt das Zugangs-Token an neuer-trainer/neuer-kunde", async () => {
  const s = await lies("./registrieren.html");
  const treffer = s.match(/\.\.\.\(ad\.access_token\?\{'Authorization':'Bearer '\+ad\.access_token\}:\{\}\)/g) ??
    [];
  assertEquals(treffer.length, 2, "Token-Kopf fehlt an einem der beiden Aufrufe");
});

Deno.test("Fix 7b: Migration (und Ruecknahme) fuer die Spam-Grenze liegen vor", async () => {
  const sql = await lies("./migrations/2026-10-26-06-spam-grenze.sql");
  assertStringIncludes(sql, "CREATE TABLE public.spam_schutz");
  assertStringIncludes(sql, "ENABLE ROW LEVEL SECURITY");
  const rueck = await lies("./migrations/2026-10-26-06-spam-grenze-ruecknahme.sql");
  assertStringIncludes(rueck, "DROP TABLE IF EXISTS public.spam_schutz");
});

// ---------------------------------------------------------------------------
// 7c: Stadt-Links
// ---------------------------------------------------------------------------
Deno.test("Fix 7c: index.html und suche.html tragen die Stadtseiten-Marker in der Fusszeile", async () => {
  for (const f of ["index.html", "suche.html"]) {
    const s = await lies("./" + f);
    assertStringIncludes(s, MARKER_ANFANG, `${f}: Anfang-Marker fehlt`);
    assertStringIncludes(s, MARKER_ENDE, `${f}: Ende-Marker fehlt`);
    // Solange keine Stadtseite existiert, steht zwischen den Markern nichts Sichtbares.
    const zwischen = s.slice(
      s.indexOf(MARKER_ANFANG) + MARKER_ANFANG.length,
      s.indexOf(MARKER_ENDE),
    );
    assert(zwischen.trim() === "", `${f}: zwischen den Markern steht schon etwas`);
  }
});

Deno.test("Fix 7c: Generatorlauf mit 3 Trainern in Muenchen schreibt den Stadt-Link in die Fusszeile", async () => {
  const t = (stadt: string, id: string) => ({
    id, vorname: "A", nachname: "B", stadt, spezialisierungen: [], trainingsart: "Vor Ort",
  });
  const trainer = [t("München", "m1"), t("München", "m2"), t("München", "m3")];
  const staedte = stadtDateien(trainer).map((g: { stadt: string }) => g.stadt);
  assertEquals(staedte, ["München"]);
  const block = fussblock(staedte);
  assertStringIncludes(block, 'href="personal-trainer-muenchen.html"');

  for (const f of ["index.html", "suche.html"]) {
    const quelle = await lies("./" + f);
    const neu = fussblockErsetzen(quelle, block);
    assert(neu !== null, `${f}: Marker nicht gefunden`);
    const zwischen = neu!.slice(
      neu!.indexOf(MARKER_ANFANG) + MARKER_ANFANG.length,
      neu!.indexOf(MARKER_ENDE),
    );
    assertStringIncludes(zwischen, 'href="personal-trainer-muenchen.html"', `${f}`);
  }
});
