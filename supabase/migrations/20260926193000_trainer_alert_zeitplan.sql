-- /Users/js/Projekte/Vexfit/app/vexfit/supabase/migrations/20260926193000_trainer_alert_zeitplan.sql
--
-- Zeitplan fuer die Edge Function "trainer-alert": alle 15 Minuten, genau wie
-- der n8n-Workflow "Vexfit Trainer Alert" (scheduleTrigger, minutesInterval 15).
--
-- NICHT EINGESPIELT. Jakob spielt das im SQL Editor des Projekts
-- hbapzwxdehfgnputrfjf ein — erst NACHDEM die Function deployt ist und der
-- Vault-Eintrag trainer_alert_key existiert.
--
-- Der Schluessel steht NICHT in dieser Datei. Der Job liest ihn bei jedem Lauf
-- aus Supabase Vault (vault.decrypted_secrets, Name trainer_alert_key).
-- Derselbe Wert muss als Secret TRAINER_ALERT_KEY an der Function liegen,
-- sonst antwortet sie mit 401.
--
-- Erneutes Einspielen legt keinen zweiten Job an: der Job hat den festen Namen
-- 'trainer-alert-alle-15-minuten' und wird vorher abgeraeumt.
--
-- Rueckbau: 20260926193100_trainer_alert_zeitplan_entfernen.sql

-- ---------------------------------------------------------------- Erweiterungen
-- Beide sind in Supabase-Projekten ueblicherweise schon aktiv; "if not exists"
-- macht das Einspielen wiederholbar.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- Alten Job abraeumen
-- cron.unschedule wirft, wenn es den Job nicht gibt — deshalb erst nachsehen.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'trainer-alert-alle-15-minuten') then
    perform cron.unschedule('trainer-alert-alle-15-minuten');
  end if;
end;
$$;

-- ---------------------------------------------------------------- Job anlegen
-- '*/15 * * * *' = zur Minute 0, 15, 30 und 45 jeder Stunde.
select cron.schedule(
  'trainer-alert-alle-15-minuten',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/trainer-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'trainer_alert_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

-- ---------------------------------------------------------------- Kontrolle
-- Nach dem Einspielen muss hier genau eine Zeile stehen:
--   select jobid, jobname, schedule, active from cron.job
--    where jobname = 'trainer-alert-alle-15-minuten';
