# Entwurf: Datenschutz-Passage „Öffentliche Trainerprofile" (07./08.11.2026)

> **ÜBERHOLT seit 12.11.2026.** Jakob hat die öffentliche Vorschau wieder
> ABGESCHALTET: nicht angemeldete Besucher sehen keine Trainerdaten mehr
> (`OEFFENTLICHE_VORSCHAU = false`, anon-Lesezugriff entzogen). Dieser Entwurf
> einer Datenschutz-Passage für öffentliche Profile wird damit **nicht** mehr
> gebraucht. Er bleibt nur als Historie stehen. Die Live-Erklärung in
> `rechtliches.html` sollte (BLOCK, Jakob) bestätigen, dass Trainerprofile nur
> angemeldeten Kundinnen/Kunden gezeigt werden – falls preview-bezogene Sätze
> eingepflegt worden wären, sind sie zu entfernen.

**Status: ENTWURF – NICHT live übernommen.** Entscheidung liegt bei Jakob.
Grund: Mit der am 07.11.2026 eingeschalteten öffentlichen Vorschau
(`OEFFENTLICHE_VORSCHAU = true`) sind Trainerkarten jetzt **ohne Anmeldung**
sichtbar. Die aktuelle Datenschutzerklärung in `rechtliches.html` (Abschnitt
„WELCHE DATEN WIR SAMMELN") erwähnt zwar „Profilinformationen (Trainer)", sagt
aber **nicht**, dass diese öffentlich – auch für nicht angemeldete Besucher und
Suchmaschinen – angezeigt werden. Das sollte vor dem Live-Gang ergänzt werden.

## Was tatsächlich öffentlich ausgeliefert wird (Beleg aus dem Code)
Strenge Sicht `public.trainers_vorschau`
(`migrations/2026-11-08-01-trainers-vorschau.sql`), gelesen von `suche.html` für
nicht angemeldete Besucher. Nur **freigeschaltete** (`aktiv = true`) und **nicht
gesperrte** Trainer. Felder:
- Vorname
- Nachname **nur als Initiale** (z. B. „M.") – der volle Nachname verlässt die
  Datenbank nicht
- Ort (Stadt + PLZ-Region) und Land – **keine genaue Adresse**
- Schwerpunkte / Trainingsart / Trainingsorte / Sprachen
- Kurzbeschreibung (Bio)
- Preis pro Stunde (kein Monatspreis)
- Profilfoto
- Verifizierungs-Status, grobe Verfügbarkeit, Anlegedatum

**Nicht** öffentlich: voller Nachname, E-Mail, Telefon, user_id, Monatspreis,
Zertifikate, Calendly, Zahlungsstatus. Kontaktaufnahme/Anfrage bleibt hinter der
Kurz-Anmeldung.

## Vorschlag für den zusätzlichen Absatz in der Datenschutzerklärung
> **Öffentliche Trainerprofile.** Wer sich als Trainer registriert und von Vexfit
> freigeschaltet wird, willigt ein, dass ein eingeschränktes Profil öffentlich –
> also auch ohne Anmeldung und für Suchmaschinen auffindbar – angezeigt wird.
> Öffentlich sichtbar sind: Vorname und abgekürzter Nachname (Initiale),
> Profilfoto, Schwerpunkte, Trainingsart und -orte, Sprachen, eine
> Kurzbeschreibung, Ort (Stadt/Region, keine genaue Adresse) und der Preis pro
> Stunde. Nicht öffentlich sind der volle Nachname, E-Mail-Adresse,
> Telefonnummer und Zahlungsdaten. Rechtsgrundlage ist die Einwilligung des
> Trainers (Art. 6 Abs. 1 lit. a DSGVO) sowie die Vertragserfüllung zur
> Vermittlung (lit. b). Der Trainer kann die Freischaltung jederzeit beenden;
> das Profil wird dann aus der öffentlichen Anzeige entfernt.

## Offene Punkte für Jakob
- Passage in `rechtliches.html` (Tab „Datenschutz") übernehmen – juristisch
  prüfen (Formulierung, Rechtsgrundlage).
- Prüfen, ob die AGB/Trainer-Einwilligung die öffentliche Anzeige bereits
  abdecken; falls nicht, dort ebenfalls ergänzen.
- Stand-Datum der Datenschutzerklärung aktualisieren (aktuell „Mai 2026").
