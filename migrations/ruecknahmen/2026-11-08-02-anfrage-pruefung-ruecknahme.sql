-- ============================================================================
-- Vexfit – Ruecknahme zu 2026-11-08-02-anfrage-pruefung.sql
-- Erzeugt am 08.11.2026. NICHT eingespielt.
-- Entfernt Index, Pruefbedingung und die beiden Spalten wieder.
-- ============================================================================

DROP INDEX IF EXISTS public.anfragen_pruef_status_idx;
ALTER TABLE public.anfragen DROP CONSTRAINT IF EXISTS anfragen_pruef_status_werte;
ALTER TABLE public.anfragen DROP COLUMN IF EXISTS pruef_grund;
ALTER TABLE public.anfragen DROP COLUMN IF EXISTS pruef_status;
