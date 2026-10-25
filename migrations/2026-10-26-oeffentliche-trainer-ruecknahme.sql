-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-26-oeffentliche-trainer.sql
-- Erzeugt am 26.10.2026. NICHT eingespielt.
--
-- Entfernt genau die in 2026-10-26-oeffentliche-trainer.sql angelegte Sicht
-- und nichts sonst. Die Rechte und Policies auf public.trainers wurden von der
-- Vorwaertsmigration nicht veraendert und bleiben daher auch hier unangetastet.
-- ============================================================================

-- Entfernt die oeffentliche Sicht wieder. Das von der Vorwaertsmigration
-- vergebene SELECT-Recht verschwindet mit der Sicht.
DROP VIEW IF EXISTS public.trainers_oeffentlich;
