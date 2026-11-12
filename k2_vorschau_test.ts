// /Users/js/Projekte/Vexfit/app/vexfit/k2_vorschau_test.ts
//
// Dauerlauf 07.11.2026 – K2: Öffentliche Vorschau (Schalter, Standard AUS).
// Geprüft:
//   * Schalter standardmäßig aus (Verhalten wie heute),
//   * vorschauAktiv nur bei Schalter AN und nicht angemeldet,
//   * vorschauReif filtert schwache Profile aus (Näherung ≥5/8, Foto Pflicht),
//   * vorschauName gibt „Vorname N." (kein voller Nachname),
//   * suche.html nutzt die Vorschau nur als zusätzlichen, geschalteten Weg.
//
// Aufruf:  deno test --allow-read k2_vorschau_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Die Module lesen/schreiben window.* – im Test globalThis.
const g = globalThis as Record<string, unknown>;

Deno.test("K2/12.11.: Schalter ist AUS (Jakob 12.11.: anon sieht keine Trainerdaten)", async () => {
  delete g.VEXFIT_CONFIG;
  await import("./vexfit-config.js");
  const cfg = g.VEXFIT_CONFIG as { OEFFENTLICHE_VORSCHAU: boolean };
  assertEquals(cfg.OEFFENTLICHE_VORSCHAU, false);
});

Deno.test("K2: vorschauAktiv nur bei Schalter AN und nicht angemeldet", async () => {
  await import("./vexfit-config.js");
  await import("./vexfit-vorschau.js");
  const v = g.vexVorschau as {
    vorschauAktiv: (a: boolean) => boolean;
    vorschauReif: (t: unknown) => boolean;
    vorschauName: (a: string, b: string) => string;
  };
  const cfg = g.VEXFIT_CONFIG as { OEFFENTLICHE_VORSCHAU: boolean };
  cfg.OEFFENTLICHE_VORSCHAU = false;
  assertEquals(v.vorschauAktiv(false), false); // aus
  cfg.OEFFENTLICHE_VORSCHAU = true;
  assertEquals(v.vorschauAktiv(false), true); // an + nicht angemeldet
  assertEquals(v.vorschauAktiv(true), false); // angemeldet: normale Sicht
  cfg.OEFFENTLICHE_VORSCHAU = false; // echter Standard seit 12.11.: AUS
});

Deno.test("K2: vorschauReif verlangt Foto und genug Felder, vorschauName kürzt den Nachnamen", async () => {
  await import("./vexfit-vorschau.js");
  const v = g.vexVorschau as {
    vorschauReif: (t: unknown) => boolean;
    vorschauName: (a: string, b: string) => string;
  };
  const stark = {
    avatar_url: "https://x/storage/v1/object/public/avatars/a.png",
    trainingsart: "EMS", trainingsort: "online", preis_stunde: 50,
    bio: "langer genug text", spezialisierungen: ["Kraft"],
  };
  const ohneFoto = { ...stark, avatar_url: null };
  const duenn = { avatar_url: "https://x/storage/v1/object/public/avatars/a.png", trainingsart: "", trainingsort: "", preis_stunde: 0, bio: "", spezialisierungen: [] };
  assert(v.vorschauReif(stark), "starkes Profil sollte reif sein");
  assert(!v.vorschauReif(ohneFoto), "ohne Foto nicht reif");
  assert(!v.vorschauReif(duenn), "dünnes Profil nicht reif");
  assertEquals(v.vorschauName("Max", "Mustermann"), "Max M.");
  assertEquals(v.vorschauName("Anna", ""), "Anna");
});

Deno.test("K2: suche.html bindet Schalter+Vorschau ein und nutzt sie nur geschaltet", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "vexfit-config.js");
  assertStringIncludes(s, "vexfit-vorschau.js");
  assertStringIncludes(s, "vexVorschau.vorschauAktiv(angemeldet)");
  assertStringIncludes(s, "function vorschauFilter(");
  assertStringIncludes(s, "trainers = vorschauFilter(trainers);");
});
