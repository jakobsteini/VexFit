-- ============================================================================
-- Vexfit – K1 (Dauerlauf 07.11.2026): Kunden-Trichter messen
-- Erzeugt am 07.11.2026. NICHT eingespielt (nur Datei).
--
-- Der Trainer-Trichter (B3, trichter_ereignisse) wird um die KUNDEN-Stufen
-- erweitert und um einen groben PLZ-Bereich (erste zwei Ziffern, z. B. "50" für
-- Salzburg) als Dimension. KEINE Personendaten – nur Kampagnen-Kennungen, grober
-- Browsertyp und grober PLZ-Bereich.
--
-- Kunden-Stufen (rolle='kunde'): seite -> suche -> treffer -> profil ->
-- anfrage_start -> anfrage. Die bestehenden Trainer-Stufen bleiben.
--
-- Mehrfach ausführbar (DROP CONSTRAINT IF EXISTS / ADD COLUMN IF NOT EXISTS).
-- RÜCKNAHME: migrations/ruecknahmen/2026-11-07-01-kunden-trichter-ruecknahme.sql
-- ============================================================================

-- 1) Stufen-CHECK um die Kunden-Stufen erweitern.
ALTER TABLE public.trichter_ereignisse
  DROP CONSTRAINT IF EXISTS trichter_ereignisse_stufe_check;
ALTER TABLE public.trichter_ereignisse
  ADD CONSTRAINT trichter_ereignisse_stufe_check CHECK (stufe IN (
    'seite','formular','abgesendet','bestaetigt','profil5',
    'suche','treffer','profil','anfrage_start','anfrage'
  ));

-- 2) Grober PLZ-Bereich (zwei Ziffern) – reicht für „wo ist Nachfrage".
ALTER TABLE public.trichter_ereignisse
  ADD COLUMN IF NOT EXISTS plz_bereich text;

COMMENT ON COLUMN public.trichter_ereignisse.plz_bereich IS
  'Grober PLZ-Bereich (erste zwei Ziffern) bei Kunden-Stufen, z. B. 50 = Salzburg. Keine genaue PLZ, kein Personenbezug.';
