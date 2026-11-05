# Entwurf: Datenschutz-Klausel für die Meta Conversions API (serverseitig)

**Stand:** 06.11.2026 · **Status:** ENTWURF – NICHT live. Nicht in die
veröffentlichten Seiten (`rechtliches.html`) übernehmen, bevor Jakob das geprüft
und freigegeben hat. Dieser Text ist eine Vorlage, keine Rechtsberatung.

## Warum dieser Entwurf

Vexfit meldet den Abschluss einer Registrierung (Ereignis
`CompleteRegistration`) zusätzlich **serverseitig** über die *Meta Conversions
API* an Meta (Facebook/Instagram), damit Werbeerfolge trotz In-App-Browsern und
Cookie-Beschränkungen gemessen werden können. Dabei wird die **E-Mail-Adresse
vor dem Senden mit SHA-256 gehasht** (nicht im Klartext) und zusammen mit einer
Ereignis-Kennung (`event_id`, zur Entdopplung mit dem Browser-Pixel) an Meta
übermittelt. Meta verarbeitet diese Daten auch **in den USA (Drittland)**.

Die aktuelle Datenschutzerklärung (`rechtliches.html`, Stand Mai 2026) nennt nur
das Browser-Pixel über die Cookie-Einwilligung, **nicht** die serverseitige
Übermittlung und **nicht** die Drittlandübermittlung. Solange diese Grundlage
fehlt, ist die serverseitige Übermittlung **im Code abgeschaltet**
(`META_CAPI_AKTIV` ist nicht gesetzt – siehe unten „Technischer Stand").

## Vorgeschlagene Ergänzung in der Datenschutzerklärung

> **Reichweitenmessung über Meta (Facebook/Instagram)**
>
> Wenn du bei der Registrierung in die Verwendung von Analyse-Cookies
> eingewilligt hast, messen wir den Erfolg unserer Werbeanzeigen auf
> Facebook und Instagram. Dazu übermitteln wir an Meta Platforms Ireland Ltd.
> sowohl über ein Cookie in deinem Browser (Meta-Pixel) als auch **direkt von
> unserem Server (Meta Conversions API)** die Information, dass eine
> Registrierung abgeschlossen wurde. An Meta übermittelte Daten:
>
> - deine **E-Mail-Adresse in verschlüsselter (gehashter) Form** – Meta kann
>   sie nur mit bereits vorhandenen Konten abgleichen, nicht im Klartext lesen,
> - eine zufällige Ereignis-Kennung (damit Pixel- und Servermeldung nicht
>   doppelt gezählt werden),
> - die aufgerufene Seitenadresse und der Zeitpunkt.
>
> Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du
> jederzeit über die Cookie-Einstellungen für die Zukunft widerrufen kannst.
> Meta verarbeitet die Daten auch in den **USA**; Grundlage der Übermittlung
> sind die EU-Standardvertragsklauseln bzw. das EU-US Data Privacy Framework.
> Ohne Einwilligung findet weder die Pixel- noch die serverseitige Übermittlung
> statt. Mehr Informationen: Datenschutzrichtlinie von Meta.

Zusätzlich sollte der Abschnitt **„WELCHE DATEN WIR SAMMELN"** bzw. der
Cookie-Abschnitt auf diese Verarbeitung verweisen, und die
**Cookie-Einwilligung** muss die serverseitige Übermittlung mit abdecken (der
Text des Cookie-Banners spricht bisher nur allgemein von „Cookies").

## Technischer Stand (zum Nachvollziehen)

- Die serverseitige Meldung ist implementiert (`supabase/functions/vexfit-automation/kern.ts`,
  Teil 7: `sendeMetaConversion` / `metaEreignisBauen`) und entdoppelt über eine
  gemeinsame `event_id` mit dem Browser-Pixel.
- Sie ist durch **drei** Bedingungen gesichert und sendet nur, wenn **alle**
  erfüllt sind:
  1. Cookie-**Einwilligung** liegt vor (`zustimmung === true`),
  2. eine `event_id` ist vorhanden (Entdopplung),
  3. der Freigabe-Schalter **`META_CAPI_AKTIV`** ist gesetzt (`ja`/`true`/`1`)
     **und** der Zugriffsschlüssel **`META_CAPI_TOKEN`** ist gesetzt.
- Der Schalter `META_CAPI_AKTIV` ist derzeit **nicht gesetzt** → es wird nichts
  gesendet (`grund: "nicht freigeschaltet"`). Die Registrierung funktioniert
  unverändert; ein fehlender Schalter/Token führt nie zu einem Fehler.

## Was Jakob tun muss, um live zu schalten (in dieser Reihenfolge)

1. Die obige Klausel (angepasst/juristisch geprüft) in `rechtliches.html`
   (Abschnitt Datenschutz) aufnehmen und den Cookie-Banner-Text ergänzen.
2. Erst danach im Supabase-Dashboard (Projekt `hbapzwxdehfgnputrfjf`) unter
   *Edge Functions → vexfit-automation → Secrets* die Variable
   `META_CAPI_AKTIV` auf `ja` setzen (und sicherstellen, dass `META_CAPI_TOKEN`
   gesetzt ist).
3. `vexfit-automation` neu deployen.

Bis dahin bleibt die serverseitige Übermittlung aus — bewusst, als BLOCK.
