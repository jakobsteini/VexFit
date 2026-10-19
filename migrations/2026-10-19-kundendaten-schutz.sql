-- ============================================================================
-- Vexfit - Kunden-E-Mail einer Anfrage erst nach Freischaltung sichtbar
-- Erzeugt am 19.10.2026. NICHT eingespielt.
--
-- WARUM:
-- Ein Trainer soll die Kontaktdaten (die Kunden-E-Mail) einer Anfrage erst sehen,
-- wenn die Anfrage bezahlt und freigeschaltet ist - genau wie die Mails: vor der
-- Zahlung zeigen mailErsteAnfrage/mailWeitereAnfrage nur Name, Ziel und Nachricht
-- (kern.ts:271-273 / 302-304), erst mailKundenDaten nach der Zahlung zeigt die
-- E-Mail (kern.ts:335). Die Freischaltung je Anfrage haelt anfragen.weitergeleitet
-- (index.ts:149-154, gesetzt nach der Zahlung).
--
-- WARUM IN DER DATENBANK:
-- Der oeffentliche Schluessel steht im Quelltext; wer ihn kopiert, fragt die
-- Tabelle direkt ab. Verstecken allein in der Webseite genuegt also nicht. RLS
-- (Zeilenschutz) kann Spalten aber nicht pro Zeile einschraenken. Das vom Projekt
-- genutzte Mittel fuer Spalten ist das Spaltenrecht (GRANT) - siehe Kopf von
-- 2026-09-19-zugriffsregeln-neuaufbau.sql. Der Weg hier, OHNE eine Policy oder
-- einen Schluessel zu aendern:
--   1. Der Rolle authenticated das DIREKTE Leserecht auf die Spalte kunden_email
--      nehmen. Danach kommt die E-Mail nicht mehr aus der Tabelle heraus.
--   2. Eine Sicht anlegen, die je angemeldetem Trainer nur dessen eigene Zeilen
--      zeigt und die kunden_email nur bei freigeschalteter Anfrage herausgibt,
--      sonst NULL. Die Sicht laeuft mit den Rechten ihres Eigentuemers (Standard
--      bei CREATE VIEW), liest die Spalte daher weiterhin; die Zeilenbeschraenkung
--      steht in ihrem WHERE (ersetzt fuer die Sicht die Leseregel der Tabelle).
--
-- EDGE FUNCTIONS: nutzen den Service-Role-Schluessel (index.ts:59-66) und umgehen
-- RLS wie Spaltenrechte - sie lesen kunden_email weiterhin und laufen unveraendert.
--
-- KEINE bestehende Policy und kein Schluessel wird geaendert; nur das Spaltenrecht
-- auf kunden_email wird entzogen und ein Leserecht auf die neue Sicht vergeben.
--
-- RUECKNAHME: 2026-10-19-kundendaten-schutz-ruecknahme.sql stellt genau den Stand
-- von davor wieder her.
-- ============================================================================

-- Nimmt der Rolle authenticated das direkte Leserecht auf die Kunden-E-Mail; sie kommt nur noch ueber die Sicht mit Bedingung.
REVOKE SELECT (kunden_email) ON public.anfragen FROM authenticated;

-- Legt die Sicht an: eigene Zeilen des angemeldeten Trainers, kunden_email nur bei freigeschalteter Anfrage (weitergeleitet = true), sonst NULL.
CREATE VIEW public.anfragen_sichtbar AS
  SELECT
    a.id,
    a.created_at,
    a.trainer_id,
    a.trainer_name,
    a.kunden_name,
    a.ziel,
    a.nachricht,
    a.status,
    a.weitergeleitet,
    CASE WHEN a.weitergeleitet IS TRUE THEN a.kunden_email ELSE NULL END AS kunden_email
  FROM public.anfragen a
  WHERE a.trainer_id IN (SELECT t.id FROM public.trainers t WHERE t.user_id = auth.uid());

-- Gibt der Rolle authenticated das Leserecht auf diese Sicht.
GRANT SELECT ON public.anfragen_sichtbar TO authenticated;
