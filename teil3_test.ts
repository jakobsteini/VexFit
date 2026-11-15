// /Users/js/Projekte/Vexfit/app/vexfit/teil3_test.ts
//
// Teil 3 - Schweizer PLZ. Prueft die gemeinsame PLZ-Aufloesung vexPlz.aufloesen
// mit nachgestelltem Edge-Endpunkt /plz-aufloesen (KEINE echten Netzabfragen):
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

// Baut ein nachgestelltes fetch für den eigenen Edge-Endpunkt /plz-aufloesen
// (POST { plz, land }) und mitzaehlt, welche Laender/PLZ abgefragt wurden
// (als "/land/plz", ein Aufruf je Land – wie bisher).
function macheFetch(
  daten: Record<string, { stadt: string; lat: string; lng: string } | null>,
) {
  const aufrufe: string[] = [];
  const f = (_url: string, opts?: { body?: string }) => {
    let plz = "", land = "";
    try {
      const b = JSON.parse(opts?.body ?? "{}");
      plz = String(b.plz ?? "");
      land = String(b.land ?? "").toLowerCase();
    } catch { /* egal */ }
    aufrufe.push(`/${land}/${plz}`);
    const treffer = daten[`${land}/${plz}`];
    if (treffer) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          stadt: treffer.stadt,
          land: land.toUpperCase(),
          lat: treffer.lat,
          lng: treffer.lng,
        }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ unbekannt: true }) });
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
