-- ============================================================================
-- Vexfit – PRÜFABFRAGE B7-Abendbericht (NUR LESEND)
-- Erzeugt am 04.11.2026.
--
-- ZWECK: Herausfinden, warum der tägliche Abendbericht (16:00 Wiener Zeit) nicht
-- ankommt. Diese Datei ÄNDERT NICHTS – nur SELECT auf cron.job und
-- cron.job_run_details. Im SQL-Editor des Projekts hbapzwxdehfgnputrfjf laufen
-- lassen und das Ergebnis an Claude geben.
--
-- Was die Ergebnisse bedeuten:
--   Abfrage 1 (cron.job): Gibt es die beiden Jobs 'vexfit-abendbericht-14-utc'
--     und '-15-utc'? Stimmt der Zeitplan ('0 14 * * *' bzw. '0 15 * * *', UTC)?
--     Ist active = true? -> Fehlt eine Zeile, wurde die Migration
--     2026-11-03-04 nicht (vollständig) eingespielt.
--   Abfrage 2 (cron.job_run_details, 3 Tage): Ist der Job um 14:00/15:00 UTC
--     überhaupt gelaufen? status = 'succeeded' heißt nur, dass der SELECT
--     net.http_post ABGESETZT wurde – NICHT, dass die Function 200 geliefert
--     hat (die HTTP-Antwort steht in net._http_response, hier bewusst nicht
--     abgefragt). return_message zeigt SQL-seitige Fehler (z. B. fehlendes
--     vault-Secret, pg_net nicht aktiv).
--
-- HINWEIS: Läuft der Job und meldet 'succeeded', der Bericht kommt aber nicht,
-- liegt es NICHT am Zeitplan, sondern an der Function (Secret VEXFIT_CRON_KEY /
-- vault vexfit_cron_key, SMTP) – das beweist der Admin-Knopf
-- „Abendbericht jetzt senden" (umgeht die Cron-Auth).
-- ============================================================================

-- Abfrage 1: Existenz, Zeitplan und Aktiv-Status der beiden Abendbericht-Jobs.
select jobid, jobname, schedule, active
from cron.job
where jobname like 'vexfit-abendbericht-%'
order by jobname;

-- Abfrage 2: Läufe der letzten 3 Tage (nur die Abendbericht-Jobs).
select d.jobid, j.jobname, d.status, d.start_time, d.end_time,
       left(coalesce(d.return_message, ''), 300) as return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname like 'vexfit-abendbericht-%'
  and d.start_time > now() - interval '3 days'
order by d.start_time desc;
