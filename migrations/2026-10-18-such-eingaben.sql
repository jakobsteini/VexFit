-- ============================================================================
-- Vexfit - Tabelle fuer die Sucheingaben des gefuehrten Einstiegs
-- Erzeugt am 18.10.2026. NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie legt die Tabelle public.such_eingaben an. Dort speichert der
-- Kundenbereich nach dem gefuehrten Einstieg genau eine Zeile je Suche:
-- welche Spezialisierungen, welche Trainingsart, welche Postleitzahl, welcher
-- Umkreis gewaehlt wurden und wie viele Trainer dabei gefunden wurden. So wird
-- erkennbar, wonach Kunden suchen und wo Trainer fehlen.
--
-- ZUGRIFF:
-- Zeilenschutz (RLS) ist an. Ein angemeldeter Nutzer darf ausschliesslich
-- eigene Zeilen ANLEGEN und KEINE lesen. Nur das Admin-Konto darf alle Zeilen
-- lesen, ueber die vorhandene Hilfsfunktion public.ist_vexfit_admin(), die hier
-- NUR verwendet und nicht veraendert wird. Niemand darf aendern oder loeschen:
-- es gibt dafuer keine Regel, und ohne passende Regel bewirkt Postgres bei
-- Zeilenschutz null betroffene Zeilen.
--
-- VORAUSSETZUNG:
-- Die Hilfsfunktion public.ist_vexfit_admin() muss existieren; sie stammt aus
-- 2026-09-20-admin-vollzugriff.sql und wird hier nur verwendet.
--
-- RUECKNAHME: 2026-10-18-such-eingaben-ruecknahme.sql entfernt genau das, was
-- diese Datei anlegt, und nur das. Die Hilfsfunktion bleibt unangetastet.
-- ============================================================================

-- Legt die Tabelle fuer die Sucheingaben mit allen geforderten Feldern an.
CREATE TABLE public.such_eingaben (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am       timestamptz NOT NULL DEFAULT now(),
  user_id           uuid        NOT NULL DEFAULT auth.uid(),
  spezialisierungen text[],
  trainingsart      text,
  plz               text,
  umkreis           integer,
  anzahl_treffer    integer
);

-- Beschreibt den Zweck der Tabelle fuer spaetere Leser im Datenbankschema.
COMMENT ON TABLE public.such_eingaben IS
  'Sucheingaben aus dem gefuehrten Einstieg im Kundenbereich: je Suche eine Zeile, um auszuwerten wonach Kunden suchen und wo Trainer fehlen.';

-- Schaltet den Zeilenschutz ein; ohne passende Regel ist danach kein Zugriff moeglich.
ALTER TABLE public.such_eingaben ENABLE ROW LEVEL SECURITY;

-- Nimmt den Rollen anon und authenticated alle etwaigen Standardrechte, damit nur die unten vergebenen Rechte gelten.
REVOKE ALL ON public.such_eingaben FROM anon, authenticated;

-- Erlaubt angemeldeten Nutzern, ausschliesslich die Datenspalten einer eigenen Zeile zu fuellen; id, Zeitpunkt und Nutzerkennung kommen aus den Vorgaben.
GRANT INSERT (spezialisierungen, trainingsart, plz, umkreis, anzahl_treffer) ON public.such_eingaben TO authenticated;

-- Gibt der Rolle authenticated das Leserecht auf die Tabelle; welche Zeilen tatsaechlich lesbar sind, entscheidet allein die Leseregel weiter unten.
GRANT SELECT ON public.such_eingaben TO authenticated;

-- Erlaubt einem angemeldeten Nutzer, nur Zeilen mit der eigenen Nutzerkennung anzulegen.
CREATE POLICY "such_eingaben_eigene_anlegen"
  ON public.such_eingaben FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Erlaubt ausschliesslich dem Admin-Konto, alle Zeilen zu lesen.
CREATE POLICY "such_eingaben_admin_lesen"
  ON public.such_eingaben FOR SELECT TO authenticated
  USING (public.ist_vexfit_admin());
