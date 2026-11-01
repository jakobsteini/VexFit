-- ============================================================================
-- RÜCKNAHME zu 2026-11-01-03-registrierung-kurz.sql (Teil R).
-- Setzt NOT NULL wieder. ACHTUNG: schlägt fehl, wenn inzwischen Zeilen mit
-- NULL in diesen Spalten existieren (dann vorher auffüllen). Nur ausführen,
-- wenn wirklich zum alten Zustand zurückgekehrt werden soll.
-- ============================================================================

DO $$
DECLARE
  z record;
BEGIN
  FOR z IN
    SELECT * FROM (VALUES
      ('trainers', 'plz'),
      ('trainers', 'stadt'),
      ('trainers', 'trainingsort'),
      ('kunden',   'plz'),
      ('kunden',   'stadt'),
      ('kunden',   'ziel')
    ) AS t(tab, col)
  LOOP
    IF to_regclass('public.' || z.tab) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = z.tab AND column_name = z.col
       )
    THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL;', z.tab, z.col);
    END IF;
  END LOOP;
END $$;
