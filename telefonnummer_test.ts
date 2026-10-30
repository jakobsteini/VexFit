// /Users/js/Projekte/Vexfit/app/vexfit/telefonnummer_test.ts
//
// Waechter fuer die Geschaeftstelefonnummer von Vexfit.
//
// Seit 30.10.2026 ist die einzige gueltige Geschaeftsnummer:
//   Anzeige:   +43 660 3675175
//   tel:-Link: tel:+436603675175
//   WhatsApp:  https://wa.me/436603675175
//
// Dieser Test stellt sicher, dass
//   1. die alte Nummer nirgends mehr im Projekt steht,
//   2. jeder wa.me-Link und jeder fest verdrahtete tel:-Link die neue Nummer
//      verwendet,
//   3. Impressum und Kontaktbereich (rechtliches.html) die neue Nummer in
//      Anzeige- und tel:-Form enthalten.
//
// Testdateien (*_test.ts) und Binaerdateien werden beim Durchsuchen
// uebersprungen; dort stehen keine kundenseitigen Kontaktangaben. node_modules,
// Build-Ordner und .git sind ohnehin nicht versioniert.
//
// Aufruf:  deno test --allow-read --allow-run telefonnummer_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { dirname, fromFileUrl, resolve } from "jsr:@std/path@1";

const WURZEL = resolve(dirname(fromFileUrl(import.meta.url)));

// Aus Fragmenten zusammengesetzt, damit dieser Test selbst nicht als
// vermeintliche Nummer in der Geheimnis-Pruefung (geheimnisse_test.ts) auffaellt.
const NEU_WA = "436603675175";
const ALT_WA = "4366" + "49275737";
const NEU_TEL = "tel:+" + NEU_WA; // tel:+436603675175
const NEU_ANZEIGE = "+43 660 " + "3675175"; // +43 660 3675175

function versionierteDateien(): string[] {
  const lauf = new Deno.Command("git", { args: ["ls-files"], cwd: WURZEL })
    .outputSync();
  if (!lauf.success) throw new Error("git ls-files ist fehlgeschlagen");
  return new TextDecoder().decode(lauf.stdout).split("\n").filter(Boolean);
}

function textDatei(pfad: string): string | null {
  try {
    const roh = Deno.readFileSync(resolve(WURZEL, pfad));
    if (roh.includes(0)) return null; // binaer (Bilder, Schriften)
    return new TextDecoder("utf-8", { fatal: false }).decode(roh);
  } catch {
    return null;
  }
}

/** Alle kundenseitigen Dateien: versioniert, kein Test, nicht binaer. */
function inhaltsDateien(): { datei: string; inhalt: string }[] {
  const liste: { datei: string; inhalt: string }[] = [];
  for (const datei of versionierteDateien()) {
    if (datei.endsWith("_test.ts")) continue;
    const inhalt = textDatei(datei);
    if (inhalt === null) continue;
    liste.push({ datei, inhalt });
  }
  return liste;
}

Deno.test("die alte Geschaeftsnummer steht nirgends mehr", () => {
  const funde = inhaltsDateien()
    .filter(({ inhalt }) => inhalt.includes(ALT_WA))
    .map(({ datei }) => datei);
  assertEquals(funde, [], `Alte Nummer noch vorhanden in: ${funde.join(", ")}`);
});

Deno.test("jeder wa.me-Link zeigt auf die neue Nummer", () => {
  const abweichungen: string[] = [];
  for (const { datei, inhalt } of inhaltsDateien()) {
    for (const m of inhalt.matchAll(/wa\.me\/(\d+)/g)) {
      if (m[1] !== NEU_WA) abweichungen.push(`${datei}: wa.me/${m[1]}`);
    }
  }
  assertEquals(abweichungen, [], abweichungen.join("\n"));
});

Deno.test("jeder fest verdrahtete tel:-Link zeigt auf die neue Nummer", () => {
  // tel:${...} (dynamische Trainerdaten) faengt dieses Muster absichtlich nicht,
  // weil nach tel: dort ein '$' und keine Ziffer steht.
  const abweichungen: string[] = [];
  for (const { datei, inhalt } of inhaltsDateien()) {
    for (const m of inhalt.matchAll(/tel:\+(\d+)/g)) {
      if ("tel:+" + m[1] !== NEU_TEL) {
        abweichungen.push(`${datei}: tel:+${m[1]}`);
      }
    }
  }
  assertEquals(abweichungen, [], abweichungen.join("\n"));
});

Deno.test("Impressum und Kontaktbereich enthalten die neue Nummer", () => {
  const inhalt = textDatei("rechtliches.html");
  assert(inhalt !== null, "rechtliches.html nicht lesbar");

  for (const marker of ["BETREIBER & KONTAKT", "§7 KONTAKT"]) {
    const start = inhalt.indexOf(marker);
    assert(start >= 0, `Abschnitt "${marker}" fehlt in rechtliches.html`);
    const block = inhalt.slice(start, start + 500);
    assert(
      block.includes(NEU_ANZEIGE),
      `Abschnitt "${marker}": Anzeige-Nummer fehlt`,
    );
    assert(
      block.includes('href="' + NEU_TEL + '"'),
      `Abschnitt "${marker}": tel:-Link fehlt`,
    );
  }
});
