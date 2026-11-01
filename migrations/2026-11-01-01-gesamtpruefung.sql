-- ============================================================================
-- Vexfit – Gesamtprüfung 01.11.2026: eine Migration für alle DB-Änderungen
-- dieser Sitzung. NICHT eingespielt (nur Datei). Mehrfach ausführbar
-- (IF NOT EXISTS). Reihenfolge, falls 2026-10-31-09 und -10 noch fehlen:
--   09 (Sperren/Protokoll)  →  10 (Sichtbarkeit)  →  2026-11-01-01 (diese Datei)
-- Diese Datei ist von 09/10 unabhängig und kann auch allein laufen.
--
-- WAS DIESE DATEI TUT:
--   Teil 4 – Spalte trainers.freigabe_mail_gesendet: merkt sich, dass die
--   einmalige Betreiber-Mail „Profil vollständig – bitte freigeben" für diesen
--   Trainer schon verschickt wurde. Der Endpunkt /freigabe-pruefen sendet nur,
--   solange das Feld false ist, und setzt es danach auf true. Default false,
--   damit bestehende Trainer bei der nächsten Vollständigkeit einmal gemeldet
--   werden (nicht rückwirkend für längst vollständige – das ist gewollt: Jakob
--   bekommt dann höchstens einmal je Trainer eine Meldung).
--
-- Teil 6 (Studio-Seite) nutzt das bestehende Datenmodell aus 2026-10-31-01
--   (studios/studio_standorte/studio_anzeigen) – keine neue DB-Änderung.
-- Teil 7 (Conversions API) braucht keine DB-Änderung (nur das Secret
--   META_CAPI_TOKEN in den Edge-Function-Secrets).
--
-- RÜCKNAHME: 2026-11-01-01-gesamtpruefung-ruecknahme.sql.
-- ============================================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS freigabe_mail_gesendet boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trainers.freigabe_mail_gesendet IS
  'Teil 4 (01.11.2026): true = die einmalige Betreiber-Mail "Profil vollstaendig - bitte freigeben" wurde fuer diesen Trainer schon verschickt. Gesetzt nur ueber die Edge Function (service_role) im Endpunkt /freigabe-pruefen.';
