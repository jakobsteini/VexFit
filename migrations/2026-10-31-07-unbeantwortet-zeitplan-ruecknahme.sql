-- ============================================================================
-- Rueckbau zu 2026-10-31-07-unbeantwortet-zeitplan.sql: nimmt den Zeitplan
-- wieder heraus. NICHT EINGESPIELT - nur fuer den Fall, dass der 48-Stunden-
-- Fall abgestellt werden soll.
--
-- Die Erweiterungen pg_cron und pg_net bleiben stehen: der trainer-alert-Job
-- und andere Zeitplaene haengen daran. Der Vault-Eintrag vexfit_cron_key und
-- das Secret VEXFIT_CRON_KEY an der Function bleiben ebenfalls - beide sind
-- hier absichtlich nicht angefasst.
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'vexfit-unbeantwortet-stuendlich') then
    perform cron.unschedule('vexfit-unbeantwortet-stuendlich');
  end if;
end;
$$;

-- Kontrolle: muss 0 Zeilen liefern.
--   select jobid, jobname from cron.job
--    where jobname = 'vexfit-unbeantwortet-stuendlich';
