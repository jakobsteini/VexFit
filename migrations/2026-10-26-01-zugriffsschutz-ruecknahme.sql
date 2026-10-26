-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-26-01-zugriffsschutz.sql
-- Erzeugt am 26.10.2026. NICHT eingespielt.
--
-- Stellt die tabellenweiten Rechte wieder her, die 2026-09-19-zugriffsregeln-
-- neuaufbau.sql vergeben hatte, und hebt die spaltenweisen Rechte dieser
-- Migration wieder auf. Policies werden nicht beruehrt (die Vorwaertsmigration
-- hat auch keine geaendert).
-- ============================================================================

-- trainers: spaltenweises UPDATE aufheben, tabellenweites UPDATE wiederherstellen.
REVOKE UPDATE (trainingsart, preis_stunde, bio, erfahrung, spezialisierungen,
               trainingsort, telefon, plz, stadt, avatar_url)
  ON public.trainers FROM authenticated;
GRANT UPDATE ON public.trainers TO authenticated;

-- anfragen: UPDATE wieder auf status UND weitergeleitet wie zuvor.
REVOKE UPDATE (status) ON public.anfragen FROM authenticated;
GRANT UPDATE (status, weitergeleitet) ON public.anfragen TO authenticated;

-- anfragen: spaltenweises SELECT aufheben, tabellenweites SELECT wiederherstellen.
REVOKE SELECT (id, created_at, trainer_id, trainer_name, kunden_name, ziel,
               nachricht, status, weitergeleitet)
  ON public.anfragen FROM authenticated;
GRANT SELECT ON public.anfragen TO authenticated;
