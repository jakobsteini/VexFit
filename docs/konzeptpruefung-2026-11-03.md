# Konzeptprüfung Vexfit – 3. November 2026

Geprüft wurde der ganze Ablauf vom ersten Besuch bis zur Abrechnung: Wo gehen
Trainer oder Kunden verloren, und wo kommt Geld nicht herein? Grundlage ist der
tatsächliche Code (keine Vermutungen). Stellen, die nur Jakob entscheiden oder in
externen Diensten (Stripe) nachsehen kann, sind als offene Frage markiert.

Sortiert nach Wirkung. Je Punkt: **Problem · Folge · Vorschlag · Aufwand.**

---

## 1. Der Abrechnungs-Lebenszyklus fehlt (größte Lücke)

**Problem.** Bezahlt wird über zwei Stripe-Zahlungslinks (`LINK_ERSTE` = 49,99 €,
`LINK_WEITERE` = 9,99 €). Die Edge Function hört über den Webhook `/stripe` nur
auf **ein** Ereignis: `checkout.session.completed`. Dabei wird `stripe_bezahlt`
und `aktiv` einmalig auf `true` gesetzt – und bleibt es dauerhaft. Es gibt **keine**
Verarbeitung von
- monatlicher Verlängerung (`invoice.paid`),
- fehlgeschlagener Zahlung (`invoice.payment_failed`),
- Kündigung (`customer.subscription.deleted`),
- Rechnungen/Belegen im System.

Ob `LINK_ERSTE` in Stripe überhaupt als **Abo** (wiederkehrend monatlich) oder als
**Einmalzahlung** angelegt ist, steht im Stripe-Dashboard, nicht im Code – **das
muss Jakob dort nachsehen** (offene Frage). So oder so greift der beworbene
Tarif „49,99 €/Monat, monatlich kündbar" technisch ins Leere:

**Folge.**
- Ist der Link eine **Einmalzahlung**: Es wird nie ein zweiter Monat eingezogen.
  Der Trainer zahlt einmal 49,99 € und ist dauerhaft aktiv – wiederkehrender
  Umsatz entsteht nicht.
- Ist der Link ein **Abo**: Stripe zieht zwar monatlich ein, aber eine Kündigung
  (laut AGB §3 formlos per E-Mail an office@vexfit.app) oder eine fehlgeschlagene
  Zahlung setzt im System **nichts** zurück. Ein gekündigter oder nicht mehr
  zahlender Trainer bleibt `aktiv` und bekommt weiter Kundenanfragen – kostenlos.
- Die AGB verspricht „monatlich kündbar", es gibt aber keinen technischen Weg,
  der eine Kündigung wirksam umsetzt.

**Vorschlag (keinen Zahlungsanbieter selbst bauen – nur Wege aufzeigen):**
1. **Stripe Billing als echtes Abo (empfohlen).** `LINK_ERSTE` als
   Abo-Zahlungslink führen und die Webhooks `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.deleted` ergänzen, die
   `aktiv`/`stripe_bezahlt` entsprechend setzen. Laufende Kosten: Stripe nimmt
   ca. 1,5 % + 0,25 € je europäischer Kartenzahlung, Billing zusätzlich ~0,5 %
   des wiederkehrenden Umsatzes; **keine** monatliche Grundgebühr. Kündigung +
   Rechnung laufen dann automatisch über Stripe.
2. **Zahlungslinks behalten, Lebenszyklus manuell.** Monatlicher Abgleich in
   Stripe + fester Kündigungsprozess (E-Mail an office@ → Admin setzt den Trainer
   im Verwaltungswerkzeug inaktiv). Kosten: nur Stripes Transaktionsgebühr,
   dafür Handarbeit jeden Monat.
3. **Auf reines Pay-per-Lead umstellen.** Die 49,99 €/Monat streichen und nur je
   freigeschaltetem Kundenkontakt kassieren (z. B. 9,99 € pro Kontakt). Dann
   braucht es gar keinen Abo-Lebenszyklus. Kosten: nur Transaktionsgebühr;
   bedingt eine Preis-/AGB-Änderung – **Entscheidung Jakob.**

**Aufwand.** Weg 1: mittel–groß. Weg 2: klein (Prozess, kein Code). Weg 3: mittel
(Preis-/AGB-Umstellung). Die Entscheidung, welcher Weg, gehört Jakob.

---

## 2. Kündigung/Nichtzahlung sperrt den Trainer nicht

**Problem.** Folgt direkt aus Punkt 1, aber eigener Hebel: Es gibt keinen Pfad,
der einen Trainer wieder auf `aktiv = false` setzt, wenn er kündigt oder nicht
mehr zahlt. Der Admin kann zwar manuell „Freigabe zurücknehmen"/„Sperren", aber
niemand erfährt automatisch, dass gekündigt wurde.

**Folge.** Gekündigte/zahlungssäumige Trainer bleiben in der Suche und bekommen
weiter Leads – direkter Umsatzausfall und Ungleichbehandlung zahlender Trainer.

**Vorschlag.** Als Teil von Punkt 1 Weg 1 die Stripe-Abo-Ereignisse auswerten;
bei Weg 2/3 einen klaren Admin-Handgriff dokumentieren (Kündigungs-E-Mail →
Trainer inaktiv setzen).

**Aufwand.** Klein–mittel.

---

## 3. Kunde ohne Trainer in der Region wird nicht zurückgeholt

**Problem.** Sucht ein Kunde in einer PLZ-Region ohne freigeschalteten Trainer,
kann er sich auf eine Warteliste setzen („Benachrichtige mich"). Der Lead wird
erfasst und löst eine Mail an Jakob aus (`/neuer-kunde`). Aber: der Kunde bekommt
**keine Bestätigung**, und es gibt **keine automatische Rückmeldung**, sobald
später ein Trainer in seiner PLZ-Region freigeschaltet wird. (Zusatz: Dass die
PLZ des Interessenten überhaupt mitgesendet wird, war bis zu einem Fix in diesem
Nachtlauf kaputt – vorher ging der Standort des Leads verloren.)

**Folge.** Der Kunde wartet im Nichts, hört nie wieder etwas und ist verloren –
obwohl die Nachfrage genau zeigt, wo sich ein Trainer lohnen würde.

**Vorschlag.** (a) Sofort eine ruhige Bestätigungsmail an den Kunden
(„Wir haben deine Anfrage – sobald ein Trainer in deiner Nähe startet, melden wir
uns."). (b) Bei Trainer-Freigabe automatisch alle Wartenden in der PLZ-Region
benachrichtigen. Das verwandelt die Warteliste in echte Kunden statt in tote
Datensätze.

**Aufwand.** Mittel.

---

## 4. Woran „über Vexfit" gezählt wird (Abrechnungsgrundlage)

**Problem/Prüfung.** Grundlage ist die `anfragen`-Tabelle plus die
Stripe-Ereignisse. Die Kontaktdaten des Kunden werden **erst nach Zahlung**
freigegeben – das ist der wirksame Hebel: Der Trainer sieht Name/E-Mail nur, wenn
er zahlt. Die Zuordnung Zahlung→Trainer läuft über `client_reference_id` (sonst
über die E-Mail), Doppelverarbeitung wird über `ereignisSchonVerarbeitet`
verhindert. Das ist nachvollziehbar und auf Trainer-Seite schwer zu
manipulieren.

**Folge/Grenzen.** Gezählt wird pro **freigeschalteter Anfrage**, nicht pro
echtem Kundenverhältnis: Folgegeschäft mit demselben Kunden ist – modellbedingt –
nicht erfasst. Das ist kein Fehler, nur eine inhärente Grenze des Modells.

**Vorschlag.** So belassen. Optional im Admin die Verknüpfung Anfrage↔Zahlung
sichtbarer machen (teilweise im Zahlungen-Reiter vorhanden), damit jede
Abrechnung belegbar bleibt.

**Aufwand.** Keiner bis klein.

---

## 5. AGB-Text und Technik widersprechen sich beim „Annehmen"

**Problem.** Die Statusleiste im Trainer-Bereich wurde in diesem Nachtlauf ehrlich
gemacht. Die AGB §3 (rechtliches.html – bewusst nicht angefasst) nennt aber
weiterhin die Schaltfläche „Annehmen" als Auslöser der Zahlungspflicht. Technisch
setzt „Annehmen" nur den Status; der Zahlungslink kommt schon beim **Eingang** der
Anfrage, und die Zahlungspflicht entsteht faktisch mit der **Zahlung/
Freischaltung**.

**Folge.** Widerspruch zwischen AGB und tatsächlichem Ablauf – rechtlich heikel
(siehe auch Rechtsbericht).

**Vorschlag.** AGB §3 vom Anwalt an die Technik angleichen: Zahlungspflicht
entsteht mit der Zahlung/Freischaltung, nicht mit „Annehmen". Zusätzlich klären,
welchen Zweck „Annehmen/Ablehnen" neben dem Zahlknopf hat (heute nur Status +
Antwortzeit + bei Ablehnen eine Alternativ-Mail).

**Aufwand.** Klein (Text), aber Anwaltssache.

---

## 6. Kunden-Registrierung ohne Meta-CAPI-Entdopplung

**Problem.** Der Trainer-Pfad sendet an die Meta Conversions API eine `event_id`
zur Entdopplung (Pixel + Server). Der Kunden-Pfad (`pixelRegistrierungFertig
('kunde')` und der `/neuer-kunde`-Aufruf) tut das nicht.

**Folge.** Kein Nutzer- oder Umsatzfehler, aber ungenaues Tracking
(Doppelzählung von Kunden-Registrierungen möglich) – schlechtere Datenbasis für
die Instagram-Anzeigen.

**Vorschlag.** Kunden-Pfad wie den Trainer-Pfad mit `event_id`/`event_source_url`
spiegeln.

**Aufwand.** Klein.

---

## 7. Studio-Zuordnung kann in einem Randfall verloren gehen

**Problem.** Öffnet jemand eine Studio-Seite **ohne** `?standort=…` und klickt
dann auf einen Trainer-Knopf, landet er auf `registrieren.html?typ=kunde&
standort=slug`. `registrieren.html` liest den `standort`-Parameter aber nicht aus.
Der QR-Normalfall funktioniert (die Studioseite setzt `vexfit_studio` schon beim
Laden mit `?standort`).

**Folge.** Randfall: Die Studio-Zuordnung des Kunden fehlt, die „Schon
Mitglied?"-Frage im Profil entfällt.

**Vorschlag.** `registrieren.html` den `standort`-Parameter auslesen und wie die
Studioseite in `vexfit_studio` ablegen.

**Aufwand.** Klein.

---

## Kurzfassung für Jakob

1. **Abo-Lebenszyklus (Punkt 1+2):** Im Stripe-Dashboard nachsehen, ob
   `LINK_ERSTE` ein Abo oder eine Einmalzahlung ist, und dann entscheiden: echtes
   Stripe-Abo mit Kündigungs-Webhooks, manueller Prozess, oder Pay-per-Lead. **Das
   ist die größte Lücke – ohne das kommt entweder kein monatlicher Umsatz herein
   oder gekündigte Trainer bleiben kostenlos aktiv.**
2. **Wartelisten-Kunden (Punkt 3):** Bestätigung an den Kunden + automatische
   „Trainer verfügbar"-Mail bei Freigabe – sonst verpuffen diese Leads.
3. **AGB ↔ „Annehmen" (Punkt 5):** vom Anwalt angleichen lassen.
4. Kleinigkeiten: Kunden-Tracking entdoppeln (6), Studio-Randfall (7).
