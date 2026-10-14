-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-14-admin-stripe-events-lesen.sql
-- Erzeugt am 14.10.2026. NICHT eingespielt.
--
-- Diese Datei entfernt genau das, was 2026-10-14-admin-stripe-events-lesen.sql
-- angelegt hat: die Leseregel des Admin-Kontos und das der Rolle authenticated
-- vergebene SELECT-Recht auf stripe_events_verarbeitet. Die Hilfsfunktion
-- public.ist_vexfit_admin() bleibt unangetastet, weil sie aus einer anderen
-- Migration stammt und von weiteren Regeln verwendet wird. Nach der Ruecknahme
-- ist exakt wieder der Stand von davor erreicht: das Admin-Panel zeigt dann den
-- Hinweis statt der Zahlungsereignisse - das ist die erwartete Folge, kein Fehler.
-- ============================================================================

-- Entfernt die Leseregel des Admin-Kontos auf stripe_events_verarbeitet.
DROP POLICY IF EXISTS "stripe_events_admin_lesen" ON public.stripe_events_verarbeitet;

-- Nimmt der Rolle authenticated das in der Migration vergebene Leserecht wieder weg.
REVOKE SELECT ON public.stripe_events_verarbeitet FROM authenticated;
