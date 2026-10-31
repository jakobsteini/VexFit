// /Users/js/Projekte/Vexfit/app/vexfit/seo_test.ts
//
// Baustein "SEO + Stadtseiten". Prueft robots, canonical/noindex je Seite,
// dass profil.html fuer nicht Angemeldete keine Kontaktdaten laedt, die JSON-LD
// auf index.html und profil.html, den reaktivierten Stadtseiten-Generator mit
// nachgestellten Daten und die GitHub-Action.
//
// Aufruf:  deno test --allow-read seo_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { parse as parseYaml } from "jsr:@std/yaml@1";
import {
  sitemapXml,
  slug,
  stadtDateien,
} from "./werkzeuge/stadtseiten.mjs";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("robots.txt gibt profil.html frei, sperrt suche.html und admin.html", async () => {
  const r = await lies("./robots.txt");
  assert(!/Disallow:\s*\/profil\.html/.test(r), "profil.html darf nicht gesperrt sein");
  assertStringIncludes(r, "Disallow: /suche.html");
  assertStringIncludes(r, "Disallow: /admin.html");
});

Deno.test("canonical bzw. noindex je Seite wie vorgesehen", async () => {
  const canonical: Record<string, string> = {
    "index.html": "https://vexfit.app/",
    "registrieren.html": "https://vexfit.app/registrieren.html",
    "rechtliches.html": "https://vexfit.app/rechtliches.html",
  };
  const noindex = [
    "login.html", "kunden-bereich.html", "trainer-bereich.html",
    "profil-bearbeiten.html", "passwort-vergessen.html", "passwort-neu.html",
    "admin.html", "suche.html", "404.html",
    "vexfit-ad-neugier.html", "vexfit-ad-schmerz.html",
  ];
  for (const [datei, url] of Object.entries(canonical)) {
    const s = await lies("./" + datei);
    assertStringIncludes(s, `<link rel="canonical" href="${url}">`);
    assert(!s.includes('content="noindex"'), `${datei} darf kein noindex haben`);
  }
  for (const datei of noindex) {
    const s = await lies("./" + datei);
    // Ad-Seiten tragen seit Teil C (vor-ads) "noindex, nofollow", die uebrigen
    // weiterhin "noindex" - beide Formen zaehlen als noindex.
    assert(
      /<meta name="robots" content="noindex(, nofollow)?">/.test(s),
      `${datei} braucht ein robots-noindex`,
    );
  }
  // profil.html: statisches noindex ENTFERNT (wird dynamisch nur bei Nicht-Treffer gesetzt).
  const profil = await lies("./profil.html");
  assert(
    !/<meta name="robots" content="noindex">/.test(profil),
    "profil.html darf kein statisches noindex mehr haben",
  );
});

Deno.test("profil.html laedt fuer Nicht-Angemeldete keine Kontaktdaten", async () => {
  const s = await lies("./profil.html");
  // Anonyme lesen die oeffentliche Sicht; ihr select enthaelt keine Kontaktspalten.
  assertStringIncludes(s, "rest/v1/trainers_oeffentlich?id=eq.");
  const m = s.match(/trainers_oeffentlich\?id=eq\.\$\{id\}&select=([^`]+)`/);
  assert(m, "anon-select nicht gefunden");
  for (const feld of ["email", "telefon", "calendly"]) {
    assert(!m![1].includes(feld), `anon-select darf ${feld} nicht enthalten`);
  }
});

Deno.test("index.html JSON-LD: gueltiges JSON mit Organization und WebSite", async () => {
  const s = await lies("./index.html");
  const bloecke = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert(bloecke.length >= 1, "kein JSON-LD auf index.html");
  const daten = JSON.parse(bloecke[0][1]);
  const liste = Array.isArray(daten) ? daten : [daten];
  const org = liste.find((d) => d["@type"] === "Organization");
  const web = liste.find((d) => d["@type"] === "WebSite");
  assert(org && org.name === "Vexfit" && org.url === "https://vexfit.app", "Organization fehlt/falsch");
  assertEquals(org.logo, "https://vexfit.app/marke/favicon-512.png");
  assert(web && web.url === "https://vexfit.app", "WebSite fehlt/falsch");
});

Deno.test("profil.html JSON-LD Person wird mit den geforderten Feldern gebaut", async () => {
  const s = await lies("./profil.html");
  assertStringIncludes(s, "'@type':'Person'");
  assertStringIncludes(s, "jobTitle:'Personal Trainer'");
  assertStringIncludes(s, "addressLocality");
  assertStringIncludes(s, "addressCountry");
  assertStringIncludes(s, "knowsAbout");
  assertStringIncludes(s, "setCanonical(url)");
});

Deno.test("stadtseiten: 3 Muenchen, 1 Zug, 0 Wien -> nur Muenchen; Umlaute im Dateinamen", () => {
  assertEquals(slug("München"), "muenchen");
  assertEquals(slug("Zürich"), "zuerich");
  assertEquals(slug("Wörgl"), "woergl");
  const t = (stadt: string, id: string) => ({
    id, vorname: "A", nachname: "B", stadt, spezialisierungen: [], trainingsart: "Vor Ort",
  });
  const trainer = [t("München", "m1"), t("München", "m2"), t("München", "m3"), t("Zug", "z1")];
  const seiten = stadtDateien(trainer);
  assertEquals(seiten.length, 1);
  assertEquals(seiten[0].datei, "personal-trainer-muenchen.html");
  // Sitemap: die Stadtseite + genau 4 Profile, jeweils mit lastmod.
  const xml = sitemapXml(trainer, ["personal-trainer-muenchen.html"], "2026-10-26");
  assertStringIncludes(xml, "https://vexfit.app/personal-trainer-muenchen.html");
  for (const id of ["m1", "m2", "m3", "z1"]) {
    assertStringIncludes(xml, `https://vexfit.app/profil.html?id=${id}`);
  }
  assertStringIncludes(xml, "<lastmod>2026-10-26</lastmod>");
  assert(!xml.includes("personal-trainer-zug"), "keine Zug-Seite");
  assert(!xml.includes("personal-trainer-wien"), "keine Wien-Seite");
});

Deno.test("sitemapXml weist index.html als Wurzel / aus", () => {
  const xml = sitemapXml([], ["index.html", "registrieren.html"], "2026-10-26");
  assertStringIncludes(xml, "<loc>https://vexfit.app/</loc>");
  assert(!xml.includes("https://vexfit.app/index.html"), "index.html statt / in der Sitemap");
});

Deno.test("seo.yml: gueltiges YAML mit Zeitplan 0 4 * * *", async () => {
  const roh = await lies("./.github/workflows/seo.yml");
  const daten = parseYaml(roh) as Record<string, unknown>;
  assert(daten && typeof daten === "object", "kein gueltiges YAML");
  assertStringIncludes(roh, "cron: '0 4 * * *'");
  assertStringIncludes(roh, "node werkzeuge/stadtseiten.mjs");
  assertStringIncludes(roh, "SEO: Sitemap und Stadtseiten aktualisiert");
});
