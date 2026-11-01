// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/mail_workspace_test.ts
//
// Zusatzauftrag Teil M: Mailversand über Google Workspace.
//   * From/Reply-To = office@vexfit.app; Anmeldung über SMTP_BENUTZER/SMTP_PASSWORT.
//   * kein vexfit.info@gmail.com und kein GMAIL_PASSWORT mehr im Function-Code.
//   * ein Versandfehler (z. B. fehlendes Secret) wird NICHT still verschluckt,
//     sondern als klarer Fehler in der Antwort (500) zurückgegeben.
//   * CORS-Preflight für /neuer-trainer mit authorization → 204 mit den Köpfen.
//
// Aufruf:  deno test --allow-read supabase/functions/vexfit-automation/mail_workspace_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { ABSENDER, type Anschluesse, bearbeiten, ERLAUBTE_HERKUNFT } from "./kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Teil M: sichtbarer Absender und Reply-To sind office@vexfit.app", async () => {
  assertEquals(ABSENDER, "office@vexfit.app");
  const index = await lies("./index.ts");
  assertStringIncludes(index, "from: `Vexfit <${ABSENDER}>`");
  assertStringIncludes(index, "replyTo: ABSENDER");
});

Deno.test("Teil M: Anmeldung über SMTP_BENUTZER/SMTP_PASSWORT, kein GMAIL_PASSWORT", async () => {
  const index = await lies("./index.ts");
  assertStringIncludes(index, 'pflicht("SMTP_BENUTZER")');
  assertStringIncludes(index, 'pflicht("SMTP_PASSWORT")');
  assert(!index.includes("GMAIL_PASSWORT"), "index.ts nutzt noch GMAIL_PASSWORT");
});

Deno.test("Teil M: kein vexfit.info@gmail.com mehr im Function-Code (beide Functions)", async () => {
  for (const p of ["./kern.ts", "./index.ts", "../trainer-alert/kern.ts", "../trainer-alert/index.ts"]) {
    const s = await lies(p);
    assert(!s.includes("vexfit.info@gmail.com"), `${p} enthält noch die alte Gmail-Adresse`);
    assert(!s.includes("GMAIL_PASSWORT"), `${p} nutzt noch GMAIL_PASSWORT`);
  }
});

Deno.test("Teil M: Versandfehler (fehlendes Secret) → 500 mit klarem Fehler, nicht still", async () => {
  const gemeldet: string[] = [];
  // deno-lint-ignore no-explicit-any
  const a: any = new Proxy({
    benutzerAusToken: () => Promise.resolve({ id: "u-1", email: "neu@beispiel.at" }),
    mailSenden: () => Promise.reject(new Error("Umgebungsvariable SMTP_PASSWORT fehlt.")),
    melden: (t: string) => gemeldet.push(t),
  }, {
    get: (ziel, p) => (p in ziel ? (ziel as Record<string, unknown>)[p as string] : () => { throw new Error(`${String(p)} nicht erwartet`); }),
  });
  // Angemeldeter Pfad (kein Köderfeld) -> Token nötig; Mail schlägt fehl.
  const r = await bearbeiten(
    new Request("https://x/functions/v1/vexfit-automation/neuer-trainer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ERLAUBTE_HERKUNFT, Authorization: "Bearer tok" },
      body: JSON.stringify({ email: "neu@beispiel.at", vorname: "Neu" }),
    }),
    a as Anschluesse,
  );
  assertEquals(r.status, 500);
  const d = await r.json();
  assertStringIncludes(d.fehler, "SMTP_PASSWORT");
  assert(gemeldet.length > 0, "der Fehler wurde nicht geloggt");
});

Deno.test("Teil M: CORS-Preflight für /neuer-trainer mit authorization → 204", async () => {
  // deno-lint-ignore no-explicit-any
  const a: any = new Proxy({}, { get: (_t, p) => () => { throw new Error(`${String(p)} nicht erwartet`); } });
  const r = await bearbeiten(
    new Request("https://x/functions/v1/vexfit-automation/neuer-trainer", {
      method: "OPTIONS",
      headers: { Origin: ERLAUBTE_HERKUNFT },
    }),
    a as Anschluesse,
  );
  assertEquals(r.status, 204);
  assertStringIncludes((r.headers.get("access-control-allow-headers") || "").toLowerCase(), "authorization");
});
