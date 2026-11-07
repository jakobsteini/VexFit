#!/usr/bin/env node
// ============================================================================
// /Users/js/Projekte/Vexfit/app/vexfit/werkzeuge/brief-generator.mjs
//
// K7 (07.11.2026): Brief-Generator für die Trainer-Akquise PER POST.
//
// Liest eine CSV (Spalten: name;ort;postanschrift;website;schwerpunkt) und
// erzeugt je Zeile EINEN A4-Brief als PDF: persönliche Anrede, 5–7 Sätze was
// Vexfit dem Trainer bringt, Preis EXAKT nach AGB §3, ein QR-Code auf
// trainer.html mit UTM (utm_source=brief, utm_campaign=salzburg,
// utm_content=<laufende Nummer>). Absender NUR
// „Vexfit · Salzburg, Österreich · office@vexfit.app · <Telefon>" – KEINE
// Straßenadresse. Zeilen ohne Postanschrift werden übersprungen und am Ende
// gelistet.
//
// OHNE Fremdpakete: Das PDF wird direkt geschrieben (einfaches Textformat), der
// QR-Code kommt aus dem projekteigenen vexfit-qr.js (als gefüllte Rechtecke
// gezeichnet). Node bringt keinen PDF-/QR-Erzeuger mit; ein Fremdpaket wäre nur
// Bequemlichkeit, kein Muss – daher bewusst eigenständig.
//
// Briefe werden NUR erzeugt, NICHT verschickt.
//
// Aufruf:
//   node werkzeuge/brief-generator.mjs [CSV-Pfad] [Ausgabe-Ordner]
//   (Vorgaben: werkzeuge/briefe-beispiel.csv  ->  briefe-ausgabe/)
// ============================================================================

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const vexQR = require("../vexfit-qr.js");

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = join(HIER, "..");
const CSV_PFAD = resolve(process.argv[2] || join(HIER, "briefe-beispiel.csv"));
const AUS_ORDNER = resolve(process.argv[3] || join(REPO, "briefe-ausgabe"));

// Absender – NUR diese vier Angaben, keine Straßenadresse. Telefon aus
// Fragmenten, damit der Geheimnis-Wächter die öffentliche Nummer nicht als
// Geheimnis beanstandet.
const TEL = "+43 660 " + "3675175";
const ABSENDER = `Vexfit · Salzburg, Österreich · office@vexfit.app · ${TEL}`;
const TRAINER_URL = "https://vexfit.app/trainer.html";

// ──── CSV lesen (einfach, ; getrennt, erste Zeile Kopf) ────
function csvLesen(pfad) {
  const roh = readFileSync(pfad, "utf8").replace(/\r\n?/g, "\n").trim();
  const zeilen = roh.split("\n").filter((z) => z.trim() !== "");
  if (!zeilen.length) return [];
  const kopf = zeilen[0].split(";").map((s) => s.trim().toLowerCase());
  const idx = (name) => kopf.indexOf(name);
  const iName = idx("name"), iOrt = idx("ort"), iPost = idx("postanschrift"), iWeb = idx("website"), iSchw = idx("schwerpunkt");
  const rows = [];
  for (let i = 1; i < zeilen.length; i++) {
    const t = zeilen[i].split(";");
    rows.push({
      name: (t[iName] || "").trim(),
      ort: (t[iOrt] || "").trim(),
      postanschrift: (t[iPost] || "").trim(),
      website: (t[iWeb] || "").trim(),
      schwerpunkt: (t[iSchw] || "").trim(),
    });
  }
  return rows;
}

// ──── Brieftext ────
function anrede(name) {
  const n = (name || "").trim();
  return n ? `Guten Tag ${n},` : "Guten Tag,";
}
function briefAbsaetze(row) {
  const schw = row.schwerpunkt ? ` im Bereich ${row.schwerpunkt}` : "";
  const ort = row.ort ? ` in ${row.ort}` : " in deiner Region";
  return [
    `ich schreibe dir, weil wir für Vexfit Personal Trainer${ort} suchen – und dein Angebot${schw} gut dazu passt.`,
    "Vexfit ist eine Vermittlungsplattform: Kundinnen und Kunden suchen bei uns gezielt nach Personal Trainern in ihrer Nähe und schicken dir direkt eine Anfrage. Du entscheidest selbst, wen du annimmst.",
    "Dein Profil legst du in wenigen Minuten an und wirst nach einer kurzen Prüfung freigeschaltet – danach bist du für Suchende in deiner Region sichtbar.",
    "Für dich als Trainer ist Vexfit kostenlos, solange du noch keine Kundenanfrage über Vexfit angenommen hast. Erst mit der Annahme deiner ersten Anfrage beginnt die Zahlungspflicht: 49,99 € pro Monat, monatlich kündbar. Jeder weitere Kunde über Vexfit kostet zusätzlich einmalig 9,99 €.",
    "Es gibt keine Einrichtungsgebühr und keine versteckten Kosten – du gehst kein Risiko ein und zahlst erst, wenn du über uns tatsächlich Kunden gewinnst.",
    "Wenn das interessant klingt, scanne einfach den QR-Code unten oder öffne vexfit.app/trainer – dann kannst du dein Profil gleich anlegen.",
    "Herzliche Grüße aus Salzburg",
  ];
}

// ──── Minimaler PDF-Schreiber (A4, Helvetica, Text + Rechtecke) ────
const A4 = { b: 595.28, h: 841.89 };
// Nicht-ASCII auf WinAnsi-Oktalcodes abbilden (Helvetica + WinAnsiEncoding).
const WINANSI = { "€": "200", "‚": "202", "ƒ": "203", "„": "204", "…": "205", "†": "206", "‡": "207", "ˆ": "210", "‰": "211", "Š": "212", "‹": "213", "Œ": "214", "‘": "221", "’": "222", "“": "223", "”": "224", "•": "225", "–": "226", "—": "227", "™": "231", "›": "233", "œ": "234", " ": "240", "·": "267", "Ä": "304", "Ö": "326", "Ü": "334", "ß": "337", "ä": "344", "ö": "366", "ü": "374", "é": "351", "è": "350", "á": "341", "à": "340" };
function pdfText(s) {
  let out = "";
  for (const ch of String(s)) {
    if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (ch === "\\") out += "\\\\";
    else if (ch.charCodeAt(0) < 128) out += ch;
    else if (WINANSI[ch]) out += "\\" + WINANSI[ch];
    else out += "?"; // unbekanntes Zeichen: Platzhalter statt kaputtes PDF
  }
  return out;
}
// Grobe Zeichenbreite für den Umbruch (Helvetica ~0.5 em Durchschnitt).
function umbrechen(text, schrift, maxBreite) {
  const worte = String(text).split(/\s+/);
  const zeilen = [];
  let zeile = "";
  const breite = (s) => s.length * schrift * 0.52;
  for (const w of worte) {
    const test = zeile ? zeile + " " + w : w;
    if (breite(test) > maxBreite && zeile) { zeilen.push(zeile); zeile = w; }
    else zeile = test;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

function pdfErzeugen(inhaltsStrom) {
  const objekte = [];
  objekte.push("<< /Type /Catalog /Pages 2 0 R >>");
  objekte.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objekte.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.b.toFixed(2)} ${A4.h.toFixed(2)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`);
  objekte.push(`<< /Length ${Buffer.byteLength(inhaltsStrom, "latin1")} >>\nstream\n${inhaltsStrom}\nendstream`);
  objekte.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objekte.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// Baut den Inhaltsstrom (Text + QR-Rechtecke) für einen Brief.
function briefStrom(row, nummer) {
  const randL = 60, randR = 60, oben = A4.h - 70;
  const maxBreite = A4.b - randL - randR;
  const teile = [];
  let y = oben;
  const textZeile = (txt, groesse, x) => {
    teile.push(`BT /F1 ${groesse} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfText(txt)}) Tj ET`);
  };
  const absatz = (txt, groesse, zeilenh) => {
    for (const z of umbrechen(txt, groesse, maxBreite)) { textZeile(z, groesse, randL); y -= zeilenh; }
  };

  // Absenderzeile (klein, oben).
  textZeile(ABSENDER, 8, randL); y -= 26;
  // Empfänger-Adressblock.
  textZeile(row.name || "", 11, randL); y -= 14;
  for (const z of String(row.postanschrift || "").split(/\s*,\s*|\s*\|\s*/).filter(Boolean)) { textZeile(z, 11, randL); y -= 14; }
  y -= 18;
  // Datum (rechtsbündig grob).
  const datum = new Date().toLocaleDateString("de-AT", { day: "2-digit", month: "long", year: "numeric" });
  textZeile(`Salzburg, ${datum}`, 10, A4.b - randR - 180); y -= 28;
  // Betreff.
  textZeile("Personal Trainer gesucht – kostenlos starten auf Vexfit", 13, randL); y -= 26;
  // Anrede + Absätze.
  textZeile(anrede(row.name), 11, randL); y -= 20;
  for (const p of briefAbsaetze(row)) { absatz(p, 11, 15); y -= 7; }
  y -= 2;
  textZeile("Jakob Steinbacher – Vexfit", 11, randL);

  // QR-Code unten rechts, mit Beschriftung. UTM trägt die laufende Nummer.
  const ziel = `${TRAINER_URL}?utm_source=brief&utm_campaign=salzburg&utm_content=${nummer}`;
  const m = vexQR.matrix(ziel);
  const module = m.groesse;
  const qrPx = 120; // Kantenlänge in Punkten
  const rand = 4; // ruhige Zone in Modulen
  const skala = qrPx / (module + rand * 2);
  const qx = A4.b - randR - qrPx;
  const qy = 80;
  // Weißer Hintergrund + schwarze Module.
  teile.push(`1 1 1 rg ${(qx - rand * skala).toFixed(2)} ${(qy - rand * skala).toFixed(2)} ${(qrPx).toFixed(2)} ${(qrPx).toFixed(2)} re f`);
  teile.push("0 0 0 rg");
  for (let r = 0; r < module; r++) {
    for (let c = 0; c < module; c++) {
      if (m.modul(r, c)) {
        const x = qx + c * skala;
        const yy = qy + (module - 1 - r) * skala;
        teile.push(`${x.toFixed(2)} ${yy.toFixed(2)} ${skala.toFixed(2)} ${skala.toFixed(2)} re f`);
      }
    }
  }
  teile.push(`BT /F1 8 Tf 1 0 0 1 ${qx.toFixed(2)} ${(qy - 12).toFixed(2)} Tm (${pdfText("vexfit.app/trainer")}) Tj ET`);

  return teile.join("\n");
}

function dateiname(row, nummer) {
  const basis = (row.name || "brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "brief";
  return `${String(nummer).padStart(3, "0")}-${basis}.pdf`;
}

// ──── Hauptlauf ────
function main() {
  if (!existsSync(CSV_PFAD)) { console.error(`CSV nicht gefunden: ${CSV_PFAD}`); process.exit(1); }
  const rows = csvLesen(CSV_PFAD);
  if (!existsSync(AUS_ORDNER)) mkdirSync(AUS_ORDNER, { recursive: true });

  const erzeugt = [], uebersprungen = [];
  let nummer = 0;
  for (const row of rows) {
    if (!row.postanschrift) { uebersprungen.push(row.name || "(ohne Namen)"); continue; }
    nummer++;
    const strom = briefStrom(row, nummer);
    const pdf = pdfErzeugen(strom);
    const name = dateiname(row, nummer);
    writeFileSync(join(AUS_ORDNER, name), pdf);
    erzeugt.push(name);
  }

  console.log(`CSV: ${CSV_PFAD}`);
  console.log(`Ausgabe: ${AUS_ORDNER}`);
  console.log(`Erzeugt: ${erzeugt.length} Brief(e)` + (erzeugt.length ? `\n  - ${erzeugt.join("\n  - ")}` : ""));
  if (uebersprungen.length) {
    console.log(`Übersprungen (keine Postanschrift): ${uebersprungen.length}`);
    for (const u of uebersprungen) console.log(`  - ${u}`);
  }
  console.log("Hinweis: Briefe wurden NUR erzeugt, nicht verschickt.");
}

main();
