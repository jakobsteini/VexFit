-- /Users/js/Projekte/Vexfit/app/vexfit/migrations/2026-11-01-05-dashboard-admin-push-ruecknahme.sql
--
-- Ruecknahme zu 2026-11-01-05-dashboard-admin-push.sql. Entfernt die Objekte der
-- Teile D7/D8 (und A3-Push) wieder. public.ist_vexfit_admin() und
-- public.such_eingaben bleiben unangetastet (stammen aus anderen Migrationen).

-- A3 — Push-Abos
DROP TABLE IF EXISTS public.push_abos;

-- D8 — Nachfrage
DROP FUNCTION IF EXISTS public.nachfrage_region();

-- D7 — Profilaufrufe
DROP FUNCTION IF EXISTS public.profilaufrufe_30tage();
DROP FUNCTION IF EXISTS public.profilaufruf_zaehlen(uuid);
DROP TABLE IF EXISTS public.profilaufrufe;
