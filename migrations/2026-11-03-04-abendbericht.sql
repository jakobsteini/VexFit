-- ============================================================================
-- Vexfit – B7: Abendbericht um 16:00 (Wiener Zeit)
-- Erzeugt am 03.11.2026. NICHT eingespielt (nur Datei). Reihenfolge: nach
-- 2026-11-02-01 (erinnerungs-mails), nutzt dieselbe Mechanik.
--
-- WAS DIESE DATEI TUT:
--   Zwei pg_cron-Jobs rufen die Edge Function vexfit-automation am Pfad
--   /abendbericht auf: einer um 14:00 UTC, einer um 15:00 UTC. pg_cron läuft in
--   UTC; die Function sendet NUR, wenn es beim Aufruf gerade 16 Uhr Wiener Zeit
--   ist (Europe/Vienna). Dadurch trifft ganzjährig genau EIN Aufruf auf 16 Uhr:
--     Sommerzeit (CEST, UTC+2): 14:00 UTC = 16:00 Wien  -> der 14-Uhr-Job sendet.
--     Winterzeit (CET,  UTC+1): 15:00 UTC = 16:00 Wien  -> der 15-Uhr-Job sendet.
--   Der jeweils andere Aufruf fällt auf 17 bzw. 15 Uhr Wien und sendet nichts.
--   So wird nie doppelt gesendet, ohne eine feste Sommer-/Winterzeit-Annahme.
--
-- WARUM ein Zeitplan und keine DB-Logik:
--   Versand (Mail an office@ + Admin-Push) läuft über die Function (service_role,
--   SMTP/Web Push) – wie bei den übrigen Mails. Die Datenbank schickt nichts.
--
-- NICHT EINGESPIELT. Jakob spielt das im SQL Editor des Projekts
-- hbapzwxdehfgnputrfjf ein – erst NACHDEM:
--   1. die Function vexfit-automation mit dem Pfad /abendbericht deployt ist,
--   2. das Secret VEXFIT_CRON_KEY an der Function gesetzt ist,
--   3. im Vault der Eintrag vexfit_cron_key mit DEMSELBEN Wert liegt
--      (derselbe Schlüssel wie bei erinnerungen/unbeantwortet).
--
-- Mehrfach ausführbar (alten Job vor dem Anlegen abräumen).
-- RÜCKNAHME: 2026-11-03-04-abendbericht-ruecknahme.sql.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Alte Jobs abräumen (idempotent).
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

-- Zwei Zeitpläne; die Function entscheidet anhand der Wiener Uhrzeit, welcher sendet.
select cron.schedule(
  'vexfit-abendbericht-14-utc',
  '0 14 * * *',
  $job$
  select net.http_post(
    url := 'https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/abendbericht',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vexfit-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'vexfit_cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'vexfit-abendbericht-15-utc',
  '0 15 * * *',
  $job$
  select net.http_post(
    url := 'https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/abendbericht',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vexfit-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'vexfit_cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

-- Kontrolle nach dem Einspielen:
--   select jobname, schedule from cron.job where jobname like 'vexfit-abendbericht-%';
