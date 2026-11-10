# Dauerlauf „Alles Offene" – 10.11.2026

Ziel: Bis heute 16 Uhr ist alles Offene im Code erledigt oder als BLOCK benannt,
damit Vexfit in Salzburg die erste echte Kundenanfrage verarbeiten kann.
Baustein für Baustein, jeder Baustein ein eigener Commit. Protokoll laufend hier.

Pflichtregeln: keine Rückfragen (BLOCK statt Raten), Migrationen nur als Datei
(mit Rücknahme), kein Einspielen/Deploy/Push, keine echten Mails, keine
öffentlichen personenbezogenen Daten, keine Geheimnisse committen.

---

## E0 – Bestandsaufnahme (Doku-Commit)

- Offene Punkte gesammelt → `docs/offen-2026-11-10.md` (Zuordnung
  erledigt / in diesem Lauf / Jakob / BLOCK).
- Git zu Beginn: `HEAD` = `origin/main` = `9e3b6ca`, nichts Ungepushtes;
  untracked nur `marke/*` (Binärdateien, nicht committen).
- Geplante Bausteine E1–E8: siehe `docs/offen-2026-11-10.md` Abschnitt A.
- **Commit:** nur Doku (dieses Protokoll + offen-Liste).

### Angekündigt für die folgenden Bausteine

| Baustein | Migration? | Commit? |
|----------|-----------|---------|
| E1 Anfrage-Weg absichern | voraussichtlich nein | ja |
| E2 Trainer-Standort | wahrscheinlich ja (PLZ-Spalten/Pflicht) | ja |
| E3 Herkunft messen | wahrscheinlich ja (Herkunftsspalten) | ja |
| E4 Salzburg einheitlich | nein | ja |
| E5 Freigabe nicht vergessen | nein | ja |
| E6 Kunden-Weg Salzburg | nein | ja |
| E7 Gesamttest | nein | ja (falls Änderungen) |
| E8 Offen-Liste Endstand | nein | ja (Doku) |

(Die tatsächliche Migrationsentscheidung wird pro Baustein vor dem Commit
bestätigt – Grundsatz: so wenig DB-Änderung wie möglich, nur als Datei.)

---

## E1 – Anfrage-Weg Ende zu Ende absichern (keine Migration)

### Der Weg im Code (Datei/Zeile)

1. **Kunde sucht** → `suche.html` (liest `?plz=&land=`), Herkunft/UTM über
   `vexfit-trichter.js`.
2. **Profil** → `profil.html?id=<trainer>`; Anfrageformular (Ziel, Zeitraum,
   Nachricht + Vorname/E-Mail/Passwort). Zeitraum+Nachricht landen gemeinsam im
   Feld `nachricht` (Konzept K3, keine neue Spalte).
3. **Anfrage (ein Schritt)** → POST `/neue-anfrage` →
   `neueAnfrage` (`supabase/functions/vexfit-automation/kern.ts:1710`).
   - Angemeldet-Pflicht: ohne gültiges Token **401**, fremde E-Mail **403**,
     > 10 Anfragen/Stunde **429** (`kern.ts:1719`–`1739`).
4. **Prüfung** → `anfrageVerdacht` (`kern.ts:138`): Wegwerf-Domain
   (`wegwerf-domains.ts`), unsinniger Name, unsinnige Nachricht. Verdächtig →
   `anfrageZurPruefung` setzt `pruef_status='zur_pruefung'` (`kern.ts:1759`).
   (Der Honeypot „webseite" sitzt im anonymen Formularweg `/neuer-kunde`,
   `torwacheMailEndpunkt` `kern.ts:1501`.)
5. **Mail an Trainer** → Normalfall `mailErsteAnfrage` (49,99 €, `kern.ts:1001`)
   bzw. `mailWeitereAnfrage` (9,99 €, `kern.ts:1026`), Studio-Trainer
   `mailStudioAnfrage` ohne Zahlungslink (`kern.ts:1053`). Versand `kern.ts:1786`.
   **Verdächtige Anfragen erreichen den Trainer NICHT.**
6. **Interne Mail an Jakob (office@)** – bei JEDER Lage:
   - neue Anfrage → `mailNeueAnfrageIntern` (`kern.ts:795`, Versand `kern.ts:1791`).
   - **zur Prüfung → `mailAnfrageZurPruefungIntern` (`kern.ts:831`, NEU in E1,**
     Versand im zur-Prüfung-Zweig `kern.ts:1766`), nur an office@, nie an den Trainer.
   - Vormerkung (anonym) → `/neuer-kunde` → `mailNeuerKunde` an office@
     (`neuerKunde` `kern.ts:1673`).
7. **Annahme/Ablehnung:**
   - **Annahme** = Trainer klickt den Zahlungslink → Stripe
     `checkout.session.completed` → `/stripe` → `stripe` (`kern.ts:3888`):
     Zahlung verbucht, Kontaktdaten per `mailKundenDaten` an den Trainer
     (`kern.ts:1077`), Bestätigung `mailZahlungAnJakob` an office@ (`kern.ts:1099`),
     älteste offene Anfrage weitergeleitet. **Das ist der Zahlungsauslöser der
     ersten Annahme** (Erstzahlung 49,99 €, `LINK_ERSTE`).
   - **Ablehnung** = `/passt-nicht` → `passtNicht` (`kern.ts:3701`):
     Ersatzvorschläge über `alternativenFinden` (`kern.ts:1227`, Profile ≥ 5/8),
     einmalig `alternativen_gesendet`.
8. **Ersatzvorschläge** → Mail an den Kunden (im passt-nicht-Zweig), nur wenn
   mindestens eine passende Alternative existiert (sonst keine Mail).

### Was E1 geändert hat

- **Lücke geschlossen:** Verdachtsanfragen („zur Prüfung") lösten bisher **keine**
  interne Benachrichtigung aus – der zur-Prüfung-Zweig kehrte vor der office@-Mail
  zurück. Jetzt geht `mailAnfrageZurPruefungIntern` (+ Push `pushAnfrageZurPruefung`)
  an office@, damit keine verdächtige Anfrage unbemerkt in der Admin-Liste liegt.
- **Unverändert korrekt:** Normalfall (Trainer + office@), Vormerkung (office@),
  erste Annahme (Stripe → `mailZahlungAnJakob` an office@), Ablehnung+Ersatz.

### Tests

- `kern_test.ts`: S3-Tests aktualisiert (zur Prüfung → genau EINE office@-Mail,
  keine Trainer-Mail); neue Integrationstests „E1: Normalfall / zur Prüfung /
  Vormerkung" treiben `bearbeiten` mit gestubbtem Mailversand.
- Erste Annahme (Stripe) und Ablehnung+Ersatz sind weiterhin durch die
  bestehenden `kern_test.ts`-Stripe- und passt-nicht-Tests abgedeckt.
- Suite: **796 grün** (+3), `deno check` grün, `deno lint` 30 (Baseline).

### Anleitung

- `docs/live-test-anfrage.md` Schritt für Schritt für Jakob
  (`+kunde1`/`+trainer1`), was wo ankommt, danach beide Konten als Test markieren.

**Commit E1:** kern.ts (interne zur-Prüfung-Mail + Push), kern_test.ts (Tests),
Protokoll + Anleitung. Keine Migration.
