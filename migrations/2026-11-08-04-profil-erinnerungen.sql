-- ============================================================================
-- Vexfit – Protokoll der manuellen Profil-Erinnerungen (Dauerlauf 08.11.2026)
-- Erzeugt am 08.11.2026. NICHT eingespielt (nur Datei).
--
-- WAS DIESE DATEI TUT:
-- Legt die Tabelle public.profil_erinnerungen an. Sie protokolliert jede vom
-- Admin (Verwaltung) PER KLICK verschickte Profil-Erinnerung an einen
-- registrierten Trainer: wann, an wen und welche Angaben zu DEM Zeitpunkt
-- gefehlt haben. Daraus liest die Edge Function die 14-Tage-Sperre
-- (hoechstens eine Erinnerung je Trainer in 14 Tagen) und der Abendbericht die
-- Zeile „Profil-Erinnerungen (24 h / gesamt)".
--
-- Das ist NICHT die automatische Erinnerungsstufe (erinnerung_stufe auf der
-- Trainerzeile, Migration 2026-11-02-01) – diese Tabelle gehoert allein dem
-- manuellen, von Jakob ausgeloesten Versand.
--
-- RECHTE / RLS:
-- Nur die Service-Rolle (Edge Function) schreibt und liest. anon und
-- authenticated bekommen KEIN Recht – RLS ist an, es gibt KEINE Policy fuer
-- diese Rollen, und die Tabellenrechte werden ihnen entzogen. Der Admin sieht
-- „letzte Erinnerung am" ausschliesslich ueber die Edge-Aktion
-- (profil_erinnerung_liste, service_role), nie durch direktes Lesen.
--
-- Mehrfach ausfuehrbar (IF NOT EXISTS / idempotente GRANT-Ruecknahme).
-- RUECKNAHME: migrations/ruecknahmen/2026-11-08-04-profil-erinnerungen-ruecknahme.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profil_erinnerungen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id       uuid NOT NULL REFERENCES public.trainers (id) ON DELETE CASCADE,
  gesendet_am      timestamptz NOT NULL DEFAULT now(),
  -- Die zum Sendezeitpunkt fehlenden Angaben in Klartext (z. B. {"Foto","Preis pro Stunde"}).
  fehlende_angaben text[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.profil_erinnerungen IS
  'Protokoll der manuell (Verwaltung, per Klick) verschickten Profil-Erinnerungen an Trainer. Nur service_role.';

-- Schnelle „letzte Erinnerung je Trainer"-Abfrage.
CREATE INDEX IF NOT EXISTS profil_erinnerungen_trainer_zeit_idx
  ON public.profil_erinnerungen (trainer_id, gesendet_am DESC);

-- RLS an, KEINE Policy fuer anon/authenticated -> diese Rollen sehen nichts.
ALTER TABLE public.profil_erinnerungen ENABLE ROW LEVEL SECURITY;

-- Defensiv: jedes Tabellenrecht von anon/authenticated entziehen (service_role
-- umgeht RLS und Tabellenrechte ohnehin).
REVOKE ALL ON public.profil_erinnerungen FROM anon, authenticated;
