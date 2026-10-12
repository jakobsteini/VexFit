-- ============================================================================
-- Vexfit - Der Rolle anon das Lesen der Trainertabelle entziehen
-- Erzeugt am 12.10.2026. NICHT eingespielt.
--
-- WARUM DIESE DATEI:
-- suche.html und profil.html leiten Nichtangemeldete zwar auf die
-- Registrierung um, aber das ist nur eine Umleitung im Browser. Die Datenbank
-- gibt freigeschaltete Trainer weiterhin an die Rolle anon heraus (gemessen:
-- GET trainers?aktiv=eq.true liefert als anon HTTP 200). Wer den oeffentlichen
-- Schluessel aus dem Quelltext kopiert, liest damit die ganze Trainerliste.
-- Diese Migration macht den Schutz echt: anon darf trainers nicht mehr lesen.
--
-- WAS UNANGETASTET BLEIBT:
--   - Das Anlegen eines Trainerprofils bei der Registrierung (anon INSERT +
--     Regel "trainers_registrieren").
--   - Das Lesen durch angemeldete Nutzer (Regel "trainers_angemeldet_lesen")
--     und die eigene Zeile eines Trainers (Regel "trainers_eigene_zeile_aendern").
--   - Die am 20.09.2026 gesetzten Admin-Regeln.
--
-- RUECKNAHME: 2026-10-12-anon-kein-trainer-lesen-ruecknahme.sql stellt genau
-- diese zwei entzogenen Rechte wieder her und nichts sonst.
--
-- ACHTUNG, VORHER LESEN: suche.html (Zeile 367) und profil.html (Zeile 273)
-- senden derzeit den anon-Schluessel auch im Authorization-Kopf - nicht das
-- Nutzer-Token. Nach dem Einspielen koennen deshalb AUCH angemeldete Nutzer
-- ueber diese beiden Seiten keine Trainer mehr lesen. Die Seiten muessen
-- zuerst darauf umgestellt werden, das Token aus vexfit_session im
-- Authorization-Kopf zu senden (der anon-Schluessel bleibt nur im apikey-Kopf).
-- Das ist das Nutzer-Token, KEIN Schluessel mit mehr Rechten - es gehoert
-- weiterhin ins Frontend. Details im Sitzungsbericht.
-- ============================================================================


-- Entfernt die Regel, die der Rolle anon das Lesen freigeschalteter Trainer
-- erlaubt; ohne sie trifft bei eingeschaltetem Zeilenschutz keine Leseregel
-- mehr auf anon zu.
DROP POLICY IF EXISTS "trainers_oeffentlich_nur_aktive" ON public.trainers;

-- Nimmt der Rolle anon das Spalten-Leserecht an der Tabelle wieder weg, das die
-- Migration vom 19.09.2026 vergeben hatte; Policies allein genuegen nicht,
-- weil das SELECT-Recht auf Spaltenebene erteilt wurde.
REVOKE SELECT ON public.trainers FROM anon;
