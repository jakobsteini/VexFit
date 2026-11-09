# Erinnerungs-Mails für unvollständige Trainerprofile (Teil 4)

Automatische Erinnerung in **Stufen**, je genau einmal, nur solange das Profil
unvollständig und der Trainer noch nicht freigeschaltet, gesperrt, gelöscht oder
abgemeldet ist. Feste Zeitfenster nach der Registrierung: Stufe 1 zwischen 2 und
24 Stunden, Stufe 2 zwischen 24 und 72 Stunden, Stufe 3 zwischen 72 und 96
Stunden. Älter als 96 Stunden → keine Erinnerung. **Höchstens drei automatische
Erinnerungen** je Trainer (eine je Stufe), pro Lauf höchstens eine Mail.

**Gemeinsamer Mindestabstand: 3 Tage.** Zwischen zwei Profil-Erinnerungen an
denselben Trainer liegen mindestens 3 Tage – egal ob automatisch (Stufen-Cron)
oder manuell (Verwaltung, per Klick). Beide Pfade prüfen denselben letzten
Versandzeitpunkt (Tabelle `profil_erinnerungen`, Spalte `art`). Vollständige
Profile (8/8) und Test-/Spam-Konten bekommen nie eine Erinnerung.

Absender: office@vexfit.app · gleiches Mailgerüst wie die übrigen Vexfit-Mails.

Fußzeile (genau drei Zeilen, ohne Straße, Hausnummer, PLZ oder Telefonnummer):
1. `Vexfit.app · Salzburg · Österreich`
2. Link **Impressum** → https://vexfit.app/rechtliches.html (dort steht die
   vollständige Anschrift gemäß § 5 ECG)
3. Link **Keine Erinnerungen mehr** (ohne Login, mit geheimem Token)

## Betreff und Einstieg nach Vollständigkeit (nicht nach Stufe)

Damit nie „fast fertig" bei 0/8 steht, richten sich **Betreff und Einstieg nach
der Vollständigkeit** x/8 (die Stufe steuert nur die Häufigkeit):

- **0–3 von 8** → Betreff **„Dein Vexfit-Profil wartet auf dich"**
- **4–6 von 8** → Betreff **„Dein Vexfit-Profil ist zu x von 8 fertig"**
- **7 von 8** → Betreff **„Nur noch eine Angabe bis zu deinem fertigen Profil"**

Jede Mail enthält außerdem:
- Anrede mit Vorname
- den Stand „x von 8 fertig"
- die fehlenden Angaben in Klartext, **genau einmal** im Fließtext (gleiche
  Funktion wie die manuelle Erinnerung)
- den Preis-Hinweis wie in der manuellen Erinnerung (kostenlos bis zur ersten
  angenommenen Kundenanfrage, danach 49,99 €/Monat, monatlich kündbar, jeder
  weitere Kunde einmalig 9,99 €)
- einen Knopf **Profil jetzt vervollständigen** direkt zur ersten fehlenden
  Angabe (Foto → Trainer-Bereich, übrige Felder → Profil-Editor mit Sprungmarke)
- die dreizeilige Fußzeile oben

Quelle der Texte: `erinnerungBetreff` / `erinnerungEinstieg` in
`supabase/functions/vexfit-automation/kern.ts`.

---

## 0–3 von 8 (Beispiel 0 von 8)

**Betreff:** Dein Vexfit-Profil wartet auf dich

> Hallo Max, schön, dass du bei Vexfit dabei bist! Dein Profil ist zu 0 von 8
> fertig. Es fehlen noch: Foto, Trainingsart, Trainingsort, Preis pro Stunde,
> Über mich, Erfahrung, Spezialisierungen, Telefon. In der Suche sehen Kundinnen
> und Kunden zuerst Foto, Ort und Preis – mit einem vollständigen Profil wirst du
> eher gefunden. Das Ergänzen dauert nur wenige Minuten. Vexfit ist für dich
> kostenlos, bis du die erste Kundenanfrage über Vexfit annimmst. Danach 49,99
> €/Monat, monatlich kündbar. Jeder weitere Kunde über Vexfit einmalig 9,99 €.

---

## 4–6 von 8 (Beispiel 5 von 8)

**Betreff:** Dein Vexfit-Profil ist zu 5 von 8 fertig

> Hallo Max, dein Profil ist zu 5 von 8 fertig – nur noch ein kleiner Schritt. Es
> fehlen noch: Foto, Preis pro Stunde, Telefon. Vollständig ausgefüllte Profile
> werden in der Suche eher angeklickt. Das Ergänzen dauert nur wenige Minuten.
> Vexfit ist für dich kostenlos, bis du die erste Kundenanfrage über Vexfit
> annimmst. Danach 49,99 €/Monat, monatlich kündbar. Jeder weitere Kunde über
> Vexfit einmalig 9,99 €.

---

## 7 von 8

**Betreff:** Nur noch eine Angabe bis zu deinem fertigen Profil

> Hallo Max, dein Profil ist zu 7 von 8 fertig – es fehlt nur noch: Telefon.
> Sobald es vollständig ist, bist du in der Suche für Kundinnen und Kunden in
> deiner Nähe sichtbar. Das dauert nur eine Minute. Vexfit ist für dich kostenlos,
> bis du die erste Kundenanfrage über Vexfit annimmst. Danach 49,99 €/Monat,
> monatlich kündbar. Jeder weitere Kunde über Vexfit einmalig 9,99 €.

---

Hinweis zur Sichtbarkeit: Ein Profil wird NICHT automatisch sichtbar, sobald es
vollständig ist. Es wird geprüft und von Jakob freigeschaltet. Die Texte
behaupten nichts darüber hinaus und nennen keine erfundenen Zahlen (nur das reale
x von 8 und die AGB-Preise).
