-- ============================================================================
-- Vexfit – anon verliert den Lesezugriff auf den vollen Nachnamen
-- (Dauerlauf 08.11.2026, D1). Erzeugt am 08.11.2026. NICHT eingespielt (Datei).
--
-- ZIEL: Nicht angemeldete Besucher (Rolle anon) duerfen den vollen Nachnamen
-- NICHT mehr lesen. Nach dieser Migration liefert die Datenbank anon den
-- Nachnamen selbst dann nicht, wenn im Seitencode je wieder ein Feld "nachname"
-- angefragt wuerde (Verteidigung in der Tiefe zusaetzlich zum Code-Fix).
--
-- SICHTEN/TABELLEN MIT nachname, die anon theoretisch lesen koennte:
--   * public.trainers_oeffentlich  – GRANT SELECT an anon vorhanden; enthaelt
--     nachname (einzige PII-Spalte dieser Sicht; email/telefon/user_id sind
--     NICHT enthalten). -> hier wird der Spalten-Lesezugriff entzogen.
--   * public.trainers (Basistabelle) – anon hat KEIN SELECT (entzogen in
--     2026-10-12-anon-kein-trainer-lesen.sql; die Sichten laufen als Eigentuemer,
--     security_invoker=false). Der REVOKE unten ist daher nur defensiv und
--     bleibt folgenlos, falls anon ohnehin nichts lesen darf.
--   * public.trainers_vorschau  – enthaelt KEIN nachname (nur nachname_initial);
--     bleibt fuer anon voll lesbar. DAS ist der einzige vorgesehene anon-Weg.
--
-- ALLE anon-LESER DIESER SICHTEN IM CODE (Stand 08.11.2026), damit nichts bricht:
--   * suche.html ladeVorschau()  -> trainers_vorschau (bevorzugt) ODER
--     trainers_oeffentlich mit VORSCHAU_FALLBACK_SPALTEN (OHNE nachname).
--   * suche.html ladeOeffentlich() (nur bei Vorschau AUS) -> trainers_oeffentlich
--     mit OEFFENTLICHE_SPALTEN (seit D1 OHNE nachname).
--   * profil.html ladeProfilVorschau() -> trainers_vorschau (bevorzugt) ODER
--     trainers_oeffentlich OHNE nachname.
-- Keiner dieser Wege fragt fuer anon noch "nachname" an -> der Spalten-Entzug
-- bricht keinen bestehenden Weg.
--
-- BEWUSST KEIN voller Entzug von trainers_oeffentlich: der PII-freie Rueckfall
-- (Spalten ohne nachname) soll weiter funktionieren, falls trainers_vorschau
-- einmal fehlt. Nur die Spalte nachname wird gesperrt.
--
-- Mehrfach ausfuehrbar (REVOKE ist idempotent).
-- REIHENFOLGE: nach 2026-11-08-01-trainers-vorschau.sql einspielen.
-- RUECKNAHME: migrations/ruecknahmen/2026-11-08-03-anon-kein-nachname-ruecknahme.sql
-- ============================================================================

REVOKE SELECT (nachname) ON public.trainers_oeffentlich FROM anon;

-- Defensiv: die Basistabelle. Folgenlos, wenn anon ohnehin kein SELECT hat.
DO $$
BEGIN
  BEGIN
    REVOKE SELECT (nachname) ON public.trainers FROM anon;
  EXCEPTION WHEN undefined_column OR undefined_table OR insufficient_privilege THEN
    NULL;
  END;
END $$;
