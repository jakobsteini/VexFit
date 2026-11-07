// /Users/js/Projekte/Vexfit/app/vexfit/d8_cache_test.ts
//
// Dauerlauf 08.11.2026 – D8: Service-Worker und Cache.
// Begründung „keine Cache-Version zu zählen": die ÖFFENTLICHEN Seiten werden
// von KEINEM Service Worker kontrolliert/gecacht. Der einzige SW
// (sw-verwaltung.js) hat engen Geltungsbereich (nur die Verwaltungs-Hülle),
// cacht KEINE öffentliche Seite und KEINE Daten – D1–D7 ändern nichts, was er
// cacht. Dieser Test sichert die Invariante ab.
//
// Aufruf:  deno test --allow-read d8_cache_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const OEFFENTLICH = [
  "index.html", "suche.html", "profil.html", "personal-trainer-salzburg.html",
  "registrieren.html", "login.html",
];

Deno.test("D8: keine öffentliche Seite registriert einen Service Worker", async () => {
  for (const f of OEFFENTLICH) {
    const s = await lies("./" + f);
    assert(!/serviceWorker\s*\.\s*register/.test(s), `${f} registriert einen Service Worker`);
    assert(!s.includes("sw-verwaltung.js"), `${f} bindet den Verwaltungs-SW ein`);
  }
});

Deno.test("D8: der einzige SW (Verwaltung) cacht nur die Hülle, keine öffentliche Seite/Daten", async () => {
  const sw = await lies("./sw-verwaltung.js");
  // Cacht ausschliesslich die Verwaltungs-Hülle.
  assertStringIncludes(sw, 'c.add("verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html")');
  // Supabase/Fremdquellen werden nie gecacht.
  assertStringIncludes(sw, 'url.hostname.endsWith("supabase.co")');
  // Keine der von D1–D7 geänderten öffentlichen Dateien wird gecacht.
  for (const datei of ["suche.html", "profil.html", "vexfit-abschnitte.js"]) {
    assert(!sw.includes(datei), `Verwaltungs-SW cacht ${datei}`);
  }
});
