-- ============================================================================
-- Vexfit - Trainerprofile oeffentlich sichtbar machen (ohne Anmeldung)
-- Erzeugt am 26.10.2026. NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie legt die Sicht public.trainers_oeffentlich an. Die Sicht liefert NUR die
-- fuer eine oeffentliche Trainersuche unbedenklichen Spalten und NUR Zeilen
-- freigeschalteter Trainer (aktiv = true). So koennen auch nicht angemeldete
-- Besucher die Profile sehen; die Kontaktaufnahme bleibt angemeldeten Nutzern
-- vorbehalten (das entscheidet die Seite, nicht die Datenbank).
--
-- WARUM EINE SICHT STATT EINER NEUEN TABELLENREGEL:
-- Seit 2026-10-12 darf die Rolle anon public.trainers nicht mehr lesen (weder
-- per Policy noch per Spaltenrecht). Diese Entziehung bleibt ABSICHTLICH
-- bestehen: Wer den oeffentlichen Schluessel aus dem Quelltext kopiert, soll
-- weiterhin NICHT die ganze Trainertabelle (mit E-Mail, Telefon, user_id)
-- abrufen koennen. Die Sicht gibt nur den unbedenklichen Ausschnitt frei.
--
-- SICHERHEITSKONTEXT security_invoker = false:
-- Die Sicht wird mit security_invoker = false angelegt (das ist auch der
-- Postgres-Standard, hier aber bewusst ausgeschrieben). Sie laeuft damit mit
-- den Rechten ihres Eigentuemers und NICHT mit denen des Aufrufers. Nur so
-- scheitert der Abruf durch anon nicht an den fehlenden Rechten von anon auf
-- der Basistabelle public.trainers.
--
-- SPALTEN - WICHTIGER HINWEIS ZUM PREIS:
-- Die Aufgabe nennt eine Spalte "preis". Eine Spalte mit genau diesem Namen
-- gibt es in public.trainers NICHT. Die realen Preisspalten heissen
-- preis_stunde und preis_monat; beide standen bereits vor dem 2026-10-12 in der
-- oeffentlichen Spaltenfreigabe fuer anon (siehe 2026-09-19-zugriffsregeln-
-- neuaufbau.sql) und sind damit als oeffentlich unbedenklich eingestuft. Es
-- wird deshalb KEINE Spalte "preis" erfunden, sondern genau diese zwei echten
-- Preisspalten aufgenommen.
--
-- AUSDRUECKLICH NICHT ENTHALTEN:
-- email, telefon, user_id, created_at - und alles andere, was in public.trainers
-- sonst steht (erfahrung, zertifikate, calendly, preis_online, stripe_bezahlt,
-- alert_sent, aktiv). Enthalten sind ausschliesslich die unten aufgefuehrten
-- Spalten.
--
-- WAS UNANGETASTET BLEIBT:
-- Die bestehenden Rechte und Policies auf public.trainers werden NICHT
-- geaendert. anon darf die Tabelle weiterhin nicht lesen. Es wird nur die neue
-- Sicht angelegt und das Leserecht darauf vergeben.
--
-- RUECKNAHME: 2026-10-26-oeffentliche-trainer-ruecknahme.sql entfernt genau
-- diese Sicht wieder und nichts sonst.
-- ============================================================================

-- Legt die oeffentliche Sicht an: nur unbedenkliche Spalten, nur freigeschaltete
-- Trainer. security_invoker = false, damit der Abruf nicht an den fehlenden
-- Rechten von anon auf der Basistabelle scheitert.
CREATE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id,
    vorname,
    nachname,
    stadt,
    plz,
    trainingsart,
    trainingsort,
    spezialisierungen,
    bio,
    preis_stunde,
    preis_monat,
    avatar_url
  FROM public.trainers
  WHERE aktiv = true;

-- Beschreibt den Zweck der Sicht fuer spaetere Leser im Datenbankschema.
COMMENT ON VIEW public.trainers_oeffentlich IS
  'Oeffentlich sichtbare Trainerprofile (nur aktiv = true, nur unbedenkliche Spalten, keine Kontaktdaten). Fuer die Trainersuche ohne Anmeldung.';

-- Gibt der oeffentlichen Rolle und angemeldeten Nutzern das Leserecht auf die
-- Sicht. Die Basistabelle public.trainers bleibt fuer anon weiterhin gesperrt.
GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;
