# Schluss-Rundgang (Baustein 8)

Stand: 31.10.2026. Zweig `ausbau-okt`.

## Was wirklich durchgeklickt wurde

Playwright ist in diesem Projekt **nicht** eingerichtet (kein Node/npm, die Tests
laufen mit Deno). Ein echter End-to-End-Durchlauf mit Registrierung,
Profilspeichern und Anfrage braucht außerdem eine **Datenbank mit den neuen
Spalten** – die Migrationen dieses Laufs sind aber absichtlich **nicht
eingespielt**, und gegen die Live-Datenbank darf der Rundgang nicht laufen.
Deshalb wurde der Rundgang **im eingebauten Browser gegen eine lokale Kopie der
Seiten** gemacht, mit **nachgestellten (gemockten) Supabase-Antworten** – so
lässt sich die Darstellung und das Verhalten der Oberfläche prüfen, ohne Daten
zu schreiben.

Tatsächlich im Browser geprüft (Screenshots in diesem Ordner):

1. **Suche mit Matching (1440 px)** – `01-suche-matching-1440.jpg`
   Die neuen Filter (Sprache, Trainingsort) und der 4-Fragen-Fragebogen
   (Baustein 5) sind da; die Ziel-Frage zeigt die **erweiterten
   Spezialisierungen** (Baustein 2).
2. **Matching-Ergebnis** – `02-suche-ergebnis-matching.jpg`
   Nach „Yoga / Online / Wochenende" steht die passende Trainerin oben
   („Deine passendsten Trainer stehen oben."). Die Karten tragen das **echte
   Verifiziert-Abzeichen** bzw. **„Neu"** (Baustein 4), nicht mehr das pauschale.
3. **Profil mit Abzeichen (Baustein 4)** – `03-profil-abzeichen.jpg`
   Verifiziert, „Neu auf Vexfit", „Antwortet meist in 3 Std"; der
   Vorstellungs-Abschnitt (Video) und die neuen Spezialisierungen sind sichtbar.
   Für nicht angemeldete Besucher bleibt die Anfrage hinter „Anmelden".
4. **John-Harris-Aufsteller (Druck, Baustein 1j)** – `04-john-harris-aufsteller.jpg`
   A5-Aufsteller mit selbst erzeugtem QR-Code (geprüft per Rück-Dekodierung mit
   jsQR, siehe unten), „Partner von John Harris", gelbes V.
5. **John-Harris-Vorschau (1440 px, Baustein 1)** – `05-john-harris-vorschau-1440.jpg`
   Vorschau-Band, Standorte mit Platzhalter-Adressen „HIER EINFÜGEN",
   **Beispielprofile** nur in der Vorschau.
6. **John-Harris mobil (390 px)** – `06-john-harris-mobil-390.jpg`
   Einspaltig, kein horizontales Scrollen.

### QR-Code echt geprüft
Der selbst gebaute QR-Erzeuger (`vexfit-qr.js`, ohne externen Dienst) wurde im
Browser gegen den bekannten Decoder **jsQR** rück-dekodiert: die erzeugten Codes
für mehrere Vexfit-Links (Versionen 1, 2, 4, 8) liefern exakt den Original-Link
zurück. Zusätzlich prüft `vexfit-qr_test.ts` Format-/Versionsinfo gegen die
Norm-Konstanten und die Reed-Solomon-Syndrome.

## Was NICHT durchgeklickt wurde (und warum)
- **Echte Registrierung, Profilspeichern, Anfrage, Zahlung, Einladungs-Einlösung,
  Zertifikat-Upload**: schreiben in die Datenbank bzw. brauchen die neuen Spalten.
  Ohne eingespielte Migrationen und ohne Test-Datenbank nicht ausführbar; gegen
  die Live-Datenbank ausdrücklich verboten. Diese Abläufe sind stattdessen mit
  verhaltensnahen Tests abgesichert (Deno-Tests je Baustein) und die Oberfläche
  ist mit gemockten Daten geprüft.
- **Admin-Reiter (Baustein 7)**: admin.html verlangt das Admin-Konto und die
  neuen Admin-Funktionen in der Datenbank. Struktur mit `admin_studios_test.ts`
  geprüft, Oberfläche nicht live geklickt.

## Empfehlung für einen echten Durchlauf
Sobald die Migrationen in einer **Test-/Staging-Datenbank** eingespielt sind
(nicht Live), kann der komplette Klick-Durchlauf dort gefahren werden – am
besten mit einem frischen Testkonto. Die Schritte stehen in der Aufgabe
(Baustein 8) und oben.
