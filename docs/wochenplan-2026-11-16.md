# Wochenplan bis 30.11.2026 (Start Mo 16.11.)

Ziel: Wenn am **19.11.** der Artikel über Jakob erscheint, landen Leser auf dem
**Wunsch-Formular** (/wunsch.html), Jakob hat **3–5 Trainer im Raum Salzburg**
und schafft **bis 30.11. die erste angenommene Anfrage**. Nur aus Repo-Fakten und
den Entscheidungen des Dauerlaufs vom 13.11.; Unbekanntes als BLOCK.

## Mo 16.11. – scharf schalten (Technik)
1. **Migration einspielen:** `migrations/2026-11-13-01-wuensche.sql` im Supabase-
   SQL-Editor (Projekt `hbapzwxdehfgnputrfjf`) → Tabelle `wuensche`.
   - Hinweis: die ältere `2026-11-12-01-suche-umkreis.sql` (lat/lng, plz_orte,
     Umkreis-RPCs) ist laut Stand vom 12.11. **noch nicht eingespielt** → zuerst
     diese, sonst funktionieren Umkreissuche (angemeldet) und G6-km nicht. **BLOCK:
     ob 2026-11-12-01 inzwischen eingespielt wurde, ist hier nicht prüfbar.**
2. **Edge `vexfit-automation` deployen** (neuer Pfad `/wunsch` + Wünsche-Aktionen):
   `npx -y supabase@latest functions deploy vexfit-automation --no-verify-jwt
   --project-ref hbapzwxdehfgnputrfjf --use-api`.
3. **Pushen** (7 Commits aus diesem Lauf + 1 vom 12.11.): `git pull --rebase
   origin main && git push origin main`.
4. **Probe:** /wunsch.html im privaten Fenster absenden → interne Mail + Bestätigung
   prüfen → Verwaltung „Wünsche" → an einen Test-Trainer senden.

## Mo–Di 16./17.11. – Angebot aufbauen (Trainer)
5. **Trainer-Koordinaten nachtragen:** Verwaltung → „Koordinaten nachtragen (alle)".
   Ohne lat/lng liefern Umkreissuche UND G6-km (Raum Salzburg) zu wenig Treffer.
6. **3–5 Trainer im Raum Salzburg gewinnen:** Einladungslink + WhatsApp-Text aus
   `docs/texte/einladung-trainer-2026-11-13.md` an echte Trainer schicken. Fortschritt
   im Abendbericht: Zeile „Trainer über persönliche Einladung" und „Raum Salzburg
   (≤25 km)". Ziel Richtung `SALZBURG_ZIEL = 8` starke Profile, mindestens 3–5 frei.

## Mi–Fr 18.–19.11. – Artikel
7. **Artikel-Banner scharf schalten (ab Erscheinen):** `ARTIKEL_URL` in
   `vexfit-config.js` auf die echte Artikel-Adresse setzen und pushen
   (`docs/artikel-19-11.md`). Vorher leer lassen.
   - **BLOCK:** genaues Medium/Datum/URL des Artikels ist nicht bekannt – Jakob
     trägt die echte Adresse ein, sobald sie da ist. Keine erfundene URL.

## bis 30.11. – erste Vermittlung
8. **Wünsche am selben Abend vermitteln:** eingehende Wünsche in der Verwaltung an
   den passenden Trainer senden (≤25 km). Nimmt ein Trainer an (Stripe-Zahlung),
   greift die bestehende Zahlungslogik → Wunsch auf „vermittelt" setzen.
9. **Ziel:** mindestens **eine angenommene Anfrage** bis 30.11.

## Rechtliches (vor dem Scharfschalten)
10. **Datenschutz-Ergänzung fürs Wunsch-Formular:** Entwurf in
    `docs/recht/entwurf-wunsch-2026-11-13.md` prüfen und in `rechtliches.html`
    einarbeiten (bzw. durch Jakob/rechtliche Prüfung freigeben).
    - **BLOCK:** Rechtstexte wurden im Lauf NICHT selbst geändert; der Entwurf ist
      ein Vorschlag, kein verbindlicher Rechtstext.

## Nicht in diesem Zeitraum / offen (BLOCK)
- Teil B der Umkreis-Suche (kunden-bereich-Umbau + verschärfte Policy) – aus
  früheren Läufen offen, nicht Teil dieses Plans.
- Automatisches Setzen von „vermittelt" bei Zahlung (derzeit manuell in der
  Verwaltung) – bewusst klein gehalten.
