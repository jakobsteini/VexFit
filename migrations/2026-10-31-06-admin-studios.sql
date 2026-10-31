-- ============================================================================
-- Vexfit - Admin-Funktionen fuer Studios (Baustein 7)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-05.
--
-- WAS DIESE DATEI TUT:
-- Vier SECURITY-DEFINER-Funktionen, die NUR das Admin-Konto nutzen darf
-- (Pruefung ueber public.ist_vexfit_admin()). Damit kann der Admin Studios und
-- Standorte lesen (inkl. der geheimen Schluessel - fuer die Links), neue anlegen
-- und die Veroeffentlichung umschalten. Die Studio-Tabellen bleiben sonst ohne
-- Tabellenrechte (siehe 2026-10-31-01).
--
--   studios_admin_liste()                 - alle Studios + Standorte mit allen
--                                           Schluesseln und Trainerzahl.
--   studio_admin_anlegen(slug, name)      - neues Studio.
--   standort_admin_anlegen(...)           - neuer Standort zu einem Studio.
--   studio_admin_freigabe(studio_id, an)  - veroeffentlicht setzen/zuruecknehmen.
--
-- Jede Funktion prueft ist_vexfit_admin() und tut sonst nichts (bzw. liefert
-- NULL). So ist der Zugriff an genau ein Konto gebunden - serverseitig.
--
-- RUECKNAHME: 2026-10-31-06-admin-studios-ruecknahme.sql entfernt die vier
-- Funktionen.
-- ============================================================================

-- Alle Studios mit Standorten und Schluesseln (nur Admin).
CREATE OR REPLACE FUNCTION public.studios_admin_liste()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.ist_vexfit_admin() THEN RETURN NULL; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'slug', s.slug,
      'name', s.name,
      'veroeffentlicht', s.veroeffentlicht,
      'vorschau_schluessel', s.vorschau_schluessel,
      'uebersicht_schluessel', s.uebersicht_schluessel,
      'standorte', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', st.id, 'slug', st.slug, 'name', st.name,
          'stadt', st.stadt, 'adresse', st.adresse, 'plz', st.plz,
          'einladungs_schluessel', st.einladungs_schluessel,
          'trainer_anzahl', (SELECT count(*) FROM public.trainers t WHERE t.studio_standort_id = st.id)
        ) ORDER BY st.erstellt_am)
        FROM public.studio_standorte st WHERE st.studio_id = s.id
      ), '[]'::jsonb)
    ) ORDER BY s.erstellt_am)
    FROM public.studios s
  ), '[]'::jsonb);
END;
$$;

-- Neues Studio anlegen (nur Admin). Gibt die neue Kennung zurueck oder NULL.
CREATE OR REPLACE FUNCTION public.studio_admin_anlegen(p_slug text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.ist_vexfit_admin() THEN RETURN NULL; END IF;
  INSERT INTO public.studios (slug, name) VALUES (p_slug, p_name) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Neuen Standort zu einem Studio anlegen (nur Admin).
CREATE OR REPLACE FUNCTION public.standort_admin_anlegen(
  p_studio_id uuid, p_slug text, p_name text,
  p_stadt text DEFAULT NULL, p_adresse text DEFAULT NULL, p_plz text DEFAULT NULL, p_land text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.ist_vexfit_admin() THEN RETURN NULL; END IF;
  INSERT INTO public.studio_standorte (studio_id, slug, name, stadt, adresse, plz, land)
    VALUES (p_studio_id, p_slug, p_name, p_stadt, p_adresse, p_plz, p_land)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Veroeffentlichung eines Studios umschalten (nur Admin).
CREATE OR REPLACE FUNCTION public.studio_admin_freigabe(p_studio_id uuid, p_an boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.ist_vexfit_admin() THEN RETURN false; END IF;
  UPDATE public.studios SET veroeffentlicht = p_an WHERE id = p_studio_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.studios_admin_liste() FROM public, anon;
REVOKE ALL ON FUNCTION public.studio_admin_anlegen(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.standort_admin_anlegen(uuid, text, text, text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.studio_admin_freigabe(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.studios_admin_liste() TO authenticated;
GRANT EXECUTE ON FUNCTION public.studio_admin_anlegen(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.standort_admin_anlegen(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.studio_admin_freigabe(uuid, boolean) TO authenticated;
