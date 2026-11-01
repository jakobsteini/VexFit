// /Users/js/Projekte/Vexfit/app/vexfit/teil_m_test.ts
//
// Teil M — neu gestaltete Benachrichtigungs-Mails an Jakob mit Deep-Link in die
// Verwaltung. Prüft ohne Netz:
//   - Betreffzeilen (M3), HTML + Text vorhanden (M1/M4).
//   - Knopf-Link enthält #trainer-/#kunde-/#anfrage-<id> (M2); keine Aktion aus
//     der Mail (kein Formular, nur der Weg in die Verwaltung).
//   - Profil-Vollständigkeit x/8 (M1).
//   - Verwaltung springt bei Hash zum Datensatz (springeZuHash).
//   - registrieren.html schickt utm_source; kunden-bereich.html die anfrage_id.
//
// Aufruf:  deno test --allow-read teil_m_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  mailNeueAnfrageIntern,
  mailNeuerKunde,
  mailNeuerTrainer,
  profilVollstaendigkeitAcht,
  VERWALTUNG_URL,
  verwaltungLink,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

const trainerProfil = {
  id: "t-9",
  vorname: "Mara",
  nachname: "Blume",
  email: "mara@example.com",
  stadt: "Salzburg",
  plz: "5020",
  telefon: "+43 660 1234567",
  trainingsart: "Personal Training",
  trainingsort: "beides",
  preis_stunde: 60,
  bio: "Zehn Zeichen mindestens hier.",
  erfahrung: "3-5 Jahre",
  spezialisierungen: ["Muskelaufbau"],
  avatar_url: "https://x.supabase.co/storage/v1/object/public/avatars/t-9/avatar.jpg",
};

Deno.test("M3: Betreff Neuer Trainer mit gelbem Punkt und Ort", () => {
  const m = mailNeuerTrainer({ vorname: "Mara", nachname: "Blume", email: "mara@example.com" }, trainerProfil);
  assertEquals(m.betreff, "🟡 Neuer Trainer: Mara Blume (Salzburg)");
});

Deno.test("M1/M2: Neuer-Trainer-Mail hat HTML+Text, Deep-Link #trainer-<id>, x/8, keine Aktion", () => {
  const m = mailNeuerTrainer(
    { vorname: "Mara", nachname: "Blume", email: "mara@example.com", utm_source: "Meta", utm_campaign: "trainer_at_1_beruf", zeitpunkt: "01.11.2026, 10:00" },
    trainerProfil,
  );
  assert(m.html.length > 0 && m.text.length > 0, "HTML oder Text fehlt");
  // Deep-Link in HTML und Text.
  assertStringIncludes(m.html, VERWALTUNG_URL + "#trainer-t-9");
  assertStringIncludes(m.text, VERWALTUNG_URL + "#trainer-t-9");
  // Inhalt: x/8, Herkunft, Ort/PLZ, Telefon.
  assertStringIncludes(m.text, "Profil-Vollständigkeit: 8/8");
  assertStringIncludes(m.text, "Herkunft: Meta – trainer_at_1_beruf");
  assertStringIncludes(m.text, "Ort / PLZ: Salzburg · 5020");
  assertStringIncludes(m.text, "Telefon: +43 660 1234567");
  // Keine Aktion aus der Mail: kein Formular, nur der Weg in die Verwaltung.
  assert(!/<form/i.test(m.html), "Mail enthält ein Formular");
  // Hosted PNG (keine Data-URI).
  assertStringIncludes(m.html, "https://vexfit.app/marke/");
  assert(!m.html.includes("data:image"), "Data-URI im Bild (verboten)");
});

Deno.test("M2: ohne Profil (kein Deep-Link) trotzdem gültiger Verwaltungs-Link", () => {
  const m = mailNeuerTrainer({ vorname: "X", nachname: "Y", email: "x@y.de" });
  assertStringIncludes(m.html, VERWALTUNG_URL);
  assert(!m.html.includes("#trainer-"), "Deep-Link ohne Profil erzeugt");
  // Ohne Profil keine x/8-Zeile (keine erfundene Zahl).
  assert(!m.text.includes("Profil-Vollständigkeit"), "x/8 ohne Profil gezeigt");
});

Deno.test("M3: Neuer Kunde – Betreff + Deep-Link #kunde-<id>", () => {
  const m = mailNeuerKunde(
    { vorname: "Tom", nachname: "Toll", email: "tom@toll.at" },
    { id: "k-3", stadt: "Wien", plz: "1010", ziel: "Abnehmen" },
  );
  assertEquals(m.betreff, "Neuer Kunde: Tom Toll (Wien)");
  assertStringIncludes(m.html, VERWALTUNG_URL + "#kunde-k-3");
  assertStringIncludes(m.text, "Ziel: Abnehmen");
});

Deno.test("M3: Neue Anfrage – Betreff Kunde → Trainer, Deep-Link #anfrage-<id>", () => {
  const m = mailNeueAnfrageIntern(
    { kunden_name: "Lea Kurz", trainer_name: "Mara Blume", ziel: "Kraft", nachricht: "Hallo!" },
    "a-5",
  );
  assertEquals(m.betreff, "Neue Anfrage: Lea Kurz → Mara Blume");
  assertStringIncludes(m.html, VERWALTUNG_URL + "#anfrage-a-5");
  assertStringIncludes(m.text, "Ziel: Kraft");
});

Deno.test("M2: Neue Anfrage ohne Kennung → #anfragen (Reiter)", () => {
  const m = mailNeueAnfrageIntern({ kunden_name: "Lea", trainer_name: "Mara" }, null);
  assertStringIncludes(m.html, VERWALTUNG_URL + "#anfragen");
});

Deno.test("M1: Profil-Vollständigkeit zählt die acht Felder", () => {
  assertEquals(profilVollstaendigkeitAcht(trainerProfil), { erfuellt: 8, gesamt: 8 });
  assertEquals(profilVollstaendigkeitAcht({}), { erfuellt: 0, gesamt: 8 });
});

Deno.test("verwaltungLink baut Anker bzw. nackte Adresse", () => {
  assertEquals(verwaltungLink("trainer-abc"), VERWALTUNG_URL + "#trainer-abc");
  assertEquals(verwaltungLink(""), VERWALTUNG_URL);
  assertEquals(verwaltungLink(), VERWALTUNG_URL);
});

Deno.test("M2: Verwaltung springt bei Hash zum Datensatz (springeZuHash)", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  assertStringIncludes(js, "function springeZuHash(");
  assert(js.includes('"trainer"') && js.includes('trainerDetail(id)'), "kein Sprung zu Trainer-Detail");
  assert(js.includes('kundeDetail(id)'), "kein Sprung zu Kunde-Detail");
  assert(js.includes('zeigeTab("anfragen")'), "kein Sprung zum Anfragen-Reiter");
});

Deno.test("M: registrieren.html schickt utm_source, kunden-bereich.html die anfrage_id", async () => {
  const reg = await lies("./registrieren.html");
  assertStringIncludes(reg, "utm_source: utmSrc");
  const kb = await lies("./kunden-bereich.html");
  assertStringIncludes(kb, "anfrage_id: anfrageId");
  assertStringIncludes(kb, "return=representation");
});
