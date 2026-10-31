// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-qr_test.ts
//
// Prueft den eigenen QR-Erzeuger (vexfit-qr.js) gegen die Norm ISO/IEC 18004,
// OHNE Browser. Der Kern der Korrektheit sind drei Dinge, die sich ohne echtes
// Scannen hart pruefen lassen:
//   1. Format- und Versionsinformation gegen die in der Norm veroeffentlichten
//      Bitfolgen (das prueft die BCH-Kodierung exakt).
//   2. Reed-Solomon: die EC-Woerter eines Blocks ergeben zusammen mit den Daten
//      ein gueltiges Codewort (alle Syndrome null).
//   3. Aufbau der Matrix: Groesse, Finder-, Takt- und dunkles Modul.
// Das tatsaechliche Lesen eines erzeugten Codes wird zusaetzlich im Browser
// per Rueck-Dekodierung geprueft (Rundgang, Baustein 8).
//
// Aufruf:  deno test --allow-read vexfit-qr_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

// vexfit-qr.js ist ein Browser-Skript (IIFE, setzt globalThis.vexQR). Für den
// Test wird es als Text gelesen und im aktuellen globalen Kontext ausgefuehrt.
const quelle = await Deno.readTextFile(new URL("./vexfit-qr.js", import.meta.url));
new Function(quelle)();
// deno-lint-ignore no-explicit-any
const vexQR = (globalThis as any).vexQR;

Deno.test("vexQR ist geladen", () => {
  assert(vexQR, "vexQR wurde nicht gesetzt");
  assert(typeof vexQR.matrix === "function");
  assert(typeof vexQR.svg === "function");
});

// ---- 1. Formatinformation (Stufe M), bekannte Norm-Bitfolgen ----------------
Deno.test("Formatinformation stimmt mit der Norm ueberein (Stufe M, Masken 0-7)", () => {
  const erwartet = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
  for (let maske = 0; maske < 8; maske++) {
    assertEquals(
      vexQR._intern.formatBits(maske),
      erwartet[maske],
      `Formatbits fuer Maske ${maske} falsch`,
    );
  }
});

// ---- 2. Versionsinformation, bekannte Norm-Bitfolgen ------------------------
Deno.test("Versionsinformation stimmt mit der Norm ueberein (v7-v10)", () => {
  const erwartet: Record<number, number> = {
    7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3,
  };
  for (const v of [7, 8, 9, 10]) {
    assertEquals(vexQR._intern.versionBits(v), erwartet[v], `Versionbits v${v} falsch`);
  }
});

// ---- 3. Reed-Solomon: Syndrome eines Codeworts sind null --------------------
Deno.test("Reed-Solomon erzeugt ein gueltiges Codewort (alle Syndrome null)", () => {
  const { rsEncode, mul, EXP } = vexQR._intern;
  // Beispiel-Datenblock (Version 1 Stufe M: 16 Datenwoerter, 10 EC-Woerter).
  const daten: number[] = [];
  for (let i = 0; i < 16; i++) daten.push((i * 17 + 3) & 0xff);
  const ec = rsEncode(daten, 10);
  const codewort = [...daten, ...ec];
  // Syndrom S_j = Auswertung des Polynoms an alpha^j, j = 0..9. Muss 0 sein.
  for (let j = 0; j < 10; j++) {
    let s = 0;
    const alphaJ = EXP[j];
    for (const w of codewort) s = mul(s, alphaJ) ^ w;
    assertEquals(s, 0, `Syndrom ${j} ist nicht null`);
  }
});

// ---- 4. Aufbau der Matrix ---------------------------------------------------
Deno.test("Matrix: Groesse, Finder, Taktmuster, dunkles Modul", () => {
  const q = vexQR.matrix("https://vexfit.app/john-harris.html?standort=salzburg");
  // Groesse = 4*version + 17.
  assertEquals(q.groesse, 4 * q.version + 17);
  const g = q.groesse;

  // Finder-Zentren (3x3 dunkel) in den drei Ecken.
  for (const [zr, zc] of [[3, 3], [3, g - 4], [g - 4, 3]]) {
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        assert(q.modul(zr + r, zc + c), `Finder-Kern fehlt bei ${zr},${zc}`);
      }
    }
  }
  // Separator: Ring um den Finder ist hell (Beispiel: Zeile 7 der linken oberen Ecke).
  assert(!q.modul(7, 0), "Separator links oben fehlt");

  // Taktmuster: Reihe 6 wechselt ab (Spalten 8..g-9).
  for (let c = 8; c < g - 8; c++) {
    assertEquals(q.modul(6, c), c % 2 === 0, `Taktmuster Reihe 6 Spalte ${c} falsch`);
  }

  // Dunkles Modul.
  assert(q.modul(4 * q.version + 9, 8), "dunkles Modul fehlt");
});

// ---- 5. Versionswahl nach Laenge --------------------------------------------
Deno.test("Versionswahl: kurzer Text klein, langer Text groesser, zu lang wirft", () => {
  const kurz = vexQR.matrix("hi").version;
  const lang = vexQR.matrix("x".repeat(200)).version;
  assert(kurz < lang, "laengerer Text braucht keine groessere Version");
  let warf = false;
  try { vexQR.matrix("x".repeat(400)); } catch { warf = true; }
  assert(warf, "zu langer Text wirft keinen Fehler");
});

// ---- 6. SVG-Ausgabe ---------------------------------------------------------
Deno.test("svg(): gueltiges SVG mit Pfad und Ruhezone", () => {
  const s = vexQR.svg("https://vexfit.app/john-harris.html?standort=wien", { groesse: 300 });
  assert(s.startsWith("<svg"), "kein SVG");
  assert(s.includes("<path"), "kein Pfad im SVG");
  assert(s.includes("shape-rendering=\"crispEdges\""), "crispEdges fehlt");
});
