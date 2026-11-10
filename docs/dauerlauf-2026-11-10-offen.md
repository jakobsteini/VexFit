# Dauerlauf „Alles Offene" – 10.11.2026

Ziel: Bis heute 16 Uhr ist alles Offene im Code erledigt oder als BLOCK benannt,
damit Vexfit in Salzburg die erste echte Kundenanfrage verarbeiten kann.
Baustein für Baustein, jeder Baustein ein eigener Commit. Protokoll laufend hier.

Pflichtregeln: keine Rückfragen (BLOCK statt Raten), Migrationen nur als Datei
(mit Rücknahme), kein Einspielen/Deploy/Push, keine echten Mails, keine
öffentlichen personenbezogenen Daten, keine Geheimnisse committen.

---

## E0 – Bestandsaufnahme (Doku-Commit)

- Offene Punkte gesammelt → `docs/offen-2026-11-10.md` (Zuordnung
  erledigt / in diesem Lauf / Jakob / BLOCK).
- Git zu Beginn: `HEAD` = `origin/main` = `9e3b6ca`, nichts Ungepushtes;
  untracked nur `marke/*` (Binärdateien, nicht committen).
- Geplante Bausteine E1–E8: siehe `docs/offen-2026-11-10.md` Abschnitt A.
- **Commit:** nur Doku (dieses Protokoll + offen-Liste).

### Angekündigt für die folgenden Bausteine

| Baustein | Migration? | Commit? |
|----------|-----------|---------|
| E1 Anfrage-Weg absichern | voraussichtlich nein | ja |
| E2 Trainer-Standort | wahrscheinlich ja (PLZ-Spalten/Pflicht) | ja |
| E3 Herkunft messen | wahrscheinlich ja (Herkunftsspalten) | ja |
| E4 Salzburg einheitlich | nein | ja |
| E5 Freigabe nicht vergessen | nein | ja |
| E6 Kunden-Weg Salzburg | nein | ja |
| E7 Gesamttest | nein | ja (falls Änderungen) |
| E8 Offen-Liste Endstand | nein | ja (Doku) |

(Die tatsächliche Migrationsentscheidung wird pro Baustein vor dem Commit
bestätigt – Grundsatz: so wenig DB-Änderung wie möglich, nur als Datei.)
