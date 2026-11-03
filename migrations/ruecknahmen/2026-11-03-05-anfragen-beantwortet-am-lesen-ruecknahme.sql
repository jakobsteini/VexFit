-- ============================================================================
-- RÜCKNAHME zu 2026-11-03-05-anfragen-beantwortet-am-lesen.sql
-- Entzieht der Rolle authenticated wieder das Leserecht auf
-- public.anfragen.beantwortet_am. Sonst nichts – Policies und die übrigen
-- Spaltenrechte bleiben unberührt.
--
-- Mehrfach ausführbar (REVOKE auf ein nicht vorhandenes Recht ist folgenlos).
-- ============================================================================

REVOKE SELECT (beantwortet_am) ON public.anfragen FROM authenticated;
