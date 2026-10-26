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
  grundZeile: string;
  /** Nur Mail 4: die Bio als eigener Absatz (#bbb), wenn vorhanden. */
  bioAbsatz?: string;
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

  return `<div style="background:#0a0a0a;padding:40px 20px;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">
    <div style="background:#e8ff00;padding:18px;text-align:center">
      <span style="font-size:22px;font-weight:900;letter-spacing:4px;color:#0a0a0a">VEXFIT</span>
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
      <p style="color:#666;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.6">${
    maskieren(a.grundZeile)
  }<br>${FIRMENANGABE}</p>
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
  teile.push("", a.grundZeile, FIRMENANGABE);
  // Jede Zeile rechts beschneiden: ein Zeilenende auf einem Leerzeichen wuerde
  // der Quoted-Printable-Versand zu einem sichtbaren "=20" machen (Livebetrieb
  // 25.10.2026, "Trainingsart:=20"). Leere Werte sind oben schon weggefallen.
  return teile.map((zeile) => zeile.replace(/[ \t]+$/, "")).join("\n");
}
