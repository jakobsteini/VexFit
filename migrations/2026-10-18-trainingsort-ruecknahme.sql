-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-18-trainingsort.sql
-- Erzeugt am 18.10.2026. NICHT eingespielt.
--
-- Diese Datei entfernt genau das, was 2026-10-18-trainingsort.sql angelegt hat:
-- das der Rolle anon vergebene Schreibrecht auf die Spalte, die Wertebeschraenkung
-- und die Spalte selbst. Keine bestehende Regel wird dabei beruehrt. Nach der
-- Ruecknahme ist exakt wieder der Stand von davor erreicht.
-- ============================================================================

-- Nimmt der Rolle anon das Schreibrecht auf die neue Spalte wieder weg.
REVOKE INSERT (trainingsort) ON public.trainers FROM anon;

-- Entfernt die Wertebeschraenkung der neuen Spalte.
ALTER TABLE public.trainers DROP CONSTRAINT IF EXISTS trainers_trainingsort_werte;

-- Entfernt die neue Spalte mitsamt ihren Werten.
ALTER TABLE public.trainers DROP COLUMN IF EXISTS trainingsort;
