-- /Users/js/Projekte/Vexfit/app/vexfit/supabase/migrations/20260926210000_stripe_events_verarbeitet.sql
--
-- Merkzettel fuer schon verarbeitete Stripe-Ereignisse. Stripe wiederholt ein
-- Ereignis, wenn die Antwort ausbleibt oder zu lange dauert; ohne diesen
-- Merkzettel wuerde dieselbe Zahlung zweimal Kundendaten verschicken.
--
-- Die Edge Function vexfit-automation schreibt hier ueber den
-- Service-Role-Schluessel hinein. Sonst darf niemand etwas: keine Richtlinien
-- fuer anon oder authenticated, keine GRANTs.
--
-- NICHT EINGESPIELT. Jakob spielt das im SQL Editor des Projekts
-- hbapzwxdehfgnputrfjf ein, BEVOR die Function scharfgeschaltet wird.
--
-- Rueckbau: 20260926210100_stripe_events_verarbeitet_entfernen.sql

create table if not exists public.stripe_events_verarbeitet (
  event_id       text primary key,
  typ            text,
  verarbeitet_am timestamptz not null default now()
);

comment on table public.stripe_events_verarbeitet is
  'Schon verarbeitete Stripe-Ereignisse. Verhindert, dass eine wiederholte '
  'Zustellung desselben Ereignisses ein zweites Mal Kundendaten verschickt.';

-- Row Level Security an, aber ohne eine einzige Richtlinie: damit kommt weder
-- anon noch authenticated an die Zeilen. Der Service-Role-Schluessel umgeht
-- RLS ohnehin — genau das ist hier gewollt.
alter table public.stripe_events_verarbeitet enable row level security;

-- Sicherheitshalber auch die Tabellenrechte wegnehmen, falls sie ueber ein
-- frueheres GRANT auf das Schema vergeben wurden.
revoke all on public.stripe_events_verarbeitet from anon, authenticated;

-- Kontrolle nach dem Einspielen:
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename = 'stripe_events_verarbeitet';
--   select count(*) from pg_policies
--    where schemaname = 'public' and tablename = 'stripe_events_verarbeitet';
-- Erwartet: rowsecurity = true, count = 0.
