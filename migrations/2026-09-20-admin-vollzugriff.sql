-- ============================================================================
-- Vexfit - Vollzugriff fuer das Admin-Konto
-- Erzeugt am 20.09.2026. NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie ergaenzt die am 20.09.2026 eingespielten Zugriffsregeln
-- (2026-09-19-zugriffsregeln-neuaufbau.sql) um Regeln fuer genau ein Konto:
-- das Admin-Konto mit der Kennung ee744b01-0a70-4da5-a19b-6c905c8479b5.
-- Dieses eine Konto darf alle Zeilen in trainers, kunden und anfragen lesen,
-- alle Zeilen in trainers aendern (Freischalten und Sperren ueber aktiv) und
-- Zeilen in trainers und kunden loeschen (Kicken).
--
-- Es wird KEINE bestehende Regel geaendert oder entfernt. Regeln in Postgres
-- wirken erlaubend und werden mit ODER verknuepft: die neuen Regeln erweitern
-- den Zugriff nur fuer dieses eine Konto, fuer alle anderen aendert sich nichts.
--
-- ZU DEN RECHTEN (GRANT): Die Rolle authenticated hat laut eingespieltem Stand
-- bereits SELECT, INSERT und UPDATE auf trainers und kunden sowie SELECT und
-- INSERT auf anfragen. Diese Rechte werden hier NICHT erneut vergeben. Neu ist
-- ausschliesslich DELETE auf trainers und kunden, denn ohne dieses Recht kann
-- auch die neue Loeschregel nichts loeschen. Fuer alle anderen angemeldeten
-- Nutzer bleibt Loeschen trotzdem unmoeglich, weil keine Loeschregel auf sie
-- zutrifft - ohne passende Regel loescht Postgres bei Zeilenschutz null Zeilen.
--
-- RUECKNAHME: 2026-09-20-admin-vollzugriff-ruecknahme.sql entfernt alles, was
-- diese Datei anlegt, und nur das.
-- ============================================================================


-- Hilfsfunktion: liefert wahr, wenn der gerade angemeldete Nutzer das
-- Admin-Konto ist; sie wird von allen Regeln in dieser Datei verwendet.
CREATE OR REPLACE FUNCTION public.ist_vexfit_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() = 'ee744b01-0a70-4da5-a19b-6c905c8479b5'::uuid;
$$;


-- ============================ trainers ======================================

-- Erlaubt dem Admin-Konto, alle Trainerzeilen zu lesen, auch die noch nicht
-- freigeschalteten.
CREATE POLICY "trainers_admin_alles_lesen"
  ON public.trainers FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());

-- Erlaubt dem Admin-Konto, alle Trainerzeilen zu aendern, damit Freischalten
-- und Sperren ueber die Spalte aktiv funktionieren.
CREATE POLICY "trainers_admin_alles_aendern"
  ON public.trainers FOR UPDATE TO authenticated
  USING (public.ist_vexfit_admin())
  WITH CHECK (public.ist_vexfit_admin());

-- Gibt der Rolle authenticated das bisher nirgends vergebene Recht, in
-- trainers zu loeschen; welche Zeilen tatsaechlich loeschbar sind, entscheidet
-- allein die Regel darunter.
GRANT DELETE ON public.trainers TO authenticated;

-- Erlaubt ausschliesslich dem Admin-Konto, Trainerzeilen zu loeschen.
CREATE POLICY "trainers_admin_loeschen"
  ON public.trainers FOR DELETE TO authenticated
  USING (public.ist_vexfit_admin());


-- ============================= kunden =======================================

-- Erlaubt dem Admin-Konto, alle Kundenzeilen zu lesen.
CREATE POLICY "kunden_admin_alles_lesen"
  ON public.kunden FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());

-- Gibt der Rolle authenticated das bisher nirgends vergebene Recht, in kunden
-- zu loeschen; welche Zeilen tatsaechlich loeschbar sind, entscheidet allein
-- die Regel darunter.
GRANT DELETE ON public.kunden TO authenticated;

-- Erlaubt ausschliesslich dem Admin-Konto, Kundenzeilen zu loeschen.
CREATE POLICY "kunden_admin_loeschen"
  ON public.kunden FOR DELETE TO authenticated
  USING (public.ist_vexfit_admin());


-- ============================ anfragen ======================================

-- Erlaubt dem Admin-Konto, alle Anfragen zu lesen, nicht nur die der eigenen
-- Beteiligung.
CREATE POLICY "anfragen_admin_alles_lesen"
  ON public.anfragen FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());
