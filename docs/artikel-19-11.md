# Artikel-Banner scharf schalten (19.11.2026)

Sobald der Artikel über Jakob online ist (z. B. auf **sn.at** oder **Flachgauer
Woche**), wird auf der Startseite und auf `/wunsch.html` ein dezenter Hinweis
„Bekannt aus der Flachgauer Woche / SN.at – zum Artikel" mit Link sichtbar.

## Genau EINE Zeile ändern

In der Datei `vexfit-config.js` die Zeile

```
    ARTIKEL_URL: "",
```

ersetzen durch die **volle https-Adresse** des Artikels, z. B.

```
    ARTIKEL_URL: "https://www.sn.at/der-echte-artikel-link",
```

(Nur `https://` wird akzeptiert. Leer lassen = kein Banner.)

## Dann veröffentlichen

```bash
cd /Users/js/Projekte/Vexfit/app/vexfit && git add vexfit-config.js && git commit -m "Artikel-Banner aktiviert" && git pull --rebase origin main && git push origin main
```

Danach die Startseite bzw. `/wunsch.html` neu laden – der Hinweis erscheint. Zum
Ausblenden wieder auf `ARTIKEL_URL: ""` setzen und erneut pushen. Es werden keine
Logos fremder Medien eingebunden, nur der Text mit Link.
