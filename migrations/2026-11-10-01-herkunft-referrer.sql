-- Dauerlauf 10.11.2026 – E3 „Herkunft messen".
-- Neue Herkunfts-Signale: Referrer-DOMAIN (ohne Pfad/Parameter) und utm_medium.
-- Keine Personendaten: nur grobe Kampagnen-/Verweis-Kennungen.
-- NUR Datei anlegen, NICHT einspielen. Rücknahme:
--   migrations/ruecknahmen/2026-11-10-01-herkunft-referrer-ruecknahme.sql
-- Reihenfolge: nach 2026-11-06-01-trichter.sql (legt die Herkunfts-Spalten an).

-- 1) Anonymer Trichter: Referrer-Domain je Ereignis -------------------------
ALTER TABLE public.trichter_ereignisse ADD COLUMN IF NOT EXISTS referrer text;

ALTER TABLE public.trichter_ereignisse DROP CONSTRAINT IF EXISTS trichter_referrer_laenge;
ALTER TABLE public.trichter_ereignisse
  ADD CONSTRAINT trichter_referrer_laenge CHECK (char_length(COALESCE(referrer, '')) <= 190);

-- 2) Strukturierte Herkunft je Registrierung: Referrer + Medium -------------
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft_referrer text;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS herkunft_medium   text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft_referrer text;
ALTER TABLE public.kunden   ADD COLUMN IF NOT EXISTS herkunft_medium   text;

COMMENT ON COLUMN public.trichter_ereignisse.referrer IS
  'E3: Referrer-DOMAIN beim ersten Seitenaufruf (ohne Pfad/Parameter). Keine Personendaten.';
