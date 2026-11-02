# Rechtlicher Risikobericht Vexfit – 3. November 2026

**Kein Ersatz für anwaltliche Beratung.** Dieser Bericht fasst recherchierte
Primärquellen (Gesetze, Behörden, WKO/SECO/EDÖB) zusammen und zeigt, wer Vexfit
weshalb belangen kann. Jede Aussage ist mit Quelle belegt. Unsichere Punkte stehen
am Ende als „Fragen an den Anwalt". Nichts ist erfunden; wo eine Einstufung offen
ist, steht das ausdrücklich dabei.

Ausgangslage: Vexfit ist eine Online-Vermittlungsplattform (Marktplatz),
Betreiber Jakob Steinbacher, Einzelunternehmen in Österreich (5330 Fuschl am See).
Kunden suchen per PLZ Personal Trainer in AT/DE/CH, Kunden gratis; Trainer gratis
bis zum ersten Kunden, danach 49,99 €/Monat + 9,99 € je weiterem Kunden. Viele
Nutzer kommen über Instagram/Facebook-Anzeigen (Meta-Pixel + Conversions API,
nur nach Cookie-Zustimmung). Hosting GitHub Pages, Backend Supabase, Zahlung Stripe.

Weil Vexfit sich gezielt an Nutzer in DE und CH richtet (Anzeigen dorthin), gilt
neben österreichischem Recht auch deutsches und schweizerisches Markt-/Daten-
schutzrecht – unabhängig vom Firmensitz in Österreich (Marktortprinzip bzw.
Auswirkungsprinzip).

---

## Risikotabelle (nach Wirkung sortiert)

| # | Wer kann klagen/abmahnen/strafen | Weshalb (Norm) | Wahrscheinlichkeit | Mögliche Folge / Kosten | Was hilft | Quelle |
|---|---|---|---|---|---|---|
| 1 | **Datenschutzbehörden** (AT: DSB; DE: Landes-DSB; CH: EDÖB), **betroffene Nutzer**, teils Mitbewerber | Meta-Pixel **+ Conversions API** verarbeiten personenbezogene Daten und übermitteln sie an Meta/USA. Rechtsgrundlage ist **Einwilligung** (Art. 6 Abs. 1 lit. a DSGVO), nicht berechtigtes Interesse; Transparenzpflicht Art. 13; Drittlandtransfer Art. 44 ff. (EU-US Data Privacy Framework). CAPI ist **nicht** einwilligungsfrei. | **Hoch** – Ads sind das Kerngeschäft, Pixel/CAPI stehen im Fokus von Behörden und Abmahnern | DSGVO-Bußgeld (theoret. bis 20 Mio./4 %, bei Einzelunternehmer real weit niedriger), Beschwerdeverfahren, Schadenersatz (Art. 82); CH: Buße bis CHF 250.000 **gegen Jakob persönlich** | Pixel + CAPI **erst nach aktivem Opt-in** laden (ist umgesetzt) · Datenschutzerklärung um Pixel/CAPI, Meta als Empfänger, USA-Transfer/DPF, ggf. gemeinsame Verantwortlichkeit ergänzen · Pixel und CAPI an **dieselbe** Einwilligung koppeln | DSGVO (EUR-Lex): https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=celex%3A32016R0679 · DSK-Orientierungshilfe: https://www.datenschutzkonferenz-online.de/media/oh/OH_Digitale_Dienste.pdf · CH DSG: https://www.fedlex.admin.ch/eli/cc/2022/491/de |
| 2 | **Mitbewerber & Schutzverbände** (AT: Schutzverband/WKO; DE: Verbraucherzentralen); **Bezirksverwaltungsbehörde** (MedienG) | Unvollständiges Impressum. AT: **§ 5 ECG** (Name, geograf. Anschrift, E-Mail, Kammer, anwendbare Gewerbevorschriften, UID bzw. Hinweis) + **§ 25 MedienG** (Offenlegung). DE gegenüber dt. Nutzern: **§ 5 DDG**. CH: **UWG Art. 3 Abs. 1 lit. s**. | **Mittel–hoch** – fehlende Pflichtangaben sind leicht feststellbar und ein klassischer Abmahngrund | ECG/DDG/UWG: Abmahnung (Unterlassung + Kosten); MedienG: Verwaltungsstrafe bis **20.000 €** | Impressum vervollständigen (siehe `aenderungen-datenschutz-impressum.md`) | § 5 ECG: https://ris.bka.gv.at/Dokumente/Bundesnormen/NOR40025801/NOR40025801.html · § 25 MedienG: https://www.usp.gv.at/themen/brancheninformationen/information-und-kommunikation/offenlegungspflicht-gemaess-para-25-mediengesetz.html · § 5 DDG: https://www.gesetze-im-internet.de/ddg/__5.html |
| 3 | **Finanzamt**; Mitbewerber (Irreführung) | AGB §3 nennt „49,99 € **inkl. USt**". Als **Kleinunternehmer** (§ 6 Abs. 1 Z 27 UStG, Grenze seit 2025 = 55.000 € brutto) darf Jakob **keine USt ausweisen**; „inkl. USt" wäre ein **unberechtigter Steuerausweis** → Steuerschuld kraft Rechnung (§ 11 Abs. 12 UStG). | **Mittel** – fällt spätestens bei Rechnungen/Prüfung auf | Steuerschuld auf zu Unrecht ausgewiesene USt; Korrekturaufwand; Irreführungsvorwurf | USt-Angabe klären: entweder Kleinunternehmer-Hinweis statt „inkl. USt", oder bewusste Regelbesteuerung – **Steuerberater** | Kleinunternehmer: https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/weitere-steuertatbestaende-und-befreiungen/kleinunternehmen.html |
| 4 | **Verbraucherverbände** (AT: VKI/AK; DE: Verbraucherzentralen) per Verbandsklage; einzelne Nutzer | Pauschaler Haftungsausschluss („Vexfit haftet nicht …") ist weitgehend **nichtig**: AT § 879 Abs. 3 ABGB + § 6 Abs. 1 Z 9 KSchG; DE § 309 Nr. 7 / § 307 BGB (auch B2B über § 307). Keine geltungserhaltende Reduktion. | **Mittel** – Standard-Angriffspunkt bei AGB-Klauselkontrollen | Klausel unwirksam → es gilt das Gesetz (oft zu Vexfits Nachteil); Unterlassung + Kosten | Differenzierte Haftungsklausel: Vorsatz/grobe Fahrlässigkeit/Personenschäden nie ausschließen; leichte Fahrlässigkeit bei reinen Sach-/Vermögensschäden begrenzen (Entwurf) | § 879 ABGB: https://www.jusline.at/gesetz/abgb/paragraf/879 · § 6 KSchG: https://www.jusline.at/gesetz/kschg/paragraf/6 · § 309 BGB: https://www.gesetze-im-internet.de/bgb/__309.html |
| 5 | **Gewerbliche Nutzer (Trainer)** + Interessenverbände | **P2B-Verordnung (EU) 2019/1150** verlangt in den Trainer-AGB: Ranking-Hauptparameter (Art. 5), Gründe/Fristen für Sperre/Kündigung (Art. 3, 4), **zwei Mediatoren** (Art. 12), Änderungsankündigung 15 Tage (Art. 3). Gilt **größenunabhängig**; nur das interne Beschwerdemanagement (Art. 11) entfällt für Kleinunternehmen. | **Mittel** – fehlt in der aktuellen AGB vollständig | Klauseln nichtig; Klage gewerblicher Nutzer | P2B-Pflichtinhalte in den Trainer-Teil der AGB aufnehmen (Entwurf) | P2B-VO: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32019R1150 · WKO: https://www.wko.at/branchen/handel/p2b-verordnung.html |
| 6 | **Verbraucher-Kunden in DE/CH**; Verbraucherverbände | Klausel „österreichisches Recht, Gerichtsstand Salzburg" ist gegenüber Verbrauchern **weitgehend unwirksam**: DE – Rom-I Art. 6, Brüssel-Ia Art. 17–19; CH – IPRG Art. 114/120, LugÜ Art. 15–17. Verbraucher behalten Heimatrecht und Heimatgerichtsstand. | **Niedrig–mittel** – wird v. a. im Streitfall relevant | Klausel greift nicht; Prozess ggf. im Land des Verbrauchers nach dessen Recht; Abmahnung wegen unwirksamer Klausel | Günstigkeitsvorbehalt in die AGB: „zwingendes Verbraucherrecht des Aufenthaltsstaats bleibt unberührt" (Entwurf) | Rom I: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=celex%3A32008R0593 · Brüssel Ia: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=celex%3A32012R1215 · IPRG: https://www.droit-bilingue.ch/de-en/2/29/291-114-135.html |
| 7 | **Mitbewerber, Empfänger, Verbände** (DE § 7 UWG; CH UWG Art. 3 lit. o; AT UWG) | Automatisierte **Erinnerungs-** und **Wartelisten-Mails** können als E-Mail-**Werbung** ohne Einwilligung gelten, wenn sie reaktivierend/werblich formuliert sind. Reine Transaktionsmails (neue Anfrage, Bestätigung) sind zulässig. | **Mittel** – hängt am Wortlaut; Spam-Abmahnungen sind häufig | Abmahnung + Unterlassungserklärung + Kosten; CH: Strafantrag möglich (Art. 23 UWG) | Transaktion strikt von Werbung trennen; jede werbliche Mail mit korrektem Absender **und** kostenlosem Abmeldelink; im Zweifel Einwilligung einholen | § 7 UWG: https://www.gesetze-im-internet.de/uwg_2004/__7.html · CH UWG: https://www.fedlex.admin.ch/eli/cc/1988/223_223_223/de |
| 8 | **KommAustria/RTR** (AT) als DSA-Koordinator | **Digital Services Act (EU) 2022/2065**: Grundpflichten für alle Plattformen – Kontaktstelle für Behörden (Art. 11) und Nutzer (Art. 12), AGB-Transparenz (Art. 14), Melde-/Abhilfeverfahren (Art. 16). Die Zusatzpflichten Art. 20–28 **entfallen** für Kleinunternehmen (Art. 19). | **Niedrig–mittel** – Durchsetzung bei Kleinstplattformen bisher selten, Pflicht besteht aber | Behördliche Anordnung; Bußgeld (theoret. bis 6 % Umsatz) | Kontaktstellen benennen, Notice-and-Action-Weg + AGB-Transparenz ergänzen (Entwurf) | DSA: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32022R2065 |
| 9 | **Fernmeldebüro** (AT), **Landes-DSB** (DE) | Tracking-Cookies/Pixel ohne gültige Einwilligung: AT **§ 165 Abs. 3 TKG 2021**, DE **§ 25 TDDDG**. | **Niedrig–mittel** – Consent ist bereits vorgeschaltet, Restrisiko bei Umsetzung (Ablehnen muss so leicht wie Zustimmen sein) | Verwaltungsstrafe; DE Bußgeld bis 300.000 € | Opt-in beibehalten, Ablehnen gleichwertig, nichts vor Zustimmung laden (ist umgesetzt) | § 25 TDDDG: https://www.gesetze-im-internet.de/ttdsg/__25.html · TKG 2021: https://www.ris.bka.gv.at/ |
| 10 | **Bezirksverwaltungsbehörde**; Mitbewerber (UWG) | Betrieb eines gewerblichen Vermittlungsmarktplatzes braucht in AT voraussichtlich eine **Gewerbeanmeldung** (freies Gewerbe, GISA-Eintrag, § 340 GewO). | **Unklar** – hängt davon ab, ob bereits angemeldet | Verwaltungsstrafe bei Gewerbe ohne Berechtigung; UWG-Abmahnung | Falls nicht geschehen: freies Gewerbe anmelden – **WKO-Gründerservice** | GISA/GewO: https://www.bmwet.gv.at/Themen/Unternehmen/GISA_Gewerbeinformationssystem/GISA_Verfahren.html |
| 11 | **Mitbewerber, Schutzverband** (AT § 2 UWG) | Unbelegte Spitzenstellungswerbung wie „#1 Personal Trainer Plattform" ist irreführend; Beweislast trägt der Werbende. | **Mittel, falls verwendet** (z. B. im Instagram-Profil) | Unterlassungs-/Beseitigungsklage, einstweilige Verfügung | Aussage weglassen oder durch belegbare, nachprüfbare Aussage ersetzen | § 2 UWG: https://www.jusline.at/gesetz/uwg/paragraf/2 |
| 12 | **Verbraucher-Kunden** (AT FAGG/KSchG; DE §§ 312 ff. BGB) | Ob der **kostenlose** Kundenaccount – bei dem der Kunde mit personenbezogenen Daten „zahlt" – Widerrufs-/Informationspflichten auslöst, ist offen (DE § 312 Abs. 1a BGB). Für zahlende **Trainer** (Unternehmer) greift kein Verbraucherwiderruf. | **Unklar** | Bei Pflicht: Widerrufsbelehrung nötig, sonst Fristverlängerung/Abmahnung | Anwaltlich klären; vorsorglich Kunden-Infopflichten FAGG-/BGB-konform gestalten | FAGG: https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40162349/NOR40162349.html · § 312 BGB: https://www.gesetze-im-internet.de/bgb/__312.html |

---

## Fragen an den Anwalt (ungeklärt, nicht geraten)

1. **Meta-Pixel + Conversions API:** Braucht es einen Joint-Controller-Vertrag mit
   Meta (Art. 26 DSGVO)? Welche Transfergrundlage (DPF/Standardklauseln) gilt zum
   Stichtag für Pixel **und** CAPI (EU **und** Schweiz)? Genauer Wortlaut der
   Datenschutzerklärung dazu.
2. **USt / Kleinunternehmer:** Darf „inkl. USt" stehen, oder Kleinunternehmer-
   Hinweis? Zusammenspiel Kleinunternehmerbefreiung mit grenzüberschreitendem B2B
   (Reverse Charge AT→DE, CH-Bezugsteuer, UID-/ZM-Pflicht) – **Steuerberater**.
3. **Gewerbeberechtigung:** Ist eine Gewerbeanmeldung nötig, und mit welchem
   genauen Wortlaut (freies Gewerbe)? – WKO-Gründerservice/Gewerbebehörde.
4. **CH-Vertreter (Art. 14 DSG):** Erreicht die Bearbeitung von Schweizer
   Nutzerdaten „umfangreich + regelmässig + hohes Risiko" (ggf. durch
   Gesundheits-/Trainingsdaten), sodass ein Schweizer Vertreter zu bestellen ist?
5. **Gratis-Kunden & Widerruf:** Löst der datenfinanzierte Gratis-Account
   Widerrufs-/Informationspflichten aus (AT FAGG, DE § 312 Abs. 1a BGB)?
6. **E-Mail-Grenze:** Ab welchem Wortlaut werden Erinnerungs-/Wartelisten-Mails
   von zulässiger Transaktionsmail zu einwilligungspflichtiger Werbung?
7. **P2B-Stabilität:** Es gibt einen EU-Vorschlag vom 19.11.2025 („Digital
   Omnibus"), die P2B-VO aufzuheben – Verfahren offen, bis dahin gilt sie. Am
   EU-Amtsblatt verifizieren.
8. **Gesetzesnovellen 2025/2026** (UWG-Fassung, FAGG BGBl. I 59/2026 ab
   01.10.2026, KSchG BGBl. I 110/2025 ab 01.01.2026): am Stichtag in der
   RIS-Konsolidierung gegenprüfen.
9. **Haftungsbegrenzung Umfang:** Wie weit darf die Haftung für leichte
   Fahrlässigkeit (außerhalb Kardinalpflichten) wirksam begrenzt werden – AT vs.
   DE vs. CH?

---

### Quellenhinweis
Die EUR-Lex-Links (DSGVO, P2B, DSA, Rom I, Brüssel Ia) und die fedlex-Links (CH)
rendern im automatischen Abruf teils nur per JavaScript, sind aber die offiziellen,
gültigen Adressen und im Browser aufrufbar. Für wörtliche Zitate einzelner
Paragraphen die jeweils verlinkte Einzelnorm direkt öffnen (RIS „Gesamte
Rechtsvorschrift" statt der jusline-Sekundäranzeige).
