// /Users/js/Projekte/Vexfit/app/vexfit/s4_kein_kunde_haengt_test.ts
//
// Dauerlauf 07./08.11.2026 – S4: Kein Kunde bleibt hängen.
// Status im Kundenbereich + Ersatz-Mail (bis zu 3 passende Trainer, gleiches
// Land, >=5/8, kein Test/Spam, genau einmal, keine erfundenen Zahlen).
//
// Aufruf:  deno test --allow-read s4_kein_kunde_haengt_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  alternativenFinden,
  mailAlternativen,
  trainerReif,
} from "./supabase/functions/vexfit-automation/kern.ts";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const REIF = {
  avatar_url: "https://x/storage/v1/object/public/avatars/a.png",
  trainingsart: "EMS", trainingsort: "vor_ort", preis_stunde: 50, bio: "langer genug text",
};

Deno.test("S4: Kundenbereich zeigt den Anfrage-Status", async () => {
  const s = await lies("./kunden-bereich.html");
  assertStringIncludes(s, "ladeMeineAnfragen");
  for (const t of ["Angenommen", "Abgelehnt", "Wartet auf Antwort"]) assertStringIncludes(s, t);
});

Deno.test("S4: trainerReif verlangt Foto + genug Felder", () => {
  assert(trainerReif({ id: "a", spezialisierungen: ["x"], ...REIF }));
  assert(!trainerReif({ id: "b", spezialisierungen: ["x"], ...REIF, avatar_url: null }));
});

Deno.test("S4: bis zu drei Alternativen, gleiches Land, reif, kein Test", () => {
  const original = { id: "o", stadt: "Salzburg", land: "AT", spezialisierungen: ["Yoga"] };
  const r = alternativenFinden(original, [
    { id: "1", stadt: "Salzburg", land: "AT", spezialisierungen: ["Yoga"], ...REIF },
    { id: "2", stadt: "Hallein", land: "AT", spezialisierungen: ["Yoga"], ...REIF },
    { id: "3", stadt: "Wien", land: "AT", spezialisierungen: ["Yoga"], ...REIF },
    { id: "4", stadt: "Linz", land: "AT", spezialisierungen: ["Yoga"], ...REIF }, // 4. faellt weg (max 3)
    { id: "ch", stadt: "Zug", land: "CH", spezialisierungen: ["Yoga"], ...REIF }, // anderes Land
    { id: "test", stadt: "Salzburg", land: "AT", spezialisierungen: ["Yoga"], ...REIF, ist_test: true },
  ]);
  assertEquals(r.length, 3);
  assert(!r.map((t) => t.id).includes("ch"));
  assert(!r.map((t) => t.id).includes("test"));
});

Deno.test("S4: Ersatz-Mail passt den Wortlaut der Anzahl an, ohne erfundene Zahlen", () => {
  const drei = [1, 2, 3].map((i) => ({ id: "t" + i, vorname: "V" + i, nachname: "N", stadt: "Salzburg", ...REIF }));
  const m = mailAlternativen("kundin@beispiel.at", "Anna", drei);
  assertStringIncludes(m.text + m.html, "3 passende Trainer");
  // Alle drei Profil-Links kommen vor.
  for (const i of [1, 2, 3]) assertStringIncludes(m.text + m.html, "profil.html?id=t" + i);
  const einer = mailAlternativen("k@b.at", null, [drei[0]]);
  assertStringIncludes(einer.text + einer.html, "Ein passender Trainer");
  // Keine erfundene Antwortzeit.
  assert(!/\b\d+\s*(Stunden|Std|Minuten|Tagen)\b/.test(m.text), "erfundene Antwortzeit in der Mail");
});
