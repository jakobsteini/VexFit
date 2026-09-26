# trainer-alert — Edge Function mit Zeitplan

Ersetzt den n8n-Workflow **„Vexfit Trainer Alert"** (Zeitplan alle 15 Minuten).
Gebaut am 26.09.2026 aus der Sicherung des Workflows, Verhalten unverändert.

## Was der Ablauf tut

1. Liest aus `trainers` alle Zeilen mit `aktiv = true` **und**
   `alert_sent = false` (Spalten
   `id, vorname, nachname, email, stadt, plz, trainingsart, preis_stunde, bio, spezialisierungen`).
2. Liest aus `trainer_alerts` alle Zeilen mit `aktiv = true` (Spalten
   `id, kunden_email, kunden_name, plz, stadt, radius`).
3. Ordnet zu: **gleiche PLZ** oder **Entfernung ≤ `radius` des Alerts** (ohne
   Radius: 25 km). Koordinaten kommen von `api.zippopotam.us`, der Reihe nach
   für `at`, `de`, `ch`.
4. Schickt je Treffer eine HTML-Mail an `kunden_email`, Absender
   `vexfit.info@gmail.com`.
5. Setzt `trainers.alert_sent = true`, damit kein Trainer zweimal gemeldet wird.

Gibt es **keine** aktiven Alerts, passiert gar nichts — auch kein Markieren. Das
ist so aus dem Workflow übernommen.

## Aufbau

| Datei                 | Inhalt                                                |
| --------------------- | ----------------------------------------------------- |
| `kern.ts`             | die gesamte Logik, rein und ohne Netz prüfbar         |
| `index.ts`            | nur die Verdrahtung: Datenbank, PLZ-Dienst, SMTP      |
| `kern_test.ts`        | Auswahl, Texte, Doppelversand, 401, SMTP-Fehler       |
| `geheimnisse_test.ts` | durchsucht alle versionierten Dateien nach Schlüsseln |

## Prüfen

```bash
deno check supabase/functions/trainer-alert/*.ts
deno lint supabase/
deno test --allow-run --allow-read supabase/functions/trainer-alert/
```

## Zugangsdaten

Nichts davon steht im Code — alles kommt aus der Umgebung:

| Name                        | Woher                                                                          |
| --------------------------- | ------------------------------------------------------------------------------ |
| `TRAINER_ALERT_KEY`         | Secret an der Function; derselbe Wert wie im Vault-Eintrag `trainer_alert_key` |
| `GMAIL_PASSWORT`            | Secret an der Function; App-Passwort des Absenderkontos                        |
| `SUPABASE_URL`              | setzt Supabase selbst                                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | setzt Supabase selbst                                                          |

Die Function nimmt nur Aufrufe mit `Authorization: Bearer <TRAINER_ALERT_KEY>`
an, sonst **401**. Deshalb muss sie mit `--no-verify-jwt` deployt werden — der
Zeitplan schickt diesen eigenen Schlüssel, kein Supabase-JWT.

## SMTP-Port

Die Supabase-Doku (Edge Functions → Limits) sagt wörtlich: „Outgoing connections
to ports `25` and `587` are not allowed." Port 465 ist dort nicht genannt —
deshalb `smtp.gmail.com:465` mit TLS.

## Zeitplan

`supabase/migrations/20260926193000_trainer_alert_zeitplan.sql` legt mit pg_cron
und pg_net den Job `trainer-alert-alle-15-minuten` an. Der Schlüssel steht nicht
in der Datei, der Job liest ihn bei jedem Lauf aus Supabase Vault. Rückbau:
`20260926193100_trainer_alert_zeitplan_entfernen.sql`.
