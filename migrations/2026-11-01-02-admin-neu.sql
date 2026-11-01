-- ============================================================================
-- Vexfit – Admin-Dashboard neu, Teil 3: „Kicken" (endgültig löschen)
-- Erzeugt am 01.11.2026. NICHT eingespielt (nur Datei).
--
-- Enthält:
--   1. admin_protokoll.ergebnis: eine Spalte für das Ergebnis jeder Aktion
--      (z. B. "geaendert=1"). Keine Klartext-Personendaten. Die Basistabelle
--      kommt aus 2026-10-31-09; hier idempotent abgesichert.
--   2. admin_person_kicken(p_art, p_id): löscht in EINER Transaktion die Person
--      und ihre eigenen Daten und gibt die Trefferzahlen als JSON zurück.
--      Aufgerufen wird sie ausschließlich von der Edge Function mit service_role
--      (dort sind Admin-Konto und zweiter Faktor aal2 bereits geprüft). Deshalb
--      hat NUR service_role das Ausführungsrecht – anon/authenticated nicht.
--
-- Was gelöscht wird:
--   Trainer:  anfragen (trainer_id) + die trainers-Zeile.
--   Kunde:    anfragen (kunden_email) + trainer_alerts (kunden_email) +
--             warteliste (user_id) + die kunden-Zeile.
--   Die Speicher-Dateien (Avatar/Galerie/Zertifikat) und das Anmeldekonto
--   (auth.users) löscht die Edge Function selbst – das geht nicht in SQL.
--
-- GESETZLICHE AUFBEWAHRUNG (Österreich, 7 Jahre): Buchhaltungs-/Zahlungsdaten
--   dürfen NICHT gelöscht, sondern nur anonymisiert werden. In der Vexfit-DB
--   gibt es KEINE eigene Tabelle mit personenbezogenen Zahlungs-/Rechnungsdaten:
--   Zahlungen liegen bei Stripe, und das Ereignisprotokoll
--   stripe_events_verarbeitet enthält keine Personendaten (nur event_id, typ,
--   Zeitpunkt) – es bleibt daher absichtlich unangetastet. Entsteht künftig eine
--   Rechnungs-/Zahlungstabelle mit Personenbezug, muss diese Funktion um deren
--   Anonymisierung erweitert werden (dann zahlungen_anonymisiert hochzählen).
--
-- Alles ist mehrfach ausführbar (IF NOT EXISTS, CREATE OR REPLACE).
-- RÜCKNAHME: 2026-11-01-02-admin-neu-ruecknahme.sql.
-- ============================================================================

-- 1. Ergebnis-Spalte im Protokoll ------------------------------------------
-- Basistabelle idempotent sichern (falls 2026-10-31-09 noch nicht eingespielt).
CREATE TABLE IF NOT EXISTS public.admin_protokoll (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zeitpunkt    timestamptz NOT NULL DEFAULT now(),
  admin_id     uuid,
  aktion       text NOT NULL,
  ziel_tabelle text,
  ziel_id      text
);
ALTER TABLE public.admin_protokoll ADD COLUMN IF NOT EXISTS ergebnis text;

-- 2. Kick-Funktion ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_person_kicken(p_art text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email        text;
  v_user         uuid;
  c_anfragen     integer := 0;
  c_alerts       integer := 0;
  c_warteliste   integer := 0;
  c_person       integer := 0;
BEGIN
  -- Die gesamte Funktion läuft in EINER Transaktion: schlägt ein DELETE fehl,
  -- wird alles zurückgerollt – es bleibt kein halber Zustand.
  IF p_art = 'trainer' THEN
    DELETE FROM public.anfragen WHERE trainer_id = p_id;
    GET DIAGNOSTICS c_anfragen = ROW_COUNT;

    DELETE FROM public.trainers WHERE id = p_id;
    GET DIAGNOSTICS c_person = ROW_COUNT;

  ELSIF p_art = 'kunde' THEN
    SELECT email, user_id INTO v_email, v_user FROM public.kunden WHERE id = p_id;

    IF v_email IS NOT NULL THEN
      DELETE FROM public.anfragen WHERE lower(kunden_email) = lower(v_email);
      GET DIAGNOSTICS c_anfragen = ROW_COUNT;

      -- trainer_alerts: Benachrichtigungswunsch des Kunden (kunden_email).
      IF to_regclass('public.trainer_alerts') IS NOT NULL THEN
        DELETE FROM public.trainer_alerts WHERE lower(kunden_email) = lower(v_email);
        GET DIAGNOSTICS c_alerts = ROW_COUNT;
      END IF;
    END IF;

    IF v_user IS NOT NULL AND to_regclass('public.warteliste') IS NOT NULL THEN
      DELETE FROM public.warteliste WHERE user_id = v_user;
      GET DIAGNOSTICS c_warteliste = ROW_COUNT;
    END IF;

    DELETE FROM public.kunden WHERE id = p_id;
    GET DIAGNOSTICS c_person = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'admin_person_kicken: unbekannte art %', p_art;
  END IF;

  RETURN jsonb_build_object(
    'anfragen',               c_anfragen,
    'alerts',                 c_alerts,
    'warteliste',             c_warteliste,
    'person',                 c_person,
    -- Keine personenbezogene Zahlungstabelle vorhanden (siehe Kopf). Bleibt 0,
    -- bis es eine solche Tabelle gibt und diese Funktion erweitert wird.
    'zahlungen_anonymisiert', 0
  );
END;
$$;

-- Nur die Edge Function (service_role) darf kicken. Niemand sonst.
REVOKE ALL ON FUNCTION public.admin_person_kicken(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_person_kicken(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_person_kicken(text, uuid) TO service_role;
