// /Users/js/Projekte/Vexfit/app/vexfit/teil3_test.ts
//
// Teil 3 - Schweizer PLZ. Prueft die gemeinsame PLZ-Aufloesung vexPlz.aufloesen
// mit nachgestelltem zippopotam (KEINE echten Netzabfragen):
//   6300 -> zwei Treffer (AT/CH) -> mehrdeutig; Wahl CH gibt Zug/CH.
//   10115 -> DE ohne Rueckfrage, nur eine Abfrage.
//   5020 -> nur AT-Treffer -> AT ohne Rueckfrage.
//   Zwischenspeicher: gleiche PLZ wird nicht erneut abgefragt.
//
// Aufruf:  deno test --allow-read teil3_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

async function ladeVexPlz() {
  const src = await Deno.readTextFile(new URL("./vexfit-plz.js", import.meta.url));
  const g: Record<string, unknown> = {};
  new Function("window", "globalThis", "module", "fetch", src)(g, g, undefined, undefined);
  // deno-lint-ignore no-explicit-any
  return (g.vexPlz as any);
}

// Baut ein nachgestelltes fetch, das zippopotam-Antworten liefert und mitzaehlt,
// welche Laender/PLZ abgefragt wurden.
function macheFetch(
  daten: Record<string, { stadt: string; lat: string; lng: string } | null>,
) {
  const aufrufe: string[] = [];
  const f = (url: string) => {
    aufrufe.push(String(url));
    const m = String(url).match(/zippopotam\.us\/([a-z]{2})\/(\d+)/);
    const key = m ? `${m[1]}/${m[2]}` : "";
    const treffer = daten[key];
    if (treffer) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          places: [{
            "place name": treffer.stadt,
            latitude: treffer.lat,
            longitude: treffer.lng,
          }],
        }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  };
  return { fetch: f as unknown as typeof fetch, aufrufe };
}

Deno.test("6300 ist mehrdeutig (AT/CH); Wahl CH gibt Zug/CH", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch } = macheFetch({
    "at/6300": { stadt: "Woergl", lat: "47.49", lng: "12.06" },
    "ch/6300": { stadt: "Zug", lat: "47.17", lng: "8.52" },
  });
  const erg = await vexPlz.aufloesen("6300", { fetch });
  assert(erg.mehrdeutig === true, "6300 muss mehrdeutig sein");
  assertEquals(erg.optionen.length, 2);
  const ch = erg.optionen.find((o: { land: string }) => o.land === "CH");
  assert(ch, "CH-Option muss vorhanden sein");
  assertEquals(ch.stadt, "Zug");
  assertEquals(ch.land, "CH");
});

Deno.test("10115 -> DE ohne Rueckfrage, genau eine Abfrage", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch, aufrufe } = macheFetch({
    "de/10115": { stadt: "Berlin", lat: "52.53", lng: "13.38" },
  });
  const erg = await vexPlz.aufloesen("10115", { fetch });
  assertEquals(erg.land, "DE");
  assertEquals(erg.stadt, "Berlin");
  assert(!erg.mehrdeutig, "DE darf nicht mehrdeutig sein");
  assertEquals(aufrufe.length, 1, "fuenfstellig: nur eine (DE-)Abfrage");
});

Deno.test("5020 -> nur AT-Treffer -> AT ohne Rueckfrage", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch } = macheFetch({
    "at/5020": { stadt: "Salzburg", lat: "47.80", lng: "13.04" },
    // kein ch/5020 -> CH liefert keinen Treffer
  });
  const erg = await vexPlz.aufloesen("5020", { fetch });
  assertEquals(erg.land, "AT");
  assertEquals(erg.stadt, "Salzburg");
  assert(!erg.mehrdeutig, "nur ein Treffer -> nicht mehrdeutig");
});

Deno.test("Zwischenspeicher: gleiche PLZ wird nicht erneut abgefragt", async () => {
  const vexPlz = await ladeVexPlz();
  const { fetch, aufrufe } = macheFetch({
    "de/10115": { stadt: "Berlin", lat: "52.53", lng: "13.38" },
  });
  const cache = new Map();
  await vexPlz.aufloesen("10115", { fetch, cache });
  const vorher = aufrufe.length;
  await vexPlz.aufloesen("10115", { fetch, cache });
  assertEquals(aufrufe.length, vorher, "zweite Aufloesung darf nicht erneut abfragen");
});
