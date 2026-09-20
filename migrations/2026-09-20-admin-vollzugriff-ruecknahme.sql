-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-09-20-admin-vollzugriff.sql
-- Erzeugt am 20.09.2026. NICHT eingespielt.
--
-- Diese Datei entfernt genau das, was 2026-09-20-admin-vollzugriff.sql
-- angelegt hat: die sechs Admin-Regeln, das DELETE-Recht der Rolle
-- authenticated auf trainers und kunden sowie die Hilfsfunktion. Die am
-- 20.09.2026 eingespielten Zugriffsregeln bleiben unangetastet; nach der
-- Ruecknahme ist exakt wieder der Stand von davor erreicht. admin.html kann
-- dann keine Daten mehr laden - das ist die erwartete Folge, kein Fehler.
-- ============================================================================


-- Entfernt die Leseregel des Admin-Kontos auf trainers.
DROP POLICY IF EXISTS "trainers_admin_alles_lesen" ON public.trainers;

-- Entfernt die Aenderungsregel des Admin-Kontos auf trainers.
DROP POLICY IF EXISTS "trainers_admin_alles_aendern" ON public.trainers;

-- Entfernt die Loeschregel des Admin-Kontos auf trainers.
DROP POLICY IF EXISTS "trainers_admin_loeschen" ON public.trainers;

-- Entfernt die Leseregel des Admin-Kontos auf kunden.
DROP POLICY IF EXISTS "kunden_admin_alles_lesen" ON public.kunden;

-- Entfernt die Loeschregel des Admin-Kontos auf kunden.
DROP POLICY IF EXISTS "kunden_admin_loeschen" ON public.kunden;

-- Entfernt die Leseregel des Admin-Kontos auf anfragen.
DROP POLICY IF EXISTS "anfragen_admin_alles_lesen" ON public.anfragen;

-- Nimmt der Rolle authenticated das in der Migration vergebene Loeschrecht
-- auf trainers wieder weg.
REVOKE DELETE ON public.trainers FROM authenticated;

-- Nimmt der Rolle authenticated das in der Migration vergebene Loeschrecht
-- auf kunden wieder weg.
REVOKE DELETE ON public.kunden FROM authenticated;

-- Entfernt die Hilfsfunktion; sie muss nach den Regeln entfernt werden, weil
-- die Regeln sie verwenden.
DROP FUNCTION IF EXISTS public.ist_vexfit_admin();
