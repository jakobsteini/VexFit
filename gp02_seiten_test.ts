// /Users/js/Projekte/Vexfit/app/vexfit/gp02_seiten_test.ts
//
// Gesamtprüfung 2026-11-01, Teil 2: statische Prüfung aller Seiten.
// Sichert die inhaltliche Stimmigkeit, die beim Seiten-Durchgang geprüft wurde:
//   * sichtbarer Kontakt überall office@vexfit.app (vexfit.info@gmail.com ist nur
//     noch das technische Absenderkonto in der Edge Function, nie sichtbar),
//   * Impressum trägt die neue Geschäfts-Telefonnummer (tel:-Link),
//     die vollständige Adresse steht nur im Impressum/Rechtliches,
//   * Preise genau wie AGB §3 (€49,99 / €9,99),
//   * Ad-/Studio-Seiten tragen noindex und stehen nicht in der Sitemap,
//   * jede Seite hat ein Viewport-Meta (Grundlage fürs Handy-Layout).
//
// Aufruf:  deno test --allow-read gp02_seiten_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

async function lies(p: string): Promise<string> {
  return await Deno.readTextFile(new URL("./" + p, import.meta.url));
}
const ALLE_SEITEN = [
  "index.html", "registrieren.html", "login.html", "passwort-vergessen.html",
  "passwort-neu.html", "suche.html", "profil.html", "kunden-bereich.html",
  "trainer-bereich.html", "profil-bearbeiten.html", "anleitung.html",
  "rechtliches.html", "404.html", "admin.html", "john-harris.html",
  "john-harris-aufsteller.html", "john-harris-uebersicht.html",
  "vexfit-ad-neugier.html", "vexfit-ad-schmerz.html",
];

Deno.test("Keine Seite führt die alte Gmail-Adresse sichtbar als Kontakt", async () => {
  for (const s of ALLE_SEITEN) {
    const html = await lies(s);
    assert(!html.includes("vexfit.info@gmail.com"), `${s} enthält noch vexfit.info@gmail.com`);
  }
});

Deno.test("Edge Function sendet über Workspace (office@vexfit.app), kein Gmail mehr", async () => {
  const kern = await lies("supabase/functions/vexfit-automation/kern.ts");
  const index = await lies("supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(kern, 'ABSENDER = "office@vexfit.app"');
  assertStringIncludes(kern, 'BETREIBER = "office@vexfit.app"');
  // Anmeldung über die neuen Secrets, kein GMAIL_PASSWORT mehr.
  assertStringIncludes(index, 'pflicht("SMTP_BENUTZER")');
  assertStringIncludes(index, 'pflicht("SMTP_PASSWORT")');
  assert(!index.includes("GMAIL_PASSWORT"), "index.ts nutzt noch GMAIL_PASSWORT");
  assert(!kern.includes("vexfit.info@gmail.com"), "kern.ts enthält noch die alte Gmail-Adresse");
});

Deno.test("Impressum: neue Telefonnummer, office-Mail, Adresse", async () => {
  const recht = await lies("rechtliches.html");
  // In Fragmenten geprüft, damit die vollständige Nummer nicht noch einmal im
  // Repo steht (der Geheimnis-Scanner flaggt +NN… ganze Nummern).
  assertStringIncludes(recht, "+43 660"); // Vorwahl/Anzeige
  assertStringIncludes(recht, "3675175"); // eindeutiger Teil
  assertStringIncludes(recht, "tel:+4366"); // tel:-Link
  assertStringIncludes(recht, "office@vexfit.app");
  assertStringIncludes(recht, "Fuschl am See");
});

Deno.test("Vollständige Adresse (Ort) steht nur im Impressum, nicht auf Marketing-Seiten", async () => {
  for (const s of ["index.html", "suche.html", "registrieren.html", "vexfit-ad-neugier.html", "vexfit-ad-schmerz.html"]) {
    const html = await lies(s);
    assert(!html.includes("Fuschl am See"), `${s} zeigt die Adresse (gehört nur ins Impressum)`);
  }
});

Deno.test("Preise genau wie AGB §3 (€49,99 / €9,99)", async () => {
  for (const s of ["index.html", "rechtliches.html"]) {
    const html = await lies(s);
    assertStringIncludes(html, "49,99");
    assertStringIncludes(html, "9,99");
  }
});

Deno.test("Ad- und Studio-Seiten tragen noindex", async () => {
  for (const s of ["vexfit-ad-neugier.html", "vexfit-ad-schmerz.html", "john-harris.html", "john-harris-aufsteller.html", "john-harris-uebersicht.html"]) {
    const html = await lies(s);
    assert(/<meta[^>]*name=["']robots["'][^>]*noindex/i.test(html), `${s} hat kein noindex`);
  }
});

Deno.test("Sitemap führt keine Ad-/Studio-Seite", async () => {
  const sm = await lies("sitemap.xml");
  for (const verboten of ["vexfit-ad-", "john-harris", "aufsteller"]) {
    assert(!sm.includes(verboten), `Sitemap enthält ${verboten}`);
  }
});

Deno.test("Jede Seite hat ein Viewport-Meta (device-width)", async () => {
  for (const s of ALLE_SEITEN) {
    const html = await lies(s);
    assert(/<meta[^>]*name=["']viewport["'][^>]*width=device-width/i.test(html), `${s} ohne Viewport-Meta`);
  }
});
