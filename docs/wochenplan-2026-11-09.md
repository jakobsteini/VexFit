# Wochenplan KW 46 (Mo 09.11. – So 15.11.2026)

**Ziel der Woche:** Salzburg-Stadt. **Die erste echte Kundenanfrage** auslösen
(bisher: 0 Anfragen jemals, Quelle: `docs/konzept-2026-11-07.md`). Der Engpass
ist laut Konzept die **Kundenseite** (Besucher → Anfrage), nicht die
Trainergewinnung – die Woche stärkt beides für genau eine Stadt.

> Grundlage: nur Repo-Inhalte (`docs/konzept-2026-11-07.md`,
> `docs/dauerlauf-2026-11-08-suche.md`, `werkzeuge/brief-generator.mjs`,
> Abendbericht/Admin-Übersicht in `supabase/functions/vexfit-automation/kern.ts`).
> Was nicht im Repo steht, ist unten als **[BLOCK]** markiert und von Jakob zu
> liefern/entscheiden – nichts davon ist erfunden.

## Rahmen

- **Zeit:** Jakob ist Mo–Fr 08–16 Uhr im Zivildienst. Alle aktiven Aufgaben
  werktags **nach 16 Uhr**; am Sa/So größere Blöcke.
- **Rechtlicher Rahmen (AT):** **Keine Kaltanrufe**, **keine Werbe-Mails ohne
  Einwilligung** – auch **B2B** nicht. Erlaubt sind: **Briefe per Post**,
  **persönliche Besuche**, und **eingehende** Kanäle (Anzeige → Landingpage,
  Presse, Website). Für CH gilt: nur **einzeln zugeschnittene** Mails – in dieser
  Salzburg-Woche nicht relevant, nur zur Erinnerung notiert.

## Vor der Woche erledigen (sonst läuft die Suche live nicht richtig)

Diese Punkte stehen im Abschluss von `docs/dauerlauf-2026-11-08-suche.md` und sind
Voraussetzung dafür, dass die neue Suche live so aussieht wie geprüft:
1. Migrationen in Reihenfolge einspielen: `2026-11-08-01-trainers-vorschau.sql`,
   dann `2026-11-08-03-anon-kein-nachname.sql` (und offene frühere, siehe
   Abschluss). 
2. `git push origin main`.
3. **[Entscheidung Jakob]** E-Mail-Bestätigung in Supabase **AUS** (sonst wird die
   Ein-Schritt-Anfrage vom Profil nur als Entwurf gemerkt, Konzept K3).
4. **[Entscheidung Jakob]** `OEFFENTLICHE_VORSCHAU` bleibt an (steht in
   `vexfit-config.js` auf `true`) – Grundsatz „Suche hinter Anmeldung" vs.
   öffentliche Vorschau endgültig klären (Konzept K2).

## Täglich anschauen (Kennzahlen aus der Admin-Stadt-Übersicht Salzburg)

Im **Abendbericht** / in der **Admin-Stadt-Übersicht** (PLZ 50xx, Ziel Salzburg)
stehen – best effort, aus `kern.ts`:
- **Freigegebene Trainer** in Salzburg (ohne Test-Konten),
- **Kundensuchen** der letzten 7 Tage (Kunden-Trichter),
- **Vormerkungen**,
- **Kunden-Trichter 24 h** (Seite→Suche→Treffer→Profil→Anfrage).
**Leitkennzahl der Woche: Anzahl echter Anfragen in Salzburg – Ziel: von 0 auf ≥ 1.**
Jeden Abend kurz notieren, wo der Trichter abbricht (z. B. viele Suchen, keine
Profilklicks → Karten/Trefferqualität; Profilklicks, keine Anfrage → Anfrageweg).

## Tagesplan

### Mo 09.11. – Aufsetzen (nach 16 Uhr)
- Voraussetzungen oben (1–4) abschließen; live gegenprüfen: privates Fenster,
  `https://vexfit.app/suche.html?plz=5020&land=AT` → nur „Vorname N.", Vor-Ort nur
  AT, DE/CH-Online getrennt mit Kennzeichnung, Foto mittig.
- **Briefe vorbereiten:** Salzburger Trainer/Studios als CSV pflegen
  (`name;ort;postanschrift;website;schwerpunkt`) und
  `node werkzeuge/brief-generator.mjs <deine.csv> briefe-ausgabe/` laufen lassen
  (A4-PDF je Adresse, QR auf `trainer.html` mit UTM `utm_campaign=salzburg`).
  **[BLOCK]** Die echten Postadressen stehen **nicht** im Repo
  (`werkzeuge/briefe-beispiel.csv` ist nur Vorlage) – Jakob recherchiert sie.
- Abendkennzahlen notieren (Startwerte).

### Di 10.11. – Briefe raus + Anzeige scharf (nach 16 Uhr)
- Erste **10–15 Briefe** ausdrucken, kuvertieren, **per Post** aufgeben
  (keine Mail, kein Anruf – AT-Recht).
- **Anzeige „VF Trainer AT 4 – Landingpage"** scharf schalten/prüfen – Landingpage
  ist `trainer.html` (im Repo). **[BLOCK]** Budget, Laufzeit, Zielgruppe stehen
  nicht im Repo – Jakob setzt sie im Werbekonto; auf dieselben UTM wie die Briefe
  achten (Vergleichbarkeit im Trichter).
- Kennzahlen notieren.

### Mi 11.11. – Persönliche Besuche (nach 16 Uhr)
- **2–3 persönliche Besuche** in Salzburger Studios/bei Trainern: kurz Vexfit
  erklären („für Kunden kostenlos", Trainer zahlt erst ab der 1. angenommenen
  Anfrage, AGB §3), Brief/QR dalassen. **[BLOCK]** Konkrete Besuchsziele
  (Studios) stehen nicht im Repo – Jakob wählt sie vor Ort.
- Kennzahlen notieren; neue Freischalt-Anträge zeitnah im Admin prüfen/freigeben.

### Do 12.11. – Nachfassen per Brief + Content (nach 16 Uhr)
- Zweite **Brief-Charge** (weitere 10–15 Adressen) aufgeben.
- Kundenseite teilen: `personal-trainer-salzburg.html` (für Kunden kostenlos,
  führt in die Suche `?plz=5020&land=AT`) dort posten, wo Salzburger Kunden sind
  – über **eigene** Kanäle (keine fremden Verteiler, keine Werbe-Mails).
  **[BLOCK]** Welche eigenen Kanäle (eigene Social-Profile/Gruppen) – Jakob wählt.
- Kennzahlen notieren.

### Fr 13.11. – Presse anstoßen (nach 16 Uhr)
- **Presse:** kurzen, sachlichen Hinweis an lokale Salzburger Redaktion/Blog
  vorbereiten (junger Dienst, für Kunden kostenlos, Salzburg-Start). Versand per
  Brief/eigenem Kontakt oder über das Kontaktformular der Redaktion – **keine**
  unaufgeforderte Massen-Mail. **[BLOCK]** Konkrete Redaktionen/Kontakte stehen
  nicht im Repo – Jakob trägt sie zusammen.
- Wochen-Zwischenstand aus den Kennzahlen ziehen.

### Sa 14.11. – Reichweite + Freischaltungen (größerer Block)
- Besuche/Flyer dort, wo am Wochenende Betrieb ist (Studios, Lauftreffs o. Ä.).
  **[BLOCK]** Orte wählt Jakob.
- Admin: alle offenen Trainer-Freischaltungen prüfen (nur echte, kein Test),
  damit die Suche in Salzburg möglichst voll ist.
- Vormerkungen durchsehen; angemeldete Vormerker stehen in der Warteliste
  (automatische „1 Mail bei Verfügbarkeit" nur für Angemeldete, Konzept K4).

### So 15.11. – Auswertung & nächste Woche
- Woche auswerten: **Kam ≥ 1 echte Kundenanfrage?** Wenn ja: Weg nachzeichnen
  (welcher Kanal/Trichterschritt). Wenn nein: im Trichter die größte Abbruchstelle
  benennen und die nächste Woche darauf ausrichten (z. B. mehr Trainer vor Ort,
  oder Anfrageweg nachschärfen).
- Offene Entscheidungen (E-Mail-Bestätigung, Vorschau/Grundsatz) festhalten.

## Offene Lücken / BLOCKs (aus dem Repo nicht lösbar)

- **Postadressen** der Salzburger Trainer/Studios – nicht im Repo.
- **Anzeige „VF Trainer AT 4"**: Budget/Laufzeit/Zielgruppe – nicht im Repo
  (nur die Landingpage `trainer.html`).
- **Presse-/Besuchskontakte** (Redaktionen, konkrete Studios) – nicht im Repo.
- **Marktzahlen** (wie viele Trainer/Suchende in Salzburg) – laut Konzept bewusst
  nicht bekannt, nicht erfinden.
- **Anonyme Vormerkung → Warteliste** ist nicht angeschlossen (Konzept K4, BLOCK):
  automatische „1 Mail bei Verfügbarkeit" nur für angemeldete Kunden.
- **Entscheidungen Jakob:** E-Mail-Bestätigung AUS? Vorschau/Grundsatz endgültig?
