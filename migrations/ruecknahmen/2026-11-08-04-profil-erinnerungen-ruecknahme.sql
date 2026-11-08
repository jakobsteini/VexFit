-- ============================================================================
-- Vexfit – Ruecknahme zu 2026-11-08-04-profil-erinnerungen.sql
-- Erzeugt am 08.11.2026. NICHT eingespielt.
--
-- Entfernt die Protokolltabelle der manuellen Profil-Erinnerungen wieder und
-- nichts sonst. Das automatische Erinnerungssystem (erinnerung_stufe auf der
-- Trainerzeile) bleibt unberuehrt.
-- ============================================================================

DROP INDEX IF EXISTS public.profil_erinnerungen_trainer_zeit_idx;
DROP TABLE IF EXISTS public.profil_erinnerungen;
