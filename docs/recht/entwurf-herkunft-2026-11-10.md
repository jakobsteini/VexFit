# Entwurf: Datenschutz-Zusatz „Herkunftsmessung" (E3, 10.11.2026)

**BLOCK für Jakob.** Ich ändere die Datenschutzerklärung NICHT selbst. Hier der
vorgeschlagene Zusatztext; bitte prüfen (ggf. anwaltlich) und selbst in
`rechtliches.html#datenschutz` einpflegen.

## Hintergrund (was der Code jetzt tut)

Beim ersten Seitenaufruf merkt sich Vexfit **best effort** für die anonyme
Reichweiten-/Trichter-Auswertung:

- die **Kampagnen-Parameter** aus der Adresse (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`), sofern vorhanden,
- die **Domain** der verweisenden Seite (nur der Domainname, **ohne Pfad,
  ohne Query, ohne Parameter**; z. B. `google.com`, `instagram.com`),
- einen **groben Browsertyp** (normal / Instagram- bzw. Facebook-In-App-Browser).

Diese Werte liegen während des Besuchs im **sessionStorage** des Browsers
(keine Cookies, keine Weitergabe an Dritte) und werden – nur wenn sich jemand
**registriert** – zusammen mit dem Konto gespeichert (Spalten `herkunft_quelle`,
`herkunft_kampagne`, `herkunft_inhalt`, `herkunft_medium`, `herkunft_referrer`,
`herkunft_browser`). Anonyme Trichter-Ereignisse (Tabelle `trichter_ereignisse`)
enthalten dieselben groben Kennungen, **ohne** Personenbezug.

**Kein** Personenbezug über das Nötige hinaus: keine vollständige Verweis-URL,
keine IP-Speicherung in diesen Feldern, keine Drittanbieter-Cookies, kein
Cross-Site-Tracking.

## Vorschlag Textbaustein (zum Einfügen)

> **Reichweiten- und Herkunftsmessung.** Wenn Sie unsere Seite aufrufen,
> verarbeiten wir zur anonymen Auswertung, über welche Kanäle Besucher zu uns
> finden, folgende Angaben: die Kampagnen-Parameter der aufgerufenen Adresse
> (utm_source, utm_medium, utm_campaign, utm_content, utm_term), die **Domain**
> der Seite, von der Sie zu uns gelangt sind (nur der Domainname, ohne Pfad oder
> Parameter), sowie einen groben Browsertyp. Diese Angaben werden während Ihres
> Besuchs im Speicher Ihres Browsers (sessionStorage) gehalten; es werden hierfür
> **keine Cookies** gesetzt und **keine Daten an Dritte** weitergegeben.
> Registrieren Sie sich, speichern wir diese Angaben zusammen mit Ihrem Konto, um
> nachvollziehen zu können, über welchen Kanal die Registrierung erfolgt ist.
> Rechtsgrundlage ist unser berechtigtes Interesse an einer wirtschaftlichen
> Ausrichtung unseres Angebots (Art. 6 Abs. 1 lit. f DSGVO). Sie können der
> Verarbeitung jederzeit widersprechen; wenden Sie sich dazu an
> office@vexfit.app.

## Was Jakob tun muss

1. Text prüfen (ggf. anwaltlich), an den Stil der bestehenden Erklärung anpassen.
2. In `rechtliches.html#datenschutz` einpflegen.
3. Migration `2026-11-10-01-herkunft-referrer.sql` einspielen (sonst fehlen die
   Spalten und der Nachtrag läuft nur „best effort" ins Leere).
