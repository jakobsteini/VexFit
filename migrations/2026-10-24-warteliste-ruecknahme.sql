-- ============================================================================
-- Vexfit - Ruecknahme der Warteliste
-- Entfernt genau das, was 2026-10-24-warteliste.sql anlegt, und nur das.
-- Die Hilfsfunktion public.ist_vexfit_admin() bleibt unangetastet.
-- ============================================================================

-- Entfernt die Aenderungsregel fuer das Admin-Konto.
DROP POLICY IF EXISTS "warteliste_admin_vermerk" ON public.warteliste;

-- Entfernt die Leseregel (eigene Zeilen bzw. Admin).
DROP POLICY IF EXISTS "warteliste_eigene_oder_admin_lesen" ON public.warteliste;

-- Entfernt die Anlegeregel fuer eigene Zeilen.
DROP POLICY IF EXISTS "warteliste_eigene_anlegen" ON public.warteliste;

-- Nimmt das Aenderungsrecht auf die Spalte benachrichtigt wieder zurueck.
REVOKE UPDATE (benachrichtigt) ON public.warteliste FROM authenticated;

-- Nimmt das Leserecht wieder zurueck.
REVOKE SELECT ON public.warteliste FROM authenticated;

-- Nimmt das Anlegerecht auf die Datenspalten wieder zurueck.
REVOKE INSERT (plz, stadt, ziel, umkreis) ON public.warteliste FROM authenticated;

-- Loescht die Tabelle samt Zeilenschutz und Kommentar.
DROP TABLE IF EXISTS public.warteliste;
