-- ============================================================================
-- Vexfit - RUECKNAHME der Speicher-Zugriffsregeln fuer das Trainer-Profilbild
-- Gehoert zu 2026-09-20-profilbild-speicher.sql. NICHT eingespielt.
--
-- Nimmt die drei Regeln auf storage.objects wieder weg. Danach kann kein
-- Trainer mehr ein Bild hochladen oder ersetzen; bereits hochgeladene Bilder
-- bleiben im Behaelter liegen und sind weiter oeffentlich abrufbar, solange
-- der Behaelter besteht.
--
-- Den Behaelter selbst entfernt Jakob bei Bedarf im Dashboard
-- (Storage -> avatars -> Delete bucket); per SQL passiert das hier bewusst
-- nicht.
-- ============================================================================

DROP POLICY IF EXISTS "avatars_hochladen_eigener_ordner" ON storage.objects;
DROP POLICY IF EXISTS "avatars_ersetzen_eigener_ordner"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_lesen_eigener_ordner"     ON storage.objects;

-- Gespeicherte Bildadressen leeren, damit die Seiten wieder die Initialen
-- zeigen und nicht auf Bilder eines geloeschten Behaelters verweisen.
UPDATE public.trainers SET avatar_url = NULL WHERE avatar_url IS NOT NULL;
