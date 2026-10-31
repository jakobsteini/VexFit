# Rundgang „Letzter Schliff vor Ads-Start" (Zweig vor-ads-fix)

Stand: 31.10.2026.

## Playwright-Status (wichtig)

Das geforderte Ablaufskript liegt als `rundgang/vor-ads-rundgang.mjs` bereit und
ist vollständig (lokaler Server + `page.route`-Mocks für alle `*.supabase.co`-
Aufrufe, Abläufe a–d bei 390 px und 1440 px, Exit-Code ≠ 0 bei Fehlschlag).

**Playwright ist in diesem Projekt aber nicht eingerichtet** (kein
`package.json`/`node_modules`, kein globales Playwright, kein Browser-Cache – die
automatischen Tests laufen mit Deno). Die Sitzungsregel verbietet eine
Neuinstallation. Das Skript wurde deshalb **nicht mit Playwright ausgeführt**.
Einrichten und starten kann man es so:

```bash
cd /Users/js/Projekte/Vexfit/app/vexfit
npm init -y && npm i -D playwright && npx playwright install chromium
node rundgang/vor-ads-rundgang.mjs
```

## Stattdessen tatsächlich geprüft

1. **Deno-Tests** `vor_ads_test.ts` (12 Tests) decken die Logik ab: die EINE
   Profilberechnung `profilAuswertung()` (leeres Profil, nur Pflichtpunkte,
   alles außer Foto, Kurztext 9 vs. 10 Zeichen, 100 %), den Wegfall von
   `btnAvatarUpload`, den Sofort-Upload-Aufruf und alle Teil-C-Texte.

2. **Eingebauter Browser gegen die lokal ausgelieferten Seiten** (Deno-Dateiserver
   auf Port 8099), je bei **390 px und 1440 px** – ohne DB-Schreibzugriff:
   - `index.html`: neuer Hero „Finde in 2 Minuten den **passenden** Personal
     Trainer – lokal oder online. Direkt anfragen.", kein „verifiziert" mehr im
     ganzen Dokument; kein horizontales Scrollen; keine Konsolenfehler.
   - `registrieren.html`: Trainer-Formular zeigt „**Monatlich kündbar**",
     Kunden-Formular weiter „**Kein Abo**"; kein Overflow.
   - `login.html`, `suche.html`: laden ohne Konsolenfehler, kein Overflow;
     `suche.html` enthält keine pauschale „verifizierte Trainer"-Aussage.
   - Am Handy (390 px) das **Menü geöffnet und wieder geschlossen** (Startseite).

   Screenshots: `vor-ads-index-1440.jpg`, `vor-ads-index-390.jpg`,
   `vor-ads-menue-390.jpg`, `vor-ads-registrieren-390.jpg`.

## Was NICHT im eingebauten Browser geprüft wurde

Die angemeldeten Trainer-Abläufe (Avatar-Sofort-Upload mit echtem `setInputFiles`,
die drei gleichen Prozentzahlen, orange/grüne Leiste) brauchen eine nachgestellte
Sitzung samt gemockten Supabase-Antworten. Das leistet das Playwright-Skript;
ohne Playwright wurde diese Logik über die Deno-Tests und die direkte Auswertung
der reinen Funktion abgesichert, nicht im echten Browser durchgeklickt.
