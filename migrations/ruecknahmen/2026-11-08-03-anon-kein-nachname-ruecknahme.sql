-- ============================================================================
-- Vexfit – Ruecknahme zu 2026-11-08-03-anon-kein-nachname.sql
-- Erzeugt am 08.11.2026, ueberarbeitet am 08.11.2026. NICHT eingespielt.
--
-- Stellt den Stand VOR Migration 03 wieder her: anon las die ganze Sicht
-- trainers_oeffentlich (sichtweites GRANT, inkl. nachname). Dafuer genuegt es,
-- das sichtweite SELECT wieder zu vergeben – es umfasst alle Spalten und macht
-- den Spalten-GRANT aus Schritt 2 der Migration gegenstandslos.
--
-- Nur fuer den Notfall; der Seitencode liest fuer anon ohnehin keinen vollen
-- Nachnamen mehr an. Mehrfach ausfuehrbar.
-- ============================================================================

GRANT SELECT ON public.trainers_oeffentlich TO anon;
