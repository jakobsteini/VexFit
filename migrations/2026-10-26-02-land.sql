-- ============================================================================
-- Vexfit - Spalte "land" in trainers und kunden
-- Erzeugt am 26.10.2026. NICHT eingespielt. Reihenfolge: nach 01.
--
-- WARUM:
-- Die PLZ-Aufloesung (api.zippopotam.us) fragte bisher immer at, de, ch in
-- dieser Reihenfolge ab. Vierstellige PLZ, die es in AT und CH gibt (z. B. 6300
-- Woergl/Zug), wurden immer oesterreichisch aufgeloest. Mit einer gespeicherten
-- Landangabe kann die Suche gezielt nur dieses Land abfragen.
--
-- WAS DIESE DATEI TUT:
-- - Spalte land (text) in trainers und kunden; erlaubt 'AT','DE','CH' oder leer
--   (NULL = noch nicht gesetzt).
-- - Freigabe fuer die eigene Registrierung (INSERT) fuer anon auf beiden
--   Tabellen. Fuer authenticated ist INSERT tabellenweit bereits erlaubt
--   (2026-09-19-zugriffsregeln-neuaufbau.sql:102/145) und bleibt unveraendert.
-- - trainers.land zusaetzlich per Profiländerung aenderbar: Spalte in die
--   UPDATE-Freigabe fuer authenticated aufnehmen (die 2026-10-26-01 auf
--   Profilspalten eingegrenzt hat). profil-bearbeiten.html aendert die PLZ und
--   speichert dabei land mit.
--   kunden.land wird nur bei der Registrierung gesetzt; es gibt keine
--   Kunden-Profilseite, die die PLZ aendert - daher keine eigene UPDATE-Freigabe.
--
-- RUECKNAHME: 2026-10-26-02-land-ruecknahme.sql entfernt genau das wieder.
-- ============================================================================

-- Neue Spalten; bestehende Zeilen bleiben leer (noch nicht gesetzt).
ALTER TABLE public.trainers ADD COLUMN land text;
ALTER TABLE public.kunden   ADD COLUMN land text;

-- Nur die drei erlaubten Werte zulassen; leer (NULL) bleibt erlaubt.
ALTER TABLE public.trainers
  ADD CONSTRAINT trainers_land_werte CHECK (land IS NULL OR land IN ('AT','DE','CH'));
ALTER TABLE public.kunden
  ADD CONSTRAINT kunden_land_werte CHECK (land IS NULL OR land IN ('AT','DE','CH'));

-- Registrierung (laeuft als anon, wenn die Anmeldung noch kein Token liefert)
-- darf land mitschreiben.
GRANT INSERT (land) ON public.trainers TO anon;
GRANT INSERT (land) ON public.kunden   TO anon;

-- trainers.land per Profiländerung aenderbar (ergaenzt die eingegrenzte
-- UPDATE-Freigabe aus 2026-10-26-01).
GRANT UPDATE (land) ON public.trainers TO authenticated;
