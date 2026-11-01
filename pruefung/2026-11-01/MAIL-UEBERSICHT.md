# Vexfit – Mail-Übersicht (Gesamtprüfung Teil 3)

Alle von der Plattform versendeten Mails. Technischer Absender ist durchgängig
`vexfit.info@gmail.com` (Google-Konto mit App-Passwort `GMAIL_PASSWORT`), Versand
über **SMTP smtp.gmail.com:465 (TLS)** aus der Edge Function `vexfit-automation`.

| Auslöser | Absender | Empfänger | Dienst / Ort |
|---|---|---|---|
| Neuer Trainer registriert (mit Sitzung) | vexfit.info@gmail.com | **office@vexfit.app** | Edge `neuer-trainer`, SMTP Gmail :465 |
| Neuer Kunde registriert | vexfit.info@gmail.com | **office@vexfit.app** | Edge `neuer-kunde`, SMTP |
| Stripe-Zahlung eingegangen | vexfit.info@gmail.com | **office@vexfit.app** | Edge `stripe`, SMTP |
| Stripe-Zahlung ohne passenden Trainer | vexfit.info@gmail.com | **office@vexfit.app** | Edge `stripe`, SMTP |
| Zahlungslink/Abo an Trainer | vexfit.info@gmail.com | Trainer | Edge, SMTP |
| „Passt nicht?" – Alternativen nach Absage | vexfit.info@gmail.com | Kunde | Edge `passt-nicht`, SMTP |
| Unbeantwortete Anfrage – Erinnerung Trainer / Info Betreiber | vexfit.info@gmail.com | Trainer bzw. **office@vexfit.app** | Edge `unbeantwortet-pruefen`, SMTP |
| Neue Anfrage (Zweitkanal) | Formspree-Konto | Formspree-Postfach; `_replyto` = **office@vexfit.app** | Formspree (profil.html) |
| E-Mail-Bestätigung bei Registrierung | Supabase-Auth-Absender | Nutzer | **Supabase Auth** (Dashboard-Einstellung, nicht im Repo) |
| Passwort zurücksetzen | Supabase-Auth-Absender | Nutzer | **Supabase Auth** |

## Alle Betreiber-Benachrichtigungen → office@vexfit.app
Bereits erfüllt: die Konstante `BETREIBER = "office@vexfit.app"` in
`supabase/functions/vexfit-automation/kern.ts` adressiert alle internen Mails.
Sichtbare Kontaktangaben auf den Seiten wurden in Teil 2 auf office@vexfit.app
umgestellt.

## Ergibt der Absender vexfit.info@gmail.com noch Sinn?
Ja – vorerst bewusst so lassen. Der Absender ist ein voll DKIM-signiertes
Gmail-Konto; **DKIM für vexfit.app ist laut Aufgabenstellung noch NICHT aktiv.**
Würde man jetzt FROM: office@vexfit.app senden, ohne DKIM für vexfit.app, landen
die Mails eher im Spam.

### Umstieg auf Absender office@vexfit.app (nur Einstellungen, kein Umbau nötig)
1. In Google Workspace für `office@vexfit.app` ein **App-Passwort** erstellen.
2. **DKIM für vexfit.app** in Google Workspace aktivieren (Admin-Konsole →
   Apps → Google Workspace → Gmail → E-Mail authentifizieren) und den DKIM-TXT-
   Eintrag im DNS setzen. SPF enthält Google bereits.
3. Im **Supabase-Dashboard → Edge Functions → Secrets** `GMAIL_PASSWORT` auf das
   neue App-Passwort setzen.
4. Danach genügt im Code die eine Zeile `ABSENDER` (kern.ts) auf
   `office@vexfit.app` zu ändern. Bis Schritt 1–2 erledigt sind: NICHT umstellen.

## Supabase-Auth-Mails (Bestätigung/Passwort)
Werden NICHT von der Edge Function verschickt, sondern vom Auth-System von
Supabase (Dashboard → Authentication → Emails / SMTP). Versandweg ist die dort
eingestellte Variante (eingebauter Supabase-Mailer oder eigenes SMTP). Nur melden:
Falls die Bestätigungsmails nicht ankommen (DKIM/Zustellung), erscheinen neue
Registrierungen nicht im Admin, weil ohne bestätigte E-Mail keine Sitzung und
damit keine Profilzeile entsteht (siehe Teil 3-Test und frühere Untersuchung).
