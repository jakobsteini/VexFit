-- ============================================================================
-- RÜCKNAHME zu migrations/2026-11-06-01-trichter.sql (Vexfit B3, 06.11.2026)
-- Entfernt die Trichter-Tabelle und die strukturierten Herkunftsspalten wieder.
-- Der Freitext trainers.herkunft/kunden.herkunft (2026-11-03-01) bleibt.
-- ============================================================================

DROP POLICY IF EXISTS trichter_admin_select ON public.trichter_ereignisse;
DROP POLICY IF EXISTS trichter_insert ON public.trichter_ereignisse;
DROP TABLE IF EXISTS public.trichter_ereignisse;

ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft_quelle;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft_kampagne;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft_inhalt;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft_browser;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft_quelle;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft_kampagne;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft_inhalt;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft_browser;
