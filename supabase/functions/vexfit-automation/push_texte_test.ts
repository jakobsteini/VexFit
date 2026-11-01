// Feinschliff Teil 4: Push-Texte. Titel mit Art, Text "<Name> · <Ort>" (Ort nur
// wenn vorhanden), bei Anfrage "<Kunde> → <Trainer>". Name formatiert, KEINE
// E-Mail/Telefon im Push.
//
// Aufruf:  deno test --allow-read push_texte_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  pushNeuerKunde,
  pushNeuerTrainer,
  pushNeueAnfrage,
} from "./kern.ts";

Deno.test("Teil 4: Push Neuer Trainer – Titel mit gelbem Punkt, Name · Ort", () => {
  const p = pushNeuerTrainer(
    { vorname: "jajajaa", nachname: "hebebee", email: "a@b.de", telefon: "+43 660 111" },
    { id: "T1", vorname: "jajajaa", nachname: "hebebee", stadt: "wien", email: "a@b.de", telefon: "+43 660 111" },
  );
  assertEquals(p.titel, "🟡 Neuer Trainer");
  assertEquals(p.text, "Jajajaa Hebebee · Wien");
  assert(!p.text.includes("@"), "keine E-Mail im Push");
  assert(!p.text.includes("+43") && !/\d{3,}/.test(p.text), "keine Telefonnummer im Push");
  assert(p.url.includes("trainer-T1"));
});

Deno.test("Teil 4: Push Neuer Trainer ohne Ort – nur der Name", () => {
  const p = pushNeuerTrainer({ vorname: "Max", nachname: "Muster", email: "a@b.de" }, null);
  assertEquals(p.titel, "🟡 Neuer Trainer");
  assertEquals(p.text, "Max Muster");
  assert(!p.text.includes("·"), "kein führendes Trennzeichen ohne Ort");
});

Deno.test("Teil 4: Push Neuer Kunde – Titel, Name · Ort, keine Kontaktdaten", () => {
  const p = pushNeuerKunde(
    { vorname: "anna-lena", nachname: "müller", email: "k@b.de", telefon: "066012345" },
    { id: "K9", vorname: "anna-lena", nachname: "müller", stadt: "graz" },
  );
  assertEquals(p.titel, "Neuer Kunde");
  assertEquals(p.text, "Anna-Lena Müller · Graz");
  assert(!p.text.includes("@") && !/\d{3,}/.test(p.text));
  assert(p.url.includes("kunde-K9"));
});

Deno.test("Teil 4: Push Neue Anfrage – Kunde → Trainer (beide formatiert)", () => {
  const p = pushNeueAnfrage({ kunden_name: "lisa koch", trainer_name: "tom bauer" }, "A42");
  assertEquals(p.titel, "Neue Anfrage");
  assertEquals(p.text, "Lisa Koch → Tom Bauer");
  assert(p.url.includes("anfrage-A42"));
});

Deno.test("Teil 4: Push Neue Anfrage ohne Namen – Platzhalter", () => {
  const p = pushNeueAnfrage({}, null);
  assertEquals(p.text, "Kunde → Trainer");
  assert(p.url.includes("anfragen"));
});
