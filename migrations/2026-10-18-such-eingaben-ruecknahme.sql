-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-18-such-eingaben.sql
-- Erzeugt am 18.10.2026. NICHT eingespielt.
--
-- Diese Datei entfernt genau das, was 2026-10-18-such-eingaben.sql angelegt hat:
-- die beiden Regeln, die beiden vergebenen Rechte und die Tabelle selbst. Die
-- Hilfsfunktion public.ist_vexfit_admin() bleibt unangetastet, weil sie aus
-- einer anderen Migration stammt und von weiteren Regeln verwendet wird. Nach
-- der Ruecknahme ist exakt wieder der Stand von davor erreicht: die Tabelle
-- existiert nicht mehr, der gefuehrte Einstieg laeuft dann ohne Speichern.
-- ============================================================================

-- Entfernt die Leseregel des Admin-Kontos.
DROP POLICY IF EXISTS "such_eingaben_admin_lesen" ON public.such_eingaben;

-- Entfernt die Anlegeregel fuer eigene Zeilen.
DROP POLICY IF EXISTS "such_eingaben_eigene_anlegen" ON public.such_eingaben;

-- Nimmt der Rolle authenticated das vergebene Leserecht wieder weg.
REVOKE SELECT ON public.such_eingaben FROM authenticated;

-- Nimmt der Rolle authenticated das vergebene Einfuegerecht wieder weg.
REVOKE INSERT (spezialisierungen, trainingsart, plz, umkreis, anzahl_treffer) ON public.such_eingaben FROM authenticated;

-- Entfernt zuletzt die Tabelle selbst mitsamt ihren Daten.
DROP TABLE IF EXISTS public.such_eingaben;
