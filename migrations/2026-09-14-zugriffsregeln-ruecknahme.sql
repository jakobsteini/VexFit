-- ============================================================================
-- Vexfit - Ruecknahme der Zugriffsregeln vom 14.09.2026
--
-- Stellt den Zustand von vor der Migration 2026-09-14-zugriffsregeln.sql her:
-- alle Regeln entfernt, Zeilenschutz aus, Rechte zurueckgegeben.
--
-- ACHTUNG: Danach sind Kunden- und Trainerdaten wieder fuer jeden ohne
-- Anmeldung lesbar. Das ist nur als Notausstieg gedacht, wenn nach dem
-- Einspielen etwas Wichtiges nicht mehr geht.
-- ============================================================================


-- ============================ trainers ======================================
-- Entfernt die vier Regeln an der Trainertabelle.
DROP POLICY IF EXISTS "trainers_oeffentlich_nur_aktive"  ON public.trainers;
DROP POLICY IF EXISTS "trainers_angemeldet_lesen"        ON public.trainers;
DROP POLICY IF EXISTS "trainers_registrieren"            ON public.trainers;
DROP POLICY IF EXISTS "trainers_eigene_zeile_aendern"    ON public.trainers;

-- Schaltet den Zeilenschutz wieder ab.
ALTER TABLE public.trainers DISABLE ROW LEVEL SECURITY;

-- Gibt die vollen Tabellenrechte zurueck. Das hebt auch die Spaltenrechte auf,
-- die die Migration gesetzt hatte.
GRANT ALL ON public.trainers TO anon, authenticated;


-- ============================= kunden =======================================
-- Entfernt die drei Regeln an der Kundentabelle.
DROP POLICY IF EXISTS "kunden_registrieren"          ON public.kunden;
DROP POLICY IF EXISTS "kunden_eigene_zeile_lesen"    ON public.kunden;
DROP POLICY IF EXISTS "kunden_eigene_zeile_aendern"  ON public.kunden;

-- Schaltet den Zeilenschutz wieder ab.
ALTER TABLE public.kunden DISABLE ROW LEVEL SECURITY;

-- Gibt die vollen Tabellenrechte zurueck.
GRANT ALL ON public.kunden TO anon, authenticated;


-- ============================ anfragen ======================================
-- Entfernt die zwei Regeln an der Anfragentabelle.
DROP POLICY IF EXISTS "anfragen_anlegen"              ON public.anfragen;
DROP POLICY IF EXISTS "anfragen_nur_beteiligte_lesen" ON public.anfragen;

-- Schaltet den Zeilenschutz wieder ab.
ALTER TABLE public.anfragen DISABLE ROW LEVEL SECURITY;

-- Gibt die vollen Tabellenrechte zurueck.
GRANT ALL ON public.anfragen TO anon, authenticated;


-- ================== nachrichten, favoriten, bewertungen =====================
-- Schaltet den Zeilenschutz ab und gibt die Rechte zurueck. Regeln gab es
-- an diesen drei Tabellen keine.
ALTER TABLE public.nachrichten DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.nachrichten TO anon, authenticated;

ALTER TABLE public.favoriten DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.favoriten TO anon, authenticated;

ALTER TABLE public.bewertungen DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bewertungen TO anon, authenticated;
