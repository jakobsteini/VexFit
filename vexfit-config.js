// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-config.js
//
// Zentrale Schalter für die ausgelieferten Seiten. Wird VOR den Seitenskripten
// eingebunden und stellt window.VEXFIT_CONFIG bereit.
//
// WICHTIG (Grundsatz Jakob 12.10.2026): Neue Wege nur hinter Schaltern, der
// Standard bleibt das heutige Verhalten. Diese Datei ändert NICHTS, solange die
// Schalter auf ihrem Standard stehen.
(function (global) {
  global.VEXFIT_CONFIG = global.VEXFIT_CONFIG || {
    // K2 (07.11.2026): Öffentliche Vorschau. Standard AUS.
    //   false = Verhalten exakt wie heute (Einstieg führt zur Anmeldung; die
    //           öffentliche Suche zeigt die Profile wie bisher).
    //   true  = Besucher sehen ohne Anmeldung eine begrenzte Vorschau ihrer
    //           Region: nur freigegebene Trainer mit Profil >= 5/8, nur Vorname
    //           (Nachname abgekürzt), Schwerpunkte, Ort (keine Adresse), Preis
    //           pro Stunde, Foto. Kontaktdaten/Nachname/Anfrage bleiben hinter
    //           der Kurz-Anmeldung.
    // Jakob hat am 12.11.2026 entschieden: nicht angemeldete Besucher sehen
    // GAR KEINE Trainerdaten mehr (kein Name, keine Karte, kein Ort, keine
    // Anzahl). Die öffentliche Vorschau ist damit AUS; zusätzlich machen die
    // Seiten für nicht angemeldete Besucher keinen Trainer-Netzaufruf mehr und
    // die DB entzieht anon den Lesezugriff (2026-11-12-01-suche-umkreis.sql).
    OEFFENTLICHE_VORSCHAU: false,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.VEXFIT_CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
