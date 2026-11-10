# Dauerlauf „Alles Offene" – 10.11.2026

Ziel: Bis heute 16 Uhr ist alles Offene im Code erledigt oder als BLOCK benannt,
damit Vexfit in Salzburg die erste echte Kundenanfrage verarbeiten kann.
Baustein für Baustein, jeder Baustein ein eigener Commit. Protokoll laufend hier.

Pflichtregeln: keine Rückfragen (BLOCK statt Raten), Migrationen nur als Datei
(mit Rücknahme), kein Einspielen/Deploy/Push, keine echten Mails, keine
öffentlichen personenbezogenen Daten, keine Geheimnisse committen.

---

## E0 – Bestandsaufnahme (Doku-Commit)

- Offene Punkte gesammelt → `docs/offen-2026-11-10.md` (Zuordnung
  erledigt / in diesem Lauf / Jakob / BLOCK).
- Git zu Beginn: `HEAD` = `origin/main` = `9e3b6ca`, nichts Ungepushtes;
  untracked nur `marke/*` (Binärdateien, nicht committen).
- Geplante Bausteine E1–E8: siehe `docs/offen-2026-11-10.md` Abschnitt A.
- **Commit:** nur Doku (dieses Protokoll + offen-Liste).

### Angekündigt für die folgenden Bausteine

| Baustein | Migration? | Commit? |
|----------|-----------|---------|
| E1 Anfrage-Weg absichern | voraussichtlich nein | ja |
| E2 Trainer-Standort | wahrscheinlich ja (PLZ-Spalten/Pflicht) | ja |
| E3 Herkunft messen | wahrscheinlich ja (Herkunftsspalten) | ja |
| E4 Salzburg einheitlich | nein | ja |
| E5 Freigabe nicht vergessen | nein | ja |
| E6 Kunden-Weg Salzburg | nein | ja |
| E7 Gesamttest | nein | ja (falls Änderungen) |
| E8 Offen-Liste Endstand | nein | ja (Doku) |

(Die tatsächliche Migrationsentscheidung wird pro Baustein vor dem Commit
bestätigt – Grundsatz: so wenig DB-Änderung wie möglich, nur als Datei.)

---

## E1 – Anfrage-Weg Ende zu Ende absichern (keine Migration)

### Der Weg im Code (Datei/Zeile)

1. **Kunde sucht** → `suche.html` (liest `?plz=&land=`), Herkunft/UTM über
   `vexfit-trichter.js`.
2. **Profil** → `profil.html?id=<trainer>`; Anfrageformular (Ziel, Zeitraum,
   Nachricht + Vorname/E-Mail/Passwort). Zeitraum+Nachricht landen gemeinsam im
   Feld `nachricht` (Konzept K3, keine neue Spalte).
3. **Anfrage (ein Schritt)** → POST `/neue-anfrage` →
   `neueAnfrage` (`supabase/functions/vexfit-automation/kern.ts:1710`).
   - Angemeldet-Pflicht: ohne gültiges Token **401**, fremde E-Mail **403**,
     > 10 Anfragen/Stunde **429** (`kern.ts:1719`–`1739`).
4. **Prüfung** → `anfrageVerdacht` (`kern.ts:138`): Wegwerf-Domain
   (`wegwerf-domains.ts`), unsinniger Name, unsinnige Nachricht. Verdächtig →
   `anfrageZurPruefung` setzt `pruef_status='zur_pruefung'` (`kern.ts:1759`).
   (Der Honeypot „webseite" sitzt im anonymen Formularweg `/neuer-kunde`,
   `torwacheMailEndpunkt` `kern.ts:1501`.)
5. **Mail an Trainer** → Normalfall `mailErsteAnfrage` (49,99 €, `kern.ts:1001`)
   bzw. `mailWeitereAnfrage` (9,99 €, `kern.ts:1026`), Studio-Trainer
   `mailStudioAnfrage` ohne Zahlungslink (`kern.ts:1053`). Versand `kern.ts:1786`.
   **Verdächtige Anfragen erreichen den Trainer NICHT.**
6. **Interne Mail an Jakob (office@)** – bei JEDER Lage:
   - neue Anfrage → `mailNeueAnfrageIntern` (`kern.ts:795`, Versand `kern.ts:1791`).
   - **zur Prüfung → `mailAnfrageZurPruefungIntern` (`kern.ts:831`, NEU in E1,**
     Versand im zur-Prüfung-Zweig `kern.ts:1766`), nur an office@, nie an den Trainer.
   - Vormerkung (anonym) → `/neuer-kunde` → `mailNeuerKunde` an office@
     (`neuerKunde` `kern.ts:1673`).
7. **Annahme/Ablehnung:**
   - **Annahme** = Trainer klickt den Zahlungslink → Stripe
     `checkout.session.completed` → `/stripe` → `stripe` (`kern.ts:3888`):
     Zahlung verbucht, Kontaktdaten per `mailKundenDaten` an den Trainer
     (`kern.ts:1077`), Bestätigung `mailZahlungAnJakob` an office@ (`kern.ts:1099`),
     älteste offene Anfrage weitergeleitet. **Das ist der Zahlungsauslöser der
     ersten Annahme** (Erstzahlung 49,99 €, `LINK_ERSTE`).
   - **Ablehnung** = `/passt-nicht` → `passtNicht` (`kern.ts:3701`):
     Ersatzvorschläge über `alternativenFinden` (`kern.ts:1227`, Profile ≥ 5/8),
     einmalig `alternativen_gesendet`.
8. **Ersatzvorschläge** → Mail an den Kunden (im passt-nicht-Zweig), nur wenn
   mindestens eine passende Alternative existiert (sonst keine Mail).

### Was E1 geändert hat

- **Lücke geschlossen:** Verdachtsanfragen („zur Prüfung") lösten bisher **keine**
  interne Benachrichtigung aus – der zur-Prüfung-Zweig kehrte vor der office@-Mail
  zurück. Jetzt geht `mailAnfrageZurPruefungIntern` (+ Push `pushAnfrageZurPruefung`)
  an office@, damit keine verdächtige Anfrage unbemerkt in der Admin-Liste liegt.
- **Unverändert korrekt:** Normalfall (Trainer + office@), Vormerkung (office@),
  erste Annahme (Stripe → `mailZahlungAnJakob` an office@), Ablehnung+Ersatz.

### Tests

- `kern_test.ts`: S3-Tests aktualisiert (zur Prüfung → genau EINE office@-Mail,
  keine Trainer-Mail); neue Integrationstests „E1: Normalfall / zur Prüfung /
  Vormerkung" treiben `bearbeiten` mit gestubbtem Mailversand.
- Erste Annahme (Stripe) und Ablehnung+Ersatz sind weiterhin durch die
  bestehenden `kern_test.ts`-Stripe- und passt-nicht-Tests abgedeckt.
- Suite: **796 grün** (+3), `deno check` grün, `deno lint` 30 (Baseline).

### Anleitung

- `docs/live-test-anfrage.md` Schritt für Schritt für Jakob
  (`+kunde1`/`+trainer1`), was wo ankommt, danach beide Konten als Test markieren.

**Commit E1:** kern.ts (interne zur-Prüfung-Mail + Push), kern_test.ts (Tests),
Protokoll + Anleitung. Keine Migration.

---

## E2 – Trainer-Standort bei der Registrierung (keine Migration)

**Befund:** Neue Trainer (Nirmal, Jaqueline, Rayene) hatten 0/8 und **keinen
Standort** – für die Salzburg-Strategie entscheidend. Bisher verschob das „kurze
Erstformular" (Teil R) die PLZ bewusst in den Trainer-Bereich.

**Entscheidung (Jakob, in der Aufgabe):** Standort wird Pflicht bei der
Trainer-Registrierung. Das kehrt Teil R für den Trainer um (der Kunde bleibt
kurz).

**Umsetzung:**
- `registrieren.html`, Trainer-Formular: neue Felder **Land (AT/DE/CH, Vorgabe
  AT)** + **PLZ**. Der Ort wird über `vexfit-plz.js` ermittelt – land-bewusst,
  daher ist eine 4-stellige PLZ eindeutig (5020 AT ≠ 5020 CH), keine Rückfrage.
  `plzPruefen` gibt das gewählte Land an `vexPlz.aufloesen` weiter.
- `submitTrainer`: Land + PLZ **Pflicht**; ohne auflösbaren Ort **keine**
  Registrierung. Gespeichert werden `stadt` (automatisch), `plz`, `land`.
- `kern.ts` `mailNeuerTrainer`: zeigt jetzt **Ort/PLZ UND Land**.
- `vexfit-verwaltung.js`: neue reine Funktion `trainerOhneStandort` +
  Karte **„📍 Standort fehlt (keine PLZ)"** in „Heute zu tun" (Altbestand ohne
  PLZ, ohne Test-/Spam-Konten, klickbar zum Trainer).
- **Keine Migration:** `trainers` hat `plz`/`stadt`/`land` bereits (land seit
  07.11.).

**Tests:**
- `registrierung_kurz_test.ts`: Trainer-Formular hat jetzt `t-land`+`t-plz`
  (Pflicht), speichert `stadt/plz/land`, kein manuelles Ort-Feld; Kunde bleibt kurz.
- `land_eindeutig_test.ts`: unbekannte PLZ im Land → `null` (abgelehnt);
  registrieren.html reicht Land land-bewusst durch.
- `kern_test.ts`: „Neuer Trainer"-Mail zeigt Ort, PLZ und Land.
- `b3_admin_test.ts`: `trainerOhneStandort` listet nur Trainer ohne PLZ, keine
  Test-Konten.
- `pixel_registrierung_test.ts`: Suchfenster für den Handler leicht geweitert
  (die Standort-Pflichtprüfung sitzt vor dem Insert) – Prüfabsicht unverändert.
- Suite **801 grün**, `deno check` grün, `deno lint` 30 (Baseline).

**Abendbericht-Teil (Ort/PLZ/Land je Trainer):** Die interne **„Neuer
Trainer"-Mail** liefert den Standort je Ereignis sofort. Die **Trainerliste im
Abendbericht** („Vorname N., Ort, x/8, freigegeben ja/nein") baut **E4/E5**
(Raum Salzburg 50/51), weil E4 genau diese Zeile ohnehin neu fasst – dort wird
der Ort je Trainer ausgewiesen.

**Hinweis (kein BLOCK):** Nicht previewbar ohne echtes Supabase-Signup +
Zippopotam; abgesichert über die statischen/Logik-Tests.

**Commit E2:** registrieren.html, kern.ts, vexfit-verwaltung.js + 5 Testdateien,
Protokoll. Keine Migration.

---

## E3 – Herkunft messen (Migration NUR Datei)

**Befund:** 3 neue Trainer in 24 h, alle „direkt/unbekannt". Es fehlte die
**Referrer-Domain** und eine saubere Herkunfts-Einordnung.

**Umsetzung (kein Personenbezug, keine Drittanbieter-Cookies):**
- `vexfit-trichter.js`: zwei reine Helfer
  - `referrerDomain(ref, eigenerHost)` – nur die **Domain** (ohne Pfad/Parameter),
    eigene Domain = kein externer Verweis;
  - `herkunftEinordnen({quelle, referrer})` – utm_source gewinnt (ig→instagram,
    fb/facebook→meta), sonst Referrer-Domain grob (google/instagram/meta/bing/…),
    ohne beides **„direkt"**.
  Beim ersten Aufruf wird die Referrer-Domain in `sessionStorage` gemerkt und im
  anonymen Trichter-Beacon mitgesendet. Als `window.vexHerkunft` bereitgestellt.
- `registrieren.html`: lädt `vexfit-trichter.js`, erfasst die Referrer-Domain,
  reicht **referrer + utm_medium** an die interne Meldung (Trainer+Kunde), den
  strukturierten Nachtrag (`herkunft_referrer`, `herkunft_medium`) und den
  Trichter-Beacon weiter.
- `kern.ts`: Spiegel `herkunftEinordnen`; der **Abendbericht** gruppiert „Neue
  Trainer (24 h)" jetzt über die strukturierte Herkunft (utm_source bzw.
  Referrer-Domain) statt über den Freitext – tidy Labels, „direkt" statt
  „direkt/unbekannt". Robuster Rückfall, falls die Spalten fehlen.
- **Migration NUR Datei:** `migrations/2026-11-10-01-herkunft-referrer.sql`
  (+ Rücknahme) – `trichter_ereignisse.referrer` (+Längen-CHECK) und
  `herkunft_referrer`/`herkunft_medium` auf `trainers`+`kunden`. **Reihenfolge:
  nach 2026-11-06-01-trichter.sql.**
- **Datenschutz:** NICHT selbst geändert; Entwurf als BLOCK in
  `docs/recht/entwurf-herkunft-2026-11-10.md` (Art. 6 Abs. 1 lit. f, Widerspruch
  an office@).

**Tests (`e3_herkunft_test.ts` + angepasste Fenster-Tests):**
- `referrerDomain` liefert nur die Domain; eigene Domain → „";
- `herkunftEinordnen` (Client + Server-Spiegel): Quelle gewinnt, sonst Referrer,
  sonst „direkt";
- registrieren.html erfasst/überträgt Referrer + utm_medium;
- Migration + Rücknahme als Dateien.
- `b1_inapp_test.ts` / `b3_trichter_test.ts`: Fenster präzisiert (neue Felder);
  Beacon enthält weiterhin keine Personendaten (Referrer-Domain ist erlaubt).
- Suite **805 grün**, `deno check` grün, `deno lint` 30 (Baseline).

**Commit E3:** vexfit-trichter.js, registrieren.html, kern.ts, Migration+Rücknahme,
Datenschutz-Entwurf, e3/b1/b3-Tests, Protokoll.

---

## E4 – Salzburg einheitlich zählen (keine Migration)

**Befund:** Drei Definitionen für „Raum Salzburg": `SALZBURG_PLZ_PRAEFIX="50"`
(Abendbericht), `SALZBURG_PLZ_PRAEFIXE=["50","51"]` und `SALZBURG_PRAEFIX="50"`
(vexfit-verwaltung.js). Der Abendbericht zählte nur 50xx.

**⚠️ Widerspruch in der Aufgabe – transparent aufgelöst:** Die Aufgabe nennt das
Label **„(50/51)"** UND verlangt den Test **„Seekirchen (5201) zählt zu
Salzburg". 5201 beginnt aber mit „52"**, fällt also NICHT unter 50/51. Beides ist
zusammen nicht erfüllbar. Ich habe zugunsten des **Akzeptanztests** entschieden:
`SALZBURG_PLZ_PRAEFIXE = ["50","51","52"]` (Stadt + Umgebung + Flachgau inkl.
Seekirchen). Das Label wird **aus der Konstante** gebaut, also „Raum Salzburg
(50/51/52)" – nie wieder auseinanderlaufend. **Wenn der Flachgau (52xx) NICHT
dazugehören soll:** in `kern.ts` `"52"` aus `SALZBURG_PLZ_PRAEFIXE` streichen
(Label und Admin ziehen automatisch nach) – Entscheidung Jakob.

**Umsetzung:**
- `kern.ts`: `SALZBURG_PLZ_PRAEFIX` entfernt; **eine** Quelle
  `SALZBURG_PLZ_PRAEFIXE` + `istSalzburgPlz` + neuer `salzburgPlzFilter()`
  (`or=(plz.like.50*,plz.like.51*,plz.like.52*)`) + `kurzName` (Vorname N.).
- Abendbericht: Zeile **„Raum Salzburg (50/51/52)"**; lädt jetzt ALLE
  Salzburger Trainer (auch nicht freigegebene) und listet je Trainer
  **„Vorname N., Ort, x/8, freigegeben ja/nein"** (reife/freie zuerst).
  such_eingaben/warteliste zählen über denselben Filter (51/52 inklusive).
- `vexfit-verwaltung.js`: Salzburg-Karte nutzt dieselben Präfixe.
- **Profil-Erinnerung** nutzt `istSalzburgPlz` – bereits dieselbe Quelle.
- **Keine Migration.**

**Tests:**
- `s6_salzburg_test.ts`: Konstante = ["50","51","52"], `salzburgPlzFilter`,
  `istSalzburgPlz("5201")` true / `"1010"` false; Abendbericht-Zeile +
  Trainerliste („Salzburg, 6/8, freigegeben ja" / „Seekirchen, 3/8, …nein").
- `k8_abendbericht_texte_test.ts`: Mock-Leser auf `or=`-Filter umgestellt,
  Seekirchen 5201 zählt mit, Trainerliste gefüllt.
- `profil_erinnerung_test.ts` / `s8_abendbericht_test.ts`: Präfixe/Label/Fixture
  (trainer:[]) angeglichen.
- Suite **805 grün**, `deno check` grün, `deno lint` 30 (Baseline).

**Commit E4:** kern.ts, vexfit-verwaltung.js, 4 Testdateien, Protokoll.

---

## E5 – Freigabe nicht vergessen (keine Migration)

**Umsetzung:**
- `kern.ts` (Abendbericht): „Warten auf Freigabe" lädt jetzt die Profilfelder +
  E-Mail und **schließt Test-/Spam-Konten aus** (`ist_test` ODER E-Mail-Alias
  „+"). Neue Liste **„Bereit zur Freigabe (≥5/8)"** – echte, noch nicht
  freigegebene Trainer mit ≥5/8, als eigene Zeile „Name x/8".
- `vexfit-verwaltung.js`: reine Funktion `bereitZurFreigabe(trainers)` +
  Karte **„✅ Bereit zur Freigabe (≥5/8)"** in „Heute zu tun" mit **direktem
  „Freigeben"-Knopf** (data-aktion="freigeben").
- **Keine automatische Freigabe** eingeführt (Entscheidung bleibt bei Jakob).
- **Keine Migration.**

**Vorschlag (für Jakob):** Eine automatische Freigabe ab z. B. 7/8 wäre denkbar,
ist aber bewusst NICHT gebaut – Freigabe bleibt eine menschliche Prüfung (Schutz
vor Scheinprofilen). Falls gewünscht, später als eigener, abschaltbarer Schalter.

**Tests:**
- `b3_admin_test.ts`: `bereitZurFreigabe` listet nur reife, nicht freigegebene,
  echte Konten (8/8), ohne Test-Alias/ist_test/schon freigegeben.
- `k8_abendbericht_texte_test.ts`: Abendbericht lässt Test-Konto aus „Warten"
  weg und listet „Bereit zur Freigabe (≥5/8): 1 (Reif Eins 8/8)".
- Fixtures (`b7`/`s6`) um `bereitFreigabe` ergänzt.
- Suite **807 grün**, `deno check` grün, `deno lint` 30 (Baseline).

**Commit E5:** kern.ts, vexfit-verwaltung.js, b3/k8-Tests + Fixtures, Protokoll.

---

## E6 – Kunden-Weg Salzburg (keine Migration)

**Befund:** Der Weg für 0/1/2 freigegebene Trainer ist im Code bereits sauber
abgedeckt – E6 bestätigt ihn und ergänzt die teilbaren Links + die Prüfung.

- `personal-trainer-salzburg.html`: ehrlich, **„Für Kunden kostenlos"**, vor Ort
  **oder online**, CTA in die Suche (`?plz=5020&land=AT`), **UTM-Weitergabe** an
  die Suche-Links (inkl. `utm_source=persoenlich`); keine erfundene Trainerzahl.
  Steht bereits in `sitemap.xml` (E0-Nebenbefund war veraltet).
- `suche.html`: **0 Treffer** → Leerzustand bzw. **Nähe-Hinweis mit Vormerkung**
  (`naeheVormerken` → `/neuer-kunde` → interne Mail an office@, aus E1);
  **Online-Trainer** als eigener Abschnitt (Alternative); 1/2 Treffer → Karten
  werden gezeigt. Interne Mail bei Vormerkung UND bei echter Anfrage (E1).
- **Teilbare Links + Beitragstext:** `docs/links-2026-11-10.md`
  (`utm_source=persoenlich`, Instagram/WhatsApp, Du-Form, ehrlich, keine
  erfundenen Zahlen/Versprechen) – zum Freigeben durch Jakob.
- **Playwright:** `e2e/salzburg-kundenweg.spec.ts` deckt 0/1/2 Trainer bei
  **375 px und 1440 px** ab (Supabase/Geo/Vormerkung gestubbt). **Playwright ist
  hier nicht installiert → nicht ausgeführt**, als Spec hinterlegt.
- Nebenbei: `e2e/registrierung-kurz.spec.ts` an E2 angeglichen (Land+PLZ jetzt
  Pflicht, Geo gestubbt).

**Tests (`e6_salzburg_kundenweg_test.ts`, hier ausführbar):** Salzburg-Seite
(kostenlos/online/UTM), suche.html (Leerzustand/Vormerkung/Online), Link-Doku
(persoenlich), Spec deckt 0/1/2 × 375/1440. Suite **811 grün**, check grün,
lint 30.

**Commit E6:** docs/links-2026-11-10.md, e2e/salzburg-kundenweg.spec.ts,
e2e/registrierung-kurz.spec.ts, e6-Test, Protokoll. Keine Codeänderung an den
Seiten nötig (Weg war bereits korrekt). Keine Migration.

---

## E7 – Gesamttest (keine Migration)

- **Deno-Suite:** **811 grün**, `deno check` grün, `deno lint` **30** (Baseline,
  keine neuen).
- **Browser-Rundgang** (Playwright/Chromium, lokaler Server :8799):
  - `pruef-suche.mjs`: **ALLES GRÜN** (375/1440).
  - `pruef-profil-erinnerung.mjs`: **ALLES GRÜN**.
  - `vor-ads-rundgang.mjs`: grün.
  - **`klick-rundgang-b9.mjs`: E7 hat einen echten E2-Regress gefunden und
    behoben** – der Trainer-Registrierungs-Rundgang füllte die **neue
    Pflicht-PLZ** nicht, dadurch blockte `submitTrainer` und `/neuer-trainer`
    feuerte nicht mehr. Fix: Zippopotam gestubbt (5020→Salzburg), Land+PLZ im
    Rundgang gefüllt. Danach **75 ok, 0 Fehlschläge**.
  - `klick-rundgang-k9.mjs`: 2 Fehlschläge zur öffentlichen Namens-Vorschau
    („voller Name sichtbar"/„Vorname N."). **Vorbestehend** – reproduziert mit
    der unveränderten vexfit-trichter.js von vor dem Lauf; **nicht** durch E1–E6
    verursacht (betrifft `suche.html`/`OEFFENTLICHE_VORSCHAU`, die der Lauf nicht
    anfasst). Als offener Punkt in `offen-2026-11-10.md` notiert.
- **Screenshots:** `docs/screenshots/2026-11-10/` – Trainer-Registrierung
  **vorher/nachher** (390 px): nachher zeigt Land + Postleitzahl (E2). Nur
  `registrieren.html` wurde an einer öffentlichen Seite inhaltlich geändert.
- **Service-Worker:** **kein Versionssprung.** Begründung: Der einzige SW
  (`sw-verwaltung.js`) ist nur für die **Admin-Hülle** und precacht ausschließlich
  `verwaltung-…​.html` (unverändert); alles andere (inkl. `vexfit-verwaltung.js`)
  läuft **network-first** – Admins bekommen die neue JS beim nächsten Laden. Die
  geänderten **öffentlichen** Dateien (`registrieren.html`, `vexfit-trichter.js`)
  werden von **keinem** Service-Worker gecacht (es gibt keinen öffentlichen SW).

**Commit E7:** klick-rundgang-b9.mjs (Regress-Fix), Screenshots + README,
Protokoll.
