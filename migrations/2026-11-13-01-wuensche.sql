-- ============================================================================
-- Vexfit – G1 (Dauerlauf 13.11.2026): „Wunsch abgeben" (Kunde ohne Konto)
-- Erzeugt am 13.11.2026. NICHT eingespielt (nur Datei).
--
-- ZWECK: Ab 19.11. soll ein Leser OHNE Konto über /wunsch.html hinterlassen
-- können, was er sucht. Diese Wünsche landen in public.wuensche; Jakob vermittelt
-- sie in der Verwaltung an einen Trainer (G2). Es gibt KEINEN öffentlichen
-- Lesezugriff auf Trainerdaten – der Wunsch ist eine reine Nachfrage-Zeile.
--
-- ZUGRIFF (sehr eng):
--   - Zeilenschutz an, KEINE Policy für anon/authenticated. Niemand liest oder
--     schreibt public.wuensche direkt. Das Einfügen läuft ausschließlich über die
--     Edge-Aktion /vexfit-automation/wunsch (service_role, umgeht RLS). Die
--     Verwaltung liest/ändert ebenfalls nur serverseitig über /admin-aktion
--     (service_role, aal2). So steht in der Zeile zwar eine E-Mail/Telefon des
--     Interessenten, aber sie ist nie über den öffentlichen anon/authenticated-
--     Schlüssel erreichbar.
--   - Standardrechte werden anon/authenticated entzogen (kein versehentlicher
--     Zugriff), es werden KEINE neuen GRANTs vergeben.
--
-- STATUS-WERTE (Lebenslauf eines Wunsches):
--   neu                -> frisch eingegangen, noch nichts getan
--   in_bearbeitung     -> Jakob kümmert sich (optional, manuell)
--   an_trainer_gesendet-> als Anfrage an einen Trainer weitergegeben (G2)
--   vermittelt         -> Trainer hat die Anfrage angenommen (Zahlung greift)
--   kein_trainer       -> kein passender Trainer, Kunde freundlich informiert
--   abgeschlossen      -> erledigt/abgelegt
--
-- HERKUNFT: quelle/kampagne/inhalt (utm) und referrer wie in E3 (Trichter), nur
--   zur groben Zuordnung der Nachfrage. Keine Personenprofile.
--
-- Mehrfach ausführbar (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- RÜCKNAHME: migrations/ruecknahmen/2026-11-13-01-wuensche-ruecknahme.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wuensche (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz,
  status        text        NOT NULL DEFAULT 'neu'
                 CHECK (status IN ('neu','in_bearbeitung','an_trainer_gesendet',
                                   'vermittelt','kein_trainer','abgeschlossen')),
  -- Kontakt des Interessenten (ohne Konto).
  vorname       text        NOT NULL,
  email         text        NOT NULL,
  telefon       text,
  nachricht     text,
  -- Suche.
  land          text        CHECK (land IN ('AT','DE','CH')),
  plz           text,
  stadt         text,
  ziel          text,
  haeufigkeit   text,
  zeiten        text,
  budget        text,
  -- Vermittlung.
  trainer_id    uuid,
  anfrage_id    uuid,
  -- Herkunft (E3), grob.
  quelle        text,
  kampagne      text,
  inhalt        text,
  referrer      text,
  -- Spam-Verdacht (Wegwerf-Mail / unsinniger Name/Text): gesetzt = zur Prüfung,
  -- keine Bestätigungsmail an den (vermutlich falschen) Kontakt. NULL = unauffällig.
  verdacht      text
);

COMMENT ON TABLE public.wuensche IS
  'G1 (13.11.2026): Trainer-Wünsche von Interessenten OHNE Konto (über /wunsch.html). Nur service_role (Edge-Aktion wunsch / admin-aktion). Kein anon/authenticated-Zugriff.';

-- Zeilenschutz an; ohne Policy kein Zugriff außer service_role.
ALTER TABLE public.wuensche ENABLE ROW LEVEL SECURITY;

-- Standardrechte entziehen. Es werden bewusst KEINE GRANTs vergeben: weder anon
-- noch authenticated dürfen lesen/schreiben. Der einzige Weg hinein ist die
-- Edge-Aktion (service_role).
REVOKE ALL ON public.wuensche FROM anon, authenticated;

-- Offene/neue Wünsche schnell finden (Verwaltung „Wünsche", G2).
CREATE INDEX IF NOT EXISTS wuensche_status_idx
  ON public.wuensche (status, erstellt_am DESC);
