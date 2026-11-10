# Live-Test: erste echte Kundenanfrage (Schritt für Schritt)

Für Jakob. Ziel: einmal den ganzen Anfrageweg auf der echten Seite durchspielen
und sehen, dass alles ankommt – mit zwei eigenen Test-Konten:

- **Kunde:** `jakob.steinbacher+kunde1@hotmail.com`
- **Trainer:** `jakob.steinbacher+trainer1@hotmail.com`

Beide E-Mails haben ein `+` – dadurch gelten sie in der Verwaltung automatisch
als **Test-Konten** (Heuristik `istTestkonto`): sie zählen nicht im Abendbericht
und bekommen keine Erinnerungs-Mails. Du musst sie also nicht zwingend extra
markieren; am Ende steht trotzdem, wie du sie sauber wegräumst.

> Voraussetzung, sonst läuft der Ein-Schritt-Weg nicht: In Supabase die
> **E-Mail-Bestätigung AUS** (sonst wird die Anfrage nur als Entwurf gemerkt,
> Konzept K3). Edge Function `vexfit-automation` ist deployt, Migrationen sind
> eingespielt (siehe Abschluss des Dauerlaufs).

## 1. Trainer anlegen und freigeben

1. Privates Browserfenster → `https://vexfit.app/registrieren.html` → als
   **Trainer** mit `jakob.steinbacher+trainer1@hotmail.com` registrieren.
2. Profil möglichst voll ausfüllen (Foto, Trainingsart, **Land + PLZ 5020**,
   Preis, Über mich, Erfahrung, Spezialisierungen, Telefon) – je mehr, desto
   besser sichtbar.
   - **Ankommen:** interne Mail an `office@vexfit.app`: „Neuer Trainer: …" mit
     **Ort/PLZ und Land**.
3. In der **Verwaltung** (Admin) den Trainer **freigeben**. Erst dann ist er in
   der Suche sichtbar. Während des Tests den Trainer **NICHT** als Test markieren
   (sonst verschwindet er aus der Suche).

## 2. Als Kunde eine Anfrage schicken

4. Zweites privates Fenster → `https://vexfit.app/suche.html?plz=5020&land=AT`.
   - **Ankommen/Sehen:** der freigegebene Trainer taucht auf (nur „Vorname N.",
     kein voller Nachname).
5. Auf das Profil klicken → **Anfrage** absenden (Ziel, Zeitraum, kurze
   Nachricht) mit `jakob.steinbacher+kunde1@hotmail.com` (Konto wird im selben
   Schritt angelegt, Passwort vergeben).
   - **Ankommen beim Trainer** (`+trainer1`): „**Deine erste Kundenanfrage auf
     Vexfit**" mit dem Zahlungslink (49,99 €/Monat, monatlich kündbar). Der
     Kundenname steht **noch nicht** drin (erst nach Annahme).
   - **Ankommen bei dir** (`office@`): „**Neue Anfrage:** Kunde → Trainer" (interne
     Benachrichtigung, Knopf „Im Admin öffnen").
   - **In der Verwaltung:** die Anfrage steht im Reiter **Anfragen**.

## 3. Annahme (optional – löst eine echte Zahlung aus!)

6. **Nur wenn du den ganzen Weg inkl. Zahlung sehen willst:** im Trainer-Postfach
   auf „Anfrage annehmen" klicken → Stripe-Bezahlseite.
   - ⚠️ Der Link `buy.stripe.com/...` ist **echt** – eine Annahme bucht
     **49,99 €**. Für den reinen Zustell-Test reicht Schritt 5 (Mail mit Link ist
     da). Zum Prüfen der Annahme ohne echtes Geld Stripe im **Testmodus** nutzen.
   - **Nach erfolgreicher Zahlung:** der Trainer bekommt „**Die Kontaktdaten
     deiner Kundin/deines Kunden**" (jetzt mit Name/E-Mail), du (`office@`)
     bekommst „**Zahlung eingegangen**". Die Anfrage gilt als weitergeleitet.

## 4. Randfälle (optional)

- **„Zur Prüfung":** Eine verdächtige Anfrage (Wegwerf-Mail-Domain, unsinniger
  Name/Nachricht) geht **NICHT** an den Trainer. Du bekommst dann intern
  „**Anfrage zur Prüfung: … (Grund)**" an `office@` und findest sie im Reiter
  **Anfragen** in der Liste „zur Prüfung" (dort freigeben oder verwerfen).
- **Ablehnung mit Ersatz:** Lehnt der Trainer ab („passt nicht"), bekommt der
  Kunde – sofern es passende andere Profile (≥ 5/8 in der Nähe) gibt –
  **Ersatzvorschläge** per Mail. Gibt es keine, geht keine Mail.
- **0 Treffer / Vormerkung:** Findet die Suche keinen Trainer, kann sich der
  Besucher **vormerken** lassen. Auch das meldet sich intern bei dir (`office@`:
  „Neuer Kunde …").

## 5. Danach: Test-Konten wegräumen

7. **Trainer** `+trainer1`: in der Verwaltung → Trainerkarte → **„Als Test/Spam
   markieren"**. Er verschwindet aus Suche/Abendbericht, nichts wird gelöscht.
   (Alternativ „Kicken" zum vollständigen Entfernen.)
8. **Kunde** `+kunde1`: gilt über das `+`-Alias ohnehin schon als Test und zählt
   nicht in den Kennzahlen. Zum vollständigen Entfernen in der Verwaltung
   „Kicken"/löschen.
9. Die zu diesem Test entstandene Anfrage-Zeile ggf. im Reiter **Anfragen**
   verwerfen, damit sie die echten Zahlen nicht verfälscht.

Fertig: Du hast den kompletten Weg einmal live gesehen – **Suche → Profil →
Anfrage → Mail an Trainer → interne Mail an dich → (Annahme/Zahlung) →
Kontaktdaten**, plus die internen Meldungen bei „zur Prüfung" und Vormerkung.
