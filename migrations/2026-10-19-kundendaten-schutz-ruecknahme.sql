-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-19-kundendaten-schutz.sql
-- Erzeugt am 19.10.2026. NICHT eingespielt.
--
-- Diese Datei entfernt genau das, was die Migration angelegt hat, und stellt das
-- urspruengliche Tabellen-Leserecht wieder her. Danach sieht ein angemeldeter
-- Trainer die Kunden-E-Mail wieder direkt - also der Stand vor der Migration
-- (die alte, undichte Lage). Keine Policy und kein Schluessel wird beruehrt.
-- ============================================================================

-- Nimmt der Rolle authenticated das Leserecht auf die Sicht wieder weg.
REVOKE SELECT ON public.anfragen_sichtbar FROM authenticated;

-- Entfernt die Sicht.
DROP VIEW IF EXISTS public.anfragen_sichtbar;

-- Stellt das urspruengliche Tabellen-Leserecht der Rolle authenticated wieder her (inklusive kunden_email und kuenftiger Spalten).
GRANT SELECT ON public.anfragen TO authenticated;
