-- ============================================================================
-- RÜCKNAHME zu migrations/2026-11-15-01-anon-intern-abschotten.sql (15.11.2026)
--
-- Stellt den Live-Zustand VOR der Härtung wieder her: anon erhält wieder das
-- Tabellen-SELECT-Recht auf admin_protokoll und trichter_ereignisse (die beiden
-- Objekte, die vorher HTTP 200/0-Zeilen lieferten). Der Zeilenschutz (RLS)
-- bleibt die einzige Schutzschicht – deshalb NUR verwenden, wenn die Härtung
-- nachweislich etwas gebrochen hat.
--
-- Die Vorsorge-REVOKEs (Punkt 3 der Migration) entzogen anon nichts, was anon
-- vorher besaß (alle dort bereits 401); sie werden daher nicht zurückgenommen.
-- Das in Punkt 2 bewusst erhaltene INSERT-Recht auf trichter_ereignisse bleibt.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.admin_protokoll') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.admin_protokoll TO anon';
  END IF;
  IF to_regclass('public.trichter_ereignisse') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.trichter_ereignisse TO anon';
  END IF;
END $$;
