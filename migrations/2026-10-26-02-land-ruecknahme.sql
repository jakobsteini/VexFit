-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-26-02-land.sql
-- Erzeugt am 26.10.2026. NICHT eingespielt.
--
-- Entfernt die Spalte land und die zugehoerigen Rechte wieder. Die
-- Spaltenrechte verschwinden mit der Spalte (DROP COLUMN entfernt sie).
-- ============================================================================

-- UPDATE-Recht auf trainers.land zuruecknehmen (vor dem Entfernen der Spalte).
REVOKE UPDATE (land) ON public.trainers FROM authenticated;
REVOKE INSERT (land) ON public.trainers FROM anon;
REVOKE INSERT (land) ON public.kunden   FROM anon;

-- Pruefbedingungen und Spalten entfernen.
ALTER TABLE public.trainers DROP CONSTRAINT IF EXISTS trainers_land_werte;
ALTER TABLE public.kunden   DROP CONSTRAINT IF EXISTS kunden_land_werte;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS land;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS land;
