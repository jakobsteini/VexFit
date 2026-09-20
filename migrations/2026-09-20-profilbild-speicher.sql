-- ============================================================================
-- Vexfit - Speicher-Zugriffsregeln fuer das Trainer-Profilbild
-- Erzeugt am 20.09.2026. NICHT eingespielt.
--
-- WARUM DIESE DATEI:
-- Trainer koennen im Trainerbereich ein Profilbild hochladen. Die Spalte
-- trainers.avatar_url existiert bereits (am 20.09.2026 live geprueft), es
-- fehlt aber der Ablageort: Im Supabase Storage gibt es noch keinen einzigen
-- Behaelter. Diese Datei legt die Zugriffsregeln fuer den kuenftigen
-- Behaelter fest. Den Behaelter selbst legt Jakob im Dashboard an, siehe
-- Kasten unten - per SQL wird hier bewusst KEIN Behaelter erzeugt.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ VON HAND IM SUPABASE-DASHBOARD ANLEGEN (Storage -> New bucket):          │
-- │   Name:                avatars                                           │
-- │   Public bucket:       AN (Bilder sind in Suche und Profil oeffentlich)  │
-- │   File size limit:     5 MB                                              │
-- │   Allowed MIME types:  image/jpeg, image/png, image/webp                 │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- REIHENFOLGE: Erst diese Datei einspielen, dann den Behaelter anlegen, dann
-- den Code pushen. Die Reihenfolge ist nicht kritisch: Solange etwas fehlt,
-- schlaegt nur der Upload mit einer verstaendlichen Meldung fehl, und die
-- Seiten zeigen weiter die Initialen.
--
-- Die Regeln unten liegen auf storage.objects (dort ist der Zeilenschutz bei
-- Supabase von Haus aus an). Sie erlauben einem angemeldeten Nutzer genau
-- einen Ordner: den mit seiner eigenen Nutzer-Kennung. Der Code legt das Bild
-- unter <nutzer-kennung>/avatar.<endung> ab. Oeffentliches Lesen laeuft ueber
-- den Public-Schalter des Behaelters und braucht keine eigene Regel.
-- ============================================================================

-- Hochladen: nur in den eigenen Ordner des angemeldeten Nutzers.
DROP POLICY IF EXISTS "avatars_hochladen_eigener_ordner" ON storage.objects;
CREATE POLICY "avatars_hochladen_eigener_ordner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text);

-- Ersetzen: der Upload im Code faehrt mit x-upsert, ein zweiter Upload
-- ueberschreibt also das alte Bild. Dafuer braucht es das Aenderungsrecht.
DROP POLICY IF EXISTS "avatars_ersetzen_eigener_ordner" ON storage.objects;
CREATE POLICY "avatars_ersetzen_eigener_ordner"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars'
     AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text);

-- Eigenes lesen: das Ueberschreiben per x-upsert muss die vorhandene Zeile
-- des eigenen Bildes finden koennen.
DROP POLICY IF EXISTS "avatars_lesen_eigener_ordner" ON storage.objects;
CREATE POLICY "avatars_lesen_eigener_ordner"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars'
     AND (storage.foldername(name))[1] = auth.uid()::text);

-- Kein DELETE: ein Trainer ersetzt sein Bild, loeschen kann nur Jakob im
-- Dashboard. Damit kann ueber den oeffentlichen Schluessel nichts entfernt
-- werden.

-- Hinweis zu den anderen Bausteinen dieser Sitzung: Die Tabelle anfragen hat
-- die Spalte status bereits (am 20.09.2026 live geprueft), und das
-- Aenderungsrecht des Trainers darauf stammt aus der Datei
-- 2026-09-19-zugriffsregeln-neuaufbau.sql. Fuer Annehmen/Ablehnen und die
-- Startseiten-Uebersicht ist deshalb KEINE weitere Datenbankaenderung noetig.
