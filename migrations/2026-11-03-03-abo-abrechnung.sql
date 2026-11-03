-- ============================================================================
-- Vexfit – B5: Abo-Abrechnung (Stripe-Lebenszyklus)
-- Erzeugt am 03.11.2026. NICHT eingespielt (nur Datei).
--
-- Bisher setzte nur checkout.session.completed stripe_bezahlt/aktiv. B5 ergänzt
-- in der Edge Function die Ereignisse invoice.paid, invoice.payment_failed und
-- customer.subscription.deleted. Dafür braucht trainers drei Spalten:
--   stripe_customer_id text        – die Stripe-Kunden-ID, damit spätere
--                                    Rechnungen (ohne client_reference_id) dem
--                                    Trainer zugeordnet werden können.
--   abo_status        text         – aktiv / zahlung_fehlgeschlagen / gekuendigt
--   abo_status_am     timestamptz  – wann der Status zuletzt gesetzt wurde
--
-- Der Admin liest trainers vollständig über die bestehenden Policies
-- (ist_vexfit_admin()); die neuen Spalten werden über select=* mitgelesen.
-- KEINE Lockerung von Zugriffsregeln. Gesetzt werden die Spalten ausschließlich
-- durch die Edge Function (service_role) im /stripe-Webhook.
--
-- Fehlt diese Migration, bleibt der Lebenszyklus still: der Webhook verbucht die
-- Zahlung wie bisher (stripe_bezahlt/aktiv) und überspringt die Abo-Spalten
-- (best effort, siehe kern.ts). Die Freigabe/Sperre über aktiv funktioniert auch
-- ohne die neuen Spalten.
--
-- Mehrfach ausführbar (ADD COLUMN/INDEX IF NOT EXISTS).
-- RÜCKNAHME: 2026-11-03-03-abo-abrechnung-ruecknahme.sql.
-- ============================================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS abo_status         text,
  ADD COLUMN IF NOT EXISTS abo_status_am      timestamptz;

-- Rechnungen/Kündigungen werden über die Stripe-Kunden-ID zugeordnet.
CREATE INDEX IF NOT EXISTS trainers_stripe_customer_id_idx
  ON public.trainers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.trainers.stripe_customer_id IS
  'Stripe-Kunden-ID (aus checkout.session.completed), für die Zuordnung späterer Rechnungen.';
COMMENT ON COLUMN public.trainers.abo_status IS
  'Abo-Status aus den Stripe-Webhooks: aktiv / zahlung_fehlgeschlagen / gekuendigt.';
COMMENT ON COLUMN public.trainers.abo_status_am IS
  'Zeitpunkt, zu dem abo_status zuletzt gesetzt wurde.';
