// /Users/js/Projekte/Vexfit/app/vexfit/s5_trainer_anfrage_test.ts
//
// Dauerlauf 07./08.11.2026 – S5: Trainer empfängt die erste Anfrage richtig.
// Mail + Trainerbereich: wer/was/wie annehmen, Abo ab Annahme (AGB §3),
// kostenloses Ablehnen. KEINE Preis-/Zahlungslogik geändert.
//
// Aufruf:  deno test --allow-read s5_trainer_anfrage_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { LINK_ERSTE, LINK_WEITERE, mailErsteAnfrage } from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("S5: erste Anfrage-Mail erklärt Annehmen/Abo (§3) und kostenloses Ablehnen", () => {
  const m = mailErsteAnfrage(
    { id: "t1", vorname: "Max", email: "max@beispiel.at" },
    { kunde_ziel: "Abnehmen", kunde_nachricht: "Hallo!" },
  );
  assertStringIncludes(m.text, "angefragt");
  assertStringIncludes(m.text, "Anfrage annehmen");
  assertStringIncludes(m.text, "AGB §3");
  assertStringIncludes(m.text, "kostenlos ab"); // "kostenlos ablehnen"
  assertStringIncludes(m.text, "Ablehnen kostet nichts");
  assertStringIncludes(m.text, "49,99 € pro Monat, monatlich kündbar");
  assertStringIncludes(m.text, LINK_ERSTE); // Preislogik unverändert
});

Deno.test("S5: Preis-/Zahlungslinks unverändert", () => {
  assertStringIncludes(LINK_ERSTE, "buy.stripe.com");
  assertStringIncludes(LINK_WEITERE, "buy.stripe.com");
  assert(String(LINK_ERSTE) !== String(LINK_WEITERE));
});

Deno.test("S5: Trainerbereich erklärt Annehmen (Abo/§3) und kostenloses Ablehnen", async () => {
  const s = await lies("./trainer-bereich.html");
  assertStringIncludes(s, "Annehmen startet dein Abo");
  assertStringIncludes(s, "AGB §3");
  assertStringIncludes(s, "Ablehnen ist kostenlos");
  // Annehmen/Ablehnen-Knöpfe bleiben.
  assertStringIncludes(s, "beantworteAnfrage('${a.id}','angenommen',this)");
  assertStringIncludes(s, "beantworteAnfrage('${a.id}','abgelehnt',this)");
});
