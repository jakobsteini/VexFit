// /Users/js/Projekte/Vexfit/app/vexfit/fix2_test.ts
//
// Fix 2 (Komplettpruefung 26.10.2026): Tippflaechen am Handy.
// Fusszeilen-Links, Zurueck-/Login-/Ausloggen-Knoepfe und "Registrieren" bekommen
// unter 640px mindestens 44px Hoehe; die Checkbox "Eingeloggt bleiben" mindestens 22px.
// Geprueft per CSS-Text (kein Rendering im CI).
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));

const seiten: Record<string, string[]> = {
  "index.html": [".footer-links a"],
  "suche.html": [".footer-links a", ".nav-link"],
  "profil.html": [".fl a", ".nav-back"],
  "rechtliches.html": [".fl a", ".nav-back"],
  "login.html": [".nav-link"],
  "registrieren.html": [".nav-back"],
  "passwort-vergessen.html": [".nav-back"],
  "passwort-neu.html": [".nav-back"],
  "profil-bearbeiten.html": [".btn-back"],
  "admin.html": [".logout-btn"],
  "kunden-bereich.html": [".btn-logout"],
  "trainer-bereich.html": [".btn-logout", ".nav-link"],
  "anleitung.html": [".nav-back"],
};

Deno.test("Fix 2: jede Seite hat die 44px-Tippflaechen-Regel unter 640px", async () => {
  for (const [f, sels] of Object.entries(seiten)) {
    const s = await lies("./" + f);
    assertStringIncludes(s, "/* Tippflaechen Handy (Fix 2) */", `${f}: Marker fehlt`);
    assertStringIncludes(s, "@media (max-width:640px)", `${f}: Media-Query fehlt`);
    // Die Regel selbst: alle Selektoren + min-height:44px im selben Block.
    const block = s.match(
      /\/\* Tippflaechen Handy \(Fix 2\) \*\/[\s\S]*?<\/style>/,
    );
    assert(block, `${f}: Fix-2-Style-Block nicht gefunden`);
    for (const sel of sels) {
      assertStringIncludes(block[0], sel, `${f}: Selektor ${sel} fehlt`);
    }
    assertStringIncludes(block[0], "min-height:44px", `${f}: 44px fehlt`);
  }
});

const WIDERRUF_SEITEN = [
  "404.html",
  "anleitung.html",
  "admin.html",
  "kunden-bereich.html",
  "passwort-vergessen.html",
  "login.html",
  "profil-bearbeiten.html",
  "registrieren.html",
  "passwort-neu.html",
  "trainer-bereich.html",
];

Deno.test("Fix 2 (Nachtrag): Cookie-Widerruf-Fusszeilenlinks sind unter 640px 44px hoch", async () => {
  for (const f of WIDERRUF_SEITEN) {
    const s = await lies("./" + f);
    assertStringIncludes(s, "/* Tippflaechen Handy Fusszeile (Fix 2 Nachtrag) */", `${f}`);
    const block = s.match(
      /\/\* Tippflaechen Handy Fusszeile \(Fix 2 Nachtrag\) \*\/[\s\S]*?<\/style>/,
    );
    assert(block, `${f}: Nachtrag-Block fehlt`);
    assertStringIncludes(block[0], "@media (max-width:640px)", `${f}`);
    assertStringIncludes(block[0], ".cookie-widerruf a", `${f}`);
    assertStringIncludes(block[0], "min-height:44px", `${f}`);
  }
});

Deno.test("Fix 2: Checkbox 'Eingeloggt bleiben' ist mindestens 22px, Label klickbar", async () => {
  const s = await lies("./login.html");
  assertStringIncludes(s, 'id="stayLoggedIn" style="width:22px;height:22px;');
  // Die Checkbox steht in einem <label> mit cursor:pointer -> ganzes Label klickbar.
  assert(
    /<label[^>]*cursor:pointer[^>]*>\s*<input type="checkbox" id="stayLoggedIn"/.test(s),
    "Checkbox steht nicht in einem klickbaren Label",
  );
});
