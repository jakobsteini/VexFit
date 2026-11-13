# Dauerlauf „Bereit für 19.11." (G0–G8) · 2026-11-13

Ziel: Erscheint am **19.11.2026** ein Artikel über Jakob (z. B. sn.at /
Flachgauer Woche), landen Leser auf einem einfachen **Wunsch-Formular**
(`/wunsch.html`) statt vor einer Registrierungs-Mauer. Jakob kann jeden Wunsch
am selben Abend an einen Trainer im Raum Salzburg vermitteln.

Arbeitsordner: `/Users/js/Projekte/Vexfit/app/vexfit`.
Regeln: kein `git push`, Migrationen nur als Datei (mit Rücknahme), kein Deploy,
keine echten Mails/Anzeigen/Zahlungen, pro Baustein Typprüfung + Linter + alle
Tests, nur bei Grün committen. BLOCK statt Raten.

Werkzeuge (Baseline vor dem Lauf):
- Tests: `deno test --allow-read --allow-run --allow-env` → **831 passed, 0 failed**.
- Typprüfung: `deno check supabase/functions/vexfit-automation/index.ts` → grün.
- Linter: `deno lint` → **30 Probleme (Baseline, alle vorbestehend)**, keine neuen.

---

## G0 – BESTAND (nur Doku)

### Git-Stand
- Branch `main`. **`git log origin/main..HEAD` ist NICHT leer:** ein ungepushter
  Commit `dc5f884` „Umkreis-Suche serverseitig dicht (Weg B mit
  Zwischenspeicher, 12.11.)". `origin/main` steht auf `6e36b79` (Memory-Stand
  12.11. war HEAD=6e36b79 ungepusht; inzwischen wurde 6e36b79 gepusht und dc5f884
  obendrauf gesetzt). Also: **1 Commit ungepusht, Startpunkt dieses Laufs = `dc5f884`.**
- Untracked (NICHT Teil dieses Laufs, bleibt liegen): `marke/*.pdf`,
  `marke/vexfit-logo-web-228x88.jpg`.

### Migrationen (laut Dateien in `migrations/`)
- Letzte Datei: **`2026-11-12-01-suche-umkreis.sql`** (+ Rücknahme in
  `migrations/ruecknahmen/`). Legt `trainers.lat/lng` an, entzieht anon den
  Lesezugriff auf `trainers_vorschau`/`trainers_oeffentlich`, SECURITY-DEFINER-
  RPCs `suche_trainer_umkreis`/`trainer_profil`, Tabelle `plz_orte`.
- Ob eingespielt: hier **nicht prüfbar** (kein DB-Zugriff). Laut Memter-Stand
  12.11. war 2026-11-12-01 noch NICHT eingespielt → **BLOCK/Jakobs Aufgabe**.
- Edge `vexfit-automation` hat seit 12.11. die Aktionen `koordinaten_setzen`/
  `trainer-suche`/`trainer-profil`; laut Memory 12.11. **noch nicht deployt** →
  Jakobs Aufgabe.

### Ablauf Kundensuche seit `dc5f884` (Weg B)
1. `suche.html`: nicht angemeldet → `zeigeAnonGate()` (Suchleiste verborgen,
   `#anonGate` mit „Trainer findest du als Mitglied", Knöpfe Registrieren/Anmelden).
   **Kein** Trainer-Netzaufruf.
2. Angemeldet → POST `…/vexfit-automation/trainer-suche` mit `{ plz, land,
   schwerpunkt }` + Token. Server löst die PLZ serverseitig auf (Zwischenspeicher
   `plz_orte`, sonst zippopotam), fester Umkreis **25 km** (`UMKREIS_KM`), gleiches
   Land, nur freigegebene, nicht gesperrte, nicht-Test **Vor-Ort-Trainer mit
   lat/lng**. Keine Online-Trainer, kein Rückfall.
3. Treffer → Karten (Entfernung in km). Keine Treffer → ehrliche Leerseite
   („Noch kein Trainer in 25 km …") + Vormerkung `#naeheHinweis`.
4. `profil.html`: anon → Gate (noindex). Angemeldet → `/trainer-profil`-RPC,
   nur wenn Trainer ≤ 25 km um die zuletzt gesuchte Mitte ODER bereits angefragt.
- **Öffentlich sieht niemand Trainerdaten** (kein Name, keine Karte, kein Ort,
  keine Anzahl). `vexfit-config.js OEFFENTLICHE_VORSCHAU=false`.
- `stadtseiten.mjs` ist **STILLGELEGT** (keine Trainer-Stadtseiten mehr, Sitemap
  ohne Trainerprofile).

### Einstiegspunkte für Kunden (Ist-Zustand, mit Ziel-URL)
| Quelle | Element | Ziel-URL (heute) |
|---|---|---|
| `index.html` (Startseite) | „Trainer finden →" (mehrfach, Hero/Menü/Band/Footer) | `registrieren.html?typ=kunde` |
| `personal-trainer-salzburg.html` | „Trainer in Salzburg finden →" (2× CTA) | `suche.html?plz=5020&land=AT` |
| `suche.html` | Anon-Gate (`#anonGate`) | `registrieren.html?typ=kunde` / `login.html?typ=kunde` |
| `suche.html` | Leerseite (`#emptyState`, keine Treffer-Fall) | Benachrichtigungs-Formular (trainer_alerts) |
| `suche.html` | Trainerkarte, nicht angemeldet (`kontaktKnopf`) | `registrieren.html?typ=kunde` |
| Stadtseiten | STILLGELEGT – keine mehr | – |
| `kunden-bereich.html` | geführter Einstieg (Umkreissuche, nur angemeldet) | intern (`/trainer-suche`) |
| `trainer.html` | „Profil gratis erstellen →" | `registrieren.html?typ=trainer` (für Trainer, nicht Kunden) |

**Toter Einstieg „Online":** Seit `dc5f884` liefert die Suche keine
Online-Trainer mehr (`trainingsort in (vor_ort,beides)`, Online-Abschnitt
unerreichbar). In `suche.html` existieren weiterhin eine „Online"-Matching-Kachel
und Online-Abschnitts-Code (`#ortFilter`, `renderErgebnis`-Online-Zweig), die
nie mehr etwas zeigen. → in G3 bereinigen/umleiten.

### Schlussfolgerung für den Lauf
Es gibt heute **keinen Weg**, bei dem ein Besucher OHNE Konto einen Wunsch
hinterlassen kann. Genau diese Lücke schließt G1 (`/wunsch.html`). G3 lenkt alle
öffentlichen Einstiege darauf.
