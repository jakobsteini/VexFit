-- ============================================================================
-- Vexfit - Tabelle fuer die Warteliste (Vormerkungen) der Kunden
-- Erzeugt am 24.10.2026. NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie legt die Tabelle public.warteliste an. Dort merkt sich ein Kunde mit
-- einem Klick einen Ort vor, wenn die Suche dort keinen einzigen Trainer
-- findet. So wird im Admin sichtbar, wo Nachfrage besteht, aber kein Trainer.
-- Je Vormerkung eine Zeile: Postleitzahl, Stadt, gewaehltes Ziel, gewaehlter
-- Umkreis - alles aus dem gefuehrten Einstieg uebernommen, nichts zusaetzlich
-- abgefragt. "ziel" ist die Mehrfachauswahl aus Frage 1 des Einstiegs, in
-- derselben Form wie such_eingaben.spezialisierungen.
--
-- ZUGRIFF:
-- Zeilenschutz (RLS) ist an. Ein angemeldeter Nutzer darf ausschliesslich
-- eigene Zeilen ANLEGEN und nur die EIGENEN lesen (damit er sieht, dass er
-- sich schon vorgemerkt hat). Nur das Admin-Konto darf alle Zeilen lesen und
-- den Vermerk "benachrichtigt" setzen, ueber die vorhandene Hilfsfunktion
-- public.ist_vexfit_admin(), die hier NUR verwendet und nicht veraendert wird.
-- Niemand darf loeschen, und ausser dem Admin darf niemand aendern: ohne
-- passende Regel bewirkt Postgres bei Zeilenschutz null betroffene Zeilen.
--
-- VORAUSSETZUNG:
-- Die Hilfsfunktion public.ist_vexfit_admin() muss existieren; sie stammt aus
-- 2026-09-20-admin-vollzugriff.sql und wird hier nur verwendet.
--
-- RUECKNAHME: 2026-10-24-warteliste-ruecknahme.sql entfernt genau das, was
-- diese Datei anlegt, und nur das. Die Hilfsfunktion bleibt unangetastet.
-- ============================================================================

-- Legt die Tabelle fuer die Warteliste mit allen geforderten Feldern an.
CREATE TABLE public.warteliste (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am    timestamptz NOT NULL DEFAULT now(),
  user_id        uuid        NOT NULL DEFAULT auth.uid(),
  plz            text,
  stadt          text,
  ziel           text[],
  umkreis        integer,
  benachrichtigt boolean     NOT NULL DEFAULT false
);

-- Beschreibt den Zweck der Tabelle fuer spaetere Leser im Datenbankschema.
COMMENT ON TABLE public.warteliste IS
  'Vormerkungen der Kunden fuer Orte ohne Trainer: je Vormerkung eine Zeile, um im Admin die Nachfrage ohne Angebot sichtbar zu machen.';

-- Schaltet den Zeilenschutz ein; ohne passende Regel ist danach kein Zugriff moeglich.
ALTER TABLE public.warteliste ENABLE ROW LEVEL SECURITY;

-- Nimmt den Rollen anon und authenticated alle etwaigen Standardrechte, damit nur die unten vergebenen Rechte gelten.
REVOKE ALL ON public.warteliste FROM anon, authenticated;

-- Erlaubt angemeldeten Nutzern, ausschliesslich die Datenspalten einer eigenen Zeile zu fuellen; id, Zeitpunkt, Nutzerkennung und der Benachrichtigt-Vermerk kommen aus den Vorgaben.
GRANT INSERT (plz, stadt, ziel, umkreis) ON public.warteliste TO authenticated;

-- Gibt der Rolle authenticated das Leserecht auf die Tabelle; welche Zeilen tatsaechlich lesbar sind, entscheidet allein die Leseregel weiter unten.
GRANT SELECT ON public.warteliste TO authenticated;

-- Erlaubt der Rolle authenticated, einzig die Spalte benachrichtigt zu aendern; dass das nur das Admin-Konto darf, entscheidet die Aenderungsregel weiter unten.
GRANT UPDATE (benachrichtigt) ON public.warteliste TO authenticated;

-- Erlaubt einem angemeldeten Nutzer, nur Zeilen mit der eigenen Nutzerkennung anzulegen.
CREATE POLICY "warteliste_eigene_anlegen"
  ON public.warteliste FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Erlaubt jedem Nutzer, seine eigenen Zeilen zu lesen, und dem Admin-Konto alle.
CREATE POLICY "warteliste_eigene_oder_admin_lesen"
  ON public.warteliste FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.ist_vexfit_admin());

-- Erlaubt ausschliesslich dem Admin-Konto, Zeilen zu aendern (den Vermerk benachrichtigt zu setzen).
CREATE POLICY "warteliste_admin_vermerk"
  ON public.warteliste FOR UPDATE TO authenticated
  USING (public.ist_vexfit_admin())
  WITH CHECK (public.ist_vexfit_admin());
