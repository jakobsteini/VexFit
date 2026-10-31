-- ============================================================================
-- Rueckbau zu 2026-10-31-08-studio-adresse-bearbeiten.sql.
-- NICHT EINGESPIELT. Entfernt die Bearbeiten-Funktion und setzt
-- studios_admin_liste auf den Stand von 2026-10-31-06 zurueck (ohne 'land').
-- ============================================================================

DROP FUNCTION IF EXISTS public.standort_admin_bearbeiten(uuid, text, text, text, text, text);

-- studios_admin_liste zurueck auf den Stand von 2026-10-31-06 (Standort ohne 'land').
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
