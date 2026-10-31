-- ============================================================================
-- Vexfit - Profil-Upgrade fuer Trainer (Baustein 2)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-01.
--
-- WAS DIESE DATEI TUT (nur neue Spalten, zwei Storage-Behaelter, Rechte):
--   trainers.video_url      text   - Link zu YouTube/Instagram/TikTok (Einbettung)
--   trainers.sprachen       text[] - Sprachen des Trainers (Mehrfachauswahl)
--   trainers.trainingsorte  text[] - Studio/Outdoor/beim Kunden/Online (mehrfach)
--   trainers.galerie        text[] - bis zu 6 Bild-Adressen (Behaelter 'galerie')
--   trainers.zertifikat_datei text - EINE hochgeladene Datei (Behaelter 'zertifikate'),
--                                     nur fuer den Admin sichtbar (Verifizierung).
--
-- WARUM zusaetzlich zu trainings o r t (Singular, bestehend):
-- Die bestehende Spalte trainings_ort ('vor_ort'/'online'/'beides') aus dem
-- gefuehrten Einstieg bleibt unveraendert. Baustein 2 will eine GENAUERE
-- Mehrfachauswahl (Studio, Outdoor, beim Kunden zuhause, Online) - das ist die
-- neue Spalte trainingsorte (Plural). Die alte Spalte wird nicht entfernt, damit
-- nichts Bestehendes bricht.
--
-- RECHTE:
-- - authenticated darf die neuen Profilspalten der EIGENEN Zeile aendern. Die
--   UPDATE-Freigabe wurde in 2026-10-26-01 auf bestimmte Spalten eingegrenzt;
--   die neuen Spalten werden hier einzeln ergaenzt (video_url, sprachen,
--   trainingsorte, galerie, zertifikat_datei).
-- - anon darf sie bei der Registrierung NICHT setzen (werden erst im Profil
--   gepflegt) - kein INSERT-Recht fuer anon.
-- - Die oeffentliche Sicht trainers_oeffentlich bekommt die unbedenklichen
--   neuen Spalten (video_url, sprachen, trainingsorte, galerie). zertifikat_datei
--   bleibt bewusst DRAUSSEN (nur Admin).
--
-- STORAGE:
-- - Behaelter 'galerie' (oeffentlich lesbar): Trainer laedt in seinen eigenen
--   Ordner <user_id>/... ; nur der Eigentuemer darf schreiben/loeschen.
-- - Behaelter 'zertifikate' (privat): nur der Eigentuemer und der Admin duerfen
--   lesen; nur der Eigentuemer darf schreiben. Muster wie der bestehende
--   avatars-Behaelter (2026-09-20-profilbild-speicher.sql).
--
-- RUECKNAHME: 2026-10-31-02-profil-upgrade-ruecknahme.sql entfernt alles.
-- ============================================================================

-- ------------------------------- Spalten ------------------------------------
ALTER TABLE public.trainers ADD COLUMN video_url        text;
ALTER TABLE public.trainers ADD COLUMN sprachen         text[];
ALTER TABLE public.trainers ADD COLUMN trainingsorte    text[];
ALTER TABLE public.trainers ADD COLUMN galerie          text[];
ALTER TABLE public.trainers ADD COLUMN zertifikat_datei text;

COMMENT ON COLUMN public.trainers.video_url IS 'Link zu YouTube/Instagram/TikTok, im Profil eingebettet. Pruefung in der Seite.';
COMMENT ON COLUMN public.trainers.galerie IS 'Bis zu 6 Bild-Adressen aus dem Storage-Behaelter galerie (verkleinert hochgeladen).';
COMMENT ON COLUMN public.trainers.zertifikat_datei IS 'Adresse einer hochgeladenen Zertifikatsdatei (Behaelter zertifikate, privat). Nur Admin sieht sie.';

-- ------------------------------- Rechte -------------------------------------
-- Neue Profilspalten der eigenen Zeile aenderbar (ergaenzt 2026-10-26-01).
GRANT UPDATE (video_url, sprachen, trainingsorte, galerie, zertifikat_datei)
  ON public.trainers TO authenticated;

-- --------------------- Oeffentliche Sicht erweitern -------------------------
-- CREATE OR REPLACE kann der bestehenden Sicht Spalten am Ende hinzufuegen.
-- zertifikat_datei und alle Kontaktdaten bleiben weiterhin DRAUSSEN.
CREATE OR REPLACE VIEW public.trainers_oeffentlich
  WITH (security_invoker = false) AS
  SELECT
    id, vorname, nachname, stadt, plz, trainingsart, trainingsort,
    spezialisierungen, bio, preis_stunde, preis_monat, avatar_url,
    video_url, sprachen, trainingsorte, galerie
  FROM public.trainers
  WHERE aktiv = true;

GRANT SELECT ON public.trainers_oeffentlich TO anon, authenticated;

-- ------------------------------- Storage ------------------------------------
-- Zwei Behaelter. INSERT ohne Fehler bei Wiederholung (ON CONFLICT).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('galerie', 'galerie', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('zertifikate', 'zertifikate', false)
  ON CONFLICT (id) DO NOTHING;

-- galerie: jeder darf lesen (oeffentlicher Behaelter); schreiben/aendern/loeschen
-- nur im eigenen Ordner (erster Pfadteil = eigene user_id).
CREATE POLICY "galerie_oeffentlich_lesen"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'galerie');
CREATE POLICY "galerie_eigene_schreiben"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'galerie' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "galerie_eigene_aendern"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'galerie' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "galerie_eigene_loeschen"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'galerie' AND (storage.foldername(name))[1] = auth.uid()::text);

-- zertifikate: privat. Lesen nur Eigentuemer ODER Admin; schreiben/loeschen nur
-- Eigentuemer. ist_vexfit_admin() stammt aus 2026-09-20-admin-vollzugriff.sql.
CREATE POLICY "zertifikate_eigene_oder_admin_lesen"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'zertifikate'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.ist_vexfit_admin()));
CREATE POLICY "zertifikate_eigene_schreiben"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'zertifikate' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "zertifikate_eigene_loeschen"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'zertifikate' AND (storage.foldername(name))[1] = auth.uid()::text);
