-- ============================================================================
-- Vexfit - Teil 4: Erinnerungs-Mails für unvollständige Trainerprofile
-- Erzeugt am 02.11.2026. NICHT eingespielt. Reihenfolge: nach 2026-11-01-05.
--
-- WAS DIESE DATEI TUT (EINE Migration):
--   1. Drei Spalten an public.trainers:
--        erinnerung_stufe  smallint  - höchste schon verschickte Stufe (0..3)
--        erinnerungen_aus  boolean   - Trainer hat Erinnerungen abbestellt
--        erinnerung_token  uuid      - geheimes Token für den Abmelde-Link
--   2. Einen pg_cron-Job, der alle 15 Minuten die Edge Function
--      vexfit-automation am Pfad /erinnerungen aufruft. Die Function wählt
--      anhand fester Zeitfenster (2/24/72 h, bis 96 h) aus, wem welche Stufe
--      geschickt wird, und verschickt je Trainer höchstens eine Mail pro Lauf.
--
-- WARUM ein Zeitplan und keine DB-Logik:
--   Das Verschicken läuft über die Function (service_role, SMTP) - genau wie bei
--   den übrigen Mails. Die Datenbank schickt keine Mails. Der Zeitplan ist nur
--   der Auslöser; Auswahl, Fenster und Versand bleiben in der geprüften Function.
--
-- NICHT EINGESPIELT. Jakob spielt das im SQL Editor des Projekts
-- hbapzwxdehfgnputrfjf ein - erst NACHDEM:
--   1. die Function vexfit-automation mit den Pfaden /erinnerungen und
--      /erinnerung-abmelden deployt ist,
--   2. das Secret VEXFIT_CRON_KEY an der Function gesetzt ist,
--   3. im Vault der Eintrag vexfit_cron_key mit DEMSELBEN Wert liegt.
--   Beide Werte müssen übereinstimmen (derselbe Schlüssel wie beim
--   unbeantwortet-Zeitplan), sonst antwortet die Function mit 401.
--
-- Bis diese Migration eingespielt ist, bleibt der Pfad /erinnerungen still
-- (die Function erkennt die fehlenden Spalten und meldet "migration fehlt").
-- Das Token steht nur in trainers (service_role) und nie in der öffentlichen
-- Sicht trainers_oeffentlich - es wird nicht nach außen sichtbar.
-- ============================================================================

-- ---------------------------------------------------------------- Spalten
-- gen_random_uuid() ist in Supabase/PostgreSQL vorhanden (pgcrypto bzw. Kern).
alter table public.trainers
  add column if not exists erinnerung_stufe smallint not null default 0,
  add column if not exists erinnerungen_aus boolean not null default false,
  add column if not exists erinnerung_token uuid not null default gen_random_uuid();

-- Bestehende Zeilen ohne Token nachziehen (falls die Spalte ohne Default
-- angelegt worden wäre; mit Default oben bereits gesetzt - defensiv).
update public.trainers
   set erinnerung_token = gen_random_uuid()
 where erinnerung_token is null;

-- Nachschlagen beim Abmelde-Link soll schnell und das Token eindeutig sein.
create unique index if not exists trainers_erinnerung_token_idx
  on public.trainers (erinnerung_token);

-- Der Zeitplan fragt nach noch nicht freigegebenen, kürzlich registrierten
-- Trainern - ein kleiner Index auf (aktiv, created_at) hilft dieser Abfrage.
create index if not exists trainers_erinnerung_kandidaten_idx
  on public.trainers (aktiv, created_at)
  where aktiv = false;

-- ---------------------------------------------------------------- Erweiterungen
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- Alten Job abräumen
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vexfit-erinnerungen-alle-15-minuten') then
    perform cron.unschedule('vexfit-erinnerungen-alle-15-minuten');
  end if;
end;
$$;

-- ---------------------------------------------------------------- Job anlegen
-- '*/15 * * * *' = alle 15 Minuten. Die Function begrenzt jeden Lauf selbst.
select cron.schedule(
  'vexfit-erinnerungen-alle-15-minuten',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://hbapzwxdehfgnputrfjf.supabase.co/functions/v1/vexfit-automation/erinnerungen',
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
-- Nach dem Einspielen zeigt diese Abfrage die drei Spalten UND den Job:
--   select column_name from information_schema.columns
--     where table_name='trainers'
--       and column_name in ('erinnerung_stufe','erinnerungen_aus','erinnerung_token')
--   union all
--   select jobname from cron.job where jobname='vexfit-erinnerungen-alle-15-minuten';
--
-- Rückbau (von Hand, falls nötig):
--   select cron.unschedule('vexfit-erinnerungen-alle-15-minuten');
--   drop index if exists public.trainers_erinnerung_token_idx;
--   drop index if exists public.trainers_erinnerung_kandidaten_idx;
--   alter table public.trainers
--     drop column if exists erinnerung_stufe,
--     drop column if exists erinnerungen_aus,
--     drop column if exists erinnerung_token;
