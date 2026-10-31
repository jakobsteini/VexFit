-- ============================================================================
-- Vexfit - Baustein 4e, 48-Stunden-Fall (Zeitplan)
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: nach 2026-10-31-06.
--
-- WAS DIESE DATEI TUT:
--   Legt einen pg_cron-Job an, der stuendlich die Edge Function
--   vexfit-automation am Pfad /unbeantwortet-pruefen aufruft. Die Function
--   sucht Anfragen, die ein Trainer seit mehr als 48 Stunden nicht beantwortet
--   hat, und schickt dem Kunden dieselben zwei Vorschlaege wie bei
--   "Passt nicht?" (Baustein 4e, Klick-Pfad). Je Anfrage nur einmal.
--
-- WARUM ein Zeitplan und keine DB-Logik:
--   Das Verschicken der Mail laeuft ueber die Function (service_role, SMTP) -
--   genau wie beim Klick-Pfad. Die Datenbank soll keine Mails schicken. Der
--   Zeitplan ist nur der Ausloeser; die Auswahl und der Versand bleiben in der
--   Function, mit denselben geprueften Bausteinen.
--
-- NICHT EINGESPIELT. Jakob spielt das im SQL Editor des Projekts
-- hbapzwxdehfgnputrfjf ein - erst NACHDEM:
--   1. die Function vexfit-automation mit diesem Pfad deployt ist,
--   2. an der Function das Secret VEXFIT_CRON_KEY gesetzt ist,
--   3. im Vault ein Eintrag vexfit_cron_key mit DEMSELBEN Wert liegt.
--   Beide Werte muessen uebereinstimmen, sonst antwortet die Function mit 401.
--
-- Der Schluessel steht NICHT in dieser Datei. Der Job liest ihn bei jedem Lauf
-- aus Supabase Vault (vault.decrypted_secrets, Name vexfit_cron_key) und
-- schickt ihn im Kopf x-vexfit-cron mit.
--
-- Erneutes Einspielen legt keinen zweiten Job an: der Job hat den festen Namen
-- 'vexfit-unbeantwortet-stuendlich' und wird vorher abgeraeumt.
--
-- Rueckbau: 2026-10-31-07-unbeantwortet-zeitplan-ruecknahme.sql
-- ============================================================================

-- ---------------------------------------------------------------- Erweiterungen
-- Beide sind in Supabase-Projekten ueblicherweise schon aktiv (auch der
-- trainer-alert-Zeitplan haengt daran); "if not exists" macht es wiederholbar.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- Alten Job abraeumen
-- cron.unschedule wirft, wenn es den Job nicht gibt - deshalb erst nachsehen.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vexfit-unbeantwortet-stuendlich') then
    perform cron.unschedule('vexfit-unbeantwortet-stuendlich');
  end if;
end;
$$;

-- ---------------------------------------------------------------- Job anlegen
-- '20 * * * *' = zur Minute 20 jeder Stunde. Stuendlich reicht: eine Anfrage,
-- die die 48-Stunden-Grenze erreicht, bekommt so binnen einer Stunde ihre
-- Vorschlaege. Die Function begrenzt jeden Lauf selbst auf 200 Anfragen.
select cron.schedule(
  'vexfit-unbeantwortet-stuendlich',
  '20 * * * *',
  $job$
  select net.http_post(
    url := 'https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/unbeantwortet-pruefen',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vexfit-cron', (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'vexfit_cron_key'
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
--    where jobname = 'vexfit-unbeantwortet-stuendlich';
