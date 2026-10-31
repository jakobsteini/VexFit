// /Users/js/Projekte/Vexfit/app/vexfit/agb_test.ts
//
// Baustein "AGB §3: Gratisphase, Beginn der Zahlungspflicht und Kuendigung".
//
// Jakobs Entscheidungen: (1) Die Zahlungspflicht beginnt mit der Annahme der
// ersten ueber Vexfit eingegangenen Kundenanfrage (Schaltflaeche "Annehmen" im
// Trainer-Bereich); bis dahin kostenlos. (2) Kuendigung formlos per E-Mail an
// office@vexfit.app, wirksam zum Ende des laufenden Kalendermonats.
//
// Dieser Test liest die AGB-Datei statisch (wie preismodell_test.ts; Playwright
// ist nicht installiert) und prueft, dass §3 die Gratisphase, den Beginn der
// Zahlungspflicht, die Preise und den Kuendigungsweg enthaelt und dass die
// Preise in AGB, index.html und registrieren.html zueinander passen.
//
// Aufruf:  deno test --allow-read agb_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Der §3-Absatz (von der Ueberschrift bis zum naechsten Paragraf).
async function paragraf3(): Promise<string> {
  const html = await lies("./rechtliches.html");
  const start = html.indexOf("§3 TRAINER-ABONNEMENT");
  const ende = html.indexOf("§4", start);
  assert(start >= 0 && ende > start, "§3 nicht gefunden");
  return html.slice(start, ende);
}

Deno.test("§3 nennt die Gratisphase und die Annahme der ersten Anfrage als Beginn", async () => {
  const p = await paragraf3();
  assertStringIncludes(p, "kostenlos");
  assertStringIncludes(p, "keine Kundenanfrage über Vexfit angenommen");
  assertStringIncludes(p, "Annahme der ersten über Vexfit eingegangenen Kundenanfrage");
  assertStringIncludes(p, "beginnt die Zahlungspflicht");
  // Derselbe Begriff wie im Trainer-Bereich (Schaltflaeche "Annehmen").
  assertStringIncludes(p, '„Annehmen"');
});

Deno.test("§3 nennt die Preise 49,99 € und 9,99 €", async () => {
  const p = await paragraf3();
  assertStringIncludes(p, "€49,99");
  assertStringIncludes(p, "€9,99");
});

Deno.test("§3 nennt den Kuendigungsweg per E-Mail an office@vexfit.app zum Monatsende", async () => {
  const p = await paragraf3();
  assertStringIncludes(p, "office@vexfit.app");
  assertStringIncludes(p, "zum Ende des laufenden Kalendermonats");
});

Deno.test("das AGB-Stand-Datum steht auf dem 31. Oktober 2026", async () => {
  const html = await lies("./rechtliches.html");
  assertStringIncludes(html, "Allgemeine Geschäftsbedingungen · Stand: 31. Oktober 2026");
});

Deno.test("die Preise stimmen zwischen AGB, index.html und registrieren.html ueberein", async () => {
  const p = await paragraf3();
  const index = await lies("./index.html");
  const registrieren = await lies("./registrieren.html");
  // 49,99 € und 9,99 € stehen gleichlautend in AGB und index.html.
  for (const preis of ["€49,99", "€9,99"]) {
    assertStringIncludes(p, preis, `AGB ohne ${preis}`);
    assertStringIncludes(index, preis, `index.html ohne ${preis}`);
  }
  // index.html nennt dieselbe Gratis-Regel wie die AGB.
  assertStringIncludes(index, "Kostenlos bis zum ersten Kunden · danach €49,99/Monat");
  // registrieren.html nennt die Gratis-Phase (kein abweichender Preis) — die
  // Trainer-Ansicht wirbt mit "Gratis bis zu deinem 1. Kunden".
  assertStringIncludes(registrieren, "Gratis bis zu deinem 1. Kunden");
  // Kein widerspruechlicher Monatspreis auf der Registrierseite.
  assert(!registrieren.includes("€49,99"), "registrieren.html nennt einen eigenen Monatspreis — bitte pruefen");
});
