# Teil 8 – Kopplung „erste Anfrage angenommen" → Zahlung

## Bestandsaufnahme (heute)
- Preismodell (AGB §3): Trainer gratis bis zur Annahme der **ersten** Kundenanfrage,
  danach €49,99/Monat + €9,99 je weiterem Kunden.
- Der Trainer nimmt eine Anfrage im Trainerbereich an → `anfragen.status = 'angenommen'`
  (`trainer-bereich.html` `beantworteAnfrage`).
- Bezahlt wird über Stripe-Payment-Links (fix):
  - erste: `https://buy.stripe.com/eVqdR9gopdNhczNbhw2oE00`
  - weitere: `https://buy.stripe.com/7sYbJ1fkl8sX8jxfxM2oE01`
  (`trainer-bereich.html` LINK_ERSTE/LINK_WEITERE, `kern.ts`).
- Der Stripe-Webhook (`vexfit-automation/stripe`) setzt bei Zahlung
  `trainers.stripe_bezahlt = true` (Mail 7 an office@vexfit.app).
- **Heute schickt Jakob den Zahlungslink manuell** (siehe anleitung.html Schritt 5).
  Der Trainerbereich zeigt dazu schon den Hinweis „… sobald du deine erste
  Kundenanfrage annimmst, schicken wir dir den Zahlungslink."
- Es gibt keinen Auslöser, der beim Statuswechsel auf `angenommen` automatisch
  etwas verschickt.

## Optional bereits umgesetzt (dieser Commit)
Admin-Reiter **„Zahlungslink offen"**: freigeschaltete Trainer mit mindestens
einer angenommenen Anfrage (`anfragen.status='angenommen'`), die noch nicht
bezahlt haben (`stripe_bezahlt=false`). Nur lesend, aus vorhandenen Daten
(`ladeZahlungslinkOffen` in admin.html). Damit sieht Jakob auf einen Blick, wem
der Link zu schicken ist – ohne Stripe-Umbau.

## Umsetzungsplan (Vorschlag, NICHT umgesetzt – kein Stripe-Live-Umbau)
Ziel: beim Annehmen der **ersten** Anfrage automatisch den passenden
Zahlungslink an den Trainer mailen; „genau einmal".

1. **Auslöser** (`trainer-bereich.html`, `beantworteAnfrage`): nach erfolgreichem
   Setzen von `status='angenommen'` einen nicht blockierenden Aufruf an einen
   neuen Edge-Endpunkt `/zahlungslink-pruefen` absetzen (mit Trainer-Token),
   analog zum Teil-4-Aufruf `/freigabe-pruefen`.
2. **Edge-Endpunkt** `vexfit-automation/zahlungslink-pruefen` (`kern.ts`/`index.ts`):
   - Trainer über das Token bestimmen (`benutzerAusToken` → `trainerProfilNachEmail`).
   - Zählen, wie viele angenommene Anfragen der Trainer hat (service_role-Lesen
     `anfragen?trainer_id=eq…&status=eq.angenommen`).
   - Ist es die **erste** (`stripe_bezahlt=false` und Zähler == 1) und wurde der
     Link noch nicht geschickt (neues Feld `zahlungslink_gesendet`, s. u.):
     Mail an den Trainer mit `LINK_ERSTE`, danach `zahlungslink_gesendet=true`
     setzen (`adminTrainerSetzen`). Abwärtskompatibel wie Teil 4: fehlt das Feld,
     nicht senden, nur Hinweis loggen.
   - Versandfehler loggen (`sendeWennAdresseTaugt`).
3. **Mail** (`kern.ts`, neuer Builder `mailZahlungslinkErste(trainer)`): Anrede,
   Hinweis „erste Anfrage angenommen", `LINK_ERSTE`, Preis €49,99/Monat,
   Kündigungsweg office@vexfit.app. Absender wie gehabt.
4. **Migration** (eine Datei, Teil-9-Muster): Spalte
   `trainers.zahlungslink_gesendet boolean NOT NULL DEFAULT false` + Rücknahme.
   Idempotent, nicht einspielen.
5. **Stripe-Einstellung** (Dashboard, außerhalb des Repos): sicherstellen, dass
   die Payment-Links auf **Live** stehen (nicht Test), und dass
   `client_reference_id`/`prefilled_email` wie bisher mitgegeben werden, damit der
   Webhook den Trainer zuordnet. Für „weitere Kunden" (€9,99) analog mit
   `LINK_WEITERE`, Auslöser = jede weitere angenommene Anfrage.
6. **Tests** (gemockt): erste angenommene Anfrage → genau eine Mail mit LINK_ERSTE
   + Flag gesetzt; zweite Annahme → keine erneute Erste-Mail; ohne Migration kein
   Versand; Versandfehler geloggt.

Offene Entscheidung für Jakob: ob der Versand wirklich **automatisch** laufen soll
oder der neue Admin-Reiter „Zahlungslink offen" als manueller Zwischenschritt
genügt (weniger Risiko bei falsch gezählten „ersten" Anfragen).
