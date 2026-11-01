# Vexfit – Admin-Zugang (Verwaltung)

> Dieses Repository ist öffentlich. Der geheime Pfad der Verwaltungsseite steht
> deshalb **nicht** in dieser Datei, sondern nur in Jakobs privaten Unterlagen
> (und einmalig im Abschluss-Block der Sitzung, in der die Seite gebaut wurde).

## Wo

Die Verwaltung liegt unter `https://vexfit.app/verwaltung-<32 zufällige Hex-Zeichen>.html`.
Die Seite ist nirgends verlinkt, trägt `noindex,nofollow` und steht **nicht** in
`robots.txt` (das würde den Pfad verraten). Das alte `admin.html` ist stillgelegt
und leitet nur noch auf die Startseite weiter.

**Wichtig:** Da das Repo öffentlich ist, ist der Pfad im Quelltext sichtbar. Der
Schutz beruht deshalb **nicht** auf dem geheimen Pfad, sondern auf:

1. **Login** (E-Mail + Passwort über Supabase Auth),
2. **zweitem Faktor** (TOTP, Authenticator-App) – ohne `aal2` erscheint kein Dashboard,
3. **Serverprüfung** – `public.ist_vexfit_admin()` nach dem Login und bei **jeder**
   schreibenden Aktion in der Edge Function (`/admin-aktion`: gültiges JWT +
   Admin-Konto + `aal2` + Eingabeprüfung + Mengenbegrenzung).

Nur das Admin-Konto (UID `ee744b01-0a70-4da5-a19b-6c905c8479b5`) hat Zugang.

## Erste Anmeldung / zweiten Faktor einrichten

1. Geheimen Pfad öffnen, mit E-Mail + Passwort anmelden.
2. Beim ersten Mal erscheint ein **QR-Code**. In einer Authenticator-App (z. B.
   Google Authenticator, 1Password, Authy) scannen.
3. Den angezeigten 6-stelligen Code eingeben → Einrichtung abgeschlossen.
4. Ab dann bei jeder Anmeldung: 6-stelligen Code aus der App eingeben.

Die Admin-Sitzung ist von der Trainer-/Kunden-Anmeldung getrennt (eigener
`sessionStorage`-Schlüssel). Automatische Abmeldung nach **30 Minuten
Inaktivität** und beim **Schließen des Tabs**.

## Was „Kicken" (endgültig löschen) genau löscht

Ein Bestätigungsdialog, dann unwiderruflich:

- **Anmeldekonto** (`auth.users`) der Person,
- die **Personenzeile** (`trainers` bzw. `kunden`),
- **Anfragen** der Person (`anfragen` über `trainer_id` bzw. `kunden_email`),
- beim Kunden zusätzlich **Benachrichtigungswünsche** (`trainer_alerts`) und
  **Warteliste-Einträge** (`warteliste`),
- **Speicher-Dateien**: Avatar, Galerie (Bucket `avatars`/`galerie`) und
  Zertifikat (Bucket `zertifikate`); ein externes Video (YouTube/Vimeo) ist keine
  hochgeladene Datei und wird nicht berührt.

Die eigentlichen Datenbank-Löschungen laufen in **einer Transaktion**
(`admin_person_kicken`); schlägt etwas fehl, bleibt nichts halb gelöscht.

**Gesetzliche Aufbewahrung (Österreich, 7 Jahre):** Buchhaltungs-/Zahlungsdaten
werden **nicht** gelöscht. In der Vexfit-Datenbank gibt es keine eigene Tabelle
mit personenbezogenen Zahlungsdaten – Zahlungen liegen bei Stripe, und das
Ereignisprotokoll `stripe_events_verarbeitet` enthält keine Personendaten und
bleibt erhalten. Entsteht künftig eine Rechnungstabelle mit Personenbezug, muss
`admin_person_kicken` um deren Anonymisierung erweitert werden.

## Voraussetzung (Migration)

Kicken braucht die DB-Funktion `admin_person_kicken` und die Protokoll-Spalte
`ergebnis`. Dafür muss `migrations/2026-11-01-02-admin-neu.sql` im Supabase-
SQL-Editor eingespielt sein. Ohne sie zeigt die Seite einen klaren Hinweis statt
zu löschen.

## Später entfernbarer Alt-Code (erst NACH dem Push)

Solange das live laufende alte `admin.html` noch deployt ist, bleiben die alten
Edge-Aktionen abwärtskompatibel. Nach dem Push (alte `admin.html` ist dann die
Weiterleitung) und nachdem die neue Verwaltung läuft, können entfernt werden:

- Edge-Aktion `endgueltig_loeschen` (ersetzt durch `person_kicken`),
- die alte Freigabe-/Tagesbericht-Mailto-Logik existiert nur noch im Git-Verlauf
  des alten `admin.html` (die neue Seite nutzt sie nicht),
- der Mail-Link `ADMIN_LINK` in `kern.ts` zeigt weiterhin auf `admin.html`
  (harmlos: leitet auf die Startseite). Kann auf `office@vexfit.app` o. Ä.
  umgestellt werden.
