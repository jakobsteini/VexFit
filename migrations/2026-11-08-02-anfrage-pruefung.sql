-- ============================================================================
-- Vexfit – Anfrage-Pruefung „Zur Pruefung" (Dauerlauf 07./08.11.2026, S3)
-- Erzeugt am 08.11.2026. NICHT eingespielt (nur Datei).
--
-- WARUM:
-- Weil die E-Mail-Bestaetigung ausgeschaltet wird, koennen Anfragen leichter
-- missbraucht werden. Die Edge Function vexfit-automation (/neue-anfrage) prueft
-- jede Anfrage auf Verdacht (Wegwerf-Mail-Domain, unsinniger Name/Nachricht).
-- Verdaechtige Anfragen gehen NICHT an den Trainer, sondern werden hier als
-- „zur Pruefung" markiert; der Admin gibt sie frei oder verwirft sie.
--
-- WAS DIESE DATEI TUT:
-- - anfragen.pruef_status text DEFAULT 'ok', erlaubt nur 'ok'|'zur_pruefung'|
--   'verworfen'. Bestehende Zeilen bekommen 'ok' (Default) – nichts wird
--   zurueckgehalten.
-- - anfragen.pruef_grund text (kurze, nicht personenbezogene Kennung des Grunds).
-- - Index auf pruef_status fuer die Admin-Liste „Zur Pruefung".
--
-- ZUGRIFF: unveraendert. Das Setzen auf 'zur_pruefung'/'ok'/'verworfen' macht
-- ausschliesslich die Edge Function mit service_role (umgeht RLS). Der Browser
-- legt Anfragen wie bisher an; fehlt pruef_status im Insert, greift der Default
-- 'ok'. (Ein Client koennte 'ok' setzen – das ist derselbe Default; ein anderer
-- Wert schadet nur ihm selbst, da der Server den Verdacht ohnehin selbst setzt.)
--
-- Mehrfach ausfuehrbar (ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
-- RUECKNAHME: migrations/ruecknahmen/2026-11-08-02-anfrage-pruefung-ruecknahme.sql
-- ============================================================================

ALTER TABLE public.anfragen ADD COLUMN IF NOT EXISTS pruef_status text DEFAULT 'ok';
ALTER TABLE public.anfragen ADD COLUMN IF NOT EXISTS pruef_grund  text;

ALTER TABLE public.anfragen DROP CONSTRAINT IF EXISTS anfragen_pruef_status_werte;
ALTER TABLE public.anfragen
  ADD CONSTRAINT anfragen_pruef_status_werte
  CHECK (pruef_status IS NULL OR pruef_status IN ('ok','zur_pruefung','verworfen'));

-- Bestehende Zeilen ohne Wert defensiv auf 'ok' setzen (kein Zurueckhalten).
UPDATE public.anfragen SET pruef_status = 'ok' WHERE pruef_status IS NULL;

COMMENT ON COLUMN public.anfragen.pruef_status IS
  'S3: ok = normal zugestellt; zur_pruefung = verdaechtig, nicht an den Trainer, wartet auf Admin; verworfen = vom Admin abgelehnt.';
COMMENT ON COLUMN public.anfragen.pruef_grund IS
  'S3: kurze Kennung des Verdachtsgrunds (z. B. wegwerf-mail, name-unsinnig). Keine Personendaten.';

CREATE INDEX IF NOT EXISTS anfragen_pruef_status_idx
  ON public.anfragen (pruef_status)
  WHERE pruef_status = 'zur_pruefung';
