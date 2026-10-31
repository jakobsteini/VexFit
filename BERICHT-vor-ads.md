# Abschlussbericht — „Letzter Schliff vor Ads-Start"

Zweig **vor-ads-fix** (ausgehend von `main` = `bef2f71`). **Nichts gepusht, keine
Migration, nichts deployt.** 4 Commits (je ein Teil A–D):

- `ac2ee66` Teil A: Profilbild sofort hochladen
- `6a4d1b3` Teil B: Eine einzige, stimmige Profil-Anzeige
- `75291b4` Teil C: Werbeaussagen ehrlich stellen
- `aa3caf0` Teil D: automatische Tests + Ablauf-Rundgang

---

## Was geändert wurde (je Datei)

### Teil A — Profilbild sofort hochladen
- **/Users/js/Projekte/Vexfit/app/vexfit/trainer-bereich.html**
  - Vorher: „Bild auswählen" + separater Knopf **Hochladen** (`btnAvatarUpload`),
    Upload erst nach zweitem Klick.
  - Jetzt: der Hochladen-Knopf ist weg. Das `change`-Ereignis von `#fAvatar`
    prüft Format/Größe (JPG/PNG/WebP, höchstens 5 MB), zeigt die Vorschau sofort
    und ruft **direkt `uploadAvatar()`** auf. Während des Uploads: Vorschau
    abgedunkelt (`.avatar-preview.laedt`), darunter „Wird hochgeladen …",
    „Bild auswählen" gesperrt. Erfolg: Toast „✓ Profilbild gespeichert",
    `T.avatar_url` aktualisiert, `updateDots()` (Profilstärke) sofort neu. Fehler:
    alte Vorschau zurück + bestehende Fehlermeldung.
- **profil-bearbeiten.html**: hat **keinen** Avatar-Zwei-Schritt-Ablauf (nur
  Galerie/Zertifikat, die ohnehin automatisch hochladen) → **keine Änderung**.

### Teil B — eine einzige, stimmige Profil-Anzeige
- **/Users/js/Projekte/Vexfit/app/vexfit/trainer-bereich.html**
  - Neue, DOM-freie, reine Funktion **`profilAuswertung(p)`** zwischen den Markern
    `==KERN-ANFANG==`/`==KERN-ENDE==` (wie in `suche.html`). Sie teilt in
    **„Nötig für die Suche"** (genau die Bedingungen der Sicht `trainers_oeffentlich`
    aus `migrations/2026-10-31-05-verfuegbarkeit.sql`: Foto, Kurztext, ≥ 1
    Spezialisierung) und **„Macht dein Profil stärker"** (Trainingsart, Preis,
    Erfahrung, Trainingsort, Telefon, Vorstellungsvideo, Galerie, Sprachen,
    Trainingsorte, Zertifikat). **Prozent = erfüllte / alle (13) Punkte.**
  - `aktuellesProfil()` baut das Profil aus Formular + Datensatz `T` und speist
    diese **eine** Zahl in: Balken (`pctLabel`/`progressFill`), Übersicht oben
    (`ubProfil`), Profilstärke-Karte, Nav-Punkt (`navProfilDot`) und die
    Weiterleitung (`profileComplete = a.vollstaendig`).
  - **Kurztext** zählt jetzt **überall** ab **10 Zeichen ohne Rand**
    (`bio.trim().length >= 10`) — passend zum Hinweis „Mind. 10 Zeichen" (vorher
    `> 10`).
  - **Genau eine Zeile** unter „Meine Anfragen": Pflichtpunkt fehlt → orange
    „Dein Profil erscheint noch nicht in der Suche. Es fehlt: …" (+ Link); sonst
    < 100 % → grüne Leiste „Profil vervollständigen für mehr Sichtbarkeit";
    bei 100 % keine Zeile. Der **Freigabe-Hinweis** („… wird noch geprüft …",
    an `trainers.aktiv`) bleibt **unabhängig** in der Statusleiste.
  - Die Profilstärke-Karte ist die **eine** Checkliste (gruppiert „Nötig für die
    Suche" / „Macht dein Profil stärker"). Die frühere doppelte „Es fehlt noch"-
    Liste in der Übersicht entfällt.

### Teil C — Werbeaussagen
- **registrieren.html**: Trainer-Formular (`#formTrainer`) „Kein Abo" →
  **„Monatlich kündbar"** (AGB §3: Abo verlängert sich, kündbar zum Monatsende).
  Kunden-Formular (`#formClient`) behält **„Kein Abo"**.
- **index.html**: Hero „den **perfekten** … **Verifiziert.** Direkt anfragen." →
  „den **passenden** … Direkt anfragen."; „Durchsuche **verifizierte** Trainer …"
  → „Durchsuche Trainer …"; „**Verifizierte** Trainer in deiner Nähe" → „Trainer
  in deiner Nähe". (index.html enthält jetzt nirgends mehr „verifiziert".)
- **suche.html** + **profil.html**: pauschale „verifizierte(n) Personal Trainer"
  aus den Meta-Beschreibungen (`description`/`og`/`twitter`) entfernt.
- **john-harris.html**: das bisher **pauschale** „Verifiziert ✓" auf den
  Trainerkarten hängt jetzt an **`t.verifiziert === true`** (wie in
  `suche.html`/`profil.html`).
- **vexfit-ad-neugier.html** + **vexfit-ad-schmerz.html**: `robots` von
  „noindex" auf **„noindex, nofollow"**. **sitemap.xml** führte keine Ad-Seite →
  nichts zu entfernen.
- **Nicht angetastet**: das echte Abzeichen „Verifiziert ✓" bei `verifiziert = true`
  (suche.html, profil.html) und die Admin-Ansicht.
- Zwei **Test-Wächter** spiegelten die alten Vorgaben und wurden auf die neue,
  bewusste Vorgabe umgestellt: **fix6_test.ts** (index.html jetzt OHNE pauschales
  „verifizierte") und **seo_test.ts** (Ad-Seiten „noindex" ODER „noindex, nofollow").

### Teil D — Tests
- **vor_ads_test.ts** (neu, 12 Deno-Tests): siehe Testergebnis.
- **rundgang/vor-ads-rundgang.mjs** (neu): vollständiges Playwright-Ablaufskript.
- **rundgang/vor-ads-rundgang.md** + 4 Screenshots (neu).

---

## Ursache der grünen Leiste bei 100 % (Teil B Punkt 5)

Es gab **drei** unabhängige Berechnungen, die verschiedene Anzeigen fütterten:
`updateDots()` rechnete über **7 Felder ohne Foto** (Balken, Übersicht, Nav-Punkt
**und** die grüne Leiste), `renderProfilstaerke()` über **8 andere Punkte inkl.
Foto** (die angezeigte „Profilstärke"-Zahl). Die grüne Leiste „vervollständigen"
hing also an einer **anderen** Zahl als der, die der Trainer gerade sah — bei
„100 %" auf der einen Anzeige konnte die Leiste wegen eines fehlenden Feldes der
**anderen** Berechnung weiter stehen (und umgekehrt). Zusätzlich zählte der
Kurztext mit `> 10` statt `>= 10`, sodass ein 10-Zeichen-Text dauerhaft als
„fehlt" galt und die Leiste stehen ließ.

**Behoben:** eine einzige Funktion `profilAuswertung()` speist jetzt die Zahl
**und** die Leisten-Entscheidung. Die Leiste kann der angezeigten Zahl nicht mehr
widersprechen; bei `vollstaendig` (100 %) wird sie ausgeblendet.

---

## Testergebnis

- **Deno-Tests: 266 grün, 0 rot** (vorher 254; +12 aus `vor_ads_test.ts`).
  Reproduzierbar:
  ```bash
  cd /Users/js/Projekte/Vexfit/app/vexfit && deno test --allow-read --allow-run --allow-env
  ```
- **Typprüfung** `deno check supabase/functions/vexfit-automation/index.ts`: **grün**.
- **Linter** `deno lint` (51 Dateien, inkl. `rundgang/vor-ads-rundgang.mjs`): **grün**.
- **Playwright-Ablauf: nicht ausgeführt** — Playwright ist in diesem Projekt nicht
  eingerichtet (kein `package.json`/`node_modules`, kein globales Playwright; Regel:
  nicht neu installieren). Das Skript `rundgang/vor-ads-rundgang.mjs` ist
  vollständig und lauffähig, sobald Playwright da ist (Einrichtbefehl steht im
  Skriptkopf und in `rundgang/vor-ads-rundgang.md`).
- **Stattdessen geprüft (eingebauter Browser, lokal, ohne DB-Schreibzugriff), je
  390 px und 1440 px:**
  - `index.html` — neuer Hero, kein „verifiziert", kein Overflow, keine Konsolenfehler.
  - `registrieren.html` — Trainer „Monatlich kündbar", Kunde „Kein Abo", kein Overflow.
  - `login.html` — lädt, kein Overflow, keine Konsolenfehler.
  - `suche.html` — lädt, kein Overflow, keine Konsolenfehler, keine pauschale
    „verifizierte Trainer"-Aussage.
  - Handy (390 px): Menü geöffnet und wieder geschlossen.
  - Screenshots: `rundgang/vor-ads-index-1440.jpg`, `vor-ads-index-390.jpg`,
    `vor-ads-menue-390.jpg`, `vor-ads-registrieren-390.jpg`.
  - Die angemeldeten Trainer-Abläufe (Avatar-Sofort-Upload mit echter Datei, drei
    gleiche Prozentzahlen, orange/grüne Leiste) sind über die Deno-Tests und die
    direkte Auswertung der reinen Funktion abgesichert, **nicht** im Browser
    durchgeklickt (bräuchte Playwright + Mocks).

---

## Offene Punkte / Lücken (BLOCK STATT RATEN)

1. **Playwright nicht ausführbar.** Nicht installiert, Neuinstallation laut Regel
   untersagt → der Playwright-Rundgang wurde nicht gefahren. Ersatz: Deno-Tests +
   Browser-Rundgang der öffentlichen Seiten (siehe oben).
2. **„vollständig" = alle 13 Punkte.** Die Weiterleitung „Profil vollständig →
   direkt zu den Anfragen" und der grüne Nav-Punkt greifen jetzt erst bei 100 %
   **aller** Punkte (inkl. Video, Galerie, Sprachen, Trainingsorte, Zertifikat —
   die nur in `profil-bearbeiten.html` gepflegt werden). Das ist bewusst so (eine
   Zahl für alles, wie gefordert), bedeutet aber: wer nur die Kernfelder ausfüllt,
   wird nicht mehr automatisch zu den Anfragen geleitet und sieht weiter die grüne
   „vervollständigen"-Leiste (reine Ermutigung, kein Fehler). Falls du lieber die
   Weiterleitung schon bei erfüllten Pflichtpunkten („in der Suche sichtbar")
   möchtest, ist das ein Einzeiler (`profileComplete = a.inSuche`) — nicht
   entschieden, weil die Vorgabe „an derselben einen Zahl" lautete.
3. **Zwei ähnliche Punkt-Namen.** Die „stärker"-Liste enthält sowohl
   **„Trainingsort"** (Wo trainierst du: vor Ort/online/beides, Feld auf dieser
   Seite) als auch **„Trainingsorte"** (Studio/Outdoor/…, Feld in
   `profil-bearbeiten.html`) — beide standen in den bisherigen Listen und sind
   bewusst beibehalten. Die Namen sind nah beieinander; falls gewünscht, kann der
   plurale Punkt klarer benannt werden.
4. **entwuerfe/vexfit-ad-kunde.html** (Entwurfsordner) enthält noch „Kostenlos.
   Verifiziert." und kein `noindex`. Nicht angefasst, weil Entwürfe nicht verlinkt
   sind und der Baustein nur die beiden Root-Ad-Seiten nennt. Falls diese Entwürfe
   live gehen, dort dieselben zwei Änderungen (Aussage + noindex) nachziehen.

---

## Was Jakob selbst tun muss

Den Zweig prüfen und nach `main` übernehmen (ein fertiger Befehl, ohne Platzhalter):

```bash
cd /Users/js/Projekte/Vexfit/app/vexfit && git checkout main && git pull --no-rebase --no-edit && git merge vor-ads-fix && git push
```

Danach **https://vexfit.app/trainer-bereich.html** am Handy öffnen, ein Profilbild
wählen (muss **ohne weiteren Klick** gespeichert werden) und prüfen, dass oben, am
Balken und in der Karte **dieselbe Prozentzahl** steht.

---

```text
Zweig: vor-ads-fix (ab main bef2f71), NICHTS gepusht, keine Migration, nichts deployt
Commits: A ac2ee66 Avatar-Sofort-Upload · B 6a4d1b3 eine Profil-Zahl · C 75291b4 Werbeaussagen · D aa3caf0 Tests+Rundgang
Tests: 266 Deno grün (vorher 254, +12 vor_ads_test.ts); deno check + deno lint grün
Playwright: NICHT ausgeführt (nicht installiert, Regel: nicht neu installieren); Skript rundgang/vor-ads-rundgang.mjs liegt bereit
Browser-Rundgang (eingebaut): index/registrieren/login/suche @390+1440, Menü auf/zu, kein Overflow/keine Konsolenfehler
Dateien: trainer-bereich.html (A+B), registrieren/index/suche/profil/john-harris/2 Ad-Seiten (C), fix6_test+seo_test angepasst (C), vor_ads_test.ts + rundgang/* (D)
Offen: Playwright-Lauf; "vollständig"=alle 13 Punkte (Weiterleitung erst bei 100%); Punkte "Trainingsort"/"Trainingsorte"; entwuerfe/vexfit-ad-kunde.html
Merge: git checkout main && git pull --no-rebase --no-edit && git merge vor-ads-fix && git push
```
