# Dauerlauf „Bereit für 19.11." (G0–G8) · 2026-11-13

Ziel: Erscheint am **19.11.2026** ein Artikel über Jakob (z. B. sn.at /
Flachgauer Woche), landen Leser auf einem einfachen **Wunsch-Formular**
(`/wunsch.html`) statt vor einer Registrierungs-Mauer. Jakob kann jeden Wunsch
am selben Abend an einen Trainer im Raum Salzburg vermitteln.

Arbeitsordner: `/Users/js/Projekte/Vexfit/app/vexfit`.
Regeln: kein `git push`, Migrationen nur als Datei (mit Rücknahme), kein Deploy,
keine echten Mails/Anzeigen/Zahlungen, pro Baustein Typprüfung + Linter + alle
Tests, nur bei Grün committen. BLOCK statt Raten.

Werkzeuge (Baseline vor dem Lauf):
- Tests: `deno test --allow-read --allow-run --allow-env` → **831 passed, 0 failed**.
- Typprüfung: `deno check supabase/functions/vexfit-automation/index.ts` → grün.
- Linter: `deno lint` → **30 Probleme (Baseline, alle vorbestehend)**, keine neuen.

---

## G0 – BESTAND (nur Doku)

### Git-Stand
- Branch `main`. **`git log origin/main..HEAD` ist NICHT leer:** ein ungepushter
  Commit `dc5f884` „Umkreis-Suche serverseitig dicht (Weg B mit
  Zwischenspeicher, 12.11.)". `origin/main` steht auf `6e36b79` (Memory-Stand
  12.11. war HEAD=6e36b79 ungepusht; inzwischen wurde 6e36b79 gepusht und dc5f884
  obendrauf gesetzt). Also: **1 Commit ungepusht, Startpunkt dieses Laufs = `dc5f884`.**
- Untracked (NICHT Teil dieses Laufs, bleibt liegen): `marke/*.pdf`,
  `marke/vexfit-logo-web-228x88.jpg`.

### Migrationen (laut Dateien in `migrations/`)
- Letzte Datei: **`2026-11-12-01-suche-umkreis.sql`** (+ Rücknahme in
  `migrations/ruecknahmen/`). Legt `trainers.lat/lng` an, entzieht anon den
  Lesezugriff auf `trainers_vorschau`/`trainers_oeffentlich`, SECURITY-DEFINER-
  RPCs `suche_trainer_umkreis`/`trainer_profil`, Tabelle `plz_orte`.
- Ob eingespielt: hier **nicht prüfbar** (kein DB-Zugriff). Laut Memter-Stand
  12.11. war 2026-11-12-01 noch NICHT eingespielt → **BLOCK/Jakobs Aufgabe**.
- Edge `vexfit-automation` hat seit 12.11. die Aktionen `koordinaten_setzen`/
  `trainer-suche`/`trainer-profil`; laut Memory 12.11. **noch nicht deployt** →
  Jakobs Aufgabe.

### Ablauf Kundensuche seit `dc5f884` (Weg B)
1. `suche.html`: nicht angemeldet → `zeigeAnonGate()` (Suchleiste verborgen,
   `#anonGate` mit „Trainer findest du als Mitglied", Knöpfe Registrieren/Anmelden).
   **Kein** Trainer-Netzaufruf.
2. Angemeldet → POST `…/vexfit-automation/trainer-suche` mit `{ plz, land,
   schwerpunkt }` + Token. Server löst die PLZ serverseitig auf (Zwischenspeicher
   `plz_orte`, sonst zippopotam), fester Umkreis **25 km** (`UMKREIS_KM`), gleiches
   Land, nur freigegebene, nicht gesperrte, nicht-Test **Vor-Ort-Trainer mit
   lat/lng**. Keine Online-Trainer, kein Rückfall.
3. Treffer → Karten (Entfernung in km). Keine Treffer → ehrliche Leerseite
   („Noch kein Trainer in 25 km …") + Vormerkung `#naeheHinweis`.
4. `profil.html`: anon → Gate (noindex). Angemeldet → `/trainer-profil`-RPC,
   nur wenn Trainer ≤ 25 km um die zuletzt gesuchte Mitte ODER bereits angefragt.
- **Öffentlich sieht niemand Trainerdaten** (kein Name, keine Karte, kein Ort,
  keine Anzahl). `vexfit-config.js OEFFENTLICHE_VORSCHAU=false`.
- `stadtseiten.mjs` ist **STILLGELEGT** (keine Trainer-Stadtseiten mehr, Sitemap
  ohne Trainerprofile).

### Einstiegspunkte für Kunden (Ist-Zustand, mit Ziel-URL)
| Quelle | Element | Ziel-URL (heute) |
|---|---|---|
| `index.html` (Startseite) | „Trainer finden →" (mehrfach, Hero/Menü/Band/Footer) | `registrieren.html?typ=kunde` |
| `personal-trainer-salzburg.html` | „Trainer in Salzburg finden →" (2× CTA) | `suche.html?plz=5020&land=AT` |
| `suche.html` | Anon-Gate (`#anonGate`) | `registrieren.html?typ=kunde` / `login.html?typ=kunde` |
| `suche.html` | Leerseite (`#emptyState`, keine Treffer-Fall) | Benachrichtigungs-Formular (trainer_alerts) |
| `suche.html` | Trainerkarte, nicht angemeldet (`kontaktKnopf`) | `registrieren.html?typ=kunde` |
| Stadtseiten | STILLGELEGT – keine mehr | – |
| `kunden-bereich.html` | geführter Einstieg (Umkreissuche, nur angemeldet) | intern (`/trainer-suche`) |
| `trainer.html` | „Profil gratis erstellen →" | `registrieren.html?typ=trainer` (für Trainer, nicht Kunden) |

**Toter Einstieg „Online":** Seit `dc5f884` liefert die Suche keine
Online-Trainer mehr (`trainingsort in (vor_ort,beides)`, Online-Abschnitt
unerreichbar). In `suche.html` existieren weiterhin eine „Online"-Matching-Kachel
und Online-Abschnitts-Code (`#ortFilter`, `renderErgebnis`-Online-Zweig), die
nie mehr etwas zeigen. → in G3 bereinigen/umleiten.

### Schlussfolgerung für den Lauf
Es gibt heute **keinen Weg**, bei dem ein Besucher OHNE Konto einen Wunsch
hinterlassen kann. Genau diese Lücke schließt G1 (`/wunsch.html`). G3 lenkt alle
öffentlichen Einstiege darauf.

---

## G1 – „WUNSCH ABGEBEN" (Kunde ohne Konto)

**Angekündigt:** neue Seite `/wunsch.html`, Edge-Pfad `/wunsch`, Migration
(ja: `2026-11-13-01-wuensche.sql`), Commit geplant.

- **`/wunsch.html`** (neu, indexierbar, Salzburg-Landingpage): Überschrift „Sag
  uns, was du suchst – wir finden deinen Personal Trainer in Salzburg. Kostenlos
  für dich." Felder: Land (AT/DE/CH, Vorgabe AT), PLZ, Ziel/Schwerpunkt (Liste aus
  `vexfit-ziele.js`), Wie oft pro Woche, Bevorzugte Zeiten (Mehrfachauswahl),
  Preis pro Stunde (Bereiche, optional), Vorname, E-Mail, Telefon (optional),
  Nachricht (optional), **Einwilligung Datenschutz (Pflicht)**. Herkunft (utm +
  Referrer über `vexfit-trichter.js`/E3) wird mitgesendet. Honeypot `webseite`.
  Lädt KEINE Trainerdaten. Kein Pixel/CAPI.
- **Migration `migrations/2026-11-13-01-wuensche.sql`** (+ Rücknahme): Tabelle
  `public.wuensche` (Status neu/in_bearbeitung/an_trainer_gesendet/vermittelt/
  kein_trainer/abgeschlossen, trainer_id/anfrage_id optional, Zeitstempel,
  Herkunft, verdacht). **RLS an, KEINE Policy, REVOKE von anon/authenticated →
  nur service_role.** Einfügen nur über die Edge-Aktion. NUR Datei, nicht eingespielt.
- **Edge `vexfit-automation`, Pfad `/wunsch`** (kern.ts `wunschEndpunkt` +
  index.ts `wunschAnlegen`): Honeypot + Ratengrenze (wie `/neuer-kunde`,
  `torwacheMailEndpunkt`), `wunschGeprueft` prüft Pflichtfelder, speichert in
  `wuensche`, schickt **interne Mail an office@** (PLZ, Ziel, Zeiten, Preis,
  Kontakt, Herkunft, Deep-Link `#wunsch-<id>`) und **Bestätigung an den Kunden**
  („Danke! Jakob von Vexfit meldet sich innerhalb von 48 Stunden …", 48 =
  `WUNSCH_FRIST_STUNDEN`). Wegwerf-Mail/unsinnig → gespeichert mit `verdacht`,
  KEINE Bestätigung an den Kontakt (nur interne Mail mit Hinweis).
- **Tests `g1_wunsch_test.ts`** (10): Speichern ohne Konto + beide Mails,
  Pflichtfelder→400, Honeypot→still verworfen, Spam-Grenze→429, Wegwerf→Verdacht
  ohne Bestätigung, 501 ohne Verdrahtung, 48-Konstante, Normalisierung, DOM-Check
  (keine Trainerdaten/Post-Ziel), Migration+Rücknahme vorhanden.
- **Playwright 375/1440:** in G7 über den eingebauten Browser (lokaler Server mit
  gestubbtem Endpunkt), da der echte Edge-Pfad erst nach Deploy + Migration lebt.

Ergebnis: `deno check` grün, `deno lint` 30 (keine neuen), **Tests 841 grün**
(831 Baseline + 10). Commit-Hash siehe Abschlusstabelle.

---

## G2 – VERWALTUNG „WÜNSCHE" + VERMITTLUNG

**Angekündigt:** neuer Reiter „Wünsche" in der Verwaltung + Edge-Aktionen,
keine Migration (nutzt `wuensche` aus G1 und `anfragen`), Commit geplant.

- **Reiter „Wünsche"** (verwaltung-…html + vexfit-verwaltung.js): Liste mit
  Status-Badge, Alter, Filter (offen/alle/je Status). Je Wunsch Kontakt + Ziel +
  Zeiten + Preis + Herkunft (+ Verdacht-Markierung). „Passende Trainer" zeigt
  Trainer ≤ 25 km (gleiches Land, über `plzAufloesen`), **inkl. noch nicht
  freigegebener (markiert „noch nicht freigegeben")**, mit Entfernung in km und
  Profil x/8. „An Trainer senden" (mit Bestätigungsdialog), „Kein Trainer
  verfügbar", Status-Knöpfe (vermittelt/abschließen). Deep-Link `#wunsch-<id>`.
- **Edge-Aktionen (kern.ts adminAktion, aal2):**
  - `wuensche_liste` – lesend, alle Wünsche.
  - `wunsch_trainer` – `wunschTrainerVorschlaege` (rein) über `plzAufloesen` +
    `trainerAlleFuerVermittlung` (gleiches Land, lat/lng, Vor Ort/beides, nicht
    Test/gesperrt, **ohne aktiv-Filter**).
  - `wunsch_an_trainer` – legt über den **bestehenden Anfrage-Ablauf** eine
    Anfrage an (Kontakt aus dem Wunsch = Gast-Kunde, `anfrageAnlegen`), schickt
    Trainer-Mail (erste/weitere/Studio) + interne Mail, Status →
    `an_trainer_gesendet`, `trainer_id`/`anfrage_id` gesetzt. Studio-Trainer:
    `weitergeleitet=true` (sofort sichtbar). Normale Trainer: `weitergeleitet=false`
    → **Annahme = Stripe-Zahlung greift unverändert** (bestehende
    `aeltesteOffeneAnfrage`/`mailKundenDaten`-Logik liefert dann die Kontaktdaten).
  - `wunsch_kein_trainer` – freundliche Mail an den Kunden (`mailWunschKeinTrainer`,
    Text im Abschluss) + Vormerkung in `trainer_alerts` (`wartelisteVormerken`),
    Status → `kein_trainer`.
  - `wunsch_status` – Status von Hand setzen (vermittelt/abgeschlossen/…).
- **index.ts** neue Anschlüsse: `wuenscheListe`, `wunschNachId`, `wunschSetzen`,
  `anfrageAnlegen`, `trainerAlleFuerVermittlung`, `wartelisteVormerken`.
- **KEINE Migration** (nutzt `wuensche` aus G1 und `anfragen`). Edge muss deployt
  werden (Jakobs Aufgabe, siehe Abschluss).
- **Tests `g2_wuensche_test.ts`** (7): Matching rein, Zugriff (Admin+aal2),
  wunsch_trainer, **Integration Wunsch→Anfrage→Annahme(Stripe gestubbt)→
  Kundendaten an Trainer**, wunsch_kein_trainer (Mail+Vormerkung+Status),
  wunsch_status, UI/index.ts verdrahtet. (G1-Test: Telefon-Testwert entschärft,
  weil der Geheimnis-Wächter jedes +NN-Muster meldet.)

Ergebnis: `deno check` grün, `deno lint` 30 (keine neuen), **Tests 848 grün**
(841 + 7). Commit-Hash siehe Abschlusstabelle.

---

## G3 – ALLE EINSTIEGE AUFS FORMULAR

**Angekündigt:** Umbau der öffentlichen Kunden-Einstiege auf /wunsch.html, keine
Migration, Commit geplant.

- **index.html:** alle Kunden-CTAs („Trainer finden lassen", Hero, Band,
  Schluss, Menü, Nav-„Starten") → `wunsch.html?utm_source=startseite`.
  Trainer-CTAs bleiben `registrieren.html?typ=trainer`. Hero-Text + 3-Schritte
  (Wunsch abgeben → Wir vermitteln → Loslegen) + „Online & Offline Kunden"/
  „Online oder vor Ort" ehrlich angepasst (kein öffentliches Online-Versprechen).
- **personal-trainer-salzburg.html:** beide CTAs → `wunsch.html?plz=5020&land=AT`;
  UTM-Weitergabe-Selektor auf `a[href^="wunsch.html"]` umgestellt; Lead/Schritte/
  Meta ohne „oder online".
- **suche.html:** Mauer (Anon-Gate) und Leerzustand (Nähe-Hinweis) bieten einen
  Haupt-Knopf „Personal Trainer finden lassen" → `wunsch.html?utm_source=suche`
  (angemeldete Kunden behalten die Umkreissuche). **Toter „Online"-Einstieg**
  (Matching-Kachel `data-val="online"`) entfernt.
- **Stadtseiten:** seit 12.11. STILLGELEGT – es gibt keine generierten
  Trainer-Stadtseiten mehr; personal-trainer-salzburg.html ist die Salzburg-Seite.
- **Rechtstexte:** NICHT angefasst (BLOCK – rechtliches.html bleibt unverändert).
- **Offen gelassen (bewusst):** der dekorative Lauftext-Ticker auf index.html
  nennt noch „ONLINE COACHING" – reine Markenwörter, kein Einstieg/kein konkretes
  Angebot; nicht geändert, um Marketing-Text nicht zu verfälschen.
- **Guards nachgezogen** (encodierten das alte Routing): e6_salzburg_kundenweg,
  k5_stadtseite, land_eindeutig, nachtlauf_phase2_kunde. Neu `g3_einstiege_test.ts`
  (4): Kunden-CTAs → wunsch, Salzburg/Suche → wunsch, Online-Einstieg weg,
  **Link-Prüfung über alle öffentlichen Seiten (keine toten internen Links)**.
- **Playwright 375/1440:** in G7 (eingebauter Browser).

Ergebnis: `deno lint` 30 (keine neuen), **Tests 852 grün** (848 + 4). Commit siehe Tabelle.

---

## G4 – ARTIKEL-BANNER (vorbereitet, versteckt)

**Angekündigt:** Konstante + Banner-Skript + Doku, keine Migration, Commit geplant.

- **`vexfit-config.js`**: neue Konstante `ARTIKEL_URL: ""` (Standard leer).
- **`vexfit-artikel.js`** (neu): `sichereArtikelUrl()` lässt nur `https` zu;
  `vexArtikelBanner(url, zielId)` / `vexArtikelAuto(zielId)` rendern einen
  dezenten Hinweis „★ Bekannt aus der Flachgauer Woche / SN.at – zum Artikel →"
  (Text über textContent, Adresse über geprüfte href, **keine fremden Logos**).
  Leer → Container `display:none`.
- **index.html + wunsch.html**: binden `vexfit-config.js` + `vexfit-artikel.js`
  ein, Container `#artikelBanner`, Selbststart aus der Konfiguration.
- **`docs/artikel-19-11.md`**: genau eine Zeile (`ARTIKEL_URL: ""` → volle
  https-Adresse) + der vollständige Push-Befehl.
- **Test `g4_artikel_test.ts`** (5): Konstante leer, nur https, Einbindung +
  Container auf beiden Seiten, keine Bilder/Logos, Doku vorhanden.

Ergebnis: `deno lint` 30 (keine neuen), **Tests 857 grün** (852 + 5). Keine
Migration. Commit siehe Tabelle.

---

## G5 – EINLADUNGSLINK FÜR TRAINER

**Angekündigt:** Einladungstext-Doku + Abendbericht-Zeile, keine Migration, Commit geplant.

- **Link:** `https://vexfit.app/trainer.html?utm_source=persoenlich&utm_campaign=einladung-jakob`.
  trainer.html erfasst die Herkunft bereits (UTM-Weitergabe an die Registrierung
  + anonymer Trichter-Beacon mit Kampagne) – **vorhandene Erfassung genutzt, kein
  Umbau**.
- **`docs/texte/einladung-trainer-2026-11-13.md`:** fertiger WhatsApp-Text (Du-Form,
  kurz, ehrlich). Preise **wortgleich wie im Repo**: kostenlos bis zur ersten
  angenommenen Kundenanfrage, danach 49,99 €/Monat (monatlich kündbar), jeder
  weitere Kunde einmalig 9,99 €. Keine erfundenen Kundenzahlen.
- **Abendbericht (kern.ts):** neue Zeile „Trainer über persönliche Einladung
  (24 h)" = neue Trainer mit `herkunft_quelle=persoenlich` (aus der bestehenden
  Herkunfts-Erfassung abgeleitet, **keine neue Spalte**). Zusätzlich sind die
  Registrierungen weiter in der Herkunfts-Aufschlüsselung (`persoenlich`) sichtbar.
- **Guards nachgezogen:** b7_abendbericht, s6_salzburg (neues Pflichtfeld in den
  `AbendberichtZahlen`-Testobjekten). Neu `g5_einladung_test.ts` (4): Abendbericht
  zählt die Einladung funktional (gestubbt), Zeile vorhanden, trainer.html reicht
  UTM durch, Einladungstext mit exakten Preisen ohne erfundene Zahlen.

Ergebnis: `deno check` grün, `deno lint` 30, **Tests 861 grün** (857 + 4). Keine
Migration. Commit siehe Tabelle.
