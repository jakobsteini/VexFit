// /Users/js/Projekte/Vexfit/app/vexfit/trainingsort_test.ts
//
// Teil 3: lesbarer Trainingsort im Admin. Die Beschriftungen stimmen mit dem
// Trainer-Formular überein; unbekannte Werte bleiben unverändert (kein Absturz).
//
// Aufruf:  deno test --allow-read trainingsort_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { ORT_TEXT, ortText, TRAININGSORT_TEXT } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("Teil 3: Einzel-Trainingsort wird lesbar (vor_ort → Vor Ort)", () => {
  assertEquals(ortText("vor_ort"), "Vor Ort");
  assertEquals(ortText("online"), "Online");
  assertEquals(ortText("beides"), "Beides");
});

Deno.test("Teil 3: Mehrfach-Trainingsorte wie im Formular", () => {
  assertEquals(ortText("studio", ORT_TEXT), "Studio");
  assertEquals(ortText("outdoor", ORT_TEXT), "Outdoor");
  assertEquals(ortText("beim_kunden", ORT_TEXT), "Beim Kunden zuhause");
});

Deno.test("Teil 3: unbekannter Wert bleibt unverändert, kein Absturz", () => {
  assertEquals(ortText("irgendwas_neues"), "irgendwas_neues");
  assertEquals(ortText("irgendwas_neues", ORT_TEXT), "irgendwas_neues");
  assertEquals(ortText(""), "");
  assertEquals(ortText(null as unknown as string), "");
  assertEquals(ortText(undefined as unknown as string), "");
});

Deno.test("Teil 3: Beschriftungen stimmen mit dem Trainer-Formular überein", async () => {
  // Einzelauswahl: vor_ort/online/beides mit Vor Ort/Online/Beides.
  const edit = await lies("./profil-bearbeiten.html");
  assert(edit.includes('data-val="vor_ort" onclick="waehleOrt(this)">Vor Ort'), "Formular-Label vor_ort geändert?");
  assertEquals(TRAININGSORT_TEXT.vor_ort, "Vor Ort");
  // Mehrfachauswahl: ORTE_OPTIONS (studio/outdoor/beim_kunden).
  assert(edit.includes("{ val: 'beim_kunden', text: 'Beim Kunden zuhause' }"), "ORTE_OPTIONS-Label geändert?");
  assertEquals(ORT_TEXT.beim_kunden, "Beim Kunden zuhause");
});

Deno.test("Teil 3: Admin rendert Trainingsort über ortText, nie als Rohwert", async () => {
  const js = await lies("./vexfit-verwaltung.js");
  // Einzel- und Mehrfachfeld laufen über ortText.
  assert(js.includes("escapeHtml(ortText(t.trainingsort))"), "Einzel-Trainingsort nicht über ortText");
  assert(js.includes("ortText(o, ORT_TEXT)"), "Mehrfach-Trainingsorte nicht über ortText");
  // Kein direkter Roh-Zugriff ORT_TEXT[...] || mehr.
  assert(!js.includes("ORT_TEXT[t.trainingsort]"), "alter Roh-Zugriff auf den Einzelwert noch vorhanden");
});
