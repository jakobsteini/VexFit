# Was in rechtliches.html (Impressum + Datenschutz) fehlt oder falsch ist

**Nur eine Liste – rechtliches.html wurde NICHT verändert.** Umsetzung erst nach
anwaltlicher Prüfung. Grundlage: der aktuelle Seiteninhalt + die Primärquellen aus
`risikobericht-2026-11-03.md`. Die AGB-Punkte stehen separat im AGB-Entwurf.

---

## A. IMPRESSUM (aktuell „Angaben gemäß § 5 ECG · Österreich")

Vorhanden: Name, Ort (5330 Fuschl am See), E-Mail, Telefon, Website,
Unternehmensgegenstand, Haftungsausschluss, EU-Streitschlichtung.

**Fehlt / zu prüfen (§ 5 ECG, § 25 MedienG):**

1. **UID-Nummer bzw. Hinweis.** Entweder UID angeben oder – als Kleinunternehmer –
   ausdrücklich „Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG, keine UID / kein
   USt-Ausweis". § 5 Abs. 1 Z 6 ECG verlangt die UID, sofern vorhanden.
2. **Gewerberechtliche Angaben.** Gewerbewortlaut, zuständige Behörde
   (Bezirkshauptmannschaft Salzburg-Umgebung), Hinweis auf die Gewerbeordnung
   (GewO 1994) mit Fundstelle (ris.bka.gv.at), ggf. **GISA-Zahl**. § 5 Abs. 1 Z 5/6
   ECG. *(Setzt voraus, dass das Gewerbe angemeldet ist – siehe Risikobericht #10.)*
3. **Kammerzugehörigkeit.** Pflichtmitgliedschaft **Wirtschaftskammer**
   (Fachgruppe/Fachverband) nennen. § 5 Abs. 1 Z 6 ECG.
4. **Vollständige geografische Anschrift.** § 5 ECG verlangt eine geografische
   (ladungsfähige) Anschrift; ob „5330 Fuschl am See" ohne Straße genügt, ist
   anwaltlich zu klären. **Hinweis Jakob:** in öffentliche Texte bewusst keine
   erfundene Straße – Entscheidung liegt bei Jakob/Anwalt.
5. **Offenlegung nach § 25 MedienG.** Für jede Website Pflicht: Medieninhaber
   (Name), Unternehmensgegenstand, Wohnort/Sitz; bei „großer Website" zusätzlich
   die grundlegende Richtung. Fehlt derzeit als eigener Block (Verwaltungsstrafe
   bis 20.000 €).
6. **Streitschlichtungs-Hinweis präzisieren.** Die EU-ODR-Plattform wird seit
   20.07.2025 eingestellt; den Verweis auf ec.europa.eu/consumers/odr prüfen und
   ggf. durch einen aktuellen Hinweis ersetzen (Anwaltsfrage; bei reinem B2B-Abo
   ggf. entbehrlich).
7. **DSA-Kontaktstelle** benennen (kann im Impressum stehen): Kontaktpunkt für
   Nutzer und Behörden (office@vexfit.app, Sprache Deutsch).

**Falsch / irreführend:**

8. **„Haftung ist auf Vorsatz und grobe Fahrlässigkeit beschränkt".** Diese
   Formulierung ist zu knapp und greift zu kurz: Personenschäden sind auch bei
   leichter Fahrlässigkeit nicht ausschließbar. Die gestufte Haftungsklausel aus
   dem AGB-Entwurf § 12 übernehmen (gehört aber eher in die AGB).

---

## B. DATENSCHUTZERKLÄRUNG (aktuell „gemäß DSGVO · Stand: Mai 2026")

Vorhanden (knapp): Verantwortlicher, grob „welche Daten", Betroffenenrechte
(Auskunft/Berichtigung/Löschung/Widerspruch), Cookies (ein Satz), Beschwerde bei
der DSB. **Insgesamt deutlich zu dünn für eine Plattform mit Meta-Tracking.**

**Fehlt (Art. 13 DSGVO; CH Art. 19 DSG):**

1. **Rechtsgrundlagen je Zweck (Art. 6 DSGVO).** Für jede Verarbeitung die
   Rechtsgrundlage nennen (Vertrag Art. 6 Abs. 1 lit. b für Registrierung/
   Vermittlung; Einwilligung lit. a für Marketing/Pixel; ggf. berechtigtes
   Interesse lit. f für Logs/Sicherheit).
2. **Meta-Pixel + Conversions API – der zentrale Punkt.** Bisher **gar nicht**
   genannt. Erforderlich: Meta (Meta Platforms Ireland/USA) als Empfänger, Zweck
   (Conversion-Tracking der Instagram-/Facebook-Anzeigen), Rechtsgrundlage
   **Einwilligung**, Datenübermittlung in die **USA** samt Transfergrundlage
   (EU-US Data Privacy Framework / Standardvertragsklauseln), ggf. **gemeinsame
   Verantwortlichkeit** mit Meta (Art. 26). Auch die **Conversions API**
   (serverseitig) ist einwilligungspflichtig und offenzulegen. *(Das ist der seit
   Längerem offene „Meta-CAPI-Datenschutzsatz".)*
3. **Auftragsverarbeiter konkret.** Stripe (Zahlung), Supabase (Datenbank/Hosting
   Backend), GitHub Pages (Hosting Website) mit jeweiligem Zweck und Standort;
   Hinweis auf Auftragsverarbeitungsverträge (Art. 28 DSGVO).
4. **Drittlandübermittlung allgemein (Art. 44 ff.).** USA-Transfer (Meta, ggf.
   Stripe/Supabase) mit Garantien benennen.
5. **Speicherdauer** je Datenkategorie (z. B. Konto bis Löschung, Logs X Tage,
   Leads/Warteliste bis Zweckwegfall).
6. **Vollständige Betroffenenrechte.** Es fehlen: **Datenübertragbarkeit**
   (Art. 20), **Einschränkung** (Art. 18), **Widerruf der Einwilligung** (Art. 7
   Abs. 3 – zwingend, sonst ist die Einwilligung angreifbar).
7. **Server-Logs / technische Daten** konkret (IP, Zeitpunkt, User-Agent) mit
   Zweck und Rechtsgrundlage; aktuell nur „Technische Daten via Supabase".
8. **Cookie-/Tracking-Abschnitt ausbauen.** Nennen: welche nicht notwendigen
   Dienste (Meta-Pixel), Einwilligung als Grundlage, Hinweis auf § 165 Abs. 3 TKG
   2021 (AT) bzw. § 25 TDDDG (DE), Möglichkeit zum Widerruf (Cookie-Einstellungen).
9. **CH-Bezug (revDSG).** Für Schweizer Nutzer: Information nach Art. 19 DSG,
   Auslandbekanntgabe nach Art. 16/17; prüfen, ob ein **Schweizer Vertreter**
   (Art. 14 DSG) nötig ist (Anwaltsfrage – vom Umfang abhängig).
10. **Automatisierte Mails** (Benachrichtigungen, Erinnerungen, Warteliste)
    datenschutzrechtlich einordnen (Zweck, Rechtsgrundlage).

**Falsch / veraltet:**

11. **„Stand: Mai 2026".** Veraltet – liegt vor den Pixel-/CAPI-Änderungen vom
    Okt./Nov. 2026. Nach Überarbeitung Datum aktualisieren.
12. **„Mit deiner Einwilligung auch Analyse-Cookies".** Ungenau: Es geht um
    **Marketing/Tracking** (Meta), nicht nur „Analyse". Präzisieren.

---

## Reihenfolge der Umsetzung (Vorschlag)

1. Zuerst **Meta-Pixel/CAPI + USA-Transfer** in die Datenschutzerklärung
   aufnehmen (größtes Risiko, Punkt 1 im Risikobericht).
2. Impressum um UID/Kleinunternehmer-Hinweis, Gewerbe/Behörde/WKO, MedienG-
   Offenlegung, DSA-Kontaktstelle ergänzen.
3. Betroffenenrechte, Speicherdauer, Auftragsverarbeiter, CH-Bezug nachziehen.

**Alles erst nach anwaltlicher Prüfung in rechtliches.html übernehmen. Diese Datei
ändert die Live-Seite nicht.**
