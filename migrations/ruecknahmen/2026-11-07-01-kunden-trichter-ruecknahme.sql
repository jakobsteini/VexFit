-- ============================================================================
-- RÜCKNAHME zu migrations/2026-11-07-01-kunden-trichter.sql (Vexfit K1, 07.11.2026)
-- Setzt den Stufen-CHECK auf die ursprünglichen Trainer-Stufen zurück und
-- entfernt die Spalte plz_bereich. Vorhandene Kunden-Ereignisse müssten vor dem
-- Zurücksetzen des CHECK entfernt werden – daher zuerst löschen.
-- ============================================================================

-- Kunden-Ereignisse entfernen, damit der engere CHECK wieder greift.
DELETE FROM public.trichter_ereignisse
  WHERE stufe IN ('suche','treffer','profil','anfrage_start','anfrage');

ALTER TABLE public.trichter_ereignisse
  DROP CONSTRAINT IF EXISTS trichter_ereignisse_stufe_check;
ALTER TABLE public.trichter_ereignisse
  ADD CONSTRAINT trichter_ereignisse_stufe_check CHECK (stufe IN (
    'seite','formular','abgesendet','bestaetigt','profil5'
  ));

ALTER TABLE public.trichter_ereignisse DROP COLUMN IF EXISTS plz_bereich;
