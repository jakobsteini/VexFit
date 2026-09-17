-- ============================================================================
-- Vexfit - Kennung des Trainers in der Tabelle anfragen
-- Erzeugt am 17.09.2026. NICHT eingespielt.
--
-- Warum: Das Anfrageformular schrieb bisher die E-Mail-Adresse des Trainers in
-- die Anfragezeile. Diese Adresse soll fuer nicht angemeldete Besucher nicht
-- mehr lesbar sein. Statt der Adresse wird kuenftig die Kennung des Trainers
-- gespeichert. Die Tabelle anfragen hat dafuer bisher keine Spalte.
--
-- REIHENFOLGE: Diese Datei zuerst einspielen, DANACH den Code pushen. Umgekehrt
-- schlaegt jede neue Anfrage mit HTTP 400 fehl, weil die Spalte noch fehlt.
-- ============================================================================

-- Legt die Kennung des Trainers an. Verweist auf die Trainertabelle; wird ein
-- Trainer geloescht, bleibt die Anfrage erhalten und die Kennung wird geleert.
ALTER TABLE public.anfragen
  ADD COLUMN IF NOT EXISTS trainer_id uuid
  REFERENCES public.trainers(id) ON DELETE SET NULL;

-- Beschleunigt die Abfrage im Trainerbereich, die kuenftig nach dieser Kennung
-- statt nach der E-Mail-Adresse sucht.
CREATE INDEX IF NOT EXISTS anfragen_trainer_id_idx
  ON public.anfragen (trainer_id);

-- Traegt die Kennung fuer bereits vorhandene Anfragen nach, damit sie im
-- Trainerbereich weiterhin auftauchen. Ordnet ueber die bisher gespeicherte
-- E-Mail-Adresse zu.
UPDATE public.anfragen a
   SET trainer_id = t.id
  FROM public.trainers t
 WHERE a.trainer_id IS NULL
   AND a.trainer_email = t.email;
