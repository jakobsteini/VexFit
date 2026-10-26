-- VERALTET – nicht verwenden, maßgeblich sind die Dateien in migrations/
-- Vexfit Datenbank Setup
-- Kopiere alles und füge es im Supabase SQL Editor ein

-- TRAINER TABELLE
CREATE TABLE IF NOT EXISTS trainers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefon TEXT,
  stadt TEXT NOT NULL,
  trainingsart TEXT NOT NULL,
  erfahrung TEXT NOT NULL,
  spezialisierungen TEXT[],
  bio TEXT,
  preis_stunde NUMERIC,
  preis_online NUMERIC,
  zertifikate TEXT,
  stripe_bezahlt BOOLEAN DEFAULT FALSE,
  aktiv BOOLEAN DEFAULT TRUE
);

-- KUNDEN TABELLE
CREATE TABLE IF NOT EXISTS kunden (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  stadt TEXT NOT NULL,
  ziel TEXT NOT NULL,
  budget TEXT,
  nachricht TEXT
);

-- ROW LEVEL SECURITY
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Trainer einsehen" ON trainers FOR SELECT USING (true);
CREATE POLICY "Trainer registrieren" ON trainers FOR INSERT WITH CHECK (true);
CREATE POLICY "Kunden registrieren" ON kunden FOR INSERT WITH CHECK (true);
