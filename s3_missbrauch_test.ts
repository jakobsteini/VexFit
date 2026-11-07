// /Users/js/Projekte/Vexfit/app/vexfit/s3_missbrauch_test.ts
//
// Dauerlauf 07./08.11.2026 – S3: Missbrauch absichern. Reine Logik +
// Struktur-/Datei-Pruefung (ohne Netz). Die Verhaltensnachweise für
// /neue-anfrage stehen in supabase/functions/vexfit-automation/kern_test.ts.
//
// Aufruf:  deno test --allow-read s3_missbrauch_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  anfrageVerdacht,
  emailDomain,
  istWegwerfDomain,
  nachrichtUnsinnig,
  nameUnsinnig,
} from "./supabase/functions/vexfit-automation/kern.ts";
import { WEGWERF_DOMAINS } from "./supabase/functions/vexfit-automation/wegwerf-domains.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const DOMAINS = new Set(WEGWERF_DOMAINS.map((d) => d.toLowerCase()));

Deno.test("S3: emailDomain und Wegwerf-Erkennung", () => {
  assertEquals(emailDomain("a@Mailinator.com"), "mailinator.com");
  assertEquals(emailDomain("kaputt"), "");
  assert(istWegwerfDomain("bot@mailinator.com", DOMAINS));
  assert(!istWegwerfDomain("anna@gmail.com", DOMAINS));
  assert(DOMAINS.has("mailinator.com") && DOMAINS.size > 10);
});

Deno.test("S3: unsinnige Namen und Nachrichten erkennen (markieren, nicht blockieren)", () => {
  assert(nameUnsinnig("x"));            // zu kurz
  assert(nameUnsinnig("))))"));         // keine Buchstaben
  assert(nameUnsinnig("aaaaaa"));       // ein Zeichen wiederholt
  assert(nameUnsinnig("Besuch www.spam.ru")); // URL im Namen
  assert(!nameUnsinnig("Anna"));
  assert(!nameUnsinnig("Max Mustermann"));
  assert(nachrichtUnsinnig("........"));
  assert(nachrichtUnsinnig("88888888888"));
  assert(!nachrichtUnsinnig(""));       // leer ist erlaubt (optional)
  assert(!nachrichtUnsinnig("Hallo, ich moechte abnehmen."));
});

Deno.test("S3: anfrageVerdacht fasst die Gründe zusammen", () => {
  assertEquals(anfrageVerdacht({ email: "bot@mailinator.com", name: "Anna", domains: DOMAINS }).grund, "wegwerf-mail");
  assertEquals(anfrageVerdacht({ email: "anna@gmail.com", name: "))))", domains: DOMAINS }).grund, "name-unsinnig");
  assertEquals(anfrageVerdacht({ email: "anna@gmail.com", name: "Anna", nachricht: "::::::::", domains: DOMAINS }).grund, "nachricht-unsinnig");
  assertEquals(anfrageVerdacht({ email: "anna@gmail.com", name: "Anna", nachricht: "Hallo", domains: DOMAINS }).verdaechtig, false);
});

Deno.test("S3: Honigtopf in registrieren.html (Trainer + Kunde)", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, 'id="t-webseite"');
  assertStringIncludes(s, 'id="c-webseite"');
  assertStringIncludes(s, "document.getElementById('t-webseite')");
  assertStringIncludes(s, "document.getElementById('c-webseite')");
});

Deno.test("S3: Migration anfrage-pruefung (pruef_status) + Rücknahme", async () => {
  const m = await lies("./migrations/2026-11-08-02-anfrage-pruefung.sql");
  assertStringIncludes(m, "ADD COLUMN IF NOT EXISTS pruef_status text DEFAULT 'ok'");
  assertStringIncludes(m, "IN ('ok','zur_pruefung','verworfen')");
  const r = await lies("./migrations/ruecknahmen/2026-11-08-02-anfrage-pruefung-ruecknahme.sql");
  assertStringIncludes(r, "DROP COLUMN IF EXISTS pruef_status");
});

Deno.test("S3: Admin-Aktionen + Liste Zur Prüfung vorhanden", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  assertStringIncludes(kern, 'case "anfrage_freigeben"');
  assertStringIncludes(kern, 'case "anfrage_verwerfen"');
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function ladeAnfragenPruefung");
  assertStringIncludes(js, 'aktion: "anfrage_freigeben"');
  assertStringIncludes(js, 'aktion: "anfrage_verwerfen"');
  const html = await lies("./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html");
  assertStringIncludes(html, 'id="pruef-tbody"');
});
