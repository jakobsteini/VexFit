// /Users/js/Projekte/Vexfit/app/vexfit/s2_anfrage_test.ts
//
// Dauerlauf 07./08.11.2026 – S2: Anfrage ohne Bestätigungs-Hürde.
// Die Ein-Schritt-Anfrage (Konto + Anfrage) steht aus K3; S2 schärft die
// Bestätigungsseite: ehrlich, ohne erfundene Antwortzeit, mit Hinweis, dass der
// Trainer selbst entscheidet, und mit Weg zum Kundenbereich (Status, S4).
//
// Aufruf:  deno test --allow-read s2_anfrage_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("S2: Bestätigungsseite ist ehrlich (Trainer entscheidet, keine erfundene Antwortzeit)", async () => {
  const s = await lies("./profil.html");
  // Alte, irreführende Zusage ist weg.
  assert(!s.includes("melden uns so schnell wie möglich"), "alte vage Zusage noch da");
  // Neuer, ehrlicher Text + Weg in den Kundenbereich.
  assertStringIncludes(s, "entscheidet selbst, ob und wie er sich bei dir meldet");
  assertStringIncludes(s, 'href="kunden-bereich.html"');
  assertStringIncludes(s, 'id="contactSuccessText"');
});

Deno.test("S2: Auto-Bestätigung (Bestätigung AUS) legt Anfrage mit kunden_email an", async () => {
  const s = await lies("./profil.html");
  const f = s.slice(s.indexOf("function sendAnfrageMitKonto("), s.indexOf("function sendAnfrageMitKonto(") + 6000);
  // Sofortige Zustellung: Sitzung gesetzt, Anfrage inkl. kunden_email (für den
  // Status im Kundenbereich, S4) angelegt, Trainer benachrichtigt.
  assertStringIncludes(f, "kunden_email: email");
  assertStringIncludes(f, "keine feste Antwortzeit");
  assertStringIncludes(f, "vexfit-automation/neue-anfrage");
});

Deno.test("S2: Bestätigung AN bleibt Entwurf (keine anonyme Zustellung)", async () => {
  const s = await lies("./profil.html");
  const f = s.slice(s.indexOf("function sendAnfrageMitKonto("), s.indexOf("function sendAnfrageMitKonto(") + 6000);
  assertStringIncludes(f, "if (!token || !userId)");
  assertStringIncludes(f, "vexfit_anfrage_entwurf");
  assertStringIncludes(f, "Bitte bestätige deine E-Mail");
});
