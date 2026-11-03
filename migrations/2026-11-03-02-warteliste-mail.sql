-- ============================================================================
-- Vexfit – B4: Warteliste, die Kunden zurückholt (Bestätigung + Abmeldung)
-- Erzeugt am 03.11.2026. NICHT eingespielt (nur Datei).
--
-- Die „Benachrichtige mich"-Einträge liegen in public.trainer_alerts
-- (kunden_email, plz, stadt, radius, aktiv). Diese Migration ergänzt nur das
-- geheime Token für den Abmelde-Link (wie bei den Erinnerungs-Mails) und zwei
-- Indizes. Das Token steht nur in der Tabelle (service_role) und wird nie nach
-- außen sichtbar gemacht.
--
-- BEDEUTUNG VON aktiv:
--   aktiv = true   -> der Kunde wartet noch auf eine Benachrichtigung.
--   aktiv = false  -> erledigt: entweder er wurde über einen Trainer in seiner
--                     PLZ-Region informiert (B4, Freigabe) ODER er hat sich
--                     abgemeldet. In beiden Fällen bekommt er keine Mail mehr.
--
-- ZUGRIFF: unverändert. Der Versand läuft über die Edge Function (service_role,
-- SMTP). KEINE Lockerung von Zugriffsregeln.
--
-- Mehrfach ausführbar (ADD COLUMN/INDEX IF NOT EXISTS).
-- RÜCKNAHME: 2026-11-03-02-warteliste-mail-ruecknahme.sql.
-- ============================================================================

ALTER TABLE public.trainer_alerts
  ADD COLUMN IF NOT EXISTS abmelde_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Bestehende Zeilen ohne Token defensiv nachziehen.
UPDATE public.trainer_alerts
   SET abmelde_token = gen_random_uuid()
 WHERE abmelde_token IS NULL;

-- Schnelles, eindeutiges Nachschlagen beim Abmelde-Link.
CREATE UNIQUE INDEX IF NOT EXISTS trainer_alerts_abmelde_token_idx
  ON public.trainer_alerts (abmelde_token);

-- B4: bei der Freigabe werden offene Einträge einer PLZ gesucht.
CREATE INDEX IF NOT EXISTS trainer_alerts_offen_plz_idx
  ON public.trainer_alerts (plz)
  WHERE aktiv = true;
