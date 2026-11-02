# Erinnerungs-Mails für unvollständige Trainerprofile (Teil 4)

Drei Stufen, je genau einmal, nur solange das Profil unvollständig und der
Trainer noch nicht freigeschaltet, gesperrt, gelöscht oder abgemeldet ist.
Feste Zeitfenster nach der Registrierung: Stufe 1 zwischen 2 und 24 Stunden,
Stufe 2 zwischen 24 und 72 Stunden, Stufe 3 zwischen 72 und 96 Stunden. Älter
als 96 Stunden → keine Erinnerung. Pro Lauf höchstens eine Mail pro Trainer.

Absender: office@vexfit.app · gleiches Mailgerüst wie die übrigen Vexfit-Mails.

Fußzeile (genau drei Zeilen, ohne Straße, Hausnummer, PLZ oder Telefonnummer):
1. `Vexfit.app · Salzburg · Österreich`
2. Link **Impressum** → https://vexfit.app/rechtliches.html (dort steht die
   vollständige Anschrift gemäß § 5 ECG)
3. Link **Keine Erinnerungen mehr** (ohne Login, mit geheimem Token)

Schreibweise: „Vexfit.app".

Jede Mail enthält:
- Anrede mit Vorname
- Stand „noch X von 8 Angaben fehlen" (X aus der bestehenden x/8-Logik)
- die fehlenden Angaben beim Namen (z. B. „Foto, Preis pro Stunde, Telefon")
- einen Knopf **Profil jetzt vervollständigen** direkt zur ersten fehlenden
  Angabe (Foto → Trainer-Bereich, übrige Felder → Profil-Editor mit Sprungmarke)
- die dreizeilige Fußzeile oben

Die Quelle dieser Texte ist `ERINNERUNG_TEXTE` in
`supabase/functions/vexfit-automation/kern.ts`. `{vorname}` und `{X}` werden
beim Versand eingesetzt.

---

## Stufe 1 — ab 2 Stunden

**Betreff:** Dein Vexfit.app-Profil ist fast fertig

> Hallo {vorname}, schön, dass du bei Vexfit.app dabei bist! Dein Profil ist
> noch nicht ganz fertig – es fehlen noch {X} von 8 Angaben. Mit einem
> vollständigen Profil wirkst du auf Interessentinnen und Interessenten gleich
> überzeugender. Das dauert nur ein paar Minuten.

---

## Stufe 2 — ab 24 Stunden

**Betreff:** Noch ein paar Minuten bis zu deinem fertigen Profil

> Hallo {vorname}, dein Profil auf Vexfit.app wartet noch auf dich: {X} von 8
> Angaben fehlen. Je vollständiger dein Profil, desto eher entscheiden sich
> Interessentinnen und Interessenten für dich. Ergänze die fehlenden Punkte am
> besten gleich – es geht schnell.

---

## Stufe 3 — ab 72 Stunden (letzte Erinnerung)

**Betreff:** Letzte Erinnerung zu deinem Vexfit.app-Profil

> Hallo {vorname}, das ist unsere letzte Erinnerung: In deinem Profil auf
> Vexfit.app fehlen noch {X} von 8 Angaben. Sobald dein Profil vollständig ist,
> prüfen wir es und schalten dich frei – dann bist du für Kundinnen und Kunden
> in deiner Nähe sichtbar. Melde dich gern, wenn du Fragen hast.

---

Hinweis zur Sichtbarkeit: Ein Profil wird NICHT automatisch sichtbar, sobald es
vollständig ist. Es wird geprüft und von Jakob freigeschaltet. Die Texte sagen
genau das („prüfen wir es und schalten dich frei") und behaupten nichts darüber
hinaus. Es werden keine erfundenen Zahlen genannt (nur das reale X von 8).
