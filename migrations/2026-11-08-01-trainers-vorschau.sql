-- ============================================================================
-- Vexfit – Strenge oeffentliche Vorschau-Sicht (Dauerlauf 07./08.11.2026, S1)
-- Erzeugt am 08.11.2026. NICHT eingespielt (nur Datei).
--
-- WARUM:
-- Mit eingeschalteter OEFFENTLICHE_VORSCHAU sehen NICHT angemeldete Besucher
-- Trainerkarten. Die bestehende Sicht public.trainers_oeffentlich enthaelt den
-- vollen NACHNAMEN und preis_monat und filtert nur aktiv = true. Fuer die
-- oeffentliche Vorschau wird eine STRENGERE Sicht gebraucht, die
--   - KEINEN vollen Nachnamen ausliefert (nur die Initiale, serverseitig
--     gebildet – der volle Nachname verlaesst die Datenbank nie),
--   - nur den Stundenpreis zeigt (kein preis_monat),
--   - nur freigeschaltete UND nicht gesperrte Trainer enthaelt.
--
-- AUSDRUECKLICH NICHT ENTHALTEN: nachname (voll), email, telefon, user_id,
-- preis_monat, erfahrung, zertifikate, calendly, stripe_bezahlt, alert_sent.
--
-- security_invoker = false (wie trainers_oeffentlich): die Sicht laeuft mit den
-- Rechten des Eigentuemers, damit der Abruf durch anon nicht an den fehlenden
-- Rechten von anon auf der Basistabelle public.trainers scheitert.
--
-- ABHAENGIGKEIT: die Spalten land, sprachen, trainingsorte, verifiziert,
-- verfuegbarkeit, gesperrt werden bereits vom angemeldeten Suchpfad gelesen und
-- sind damit live vorhanden. ist_test wird hier BEWUSST NICHT gefiltert, um
-- keine harte Abhaengigkeit zu 2026-11-06-02 zu schaffen; Test/Spam-Konten
-- werden ueber gesperrt bzw. nicht-aktiv aus der Vorschau gehalten.
--
-- Mehrfach ausfuehrbar (CREATE OR REPLACE VIEW).
-- RUECKNAHME: migrations/ruecknahmen/2026-11-08-01-trainers-vorschau-ruecknahme.sql
-- ============================================================================

CREATE OR REPLACE VIEW public.trainers_vorschau
  WITH (security_invoker = false) AS
  SELECT
    id,
    vorname,
    -- NUR die Initiale, serverseitig gebildet (voller Nachname bleibt in der DB).
    CASE
      WHEN nachname IS NOT NULL AND length(btrim(nachname)) > 0
      THEN upper(left(btrim(nachname), 1)) || '.'
      ELSE ''
    END AS nachname_initial,
    stadt,
    plz,
    land,
    trainingsart,
    trainingsort,
    trainingsorte,
    spezialisierungen,
    sprachen,
    bio,
    preis_stunde,
    avatar_url,
    verifiziert,
    verfuegbarkeit,
    created_at
  FROM public.trainers
  WHERE aktiv = true AND gesperrt IS NOT TRUE;

COMMENT ON VIEW public.trainers_vorschau IS
  'Strenge oeffentliche Vorschau (OEFFENTLICHE_VORSCHAU an): nur freigeschaltete, nicht gesperrte Trainer; nur Vorname + Initiale, Stundenpreis, Schwerpunkte, Ort, Foto. KEIN voller Nachname, keine Kontaktdaten, kein Monatspreis.';

GRANT SELECT ON public.trainers_vorschau TO anon, authenticated;
