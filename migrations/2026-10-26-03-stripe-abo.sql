-- ============================================================================
-- Vexfit - Felder fuer das Trainer-Abo (Stripe)
-- Erzeugt am 26.10.2026. NICHT eingespielt. Reihenfolge: nach 02.
--
-- WARUM:
-- Geschaeftsregel: ab dem ersten Kunden 49,99 EUR pro Monat als Abo; faellt das
-- Abo weg (Kuendigung / fehlgeschlagene Zahlung), soll der Trainer wieder den
-- 49,99-Link bekommen - die bestehende Oberflaeche zeigt bereits den 49,99-Link,
-- sobald trainers.stripe_bezahlt = false ist (trainer-bereich.html:805-806).
--
-- Diese Datei legt NUR die Felder an, die der Webhook dafuer braucht:
--   stripe_customer_id - verknuepft spaetere Abo-Ereignisse (subscription.*,
--                        invoice.*) mit dem Trainer; wird beim ersten Checkout
--                        aus session.customer gespeichert.
--   abo_aktiv_bis      - Ende des bezahlten Zeitraums aus invoice.paid.
--
-- OFFENE PUNKTE (siehe Sitzungsbericht): Ob der 49,99-Link bei Stripe wirklich
-- als Abo (Subscription) angelegt ist und WELCHE Ereignisse Stripe schickt,
-- laesst sich hier nicht pruefen. Die Webhook-Verarbeitung dieser Ereignisse
-- wurde deshalb noch NICHT verdrahtet; sie wird ergaenzt, sobald die Stripe-
-- Einrichtung bestaetigt ist. Diese Spalten sind additiv und schaden nicht,
-- falls das Abo-Modell anders umgesetzt wird.
--
-- RUECKNAHME: 2026-10-26-03-stripe-abo-ruecknahme.sql entfernt beide Spalten.
-- ============================================================================

ALTER TABLE public.trainers ADD COLUMN stripe_customer_id text;
ALTER TABLE public.trainers ADD COLUMN abo_aktiv_bis timestamptz;

-- Nur die Edge Function (service_role) setzt diese Felder; weder anon noch
-- authenticated erhalten darauf ein Schreibrecht (es wird hier keines vergeben).
COMMENT ON COLUMN public.trainers.stripe_customer_id IS
  'Stripe-Kundenkennung (cus_...), aus dem ersten Checkout; verknuepft Abo-Ereignisse mit dem Trainer. Nur service_role schreibt.';
COMMENT ON COLUMN public.trainers.abo_aktiv_bis IS
  'Ende des bezahlten Abo-Zeitraums (aus invoice.paid). Nur service_role schreibt.';
