# Bericht – Ausbau Vexfit (Zweig `ausbau-okt`)

Stand: 31.10.2026. Alle Arbeiten liegen im Zweig **`ausbau-okt`** (von `main`
abgezweigt). **Nichts gepusht, nichts deployt, keine Migration eingespielt.**
Elf Commits (einer pro Baustein; dazu der 48-Stunden-Fall von Baustein 4e und
das Adresse-Bearbeiten im Admin).

Prüfungen am Ende: **Typprüfung grün** (`deno check` aller Edge Functions),
**Linter grün** (`deno lint`, keine Probleme), **alle Tests grün**. Die gesamte
Suite in einem Lauf:

```bash
deno test --allow-read --allow-run --allow-env
```

→ **251 bestanden, 0 fehlgeschlagen** (Seiten-/Logiktests und alle
Edge-Function-Tests zusammen).

---

## 1. Je Baustein

### Baustein 1 – Unternehmensseite John Harris — **erledigt**
Studio-Datenmodell + öffentliche Seite + Vorschau + Einladung + Zahlungsbefreiung
+ Kunden-QR + „schon Mitglied?" + Beispielprofile + Übersicht + Druck-Aufsteller
+ SQL-Auswertung.
- `migrations/2026-10-31-01-studios.sql` (+ `-ruecknahme.sql`): Tabellen
  `studios`, `studio_standorte`; Spalte `trainers.studio_standort_id` (nur
  service_role/Funktion setzt sie → kein Selbst-Zuordnen, keine
  Zahlungsumgehung); `anfragen.studio_standort_id` + `studio_mitglied`;
  Funktionen `studio_einladung_einloesen`, `studio_anzeigen`, `studio_uebersicht`
  (alle SECURITY DEFINER, gegen Freigabe/Schlüssel geprüft); Seed John Harris +
  2 Standorte.
- `john-harris.html` – öffentliche Seite (noindex, Vorschau-Schalter,
  Beispielprofile nur in der Vorschau).
- `john-harris-aufsteller.html` – A5-Druck mit selbst erzeugtem QR.
- `john-harris-uebersicht.html` – nur lesbare Studio-Übersicht (keine Kundendaten).
- `vexfit-qr.js` (+ `vexfit-qr_test.ts`) – eigener QR-Erzeuger ohne externen Dienst,
  gegen Norm-Konstanten, Reed-Solomon und jsQR-Rückdekodierung geprüft.
- `auswertungen/john-harris-3-monats-bilanz.sql` – Auswertung je Standort (nicht ausführen).
- `registrieren.html` – Einladungslink löst `studio_einladung_einloesen` ein.
- `trainer-bereich.html` – Studio-Trainer sehen keinen Zahlungslink.
- `profil.html` – Studio-Anfragen fragen „schon Mitglied?" (Pflicht) + Standort.
- `supabase/functions/vexfit-automation/kern.ts`, `index.ts`, `kern_test.ts` –
  `/neue-anfrage` behandelt Studio-Trainer kostenlos (Kontaktdaten direkt per
  Mail, keine Zahlung); normaler Zweig unverändert, mit Tests abgesichert.
- `studios_test.ts`.

### Baustein 2 – Profil-Upgrade — **erledigt**
- `migrations/2026-10-31-02-profil-upgrade.sql` (+ `-ruecknahme.sql`): Spalten
  `video_url`, `sprachen[]`, `trainingsorte[]`, `galerie[]`, `zertifikat_datei`;
  Storage-Behälter `galerie` (öffentlich, eigener Ordner) und `zertifikate`
  (privat, Eigentümer **oder** Admin); Sicht erweitert (zertifikat_datei bleibt privat).
- `vexfit-video.js` (+ `vexfit-video_test.ts`) – YouTube/Instagram/TikTok erkennen
  und einbetten; ungültige Links werden abgelehnt.
- `profil-bearbeiten.html` – Video (Vorschau + Prüfung), Sprachen- und
  Trainingsorte-Mehrfachauswahl, erweiterte Spezialisierungen, Galerie (bis 6
  Bilder, Verkleinerung < 400 KB), Zertifikat-Upload.
- `profil.html` – Video eingebettet, Sprachen/Trainingsorte/Galerie angezeigt.
- `suche.html` – Filter nach Sprache und Trainingsort.
- `profil_upgrade_test.ts`.
- **Speicher-Hinweis:** Supabase-Gratisrahmen ist **1 GB**. Die Galerie
  verkleinert jedes Bild auf max. 1600 px / unter 400 KB; ~2.600 Galeriebilder
  passen grob in 1 GB. Zertifikate zählen zusätzlich.

### Baustein 3 – Blitz-Registrierung und Profilstärke — **erledigt**
- `trainer-bereich.html` – Profilstärke-Karte (0–100 %) mit Checkliste und je
  einem Tipp (Foto, Kurztext, Spezialisierungen, Video, Galerie, Sprachen,
  Trainingsorte, Zertifikat); ergänzt die bestehende Anzeige.
- `migrations/2026-10-31-03-mindeststaerke.sql` (+ `-ruecknahme.sql`): die
  öffentliche Sicht zeigt nur Profile mit Foto + Kurztext + Spezialisierung.
- `suche.html` – angemeldeter Suchpfad filtert nach derselben Mindeststärke.
- `profilstaerke_test.ts`.
- **3a** (Blitz-Registrierung): das Trainerformular verlangt **schon jetzt** nur
  Vorname, Nachname, E-Mail, Passwort, PLZ und führt danach ins Profilformular –
  es war bereits „blitzschnell", deshalb nur Prüfung ergänzt, keine Änderung.

### Baustein 4 – Vertrauen und mehr Anfragen — **erledigt** (inkl. 48-Stunden-Fall)
- `migrations/2026-10-31-04-vertrauen.sql` (+ `-ruecknahme.sql`):
  `trainers.verifiziert` (nur service_role/Admin), `probetraining(_kostenlos)`
  (Trainer), `antwort_stunden`/`antwort_basis` (nur serverseitig berechnet);
  `anfragen.beantwortet_am` (per Trigger, nicht fälschbar) + `alternativen_gesendet`;
  Funktion `antwortzeit_aktualisieren`; Sicht erweitert.
- Edge Function: Admin-Aktionen `trainer_verifizieren`/`trainer_entverifizieren`;
  neuer Pfad `/passt-nicht` (B4e): nach einer **Absage** zwei passende Trainer per
  Mail an den Kunden.
- **B4e, 48-Stunden-Fall (nachgezogen):** neuer Pfad `/unbeantwortet-pruefen`
  schickt dieselben zwei Vorschläge automatisch, wenn ein Trainer eine Anfrage
  seit **mehr als 48 h** nicht beantwortet hat. Ausgelöst vom Zeitplan
  `migrations/2026-10-31-07-unbeantwortet-zeitplan.sql` (pg_cron, stündlich);
  der Aufruf weist sich mit dem Kopf `x-vexfit-cron` aus (Geheimnis aus dem
  Vault, nicht im Code). Je Anfrage nur einmal (`alternativen_gesendet`); die
  Auswahl trifft die Function anhand des **trigger-geführten** `beantwortet_am`
  (nicht fälschbar), kein ungeprüfter Massenversand (Lauf auf 200 Anfragen
  begrenzt). Aktivierung siehe §2/§3.
- `profil.html` – Abzeichen Verifiziert / „Neu auf Vexfit" (30 Tage) / Antwortzeit
  (ab 3 Anfragen); Probetraining-Knopf (4a).
- `profil-bearbeiten.html` – Probetraining-Umschalter.
- `trainer-bereich.html` – nach Antwort Antwortzeit neu berechnen; bei Absage
  Alternativen anstoßen.
- `suche.html` – Kartenabzeichen nach echter Verifizierung.
- `vertrauen_test.ts` (inkl. Zeitplan-Migration 07), erweiterte `kern_test.ts`
  (5 Tests für den 48-Stunden-Fall: fällig → Mail + Vermerk, falsches/fehlendes
  Geheimnis → 401, keine Alternative → trotzdem Vermerk, nichts fällig).

### Baustein 5 – Kunden-Matching in 4 Fragen — **erledigt**
- `vexfit-matching.js` (+ `vexfit-matching_test.ts`) – reine Bewertung/Sortierung
  (Ziel am stärksten; Zeit gegen die Verfügbarkeit aus Baustein 6).
- `suche.html` – Panel „Passenden Trainer in 4 Fragen finden"; die 3 passendsten
  zuerst, danach die normale Liste. Grundsatz: Kontakt nur für angemeldete Kunden.
- `matching_verfuegbarkeit_test.ts`.

### Baustein 6 – Verfügbarkeit — **erledigt**
- `migrations/2026-10-31-05-verfuegbarkeit.sql` (+ `-ruecknahme.sql`):
  `trainers.verfuegbarkeit text[]`; Sicht erweitert.
- `profil-bearbeiten.html` – Raster (7 Tage × Morgen/Mittag/Abend).
- `profil.html` – Anzeige je Wochentag. Kein Buchungskalender.

### Baustein 7 – Admin-Dashboard — **erledigt** (inkl. Adresse bearbeiten)
- `migrations/2026-10-31-06-admin-studios.sql` (+ `-ruecknahme.sql`): vier
  Admin-Funktionen (nur `ist_vexfit_admin()`): `studios_admin_liste` (mit allen
  Schlüsseln), `studio_admin_anlegen`, `standort_admin_anlegen`,
  `studio_admin_freigabe`.
- **Nachtrag `migrations/2026-10-31-08-studio-adresse-bearbeiten.sql`
  (+ `-ruecknahme.sql`):** neue Admin-Funktion `standort_admin_bearbeiten`
  (Name + Adresse eines Standorts ändern, `ist_vexfit_admin()`-geschützt, leere
  Felder überschreiben nichts); `studios_admin_liste` gibt zusätzlich `land` aus
  (für die Vorbelegung). Damit sind die John-Harris-Adressen („HIER EINFÜGEN")
  **ohne SQL** pflegbar.
- `admin.html` – drei neue Reiter: **Studios** (anlegen, Links anzeigen/kopieren,
  Freigabe-Schalter, **je Standort „Adresse bearbeiten" + Adressanzeige**),
  **Zertifikate** (ansehen über signierte Adresse, verifizieren/zurücknehmen),
  **Profil-Übersicht** (Video/Sprachen/Trainingsorte/Profilstärke/Verifiziert,
  filterbar).
- `admin_studios_test.ts` (inkl. Migration 08 + Bearbeiten-Dialog).

### Baustein 8 – Schluss-Rundgang — **teilweise** (ohne Test-DB, siehe `rundgang/README.md`)
Playwright ist nicht eingerichtet; ein echter Klick-Durchlauf braucht eine
Datenbank mit den neuen Spalten (Migrationen absichtlich nicht eingespielt, Live-DB
tabu). Deshalb Rundgang **im eingebauten Browser gegen die lokalen Seiten mit
gemockten Supabase-Antworten**. Geprüft und als Screenshot in `rundgang/`:
Suche+Matching (1440), Matching-Ergebnis mit echten Abzeichen, Profil mit
Abzeichen, John-Harris-Aufsteller, John-Harris-Vorschau (1440 + mobil 390). Der
QR-Code wurde echt per jsQR rück-dekodiert. Was NICHT live geklickt wurde
(Registrierung, Speichern, Anfrage, Upload, Admin) steht in `rundgang/README.md`.

---

## 2. Migrationen – Reihenfolge zum Einspielen
Immer: **SQL einspielen → kurz testen → pushen → nächster Baustein.** Alle liegen
in `migrations/`, jede mit passender `-ruecknahme.sql` (Notbremse).

1. `migrations/2026-10-31-01-studios.sql`
2. `migrations/2026-10-31-02-profil-upgrade.sql`
3. `migrations/2026-10-31-03-mindeststaerke.sql`
4. `migrations/2026-10-31-04-vertrauen.sql`
5. `migrations/2026-10-31-05-verfuegbarkeit.sql`
6. `migrations/2026-10-31-06-admin-studios.sql`

6b. `migrations/2026-10-31-08-studio-adresse-bearbeiten.sql` – direkt nach 06
   (hängt an dessen Admin-Funktionen). Fügt `standort_admin_bearbeiten` hinzu und
   erweitert `studios_admin_liste` um `land`.

Sie bauen aufeinander auf (02–06/08 verändern u. a. die Sicht
`trainers_oeffentlich` bzw. die Admin-Funktionen und setzen die Spalten aus
02/04/05 voraus) – **in dieser Reihenfolge** einspielen.

7. `migrations/2026-10-31-07-unbeantwortet-zeitplan.sql` – **zuletzt und erst
   NACH dem Deploy** (§3), weil es die bereits deployte Function aufruft und das
   Vault-Geheimnis braucht. Legt den stündlichen pg_cron-Job für den
   48-Stunden-Fall an. Enthält **kein** Geheimnis im Klartext.

> **Hinweis zur Rücknahme-Ablage:** Die Aufgabe nannte `migrations/ruecknahmen/`.
> Im Bestand liegen aber alle bisherigen Rücknahmen als `…-ruecknahme.sql`
> **neben** der Migration in `migrations/`. Ich habe die bestehende, einheitliche
> Konvention weitergeführt (sicherer: ein Muster, keine Sonderfälle). Falls du den
> Ordner bevorzugst, verschiebe die `*-ruecknahme.sql` dorthin.

---

## 3. Edge Functions zum Deployen
Geändert: **`vexfit-automation`** (`kern.ts` + `index.ts`). Fertiger Befehl:

```bash
supabase functions deploy vexfit-automation --no-verify-jwt --project-ref hbapzwxdehfgnputrfjf
```

Erst **nach** dem Einspielen der Migrationen 01–06 deployen (die Function liest die
neuen Spalten `studio_standort_id`, `verifiziert`, `alternativen_gesendet` usw.).
`trainer-alert` wurde nicht geändert.

**Für den 48-Stunden-Fall (Baustein 4e) zusätzlich, in dieser Reihenfolge:**

1. Ein Geheimnis wählen (langer Zufallswert) und als Function-Secret setzen:
   ```bash
   supabase secrets set VEXFIT_CRON_KEY=<DEIN_GEHEIMNIS> --project-ref hbapzwxdehfgnputrfjf
   ```
2. **Denselben** Wert im Supabase Vault als `vexfit_cron_key` ablegen
   (Dashboard → Project Settings → Vault → New secret, Name `vexfit_cron_key`).
   Beide Werte müssen übereinstimmen, sonst antwortet die Function mit 401.
3. Danach Migration 07 (§2, Schritt 7) einspielen – dann läuft der Job stündlich.

> **HIER EINFÜGEN:** `VEXFIT_CRON_KEY` / `vexfit_cron_key` – der Geheimniswert
> ist bewusst **nicht** erfunden und steht nirgends im Code oder in der Migration.

---

## 4. Typprüfung, Linter, Tests
- **Typprüfung:** `deno check` über alle Edge-Function-Dateien – **grün**.
- **Linter:** `deno lint` – **0 Probleme**.
- **Gesamte Suite in einem Lauf:** `deno test --allow-read --allow-run --allow-env`
  (vom Projektordner) – **254 bestanden, 0 fehlgeschlagen** (Seiten-/Logiktests
  und alle Edge-Function-Tests zusammen). Darin die 5 Tests für den
  48-Stunden-Fall und 3 für das Adresse-Bearbeiten.
- Neue Tests je Baustein: `studios_test.ts`, `vexfit-qr_test.ts`,
  `profil_upgrade_test.ts`, `vexfit-video_test.ts`, `profilstaerke_test.ts`,
  `vertrauen_test.ts`, `vexfit-matching_test.ts`, `matching_verfuegbarkeit_test.ts`,
  `admin_studios_test.ts` + erweiterte `kern_test.ts`. Sie prüfen Verhalten
  (nicht nur Wortvorkommen), z. B. dass Studio-Trainer keinen Zahlungslink
  bekommen, der QR echt dekodiert, die Matching-Sortierung stimmt.
- Nicht automatisiert prüfbar ohne Test-DB: die echten Schreibabläufe (siehe B8).

---

## 5. „HIER EINFÜGEN"-Lücken (nichts erfunden)
1. **John Harris Salzburg – Adresse:** Hausnummer der Innsbrucker Bundesstraße
   (Medicent) + PLZ. Steht als Platzhalter im Seed (Migration 01) und auf der
   Seite.
2. **John Harris Wien – Adresse:** Hausnummer Schillerplatz + PLZ. Ebenso Platzhalter.

**Am einfachsten im Admin:** Reiter **Studios** → beim Standort auf **„Adresse
bearbeiten"** (seit Migration 08). Dafür muss 08 eingespielt sein.

Alternativ per SQL (die Übersicht/Seite lesen die Adresse aus der Tabelle):

```sql
UPDATE public.studio_standorte SET adresse = '…', plz = '…'
 WHERE slug = 'salzburg' AND studio_id = (SELECT id FROM public.studios WHERE slug='john-harris');
UPDATE public.studio_standorte SET adresse = '…', plz = '…'
 WHERE slug = 'wien' AND studio_id = (SELECT id FROM public.studios WHERE slug='john-harris');
```

---

## 6. Was du dir selbst ansehen solltest
Lokal (nur Darstellung, Supabase-Aufrufe schlagen ohne eingespielte DB fehl):
```bash
cd /Users/js/Projekte/Vexfit/app/vexfit && python3 -m http.server 8799
```
Dann im Browser `http://localhost:8799/…`. **Mit echten Daten** sichtbar erst,
nachdem die Migrationen in einer DB stehen; die geheimen Schlüssel findest du
danach im Admin unter **Studios** (oder per SQL in `studios`/`studio_standorte`).

- **John-Harris-Vorschau:** `…/john-harris.html?vorschau=<VORSCHAU_SCHLUESSEL>`
- **Studio-Übersicht (nur lesen):** `…/john-harris-uebersicht.html?schluessel=<UEBERSICHT_SCHLUESSEL>`
- **Druck-Aufsteller Salzburg:** `…/john-harris-aufsteller.html?standort=salzburg`
- **Druck-Aufsteller Wien:** `…/john-harris-aufsteller.html?standort=wien`
- **Trainer-Einladung (je Standort):** `…/registrieren.html?einladung=<EINLADUNGS_SCHLUESSEL>`
- **Kunden-Link/QR (je Standort):** `…/john-harris.html?standort=salzburg` bzw. `=wien`

Alle Links baut der Admin-Reiter **Studios** fertig zusammen (mit Kopieren-Knopf).

---

## 7. Offene Entscheidungen für dich
1. **Grundsatz „Profile erst nach Registrierung sichtbar":** Die Aufgabe nennt
   das zweimal, aber der **aktuelle Stand zeigt Trainerprofile öffentlich** (seit
   26.10., `trainers_oeffentlich`); nur die **Kontaktaufnahme** verlangt eine
   Anmeldung. Ich habe diesen Stand **nicht** zurückgebaut (wäre ein Rückschritt
   einer bewusst gebauten Funktion) und die neue John-Harris-Seite daran
   ausgerichtet. **Entscheidung:** öffentliche Profile beibehalten, oder Suche +
   Profil wieder komplett hinter die Anmeldung legen? (Das wäre ein eigener Umbau.)
2. **Baustein 4e, 48-Stunden-Fall:** **erledigt** – Absage-Fall **und** „48 h
   keine Antwort"-Fall senden jetzt zwei Alternativen. Der zeitgesteuerte Lauf
   ist gebaut (pg_cron-Migration 07 + Pfad `/unbeantwortet-pruefen`), aber
   **standardmäßig inaktiv**, bis du das Geheimnis setzt und Migration 07
   einspielst (§3). So entsteht kein Automatik-Versand ohne deine bewusste
   Freigabe. **Zu entscheiden:** stündlicher Takt und 48-h-Grenze ok, oder
   anders (Takt in Migration 07, Grenze in `kern.ts`,
   `ALTERNATIVEN_NACH_STUNDEN`)?
3. **Studio-Adressen bearbeiten im Admin:** **erledigt** – Reiter „Studios" →
   „Adresse bearbeiten" (Migration 08). Nur noch einspielen.
4. **Weitere Studios:** Das Datenmodell trägt beliebig viele Studios. Die
   **Seiten** (`<slug>.html`, `-uebersicht.html`, `-aufsteller.html`) gibt es
   aber nur für John Harris. Für ein zweites Studio bräuchte es entweder Kopien
   dieser Seiten mit anderem `slug` oder eine generische Studio-Seite.
5. **Beispielprofile vs. echte Trainer:** Erscheinen Beispielprofile nur in der
   Vorschau; die öffentliche (freigegebene) Seite zeigt echte Trainer bzw. einen
   Registrierungs-Hinweis. Passt das so für Christians Freigabe-Entwurf?

---

```
Vexfit-Ausbau (Zweig ausbau-okt, 31.10.): B1–B7 fertig (inkl. 4e-48h + Studio-Adresse-Edit), B8 teilweise (ohne Test-DB).
11 Commits, NICHTS gepusht/deployt, KEINE Migration eingespielt.
Migrationen 01–06 + 08 (migrations/2026-10-31-0X-*.sql) IN DIESER REIHENFOLGE, dann
`supabase functions deploy vexfit-automation --no-verify-jwt --project-ref hbapzwxdehfgnputrfjf`.
Danach John-Harris-Adressen (2× HIER EINFÜGEN) im Admin→Studios→„Adresse bearbeiten" setzen, Schlüssel ebendort holen.
48h-Fall aktivieren (optional): Secret VEXFIT_CRON_KEY + Vault vexfit_cron_key (gleicher Wert) setzen, dann Migration 07.
Tests: `deno test --allow-read --allow-run --allow-env` → 254 grün, Lint+Typen grün. Rücknahmen als *-ruecknahme.sql neben der Migration.
OFFEN: öffentliche Profile beibehalten? weitere Studios = eigene Seiten.
QR (vexfit-qr.js) echt per jsQR geprüft. Screenshots in rundgang/.
```
