-- ============================================================================
-- Vexfit - Ruecknahme der Kennung des Trainers vom 17.09.2026
--
-- ACHTUNG: Danach findet der Trainerbereich keine Anfragen mehr, wenn der Code
-- bereits auf die Kennung umgestellt ist. Nur zusammen mit einem Ruecksetzen
-- des Codes verwenden.
-- ============================================================================

-- Entfernt den Index auf der Kennung.
DROP INDEX IF EXISTS public.anfragen_trainer_id_idx;

-- Entfernt die Spalte mitsamt Inhalt.
ALTER TABLE public.anfragen DROP COLUMN IF EXISTS trainer_id;
