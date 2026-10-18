-- ============================================================================
-- Vexfit - Neue Spalte "trainingsort" in der Tabelle trainers
-- Erzeugt am 18.10.2026. NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie legt in public.trainers die Spalte trainingsort an. Sie haelt fest, wo
-- ein Trainer anbietet: 'vor_ort', 'online' oder 'beides'. Leer (NULL) heisst:
-- der Trainer hat noch nicht geantwortet. Bestehende Zeilen bekommen KEINEN
-- Wert gesetzt; aus der Trainingsart wird nichts abgeleitet.
--
-- RECHTE (geprueft an 2026-09-19-zugriffsregeln-neuaufbau.sql):
-- - authenticated hat dort SELECT, INSERT und UPDATE auf Tabellenebene auf
--   trainers (Zeile 102). Damit koennen angemeldete Nutzer die neue Spalte
--   lesen, die Profilbearbeitung sie schreiben - ohne zusaetzliches Recht.
-- - anon hat INSERT nur auf eine feste Spaltenliste (Zeile 95-98). Damit die
--   Registrierung die neue Spalte mitschreiben kann (sie laeuft als anon, wenn
--   die Anmeldung noch kein Token liefert), wird anon INSERT genau auf diese
--   eine neue Spalte zusaetzlich erteilt. Keine bestehende Regel wird geaendert.
--   anon liest trainers seit 2026-10-12 nicht mehr, daher kein SELECT-Recht.
--
-- RUECKNAHME: 2026-10-18-trainingsort-ruecknahme.sql entfernt genau das wieder.
-- ============================================================================

-- Legt die neue Spalte fuer den Ort des Trainings an; bestehende Zeilen bleiben leer (noch nicht geantwortet).
ALTER TABLE public.trainers ADD COLUMN trainingsort text;

-- Laesst in der Spalte nur die drei erlaubten Werte zu; leer (NULL) bleibt erlaubt und bedeutet "noch nicht geantwortet".
ALTER TABLE public.trainers ADD CONSTRAINT trainers_trainingsort_werte CHECK (trainingsort IS NULL OR trainingsort IN ('vor_ort', 'online', 'beides'));

-- Erlaubt der Rolle anon, die neue Spalte bei der Registrierung mitzuschreiben; angemeldete Nutzer schreiben sie bereits ueber ihr Tabellenrecht.
GRANT INSERT (trainingsort) ON public.trainers TO anon;
