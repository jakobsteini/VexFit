# Prüfbericht Nachtlauf „Gesamtprüfung" — 2026-11-15

Stand vor dem sn.at-Artikel am **19.11.2026**. Jeder Weg einmal vollständig geprüft.
Format je Zeile: **Nr · Bereich · Prüfpunkt · Ergebnis · Beleg · Maßnahme**

Baseline: `deno test` **873 grün / 0 rot** · `deno check` grün · `deno lint` **30** (Baseline).

---

## Zusammenfassung

**Ampel:** ~46 GRÜN · 9 GELB · 3 ROT (davon **1 behoben**). Keine „NICHT GEPRÜFT"-Blocker.
Tests **873 → 874 grün**, `deno check` grün, `deno lint` 30 (unverändert). Eine Behebung: Commit `9276e3b`.

**Die Live-Datenschutzlage ist sauber:** anon sieht keine Personendaten (alle Tabellen 401/404),
geschützte Endpunkte verlangen Token, Admin verlangt aal2, kein Pixel ohne Zustimmung, kein PII/Secret
im öffentlichen Quelltext. Der eine echte Code-Fehler (doppelte Anfragen bei Doppelklick) ist behoben.
Die wichtigsten offenen Punkte sind **keine** Code-Fehler, sondern **Rechtstexte** und **Deploy-Schritte**.

### Die 10 wichtigsten Punkte für den 19.11. (nach Dringlichkeit)
1. **R1 Datenschutz: Meta-Pixel benennen** (läuft mit Meta-Ads; Entwurf da) — BLOCK, Jakob.
2. **R2 Datenschutz: Herkunftserfassung (Referrer/utm) benennen** (Entwurf da) — BLOCK, Jakob.
3. **R3 Datenschutz: Wunsch-Formular aufnehmen** (Hauptweg ab 19.11.; Entwurf da) — BLOCK, Jakob.
4. **Migrations-Apply bestätigen** — `2026-11-12-01-suche-umkreis` + `2026-11-13-01-wuensche` (Live-Indiz: eingespielt) — Jakob.
5. **R4 Datenschutz: zippopotam-PLZ-Übermittlung (USA) benennen** (Textvorschlag da) — BLOCK, Jakob.
6. **Doppelklick-Schutz Wunsch-Vermittlung** — **behoben (9276e3b)**, muss deployt werden (vexfit-automation).
7. **Testkunden-Prüfung** der authenticated-Policy (e/f/g in `pruef-anon-rest.mjs`) live durchspielen — Jakob.
8. **Mail-Durchsatz bei Artikel-Spitze** (1 SMTP-Konto, 2 Mails/Wunsch) beobachten/entschärfen — BLOCK.
9. **Login-/Passwort-Reset-Flow** einmal live durchspielen — Jakob.
10. **ARTIKEL_URL** am 19.11. in `vexfit-config.js` eintragen (sonst kein Banner) — Jakob.

---

## P0 — Ausgangslage

**Git:** Branch `main`, up to date mit origin/main, HEAD `cd33ec6`. `origin/main..HEAD` leer (nichts ungepusht). Working tree sauber bis auf 3 untracked Marketing-PDFs in `marke/`.

**Edge-Endpunkte** (Router `bearbeiten` in `supabase/functions/vexfit-automation/kern.ts:2270`; `Deno.serve` in `index.ts:1367`). Alle POST außer anders vermerkt. Deploy `--no-verify-jwt`; Schutz = CORS nur `https://vexfit.app` + Eingabeprüfung + (für /stripe) Signatur + (für admin/kunde/trainer) Bearer-Token:

| Pfad | Methode | Auth | Zweck |
|---|---|---|---|
| `neuer-trainer` | POST | – (Eingabeprüfung) | Trainer-Registrierung → Mail/DB |
| `neuer-kunde` | POST | – | Kunden-Registrierung |
| `neue-anfrage` | POST | Kunden-Token | Anfrage eines angemeldeten Kunden |
| `wunsch` | POST | – (Honeypot+Bremse) | Wunsch ohne Konto |
| `trainer-suche` | POST | Kunden-Token | Umkreissuche ≤25 km (service_role) |
| `trainer-profil` | POST | Kunden-Token | Einzelprofil nur mit Anfrage/Recht |
| `admin-aktion` | POST | Admin-Token **aal2** | alle Verwaltungsaktionen |
| `freigabe-pruefen` | POST | (Cron/Key) | Freigabe-Mails |
| `passt-nicht` | POST | – | „passt nicht"-Fall |
| `unbeantwortet-pruefen` | POST | (Cron/Key) | 48-h-Fall |
| `erinnerungen` | POST | (Cron/Key) | Profil-Erinnerungen |
| `abendbericht` | POST | (Cron/Key) | Abendbericht |
| `erinnerung-abmelden` | **GET** | Token im Link | Abmelden ohne Login |
| `warteliste-bestaetigung` | POST | – | Warteliste |
| `warteliste-abmelden` | **GET** | Token im Link | Abmelden ohne Login |
| `stripe` | POST | Stripe-Signatur | checkout.session.completed |

`trainer-alert` (zweite Function): eigener Endpunkt, siehe `supabase/functions/trainer-alert/`.

**Admin-Aktionen** (`adminAktion`, kern.ts:2706, alle aal2): push_abo_speichern/_liste/_entfernen, abendbericht_jetzt, profil_erinnerung_liste/_vorschau/_senden, koordinaten_nachtragen, wuensche_liste, trainer_freischalt_mail, trainer_sperren, trainer_test_markieren/_aufheben, trainer_loeschen, kunde_loeschen, login_sperren/_entsperren, endgueltig_loeschen, anfrage_freigeben, wunsch_trainer, wunsch_an_trainer, wunsch_kein_trainer, wunsch_status.

**Cron-Jobs** (aus Migrationen):
- `vexfit-unbeantwortet-stuendlich` → Ziel `unbeantwortet-pruefen` ✔ existiert.
- `vexfit-erinnerungen-alle-15-minuten` → Ziel `erinnerungen` ✔ existiert.
- `vexfit-abendbericht-14-utc` + `vexfit-abendbericht-15-utc` → Ziel `abendbericht` ✔ existiert.
Alle Cron-Ziele existieren im Code (Router-Switch). Cron-Jobs rufen die Endpunkte mit `VEXFIT_CRON_KEY` auf.

**Migrations-Apply-Status (Live-Indiz über anon-REST):** `wuensche`, `trainers_vorschau`, `trainers_oeffentlich`, `profilaufrufe`, `such_eingaben`, `warteliste`, `trainer_alerts`, `profil_erinnerungen` liefern anon **401** (Tabelle/View existiert, RLS greift) → die zugehörigen Migrationen (bis **2026-11-13-01-wuensche**) sind auf der Live-DB **eingespielt**. `plz_orte`, `zahlungen`, `nachfrage_region` → **404** (nicht im API-Schema; plz_orte bewusst nicht exponiert). **BLOCK/Jakob:** Apply-Status der jüngsten Migrationen formal bestätigen (SQL-Editor), v. a. `2026-11-12-01-suche-umkreis` (Kunden-Umkreis-Policy) und `2026-11-13-01-wuensche`.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 0.1 | P0 | Git-Stand / ungepusht | GRÜN | `git status`, `origin/main..HEAD` leer | – |
| 0.2 | P0 | Edge-Endpunkte katalogisiert | GRÜN | kern.ts:2302 Switch | – |
| 0.3 | P0 | Cron-Ziele existieren | GRÜN | Migrationen + Router | – |
| 0.4 | P0 | Baseline Tests/Lint | GRÜN | 873 grün, lint 30 | – |

---

## P1 — Datenschutz & Zugriffsrechte (höchste Priorität)

**Live anon-REST (nur lesend, GET):** alle personenbezogenen Tabellen liefern anon **401**:
`trainers, trainers_vorschau, trainers_oeffentlich, kunden, anfragen, anfragen_sichtbar, wuensche, profil_erinnerungen, profilaufrufe, warteliste, trainer_alerts, such_eingaben, studios, studio_standorte, push_abos, spam_schutz, stripe_events_verarbeitet` → **401**. `plz_orte, zahlungen, nachfrage_region` → **404**.
Zwei Tabellen liefern **200 mit 0 Zeilen**: `trichter_ereignisse` (anon darf nur INSERT = Beacon, SELECT nur Admin-Policy) und `admin_protokoll` (SELECT-Policy nur authenticated-Admin). In beiden Fällen gibt RLS **keine** Zeile heraus → **kein Datenleck**. Beleg: `werkzeuge/pruef-anon-rest.mjs` (a–c BESTANDEN) + eigener Durchlauf aller Tabellen; Policies in `migrations/2026-10-31-09-...sql:40`, `migrations/2026-11-06-01-trichter.sql:50`.

**Geschützte Endpunkte ohne Token (Live):** `trainer-suche`, `trainer-profil`, `admin-aktion`, `neue-anfrage` → je **401**.

**admin-aktion:** verlangt Bearer-Token → `benutzerAusToken` → `id === ADMIN_ID` → **aal2** (zweiter Faktor) → Ratenbremse. Code `kern.ts:2706-2726`.

**trainers-Policy (authenticated):** `trainers_angemeldet_lesen` = `USING (user_id = auth.uid())` → ein angemeldeter Kunde sieht **keine** fremde Trainerzeile direkt; fremde Trainer nur über `/trainer-suche`/`/trainer-profil` (service_role, ≤25 km, gleiches Land). Beleg `migrations/2026-11-12-01-suche-umkreis.sql:88`.

**Öffentlicher Quelltext:** keine echten E-Mail-Adressen/Nachnamen in ausgelieferten Seiten. Demo-Daten mit erfundenen Namen/Mails liegen nur in `entwuerfe/` — per `_config.yml` von der Veröffentlichung ausgeschlossen (**Live 404** bestätigt für `entwuerfe/`, `migrations/`, `supabase/`, `werkzeuge/`, `supabase-setup.sql`). Keine Secrets außer dem öffentlichen anon-Schlüssel. Admin-Hash-Dateiname nur in der Admin-Datei selbst + deren Script `vexfit-verwaltung.js` (nicht in anderen Seiten/Sitemap/robots). Einzige Straße in ausgelieferten Seiten: DSB Wien (Barichgasse) in `rechtliches.html` — korrekt/erforderlich.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 1.1 | P1 | anon liest keine Personentabelle | GRÜN | alle 401/404 | – |
| 1.2 | P1 | trichter/admin_protokoll 200-leer | GELB | RLS 0 Zeilen, kein Leck | BLOCK: anon `SELECT`-Grant auf `admin_protokoll`/`trichter_ereignisse` entziehen (Defense-in-Depth, DB-Änderung) |
| 1.3 | P1 | geschützte Endpunkte 401 ohne Token | GRÜN | Live-Curl | – |
| 1.4 | P1 | admin-aktion aal2-Pflicht | GRÜN | kern.ts:2718 | – |
| 1.5 | P1 | Kunde sieht nur eigene Zeile / Trainer via Edge | GELB | Policy-Datei korrekt; Live-Apply unbestätigt | BLOCK/Jakob: Migration `2026-11-12-01` als eingespielt bestätigen + Testkunden-Prüfung (e/f/g in pruef-anon-rest.mjs) |
| 1.6 | P1 | kein PII/Secret in öffentlichem Quelltext | GRÜN | `_config.yml` exclude + Live 404 | – |
| 1.7 | P1 | Admin-URL nicht in Sitemap/robots/öffentl. Seiten | GRÜN | grep + sitemap/robots | Hinweis: Hash-URL ist Obscurity; echter Schutz = Login+aal2 (korrekt) |

(P2–P12 folgen)

---

## P2 — Kundenweg „Wunsch abgeben"

`wunsch.html` → Edge `/wunsch` (`wunschEndpunkt`, kern.ts:2125). Serverseitige Prüfung
`wunschGeprueft` (kern.ts:2013): Vorname, gültige E-Mail, Land AT/DE/CH, PLZ, Ziel, Einwilligung
Pflicht; Felder längenbegrenzt; Honeypot + Ratenbremse (`torwacheMailEndpunkt`); Spam-Verdacht
(Wegwerf-Mail/unsinnig) → Wunsch wird gespeichert **und markiert**, **keine** Bestätigungsmail;
**keine Trainerdaten** in der Antwort. Herkunft (utm/Referrer) wird mitgespeichert.
Verwaltung „Wünsche": Status neu→an_trainer_gesendet→vermittelt/abgeschlossen bzw. kein_trainer;
„An Trainer senden" legt echte Anfrage über den bestehenden Ablauf an (Studio-Trainer ohne Zahlung).
Tests: `g1_wunsch_test.ts`, `g2_wuensche_test.ts` (grün).

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 2.1 | P2 | Pflichtfelder/PLZ/Einwilligung serverseitig | GRÜN | kern.ts:2013; g1-Test | – |
| 2.2 | P2 | Honeypot + Bremse | GRÜN | torwacheMailEndpunkt; g1-Test | – |
| 2.3 | P2 | Spam → zur Prüfung, keine Bestätigung | GRÜN | kern.ts:2149 | – |
| 2.4 | P2 | Antwort ohne Trainerdaten | GRÜN | kern.ts:2168 | – |
| 2.5 | P2 | „An Trainer senden" = echte Anfrage | GRÜN | kern.ts:3133 | – |
| 2.6 | P2 | **Doppelklick erzeugt keine doppelte Anfrage** | **ROT→behoben** | g2-Test „Doppelklick" | **behoben in Commit 9276e3b** (409 bei bereits vermitteltem Wunsch) |
| 2.7 | P2 | Kunden außerhalb Salzburg: dieselbe 48-h-Zusage | GRÜN | Mailtext ortsunabhängig „innerhalb von 48 Stunden"; `WUNSCH_FRIST_STUNDEN=48` | – (melden) |

## P3 — Kundenweg angemeldet

`suche.html`/`profil.html`/`kunden-bereich.html` lesen Trainer **nicht mehr direkt**, sondern
über `/trainer-suche` (≤25 km, gleiches Land, nur Vor-Ort, nach km sortiert) und `/trainer-profil`.
`/trainer-profil` (kern.ts:1934): Login (401) + Kundenkonto (403); Profil nur wenn Trainer ≤25 km
um die letzte Such-Mitte **oder** bestehende Anfrage vorliegt, sonst **404** (nicht unterscheidbar
von „existiert nicht"); nur erlaubte Felder. Registrierung/Anmeldung/Passwort-Reset: Seiten
`login.html`, `passwort-vergessen.html`, `passwort-neu.html` vorhanden. Tests: `k3/k4/s1/s2/suche_*`.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 3.1 | P3 | Suche 25 km / gleiches Land / nur Vor-Ort / km-Sortierung | GRÜN | `/trainer-suche`; suche_umkreis_1211-Test | – |
| 3.2 | P3 | profil.html 404 ohne Anfrage/Umkreis, sichtbar mit | GRÜN | kern.ts:1955-1968 | – |
| 3.3 | P3 | Anfrage → Prüfung → Trainer-Mail → Annahme/Ablehnung/Ersatz | GRÜN | neueAnfrage; s4/s5-Tests | – |
| 3.4 | P3 | Login-Weiterleitung / Passwort vergessen | GELB | Seiten vorhanden, Live-Flow nicht durchgespielt (kein Testkonto) | Jakob: einmal live anmelden/zurücksetzen |

## P4 — Trainerweg

`trainer.html` → Registrierung (Land + PLZ Pflicht; Koordinaten per `vexfit-plz.js`). Profil
bearbeiten (`profil-bearbeiten.html`, 8 Angaben, Foto-Upload → `/avatars/`). Profil-Vollständigkeit
x/8 (`profilVollstaendigkeitAcht`). Zahlungsauslöser: Annahme → Stripe-Link; **49,99 €/Monat** erster
Kunde, **9,99 €** je weiterer Kunde — deckungsgleich mit **AGB §3** (`rechtliches.html:55`), index,
registrieren; Wächter `agb_test.ts`, `preis_formulierung_test.ts`, `preismodell_test.ts`. Profil-
Erinnerungen 2 h/3 Tage/7 Tage, gemeinsamer 3-Tage-Abstand, Stopp bei 8/8 oder Test (`erinnerungen_test.ts`,
`profil_erinnerung_test.ts`). Einladungslink `utm_campaign=einladung-jakob` (g5-Test).

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 4.1 | P4 | Registrierung Land+PLZ Pflicht, Koordinaten | GRÜN | trainer.html; vexfit-pflicht.js | – |
| 4.2 | P4 | Profil x/8 korrekt, Foto-Upload | GRÜN | profilstaerke_test, d3_foto_test | – |
| 4.3 | P4 | Preise 49,99/9,99 = AGB §3, überall gleich | GRÜN | agb_test, preis_formulierung_test | – |
| 4.4 | P4 | Erinnerungs-Zeitstrahl 2h/3T/7T, Stopp 8/8 | GRÜN | erinnerungen_test | – |
| 4.5 | P4 | Einladungslink utm_campaign=einladung-jakob | GRÜN | g5_einladung_test | – |

## P5 — Verwaltung

`verwaltung-<hash>.html` + `vexfit-verwaltung.js` (156 KB). Jede Admin-Aktion über `/admin-aktion`
mit Admin-Konto + **aal2** + Ratenbremse + Protokoll (`admin_protokoll`). Reiter/Aktionen: Trainer
(freigeben/sperren/test/löschen/Freischalt-Mail), Kunden, Anfragen (freigeben), Wünsche (vermitteln),
Standort ohne Koordinaten + Nachtragen (`koordinaten_nachtragen`), Profil-Erinnerung, Städte/Raum
Salzburg (km statt Präfix, `trainerImRaumSalzburg` ≤25 km um 5020), Abendbericht (Test-Konten raus).
Login: 401→abmelden, 403→„kein Admin", 2FA-Pflicht. Tests: `admin_*`, `verwaltung_*`, `b7_abendbericht_test.ts`,
`warteliste_admin_test.ts` (grün). Abendbericht-Zählweise durch `b7_abendbericht_test.ts` mit gestubbten
Daten nachgerechnet (grün).

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 5.1 | P5 | Jede Aktion aal2 + Protokoll | GRÜN | kern.ts:2718; adminaktion_test | – |
| 5.2 | P5 | Abendbericht-Zählweise (Test-Konten raus, ≤25 km) | GRÜN | b7_abendbericht_test | – |
| 5.3 | P5 | Login 401/403/2FA | GRÜN | admin_login_schleife_test | – |
| 5.4 | P5 | Standort ohne Koordinaten + Nachtragen | GRÜN | koordinaten_nachtragen; g6-Test | – |

## P6 — E-Mails

Mail-Vorlagen in `kern.ts` (+ `_shared/mailgeruest.ts`). Absender `ABSENDER` (office@vexfit.app),
interne an `BETREIBER`. Du-Ansprache durchgängig. Service-Mail-Fußzeile: „Jakob Steinbacher, 5330
Fuschl am See, Österreich" — **Ort/PLZ, keine Straße/Hausnummer** (zulässig). Interne Mails an office@
mit Deep-Link in die Verwaltung (geheimer Pfad nur hier, nie öffentlich). Preise in Mails korrekt
(49,99/9,99). Links in Mails (`rechtliches.html`, `suche.html`, `login.html`, `profil.html`,
`buy.stripe.com`) existieren/liefern 200.

**Vollständige Kunden-/Interessenten-Mailtexte** siehe Abschnitt „Mailtexte" am Dateiende (P12-Anhang).

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 6.1 | P6 | Du/Sie einheitlich, Rechtschreibung | GRÜN | gerenderte Texte | – |
| 6.2 | P6 | Fußzeile ohne Straße/Hausnummer | GRÜN | Rendering „5330 Fuschl am See" | – |
| 6.3 | P6 | Preise/Versprechen korrekt | GRÜN | Rendering + agb_test | – |
| 6.4 | P6 | Links in Mails erreichbar | GRÜN | curl 200 | – |

## P7 — Öffentliche Seiten & Texte

Live-Prüfung (eingebauter Browser, https://vexfit.app): `index`, `wunsch`, `trainer`, `registrieren`,
`personal-trainer-salzburg`, `rechtliches` bei **375 px → 0 px waagrechter Überlauf** (je `scrollWidth=375`).
`registrieren.html` ohne Zustimmung: **keine** Konsolenfehler, **kein** Facebook-/Pixel-Aufruf.
Button-Kontrast (STARTEN schwarz auf Gelb) ≥ 4,5:1. Interne Links: alle Ziele vorhanden. Externe Links
(`buy.stripe.com`, cdnjs Leaflet, `wa.me`, `ec.europa.eu/odr`, `dsb.gv.at`) → **200**. Dashboard-/Netlify-
Links nur in `anleitung.html` (intern, noindex). Artikel-Banner: `ARTIKEL_URL=""` → **kein Banner**
(validiert https, Linktext via textContent). Preise überall gleich; keine öffentlichen Trainerlisten.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 7.1 | P7 | Kein waagrechter Überlauf @375 | GRÜN | Browser-Messung overflow=0 | – |
| 7.2 | P7 | Keine Konsolenfehler (registrieren) | GRÜN | read_console_messages leer | – |
| 7.3 | P7 | Interne + externe Links (Status) | GRÜN | lokale Existenz + curl 200 | – |
| 7.4 | P7 | Artikel-Banner leer → kein Banner | GRÜN | vexfit-config.js ARTIKEL_URL="" ; g4-Test | – |
| 7.5 | P7 | Screenshots 375/1440 nach docs/screenshots | GELB | visuell im Browser geprüft (index mobil ok); Dateien nicht gespeichert (kein Playwright hier) | Jakob: optional eigener Screenshot-Lauf |
| 7.6 | P7 | wunsch.html indexierbar, aber nicht in sitemap.xml | GELB | sitemap.xml | Vorschlag: `wunsch.html` in Sitemap aufnehmen (optional) |

## P8 — Recht (nur prüfen & melden)

`rechtliches.html` (Impressum + Datenschutz + AGB) deckt Stripe, Supabase, Cookies, DSGVO-Rechte ab.
**Nicht** abgedeckt: **Meta-Pixel/Facebook**, **Herkunftserfassung (Referrer/utm)**, **Wunsch-Formular**,
**PLZ-Auflösung über api.zippopotam.us** (US-Übermittlung; Aufruf in `vexfit-plz.js`). Entwürfe liegen in
`docs/recht/` (entwurf-meta-capi, entwurf-herkunft, entwurf-wunsch) — nur noch einzuarbeiten.
Einwilligungsbanner: Pixel feuert **erst nach Zustimmung** (live bestätigt, kein Netzaufruf ohne
Zustimmung). AGB §3 = Preistexte im Code. **Vorschläge: `docs/recht/vorschlaege-2026-11-15.md`.**

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 8.1 | P8 | Datenschutz nennt Meta-Pixel | ROT | 0 Treffer in rechtliches.html | BLOCK R1 (Entwurf vorhanden) |
| 8.2 | P8 | Datenschutz nennt Herkunftserfassung | ROT | 0 Treffer | BLOCK R2 (Entwurf vorhanden) |
| 8.3 | P8 | Datenschutz nennt Wunsch-Formular | GELB | 0 eigener Punkt | BLOCK R3 (Entwurf vorhanden) |
| 8.4 | P8 | zippopotam-Übermittlung genannt | GELB | 0 Treffer; Aufruf real | BLOCK R4 (Textvorschlag im Dokument) |
| 8.5 | P8 | Pixel nur mit Einwilligung | GRÜN | Live-Netzmitschnitt ohne Zustimmung = kein fb-Aufruf | – |
| 8.6 | P8 | AGB §3 = Preistexte | GRÜN | agb_test | – |

## P9 — SEO, Sitemap, Robots, GitHub-Abläufe

`sitemap.xml` gültig, 5 öffentliche Seiten, **keine** Login-Seite, **keine** Admin-Adresse. `robots.txt`
sperrt admin/suche/entwuerfe/migrations/setup. `noindex` korrekt auf allen internen/geschützten Seiten
(admin, verwaltung, login, passwort*, profil*, suche, kunden-/trainer-bereich, studio, john-harris*,
anleitung, Ad-Seiten). Öffentlich indexierbar: index, personal-trainer-salzburg, rechtliches, registrieren,
trainer, (wunsch). `handbuch-demo.html` existiert nicht (Vexfit). SEO-Ablauf `werkzeuge/stadtseiten.mjs`
ist **STILLGELEGT** — liest **keine** Trainerdaten mehr, schreibt Sitemap ohne Profile → läuft ohne
anon-Lesezugriff.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 9.1 | P9 | Sitemap ohne Login-/Admin-Seiten | GRÜN | sitemap.xml | – |
| 9.2 | P9 | noindex auf internen Seiten | GRÜN | per-Seiten-Prüfung | – |
| 9.3 | P9 | SEO-Workflow ohne anon-Trainerzugriff | GRÜN | stadtseiten.mjs STILLGELEGT | – |

## P10 — Stabilität & Fehlerfälle

Router fängt alle Fehler ab → 500 **mit** Meldung + `a.melden`-Log, nie nackter 500 (kern.ts:2298,2340).
Eingabegrenzen: `KOERPER_GRENZE=20000`, Feld-Grenzen `GRENZEN`. Bremsen: Suche `SUCHEN_PRO_STUNDE=30`,
Wunsch Honeypot+Rate. Service-Worker (nur Verwaltung, `sw-verwaltung.js`): **network-first** +
`skipWaiting` + `clients.claim` → nach Push garantiert neue Fassung; öffentliche Seiten ohne SW (Host
liefert frisch). **Artikel-Spitze (100 Wünsche/10 min):** DB-Inserts günstig, Honeypot filtert Bots;
**aber** Ratenbremse ist **pro Instanz** (nicht geteilt) und pro Wunsch gehen **2 Mails** über **ein**
Gmail-SMTP-Konto → mögliche SMTP-Drosselung/Verzögerung unter Last.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 10.1 | P10 | Kein nackter 500, Fehler protokolliert | GRÜN | kern.ts:2298; cron_robust_test | – |
| 10.2 | P10 | Bremsen greifen (Suche 30/h, Wunsch) | GRÜN | SUCHEN_PRO_STUNDE; torwache | – |
| 10.3 | P10 | SW liefert nach Push neue Fassung | GRÜN | sw-verwaltung.js network-first | – |
| 10.4 | P10 | Artikel-Spitze Mailversand | GELB | 1 SMTP-Konto, 2 Mails/Wunsch | BLOCK: Mail-Durchsatz/Queue bei Spitze beobachten; ggf. Bestätigungsmail drosseln |
| 10.5 | P10 | Ratenbremse geteilt über Instanzen | GELB | „je Instanz" (kern.ts:297) | BLOCK: bei echter Lastspitze DB-gestützte Bremse erwägen |

## P11 — Code-Hygiene

`deno lint` **30** (Baseline, keine neuen): 15 no-var (`vexfit-trichter.js`, Browser-Beacon),
8 require-await (Testdateien b8/k8/k1), 5 no-unused-vars (Tests + `vexfit-vorschau.js` catch-`e`),
2 no-inner-declarations. Alle kosmetisch, in Tests/Beacon — **vor dem Start bewusst nicht angefasst**
(Baseline dokumentiert; Änderung ohne Verhaltensgewinn, Regressionsrisiko am Beacon). Toter Code:
`stadtseiten.mjs` STILLGELEGT (alter Erzeugungscode absichtlich erhalten), `OEFFENTLICHE_VORSCHAU`
(Schalter, Default aus — bewusst behalten). Testabdeckung P1–P4 gut (874 Tests); neuer Test für
P2-Doppelklick ergänzt.

| Nr | Bereich | Prüfpunkt | Ergebnis | Beleg | Maßnahme |
|---|---|---|---|---|---|
| 11.1 | P11 | Lint-Altwarnungen gruppiert | GRÜN | deno lint (30) | gemeldet, nicht geändert |
| 11.2 | P11 | Toter Code identifiziert | GRÜN | stadtseiten/Vorschau-Schalter | bewusst behalten |
| 11.3 | P11 | Testlücke P2 Doppelklick | GRÜN | neuer g2-Test | behoben (9276e3b) |

---

## Anhang — Vollständige Kunden-/Interessenten-Mailtexte (gerendert aus kern.ts)

### Wunsch-Bestätigung (an Interessent) — Betreff: „Danke für deinen Wunsch – Vexfit"
```
Danke! Wir melden uns.

Hallo Maria, danke für deinen Wunsch. Jakob von Vexfit meldet sich innerhalb von 48 Stunden mit einem passenden Trainer.

Vexfit.app · Salzburg · Österreich
Impressum: https://vexfit.app/rechtliches.html
```

### Kein-Trainer (an Interessent) — Betreff: „Dein Wunsch bei Vexfit – kurzer Zwischenstand"
```
Kurzer Zwischenstand

Hallo Maria, danke für deine Geduld. Aktuell haben wir in Salzburg noch keinen passenden Personal Trainer frei. Wir haben dich vorgemerkt und melden uns, sobald ein Trainer dazukommt. Für dich bleibt es kostenlos.

Vexfit.app · Salzburg · Österreich
Impressum: https://vexfit.app/rechtliches.html
```

### Anfrage/Vorschläge (an Kunde, S4) — Betreff: „Passende Trainer für dich auf Vexfit"
```
Ein passender Trainer für dich

Hallo Maria, deine letzte Anfrage hat nicht geklappt. Damit du trotzdem schnell weiterkommst, haben wir einen passenden Trainer in deiner Region herausgesucht. Jeder entscheidet selbst, ob und wie er antwortet.

Vorschlag 1: John Harris (Salzburg)

Erstes Profil ansehen: https://vexfit.app/profil.html?id=<trainer-id>

Du erhältst diese E-Mail, weil deine Anfrage auf Vexfit nicht angenommen wurde.
Jakob Steinbacher, 5330 Fuschl am See, Österreich
```

### Warteliste-Bestätigung (an Kunde) — Betreff: „Wir haben deine Anfrage – Vexfit"
```
Deine Anfrage ist bei uns

Hallo, wir haben deine Anfrage für 5020. Sobald ein Trainer in deiner Nähe startet, melden wir uns bei dir.

Vexfit.app · Salzburg · Österreich
Impressum: https://vexfit.app/rechtliches.html
```

### Trainer-da (an Kunde) — Betreff: „Ein Trainer in deiner Nähe ist da – Vexfit"
```
Ein Trainer in deiner Nähe ist da

Hallo, gute Nachricht: In 5020 ist jetzt ein Personal Trainer auf Vexfit verfügbar. Schau dir die Trainer an und frag direkt an.

Trainer ansehen: https://vexfit.app/suche.html

Vexfit.app · Salzburg · Österreich
Impressum: https://vexfit.app/rechtliches.html
```

### Erste Anfrage (an Trainer) — Betreff: „Deine erste Kundenanfrage auf Vexfit"
```
Deine erste Kundenanfrage

Hallo John, über Vexfit hat dich jemand angefragt. Nimm die Anfrage an, um Name und E-Mail zu sehen und loszulegen – oder lehne sie kostenlos ab.

Ziel: Abnehmen

Anfrage annehmen (Abo aktivieren): https://buy.stripe.com/...?prefilled_email=...

Erst mit dem Annehmen beginnt dein Abo: 49,99 € pro Monat, monatlich kündbar (AGB §3). Ablehnen kostet nichts. Die Kontaktdaten erhältst du unmittelbar nach der Zahlung.

Du erhältst diese E-Mail, weil du ein Trainerprofil auf Vexfit angelegt hast.
Jakob Steinbacher, 5330 Fuschl am See, Österreich
```

### Freischaltung (an Trainer) — Betreff: „Dein Vexfit-Profil ist freigeschaltet"
```
Dein Profil ist freigeschaltet

Hallo John, gute Nachrichten: Dein Profil auf Vexfit ist ab sofort freigeschaltet und für Kundinnen und Kunden in deiner Nähe sichtbar. … Erst mit der Annahme deiner ersten Kundenanfrage über Vexfit beginnt die Zahlungspflicht – bis dahin bleibt alles kostenlos. … Liebe Grüße, Jakob – Vexfit · office@vexfit.app · +43 660 3675175

Profil vervollständigen: https://vexfit.app/login.html

Du erhältst diese E-Mail, weil dein Trainerprofil auf Vexfit freigeschaltet wurde.
Jakob Steinbacher, 5330 Fuschl am See, Österreich
```

---

## P12 — Behebungen, Migrationen, Deploy

**Behebungen:**
- `9276e3b` — `supabase/functions/vexfit-automation/kern.ts` (Doppelklick-Schutz in `wunsch_an_trainer`, 409 bei bereits vermitteltem Wunsch) + Test `g2_wuensche_test.ts`. Vorher rot, nachher grün.

**Neue Migrationsdateien:** **keine** (es wurde keine DB-Änderung vorgenommen).

**Edge Functions, die deployt werden müssen:** **`vexfit-automation`** (enthält den Doppelklick-Fix in `kern.ts`).

**Typprüfung/Linter/Tests:** `deno test` **873 → 874 grün** · `deno check` grün · `deno lint` **30 → 30** (keine neuen).
