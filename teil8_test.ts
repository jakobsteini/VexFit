// /Users/js/Projekte/Vexfit/app/vexfit/teil8_test.ts
//
// Teil 8 - Missbrauch der Edge Functions. Die 401/403/429-Logik von
// /neue-anfrage ist in kern_test.ts geprueft. Hier: die Seiten schicken das
// Zugangs-Token mit, und die Function hat die noetigen Anschluesse.
//
// Aufruf:  deno test --allow-read teil8_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Seiten senden das Token an /neue-anfrage", async () => {
  for (const seite of ["kunden-bereich.html", "profil.html"]) {
    const html = await lies("./" + seite);
    // Der /neue-anfrage-Aufruf muss einen Authorization: Bearer-Kopf tragen.
    const i = html.indexOf("vexfit-automation/neue-anfrage");
    assert(i >= 0, `${seite} ruft /neue-anfrage nicht auf`);
    const umfeld = html.slice(i, i + 400);
    assertStringIncludes(umfeld, "Authorization");
    assertStringIncludes(umfeld, "Bearer");
  }
});

Deno.test("Function hat Token-Pruefung und Ratenbremse", async () => {
  const idx = await lies("./supabase/functions/vexfit-automation/index.ts");
  assertStringIncludes(idx, "benutzerAusToken");
  assertStringIncludes(idx, "/auth/v1/user");
  assertStringIncludes(idx, "anfragenAnzahlSeit");
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  // 401/403/429 im neue-anfrage-Pfad.
  assertStringIncludes(kern, "Anmeldung erforderlich");
  assertStringIncludes(kern, "E-Mail gehoert nicht zum Konto");
  assertStringIncludes(kern, "Zu viele Anfragen");
});
