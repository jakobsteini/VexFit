-- ============================================================================
-- Vexfit – Ruecknahme zu 2026-11-08-03-anon-kein-nachname.sql
-- Erzeugt am 08.11.2026. NICHT eingespielt.
--
-- Stellt den Spalten-Lesezugriff von anon auf nachname wieder her (alter Stand:
-- trainers_oeffentlich war fuer anon voll lesbar). Nur fuer den Notfall; der
-- Code liest fuer anon ohnehin keinen vollen Nachnamen mehr.
-- ============================================================================

GRANT SELECT (nachname) ON public.trainers_oeffentlich TO anon;
