-- ============================================================================
-- Vexfit – Zusatzauftrag Teil R: kurzes Erstformular (Registrierung)
-- Erzeugt am 01.11.2026. NICHT eingespielt (nur Datei).
--
-- Das kurze Erstformular legt Trainer/Kunden ohne PLZ, Stadt, Trainingsort und
-- (beim Kunden) Ziel an – diese Felder werden erst danach ergänzt. Das Formular
-- sendet dafür leere Strings (""), die eine NOT-NULL-Spalte erfüllen. Diese
-- Migration ist nur nötig, wenn die Datenbank leere Werte ablehnt (z. B. wegen
-- einer NOT-NULL-Spalte ohne Default oder einer CHECK-Beschränkung auf das
-- PLZ-Format). Dann macht sie die betroffenen Spalten nullbar; das Anlegen
-- funktioniert danach auch ganz ohne diese Felder.
--
-- Idempotent (DROP NOT NULL ist auf bereits nullbaren Spalten ein No-Op; nur
-- ausgeführt, wenn die Tabelle/Spalte existiert). Admin-Ansicht und Suche kommen
-- mit leerer PLZ zurecht (die öffentliche Sicht trainers_oeffentlich filtert
-- ohnehin auf Foto/Bio/Spezialisierung, nicht auf PLZ).
--
-- RÜCKNAHME: 2026-11-01-03-registrierung-kurz-ruecknahme.sql.
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
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL;', z.tab, z.col);
    END IF;
  END LOOP;
END $$;

-- Hinweis: Eine etwaige CHECK-Beschränkung auf das PLZ-Format (z. B.
-- plz ~ '^[0-9]{4,5}$') müsste separat gelöst werden, falls vorhanden – ihren
-- Namen zeigt \d+ public.trainers im SQL-Editor. Ohne eine solche Beschränkung
-- genügt diese Migration; meist ist sie gar nicht nötig (leerer String reicht).
