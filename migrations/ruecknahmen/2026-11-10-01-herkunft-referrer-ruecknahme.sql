-- Rücknahme zu 2026-11-10-01-herkunft-referrer.sql (E3).
ALTER TABLE public.trichter_ereignisse DROP CONSTRAINT IF EXISTS trichter_referrer_laenge;
ALTER TABLE public.trichter_ereignisse DROP COLUMN IF EXISTS referrer;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft_referrer;
ALTER TABLE public.trainers DROP COLUMN IF EXISTS herkunft_medium;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft_referrer;
ALTER TABLE public.kunden   DROP COLUMN IF EXISTS herkunft_medium;
