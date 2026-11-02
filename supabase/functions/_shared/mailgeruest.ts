// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/_shared/mailgeruest.ts
//
// Gemeinsames Mail-Geruest fuer beide Edge Functions: EIN HTML-Rahmen und EINE
// reine Textfassung, beide aus denselben Angaben gebaut. Farben und Auszeichnung
// sind 1:1 die der bisherigen trainer-alert-Mail (kern.ts mailHtml).
//
// Sicherheit: im HTML laeuft jeder eingesetzte Wert durch maskieren() aus
// _shared/text.ts (wie trainer-alert es schon tat). Die Textfassung bleibt roh —
// maskieren wuerde dort den sichtbaren Text veraendern (aus "A & B" wuerde
// "A &amp; B"). Der Knopf entfaellt, wenn der Link nicht mit https:// beginnt
// (sichereAdresse gibt dann null).

import { maskieren, sichereAdresse } from "./text.ts";

/**
 * Firmenangabe fuer die zweite Fusszeile. WORTGLEICH aus dem Impressum
 * (rechtliches.html, "BETREIBER & KONTAKT": Name + Adresse). Eine GISA-Zahl
 * steht im Impressum NICHT - sie fehlt daher hier bewusst (als Luecke gemeldet),
 * statt sie zu erfinden.
 */
export const FIRMENANGABE = "Jakob Steinbacher, 5330 Fuschl am See, Österreich";

/** Eine Datenzeile der zweispaltigen Tabelle: Beschriftung links, Wert rechts. */
export interface DatenZeile {
  beschriftung: string;
  wert: string;
}

export interface MailAngaben {
  ueberschrift: string;
  /** Einleitungsabsatz. Fehlt bei den internen Betreiber-Mails. */
  absatz?: string;
  datenZeilen: DatenZeile[];
  knopfText?: string;
  knopfLink?: string;
  hinweis?: string;
  /** „Du erhältst diese E-Mail, weil…". Steht als erste Fußzeile. Darf fehlen
   *  (Teil 4: die Erinnerungs-Mails haben stattdessen eine feste 3-zeilige
   *  Fußzeile aus Adresse, Impressum-Link und Abmelde-Link). */
  grundZeile?: string;
  /** Teil 4: Impressum-Link (nur https) als Fußzeile zwischen Adresse und
   *  Abmelde-Link. Fehlt er, wird nichts gerendert. */
  impressumLink?: string;
  impressumText?: string;
  /** Nur Mail 4: die Bio als eigener Absatz (#bbb), wenn vorhanden. */
  bioAbsatz?: string;
  /** Teil 4 (Erinnerungs-Mails): ersetzt die zweite Fußzeile (sonst
   *  FIRMENANGABE). Für die Erinnerungen ausdrücklich ohne genaue Adresse
   *  („Salzburg · Österreich"). Fehlt der Wert, bleibt alles wie bisher. */
  fusszeile?: string;
  /** Teil 4: kleiner Abmelde-Link unten („Keine Erinnerungen mehr"). Nur https.
   *  Fehlt er, wird nichts gerendert (bestehende Mails unverändert). */
  abmeldeLink?: string;
  abmeldeText?: string;
}

function hatText(w: unknown): boolean {
  return typeof w === "string" && w.trim() !== "";
}

/** EIN HTML-Dokument aus den Angaben. */
export function mailRahmen(a: MailAngaben): string {
  // Zeilen ohne Wert ganz weglassen (so verlangt es Mail 4; fuer die uebrigen
  // kommen die Werte aus der Datenbank und sind in der Regel gefuellt).
  const zeilen = a.datenZeilen
    .filter((z) => hatText(z.wert))
    .map((z) =>
      `<tr><td style="color:#999;font-size:13px;padding:6px 0;vertical-align:top">${
        maskieren(z.beschriftung)
      }</td><td style="color:#f5f5f0;font-size:15px;padding:6px 0;text-align:right">${
        maskieren(z.wert)
      }</td></tr>`
    )
    .join("");
  const tabelle = zeilen
    ? `<table style="width:100%;border-collapse:collapse;margin:0 0 24px">${zeilen}</table>`
    : "";

  const absatz = hatText(a.absatz)
    ? `<p style="color:#f5f5f0;font-size:16px;line-height:1.6;margin:0 0 20px">${
      maskieren(a.absatz)
    }</p>`
    : "";

  const bio = hatText(a.bioAbsatz)
    ? `<p style="color:#bbb;font-size:14px;line-height:1.6;margin:0 0 24px">${
      maskieren(a.bioAbsatz)
    }</p>`
    : "";

  const link = a.knopfLink ? sichereAdresse(a.knopfLink) : null;
  const knopf = (link && hatText(a.knopfText))
    ? `<a href="${
      maskieren(link)
    }" style="display:block;background:#e8ff00;color:#0a0a0a;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:900;font-size:15px;letter-spacing:1px">${
      maskieren(a.knopfText)
    }</a>`
    : "";

  const hinweis = hatText(a.hinweis)
    ? `<p style="color:#999;font-size:13px;line-height:1.6;margin:16px 0 0;text-align:center">${
      maskieren(a.hinweis)
    }</p>`
    : "";

  // Teil 4: Impressum-Link (nur https) als zweite Fußzeile.
  const impLink = a.impressumLink ? sichereAdresse(a.impressumLink) : null;
  const impressum = (impLink && hatText(a.impressumText))
    ? `<p style="margin:10px 0 0;text-align:center"><a href="${
      maskieren(impLink)
    }" style="color:#777;font-size:12px;text-decoration:underline">${
      maskieren(a.impressumText)
    }</a></p>`
    : "";

  // Teil 4: Abmelde-Link (nur https) als LETZTE Fußzeile.
  const abLink = a.abmeldeLink ? sichereAdresse(a.abmeldeLink) : null;
  const abmelden = (abLink && hatText(a.abmeldeText))
    ? `<p style="margin:10px 0 0;text-align:center"><a href="${
      maskieren(abLink)
    }" style="color:#777;font-size:12px;text-decoration:underline">${
      maskieren(a.abmeldeText)
    }</a></p>`
    : "";

  // Erste Fußzeile: (optionaler) Grund + Adresse. Ohne Grund nur die Adresse.
  const grund = hatText(a.grundZeile) ? `${maskieren(a.grundZeile)}<br>` : "";

  return `<div style="background:#0a0a0a;padding:40px 20px;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">
    <div bgcolor="#0A0A0A" style="background:#0A0A0A;padding:18px;text-align:center">
      <img src="https://vexfit.app/marke/vexfit-wortmarke-transparent.png" width="180" alt="VEXFIT" style="border:0;max-width:180px;height:auto">
    </div>
    <div style="padding:32px 28px">
      <h1 style="color:#e8ff00;font-size:24px;margin:0 0 20px;line-height:1.3">${
    maskieren(a.ueberschrift)
  }</h1>
      ${absatz}
      ${tabelle}
      ${bio}
      ${knopf}
      ${hinweis}
      <p style="color:#666;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.6">${grund}${
    maskieren(a.fusszeile ?? FIRMENANGABE)
  }</p>
      ${impressum}
      ${abmelden}
    </div>
  </div>
</div>`;
}

/** Dieselben Angaben als reine Textfassung (nicht maskiert). */
export function mailText(a: MailAngaben): string {
  const teile: string[] = [a.ueberschrift];
  if (hatText(a.absatz)) teile.push("", a.absatz!.trim());
  const zeilen = a.datenZeilen.filter((z) => hatText(z.wert));
  if (zeilen.length) {
    teile.push("");
    for (const z of zeilen) teile.push(`${z.beschriftung}: ${z.wert}`);
  }
  if (hatText(a.bioAbsatz)) teile.push("", a.bioAbsatz!.trim());
  const link = a.knopfLink ? sichereAdresse(a.knopfLink) : null;
  if (link && hatText(a.knopfText)) teile.push("", `${a.knopfText}: ${link}`);
  if (hatText(a.hinweis)) teile.push("", a.hinweis!.trim());
  // Fußzeile in fester Reihenfolge: (optionaler) Grund, Adresse, Impressum, Abmelde.
  teile.push("");
  if (hatText(a.grundZeile)) teile.push(a.grundZeile!);
  teile.push(a.fusszeile ?? FIRMENANGABE);
  const impLink = a.impressumLink ? sichereAdresse(a.impressumLink) : null;
  if (impLink && hatText(a.impressumText)) teile.push(`${a.impressumText}: ${impLink}`);
  const abLink = a.abmeldeLink ? sichereAdresse(a.abmeldeLink) : null;
  if (abLink && hatText(a.abmeldeText)) teile.push(`${a.abmeldeText}: ${abLink}`);
  // Jede Zeile rechts beschneiden: ein Zeilenende auf einem Leerzeichen wuerde
  // der Quoted-Printable-Versand zu einem sichtbaren "=20" machen (Livebetrieb
  // 25.10.2026, "Trainingsart:=20"). Leere Werte sind oben schon weggefallen.
  return teile.map((zeile) => zeile.replace(/[ \t]+$/, "")).join("\n");
}
