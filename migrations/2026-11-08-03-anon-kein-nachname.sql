-- ============================================================================
-- Vexfit – anon verliert den Lesezugriff auf den vollen Nachnamen
-- (Dauerlauf 08.11.2026, D1 / Korrektur). Erzeugt am 08.11.2026,
-- ueberarbeitet am 08.11.2026. NICHT eingespielt (nur Datei).
--
-- ----------------------------------------------------------------------------
-- WARUM DIE ERSTE FASSSUNG WIRKUNGSLOS WAR (Befund):
--   Die erste Fassung tat nur  REVOKE SELECT (nachname) ... FROM anon .
--   In PostgreSQL hebt ein SPALTEN-REVOKE ein bereits bestehendes
--   TABELLEN-/SICHT-weites  GRANT SELECT  NICHT auf. anon hat auf
--   public.trainers_oeffentlich ein sichtweites GRANT (angelegt in
--   2026-10-26-oeffentliche-trainer.sql, danach bei jeder Neudefinition der
--   Sicht erneuert, zuletzt in 2026-10-31-10-sichtbarkeit-admin-entscheidet.sql).
--   Solange dieses sichtweite SELECT besteht, bleibt nachname fuer anon lesbar.
--   Ein Spalten-REVOKE lief also ins Leere.
--
-- WAS DIESE FASSUNG STATTDESSEN TUT (wirksam):
--   1. Dem anon das SICHTWEITE SELECT auf trainers_oeffentlich ENTZIEHEN.
--   2. Dem anon danach ein SPALTEN-GRANT NUR auf die oeffentlich unbedenklichen
--      Spalten geben – OHNE nachname (und ohne je eine Kontakt-/Adressspalte,
--      falls die Sicht einmal eine bekaeme: Fail-Closed-Allowlist unten).
--   Ergebnis: anon kann die Karten weiter laden, aber eine Abfrage, die
--   nachname auswaehlt, scheitert mit „permission denied for ... nachname".
--
-- BASISTABELLE public.trainers WIRD BEWUSST NICHT ANGEFASST:
--   anon hat auf public.trainers seit 2026-10-12-anon-kein-trainer-lesen.sql
--   GAR KEIN SELECT (weder Tabelle noch Spalte) und keine Lese-Policy. Ein
--   REVOKE dort waere folgenlos. Und die Sicht laeuft mit
--   security_invoker = false (Eigentuemerrechte), liest die Basistabelle also
--   NICHT mit anon-Rechten – ein Eingriff an der Basistabelle wuerde die Sicht
--   fuer anon weder schuetzen noch brechen. Deshalb: nichts an trainers aendern.
--
-- trainers_vorschau BLEIBT fuer anon voll lesbar (enthaelt nur
--   nachname_initial, keinen vollen Nachnamen) – der einzige vorgesehene
--   anon-Weg. authenticated BLEIBT auf beiden Sichten unveraendert.
--
-- ALLE anon-LESER (Stand 08.11.2026), damit nichts bricht:
--   * suche.html  ladeVorschau()     -> trainers_vorschau (bevorzugt)
--   * suche.html  ladeOeffentlich()  -> trainers_oeffentlich, feste Spaltenliste
--                                       OEFFENTLICHE_SPALTEN (seit D1 OHNE nachname)
--   * profil.html ladeProfilVorschau()-> trainers_vorschau, Rueckfall
--                                        trainers_oeffentlich OHNE nachname
--   KEINER fragt fuer anon „nachname" oder „select=*" an -> kein Weg bricht.
--
-- IDEMPOTENT (mehrfach ausfuehrbar): REVOKE ist folgenlos, wenn schon entzogen;
--   das Spalten-GRANT wird neu gesetzt; fehlende Allowlist-Spalten werden
--   uebersprungen.
-- REIHENFOLGE: nach 2026-11-08-01-trainers-vorschau.sql UND nach der letzten
--   Neudefinition der Sicht (2026-10-31-10) einspielen. Dies ist die juengste
--   Migration, daher am Ende.
-- RUECKNAHME: migrations/ruecknahmen/2026-11-08-03-anon-kein-nachname-ruecknahme.sql
-- PRUEFUNG:   docs/pruefung/2026-11-08-03-pruefung.sql (nur lesend)
--             werkzeuge/pruef-anon-rest.mjs            (nur lesend)
-- ============================================================================

-- 1. Das sichtweite SELECT entziehen. OHNE diesen Schritt bleibt jeder
--    Spalten-Entzug wirkungslos. Folgenlos, falls bereits entzogen.
REVOKE SELECT ON public.trainers_oeffentlich FROM anon;

-- 2. Spalten-GRANT nur auf die unbedenklichen Spalten. Fail-Closed-Allowlist:
--    nur ausdruecklich aufgefuehrte Spalten werden freigegeben; nachname (und
--    jede kuenftige Kontakt-/Adressspalte) ist NICHT dabei und bleibt gesperrt.
--    Allowlist wird mit den real vorhandenen Spalten geschnitten, damit die
--    Migration nicht an einer spaeter entfernten Spalte scheitert.
DO $$
DECLARE
  erlaubt text[] := ARRAY[
    'id', 'vorname', 'stadt', 'plz', 'land',
    'trainingsart', 'trainingsort', 'spezialisierungen', 'bio',
    'preis_stunde', 'preis_monat', 'avatar_url', 'video_url',
    'sprachen', 'trainingsorte', 'galerie', 'verifiziert',
    'probetraining', 'probetraining_kostenlos',
    'antwort_stunden', 'antwort_basis', 'created_at', 'verfuegbarkeit'
  ];
  vorhanden text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO vorhanden
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'trainers_oeffentlich'
    AND column_name  = ANY (erlaubt);

  IF vorhanden IS NULL THEN
    RAISE EXCEPTION
      'trainers_oeffentlich: keine erlaubte Spalte gefunden – Sicht fehlt oder wurde umbenannt (zuerst 2026-11-08-01 bzw. 2026-10-31-10 einspielen).';
  END IF;

  EXECUTE format(
    'GRANT SELECT (%s) ON public.trainers_oeffentlich TO anon', vorhanden);
END $$;
