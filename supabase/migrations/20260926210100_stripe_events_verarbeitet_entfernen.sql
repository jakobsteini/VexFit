-- /Users/js/Projekte/Vexfit/app/vexfit/supabase/migrations/20260926210100_stripe_events_verarbeitet_entfernen.sql
--
-- Rueckbau zu 20260926210000_stripe_events_verarbeitet.sql.
-- NICHT EINGESPIELT — nur fuer den Fall, dass der Ablauf zurueck zu n8n soll.
--
-- ACHTUNG: damit geht der Merkzettel verloren. Laeuft die Edge Function
-- danach noch, koennte eine von Stripe wiederholte Zustellung dieselbe
-- Zahlung ein zweites Mal verarbeiten. Also erst die Function abschalten
-- oder den Stripe-Endpunkt entfernen, dann diese Datei einspielen.

drop table if exists public.stripe_events_verarbeitet;

-- Kontrolle: muss 0 Zeilen liefern.
--   select tablename from pg_tables
--    where schemaname = 'public' and tablename = 'stripe_events_verarbeitet';
