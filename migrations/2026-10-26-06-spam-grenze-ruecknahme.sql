-- ============================================================================
-- Vexfit - Ruecknahme der Spam-Grenze-Tabelle
-- Entfernt genau das, was 2026-10-26-06-spam-grenze.sql anlegt, und nur das.
-- ============================================================================

-- Nimmt den Browser-Rollen nichts weiter: REVOKE ALL war der einzige Rechte-Eingriff.
-- (Die Tabelle wird samt Indizes, Zeilenschutz und Kommentar entfernt.)
DROP INDEX IF EXISTS public.spam_schutz_ip_zeit;
DROP INDEX IF EXISTS public.spam_schutz_email_zeit;
DROP TABLE IF EXISTS public.spam_schutz;
