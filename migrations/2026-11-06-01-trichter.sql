-- ============================================================================
-- Vexfit – B3 (Dauerlauf 05./06.11.2026): Trichter messen
-- Erzeugt am 06.11.2026. NICHT eingespielt (nur Datei).
--
-- Ziel: den Weg von der Anzeige bis zum ausgefüllten Profil anonym zählen,
-- aufgeschlüsselt nach Herkunft (Werbekanal) und Browsertyp (In-App-Browser von
-- Facebook/Instagram oder sonst). KEINE Personendaten – nur Kampagnen-Kennungen
-- und ein grober Browsertyp.
--
-- Zwei Teile:
--   1) Tabelle trichter_ereignisse (anonyme Beacons, 5 Stufen).
--   2) Strukturierte Herkunft je Registrierung (zusätzlich zum bestehenden
--      Freitext trainers.herkunft/kunden.herkunft aus 2026-11-03-01).
--
-- Zugriff: Jeder Besucher (anon/authenticated) darf NUR einfügen (Beacon) und
-- NICHTS lesen. Lesen darf allein der Admin über public.ist_vexfit_admin()
-- (2026-09-20-admin-vollzugriff.sql). Die Stufe ist per CHECK auf fünf Werte
-- begrenzt, die Textfelder sind längenbegrenzt (Missbrauch eindämmen).
--
-- Mehrfach ausführbar (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- RÜCKNAHME: migrations/ruecknahmen/2026-11-06-01-trichter-ruecknahme.sql
-- ============================================================================

-- 1) Anonyme Trichter-Ereignisse ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.trichter_ereignisse (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stufe       text NOT NULL CHECK (stufe IN ('seite','formular','abgesendet','bestaetigt','profil5')),
  rolle       text CHECK (rolle IN ('trainer','kunde')),
  quelle      text,
  kampagne    text,
  inhalt      text,
  browsertyp  text CHECK (browsertyp IN ('instagram','facebook','sonst')),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trichter_laenge CHECK (
    char_length(COALESCE(quelle,   '')) <= 120 AND
    char_length(COALESCE(kampagne, '')) <= 120 AND
    char_length(COALESCE(inhalt,   '')) <= 120
  )
);

CREATE INDEX IF NOT EXISTS trichter_erstellt_idx
  ON public.trichter_ereignisse (erstellt_am DESC);

COMMENT ON TABLE public.trichter_ereignisse IS
  'Anonyme Trichter-Zählung (B3): Seite geöffnet, Formular begonnen, abgeschickt, bestätigt, Profil >=5/8 – je Herkunft/Browsertyp. Keine Personendaten.';

ALTER TABLE public.trichter_ereignisse ENABLE ROW LEVEL SECURITY;

-- Einfügen: jeder Besucher (Beacon). Lesen: niemand außer Admin (eigene Policy).
DROP POLICY IF EXISTS trichter_insert ON public.trichter_ereignisse;
CREATE POLICY trichter_insert ON public.trichter_ereignisse
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS trichter_admin_select ON public.trichter_ereignisse;
CREATE POLICY trichter_admin_select ON public.trichter_ereignisse
  FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());

-- 2) Strukturierte Herkunft je Registrierung ---------------------------------
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft_quelle   text;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft_kampagne text;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft_inhalt   text;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft_browser  text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft_quelle   text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft_kampagne text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft_inhalt   text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft_browser  text;

COMMENT ON COLUMN public.trainers.herkunft_quelle  IS 'utm_source bei Registrierung (B3).';
COMMENT ON COLUMN public.trainers.herkunft_browser IS 'Browsertyp bei Registrierung: instagram/facebook/sonst (B3).';
