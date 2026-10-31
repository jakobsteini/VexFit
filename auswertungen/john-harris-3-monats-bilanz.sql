-- ============================================================================
-- Vexfit - 3-Monats-Bilanz John Harris, je Standort
-- Erzeugt am 31.10.2026. NUR AUSWERTUNG - NICHT Teil der Migrationen, nicht
-- einspielen. Zum Ausfuehren im Supabase SQL Editor, wenn die Testphase
-- ausgewertet wird.
--
-- Die Testphase wurde am 30.10.2026 vereinbart (drei Monate, kostenlos fuer
-- John Harris). Diese Abfrage zeigt je Standort:
--   - Anfragen gesamt
--   - davon Neukunden (studio_mitglied = false)
--   - davon bestehende Mitglieder (studio_mitglied = true)
--   - angenommene Anfragen
--   - abgelehnte Anfragen
--   - Zahl der eingetragenen Trainer (gesamt / davon freigeschaltet)
-- KEINE Kundendaten.
--
-- Der Zeitraum ist auf die drei Monate ab Vereinbarung eingegrenzt
-- (2026-10-30 bis 2027-01-30); bei Bedarf die beiden Daten anpassen.
-- ============================================================================

WITH zeitraum AS (
  SELECT '2026-10-30'::date AS von, '2027-01-30'::date AS bis
)
SELECT
  s.name                                                         AS studio,
  st.name                                                        AS standort,
  COUNT(a.id)                                                    AS anfragen_gesamt,
  COUNT(a.id) FILTER (WHERE a.studio_mitglied IS FALSE)          AS neukunden,
  COUNT(a.id) FILTER (WHERE a.studio_mitglied IS TRUE)           AS bestehende_mitglieder,
  COUNT(a.id) FILTER (WHERE a.studio_mitglied IS NULL)           AS ohne_angabe,
  COUNT(a.id) FILTER (WHERE a.status = 'angenommen')             AS angenommen,
  COUNT(a.id) FILTER (WHERE a.status = 'abgelehnt')              AS abgelehnt,
  (SELECT COUNT(*) FROM public.trainers t
     WHERE t.studio_standort_id = st.id)                         AS trainer_gesamt,
  (SELECT COUNT(*) FROM public.trainers t
     WHERE t.studio_standort_id = st.id AND t.aktiv = true)      AS trainer_freigeschaltet
FROM public.studios s
JOIN public.studio_standorte st ON st.studio_id = s.id
LEFT JOIN public.anfragen a
       ON a.studio_standort_id = st.id
      AND a.created_at >= (SELECT von FROM zeitraum)
      AND a.created_at <  (SELECT bis FROM zeitraum)
WHERE s.slug = 'john-harris'
GROUP BY s.name, st.name, st.id
ORDER BY st.name;
