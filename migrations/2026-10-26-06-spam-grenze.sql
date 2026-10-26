-- ============================================================================
-- Vexfit - Tabelle fuer die Spam-Grenze des anonymen Benachrichtigungs-Formulars
-- Erzeugt am 26.10.2026 (Komplettpruefung, Fix 7b). NICHT eingespielt.
--
-- WAS DIESE DATEI TUT:
-- Sie legt die Tabelle public.spam_schutz an. Die Edge Function
-- vexfit-automation merkt dort jeden anonymen Eintrag des suche.html-Formulars
-- (Endpunkt /neuer-kunde ohne Anmeldung) mit E-Mail, IP-Adresse und Zeitpunkt
-- vor. Daraus zaehlt die Function die Grenze: hoechstens 1 Eintrag je
-- E-Mail-Adresse in 24 Stunden und 20 je IP-Adresse in 1 Stunde; darueber
-- antwortet sie mit 429 und verschickt keine Mail.
--
-- ZUGRIFF:
-- Zeilenschutz (RLS) ist an, und es gibt KEINE Regel fuer anon/authenticated:
-- die Tabelle wird ausschliesslich von der Edge Function mit dem geheimen
-- Schluessel (service_role) gelesen und beschrieben, der den Zeilenschutz
-- umgeht. Browser-Rollen bekommen keinerlei Rechte. So landen hier keine
-- personenbezogenen Daten in Reichweite des oeffentlichen Schluessels.
--
-- RUECKNAHME: 2026-10-26-06-spam-grenze-ruecknahme.sql entfernt genau das, was
-- diese Datei anlegt, und nur das.
-- ============================================================================

-- Legt die Tabelle fuer die Spam-Grenze an: je Eintrag eine Zeile.
CREATE TABLE public.spam_schutz (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  email       text,
  ip          text
);

-- Beschreibt den Zweck der Tabelle fuer spaetere Leser im Datenbankschema.
COMMENT ON TABLE public.spam_schutz IS
  'Eintraege des anonymen suche.html-Benachrichtigungsformulars (E-Mail, IP, Zeit), nur zur Durchsetzung der Spam-Grenze in der Edge Function vexfit-automation.';

-- Zwei Indizes fuer die Zaehlabfragen der Function (E-Mail/24 h, IP/1 h).
CREATE INDEX spam_schutz_email_zeit ON public.spam_schutz (email, erstellt_am);
CREATE INDEX spam_schutz_ip_zeit ON public.spam_schutz (ip, erstellt_am);

-- Schaltet den Zeilenschutz ein; ohne Regel ist danach fuer anon/authenticated kein Zugriff moeglich.
ALTER TABLE public.spam_schutz ENABLE ROW LEVEL SECURITY;

-- Nimmt den Browser-Rollen jede etwaige Standardberechtigung: nur der geheime Schluessel der Function (service_role) greift noch zu.
REVOKE ALL ON public.spam_schutz FROM anon, authenticated;
