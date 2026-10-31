// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-qr.js
//
// Kleiner, eigenstaendiger QR-Erzeuger fuer Vexfit - OHNE externen Dienst und
// ohne Bibliothek. Gebraucht fuer den A5-Aufsteller (john-harris-aufsteller.html):
// der QR zeigt auf den Kunden-Link eines Standorts.
//
// Umfang bewusst klein gehalten: Byte-Modus (ein ganzer URL als Bytes),
// Fehlerkorrektur-Stufe M (mittel, gut fuer den Druck), Versionen 1 bis 10
// (fasst bis ~213 Zeichen - ein Vexfit-Link ist viel kuerzer). Alles nach der
// QR-Norm ISO/IEC 18004: Reed-Solomon ueber GF(256) mit dem Grundpolynom 0x11d,
// die acht Standard-Masken mit Strafbewertung, Format- und Versionsinformation
// per BCH. Geprueft wird das Ergebnis durch Rueck-Dekodieren (vexfit-qr_test.ts
// und ein Lesetest im Browser).
//
// Aufruf:  vexQR.svg("https://vexfit.app/...", { groesse: 320 })  -> SVG-String
//          vexQR.matrix("...")  -> { groesse, modul(r,c) }  (fuer Tests)

(function (global) {
  "use strict";

  // ---- GF(256) -------------------------------------------------------------
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // Reed-Solomon-Generatorpolynom fuer n Fehlerkorrektur-Woerter.
  function rsGenerator(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  // Fehlerkorrektur-Woerter zu einem Block von Datenwoertern (LFSR-Division).
  // Das Generatorpolynom hat Grad anzahlEc; gen[0] = 1 (Leitkoeffizient) ist
  // durch den Rueckkopplungsfaktor bereits beruecksichtigt, deshalb gen[j+1].
  function rsEncode(daten, anzahlEc) {
    const gen = rsGenerator(anzahlEc);
    const rest = new Array(anzahlEc).fill(0);
    for (let i = 0; i < daten.length; i++) {
      const faktor = daten[i] ^ rest[0];
      rest.shift();
      rest.push(0);
      if (faktor !== 0) {
        for (let j = 0; j < anzahlEc; j++) {
          rest[j] ^= mul(gen[j + 1], faktor);
        }
      }
    }
    return rest;
  }

  // ---- Versions-Tabellen (Stufe M) -----------------------------------------
  // Je Version: Datenwoerter gesamt, EC-Woerter je Block, Blockaufteilung als
  // [anzahl, datenwoerter_je_block]-Paare. Quelle: ISO/IEC 18004, Stufe M.
  const VERSIONEN = {
    1:  { daten: 16,  ec: 10, bloecke: [[1, 16]] },
    2:  { daten: 28,  ec: 16, bloecke: [[1, 28]] },
    3:  { daten: 44,  ec: 26, bloecke: [[1, 44]] },
    4:  { daten: 64,  ec: 18, bloecke: [[2, 32]] },
    5:  { daten: 86,  ec: 24, bloecke: [[2, 43]] },
    6:  { daten: 108, ec: 16, bloecke: [[4, 27]] },
    7:  { daten: 124, ec: 18, bloecke: [[4, 31]] },
    8:  { daten: 154, ec: 22, bloecke: [[2, 38], [2, 39]] },
    9:  { daten: 182, ec: 22, bloecke: [[3, 36], [2, 37]] },
    10: { daten: 216, ec: 26, bloecke: [[4, 43], [1, 44]] },
  };

  // Mittelpunkte der Ausrichtungsmuster je Version (Stufe-unabhaengig).
  const AUSRICHTUNG = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  // ---- Datenstrom (Byte-Modus, Stufe M) ------------------------------------
  function textAlsBytes(text) {
    // UTF-8. URLs sind ASCII, aber so sind auch Umlaute sicher kodiert.
    return Array.from(new TextEncoder().encode(text));
  }

  function versionWaehlen(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const zaehlBits = v <= 9 ? 8 : 16; // Byte-Modus Laengenfeld
      const noetigBits = 4 + zaehlBits + 8 * byteLen;
      const noetigWoerter = Math.ceil(noetigBits / 8);
      if (noetigWoerter <= VERSIONEN[v].daten) return v;
    }
    throw new Error("QR: Inhalt zu lang (mehr als Version 10 Stufe M).");
  }

  function bitstrom(bytes, version) {
    const bits = [];
    const schreib = (wert, laenge) => {
      for (let i = laenge - 1; i >= 0; i--) bits.push((wert >> i) & 1);
    };
    schreib(0b0100, 4); // Modus-Kennung Byte
    schreib(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) schreib(b, 8);

    const kapBits = VERSIONEN[version].daten * 8;
    // Abschluss (bis zu vier Null-Bits), dann auf volle Woerter auffuellen.
    for (let i = 0; i < 4 && bits.length < kapBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const woerter = [];
    for (let i = 0; i < bits.length; i += 8) {
      let w = 0;
      for (let j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
      woerter.push(w);
    }
    // Fuellbytes im Wechsel, bis die Datenkapazitaet voll ist.
    const fuell = [0xec, 0x11];
    let k = 0;
    while (woerter.length < VERSIONEN[version].daten) {
      woerter.push(fuell[k++ % 2]);
    }
    return woerter;
  }

  // Blockweise EC rechnen und Daten- wie EC-Woerter verschraenken (Norm).
  function wortfolge(datenWoerter, version) {
    const v = VERSIONEN[version];
    const datenBloecke = [];
    const ecBloecke = [];
    let pos = 0;
    for (const [anzahl, groesse] of v.bloecke) {
      for (let b = 0; b < anzahl; b++) {
        const block = datenWoerter.slice(pos, pos + groesse);
        pos += groesse;
        datenBloecke.push(block);
        ecBloecke.push(rsEncode(block, v.ec));
      }
    }
    const folge = [];
    const maxDaten = Math.max(...datenBloecke.map((b) => b.length));
    for (let i = 0; i < maxDaten; i++) {
      for (const block of datenBloecke) if (i < block.length) folge.push(block[i]);
    }
    for (let i = 0; i < v.ec; i++) {
      for (const block of ecBloecke) folge.push(block[i]);
    }
    return folge;
  }

  // ---- Matrix --------------------------------------------------------------
  function neueMatrix(groesse) {
    const m = [];
    for (let r = 0; r < groesse; r++) m.push(new Array(groesse).fill(null));
    return m;
  }

  function setzeMuster(m, reserviert, version) {
    const g = m.length;
    const finder = (zr, zc) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = zr + r, cc = zc + c;
          if (rr < 0 || rr >= g || cc < 0 || cc >= g) continue;
          const rand = r === -1 || r === 7 || c === -1 || c === 7;
          const innen = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          m[rr][cc] = rand ? 0 : (innen ? 1 : 0);
          reserviert[rr][cc] = 1;
        }
      }
    };
    finder(0, 0);
    finder(0, g - 7);
    finder(g - 7, 0);

    // Taktmuster (Reihe/Spalte 6).
    for (let i = 8; i < g - 8; i++) {
      const wert = i % 2 === 0 ? 1 : 0;
      if (m[6][i] === null) { m[6][i] = wert; reserviert[6][i] = 1; }
      if (m[i][6] === null) { m[i][6] = wert; reserviert[i][6] = 1; }
    }

    // Ausrichtungsmuster.
    const zentren = AUSRICHTUNG[version];
    for (const zr of zentren) {
      for (const zc of zentren) {
        // Nicht ueber die drei Finder legen.
        if ((zr <= 7 && zc <= 7) || (zr <= 7 && zc >= g - 8) || (zr >= g - 8 && zc <= 7)) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const rr = zr + r, cc = zc + c;
            const rand = Math.max(Math.abs(r), Math.abs(c));
            m[rr][cc] = (rand === 1) ? 0 : 1;
            reserviert[rr][cc] = 1;
          }
        }
      }
    }

    // Dunkles Modul.
    m[4 * version + 9][8] = 1;
    reserviert[4 * version + 9][8] = 1;

    // Formatbereiche reservieren (Inhalt kommt spaeter).
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) { reserviert[8][i] = 1; reserviert[i][8] = 1; }
    }
    reserviert[8][8] = 1;
    for (let i = 0; i < 8; i++) {
      reserviert[8][g - 1 - i] = 1;
      reserviert[g - 1 - i][8] = 1;
    }

    // Versionsbereiche (ab Version 7).
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          reserviert[i][g - 11 + j] = 1;
          reserviert[g - 11 + j][i] = 1;
        }
      }
    }
  }

  // Bitlaenge einer nicht-negativen ganzen Zahl (ohne Gleitkomma).
  function bitLen(x) {
    let n = 0;
    while (x > 0) { n++; x >>>= 1; }
    return n;
  }

  // BCH-Rest fuer ein Datenwort gegen ein Generatorpolynom (Polynomdivision
  // ueber GF(2)). genBits ist die Bitlaenge des Generators.
  function bch(wert, gen, genBits) {
    let v = wert;
    while (bitLen(v) >= genBits) {
      v ^= gen << (bitLen(v) - genBits);
    }
    return v;
  }

  function formatBits(maske) {
    // Stufe M = '00'. 5 Datenbits (2 Stufe + 3 Maske), BCH(15,5), XOR-Maske.
    const daten = (0b00 << 3) | maske;
    const rest = bch(daten << 10, 0b10100110111, 11);
    return ((daten << 10) | rest) ^ 0b101010000010010;
  }

  function versionBits(version) {
    const rest = bch(version << 12, 0b1111100100101, 13);
    return (version << 12) | rest;
  }

  function schreibeFormat(m, maske) {
    const g = m.length;
    const bits = formatBits(maske); // 15 Bit
    // Reihenfolge der Platzierung: das hoechstwertige Bit (Bit 14) zuerst an die
    // erste Position. So erwarten es die Leser (geprueft gegen einen bekannten
    // Erzeuger und jsQR): Position i traegt Bit (14 - i).
    const b = (i) => (bits >> (14 - i)) & 1;
    // Um den linken oberen Finder.
    for (let i = 0; i <= 5; i++) m[8][i] = b(i);
    m[8][7] = b(6);
    m[8][8] = b(7);
    m[7][8] = b(8);
    for (let i = 9; i <= 14; i++) m[14 - i][8] = b(i);
    // Zweite Kopie.
    for (let i = 0; i <= 7; i++) m[g - 1 - i][8] = b(i);
    for (let i = 8; i <= 14; i++) m[8][g - 15 + i] = b(i);
    // Das dunkle Modul liegt auf der Position von Bit 7 der zweiten Kopie und
    // ist immer dunkel (Norm) - nach dem Schreiben der Formatbits wiederherstellen.
    m[g - 8][8] = 1;
  }

  function schreibeVersion(m, version) {
    if (version < 7) return;
    const g = m.length;
    const bits = versionBits(version); // 18 Bit
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const r = Math.floor(i / 3);
      const c = i % 3;
      m[r][g - 11 + c] = bit;
      m[g - 11 + c][r] = bit;
    }
  }

  const MASKEN = [
    (r, c) => (r + c) % 2 === 0,
    (r, _c) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function platziereDaten(m, reserviert, folge) {
    const g = m.length;
    const bits = [];
    for (const wort of folge) for (let i = 7; i >= 0; i--) bits.push((wort >> i) & 1);
    let idx = 0;
    let aufwaerts = true;
    for (let spalte = g - 1; spalte > 0; spalte -= 2) {
      if (spalte === 6) spalte--; // Taktspalte ueberspringen
      for (let zeile = 0; zeile < g; zeile++) {
        const r = aufwaerts ? g - 1 - zeile : zeile;
        for (let s = 0; s < 2; s++) {
          const c = spalte - s;
          if (reserviert[r][c]) continue;
          m[r][c] = idx < bits.length ? bits[idx] : 0;
          idx++;
        }
      }
      aufwaerts = !aufwaerts;
    }
  }

  function wendeMaske(m, reserviert, maske) {
    const g = m.length;
    const out = m.map((z) => z.slice());
    const f = MASKEN[maske];
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < g; c++) {
        if (reserviert[r][c]) continue;
        if (f(r, c)) out[r][c] ^= 1;
      }
    }
    return out;
  }

  function strafe(m) {
    const g = m.length;
    let s = 0;
    // Regel 1: gleiche Farbe in Reihe/Spalte.
    for (let r = 0; r < g; r++) {
      for (const linie of [m[r], m.map((z) => z[r])]) {
        let lauf = 1;
        for (let c = 1; c < g; c++) {
          if (linie[c] === linie[c - 1]) { lauf++; if (lauf === 5) s += 3; else if (lauf > 5) s += 1; }
          else lauf = 1;
        }
      }
    }
    // Regel 2: 2x2-Bloecke.
    for (let r = 0; r < g - 1; r++) {
      for (let c = 0; c < g - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) s += 3;
      }
    }
    // Regel 3: Finder-aehnliches Muster 1:1:3:1:1.
    const muster = [1, 0, 1, 1, 1, 0, 1];
    const pruefLinie = (linie) => {
      for (let i = 0; i + 11 <= g; i++) {
        const voranMatch = (start) => muster.every((x, k) => linie[start + k] === x);
        if (voranMatch(i)) {
          const vor = i - 4 < 0 ? true : linie.slice(i - 4, i).every((x) => x === 0);
          const nach = i + 7 + 4 > g ? true : linie.slice(i + 7, i + 11).every((x) => x === 0);
          if (vor || nach) s += 40;
        }
      }
    };
    for (let r = 0; r < g; r++) { pruefLinie(m[r]); pruefLinie(m.map((z) => z[r])); }
    // Regel 4: Anteil dunkler Module.
    let dunkel = 0;
    for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) if (m[r][c]) dunkel++;
    const anteil = (dunkel * 100) / (g * g);
    const abstand = Math.floor(Math.abs(anteil - 50) / 5) * 10;
    s += abstand;
    return s;
  }

  function erzeuge(text) {
    const bytes = textAlsBytes(text);
    const version = versionWaehlen(bytes.length);
    const g = version * 4 + 17;
    const datenWoerter = bitstrom(bytes, version);
    const folge = wortfolge(datenWoerter, version);

    const basis = neueMatrix(g);
    const reserviert = neueMatrix(g).map((z) => z.map(() => 0));
    setzeMuster(basis, reserviert, version);
    platziereDaten(basis, reserviert, folge);
    schreibeVersion(basis, version);

    // Beste Maske nach Strafbewertung.
    let beste = null, besteStrafe = Infinity, besteMaske = 0;
    for (let maske = 0; maske < 8; maske++) {
      const kandidat = wendeMaske(basis, reserviert, maske);
      schreibeFormat(kandidat, maske);
      const str = strafe(kandidat);
      if (str < besteStrafe) { besteStrafe = str; beste = kandidat; besteMaske = maske; }
    }
    return { groesse: g, matrix: beste, version, maske: besteMaske };
  }

  function matrix(text) {
    const erg = erzeuge(text);
    return {
      groesse: erg.groesse,
      version: erg.version,
      modul: (r, c) => erg.matrix[r][c] === 1,
    };
  }

  // Einfarbiges SVG (schwarze Module auf transparentem Grund). rand = Ruhezone
  // in Modulen (Norm: 4). Die Module werden auf ganze Pixel gerundet, damit der
  // Druck scharf bleibt.
  function svg(text, opt) {
    opt = opt || {};
    const rand = opt.rand === undefined ? 4 : opt.rand;
    const erg = erzeuge(text);
    const n = erg.groesse;
    const gesamtModule = n + 2 * rand;
    const pxProModul = Math.max(1, Math.floor((opt.groesse || 320) / gesamtModule));
    const px = gesamtModule * pxProModul;
    const farbe = opt.farbe || "#0a0a0a";
    let pfad = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (erg.matrix[r][c] === 1) {
          const x = (c + rand) * pxProModul;
          const y = (r + rand) * pxProModul;
          pfad += `M${x} ${y}h${pxProModul}v${pxProModul}h-${pxProModul}z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
      `viewBox="0 0 ${px} ${px}" shape-rendering="crispEdges" role="img" ` +
      `aria-label="QR-Code">` +
      `<rect width="${px}" height="${px}" fill="${opt.hintergrund || "#ffffff"}"/>` +
      `<path d="${pfad}" fill="${farbe}"/></svg>`;
  }

  const api = {
    matrix,
    svg,
    _erzeuge: erzeuge,
    VERSIONEN,
    // Nur fuer die Pruefung (vexfit-qr_test.ts): Bausteine gegen bekannte
    // Norm-Konstanten testbar machen.
    _intern: { formatBits, versionBits, rsEncode, rsGenerator, mul, EXP },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.vexQR = api;
})(typeof window !== "undefined" ? window : globalThis);
