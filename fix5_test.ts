// /Users/js/Projekte/Vexfit/app/vexfit/fix5_test.ts
//
// Fix 5 (Komplettpruefung 26.10.2026): Anfrage im Trainerprofil fuer angemeldete
// Kunden. Name aus der eigenen kunden-Zeile vorausgefuellt und nicht aenderbar,
// Ziel vorausgefuellt (aenderbar), E-Mail = Konto-E-Mail (wie bisher).
// Nicht angemeldet: unveraendert "Anmelden, um anzufragen".
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));

Deno.test("Fix 5: profil.html fuellt Name (nur Anzeige) und Ziel fuer Kunden vor", async () => {
  const s = await lies("./profil.html");
  // Vorfuell-Funktion existiert und wird im Angemeldet-Zweig aufgerufen.
  assertStringIncludes(s, "async function vorfuellenAusKunde()");
  const zweig = s.match(/if\(angemeldet\) \{[\s\S]*?\} else \{/);
  assert(zweig, "Angemeldet-Zweig nicht gefunden");
  assertStringIncludes(zweig[0], "vorfuellenAusKunde();", "Aufruf im Angemeldet-Zweig fehlt");
  // Holt die eigene kunden-Zeile ueber die Konto-E-Mail.
  assertStringIncludes(s, "/rest/v1/kunden?email=eq.${encodeURIComponent(sess.email)}");
  // Name wird gesetzt und auf nur-Anzeige gestellt.
  assertStringIncludes(s, "nameEl.value = name; nameEl.readOnly = true;");
  // Ziel wird vorausgefuellt (aenderbar, kein readOnly).
  assertStringIncludes(s, "goalEl.value = String(kundenData.ziel);");
  assert(
    !/goalEl\.readOnly\s*=\s*true/.test(s),
    "Ziel-Feld darf nicht gesperrt werden",
  );
});

Deno.test("Fix 5: nicht Angemeldete sehen weiter den Anmelde-Hinweis", async () => {
  const s = await lies("./profil.html");
  assertStringIncludes(s, "Anmelden, um anzufragen");
  // Angemeldet-Zweig blendet den Hinweis aus, Else-Zweig blendet ihn ein (unveraendert).
  assertStringIncludes(s, "if(anonHinweis) anonHinweis.style.display = 'none';");
  assertStringIncludes(s, "if(anonHinweis) anonHinweis.style.display = 'block';");
});
