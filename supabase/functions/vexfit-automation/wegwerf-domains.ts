// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/wegwerf-domains.ts
//
// S3 (Dauerlauf 07./08.11.2026): Liste bekannter Wegwerf-/Einmal-Mail-Domains.
// ERWEITERBAR: einfach weitere Domains (klein geschrieben, ohne @) ergaenzen.
// Wird von index.ts geladen und als Set an die Logik in kern.ts (anfrageVerdacht)
// uebergeben. Anfragen von diesen Domains gehen NICHT an den Trainer, sondern in
// die Admin-Liste „Zur Pruefung".
export const WEGWERF_DOMAINS: string[] = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "tempmailo.com",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "getnada.com",
  "nada.email",
  "yopmail.com",
  "yopmail.net",
  "dispostable.com",
  "maildrop.cc",
  "mailnesia.com",
  "fakeinbox.com",
  "mohmal.com",
  "mintemail.com",
  "spamgourmet.com",
  "mytemp.email",
  "emailondeck.com",
  "moakt.com",
  "tempr.email",
  "discard.email",
  "wegwerfmail.de",
  "wegwerfemail.de",
  "einrot.com",
  "spam4.me",
  "mailcatch.com",
  "inboxbear.com",
  "tmpmail.org",
  "tempmail.plus",
  "burnermail.io",
  "33mail.com",
  "anonaddy.me",
];
