# Baustein 12.11.2026 – Suche nur angemeldet, 25 km Umkreis, gleiches Land

Jakobs Entscheidung (12.11., nicht neu verhandelt): nicht angemeldete Besucher
sehen KEINE Trainerdaten; angemeldete Kunden nur Vor-Ort-Trainer im gleichen Land
≤ **UMKREIS_KM = 25** km Luftlinie; kein Online-Abschnitt, kein Rückfall; sonst
ehrliche Leerseite + Vormerkung (interne Mail an office@).

## 1. Bestandsaufnahme – Ladewege für Trainerdaten (vorher)

| Stelle | Quelle | Rolle | Felder |
|--------|--------|-------|--------|
| `suche.html:379` ladeVorschau | View `trainers_vorschau` | **anon** (Vorschau AN) | Vorname+Initiale, Ort/PLZ, Schwerpunkte, Preis/Std, Foto |
| `suche.html:382/401` ladeOeffentlich | View `trainers_oeffentlich` | **anon** (Fallback/Vorschau AUS) | wie oben, ohne Nachname |
| `suche.html:735` loadTrainers | **Tabelle `trainers`** `aktiv=eq.true` | **authenticated** | voll inkl. nachname, erfahrung, calendly, preis_monat |
| `profil.html:425/428` | Views vorschau/oeffentlich | **anon** | Profilfelder ohne Kontakt |
| `profil.html:447` | **Tabelle `trainers`** `id=eq` | **authenticated** | voll |
| `kunden-bereich.html:571/576` loadTrainer | **Tabelle `trainers`** `aktiv=eq.true` | **authenticated** | voll inkl. nachname/kontaktnahe |
| `profil-bearbeiten.html`, `trainer-bereich.html`, `login.html` | Tabelle `trainers` `email=ilike.<eigene>` | **authenticated** | **eigene Zeile** |
| `/neue-anfrage`, `/stripe`, Abendbericht, trainer-alert | Edge Functions | **service_role** | intern |
| `werkzeuge/stadtseiten.mjs` | (aktuell) Generator | Build | Stadtseiten |

**RLS/Grants heute:**
- anon: KEIN SELECT auf `trainers` (seit 2026-10-12), nur `GRANT SELECT` auf die
  Views `trainers_vorschau` (ganz) + `trainers_oeffentlich` (Spalten ohne nachname).
- authenticated: `GRANT SELECT` auf `trainers` + Policy `trainers_angemeldet_lesen`
  `USING (aktiv = true OR user_id = auth.uid())` → **liest alle freigegebenen
  (fremden) Trainer voll**.
- **KEINE Koordinaten in der DB** (bestätigt: Migration 2026-11-01-05:142,
  kern.ts:89) – Koordinaten kommen zur Laufzeit von api.zippopotam.us.

## 2. Zielbild (nachher)

- **anon:** suche/profil/Stadtseiten machen KEINEN Trainer-Netzaufruf, zeigen nur
  Erklärung + „Kostenlos registrieren / Anmelden". Views für anon **entzogen**.
- **authenticated:** Suche + Profil + Kundenbereich lesen Trainer NUR über zwei
  SECURITY-DEFINER-RPCs; direkter Tabellenzugriff auf **fremde** Trainer wird per
  Policy auf die **eigene Zeile** beschränkt. Eigene Zeile, Anfrage (service_role),
  Verwaltung (Admin-Policies/Edge) bleiben unberührt.

### ⚠️ Design-Abweichung (transparent, kein Raten)

Die Aufgabe nennt `suche_trainer_umkreis(plz, land, schwerpunkt)`. In der DB gibt
es **keine PLZ→Koordinaten-Tabelle**, also kann die Funktion `plz` nicht
serverseitig in Koordinaten auflösen. Ich erfinde keinen PLZ-Datensatz. Stattdessen:
- Der **angemeldete Client** löst die eingegebene PLZ über `vexfit-plz.js`
  (zippopotam) auf und übergibt die **Such-Koordinaten** an die RPC:
  `suche_trainer_umkreis(p_lat, p_lng, p_land, p_schwerpunkt, p_umkreis_km)`.
- **Trainer-Koordinaten** werden neu in `trainers.lat/lng` gespeichert (bei der
  Registrierung aus der PLZ-Auflösung; Bestand per Verwaltungs-Aktion nachtragbar).
  Trainer OHNE Koordinaten werden **nicht angezeigt** und in der Verwaltung als
  „Standort ohne Koordinaten" gelistet (ZU TUN 4).

Sicherheit bleibt: die RPC gibt nur die erlaubten Felder zurück, verlangt
authenticated, erzwingt gleiches Land + 25 km; dass der Client die Such-Mitte
liefert, erweitert den Zugriff nicht (ein Nutzer darf jede PLZ eingeben).

## 3. Ladewege NACHHER

| Stelle | Quelle | Rolle |
|--------|--------|-------|
| suche.html anon | **kein Netzaufruf**, `#anonGate` (Registrieren/Anmelden) | – |
| suche.html angemeldet | **RPC** `suche_trainer_umkreis` (nur Vor-Ort, gleiches Land, ≤25 km) | authenticated |
| profil.html anon | **kein Netzaufruf**, `zeigeProfilGate()` (noindex) | – |
| profil.html angemeldet | **RPC** `trainer_profil(id)` | authenticated |
| kunden-bereich.html | **unverändert** (Basistabelle) – siehe BLOCK Teil B | authenticated |
| trainers_vorschau/_oeffentlich | **anon-Lesezugriff ENTZOGEN** | – |
| Registrierung | speichert `lat/lng` (aus der PLZ) in `trainers` | – |
| Verwaltung | Liste „Standort ohne Koordinaten" + „Koordinaten nachtragen" (Edge-Aktion) | admin |
| stadtseiten.mjs | **STILLGELEGT** (keine Trainer-Lesung), sitemap ohne Profile | Build |

## 4. Entscheidungen (transparent, kein Raten)

- **RPC-Signatur** `(p_lat, p_lng, p_land, p_schwerpunkt, p_umkreis_km)` statt
  `(plz, land, schwerpunkt)` – weil es KEINE PLZ→Koordinaten-Tabelle gibt (siehe
  oben). Such-Mitte kommt vom Client.
- **UMKREIS_KM = 25** als einzige Konstante in suche.html.
- **BLOCK / TEIL B (authenticated-Policy-Verschärfung):** Der Entzug des direkten
  Tabellen-Lesezugriffs auf FREMDE Trainer (Policy `trainers_angemeldet_lesen`
  auf die eigene Zeile) ist **bewusst NICHT aktiv**. Grund: `kunden-bereich.html`
  liest die Trainertabelle noch direkt (eigene, interne Umkreis-Suche mit Radius/
  Online) – würde die Policy jetzt greifen, bliebe der Kundenbereich leer. **Plan
  (ein Schritt):** `kunden-bereich.html loadTrainer()` genauso auf
  `suche_trainer_umkreis` umstellen wie suche.html, DANN die zwei Policy-Zeilen
  aus Abschnitt 3 der Migration einspielen. suche.html und profil.html sind bereits
  umgestellt; alle übrigen Trainer-Leser lesen nur die eigene Zeile (email=eigene).
  Bis dahin ist der angemeldete 25-km-Rahmen in suche.html UI-seitig durchgesetzt;
  anon ist DB-seitig dicht.
- **SALZBURG_PLZ_PRAEFIXE** werden in der SUCHE nicht mehr benutzt (sie steuern nur
  noch Abendbericht/Admin-Statistik: kern.ts `salzburgPlzFilter`, Abendbericht-
  Zeile, vexfit-verwaltung.js Salzburg-Karte).
- **Service-Worker:** kein Versionssprung – kein öffentlicher SW cacht die
  geänderten Seiten (nur Admin-SW `sw-verwaltung.js`, network-first).
- **Rechtstexte (BLOCK):** `rechtliches.html` nicht selbst geändert; der
  Vorschau-Datenschutz-Entwurf (`docs/recht/entwurf-oeffentliche-profile-2026-11-07.md`)
  als ÜBERHOLT markiert.
