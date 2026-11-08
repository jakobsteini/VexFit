# Mailtext: Profil-Erinnerung an Trainer (Entwurf, Jakob gibt frei)

Stand 08.11.2026. Manuell aus der Verwaltung verschickt (per Klick, mit Vorschau).
Quelle des Textes: `mailProfilErinnerung()` in
`supabase/functions/vexfit-automation/kern.ts`. Absender: **office@vexfit.app**.
Du-Form, kurz, österreichisches Deutsch, keine Fachwörter, keine erfundenen
Zahlen, keine Dringlichkeits-Tricks, keine Adresse von Jakob.

Die Preis-Formulierung ist bewusst AGB-konform (§3: Zahlungspflicht beginnt erst
mit der **Annahme** der ersten Kundenanfrage) und hält `preis_formulierung_test.ts`
grün.

---

## Beispiel: Trainer „Max M.“, Profil 6/8, es fehlen Foto und Preis pro Stunde

**Betreff:**

```
Dein Vexfit-Profil ist zu 6 von 8 fertig
```

**Text (Fließtext der Mail):**

```
Mach dein Profil komplett

Hallo Max, danke, dass du bei Vexfit dabei bist! Dein Profil ist zu 6 von 8
fertig. Es fehlen noch: Foto, Preis pro Stunde. In der Suche sehen Kundinnen und
Kunden zuerst Foto, Ort und Preis – vollständig ausgefüllte Profile werden eher
angeklickt. Das Ergänzen dauert nur wenige Minuten. Vexfit ist für dich
kostenlos, bis du die erste Kundenanfrage über Vexfit annimmst. Danach 49,99
€/Monat, monatlich kündbar. Jeder weitere Kunde über Vexfit einmalig 9,99 €.
Wenn du Fragen hast, antworte einfach auf diese Mail – sie erreicht Jakob direkt.

[ Profil jetzt vervollständigen ]   → führt zur ersten fehlenden Angabe

Vexfit · Salzburg, Österreich
Impressum: https://vexfit.app/rechtliches.html

Du erhältst diese E-Mail, weil dein Trainerprofil auf Vexfit noch nicht
vollständig ist.
```

---

## Regeln (fix im Code)

- Anrede mit Vorname; wenn der Vorname fehlt, „du“.
- „x von 8“ und die fehlenden Angaben kommen aus derselben Logik wie Admin und
  Trainer-Bereich (`freischaltFehlendeFelder`), nicht neu erfunden.
- Der Knopf „Profil jetzt vervollständigen“ zeigt auf die **erste** fehlende
  Angabe (Foto → Trainer-Bereich, sonst Profilformular mit Sprungmarke).
- Keine Zeile wie „X Kunden suchen in deiner Nähe“, keine Frist, kein Countdown.
- Nur „Vexfit · Salzburg, Österreich“ als Herkunft; die vollständige Anschrift
  steht ausschließlich im verlinkten Impressum.

## Freigabe

- [ ] Jakob hat den Text gelesen und gibt ihn frei **oder** schickt Änderungen an
      Claude. Vorher wird **nichts** verschickt.
