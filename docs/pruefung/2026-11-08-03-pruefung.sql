-- ============================================================================
-- Vexfit – Prüfabfrage zu Migration 2026-11-08-03 (anon kein voller Nachname)
-- NUR LESEND. Ändert nichts. Im Supabase SQL-Editor ausführen, NACHDEM 03
-- eingespielt wurde, und die Spalte "ist" mit "soll" (im Kommentar) vergleichen.
--
-- Hinweis zu has_table_privilege(...,'SELECT'): liefert bereits dann true, wenn
-- anon auch nur EINE Spalte lesen darf. Für die ganze Sicht trainers_oeffentlich
-- ist das nach Migration 03 ERWARTET true (anon darf die unbedenklichen Spalten
-- lesen) – der Schutz steckt in der SPALTEN-Ebene (nachname = false). Deshalb
-- prüfen wir nachname/Kontaktspalten einzeln mit has_column_privilege.
-- ============================================================================

SELECT pruefung, ist, soll,
       CASE WHEN ist = soll THEN 'OK' ELSE 'XX  ABWEICHUNG' END AS ergebnis
FROM (
  -- trainers_oeffentlich: nachname gesperrt, unbedenkliche Spalten erlaubt.
  SELECT 1 AS nr, 'anon  trainers_oeffentlich.nachname   SELECT' AS pruefung,
         has_column_privilege('anon','public.trainers_oeffentlich','nachname','SELECT') AS ist,
         false AS soll                                   -- soll: false (gesperrt)
  UNION ALL
  SELECT 2, 'anon  trainers_oeffentlich.vorname    SELECT',
         has_column_privilege('anon','public.trainers_oeffentlich','vorname','SELECT'),
         true                                            -- soll: true
  UNION ALL
  SELECT 3, 'anon  trainers_oeffentlich.id         SELECT',
         has_column_privilege('anon','public.trainers_oeffentlich','id','SELECT'),
         true                                            -- soll: true
  UNION ALL
  SELECT 4, 'anon  trainers_oeffentlich.preis_stunde SELECT',
         has_column_privilege('anon','public.trainers_oeffentlich','preis_stunde','SELECT'),
         true                                            -- soll: true
  UNION ALL
  -- Basistabelle trainers: anon darf GAR NICHTS (unverändert seit 2026-10-12).
  SELECT 5, 'anon  trainers.nachname               SELECT',
         has_column_privilege('anon','public.trainers','nachname','SELECT'),
         false                                           -- soll: false
  UNION ALL
  SELECT 6, 'anon  trainers (Tabelle)              SELECT',
         has_table_privilege('anon','public.trainers','SELECT'),
         false                                           -- soll: false
  UNION ALL
  -- trainers_vorschau: der vorgesehene anon-Weg, voll lesbar (nur Initiale).
  SELECT 7, 'anon  trainers_vorschau.nachname_initial SELECT',
         has_column_privilege('anon','public.trainers_vorschau','nachname_initial','SELECT'),
         true                                            -- soll: true
  UNION ALL
  SELECT 8, 'anon  trainers_vorschau.vorname      SELECT',
         has_column_privilege('anon','public.trainers_vorschau','vorname','SELECT'),
         true                                            -- soll: true
  UNION ALL
  -- trainers_vorschau hat KEINE Spalte nachname (nur nachname_initial):
  SELECT 9, 'anon  trainers_vorschau hat Spalte nachname?',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='trainers_vorschau'
                   AND column_name='nachname'),
         false                                           -- soll: false (gibt es nicht)
) t
ORDER BY nr;
