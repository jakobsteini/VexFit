-- ============================================================================
-- Vexfit - Ruecknahme zu 2026-09-19-zugriffsregeln-neuaufbau.sql
-- Erzeugt am 19.09.2026. NICHT eingespielt.
--
-- WARNUNG, BITTE GANZ LESEN:
-- Diese Datei ist eine Notbremse fuer den Fall, dass nach dem Einspielen die
-- Seite nicht mehr benutzbar ist. Sie entfernt die neuen Regeln und schaltet
-- den Zeilenschutz ab, damit die Seite in einem Durchlauf wieder laeuft.
--
-- Sie stellt die 17 alten Regeln NICHT wieder her. Das ist Absicht: die alten
-- Regeln haben nichts geschuetzt. Nach dieser Ruecknahme liegen die Daten
-- wieder offen - Kundennamen und E-Mail-Adressen sind ohne Anmeldung lesbar,
-- und ueber den oeffentlichen Schluessel waere auch Aendern und Loeschen
-- moeglich. Das ist derselbe Zustand wie vor dem Einspielen, nicht besser.
--
-- Sie ist also ein Zwischenschritt von Minuten, kein Dauerzustand: Ursache
-- suchen, Migration nachbessern, erneut einspielen.
-- ============================================================================


-- ==================== 1. Die neuen Regeln entfernen =========================
-- IF EXISTS, damit die Datei auch dann durchlaeuft, wenn das Einspielen
-- mittendrin abgebrochen ist und nur ein Teil der Regeln existiert.

DROP POLICY IF EXISTS "trainers_oeffentlich_nur_aktive" ON public.trainers;
DROP POLICY IF EXISTS "trainers_angemeldet_lesen"       ON public.trainers;
DROP POLICY IF EXISTS "trainers_registrieren"           ON public.trainers;
DROP POLICY IF EXISTS "trainers_eigene_zeile_aendern"   ON public.trainers;

DROP POLICY IF EXISTS "kunden_registrieren"             ON public.kunden;
DROP POLICY IF EXISTS "kunden_eigene_zeile_lesen"       ON public.kunden;
DROP POLICY IF EXISTS "kunden_eigene_zeile_aendern"     ON public.kunden;

DROP POLICY IF EXISTS "anfragen_anlegen"                ON public.anfragen;
DROP POLICY IF EXISTS "anfragen_nur_beteiligte_lesen"   ON public.anfragen;
DROP POLICY IF EXISTS "anfragen_nur_trainer_aendern"    ON public.anfragen;


-- ==================== 2. Den Zeilenschutz abschalten ========================

ALTER TABLE public.trainers    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kunden      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.anfragen    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.nachrichten DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.favoriten   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bewertungen DISABLE ROW LEVEL SECURITY;


-- ==================== 3. Die entzogenen Rechte zurueckgeben =================
-- Teil 3 der Migration hat mit REVOKE ALL zuerst alle Rechte entzogen und
-- danach einzelne Spalten wieder freigegeben. Ein blosses Abschalten des
-- Zeilenschutzes genuegt deshalb nicht - ohne diesen Abschnitt bliebe die
-- Seite trotz abgeschaltetem Schutz ohne Leserecht und damit kaputt.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainers    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kunden      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anfragen    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nachrichten TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favoriten   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bewertungen TO anon, authenticated;

-- Danach ist die Seite wieder benutzbar - und die Daten wieder offen.
-- Zur Kontrolle: bash /Users/js/Projekte/Vexfit/sonstiges/vexfit-rls.sh
