# Vexfit – Seitenprüfung 01.11.2026 (Gesamtprüfung Teil 2)

Werkzeug: Playwright/Chromium headless, jede Seite bei **1440 px** und **390 px**,
Rendern über `file://`. Screenshots in diesem Ordner (`<seite>-<breite>.png`).

Hinweis zur Datenanzeige: Über `file://` lehnt Supabase die Herkunft `null` ab,
deshalb laden echte Trainer-/Kundendaten nicht – geprüft wurden Layout, Querscroll,
Struktur und Skriptfehler. Datenwege werden gemockt getestet (Teil 3/5) und live
nach dem Push (Teil 10).

## Befund-Tabelle

| Seite | 1440 | 390 | Befund | behoben |
|---|---|---|---|---|
| index | ok | ok | – | – |
| registrieren (Trainer) | ok | ok | – | – |
| registrieren (Kunde) | ok | ok | – | – |
| login | ok | ok | – | – |
| passwort-vergessen | ok | ok | – | – |
| passwort-neu | ok | ok | – | – |
| suche | ok | ok | – | – |
| profil | ok | ok | – | – |
| kunden-bereich | (Login) | (Login) | wirft „no session" ohne Anmeldung → Umleitung login.html (Auth-Gate, erwartet) | n/a |
| trainer-bereich | (Login) | (Login) | wie oben (Auth-Gate, erwartet) | n/a |
| profil-bearbeiten | (Login) | (Login) | wie oben (Auth-Gate, erwartet) | n/a |
| anleitung | ok | ok | sichtbarer Kontakt vexfit.info@gmail.com → **office@vexfit.app** | ja |
| rechtliches | ok | ok | – (Impressum korrekt: +43 660 3675175, office@vexfit.app, Adresse nur hier) | – |
| 404 | ok | ok | – | – |
| admin | (Login) | (Login) | Auth-Gate (erwartet); Kontakt-Mailtos vexfit.info@gmail.com → **office@vexfit.app** | ja |
| john-harris | ok | ok | – (Studio-Seite, noindex) | – |
| john-harris-aufsteller | ok | **Querscroll 475>390** | A4-Druckplakat, breiter als Handy – Bildschirm-Skalierung in Teil 6 | Teil 6 |
| vexfit-ad-neugier | ok | **Querscroll 398>390 → ok** | Story-Format 405 px; `html{overflow-x:hidden}` entfernt den Querscroll | ja |
| vexfit-ad-schmerz | ok | **Querscroll 398>390 → ok** | wie oben | ja |

„Netz/Fetch-Meldungen" (Supabase/Pixel/Fonts) sind durch `file://` erwartbar und
kein Seitenfehler; sie wurden von echten Skriptfehlern getrennt.

## Inhaltliche Prüfung (Code)
- **Preise** genau wie AGB §3: „Kostenlos bis zum ersten Kunden · danach €49,99/Monat",
  „€9,99 je weiterem Kunden", „Für Kunden immer kostenlos". Konsistent in index + rechtliches.
- **Keine unzulässigen Trainer-Aussagen**: „Monatlich kündbar"/„Kein Abo"/„100 % kostenlos"
  stehen nur im Kunden-Kontext (für Kunden zutreffend) bzw. mit Kontext beim Trainer
  („Gratis bis zum 1. Kunden · danach monatlich kündbar"). „Verifiziert" nur pro Trainer
  (bedingt, mit hochgeladenem Zertifikat), nie pauschal.
- **Telefonnummer** +43 660 3675175 im Impressum (tel:-Link). WhatsApp-Knöpfe nutzen bereits
  `wa.me/436603675175` (dieselbe Nummer) – unverändert gelassen (nur melden, siehe Abschluss).
- **noindex** auf beiden Ad-Seiten und allen john-harris-Seiten; Sitemap führt keine davon.
- **Cookie-/Consent-Banner** (z-index 10000) liegt über dem WhatsApp-Knopf, verdeckt keinen
  Pflicht-Knopf dauerhaft, lädt den Pixel erst nach Zustimmung.

## Offen / zur Entscheidung (Block statt raten)
- Zeitangabe „IN 60 SEKUNDEN REGISTRIERT" (registrieren) vs. „Konto in 2 Minuten" /
  „Profil in 5 Minuten" (index) – inhaltlich knapp, keine neue Zahl erfunden. Jakob entscheidet.
- anleitung.html ist öffentlich erreichbar und enthält Betriebs-Interna (Supabase/Stripe-Ablauf).
  Nicht verändert; ggf. später absichern.
