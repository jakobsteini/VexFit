-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-10-12-anon-kein-trainer-lesen.sql
-- Erzeugt am 12.10.2026. NICHT eingespielt.
--
-- Stellt den Stand von vor der Migration wieder her: anon darf freigeschaltete
-- Trainer wieder lesen. Gibt EXAKT die zwei Rechte zurueck, die die Migration
-- entzogen hat - Spalten-Leserecht und Leseregel, wortgleich zum Stand aus der
-- Migration vom 19.09.2026. Danach liegen die Trainerdaten wieder offen fuer
-- jeden mit dem oeffentlichen Schluessel; das ist nur eine Notbremse, falls
-- nach dem Einspielen etwas Wichtiges nicht mehr geht.
-- ============================================================================


-- Gibt der Rolle anon das Spalten-Leserecht zurueck, genau die Spalten, die
-- Suche und oeffentliches Profil anzeigen (wortgleich zur Migration vom
-- 19.09.2026).
GRANT SELECT (id, created_at, vorname, nachname, stadt, plz, trainingsart,
              erfahrung, spezialisierungen, bio, preis_stunde, preis_monat,
              zertifikate, calendly, avatar_url, aktiv)
  ON public.trainers TO anon;

-- Stellt die Regel wieder her, die der Rolle anon das Lesen ausschliesslich
-- freigeschalteter Trainer erlaubt.
CREATE POLICY "trainers_oeffentlich_nur_aktive"
  ON public.trainers FOR SELECT TO anon
  USING (aktiv = true);
