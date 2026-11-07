-- ============================================================================
-- Vexfit – Ruecknahme zu 2026-11-07-02-land-ueberall.sql
-- Erzeugt am 07.11.2026. NICHT eingespielt.
--
-- Entfernt die Spalte `land` (und die Pruefbedingungen) in trainer_alerts,
-- warteliste, such_eingaben und trichter_ereignisse wieder und setzt die
-- INSERT-/SELECT-Rechte auf den vorherigen Spaltenumfang zurueck. Die
-- Spaltenrechte verschwinden mit der Spalte (DROP COLUMN entfernt sie), die
-- REVOKE-Zeilen stellen die urspruenglichen Grants exakt wieder her.
-- Mehrfach ausfuehrbar (IF EXISTS).
-- ============================================================================

-- 1) trainer_alerts: Rechte auf den Stand aus 2026-11-03-02 zuruecksetzen.
REVOKE INSERT (kunden_email, kunden_name, plz, stadt, radius, aktiv, land)
  ON public.trainer_alerts FROM authenticated;
REVOKE SELECT (id, kunden_email, kunden_name, plz, stadt, radius, aktiv, erstellt_am, land)
  ON public.trainer_alerts FROM authenticated;
GRANT INSERT (kunden_email, kunden_name, plz, stadt, radius, aktiv)
  ON public.trainer_alerts TO authenticated;
GRANT SELECT (id, kunden_email, kunden_name, plz, stadt, radius, aktiv, erstellt_am)
  ON public.trainer_alerts TO authenticated;
ALTER TABLE public.trainer_alerts DROP CONSTRAINT IF EXISTS trainer_alerts_land_werte;
ALTER TABLE public.trainer_alerts DROP COLUMN IF EXISTS land;

-- 2) warteliste: Rechte auf den Stand aus 2026-10-24 zuruecksetzen.
REVOKE INSERT (plz, stadt, ziel, umkreis, land) ON public.warteliste FROM authenticated;
GRANT INSERT (plz, stadt, ziel, umkreis) ON public.warteliste TO authenticated;
ALTER TABLE public.warteliste DROP CONSTRAINT IF EXISTS warteliste_land_werte;
ALTER TABLE public.warteliste DROP COLUMN IF EXISTS land;

-- 3) such_eingaben: Rechte auf den Stand aus 2026-10-18 zuruecksetzen.
REVOKE INSERT (spezialisierungen, trainingsart, plz, umkreis, anzahl_treffer, land)
  ON public.such_eingaben FROM authenticated;
GRANT INSERT (spezialisierungen, trainingsart, plz, umkreis, anzahl_treffer)
  ON public.such_eingaben TO authenticated;
ALTER TABLE public.such_eingaben DROP CONSTRAINT IF EXISTS such_eingaben_land_werte;
ALTER TABLE public.such_eingaben DROP COLUMN IF EXISTS land;

-- 4) trichter_ereignisse.
ALTER TABLE public.trichter_ereignisse DROP CONSTRAINT IF EXISTS trichter_ereignisse_land_werte;
ALTER TABLE public.trichter_ereignisse DROP COLUMN IF EXISTS land;
