-- ============================================================================
-- Vexfit - Studios (Unternehmen mit angestellten Trainern), Baustein 1
-- Erzeugt am 31.10.2026. NICHT eingespielt. Reihenfolge: als erste der
-- Ausbau-Migrationen (vor 2026-10-31-02-...).
--
-- HINTERGRUND:
-- Am 30.10.2026 wurde mit John Harris Fitness eine dreimonatige, fuer John
-- Harris kostenlose Testphase vereinbart (zwei Standorte: Salzburg und Wien).
-- Die Trainer dort sind ANGESTELLTE des Studios und zahlen NICHTS. Dieses
-- Datenmodell ist so gebaut, dass spaeter weitere Studios dazukommen koennen -
-- John Harris ist nur die erste gesetzte Zeile.
--
-- WAS DIESE DATEI TUT (nur Schema + ein Seed, KEINE bestehende Regel geaendert):
--   1. Tabelle public.studios          - ein Unternehmen, mit Freigabe-Schalter
--                                         und zwei geheimen Schluesseln (Vorschau,
--                                         nur lesbare Uebersicht).
--   2. Tabelle public.studio_standorte  - je Studio mehrere Standorte, jeder mit
--                                         einem geheimen Einladungsschluessel
--                                         (Trainer) und einem oeffentlichen
--                                         Standort-Kuerzel (Kunden-QR).
--   3. Spalte  trainers.studio_standort_id  - ordnet einen Trainer einem Standort
--                                         zu. Nur service_role / die SECURITY-
--                                         DEFINER-Funktion unten setzt sie (NICHT
--                                         anon/authenticated) - sonst koennte sich
--                                         ein Trainer selbst einem Studio zuordnen
--                                         und so die Zahlung umgehen.
--   4. Spalten anfragen.studio_standort_id, anfragen.studio_mitglied
--                                         - haelt bei einer Anfrage ueber eine
--                                         Studio-Seite fest, von welchem Standort
--                                         sie kam und ob der Kunde schon Mitglied
--                                         ist (fuer die Neukunden-Zaehlung).
--   5. Funktion studio_einladung_einloesen(schluessel)  - ein eingeladener
--                                         Trainer loest nach der Registrierung
--                                         seinen Einladungsschluessel ein; die
--                                         Funktion setzt studio_standort_id fuer
--                                         SEINE eigene Zeile (auth.uid()). Der
--                                         Besitz des Schluessels ist die
--                                         Berechtigung.
--   6. Funktion studio_anzeigen(slug, vorschau)  - der oeffentliche Lesezugriff
--                                         der Seite /john-harris: liefert Studio
--                                         und Standorte nur, wenn veroeffentlicht
--                                         ODER der Vorschau-Schluessel stimmt.
--   7. Funktion studio_uebersicht(schluessel)  - die nur lesbare Studio-Uebersicht:
--                                         je Standort Anfragen gesamt, davon
--                                         Nicht-Mitglieder, angenommene Anfragen
--                                         und die Liste der eingetragenen Trainer.
--                                         KEINE Kundendaten.
--   8. Seed: das Studio "John Harris Fitness" mit zwei Standorten (Adressen als
--      Platzhalter "HIER EINFÜGEN"). Idempotent ueber die Kuerzel (slug).
--
-- WARUM ALLES HINTER SECURITY-DEFINER-FUNKTIONEN STATT ANON-RECHTEN:
-- Die beiden Studio-Tabellen bekommen fuer anon/authenticated KEINE Tabellen-
-- rechte. Die geheimen Schluessel (Einladung, Vorschau, Uebersicht) und das
-- Freigabefeld duerfen nicht ueber den oeffentlichen Schluessel abgreifbar sein.
-- Der gesamte oeffentliche Zugriff laeuft deshalb ueber die drei Funktionen
-- oben; jede prueft selbst, was sie herausgibt. Das ist derselbe Weg wie bei
-- den bestehenden Sichten (trainers_oeffentlich, anfragen_sichtbar): Lesen nur
-- durch einen eng umrissenen, geprueften Ausschnitt.
--
-- EINE STELLE, DIE NICHT VERAENDERT WIRD:
-- Die Zahlungslogik fuer normale Trainer bleibt unberuehrt. Ob ein Trainer zu
-- einem Studio gehoert, wird allein an trainers.studio_standort_id erkannt; die
-- Edge Function vexfit-automation verzweigt darauf (siehe kern.ts), ohne den
-- bestehenden Zweig fuer normale Trainer zu aendern.
--
-- RUECKNAHME: 2026-10-31-01-studios-ruecknahme.sql entfernt genau das, was diese
-- Datei anlegt (Funktionen, Spalten, Tabellen, Seed), und nichts sonst.
-- ============================================================================


-- ############################################################################
-- TEIL 1 - TABELLEN
-- ############################################################################

-- Ein Unternehmen. veroeffentlicht steuert die oeffentliche Sichtbarkeit der
-- Seite; solange false, ist die Seite nur ueber den Vorschau-Schluessel
-- erreichbar. Die beiden Schluessel werden zufaellig vorbelegt (zwei
-- zusammengehaengte UUIDs ohne Bindestriche = 64 Hex-Zeichen); sie stehen NIE
-- auf einer oeffentlichen Seite, nur Jakob kennt sie (Admin-Bereich).
CREATE TABLE public.studios (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am            timestamptz NOT NULL DEFAULT now(),
  slug                   text        NOT NULL UNIQUE,
  name                   text        NOT NULL,
  veroeffentlicht        boolean     NOT NULL DEFAULT false,
  vorschau_schluessel    text        NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  uebersicht_schluessel  text        NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

COMMENT ON TABLE public.studios IS
  'Unternehmen mit angestellten Trainern (z. B. John Harris Fitness). veroeffentlicht schaltet die oeffentliche Seite frei; die zwei Schluessel sind geheim (Vorschau-Link, nur lesbare Uebersicht).';

-- Ein Standort eines Studios. slug ist das oeffentliche Kuerzel fuer den
-- Kunden-QR (?standort=salzburg); einladungs_schluessel ist geheim und ordnet
-- einen sich darueber registrierenden Trainer diesem Standort zu.
CREATE TABLE public.studio_standorte (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am           timestamptz NOT NULL DEFAULT now(),
  studio_id             uuid        NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  slug                  text        NOT NULL,
  name                  text        NOT NULL,
  stadt                 text,
  adresse               text,
  plz                   text,
  land                  text,
  einladungs_schluessel text        NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  UNIQUE (studio_id, slug)
);

COMMENT ON TABLE public.studio_standorte IS
  'Standort eines Studios. slug: oeffentliches Kuerzel fuer den Kunden-QR (?standort=...). einladungs_schluessel: geheim, ordnet einen eingeladenen Trainer diesem Standort zu.';

-- Zeilenschutz an, alle Rechte entzogen, KEINE Policy und KEIN Grant fuer
-- anon/authenticated: der Zugriff laeuft ausschliesslich ueber die drei
-- SECURITY-DEFINER-Funktionen in Teil 4 und ueber service_role (Edge Functions,
-- Admin). So bleiben die geheimen Schluessel unerreichbar.
ALTER TABLE public.studios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_standorte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studios          FROM anon, authenticated;
REVOKE ALL ON public.studio_standorte FROM anon, authenticated;


-- ############################################################################
-- TEIL 2 - SPALTE IN trainers
-- ############################################################################

-- Ordnet einen Trainer einem Studio-Standort zu. Leer (NULL) = normaler Trainer
-- (Zahlungslogik unveraendert). Gesetzt = Studio-Trainer (zahlt nichts).
ALTER TABLE public.trainers
  ADD COLUMN studio_standort_id uuid REFERENCES public.studio_standorte(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trainers.studio_standort_id IS
  'Zuordnung zu einem Studio-Standort. NULL = normaler Trainer. Gesetzt nur durch studio_einladung_einloesen (SECURITY DEFINER) oder service_role - niemals direkt durch anon/authenticated, sonst Zahlungsumgehung.';

-- BEWUSST KEIN GRANT: weder anon noch authenticated erhalten INSERT oder UPDATE
-- auf studio_standort_id. Gesetzt wird die Spalte nur ueber die Funktion
-- studio_einladung_einloesen (laeuft mit Eigentuemerrechten) und ueber
-- service_role. Ein Trainer kann sich damit nicht selbst einem Studio zuordnen.


-- ############################################################################
-- TEIL 3 - SPALTEN IN anfragen
-- ############################################################################

-- Haelt fest, ueber welchen Studio-Standort eine Anfrage kam (Kunden-QR) und
-- ob der Kunde schon Mitglied des Studios ist. studio_mitglied: true/false aus
-- der Pflichtfrage auf der Studio-Seite; NULL = Anfrage kam nicht ueber eine
-- Studio-Seite. Gezaehlt werden in der Uebersicht nur Nicht-Mitglieder.
ALTER TABLE public.anfragen ADD COLUMN studio_standort_id uuid REFERENCES public.studio_standorte(id) ON DELETE SET NULL;
ALTER TABLE public.anfragen ADD COLUMN studio_mitglied    boolean;

COMMENT ON COLUMN public.anfragen.studio_standort_id IS
  'Standort, ueber dessen Kunden-Link die Anfrage kam (oder NULL). Nur eine Markierung, keine Berechtigung.';
COMMENT ON COLUMN public.anfragen.studio_mitglied IS
  'Antwort auf "Bist du schon Mitglied?" (true/false) bei Anfragen ueber eine Studio-Seite; NULL sonst. Gezaehlt werden nur Nicht-Mitglieder (false).';

-- Diese beiden Spalten sind harmlose Markierungen (keine Berechtigung). Damit
-- die bestehende Anfrage-Erstellung sie mitschreiben kann, werden sie in die
-- INSERT-Freigabe aufgenommen - genau wie die uebrigen Anfrage-Spalten
-- (2026-09-19-zugriffsregeln-neuaufbau.sql). Kein weiteres Recht.
GRANT INSERT (studio_standort_id, studio_mitglied) ON public.anfragen TO anon, authenticated;


-- ############################################################################
-- TEIL 4 - FUNKTIONEN (der gesamte oeffentliche Zugriff)
-- ############################################################################

-- ---------------------------------------------------------------------------
-- 4a) Einladung einloesen.
-- Ein eingeladener Trainer ruft diese Funktion nach der Registrierung mit dem
-- Einladungsschluessel seines Standorts auf. Sie setzt studio_standort_id fuer
-- GENAU SEINE Zeile (user_id = auth.uid()). Der Besitz des Schluessels ist die
-- Berechtigung; auth.uid() stellt sicher, dass niemand eine fremde Zeile
-- zuordnen kann. SECURITY DEFINER, damit das (fuer authenticated gesperrte)
-- Schreiben auf studio_standort_id hier moeglich ist.
CREATE OR REPLACE FUNCTION public.studio_einladung_einloesen(p_schluessel text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_standort_id uuid;
  v_standort    text;
  v_studio      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_angemeldet');
  END IF;

  SELECT st.id, st.name, s.name
    INTO v_standort_id, v_standort, v_studio
    FROM public.studio_standorte st
    JOIN public.studios s ON s.id = st.studio_id
   WHERE st.einladungs_schluessel = p_schluessel;

  IF v_standort_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'schluessel_ungueltig');
  END IF;

  UPDATE public.trainers
     SET studio_standort_id = v_standort_id
   WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'kein_profil');
  END IF;

  RETURN jsonb_build_object('ok', true, 'studio', v_studio, 'standort', v_standort);
END;
$$;

REVOKE ALL ON FUNCTION public.studio_einladung_einloesen(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.studio_einladung_einloesen(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4b) Oeffentlicher Lesezugriff der Studio-Seite.
-- Liefert Studio + Standorte NUR, wenn das Studio veroeffentlicht ist ODER der
-- uebergebene Vorschau-Schluessel stimmt. Gibt KEINE geheimen Schluessel heraus.
-- Je Standort wird mitgegeben, wie viele freigeschaltete Trainer dort schon
-- eingetragen sind (fuer die Seite: echte Trainer statt Beispielprofile) sowie
-- deren unbedenkliche Kartendaten (keine Kontaktdaten). SECURITY DEFINER, damit
-- der Lesezugriff nicht an den entzogenen Tabellenrechten scheitert.
CREATE OR REPLACE FUNCTION public.studio_anzeigen(p_slug text, p_vorschau text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_studio  public.studios;
  v_ergebnis jsonb;
BEGIN
  SELECT * INTO v_studio FROM public.studios WHERE slug = p_slug;
  IF v_studio.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Freigabe: entweder oeffentlich, oder der Vorschau-Schluessel stimmt genau.
  IF v_studio.veroeffentlicht IS NOT TRUE
     AND (p_vorschau IS NULL OR p_vorschau = '' OR p_vorschau <> v_studio.vorschau_schluessel) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'name', v_studio.name,
    'slug', v_studio.slug,
    'veroeffentlicht', v_studio.veroeffentlicht,
    'vorschau', (v_studio.veroeffentlicht IS NOT TRUE),
    'standorte', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', st.id,
        'slug', st.slug,
        'name', st.name,
        'stadt', st.stadt,
        'adresse', st.adresse,
        'plz', st.plz,
        'trainer', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', t.id,
            'vorname', t.vorname,
            'nachname', t.nachname,
            'trainingsart', t.trainingsart,
            'spezialisierungen', t.spezialisierungen,
            'bio', t.bio,
            'avatar_url', t.avatar_url
          ) ORDER BY t.nachname)
          FROM public.trainers t
          WHERE t.studio_standort_id = st.id AND t.aktiv = true
        ), '[]'::jsonb)
      ) ORDER BY st.erstellt_am)
      FROM public.studio_standorte st
      WHERE st.studio_id = v_studio.id
    ), '[]'::jsonb)
  ) INTO v_ergebnis;

  RETURN v_ergebnis;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_anzeigen(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.studio_anzeigen(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4c) Nur lesbare Studio-Uebersicht (fuer John Harris).
-- Gibt je Standort die Kennzahlen heraus, wenn der Uebersichts-Schluessel
-- stimmt: Anfragen gesamt, davon Nicht-Mitglieder (studio_mitglied = false),
-- angenommene Anfragen (status = 'angenommen') und die Namen der eingetragenen
-- Trainer. KEINE Kundendaten (kein Name, keine E-Mail der Kunden).
CREATE OR REPLACE FUNCTION public.studio_uebersicht(p_schluessel text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_studio public.studios;
  v_ergebnis jsonb;
BEGIN
  IF p_schluessel IS NULL OR p_schluessel = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_studio FROM public.studios WHERE uebersicht_schluessel = p_schluessel;
  IF v_studio.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'name', v_studio.name,
    'standorte', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', st.name,
        'stadt', st.stadt,
        'anfragen_gesamt', (SELECT count(*) FROM public.anfragen a WHERE a.studio_standort_id = st.id),
        'anfragen_nicht_mitglieder', (SELECT count(*) FROM public.anfragen a WHERE a.studio_standort_id = st.id AND a.studio_mitglied IS FALSE),
        'anfragen_angenommen', (SELECT count(*) FROM public.anfragen a WHERE a.studio_standort_id = st.id AND a.status = 'angenommen'),
        'trainer', COALESCE((
          SELECT jsonb_agg((t.vorname || ' ' || t.nachname) ORDER BY t.nachname)
          FROM public.trainers t WHERE t.studio_standort_id = st.id
        ), '[]'::jsonb)
      ) ORDER BY st.erstellt_am)
      FROM public.studio_standorte st
      WHERE st.studio_id = v_studio.id
    ), '[]'::jsonb)
  ) INTO v_ergebnis;

  RETURN v_ergebnis;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_uebersicht(text) FROM public;
GRANT EXECUTE ON FUNCTION public.studio_uebersicht(text) TO anon, authenticated;


-- ############################################################################
-- TEIL 5 - SEED: John Harris Fitness (zwei Standorte)
-- ############################################################################
-- Das eine Studio aus der Vereinbarung vom 30.10.2026. Adressen sind bewusst
-- "HIER EINFÜGEN" (Hausnummern unbekannt - BLOCK STATT RATEN). Die Schluessel
-- werden zufaellig vorbelegt (siehe Spalten-Vorgaben). Idempotent: ein zweites
-- Einspielen aendert nichts (ON CONFLICT auf die Kuerzel).

INSERT INTO public.studios (slug, name, veroeffentlicht)
VALUES ('john-harris', 'John Harris Fitness', false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.studio_standorte (studio_id, slug, name, stadt, adresse, plz, land)
SELECT s.id, v.slug, v.name, v.stadt, v.adresse, v.plz, v.land
FROM public.studios s
CROSS JOIN (VALUES
  ('salzburg', 'John Harris Salzburg', 'Salzburg', 'Innsbrucker Bundesstraße HIER EINFÜGEN (Medicent)', 'HIER EINFÜGEN', 'AT'),
  ('wien',     'John Harris Wien',     'Wien',     'Schillerplatz HIER EINFÜGEN',                        'HIER EINFÜGEN', 'AT')
) AS v(slug, name, stadt, adresse, plz, land)
WHERE s.slug = 'john-harris'
ON CONFLICT (studio_id, slug) DO NOTHING;
