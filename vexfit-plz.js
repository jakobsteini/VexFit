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
(function (global) {
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
    plz = String(plz == null ? '' : plz).trim();

    if (cache && cache.has(plz)) return cache.get(plz);

    let ergebnis;
    if (/^\d{5}$/.test(plz)) {
      const de = await einLand('de', plz, fetchImpl);
      ergebnis = de && de.netzfehler ? { netzfehler: true } : (de || null);
    } else if (/^\d{4}$/.test(plz)) {
      const beide = await Promise.all([
        einLand('at', plz, fetchImpl),
        einLand('ch', plz, fetchImpl),
      ]);
      const netz = beide.some((x) => x && x.netzfehler);
      const treffer = beide.filter((x) => x && !x.netzfehler);
      if (treffer.length === 2) ergebnis = { mehrdeutig: true, optionen: treffer };
      else if (treffer.length === 1) ergebnis = treffer[0];
      else ergebnis = netz ? { netzfehler: true } : null;
    } else {
      ergebnis = null;
    }

    if (cache && ergebnis && !ergebnis.mehrdeutig && !ergebnis.netzfehler) {
      cache.set(plz, ergebnis);
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

  global.vexPlz = { aufloesen: aufloesen, auswahlKnoepfe: auswahlKnoepfe };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.vexPlz;
  }
})(typeof window !== 'undefined' ? window : globalThis);
