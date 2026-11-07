-- ============================================================================
-- Vexfit – Land eindeutig fuehren (Dauerlauf 07.11.2026)
-- Erzeugt am 07.11.2026. NICHT eingespielt (nur Datei).
--
-- WARUM:
-- Viele 4-stellige PLZ gibt es in Oesterreich UND der Schweiz (z. B. 5020
-- Salzburg vs. 5020 Wettingen/CH). Damit eine PLZ eindeutig einem Land
-- zugeordnet werden kann, tragen auch die noch fehlenden Tabellen eine Spalte
-- `land`. trainers.land und kunden.land gibt es bereits (2026-10-26-02-land.sql,
-- Reihenfolge: DIESE Datei NACH jener einspielen) – hier kommen die vier
-- restlichen Stellen dazu, an denen eine PLZ gespeichert wird:
--   - trainer_alerts  ("Benachrichtige mich", E-Mail-Dienst)
--   - warteliste      (Nachfrage ohne Angebot, Admin)
--   - such_eingaben   (anonyme Suchzaehlung)
--   - trichter_ereignisse (anonymer Trichter, grober PLZ-Bereich)
--
-- WAS DIESE DATEI TUT (und NICHT tut):
-- - Fuegt jeweils `land text` hinzu, erlaubt NUR 'AT','DE','CH' oder leer (NULL).
-- - Befuellt NICHTS automatisch: bestehende Zeilen bleiben land = NULL. Welches
--   Land eine alte 4-stellige PLZ hat, laesst sich nicht raten; das Zuordnen
--   passiert von Hand im Admin ("PLZ ohne Land", ueber /admin-aktion, aal2,
--   protokolliert) bzw. beim naechsten Speichern durch Trainer/Kunde.
-- - Gibt den Rollen das Schreibrecht auf die neue Spalte, passend zum jeweils
--   bestehenden, eng gefassten Rechtemuster der Tabelle.
--
-- Mehrfach ausfuehrbar (ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
-- RUECKNAHME: migrations/ruecknahmen/2026-11-07-02-land-ueberall-ruecknahme.sql
-- ============================================================================

-- 1) trainer_alerts ----------------------------------------------------------
ALTER TABLE public.trainer_alerts ADD COLUMN IF NOT EXISTS land text;
ALTER TABLE public.trainer_alerts DROP CONSTRAINT IF EXISTS trainer_alerts_land_werte;
ALTER TABLE public.trainer_alerts
  ADD CONSTRAINT trainer_alerts_land_werte CHECK (land IS NULL OR land IN ('AT','DE','CH'));
COMMENT ON COLUMN public.trainer_alerts.land IS
  'Land der Vormerkung (AT/DE/CH) – damit 4-stellige PLZ eindeutig bleiben. NULL = noch nicht gesetzt.';
-- Kunde darf land beim Anlegen mitschreiben; Admin liest es mit.
GRANT INSERT (kunden_email, kunden_name, plz, stadt, radius, aktiv, land)
  ON public.trainer_alerts TO authenticated;
GRANT SELECT (id, kunden_email, kunden_name, plz, stadt, radius, aktiv, erstellt_am, land)
  ON public.trainer_alerts TO authenticated;

-- 2) warteliste --------------------------------------------------------------
ALTER TABLE public.warteliste ADD COLUMN IF NOT EXISTS land text;
ALTER TABLE public.warteliste DROP CONSTRAINT IF EXISTS warteliste_land_werte;
ALTER TABLE public.warteliste
  ADD CONSTRAINT warteliste_land_werte CHECK (land IS NULL OR land IN ('AT','DE','CH'));
COMMENT ON COLUMN public.warteliste.land IS
  'Land der Vormerkung (AT/DE/CH). NULL = noch nicht gesetzt.';
GRANT INSERT (plz, stadt, ziel, umkreis, land) ON public.warteliste TO authenticated;

-- 3) such_eingaben -----------------------------------------------------------
ALTER TABLE public.such_eingaben ADD COLUMN IF NOT EXISTS land text;
ALTER TABLE public.such_eingaben DROP CONSTRAINT IF EXISTS such_eingaben_land_werte;
ALTER TABLE public.such_eingaben
  ADD CONSTRAINT such_eingaben_land_werte CHECK (land IS NULL OR land IN ('AT','DE','CH'));
COMMENT ON COLUMN public.such_eingaben.land IS
  'Land der Suche (AT/DE/CH) – Suchzaehlung je Land getrennt. NULL = noch nicht gesetzt.';
GRANT INSERT (spezialisierungen, trainingsart, plz, umkreis, anzahl_treffer, land)
  ON public.such_eingaben TO authenticated;

-- 4) trichter_ereignisse -----------------------------------------------------
-- Wie plz_bereich (2026-11-07-01): nur die Spalte; der Beacon schreibt sie,
-- die Insert-Policy der Tabelle regelt den Zugriff.
ALTER TABLE public.trichter_ereignisse ADD COLUMN IF NOT EXISTS land text;
ALTER TABLE public.trichter_ereignisse DROP CONSTRAINT IF EXISTS trichter_ereignisse_land_werte;
ALTER TABLE public.trichter_ereignisse
  ADD CONSTRAINT trichter_ereignisse_land_werte CHECK (land IS NULL OR land IN ('AT','DE','CH'));
COMMENT ON COLUMN public.trichter_ereignisse.land IS
  'Land (AT/DE/CH) zum groben PLZ-Bereich, damit "50" in AT nicht mit der Schweiz vermischt wird. NULL = nicht gesetzt.';
