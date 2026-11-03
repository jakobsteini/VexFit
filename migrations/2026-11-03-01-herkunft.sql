-- ============================================================================
-- Vexfit – B3: Herkunft (Werbekanal) je Registrierung speichern
-- Erzeugt am 03.11.2026. NICHT eingespielt (nur Datei).
--
-- Bisher wurden utm_source/utm_campaign nur an die interne Mail weitergereicht,
-- aber nicht am Datensatz gespeichert. Für die Admin-Auswertung „Zahlen nach
-- Herkunft" (B3, letzte 14 Tage) bekommen trainers und kunden eine Spalte
-- herkunft (Freitext, z. B. „meta – trainer_at_1_beruf"). Fehlt sie, zählt der
-- Datensatz als „direkt/unbekannt".
--
-- Zugriff: der Admin liest trainers/kunden bereits vollständig über die
-- bestehenden Policies (ist_vexfit_admin(), 2026-09-20-admin-vollzugriff.sql);
-- die neue Spalte wird über select=* mitgelesen. KEINE Lockerung von
-- Zugriffsregeln nötig. Geschrieben wird herkunft vom Nutzer selbst beim Anlegen
-- der eigenen Zeile (bestehendes INSERT/UPDATE-Recht, WITH CHECK aktiv=false
-- bleibt unberührt) – in registrieren.html als best-effort-Nachtrag, damit die
-- Registrierung auch ohne eingespielte Spalte weiterläuft.
--
-- Mehrfach ausführbar (ADD COLUMN IF NOT EXISTS).
-- RÜCKNAHME: 2026-11-03-01-herkunft-ruecknahme.sql.
-- ============================================================================

ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft text;

COMMENT ON COLUMN public.trainers.herkunft IS
  'Werbekanal bei der Registrierung (utm_source – utm_campaign), für die Admin-Auswertung. NULL = direkt/unbekannt.';
COMMENT ON COLUMN public.kunden.herkunft IS
  'Werbekanal bei der Registrierung (utm_source – utm_campaign), für die Admin-Auswertung. NULL = direkt/unbekannt.';
