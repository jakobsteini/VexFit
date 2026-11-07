// /Users/js/Projekte/Vexfit/app/vexfit/k3_anfrage_test.ts
//
// Dauerlauf 07.11.2026 – K3: Anfrage mit minimaler Reibung. Strukturell an
// profil.html / kunden-bereich.html geprüft:
//   * Anfrageformular direkt im Profil mit Ziel/Zeitraum/Nachricht + Konto in
//     einem Schritt (Vorname/E-Mail/Passwort/AGB),
//   * Auto-Bestätigung: Konto bekommt Sitzung -> Anfrage wird angelegt + Trainer
//     benachrichtigt,
//   * E-Mail-Bestätigung aktiv: KEINE anonyme Zustellung, Anfrage als Entwurf
//     gemerkt (BLOCK dokumentiert),
//   * der Kundenbereich schickt den Entwurf nach dem Login ab,
//   * Honigtopf-Feld gegen Spam, Anfrage-Trichter-Beacon.
//
// Aufruf:  deno test --allow-read k3_anfrage_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("K3: Ein-Schritt-Anfrageformular im Profil (nur nötige Felder)", async () => {
  const s = await lies("./profil.html");
  for (const id of ['id="a-goal"', 'id="a-zeitraum"', 'id="a-message"', 'id="a-vorname"', 'id="a-email"', 'id="a-pw"', 'id="a-agb"']) {
    assertStringIncludes(s, id);
  }
  assertStringIncludes(s, "function sendAnfrageMitKonto(");
  assertStringIncludes(s, "/auth/v1/signup");
  // Nachricht/optional, Ziel Pflicht.
  assertStringIncludes(s, "Bitte dein Ziel angeben");
});

Deno.test("K3: Auto-Bestätigung legt Anfrage an und benachrichtigt den Trainer", async () => {
  const s = await lies("./profil.html");
  const f = s.slice(s.indexOf("function sendAnfrageMitKonto("), s.indexOf("function sendAnfrageMitKonto(") + 6000);
  assertStringIncludes(f, "/rest/v1/anfragen");
  assertStringIncludes(f, "vexfit-automation/neue-anfrage");
  assertStringIncludes(f, "vexfitTrichter('anfrage'");
});

Deno.test("K3: E-Mail-Bestätigung aktiv -> KEINE anonyme Zustellung, Entwurf gemerkt", async () => {
  const s = await lies("./profil.html");
  const f = s.slice(s.indexOf("function sendAnfrageMitKonto("), s.indexOf("function sendAnfrageMitKonto(") + 6000);
  // Ohne Token (keine Sitzung) wird NICHT an die anfragen-Tabelle geschrieben,
  // sondern ein Entwurf gespeichert.
  assertStringIncludes(f, "vexfit_anfrage_entwurf");
  assertStringIncludes(f, "if (!token || !userId)");
  assertStringIncludes(f, "Bitte bestätige deine E-Mail");
});

Deno.test("K3: Kundenbereich schickt den Entwurf nach dem Login ab", async () => {
  const s = await lies("./kunden-bereich.html");
  assertStringIncludes(s, "function entwurfAbschicken(");
  assertStringIncludes(s, "vexfit_anfrage_entwurf");
  assertStringIncludes(s, "removeItem('vexfit_anfrage_entwurf')");
  assertStringIncludes(s, "await entwurfAbschicken();");
});

Deno.test("K3: Honigtopf-Feld gegen Spam im Profil-Anfrageformular", async () => {
  const s = await lies("./profil.html");
  assertStringIncludes(s, 'id="a-webseite"');
  assertStringIncludes(s, "if (koeder) return;");
});
