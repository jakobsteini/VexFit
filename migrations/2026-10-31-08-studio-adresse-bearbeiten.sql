-- ============================================================================
-- Vexfit - Studio-Standort bearbeiten im Admin (Baustein 7, Nachtrag)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-06
-- (die Admin-Funktionen) - die Zeitplan-Migration 07 ist unabhaengig davon.
--
-- WAS DIESE DATEI TUT:
--   1. Neue SECURITY-DEFINER-Funktion standort_admin_bearbeiten(...): der Admin
--      kann Name und Adresse (stadt/adresse/plz/land) eines bestehenden
--      Standorts aendern. Bisher ging Anlegen (2026-10-31-06), aber Aendern nur
--      per SQL. Damit sind z. B. die John-Harris-Adressen ("HIER EINFÜGEN")
--      ohne SQL-Editor pflegbar.
--   2. studios_admin_liste() wird erweitert: der Standort traegt jetzt auch
--      'land' mit, damit der Bearbeiten-Dialog es vorbelegen kann. Sonst
--      unveraendert gegenueber 2026-10-31-06.
--
-- Wie bei den anderen Admin-Funktionen: Pruefung ueber public.ist_vexfit_admin(),
-- kein Tabellenrecht auf studio_standorte (siehe 2026-10-31-01). Leere Felder
-- ueberschreiben nichts (COALESCE/NULLIF) - ein abgebrochenes Feld im Dialog
-- laesst den alten Wert stehen.
--
-- RUECKNAHME: 2026-10-31-08-studio-adresse-bearbeiten-ruecknahme.sql entfernt
-- die neue Funktion und setzt studios_admin_liste auf den Stand von
-- 2026-10-31-06 zurueck (ohne 'land').
-- ============================================================================

-- --------------------------- Standort bearbeiten ----------------------------
-- Aendert einen bestehenden Standort (nur Admin). Jedes Feld ist optional:
-- ein leerer/NULLer Wert laesst den bisherigen stehen, damit der Dialog nur
-- das aendert, was der Admin wirklich eingibt.
CREATE OR REPLACE FUNCTION public.standort_admin_bearbeiten(
  p_standort_id uuid,
  p_name text DEFAULT NULL, p_stadt text DEFAULT NULL, p_adresse text DEFAULT NULL,
  p_plz text DEFAULT NULL, p_land text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.ist_vexfit_admin() THEN RETURN false; END IF;
  UPDATE public.studio_standorte SET
    name    = COALESCE(NULLIF(btrim(p_name),    ''), name),
    stadt   = COALESCE(NULLIF(btrim(p_stadt),   ''), stadt),
    adresse = COALESCE(NULLIF(btrim(p_adresse), ''), adresse),
    plz     = COALESCE(NULLIF(btrim(p_plz),     ''), plz),
    land    = COALESCE(NULLIF(btrim(p_land),    ''), land)
  WHERE id = p_standort_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.standort_admin_bearbeiten(uuid, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.standort_admin_bearbeiten(uuid, text, text, text, text, text) TO authenticated;

-- --------------------- studios_admin_liste um 'land' ------------------------
-- Wortgleich mit 2026-10-31-06, nur der Standort traegt zusaetzlich 'land'.
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
          'stadt', st.stadt, 'adresse', st.adresse, 'plz', st.plz, 'land', st.land,
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
