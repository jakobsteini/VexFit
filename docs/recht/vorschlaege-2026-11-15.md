# Rechtstext-Vorschläge (BLOCK für Jakob) — 2026-11-15

**Nicht automatisch geändert** (Rechtstext). `rechtliches.html` (kombiniert Impressum +
Datenschutz + AGB) deckt diese Verarbeitungen **aktuell nicht** ab. Entwürfe liegen
großteils schon in `docs/recht/` und müssen nur noch in `rechtliches.html` eingearbeitet werden.

Prüfmethode: Wortsuche in `rechtliches.html` (Live-Stand). 0 Treffer = nicht erwähnt.

| # | Thema | Status in rechtliches.html | Vorhandener Entwurf | Dringlichkeit 19.11. |
|---|---|---|---|---|
| R1 | **Meta-Pixel / Facebook (CompleteRegistration, CAPI)** | **fehlt** (0 Treffer „Meta/Pixel/Facebook") | `docs/recht/entwurf-meta-capi-2026-11-06.md` | **HOCH** — Pixel + Meta-Ads laufen zum Artikel |
| R2 | **Herkunftserfassung (Referrer-Domain, utm_source/campaign/content)** | **fehlt** (0 Treffer) | `docs/recht/entwurf-herkunft-2026-11-10.md` | HOCH — wird bei jedem Wunsch/Registrierung gespeichert |
| R3 | **Wunsch-Formular (Name, E-Mail, Telefon, Ziel, Budget, Zeiten)** | **fehlt** als eigener Punkt | `docs/recht/entwurf-wunsch-2026-11-13.md` | HOCH — Hauptweg ab 19.11. |
| R4 | **PLZ-Auflösung über api.zippopotam.us (Übermittlung PLZ in die USA)** | **fehlt** (0 Treffer „zippopotam/Postleit") | — (neu) | MITTEL — Aufruf in `vexfit-plz.js`, `kunden-bereich.html`, Verwaltung |
| R5 | Stripe (Zahlungsabwicklung Trainer) | vorhanden (§3 + Datenschutz) | — | ok |
| R6 | Supabase (Hosting/DB) | vorhanden | — | ok |

## Textvorschlag R4 (neu, da kein Entwurf existiert)

Abschnitt „WELCHE DATEN WIR SAMMELN" ergänzen:

> **Postleitzahl-Auflösung.** Zur Umkreissuche wird die eingegebene Postleitzahl an den
> Dienst api.zippopotam.us (Betreiber in den USA) übermittelt, der dazu Ort und
> ungefähre Koordinaten zurückliefert. Es werden dabei **keine** Namen, E-Mail-Adressen
> oder sonstigen personenbezogenen Daten übertragen, nur die Postleitzahl und das Land.
> Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Durchführung der Suche auf deine Anfrage).

## Hinweis Cookie-/Einwilligungsbanner
Das Pixel feuert technisch **erst nach Zustimmung** (`localStorage vexfit_consent === 'zugestimmt'`;
live bestätigt: ohne Zustimmung **kein** facebook.net-Aufruf). Das ist korrekt. Der
Datenschutztext muss das Pixel aber trotzdem **benennen** (R1), sonst ist die Einwilligung
nicht informiert.

## Empfehlung
R1–R3 vor dem 19.11. aus den vorhandenen Entwürfen in `rechtliches.html` übernehmen; R4 mit
obigem Satz ergänzen. Reihenfolge der Abschnitte und genaue Formulierung entscheidet Jakob.
