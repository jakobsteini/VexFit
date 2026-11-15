-- ============================================================================
-- Vexfit – P1-Härtung (Nachtlauf 15.11.2026): interne Tabellen gegen anon
-- Erzeugt am 15.11.2026. NICHT eingespielt (nur Datei).
--
-- BEFUND (live, nur lesend geprüft mit öffentlichem anon-Schlüssel, GET):
--   /rest/v1/admin_protokoll?select=*&limit=1   -> HTTP 200, 0 Zeilen
--   /rest/v1/trichter_ereignisse?select=*&limit=1 -> HTTP 200, 0 Zeilen
--   Alle übrigen internen Tabellen/Sichten (such_eingaben, warteliste,
--   trainer_alerts, profilaufrufe, profil_erinnerungen, push_abos, spam_schutz,
--   wuensche, studios, studio_standorte, kunden, trainers, anfragen,
--   nachrichten, favoriten, bewertungen, anfragen_sichtbar, trainers_oeffentlich,
--   trainers_vorschau) -> bereits HTTP 401; plz_orte -> 404 (nicht exponiert).
--
--   200 mit 0 Zeilen heißt: anon besitzt dort ein Tabellen-SELECT-Recht
--   (vermutlich über Supabase-Standardrechte), nur der Zeilenschutz (RLS) hält
--   die Antwort leer. Das ist KEIN Datenleck (0 Zeilen), aber eine fehlende
--   zweite Verteidigungslinie: fiele der Zeilenschutz je aus, läge der Inhalt
--   offen. Diese Migration entzieht anon das Leserecht an der Grant-Schicht.
--
-- ÄNDERUNG:
--   1) admin_protokoll: anon braucht hier NICHTS (wird nur serverseitig per
--      service_role geschrieben, von authenticated-Admins per RLS gelesen).
--      -> REVOKE ALL FROM anon.
--   2) trichter_ereignisse: der Seitenaufruf-Trichter wird vom öffentlichen
--      Besucher direkt als anon per POST eingefügt (trainer.html,
--      registrieren.html, vexfit-trichter.js; Prefer: return=minimal, also KEIN
--      Lesen nötig). Das Schreiben MUSS bleiben, das Lesen nicht.
--      -> REVOKE SELECT, UPDATE, DELETE FROM anon; INSERT bleibt (idempotent
--         sichergestellt).
--   3) Vorsorge (Defense-in-Depth): auf allen weiteren internen
--      Tabellen/Sichten anon SELECT/UPDATE/DELETE entziehen – heute bereits 401,
--      aber so kann ein künftiges Standardrecht das Lesen nicht erneut öffnen.
--      INSERT wird NICHT angefasst (Registrierungs-/Anfrage-Schreibpfade über
--      Spalten-Grants auf trainers/kunden/anfragen bleiben unberührt).
--
-- authenticated: UNVERÄNDERT. Der Zugriff ist dort bereits durch RLS auf die
--   eigene Zeile bzw. auf Admins (public.ist_vexfit_admin()) beschränkt; der
--   Admin (authenticated + aal2) muss admin_protokoll und trichter_ereignisse
--   weiter lesen können. Ein Entzug für authenticated würde die Verwaltung
--   brechen und ist nicht nötig.
--
-- Mehrfach ausführbar: REVOKE eines nicht gehaltenen Rechts ist ein No-Op;
-- jede Anweisung ist gegen die Existenz des Objekts (to_regclass) abgesichert.
-- ============================================================================

-- 1) admin_protokoll: anon komplett abschotten.
DO $$
BEGIN
  IF to_regclass('public.admin_protokoll') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.admin_protokoll FROM anon';
  END IF;
END $$;

-- 2) trichter_ereignisse: Lesen/Ändern entziehen, INSERT (Tracking) behalten.
DO $$
BEGIN
  IF to_regclass('public.trichter_ereignisse') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.trichter_ereignisse FROM anon';
    -- Schreiben des anonymen Seitenaufruf-Trichters bleibt zwingend erhalten:
    EXECUTE 'GRANT INSERT ON public.trichter_ereignisse TO anon';
  END IF;
END $$;

-- 3) Vorsorge: weitere interne Tabellen/Sichten – anon darf NIE lesen.
--    Nur SELECT/UPDATE/DELETE entziehen; INSERT (falls irgendwo genutzt) bleibt.
DO $$
DECLARE
  obj text;
  intern text[] := ARRAY[
    'public.such_eingaben',
    'public.warteliste',
    'public.trainer_alerts',
    'public.profilaufrufe',
    'public.profil_erinnerungen',
    'public.push_abos',
    'public.spam_schutz',
    'public.wuensche',
    'public.studios',
    'public.studio_standorte',
    'public.kunden',
    'public.trainers',
    'public.anfragen',
    'public.nachrichten',
    'public.favoriten',
    'public.bewertungen',
    'public.anfragen_sichtbar',
    'public.trainers_oeffentlich',
    'public.trainers_vorschau'
  ];
BEGIN
  FOREACH obj IN ARRAY intern LOOP
    IF to_regclass(obj) IS NOT NULL THEN
      EXECUTE format('REVOKE SELECT, UPDATE, DELETE ON %s FROM anon', obj);
    END IF;
  END LOOP;
END $$;
