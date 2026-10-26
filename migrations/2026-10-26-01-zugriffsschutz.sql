-- ============================================================================
-- Vexfit - Zugriffsschutz nachziehen (Spaltenrechte fuer authenticated)
-- Erzeugt am 26.10.2026. NICHT eingespielt.
--
-- WARUM:
-- 2026-09-19-zugriffsregeln-neuaufbau.sql vergibt an die Rolle authenticated
-- mehr Spaltenrechte, als die Seiten brauchen:
--   :102  GRANT SELECT, INSERT, UPDATE ON public.trainers  (alle Spalten)
--         -> ein Trainer kann ueber seine eigene Zeile (Policy
--            trainers_eigene_zeile_aendern) aktiv=true und stripe_bezahlt=true
--            selbst setzen.
--   :183  GRANT SELECT, INSERT ON public.anfragen  (alle Spalten, tabellenweit)
--   :187  GRANT UPDATE (status, weitergeleitet) ON public.anfragen
--         -> ein Trainer kann weitergeleitet=true setzen und bekaeme so
--            Kontaktdaten ohne Zahlung.
-- Das tabellenweite SELECT auf anfragen macht zudem
-- 2026-10-19-kundendaten-schutz.sql:39 (REVOKE SELECT (kunden_email)) wirkungslos:
-- ein Tabellenrecht deckt alle Spalten ab, ein einzelner Spalten-Entzug greift
-- daneben nicht.
--
-- GESCHAEFTSREGEL: aktiv, stripe_bezahlt, weitergeleitet duerfen nur die Edge
-- Functions (service_role) aendern. user_id und email werden nur bei der
-- Registrierung (INSERT) gesetzt - die INSERT-Rechte bleiben daher unberuehrt.
--
-- WAS DIESE DATEI TUT (nur Rechte, KEINE Policy wird geaendert):
--   trainers:  tabellenweites UPDATE von authenticated entziehen und nur die
--              Profilspalten einzeln erlauben, die die Seiten wirklich
--              schreiben (belegt, siehe unten).
--   anfragen:  UPDATE auf weitergeleitet entziehen; UPDATE (status) bleibt,
--              weil trainer-bereich.html:842 den Status setzt.
--   anfragen:  tabellenweites SELECT entziehen und SELECT spaltenweise auf alle
--              Spalten ausser kunden_email erlauben. anfragen_sichtbar laeuft
--              mit den Rechten ihres Eigentuemers und liest kunden_email weiter.
--
-- BELEG der Profilspalten (Stand 26.10.2026):
--   profil-bearbeiten.html:519-526  trainingsart, preis_stunde, bio, erfahrung,
--                                   spezialisierungen, trainingsort, telefon,
--                                   plz, stadt
--   trainer-bereich.html:596        avatar_url
--   trainer-bereich.html:889-895    trainingsart, preis_stunde, bio, erfahrung,
--                                   spezialisierungen, trainingsort, telefon
--   -> Vereinigung: trainingsart, preis_stunde, bio, erfahrung,
--      spezialisierungen, trainingsort, telefon, plz, stadt, avatar_url.
--
-- BELEG der anfragen-Lese-/Schreibspalten (Stand 26.10.2026):
--   gelesen direkt aus anfragen: admin.html:648 id; :688 created_at,
--     trainer_name, kunden_name, status, weitergeleitet; :723 trainer_id;
--     kunden-bereich.html:368 id, trainer_name, status, created_at.
--   geschrieben (UPDATE): trainer-bereich.html:842 status.
--   kunden_email wird von KEINER Seite direkt gelesen (nur ueber
--   anfragen_sichtbar) und bleibt deshalb hier ausgespart.
--
-- OFFENE LUECKE (nicht in dieser Datei geloest, nur benannt):
--   admin.html:888 setzt aktiv und admin.html:969 setzt stripe_bezahlt direkt
--   als angemeldetes Admin-Konto. Nach dieser Datei schlagen diese beiden
--   Schreibzugriffe fehl (Spaltenrecht fehlt), weil ein Spaltenrecht das
--   Admin-Konto nicht vom uebrigen authenticated unterscheiden kann. Das
--   Freischalten/Bezahlt-Setzen muesste ueber eine Edge Function (service_role)
--   laufen - das ist hier bewusst NICHT neu gebaut.
--
-- RLS (Zeilen-Regeln) werden NICHT abgeschwaecht; diese Datei aendert nur GRANTs.
--
-- RUECKNAHME: 2026-10-26-01-zugriffsschutz-ruecknahme.sql stellt die
-- tabellenweiten Rechte von 2026-09-19 wieder her.
-- ============================================================================

-- ------------------------------- trainers -----------------------------------

-- Entzieht das tabellenweite UPDATE-Recht (deckte alle Spalten ab, auch aktiv
-- und stripe_bezahlt).
REVOKE UPDATE ON public.trainers FROM authenticated;

-- Erlaubt wieder genau die belegten Profilspalten - und NUR diese.
GRANT UPDATE (trainingsart, preis_stunde, bio, erfahrung, spezialisierungen,
              trainingsort, telefon, plz, stadt, avatar_url)
  ON public.trainers TO authenticated;

-- ------------------------------- anfragen -----------------------------------

-- Entzieht das UPDATE-Recht auf status UND weitergeleitet, damit anschliessend
-- gezielt nur status wieder vergeben werden kann.
REVOKE UPDATE (status, weitergeleitet) ON public.anfragen FROM authenticated;

-- status bleibt beschreibbar (trainer-bereich.html setzt angenommen/abgelehnt);
-- weitergeleitet bleibt entzogen und darf nur die Edge Function setzen.
GRANT UPDATE (status) ON public.anfragen TO authenticated;

-- Entzieht das tabellenweite SELECT-Recht (deckte auch kunden_email ab und
-- machte den Spalten-Entzug aus 2026-10-19 wirkungslos).
REVOKE SELECT ON public.anfragen FROM authenticated;

-- Erlaubt SELECT spaltenweise auf alle Spalten AUSSER kunden_email. Damit
-- funktionieren die direkten Abfragen der Seiten und anfragen_sichtbar weiter;
-- kunden_email kommt nur noch ueber anfragen_sichtbar (nur bei weitergeleitet).
GRANT SELECT (id, created_at, trainer_id, trainer_name, kunden_name, ziel,
              nachricht, status, weitergeleitet)
  ON public.anfragen TO authenticated;
