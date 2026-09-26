// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/_shared/text.ts
//
// Gemeinsame Textwerkzeuge fuer alle Edge Functions. Hier steht die EINE
// Maskier-Funktion; trainer-alert und vexfit-automation holen sie von hier,
// damit es keine zweite Fassung gibt, die man vergessen kann.

/**
 * HTML maskieren. Jeder Wert aus der Datenbank oder aus einem Formular, der in
 * HTML landet, laeuft hier durch.
 *
 * Nur fuer HTML-Mails gedacht. In einer Textmail wuerde das Maskieren den
 * sichtbaren Text veraendern (aus "A & B" wuerde "A &amp; B") — dort also
 * ausdruecklich NICHT anwenden.
 */
export function maskieren(wert: unknown): string {
  return String(wert ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Betreffzeile saeubern: Zeilenumbrueche und andere Steuerzeichen werden zu
 * einem Leerzeichen. Sonst koennte ein Name aus einem Formular eine zweite
 * Mail-Kopfzeile einschleusen (Header Injection).
 */
export function betreffSaeubern(betreff: string): string {
  return String(betreff ?? "")
    // deno-lint-ignore no-control-regex -- Steuerzeichen sind hier der Zweck
    .replace(/[\r\n\x00-\x1f\x7f\u2028\u2029]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Muster fuer eine E-Mail-Adresse — dasselbe, das die App im Browser benutzt. */
const ADRESSE_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Taugt der Wert als Empfaengeradresse? Geprueft wird das Format UND dass
 * keine Steuerzeichen darin stehen — eine Adresse mit Zeilenumbruch koennte
 * beim Versand eine zusaetzliche Kopfzeile erzeugen.
 */
export function adresseGueltig(adresse: unknown): boolean {
  const wert = String(adresse ?? "");
  if (wert.length === 0 || wert.length > 320) return false;
  // deno-lint-ignore no-control-regex -- Steuerzeichen sind hier der Zweck
  if (/[\r\n\x00-\x1f\x7f]/.test(wert)) return false;
  return ADRESSE_MUSTER.test(wert);
}

/**
 * Adresse fuer ein `href`. Zugelassen ist nur, was mit `https://` beginnt —
 * `javascript:`, `data:` und auch einfaches `http://` fallen heraus.
 */
export function sichereAdresse(adresse: string): string | null {
  const roh = String(adresse ?? "").trim();
  if (!roh.toLowerCase().startsWith("https://")) return null;
  // deno-lint-ignore no-control-regex -- Steuerzeichen sind hier der Zweck
  if (/[\x00-\x1f\x7f]/.test(roh)) return null;
  return roh;
}
