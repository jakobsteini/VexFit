# Dauerlauf „Suche fertig" (D0–D9) – 08.11.2026

Arbeitsordner: `/Users/js/Projekte/Vexfit/app/vexfit`
Start-HEAD: `0d48bd3` (S9), Zweig `main`, **nicht gepusht**.
Ziel: `https://vexfit.app/suche.html` fertig zum Zeigen (Salzburg), Wochenplan KW46 bereit.

Pflichtregeln eingehalten: keine Rückfragen, Migrationen nur als Datei (mit
Rücknahme), kein Deploy, kein `git push`, kein DB-Aufruf. Pro Baustein:
`deno check` + `deno lint` + alle Tests, nur bei Grün committen.

Baseline vor dem Lauf:
- Tests: **740 passed, 0 failed** (`deno test --allow-read --allow-run --allow-env`).
- `deno check supabase/functions/vexfit-automation/index.ts`: **grün**.
- `deno lint`: **30 Probleme, alle vorbestehend** (19× vexfit-trichter.js, 1×
  vexfit-vorschau.js, Rest in Test-Dateien). Ziel: keine neuen Befunde.

---

## D0 – Bestandsaufnahme

### Ladewege für Trainerdaten (Stand Start-HEAD 0d48bd3)

| Seite | Zeile | Für wen | Quelle | Spalten (gekürzt) | Nachname? |
|---|---|---|---|---|---|
| suche.html | 355 (`ladeVorschau`) | **nicht angemeldet** (Vorschau AN) | `trainers_vorschau` | …,`nachname_initial`,… ,`land` | **nein** (nur Initiale) |
| suche.html | 358 (Rückfall) | nicht angemeldet, falls Sicht fehlt | `trainers_oeffentlich` (`VORSCHAU_FALLBACK_SPALTEN`) | ohne `nachname` | **nein** |
| suche.html | 377 (`ladeOeffentlich`) | nicht angemeldet, nur wenn Vorschau AUS | `trainers_oeffentlich` (`OEFFENTLICHE_SPALTEN`) | …,`nachname`,… | **JA** (toter Pfad, Vorschau ist AN) |
| suche.html | 653 (`loadTrainers`) | **angemeldet** | Tabelle `trainers` | voll inkl. `nachname` | ja (erlaubt) |
| profil.html | 416 (anon-Zweig) | **nicht angemeldet** + Suchmaschinen | `trainers_oeffentlich` | …,`nachname`,… | **JA – LECK** |
| profil.html | 415 (angemeldet) | angemeldet | Tabelle `trainers` | voll | ja (erlaubt) |
| index.html | – | – | lädt keine Trainer (verlinkt nur Suche) | – | – |
| personal-trainer-salzburg.html | – | – | lädt keine Trainer (verlinkt nur `suche.html?plz=5020&land=AT`) | – | – |
| Stadtseiten | – | – | nur `personal-trainer-salzburg.html` vorhanden, keine Karten | – | – |

**Befund D1:** `profil.html` liefert nicht angemeldeten Besuchern (und
Suchmaschinen) über `trainers_oeffentlich` den **vollen Nachnamen** aus – im DOM
(`#pName`), in den Meta-Tags (Titel/Beschreibung/og) und im JSON-LD (`Person.name`).
Das ist der konkrete Rückstand gegenüber „nur Vorname N. öffentlich". `suche.html`
ist für nicht Angemeldete bereits PII-frei (Vorschau-Pfad); nur der tote Pfad
`ladeOeffentlich` (Zeile 377) führt noch `nachname` – wird bei eingeschalteter
Vorschau nie betreten, soll aber trotzdem entschärft werden.

**Live-Hinweis (vom Betreiber, 07.11. 21:59):** live zeigt die Seite noch den
vollen Nachnamen. Ursache ist, dass der aktuelle Stand (Vorschau-Code) **nicht
deployt** und die Sicht `trainers_vorschau` **nicht eingespielt** ist – nicht ein
Fehler im aktuellen Code. Nach Push + Migration + dem D1-Fix für profil.html ist
das behoben.

### Sicht trainers_vorschau (Migration 2026-11-08-01)

Datei existiert (nur Datei, nicht eingespielt). Erzeugt
`public.trainers_vorschau` (security_invoker=false, GRANT an anon+authenticated),
liefert **keinen** vollen Nachnamen (nur `nachname_initial`), keinen Monatspreis,
keine Kontaktdaten; nur `aktiv=true AND gesperrt IS NOT TRUE`. Enthält `land`.
Fehlt die Sicht, fällt `suche.html` auf `trainers_oeffentlich` ohne Nachnamen
zurück (PII-sicher).

### Service-Worker / Cache

Einziger Service Worker: `sw-verwaltung.js` (nur die Verwaltungs-PWA). Die
**öffentlichen Seiten** (`index/suche/profil/personal-trainer-salzburg`)
registrieren **keinen** Service Worker und werden nicht per SW gecacht. Für D1/D8
ist daher an den öffentlichen Seiten **keine** SW-Cache-Version hochzuzählen.

### Screenshots VORHER

Lokaler Server + Playwright/Chromium mit **gemocktem** Backend (kein Live-DB-Zugriff,
keine echten Daten) – gleiche Methode wie der bestehende `rundgang/`-Ablauf.
Skript: `rundgang/screenshots-suche.mjs`. Ablage: `docs/screenshots/2026-11-08/vorher/`.
(Playwright ist hier verfügbar: Chromium im ms-playwright-Cache, Version 1.65.0.)

---

### D0 – Sichtbefund aus den VORHER-Screenshots (375 px, ?plz=5020&land=AT)

- Status „Salzburg · 4 Trainer in 25 km gefunden", darunter aber nur **2 Karten**:
  die Vorschau zeigt nur Profile mit Foto (`vorschauReif` verlangt ein Foto),
  Carla/Anna (ohne Foto) fallen heraus. Bestehendes S-Verhalten.
- **D2 bestätigt:** Max M. (München, DE, Online) steht ohne Trennung in derselben
  Liste wie Ben (Salzburg, vor Ort), nur „Online · München", **keine**
  Länderkennzeichnung, **kein** eigener Online-Abschnitt.
- **D3 bestätigt:** Das Kartenfoto (`background-position:center`) zeigt die
  Bildmitte (Rumpf), der Kopf wird oben abgeschnitten.
- **D4 bestätigt:** Der Knopf „✨ Passenden Trainer in 4 Fragen finden" ist nur
  eine dünne gelbe Umrandung mit gelbem Text – als Fläche schwach.
- **Kopfzeile:** Die Hauptüberschrift steht klar unter der festen Kopfzeile
  (kein Überlappen bei 375 px). D4-Kopfzeile ist nur defensiv (Anker) zu härten.

D0: **erledigt.**

---

## D1 – Kein voller Nachname öffentlich

Änderungen (Code):
- `profil.html`: Nicht angemeldete laden über **`ladeProfilVorschau(id)`** –
  genau ein Weg: `trainers_vorschau` (ohne vollen Nachnamen), Rückfall auf
  `trainers_oeffentlich` **ohne** `nachname`. Neuer Helfer `profilAnzeigeName(t)`
  liefert angemeldet den vollen, sonst „Vorname N." (aus `nachname_initial`).
  Titel, Beschreibung, og-Tags und **JSON-LD** tragen damit für Nichtangemeldete
  keinen vollen Nachnamen mehr. Avatar-Initialen nutzen `nachname_initial`.
  Folge (bewusst): Video, Galerie, Monatspreis, Probetraining, Antwortzeit und
  Zertifikate gehören nicht zur Vorschau und bleiben für Nichtangemeldete
  ausgeblendet – sie erscheinen nach der Anmeldung. Angemeldete sehen unverändert
  das volle Profil.
- `suche.html`: `OEFFENTLICHE_SPALTEN` (nur bei Vorschau AUS) ohne `nachname`,
  Sortierung `order=vorname.asc`; Freitextsuche trifft Nachnamen nur noch für
  Angemeldete. (Der Vorschau-Pfad war bereits PII-frei.)

Migration (nur Datei, mit Rücknahme):
- `migrations/2026-11-08-03-anon-kein-nachname.sql`: entzieht `anon` den
  Spalten-Lesezugriff auf `nachname` in `public.trainers_oeffentlich` (+ defensiv
  auf der Basistabelle). Nur die Spalte wird gesperrt, damit der PII-freie
  Rückfall weiter funktioniert. Einspielen **nach** `2026-11-08-01`.
  Liste aller anon-Leser dieser Sichten steht im Kopf der Migration.

Service Worker: öffentliche Seiten werden nicht per SW gecacht → keine
SW-Version zu zählen (siehe D0). 

Tests: `d1_kein_nachname_test.ts` (4 neu). Suite **744 grün**, `deno check` grün,
`deno lint` **30** (Baseline, keine neuen).

D1: **erledigt** – Commit folgt.

## D2 + D3 – Standortfilter pro Land (zwei Abschnitte) + Trainerfoto zentriert

D2 und D3 teilen eine Karten-Umstellung (gemeinsamer Commit).

**D2 – zwei Abschnitte:**
- Neues reines Modul `vexfit-abschnitte.js` (`einteilen`, `istOnline`,
  `nurOnline`, `ausLand`, `LANDNAME`) – ohne DOM/Netz prüfbar.
  Regeln: Vor-Ort = nur gewähltes Land und nicht reiner Online; Online =
  alle mit Online-Angebot, aber „beides" aus dem gewählten Land steht nur vor Ort
  (kein Doppeleintrag); Online: gewähltes Land zuerst, andere Länder mit
  „Online · aus Deutschland/Schweiz/Österreich".
- `suche.html`: `umkreisSuche` trennt über `vexAbschnitte.einteilen`, berechnet
  Entfernungen nur für die Vor-Ort-Kandidaten, rendert über `renderErgebnis` zwei
  `<section>`-Abschnitte. 0 Vor-Ort-Treffer → ehrlicher Hinweis + nächste im
  selben Land (bis 6) bzw. leerer Vor-Ort-Abschnitt + Vormerkband; Online-Abschnitt
  und Anfrage bleiben möglich. **URL-Zustand**: `urlStand()` schreibt plz/land/radius
  per `history.replaceState`; beim Laden werden plz, land **und radius** aus der
  Adresse übernommen (Teilen/Neuladen/Zurück).
- Live im eingebauten Browser bestätigt: DE-Online-Trainer erscheint bei
  AT-Suche nur im Online-Abschnitt mit „aus Deutschland", nicht vor Ort.

**D3 – Foto zentriert:**
- Kartenfoto jetzt echtes `<img class="cimg">` statt Hintergrundbild:
  `object-fit:cover; object-position:center top` (Gesicht nicht abgeschnitten),
  feste `.ci`-Höhe 160 px (alle Karten gleich), `loading="lazy"`, feste
  `width/height`, `alt` = „Vorname N.". Ohne Foto zentrierter Initialen-Platzhalter
  (`.cav`) in gleicher Größe. In den VORHER-Bildern war die Bildmitte (Rumpf) zu
  sehen; jetzt der Kopf.
- `personal-trainer-salzburg.html` nutzt KEINE eigenen Karten (verlinkt nur die
  Suche) → nichts anzupassen.

Drei bestehende Tests an die neue (gleichwertige) Umsetzung angepasst
(admin_test, k4_naehe_test, nachtlauf_phase2_kunde_test). Neu: `d2_abschnitte_test.ts`
(5), `d3_foto_test.ts` (3). Suite **752 grün**, check+lint grün (30 Baseline).

D2: **erledigt.** D3: **erledigt.**

## D4 – Kontrast und Kopfzeile

- Knopf „✨ Passenden Trainer in 4 Fragen finden": von dünnem Umriss (Akzent auf
  Akzent) auf gefüllte Fläche `.match-cta` = **Schwarz #0A0A0A auf #E8FF00**
  (Kontrast ≈ 15:1, ≥ 4,5:1), mit sichtbarem Fokusring.
- Kopfzeile: `html{scroll-padding-top:76px}` – Anker-Sprünge (und Laden mit #hash)
  landen nicht mehr unter der festen Kopfzeile. Die Hauptüberschrift stand schon
  frei (siehe D0), bleibt es bei 375 und 1440 px.
- Gesamtkontrast: `--text-muted` von `#666` auf **`#8a8a8a`** angehoben (wie
  personal-trainer-salzburg.html). Kleiner Text (Kartenort, Entfernung, Zähler,
  Footer) erreicht so auf Schwarz/Karten ≥ 4,5:1. axe-core ist nicht im Projekt;
  der Knopf-Kontrast wird in `d4_kontrast_test.ts` echt nachgerechnet, die
  Live-Werte prüft D7 über die berechneten Stile.

Test `d4_kontrast_test.ts` (3, inkl. WCAG-Rechner). Suite grün, lint 30 Baseline.
D4: **erledigt.**

## D5 – Karten und Seite aufräumen

Die einheitliche Karte wurde bereits in D2/D3 eingeführt (`trainerKarteHtml`) und
speist Standard-, Filter-, Matching- UND Abschnitts-Ansicht. Damit sind die
D5-Punkte erfüllt:
- Karte: Foto / „Vorname N." / Ort bzw. „Online · aus …" / Entfernung / Preis
  (sonst „Auf Anfrage") / Schwerpunkte / Abzeichen / „Anmelden und anfragen"
  (nicht angemeldet) bzw. klickbare Karte (angemeldet).
- Abzeichen „Neu" (erste 30 Tage) unverändert erhalten.
- Leere Felder sauber ausgeblendet: Ort-Zeile filtert leere Teile, Schwerpunkte
  nur wenn vorhanden, Preis fällt auf „Auf Anfrage" – kein „undefined"/„null".
- Filterleiste am Handy: **kein waagrechter Scroll** bei 375 px (sogar 320 px),
  live geprüft (`document.documentElement.scrollWidth == clientWidth`).
  Ladezustand (#loading / plzStatus) und Fehlermeldung (Grid-Fehlertext) sichtbar.

Test `d5_karten_test.ts` (4). Suite **759 grün**, check+lint grün (30 Baseline).
D5: **erledigt.**

## D6 – SEO und Teilen (ohne Datenbankänderung)

- `suche.html`: **canonical** auf `https://vexfit.app/suche.html` (ohne Parameter);
  Seite bleibt **noindex**. Neuer `setzeSucheSeo(stadt, land)` setzt nach einer
  Suche Titel/Beschreibung/og/twitter passend zu **Ort und Land** – z. B.
  „Personal Trainer in Salzburg finden | Vexfit". **Keine personenbezogenen
  Daten** in Meta-Tags (nur Ort/Land; der Test schließt nachname/email/telefon aus).
- **Sitemap/robots – Entscheidung:** Die Suche wird NICHT schädlich indexiert.
  `robots.txt` enthält `Disallow: /suche.html`, die Seite ist `noindex`, und
  `sitemap.xml` listet **keine** `suche.html`- oder PLZ-Varianten. Damit entstehen
  keine tausenden PLZ-Seiten im Index. Die `sitemap.xml` wird von
  `werkzeuge/stadtseiten.mjs` erzeugt (Einschluss je Datei) und daher **nicht von
  Hand** geändert.
- Hinweis (kein BLOCK, Folgeaufgabe): `personal-trainer-salzburg.html` ist
  indexierbar, steht aber noch nicht in der `sitemap.xml`. Beim nächsten Lauf des
  Generators (`werkzeuge/stadtseiten.mjs`) wird sie aufgenommen; bewusst nicht von
  Hand ergänzt, um Konflikte mit dem Generator zu vermeiden.

Test `d6_seo_test.ts` (2). Suite **761 grün**, check+lint grün.
D6: **erledigt.**

## D7 – Gesamttest

- Alle Deno-Tests: **761 grün** (`deno test --allow-read --allow-run --allow-env`),
  `deno check` grün, `deno lint` **30** (Baseline, keine neuen).
- NACHHER-Screenshots in `docs/screenshots/2026-11-08/nachher/` (gleiche 5 Fälle
  × 375/1440 px, Cookie-Banner ausgeblendet für klare Sicht).
- Automatische Browser-Prüfungen `rundgang/pruef-suche.mjs` (Playwright, gemockt),
  **alle grün** bei 375 und 1440 px:
  - 4-Fragen-Knopf Kontrast **17,66 ≥ 4,5:1**,
  - Überschrift sichtbar (label-Oberkante ≥ Kopfzeilen-Unterkante),
  - Kartenfoto zentriert (Bildmitte = Kartenmitte **± 0 px**), object-fit cover,
    object-position oben (50% 0%),
  - kein waagrechter Scroll bei 375 px,
  - **kein voller Nachname im DOM** (Kanarienwert „LECKNACHNAME" taucht nie auf),
    Kartennamen sind „Vorname N.", und **keine anon-Abfrage** wählt den vollen
    Nachnamen aus.
- Vergleichsseite `docs/screenshots/2026-11-08/vergleich.html` (vorher/nachher
  nebeneinander, nur lokal) – im eingebauten Browser geprüft.

D7: **erledigt.**

## D8 – Service-Worker und Cache

**Entscheidung: keine Cache-Version hochzuzählen.** Begründung:
- Die **öffentlichen** Seiten (index/suche/profil/personal-trainer-salzburg/
  registrieren/login) registrieren **keinen** Service Worker und werden nicht per
  SW gecacht. Der einzige SW ist `sw-verwaltung.js`, registriert allein in
  `vexfit-verwaltung.js` (Admin-App), mit engem Geltungsbereich: er cacht nur die
  Verwaltungs-Hülle und **keine** öffentliche Seite und **keine** Supabase-Daten.
- D1–D7 ändern keine Datei, die dieser SW cacht (die Admin-Hülle blieb unberührt).
  Ein Hochzählen von `vexfit-admin-huelle-v3` würde nur die Admin-Hülle grundlos
  verwerfen und die öffentlichen Änderungen **nicht** schneller ausliefern.
- Die öffentlichen Änderungen kommen über den normalen HTTP-Cache von GitHub Pages
  (kurze max-age) an; `vexfit-abschnitte.js` ist eine **neue** Adresse (kein
  Cache), und die neue `suche.html` referenziert sie erst, wenn sie selbst frisch
  geladen ist – kein Misch-Zustand.

Invariante abgesichert durch `d8_cache_test.ts` (2). Suite **763 grün**.
D8: **erledigt** (kein Versionssprung – bewusst).
