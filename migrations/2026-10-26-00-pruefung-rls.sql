-- ============================================================================
-- Vexfit - Pruefung des Zugriffsschutzes (NUR LESEN)
-- Erzeugt am 26.10.2026. NICHT eingespielt. Aendert NICHTS.
--
-- Diese Datei fuehrt ausschliesslich SELECTs aus. Bitte im Supabase SQL Editor
-- ausfuehren und die drei Ergebnistabellen zurueck an Claude schicken. Daraus
-- laesst sich ablesen, ob die Migration 01 noetig/korrekt ist und ob
-- trainer_alerts, warteliste und such_eingaben geschuetzt sind.
--
-- Betrachtete Tabellen: trainers, anfragen, kunden, trainer_alerts, warteliste,
-- such_eingaben.
-- ============================================================================

-- 1) Zeilenschutz (RLS) an/aus je Tabelle.
SELECT c.relname AS tabelle,
       c.relrowsecurity  AS rls_an,
       c.relforcerowsecurity AS rls_erzwungen
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('trainers','anfragen','kunden','trainer_alerts',
                     'warteliste','such_eingaben')
 ORDER BY c.relname;

-- 2) Vorhandene Policies je Tabelle (Name, Kommando, Rollen, Bedingungen).
SELECT tablename AS tabelle,
       policyname AS regel,
       cmd        AS kommando,
       roles      AS rollen,
       qual       AS using_bedingung,
       with_check AS check_bedingung
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('trainers','anfragen','kunden','trainer_alerts',
                     'warteliste','such_eingaben')
 ORDER BY tablename, policyname;

-- 3) Rechte von anon und authenticated je Spalte (SELECT/INSERT/UPDATE/...).
--    Tabellenweite Rechte erscheinen hier mit column_name = NULL.
SELECT table_name AS tabelle,
       grantee    AS rolle,
       privilege_type AS recht,
       column_name AS spalte
  FROM information_schema.role_column_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon','authenticated')
   AND table_name IN ('trainers','anfragen','kunden','trainer_alerts',
                      'warteliste','such_eingaben')
UNION ALL
SELECT table_name AS tabelle,
       grantee    AS rolle,
       privilege_type AS recht,
       NULL::text AS spalte
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon','authenticated')
   AND table_name IN ('trainers','anfragen','kunden','trainer_alerts',
                      'warteliste','such_eingaben')
   AND privilege_type NOT IN ('SELECT','INSERT','UPDATE','REFERENCES')
 ORDER BY tabelle, rolle, recht, spalte;
