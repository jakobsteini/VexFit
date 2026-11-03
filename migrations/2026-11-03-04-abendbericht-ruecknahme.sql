-- ============================================================================
-- RÜCKNAHME zu 2026-11-03-04-abendbericht.sql
-- Entfernt die beiden pg_cron-Jobs wieder. Mehrfach ausführbar.
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'vexfit-abendbericht-14-utc') then
    perform cron.unschedule('vexfit-abendbericht-14-utc');
  end if;
  if exists (select 1 from cron.job where jobname = 'vexfit-abendbericht-15-utc') then
    perform cron.unschedule('vexfit-abendbericht-15-utc');
  end if;
end;
$$;
