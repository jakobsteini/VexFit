-- ============================================================================
-- Vexfit - Leserecht des Admin-Kontos auf stripe_events_verarbeitet
-- Erzeugt am 14.10.2026. NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie gibt genau einem Konto - dem Admin-Konto mit der Kennung
-- ee744b01-0a70-4da5-a19b-6c905c8479b5 - das Recht, die Zeilen der Tabelle
-- public.stripe_events_verarbeitet zu LESEN. Mehr nicht: kein Schreiben, kein
-- Loeschen, kein Zugriff fuer andere Konten.
--
-- WARUM NOETIG:
-- Die Tabelle wurde mit Zeilenschutz (RLS) und ohne jede Richtlinie angelegt,
-- und die Tabellenrechte wurden anon und authenticated entzogen (siehe
-- supabase/migrations/20260926210000_stripe_events_verarbeitet.sql). Damit kann
-- das Admin-Panel die verarbeiteten Zahlungsereignisse nicht anzeigen. Diese
-- Datei aendert das ausschliesslich fuer das Admin-Konto.
--
-- VORAUSSETZUNG:
-- 1. Die Tabelle public.stripe_events_verarbeitet muss existieren, also
--    supabase/migrations/20260926210000_stripe_events_verarbeitet.sql muss
--    vorher eingespielt sein.
-- 2. Die Hilfsfunktion public.ist_vexfit_admin() muss existieren; sie stammt
--    aus 2026-09-20-admin-vollzugriff.sql und wird hier NUR verwendet, nicht
--    angelegt oder geaendert.
--
-- Das Tabellenrecht SELECT fuer die Rolle authenticated wird neu vergeben.
-- Fuer alle anderen angemeldeten Nutzer bleibt die Tabelle trotzdem leer, weil
-- die Leseregel unten nur auf das Admin-Konto zutrifft - ohne passende Regel
-- liefert Postgres bei Zeilenschutz null Zeilen. Der Service-Role-Schluessel
-- der Edge Function umgeht RLS weiterhin und ist davon nicht betroffen.
--
-- RUECKNAHME: 2026-10-14-admin-stripe-events-lesen-ruecknahme.sql entfernt
-- genau das, was diese Datei anlegt, und nur das.
-- ============================================================================

-- Gibt der Rolle authenticated das zuvor entzogene Leserecht auf die Tabelle
-- zurueck; welche Zeilen tatsaechlich lesbar sind, entscheidet die Regel darunter.
GRANT SELECT ON public.stripe_events_verarbeitet TO authenticated;

-- Erlaubt ausschliesslich dem Admin-Konto, die Zeilen zu lesen.
CREATE POLICY "stripe_events_admin_lesen"
  ON public.stripe_events_verarbeitet FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());
