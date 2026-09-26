# vexfit-automation — Edge Function

Ersetzt den n8n-Workflow **„Vexfit Komplette Automation v4"** (id
`Y5kidNvNEvIbGDeC`). Gebaut am 26.09.2026 aus der Sicherung des Workflows,
Verhalten unverändert.

## Die vier Auslöser

| Pfad             | Auslöser                             | Was passiert                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/neuer-trainer` | `registrieren.html`                  | Mail an `vexfit.info@gmail.com`: „🆕 Neuer Trainer: …" mit Name, E-Mail, Stadt, Trainingsart und Link auf `admin.html`. Kein Datenbankzugriff.                                                                                                                    |
| `/neuer-kunde`   | `registrieren.html`, `suche.html`    | Mail an `vexfit.info@gmail.com`: „🎯 Neuer Kunde: …" mit Name, E-Mail, Stadt, Ziel und Link auf das Supabase-Dashboard. Kein Datenbankzugriff.                                                                                                                    |
| `/neue-anfrage`  | `profil.html`, `kunden-bereich.html` | Trainer über `body.trainer_id` in `trainers` nachschlagen. Ist `stripe_bezahlt === true` → Mail „Jetzt freischalten!" mit dem 9,99-Link, sonst → Mail „Abo aktivieren!" mit dem 49,99-Link. Empfänger ist `trainers.email`. Kein Schreibzugriff.                  |
| `/stripe`        | Stripe, `checkout.session.completed` | Trainer über `customer_details.email` finden → offene Anfrage holen (`anfragen`, `weitergeleitet = false`) → `trainers.stripe_bezahlt` und `aktiv` auf `true` → Kundendaten an den Trainer mailen → `anfragen.weitergeleitet` auf `true` → Zahlungsmail an Jakob. |

**Wichtig und 1:1 übernommen:** findet der Stripe-Pfad **keine offene Anfrage**,
passiert gar nichts — auch das Markieren als bezahlt bleibt aus. In n8n lief der
Zweig hinter einem leeren „Offene Anfrage holen" ebenfalls nicht weiter.

## Aufbau

| Datei                | Inhalt                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| `kern.ts`            | die gesamte Logik, rein und ohne Netz prüfbar                           |
| `index.ts`           | nur die Verdrahtung: Datenbank, SMTP, Stripe-Signatur                   |
| `kern_test.ts`       | alle vier Pfade, CORS, Einschleusen, Stripe-Signatur und Wiederholung   |
| `../_shared/text.ts` | Maskieren, Betreff säubern, Adressprüfung — geteilt mit `trainer-alert` |

## Schutz

Die Function wird mit `--no-verify-jwt` deployt, weil weder der Browser noch
Stripe einen Supabase-Schlüssel mitschicken. Stattdessen:

- **CORS** nur für `https://vexfit.app`. Eine fremde Herkunft bekommt 403 und
  keinen Freigabe-Kopf; ohne Herkunft (Stripe, `curl`) läuft es durch.
- **Eingabeprüfung** auf allen Browser-Pfaden: Pflichtfelder, Längen,
  E-Mail-Format → sonst 400.
- **Stripe-Signatur** auf `/stripe`, geprüft mit dem offiziellen `stripe`-Paket
  (`constructEventAsync` mit SubtleCrypto) gegen `STRIPE_WEBHOOK_SECRET` →
  sonst 400.
- **Jede Ereignis-Kennung nur einmal**: `stripe_events_verarbeitet`. Eine
  Wiederholung von Stripe antwortet 200, ohne noch einmal zu wirken.
- **Empfängeradressen** werden vor dem Versand auf Format und fehlende
  Zeilenumbrüche geprüft; Betreffzeilen werden von Zeilenumbrüchen befreit.

### Warum hier nicht HTML-maskiert wird

Alle sechs Mail-Nodes des Workflows stehen auf `emailFormat: "text"` — es gibt
keine HTML-Mail. HTML zu maskieren würde den sichtbaren Text verändern (aus „A &
B" würde „A &amp; B") und genau das brechen, was 1:1 bleiben soll. Die
gemeinsame Funktion `maskieren()` liegt in `../_shared/text.ts` und wird von
`trainer-alert` benutzt, das HTML verschickt.

## Zugangsdaten

Nichts davon steht im Code:

| Name                                        | Woher                                          |
| ------------------------------------------- | ---------------------------------------------- |
| `GMAIL_PASSWORT`                            | schon gesetzt, App-Passwort des Absenderkontos |
| `STRIPE_WEBHOOK_SECRET`                     | legt `werkzeuge/stripe-endpunkt-anlegen.sh` an |
| `ADMIN_PASSWORT_HINWEIS`                    | **optional**, siehe unten                      |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | setzt Supabase selbst                          |

`ADMIN_PASSWORT_HINWEIS`: die Trainer-Mail des Workflows endete mit einer Zeile
`Passwort: …` im Klartext. Dieses Repository ist öffentlich, deshalb steht der
Wert nicht im Code. Ohne das Secret entfällt die Zeile, sonst ist die Mail
unverändert. Seit `admin.html` eine echte Anmeldung verlangt, wird sie
vermutlich nicht mehr gebraucht.

## Prüfen

```bash
deno check supabase/functions/*/*.ts
deno lint supabase/
deno fmt --check supabase/
deno test --allow-run --allow-read --allow-env supabase/functions/
```

## Voraussetzung

`supabase/migrations/20260926210000_stripe_events_verarbeitet.sql` muss
eingespielt sein, bevor der Stripe-Pfad benutzt wird.
