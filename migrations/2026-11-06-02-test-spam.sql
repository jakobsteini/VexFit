-- ============================================================================
-- Vexfit – B7 (Dauerlauf 05./06.11.2026): Test-/Spam-Konten markieren
-- Erzeugt am 06.11.2026. NICHT eingespielt (nur Datei).
--
-- Trainer, die offensichtlich Test- oder Spam-Konten sind, sollen im Admin
-- markiert und ausgeblendet werden – OHNE sie zu löschen. Markierte Konten
-- bekommen keine Erinnerungs-Mails mehr und zählen nicht im Abendbericht.
--
-- Umkehrbar: ist_test lässt sich jederzeit wieder auf false setzen.
-- Default false = unverändertes Verhalten für alle Bestandszeilen.
--
-- Zugriff: Der Admin setzt die Spalte ausschließlich serverseitig über
-- /admin-aktion (service_role, aal2). Keine neue Policy nötig – der Admin liest
-- trainers bereits vollständig (ist_vexfit_admin()).
--
-- Mehrfach ausführbar (ADD COLUMN IF NOT EXISTS).
-- RÜCKNAHME: migrations/ruecknahmen/2026-11-06-02-test-spam-ruecknahme.sql
-- ============================================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS ist_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trainers.ist_test IS
  'Vom Admin als Test-/Spam-Konto markiert (B7): ausgeblendet, keine Erinnerungs-Mails, nicht im Abendbericht. Nicht gelöscht, jederzeit umkehrbar.';

-- Teilindex: die (wenigen) markierten Konten schnell finden/ausschließen.
CREATE INDEX IF NOT EXISTS trainers_ist_test_idx
  ON public.trainers (ist_test) WHERE ist_test = true;
