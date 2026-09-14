-- ============================================================================
-- Vexfit - Zugriffsregeln fuer alle sechs Tabellen
-- Erzeugt am 14.09.2026. NICHT eingespielt.
--
-- ACHTUNG, vor dem Einspielen lesen:
-- Diese Regeln setzen voraus, dass angemeldete Bereiche ihre Abfragen mit dem
-- Zugangs-Token des Nutzers senden. Der heutige Code sendet fast ueberall den
-- oeffentlichen anon-Schluessel, auch im Trainer- und Kundenbereich. Mit diesem
-- Schluessel ist auth.uid() leer, also greift keine der Eigentuemer-Regeln.
-- Was danach nicht mehr funktioniert, steht im Sitzungsbericht unter Punkt 5.
--
-- Zwei Ebenen wirken zusammen:
--   Zeilen  -> Row Level Security mit Policies
--   Spalten -> GRANT, denn RLS kann keine einzelnen Spalten einschraenken
-- ============================================================================


-- ============================ trainers ======================================
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

-- Nimmt dem nicht angemeldeten Besucher zunaechst jedes Recht an der Tabelle.
REVOKE ALL ON public.trainers FROM anon;

-- Erlaubt dem nicht angemeldeten Besucher genau die Spalten, die Suche und
-- oeffentliches Profil anzeigen. E-Mail, Telefon, user_id, stripe_bezahlt,
-- preis_online und alert_sent sind bewusst nicht dabei.
GRANT SELECT (id, created_at, vorname, nachname, stadt, plz, trainingsart,
              erfahrung, spezialisierungen, bio, preis_stunde, preis_monat,
              zertifikate, calendly, avatar_url, aktiv)
  ON public.trainers TO anon;

-- Erlaubt dem nicht angemeldeten Besucher, bei der Registrierung ein
-- Trainerprofil anzulegen.
GRANT INSERT (vorname, nachname, email, telefon, stadt, plz, trainingsart,
              erfahrung, spezialisierungen, bio, preis_stunde, preis_monat,
              zertifikate, calendly, stripe_bezahlt, aktiv, user_id)
  ON public.trainers TO anon;

-- Gibt dem angemeldeten Nutzer Zugriff auf alle Spalten; welche Zeilen er
-- sieht, entscheiden die Regeln darunter.
GRANT SELECT, INSERT, UPDATE ON public.trainers TO authenticated;

-- Zeigt nicht angemeldeten Besuchern ausschliesslich freigeschaltete Trainer.
CREATE POLICY "trainers_oeffentlich_nur_aktive"
  ON public.trainers FOR SELECT TO anon
  USING (aktiv = true);

-- Zeigt angemeldeten Nutzern die freigeschalteten Trainer und zusaetzlich die
-- eigene Zeile, auch wenn diese noch nicht freigeschaltet ist.
CREATE POLICY "trainers_angemeldet_lesen"
  ON public.trainers FOR SELECT TO authenticated
  USING (aktiv = true OR user_id = auth.uid());

-- Laesst bei der Registrierung ein neues Trainerprofil zu, aber nur als noch
-- nicht freigeschaltet, damit sich niemand selbst sichtbar schalten kann.
CREATE POLICY "trainers_registrieren"
  ON public.trainers FOR INSERT TO anon, authenticated
  WITH CHECK (aktiv = false);

-- Erlaubt einem angemeldeten Trainer, ausschliesslich seine eigene Zeile zu
-- aendern.
CREATE POLICY "trainers_eigene_zeile_aendern"
  ON public.trainers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================= kunden =======================================
ALTER TABLE public.kunden ENABLE ROW LEVEL SECURITY;

-- Nimmt dem nicht angemeldeten Besucher jedes Leserecht an den Kundendaten.
REVOKE ALL ON public.kunden FROM anon;

-- Erlaubt dem nicht angemeldeten Besucher ausschliesslich, sich bei der
-- Registrierung selbst einzutragen.
GRANT INSERT (vorname, nachname, email, stadt, plz, ziel, erwartungen, user_id)
  ON public.kunden TO anon;

-- Gibt dem angemeldeten Nutzer Zugriff auf alle Spalten; die Zeilen regelt die
-- Regel darunter.
GRANT SELECT, INSERT, UPDATE ON public.kunden TO authenticated;

-- Laesst bei der Registrierung einen neuen Kundeneintrag zu.
CREATE POLICY "kunden_registrieren"
  ON public.kunden FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Zeigt einem angemeldeten Kunden nur seine eigene Zeile. Der Abgleich laeuft
-- ueber user_id und zusaetzlich ueber die E-Mail, weil ein Altbestand ohne
-- user_id existiert.
CREATE POLICY "kunden_eigene_zeile_lesen"
  ON public.kunden FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'));

-- Erlaubt einem angemeldeten Kunden, ausschliesslich seine eigene Zeile zu
-- aendern.
CREATE POLICY "kunden_eigene_zeile_aendern"
  ON public.kunden FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'))
  WITH CHECK (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'));


-- ============================ anfragen ======================================
ALTER TABLE public.anfragen ENABLE ROW LEVEL SECURITY;

-- Nimmt dem nicht angemeldeten Besucher jedes Leserecht an den Anfragen.
REVOKE ALL ON public.anfragen FROM anon;

-- Erlaubt dem nicht angemeldeten Besucher ausschliesslich, eine Anfrage
-- abzuschicken, damit die Kontaktaufnahme weiter funktioniert.
GRANT INSERT (trainer_email, trainer_name, kunden_email, kunden_name, ziel,
              nachricht, status, weitergeleitet)
  ON public.anfragen TO anon;

-- Gibt dem angemeldeten Nutzer Zugriff auf alle Spalten; die Zeilen regelt die
-- Regel darunter.
GRANT SELECT, INSERT ON public.anfragen TO authenticated;

-- Laesst das Abschicken einer Anfrage zu.
CREATE POLICY "anfragen_anlegen"
  ON public.anfragen FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Zeigt eine Anfrage nur den beiden Beteiligten, also dem angeschriebenen
-- Trainer und dem anfragenden Kunden. Verglichen wird die E-Mail aus dem
-- Zugangs-Token, weil die Tabelle keine user_id hat.
CREATE POLICY "anfragen_nur_beteiligte_lesen"
  ON public.anfragen FOR SELECT TO authenticated
  USING (trainer_email = (auth.jwt() ->> 'email')
      OR kunden_email  = (auth.jwt() ->> 'email'));


-- ================== nachrichten, favoriten, bewertungen =====================
-- Keine dieser drei Tabellen wird von irgendeiner Seite gelesen oder
-- beschrieben. Sie werden vollstaendig gesperrt: Zeilenschutz an, alle Rechte
-- entzogen, keine einzige Regel. Damit kommt weder ein nicht angemeldeter noch
-- ein angemeldeter Besucher heran. Sobald eine Funktion sie braucht, bekommen
-- sie eigene Regeln.

ALTER TABLE public.nachrichten ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nachrichten FROM anon, authenticated;

ALTER TABLE public.favoriten ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.favoriten FROM anon, authenticated;

ALTER TABLE public.bewertungen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bewertungen FROM anon, authenticated;
