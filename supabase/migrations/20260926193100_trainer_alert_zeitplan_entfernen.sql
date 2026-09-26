-- /Users/js/Projekte/Vexfit/app/vexfit/supabase/migrations/20260926193100_trainer_alert_zeitplan_entfernen.sql
--
-- Rueckbau zu 20260926193000_trainer_alert_zeitplan.sql: nimmt den Zeitplan
-- wieder heraus. NICHT EINGESPIELT — nur fuer den Fall, dass der Ablauf
-- zurueck zu n8n soll oder abgestellt wird.
--
-- Die Erweiterungen pg_cron und pg_net bleiben stehen: andere Jobs koennten
-- daran haengen. Der Vault-Eintrag trainer_alert_key und das Secret an der
-- Function bleiben ebenfalls — beide sind hier absichtlich nicht angefasst.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'trainer-alert-alle-15-minuten') then
    perform cron.unschedule('trainer-alert-alle-15-minuten');
  end if;
end;
$$;

-- Kontrolle: muss 0 Zeilen liefern.
--   select jobid, jobname from cron.job
--    where jobname = 'trainer-alert-alle-15-minuten';
