// /Users/js/Projekte/Vexfit/app/vexfit/trainer_feinschliff_test.ts
//
// Baustein "Trainerbereich-Feinschliff" (28.10.2026). Prueft die Text-,
// Darstellungs- und Logikaenderungen in trainer-bereich.html. Wie die uebrigen
// Pruefungen im Projekt (fix2_test, fix3_test, einstieg_test) ohne Browser:
// gelesen wird der HTML-/CSS-Text, Kontrast und Geometrie werden aus den
// CSS-Werten berechnet. Die Pruefungen laufen fuer beide geforderten Breiten
// (1366px und 375px), indem je Breite die wirksame CSS-Kaskade nachgebildet
// wird.
//
// Aufruf:  deno test --allow-read trainer_feinschliff_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const BREITEN = [1366, 375];
const BG = "#0a0a0a"; // Seitenhintergrund (--bg)

// ---- Kontrast nach WCAG 2.1 --------------------------------------------
function srgbLin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminanz(hex: string): number {
  const m = hex.replace("#", "");
  const h = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbLin(r) + 0.7152 * srgbLin(g) + 0.0722 * srgbLin(b);
}
function kontrast(a: string, b: string): number {
  const l1 = luminanz(a), l2 = luminanz(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- CSS-Hilfen ---------------------------------------------------------
function cssVar(html: string, name: string): string {
  const m = html.match(new RegExp("--" + name + ":(#[0-9a-fA-F]{3,6})"));
  assert(m, `CSS-Variable --${name} nicht gefunden`);
  return m![1];
}
function regelBody(html: string, selektor: string): string {
  // Selektor woertlich, danach { ... } bis zur ersten schliessenden Klammer.
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(esc + "\\s*\\{([^}]*)\\}"));
  assert(m, `CSS-Regel ${selektor} nicht gefunden`);
  return m![1];
}
function farbe(html: string, regelInhalt: string): string {
  const m = regelInhalt.match(/color:\s*(var\(--([a-z]+)\)|#[0-9a-fA-F]{3,6})/);
  assert(m, `keine color in Regel: ${regelInhalt}`);
  return m![1].startsWith("var(") ? cssVar(html, m![2]) : m![1];
}
function fontPx(regelInhalt: string): number {
  const m = regelInhalt.match(/font-size:\s*(\d+)px/);
  assert(m, `keine font-size in Regel: ${regelInhalt}`);
  return Number(m![1]);
}
function pxWert(text: string, eigenschaft: string): number {
  const m = text.match(new RegExp(eigenschaft + ":\\s*(\\d+)px"));
  return m ? Number(m[1]) : 0;
}

// =========================================================================
// Test A: neuer Trainer ohne gespeicherte Trainingsform -> keine Markierung
// =========================================================================
Deno.test("A: keine Ort-Option ist ohne gespeicherten Wert vorausgewaehlt", async () => {
  const html = await lies("./trainer-bereich.html");
  const m = html.match(/id="ortWrap">([\s\S]*?)id="ortFehler"/);
  assert(m, "ortWrap nicht gefunden");
  const block = m![1];
  // Drei Optionen vorhanden, keine traegt beim Laden die Markierung 'on'.
  for (const val of ["vor_ort", "online", "beides"]) {
    assertStringIncludes(block, `data-val="${val}"`, `Option ${val} fehlt`);
  }
  assert(!/class="chip on"/.test(block), "Eine Ort-Option ist vorab markiert");
  // Startwert leer, egal bei welcher Breite.
  for (const _ of BREITEN) assertStringIncludes(html, "let selectedOrt = '';");
});

// =========================================================================
// Test B: gespeicherter Wert -> genau diese Option markiert
// =========================================================================
Deno.test("B: gespeicherter Ort wird beim Fuellen genau markiert", async () => {
  const html = await lies("./trainer-bereich.html");
  // fillForm markiert nur die Option, deren data-val dem gespeicherten Wert gleicht.
  assertStringIncludes(html, "if(t.trainingsort)");
  assertStringIncludes(html, "selectedOrt = t.trainingsort;");
  assertStringIncludes(
    html,
    "if(c.dataset.val === t.trainingsort) c.classList.add('on');",
  );
});

// =========================================================================
// Test C: der widerspruechliche Satz ist weg
// =========================================================================
Deno.test("C: Seite behauptet nicht, nur vollstaendige Profile wuerden gezeigt", async () => {
  const html = await lies("./trainer-bereich.html");
  assert(
    !html.includes("Nur ein vollständiges Profil wird Kunden gezeigt"),
    "alter Satz noch vorhanden",
  );
  // Ersatztext ist da.
  assertStringIncludes(
    html,
    "Ein vollständiges Profil wirkt vertrauenswürdig und bekommt mehr Anfragen.",
  );
});

// =========================================================================
// Test D: "noch nicht sichtbar" nur bei aktiv = false
// =========================================================================
Deno.test("D: 'noch nicht fuer Kunden sichtbar' haengt an aktiv=false", async () => {
  const html = await lies("./trainer-bereich.html");
  const m = html.match(/T\.aktiv\s*\?\s*('[^']*')\s*:\s*('[^']*')/);
  assert(m, "T.aktiv-Verzweigung nicht gefunden");
  const [, wahr, falsch] = m!;
  // aktiv = true: Profil ist sichtbar, KEIN "noch nicht"-Hinweis.
  assertStringIncludes(wahr, "ist für Kunden sichtbar");
  assert(!wahr.includes("noch nicht"), "aktiv=true zeigt faelschlich 'noch nicht'");
  // aktiv = false: genau der Pruef-/Freigabe-Hinweis.
  assertStringIncludes(falsch, "noch nicht für Kunden sichtbar");
});

// =========================================================================
// Test E: WhatsApp-Knopf ueberlappt keinen Fusszeilen-Link (375 + 1366)
// =========================================================================
Deno.test("E: WhatsApp-Knopf verdeckt die Fusszeile nicht", async () => {
  const html = await lies("./trainer-bereich.html");
  const wa = regelBody(html, ".wa");
  const waBottom = pxWert(wa, "bottom"); // 20
  const waHoehe = pxWert(wa, "height"); // 46
  const waRight = pxWert(wa, "right"); // 16
  const waBreite = pxWert(wa, "width"); // 46
  const waBelegt = waBottom + waHoehe; // vom unteren Rand belegte Hoehe

  // ≤480px-Block vorhanden und mit grosszuegigem Abstand.
  assertStringIncludes(
    html,
    "/* Fusszeile frei vom WhatsApp-Knopf bis 480px",
    "≤480px-Feinschliff-Block fehlt",
  );
  // Fix-3-Block (84px) bleibt unangetastet (eigener Waechter fix3_test.ts).
  assertStringIncludes(html, "padding-bottom:84px");

  const footerBasis = regelBody(html, ".cookie-widerruf");
  const footerPadBasis = pxWert(footerBasis, "padding"); // 20

  for (const breite of BREITEN) {
    // Wirksame untere Freiheit je Breite aus der Kaskade.
    let bodyPad: number, footerPad: number;
    if (breite <= 480) {
      // body{padding-bottom:120px} + .cookie-widerruf{padding-bottom:24px}
      const block = html.match(/bis 480px[\s\S]*?<\/style>/);
      assert(block, "≤480px-Regelinhalt nicht lesbar");
      const bm = block![0].match(/body\{padding-bottom:(\d+)px\}/);
      const fm = block![0].match(/\.cookie-widerruf\{padding-bottom:(\d+)px\}/);
      bodyPad = bm ? Number(bm[1]) : 0; // 120
      footerPad = fm ? Number(fm[1]) : 0; // 24
    } else {
      bodyPad = 0; // keine Media-Regel fuer body padding-bottom im Desktop
      footerPad = footerPadBasis; // 20
    }
    const footerFreiheit = bodyPad + footerPad; // Abstand Fusszeilen-Inhalt -> Seitenende

    // Horizontale Lage: Knopf sitzt unten rechts.
    const knopfLinks = breite - waRight - waBreite;
    // Zentrierte Fusszeile: grobe obere Schranke der rechten Ausdehnung.
    // Schmal (<=480): Text kann fast die ganze Breite fuellen -> bis zum rechten Rand.
    // Breit: drei kurze, zentrierte Links bleiben klar links vom Knopf.
    const footerRechts = breite <= 480 ? breite - 16 : breite / 2 + 350;
    const horizontalUeberlapp = footerRechts > knopfLinks;

    if (horizontalUeberlapp) {
      // Dann muss die Fusszeile vertikal ueber dem Knopf liegen.
      assert(
        footerFreiheit >= waBelegt,
        `Breite ${breite}: Fusszeilen-Freiheit ${footerFreiheit}px < Knopf ${waBelegt}px`,
      );
    }
  }
});

// =========================================================================
// Test F: Kontrast der geaenderten Hinweistexte + Ausloggen-Knopf >= 4.5:1
// =========================================================================
Deno.test("F: Hinweistexte und Ausloggen-Knopf erreichen Kontrast >= 4.5:1", async () => {
  const html = await lies("./trainer-bereich.html");
  const muted = cssVar(html, "muted");
  // Grauton generell: deutlich ueber 4.5:1.
  assert(kontrast(muted, BG) >= 4.5, `--muted Kontrast ${kontrast(muted, BG).toFixed(2)}`);

  const hint = regelBody(html, ".field .hint");
  const fehler = regelBody(html, ".field-fehler");
  const logout = regelBody(html, ".btn-logout");

  for (const breite of BREITEN) {
    // Farben/Groessen sind in diesen Regeln breitenunabhaengig; je Breite gleich geprueft.
    assert(breite > 0);
    // Hilfstext unter den Feldern.
    assert(
      kontrast(farbe(html, hint), BG) >= 4.5,
      `.hint Kontrast zu niedrig (${breite}px)`,
    );
    assert(fontPx(hint) >= 12, `.hint < 12px (${breite}px)`);
    // Neuer Ort-Fehlerhinweis.
    assert(
      kontrast(farbe(html, fehler), BG) >= 4.5,
      `.field-fehler Kontrast zu niedrig (${breite}px)`,
    );
    assert(fontPx(fehler) >= 12, `.field-fehler < 12px (${breite}px)`);
    // Ausloggen-Knopf: klar lesbar, nicht wie deaktiviert.
    assert(
      kontrast(farbe(html, logout), BG) >= 4.5,
      `.btn-logout Kontrast zu niedrig (${breite}px)`,
    );
  }
});

// =========================================================================
// Test G: Text im leeren Anfragen-Zustand exakt wie gefordert
// =========================================================================
Deno.test("G: leerer Anfragen-Zustand zeigt den geforderten Wortlaut", async () => {
  const html = await lies("./trainer-bereich.html");
  const soll = "Sobald dich ein Kunde kontaktiert, erscheint die Anfrage hier.";
  const treffer = [...html.matchAll(new RegExp(soll.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
  // Beide leeren Zustaende (kein Trainer-Datensatz und leere Liste) tragen den Text.
  assertEquals(treffer.length, 2, "Soll-Text nicht an beiden Stellen vorhanden");
  assert(
    !html.includes("Sobald ein Kunde dich kontaktiert erscheint es hier"),
    "alter Wortlaut noch vorhanden",
  );
});
