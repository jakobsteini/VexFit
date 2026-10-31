-- ============================================================================
-- Vexfit - Mindeststaerke fuer die Sichtbarkeit in der Suche (Baustein 3c)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-02.
--
-- GESCHAEFTSREGEL: Ein Profil erscheint nur dann in der oeffentlichen Suche,
-- wenn es die Mindeststaerke erreicht - Foto UND Spezialisierung UND Kurztext -
-- zusaetzlich zur Freigabe (aktiv = true). Unfertige Profile wirken schlecht und
-- bekommen kaum Anfragen; der Trainer sieht im Trainerbereich klar, was fehlt
-- (Profilstaerke-Karte).
--
-- WAS DIESE DATEI TUT:
-- Sie setzt die oeffentliche Sicht trainers_oeffentlich mit CREATE OR REPLACE
-- neu - gleiche Spalten wie 2026-10-31-02, aber mit strengerer Bedingung:
--   avatar_url gesetzt UND bio nicht leer UND mindestens eine Spezialisierung.
-- Die angemeldete Suche (liest die Tabelle direkt) filtert zusaetzlich auf der
-- Seite nach derselben Mindeststaerke; die Datenbank-Bedingung hier schuetzt
-- den oeffentlichen (anonymen) Zugriff.
--
-- WICHTIG: Studio-Seiten (john-harris) nutzen die Funktion studio_anzeigen und
-- sind von dieser Sicht NICHT betroffen - dort entscheidet der Studio-Kontext.
--
-- RUECKNAHME: 2026-10-31-03-mindeststaerke-ruecknahme.sql setzt die Sicht auf
-- den Stand von 2026-10-31-02 zurueck (nur aktiv = true).
-- ============================================================================

CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie
  FROM public.trainers
  WHERE aktiv = true
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND length(btrim(bio)) > 0
    AND spezialisierungen IS NOT NULL AND array_length(spezialisierungen, 1) >= 1;

GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;
