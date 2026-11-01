-- ============================================================================
-- Vexfit – Baustein „Freischalt-Mail an den Trainer" (01.11.2026)
-- NICHT eingespielt (nur Datei). Mehrfach ausführbar (IF NOT EXISTS / COALESCE).
--
-- WAS DIESE DATEI TUT:
--   Spalte trainers.freischalt_mail_gesendet (timestamptz, NULL = noch nicht):
--   sichert, dass die Mail „Dein Vexfit-Profil ist freigeschaltet" GENAU EINMAL
--   pro Trainer rausgeht – auch bei erneutem Freigeben nach einer Sperre nicht
--   doppelt. Zeitstempel statt bloßem boolean, damit die Verwaltung „gesendet am
--   <Datum>" anzeigen kann. Beim automatischen Versand setzt die Edge Function
--   den Zeitpunkt nach erfolgreichem Senden.
--
--   Ohne diese Spalte läuft der Code trotzdem: dann wird beim Freigeben gesendet,
--   aber im Ergebnis gemeldet, dass die Einmal-Sperre fehlt (kein stiller Fehler).
--
-- Marco Blome und Sofi Silva haben die Mail am 01.11.2026 bereits von Hand
-- bekommen -> hier auf „gesendet" setzen (per E-Mail-Adresse), damit sie keine
-- zweite bekommen.
-- ============================================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS freischalt_mail_gesendet timestamptz;

COMMENT ON COLUMN public.trainers.freischalt_mail_gesendet IS
  'Zeitpunkt, zu dem die Freischalt-Mail an den Trainer ging (NULL = noch nicht). Einmal-Sperre für den automatischen Versand beim Freigeben.';

-- Die beiden schon von Hand benachrichtigten Trainer. COALESCE: ein bereits
-- gesetzter Wert bleibt erhalten (idempotent).
UPDATE public.trainers
   SET freischalt_mail_gesendet = COALESCE(freischalt_mail_gesendet, TIMESTAMPTZ '2026-11-01 12:00:00+01')
 WHERE lower(email) IN ('marco.blome@live.de', 'sofia.stpierresilva@gmail.com');
