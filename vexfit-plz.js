// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-plz.js
//
// Gemeinsame PLZ-Aufloesung fuer suche.html, registrieren.html,
// kunden-bereich.html und profil-bearbeiten.html. Wird als klassisches Skript
// VOR dem Seitenskript eingebunden und stellt window.vexPlz bereit.
//
// Regeln:
//   5 Ziffern  -> Deutschland (DE), eine Abfrage.
//   4 Ziffern  -> Oesterreich (AT) UND Schweiz (CH) parallel abfragen.
//                 genau ein Treffer -> dieser; zwei Treffer -> mehrdeutig,
//                 der Nutzer waehlt ueber zwei Knoepfe.
// Ergebnis je Ort: { stadt, land ('AT'|'DE'|'CH'), lat, lng }.
//
// Dienst: api.zippopotam.us (Laendercode klein in der Adresse). Damit dieselbe
// PLZ nicht mehrfach abgefragt wird, nimmt aufloesen() einen optionalen
// Zwischenspeicher (Map) entgegen.
//
// Land eindeutig fuehren (07.11.2026): Viele 4-stellige PLZ gibt es in AT UND
// CH (z. B. 5020 Salzburg vs. 5020 Wettingen/CH). Wird aufloesen() ein Land
// ('AT'|'DE'|'CH') mitgegeben, wird GEZIELT nur dieses eine Land abgefragt und
// das Ergebnis ist eindeutig. Ohne Land bleibt es beim bisherigen Verhalten
// (AT+CH parallel -> ggf. mehrdeutig, Rueckfrage). standardLand() leitet ein
// sinnvolles Vorgabe-Land ab, OHNE zu raten (nur eindeutige Quellen).
(function (global) {
  // Normalisiert einen Landwert auf 'AT'|'DE'|'CH' oder null (alles andere).
  function landNormal(x) {
    const s = String(x == null ? '' : x).trim().toUpperCase();
    return (s === 'AT' || s === 'DE' || s === 'CH') ? s : null;
  }

  // Leitet das Vorgabe-Land ab, OHNE zu raten. Reihenfolge:
  //   1) ausUrl       - expliziter ?land=-Parameter (Stadtseite setzt ihn)
  //   2) gespeichert  - letzte Wahl des Nutzers (localStorage)
  //   3) sprache      - Browser-Sprachraum, aber NUR eindeutige Regionskennungen
  //                     ('de-AT'->AT, '*-CH'->CH, 'de-DE'->DE). Bloesses 'de' ist
  //                     mehrdeutig (DE/AT/CH) -> null (Formular fragt dann nach).
  // Rueckgabe 'AT'|'DE'|'CH' oder null.
  function standardLand(opts) {
    opts = opts || {};
    const ausUrl = landNormal(opts.ausUrl);
    if (ausUrl) return ausUrl;
    const gespeichert = landNormal(opts.gespeichert);
    if (gespeichert) return gespeichert;
    const sprache = String(opts.sprache == null ? '' : opts.sprache).toLowerCase();
    const m = /-([a-z]{2})(?:[-_]|$)/.exec(sprache);
    const region = m ? m[1] : '';
    if (region === 'at') return 'AT';
    if (region === 'ch') return 'CH';
    if (region === 'de') return 'DE';
    return null;
  }

  async function einLand(landKlein, plz, fetchImpl) {
    try {
      const r = await fetchImpl('https://api.zippopotam.us/' + landKlein + '/' + plz);
      if (r && r.ok) {
        const d = await r.json();
        if (d && d.places && d.places.length > 0) {
          const p = d.places[0];
          return {
            stadt: p['place name'],
            land: landKlein.toUpperCase(),
            lat: parseFloat(p.latitude),
            lng: parseFloat(p.longitude),
          };
        }
      }
      return null; // Dienst erreichbar, aber PLZ dort unbekannt.
    } catch (_e) {
      return { netzfehler: true };
    }
  }

  // Loest eine PLZ auf. Rueckgabe:
  //   { stadt, land, lat, lng }            - eindeutig
  //   { mehrdeutig: true, optionen: [..] } - 4-stellig in AT und CH
  //   { netzfehler: true }                 - Dienst nicht erreichbar
  //   null                                 - ungueltig oder unbekannt
  async function aufloesen(plz, opts) {
    opts = opts || {};
    const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    const cache = opts.cache || null;
    const land = landNormal(opts.land); // 'AT'|'DE'|'CH' oder null
    plz = String(plz == null ? '' : plz).trim();

    // Cache-Schluessel land-bewusst: dieselbe 4-stellige PLZ liegt je Land
    // getrennt ('at:5020' != 'ch:5020'), ohne Land unter der blanken PLZ (so
    // bleiben bestehende Aufrufer ohne Land unveraendert).
    const cacheKey = (land ? land.toLowerCase() + ':' : '') + plz;
    if (cache && cache.has(cacheKey)) return cache.get(cacheKey);

    let ergebnis;
    if (/^\d{5}$/.test(plz)) {
      // 5 Ziffern sind eindeutig Deutschland; ein gewaehltes Land spielt keine
      // Rolle (DE wird ohnehin abgefragt).
      const de = await einLand('de', plz, fetchImpl);
      ergebnis = de && de.netzfehler ? { netzfehler: true } : (de || null);
    } else if (/^\d{4}$/.test(plz)) {
      if (land) {
        // Gezielt nur das gewaehlte Land -> eindeutig, keine Rueckfrage.
        const r = await einLand(land.toLowerCase(), plz, fetchImpl);
        ergebnis = r && r.netzfehler ? { netzfehler: true } : (r || null);
      } else {
        // Kein Land gewaehlt: AT und CH parallel. Zwei Treffer -> mehrdeutig
        // (Rueckfrage ueber auswahlKnoepfe), statt still zu raten.
        const beide = await Promise.all([
          einLand('at', plz, fetchImpl),
          einLand('ch', plz, fetchImpl),
        ]);
        const netz = beide.some((x) => x && x.netzfehler);
        const treffer = beide.filter((x) => x && !x.netzfehler);
        if (treffer.length === 2) ergebnis = { mehrdeutig: true, optionen: treffer };
        else if (treffer.length === 1) ergebnis = treffer[0];
        else ergebnis = netz ? { netzfehler: true } : null;
      }
    } else {
      ergebnis = null;
    }

    if (cache && ergebnis && !ergebnis.mehrdeutig && !ergebnis.netzfehler) {
      cache.set(cacheKey, ergebnis);
    }
    return ergebnis;
  }

  // Zeigt zwei Wahlknoepfe ("Stadt (LAND)") in zielEl an und ruft onWahl(ort)
  // mit dem gewaehlten Ort auf. Nur im Browser verwendbar (DOM).
  function auswahlKnoepfe(optionen, zielEl, onWahl) {
    if (!zielEl) return;
    zielEl.innerHTML = '';
    const frage = document.createElement('div');
    frage.textContent = 'Welcher Ort?';
    frage.style.marginBottom = '6px';
    zielEl.appendChild(frage);
    optionen.forEach(function (o) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.stadt + ' (' + o.land + ')';
      b.className = 'plz-land-btn';
      b.style.cssText =
        'margin:0 6px 6px 0;padding:8px 12px;border-radius:3px;border:1px solid var(--accent,#e8ff00);background:transparent;color:inherit;cursor:pointer;font-family:inherit;font-size:12px';
      b.addEventListener('click', function () { onWahl(o); });
      zielEl.appendChild(b);
    });
    zielEl.style.display = 'block';
  }

  global.vexPlz = {
    aufloesen: aufloesen,
    auswahlKnoepfe: auswahlKnoepfe,
    standardLand: standardLand,
    landNormal: landNormal,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.vexPlz;
  }
})(typeof window !== 'undefined' ? window : globalThis);
