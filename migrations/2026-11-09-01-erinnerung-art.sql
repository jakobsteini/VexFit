-- ============================================================================
-- Vexfit – Art einer Profil-Erinnerung (automatisch/manuell) (Dauerlauf 09.11.2026)
-- Erzeugt am 09.11.2026. NICHT eingespielt (nur Datei).
--
-- WAS DIESE DATEI TUT:
-- Ergaenzt public.profil_erinnerungen um die Spalte "art". Ab jetzt schreibt
-- nicht nur der manuelle (per Klick) Versand in diese Tabelle, sondern AUCH die
-- automatische Stufen-Erinnerung (Cron). "art" unterscheidet beide:
--   'manuell'      – von Jakob in der Verwaltung per Klick verschickt
--   'automatisch'  – vom Stufen-Cron verschickt
-- Dadurch
--   * zeigt die Verwaltungsliste bei „letzte Erinnerung" die Art, und
--   * nutzen automatischer Cron UND manuelle Verwaltung denselben letzten
--     Versandzeitpunkt fuer den gemeinsamen Mindestabstand (3 Tage), sodass ein
--     Trainer nicht binnen Stunden zwei Erinnerungen bekommt.
--
-- REIHENFOLGE: zuerst 2026-11-08-04 (Tabelle profil_erinnerungen), dann diese.
-- Mehrfach ausfuehrbar (IF NOT EXISTS / idempotenter CHECK).
-- RUECKNAHME: migrations/ruecknahmen/2026-11-09-01-erinnerung-art-ruecknahme.sql
-- ============================================================================

ALTER TABLE public.profil_erinnerungen
  ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'manuell';

COMMENT ON COLUMN public.profil_erinnerungen.art IS
  'Art der Erinnerung: automatisch (Stufen-Cron) oder manuell (Verwaltung, per Klick).';

-- Nur die zwei erlaubten Werte (idempotent neu setzen).
ALTER TABLE public.profil_erinnerungen
  DROP CONSTRAINT IF EXISTS profil_erinnerungen_art_chk;
ALTER TABLE public.profil_erinnerungen
  ADD CONSTRAINT profil_erinnerungen_art_chk CHECK (art IN ('automatisch', 'manuell'));
