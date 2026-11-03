-- ============================================================================
-- RÜCKNAHME zu 2026-11-03-02-warteliste-mail.sql
-- Entfernt genau das, was die Migration anlegt: Indizes, Token-Spalte, Policies,
-- Rechte und die Tabelle public.trainer_alerts selbst. public.warteliste und die
-- Hilfsfunktion public.ist_vexfit_admin() bleiben unangetastet.
--
-- ACHTUNG: DROP TABLE entfernt auch alle Einträge. Da die Tabelle live noch nie
-- existierte (sie wird mit dieser Migration erst angelegt), ist das unkritisch.
-- Mehrfach ausführbar.
-- ============================================================================

DROP INDEX IF EXISTS public.trainer_alerts_offen_plz_idx;
DROP INDEX IF EXISTS public.trainer_alerts_abmelde_token_idx;

DROP POLICY IF EXISTS "trainer_alerts_eigene_oder_admin_lesen" ON public.trainer_alerts;
DROP POLICY IF EXISTS "trainer_alerts_eigene_anlegen" ON public.trainer_alerts;

REVOKE ALL ON public.trainer_alerts FROM anon, authenticated;

DROP TABLE IF EXISTS public.trainer_alerts;
