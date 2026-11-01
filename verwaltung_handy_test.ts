// /Users/js/Projekte/Vexfit/app/vexfit/verwaltung_handy_test.ts
//
// Feinschliff Teil 1/2: Verwaltung am Handy (390 px) und breit (1440 px). Prüft
// ohne Browser gegen die echten Dateien (HTML/CSS + JS-Quelle) und die reinen
// Funktionen. Ergänzt verwaltung_logik_test.ts / teil_a_test.ts.
//
// Aufruf:  deno test --allow-read verwaltung_handy_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { nameFormatieren } from "./vexfit-verwaltung.js";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const SEITE = "./verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html";
const JS = "./vexfit-verwaltung.js";

// ── 1a: Auto-Aktualisieren ───────────────────────────────────────────────────
Deno.test("1a: alle 30 s im Hintergrund, bei Rückkehr und beim Push-Antippen", async () => {
  const js = await lies(JS);
  assert(/setInterval\([^,]*,\s*30 \* 1000\)/.test(js), "kein 30-Sekunden-Takt");
  assert(js.includes('addEventListener("visibilitychange"'), "kein visibilitychange (Rückkehr in die App)");
  assert(js.includes('addEventListener("hashchange"'), "kein hashchange (Push-Antippen)");
  assert(js.includes("function autoAktualisieren("), "autoAktualisieren fehlt");
  // Hintergrund-Takt zeichnet nur bei echter Änderung neu (Signatur-Vergleich).
  assert(js.includes("function signatur("), "Signatur-Vergleich fehlt (würde flackern)");
  assert(js.includes("trainerSig !== trainerSig") === false, "Signatur-Logik unsinnig");
  assert(js.includes("trSig !== trainerSig") && js.includes("kuSig !== kundenSig"), "zeichnet nicht nur geänderte Listen neu");
});

Deno.test("1a: Pull-to-Refresh + Aktualisieren-Knopf vorhanden", async () => {
  const js = await lies(JS);
  const html = await lies(SEITE);
  assert(html.includes('id="btn-aktualisieren"'), "Aktualisieren-Knopf fehlt");
  assert(js.includes("function pullToRefreshVerdrahten("), "Pull-to-Refresh fehlt");
  assert(js.includes('"touchstart"') && js.includes('"touchend"'), "keine Zieh-Gesten");
  assert(html.includes('id="ptr"') && html.includes("Zum Aktualisieren ziehen"), "Zieh-Hinweis fehlt");
});

Deno.test("1a: neue Einträge werden kurz hervorgehoben", async () => {
  const js = await lies(JS);
  const css = await lies(SEITE);
  assert(js.includes("function markiereNeu("), "neue Einträge werden nicht erkannt");
  assert(js.includes("karte-neu"), "keine Hervorhebungsklasse");
  assert(css.includes("@keyframes neuBlitz") || /\.karte-neu\{[^}]*animation/.test(css), "keine Hervorhebungs-Animation");
});

// ── 1b: kompakte Karten ──────────────────────────────────────────────────────
Deno.test("1b: eigene Karten-Container und Karten-Bauer für Trainer/Kunden/Freigabe", async () => {
  const html = await lies(SEITE);
  for (const id of ["trainer-karten", "kunden-karten", "freigabe-karten"]) {
    assert(html.includes(`id="${id}"`), `Karten-Container ${id} fehlt`);
  }
  const js = await lies(JS);
  for (const fn of ["trainerKarte", "kundeKarte", "freigabeKarte"]) {
    assert(js.includes(`function ${fn}(`), `Karten-Bauer ${fn} fehlt`);
  }
  // Karte trägt Name, Status-Chip, Ort·Datum-Zeile, Vollständigkeitsbalken, Aktionen.
  const i = js.indexOf("function trainerKarte(");
  const block = js.slice(i, i + 1400);
  assert(block.includes("karte-name") && block.includes("statusChip"), "Karte ohne Name/Status");
  assert(block.includes("karte-zeile") && block.includes("datumKurz"), "Karte ohne Ort·Datum-Zeile");
  assert(block.includes("karte-aktionen") && block.includes('data-aktion="freigeben"'), "Karte ohne Aktionen");
  assert(block.includes('data-aktion="detail"'), "Tippen auf die Karte öffnet kein Detail");
});

Deno.test("1b/2: Karten nur am Handy, Tabelle nur am großen Bildschirm", async () => {
  const css = await lies(SEITE);
  assert(/\.karten\{display:none\}/.test(css), "Karten sind standardmäßig nicht versteckt (breit: Tabelle)");
  const i = css.indexOf("@media(max-width:600px)");
  const mob = css.slice(i);
  assert(mob.includes(".karten{display:block}"), "Karten erscheinen am Handy nicht");
  assert(/#tab-trainer \.table-wrap[^}]*display:none/.test(mob) || mob.includes("#tab-trainer .table-wrap,#tab-kunden .table-wrap{display:none}") || mob.includes(".table-wrap{display:none}"), "Tabelle wird am Handy nicht versteckt");
});

// ── 1c: Mehr-Blatt ───────────────────────────────────────────────────────────
Deno.test("1c: Mehr-Blatt von unten mit Abdunkelung, schließbar", async () => {
  const html = await lies(SEITE);
  const js = await lies(JS);
  assert(html.includes('id="mehr-overlay"') && html.includes('data-schliessen="mehr"'), "keine Abdunkelung/Schließen");
  assert(js.includes("function mehrOeffnen(") && js.includes("function mehrSchliessen("), "Öffnen/Schließen fehlt");
  assert(js.includes("mehrSwipeVerdrahten"), "kein Wischen zum Schließen");
  const css = await lies(SEITE);
  const i = css.indexOf("@media(max-width:600px)");
  assert(/\.tab-mehr-menu\{[^}]*bottom:0/.test(css.slice(i)), "Blatt geht nicht von unten auf");
});

// ── 1d: Kopf kompakt ─────────────────────────────────────────────────────────
Deno.test("1d: Kopf kompakt – relatives Zeit-Label, Abmelden im Mehr-Blatt", async () => {
  const js = await lies(JS);
  const html = await lies(SEITE);
  assert(js.includes("vor ") && js.includes("Min aktualisiert"), "kein relatives Zeit-Label");
  assert(js.includes("function zeitLabelAktualisieren("), "Zeit-Label wird nicht gepflegt");
  assert(html.includes('id="mehr-logout"'), "Abmelden fehlt im Mehr-Blatt");
  const css = await lies(SEITE);
  const i = css.indexOf("@media(max-width:600px)");
  assert(/#btn-logout\{display:none\}/.test(css.slice(i)), "Abmelden bleibt am Handy im Kopf");
});

// ── 1e: Leer-Zustände zentriert ──────────────────────────────────────────────
Deno.test("1e: leere Zustände am Handy zentriert (Ursache behoben)", async () => {
  const css = await lies(SEITE);
  const i = css.indexOf("@media(max-width:600px)");
  const mob = css.slice(i);
  assert(/tbody tr td\.leer-text\{[^}]*text-align:center/.test(mob), "Leer-Text wird nicht zentriert");
  assert(/tbody tr td\.leer-text::before\{content:none\}/.test(mob), "Leer-Text behält die rechtsbündige Beschriftung");
});

// ── 1f: Push kompakt ─────────────────────────────────────────────────────────
Deno.test("1f: Mitteilungs-Kasten klein, wenn eingerichtet", async () => {
  const html = await lies(SEITE);
  const js = await lies(JS);
  assert(html.includes('id="push-kompakt"') && html.includes("Mitteilungen aktiv"), "kompakte Push-Zeile fehlt");
  assert(html.includes('id="push-verwalten"'), "verwalten-Link fehlt");
  assert(js.includes('box.classList.toggle("verborgen", aktiv)'), "großer Kasten bleibt sichtbar, wenn eingerichtet");
  assert(js.includes('komp.classList.toggle("verborgen", !aktiv)'), "kompakte Zeile wird nicht gezeigt");
});

// ── 1g: Kennzahl-Kacheln filtern + aktive Markierung ─────────────────────────
Deno.test("1g: Kennzahl-Kachel filtert und wird aktiv markiert", async () => {
  const css = await lies(SEITE);
  const js = await lies(JS);
  assert(/\.stat-card\.aktiv\{/.test(css), "keine Markierung der aktiven Kachel");
  assert(js.includes("function statAktivMarkieren("), "aktive Kachel wird nicht markiert");
  assert(/akt === "stat"[^}]*statAktivMarkieren\(a\)/.test(js), "Kachel-Klick markiert nicht");
});

// ── Teil 3 in der Verwaltung ─────────────────────────────────────────────────
Deno.test("Teil 3: Namen in der Verwaltung laufen durch nameFormatieren", async () => {
  const js = await lies(JS);
  assert(js.includes("export function nameFormatieren("), "nameFormatieren fehlt");
  assert(js.includes("export function namePaarHtml("), "namePaarHtml fehlt");
  // Karten und Tabellen nutzen namePaarHtml bzw. nameFormatieren.
  assert(js.includes("namePaarHtml(t.vorname, t.nachname)"), "Trainer-Name nicht formatiert");
  assert(js.includes("nameFormatieren(a.trainer_name)") && js.includes("nameFormatieren(a.kunden_name)"), "Anfrage-Namen nicht formatiert");
  // Funktion selbst (Importprüfung, deckt die geforderten Fälle in namen_test ab).
  assertEquals(nameFormatieren("jajajaa hebebee"), "Jajajaa Hebebee");
});

// ── Sicherheit bleibt (kein Inline-Handler durch die neuen Knöpfe) ───────────
Deno.test("Sicherheit: keine Inline-Event-Handler trotz neuer Bedienelemente", async () => {
  const html = await lies(SEITE);
  assert(!/on(click|load|error|change|input|touchstart|touchend)\s*=/.test(html), "Inline-Event-Handler eingeschleust");
  assert(!/<script(?![^>]*\bsrc=)[^>]*>[^<]*\S/.test(html), "Inline-Skriptcode eingeschleust");
});
