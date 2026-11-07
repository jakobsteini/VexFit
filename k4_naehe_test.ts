// /Users/js/Projekte/Vexfit/app/vexfit/k4_naehe_test.ts
//
// Dauerlauf 07.11.2026 – K4: 0 Treffer ist kein Ende. Strukturell an suche.html:
//   * Umkreissuche berechnet ALLE Entfernungen und zeigt bei 0 im Umkreis die
//     nächstgelegenen Trainer (mit Entfernung) statt einer Sackgasse,
//   * Hinweisband + Vormerk-Knopf nutzen den bestehenden /neuer-kunde-Weg,
//   * der Leerzustand erscheint nur, wenn es gar keinen Standort-Trainer gibt,
//   * bestehender Freigabe-Mail-Mechanismus bleibt (Warteliste) unangetastet.
//
// Aufruf:  deno test --allow-read k4_naehe_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("K4: Umkreissuche zeigt die nächsten statt Sackgasse", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, "const mitEntfernung = [];");
  assertStringIncludes(s, "const imUmkreis = mitEntfernung.filter(t => t._online || t._distance <= radius);");
  assertStringIncludes(s, "Die nächsten (ab ${km} km)");
  // Leerzustand nur noch im echten Null-Fall.
  assertStringIncludes(s, "naeheHinweisAus();\n  showEmpty();");
});

Deno.test("K4: Nähe-Hinweisband mit Vormerkung vorhanden", async () => {
  const s = await lies("./suche.html");
  assertStringIncludes(s, 'id="naeheHinweis"');
  assertStringIncludes(s, "function naeheHinweisAn(");
  assertStringIncludes(s, "function naeheVormerken(");
  // Vormerkung über den bestehenden, Spam-geschützten Weg + Honigtopf.
  assertStringIncludes(s, "vexfit-automation/neuer-kunde");
  assertStringIncludes(s, 'id="naehe-webseite"');
});

Deno.test("K4: Treffer-Beacon nur bei echten Treffern im Umkreis", async () => {
  const s = await lies("./suche.html");
  // Der 'treffer'-Beacon in umkreisSuche steht im imUmkreis-Zweig, nicht im
  // Nächste-Zweig (sonst würde jede Suche fälschlich als Treffer zählen).
  const block = s.slice(s.indexOf("async function umkreisSuche("), s.indexOf("function naeheHinweisAn("));
  const treffer = (block.match(/vexfitTrichter\('treffer'/g) || []).length;
  assert(treffer === 1, "Treffer-Beacon nicht genau einmal (im Umkreis-Zweig): " + treffer);
});

Deno.test("K4: Warteliste-Freigabe-Mechanismus unverändert (keine Doppelmails)", async () => {
  const kern = await lies("./supabase/functions/vexfit-automation/kern.ts");
  // Der bestehende atomare Mechanismus bleibt.
  assertStringIncludes(kern, "alertSchliessen");
  assertStringIncludes(kern, "wartelisteAufFreigabe");
});
