// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/vexfit-automation/b8_abendbericht_trichter_test.ts
//
// Dauerlauf 05./06.11.2026 – B8: Abendbericht um den Trichter erweitern.
// Geprüft (reine Funktionen, Netz gemockt):
//   * abendberichtZahlenHolen aggregiert den Trichter der letzten 24 h nach
//     Herkunft und zählt Profile < 5/8 (ohne Test/Spam),
//   * die Zeilen zeigen Trichter + „Trainerprofile < 5/8 Angaben",
//   * fehlt die Trichter-Tabelle, steht „nicht verfügbar" (kein Absturz),
//   * abendberichtLeer berücksichtigt Trichter/Profile.
//
// Aufruf:  deno test --allow-read supabase/functions/vexfit-automation/b8_abendbericht_trichter_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  abendberichtLeer,
  abendberichtZahlenHolen,
  leereAbendberichtZahlen,
  mailAbendbericht,
  trichterSumme,
} from "./kern.ts";

const JETZT = Date.parse("2026-11-06T12:00:00Z");
const vorStunden = (h: number) => new Date(JETZT - h * 3_600_000).toISOString();

// Mock-Leser: liefert je nach Pfad Trichter-Ereignisse bzw. Trainerzeilen.
function leserBauen(opt: { trichterFehlt?: boolean } = {}) {
  return async function <T>(pfad: string): Promise<T[]> {
    if (pfad.startsWith("trichter_ereignisse")) {
      if (opt.trichterFehlt) throw new Error("HTTP 404");
      return [
        { stufe: "seite", quelle: "meta", erstellt_am: vorStunden(2) },
        { stufe: "seite", quelle: "meta", erstellt_am: vorStunden(3) },
        { stufe: "formular", quelle: "meta", erstellt_am: vorStunden(2) },
        { stufe: "abgesendet", quelle: "meta", erstellt_am: vorStunden(2) },
        { stufe: "seite", quelle: null, erstellt_am: vorStunden(1) },
      ] as unknown as T[];
    }
    if (pfad.startsWith("trainers?ist_test=not.is.true")) {
      // zwei Trainer: einer mit 2/8, einer mit 6/8 (nur der erste < 5/8).
      return [
        { avatar_url: null, trainingsart: "", trainingsort: "", preis_stunde: 0, bio: "", erfahrung: "x", spezialisierungen: ["a"], telefon: "" },
        { avatar_url: "https://x/storage/v1/object/public/avatars/a.png", trainingsart: "EMS", trainingsort: "online", preis_stunde: 50, bio: "genug langer text", erfahrung: "5 Jahre", spezialisierungen: ["a"], telefon: "" },
      ] as unknown as T[];
    }
    // Übrige Pfade (neue Trainer/Kunden/warten/zahlungen) leer.
    return [] as T[];
  };
}
const zaehlerNull = async () => 0;

Deno.test("B8: Trichter-Aggregat nach Herkunft + Profile < 5/8", async () => {
  const z = await abendberichtZahlenHolen(leserBauen(), zaehlerNull, JETZT);
  const meta = z.trichter24h.find((q) => q.quelle === "meta");
  assert(meta, "meta-Herkunft fehlt");
  assertEquals(meta.seite, 2);
  assertEquals(meta.formular, 1);
  assertEquals(meta.abgesendet, 1);
  const direkt = z.trichter24h.find((q) => q.quelle === "direkt/unbekannt");
  assertEquals(direkt?.seite, 1);
  assertEquals(z.profileUnter5, 1);
  assert(z.fehler.length === 0, "unerwarteter Fehler: " + JSON.stringify(z.fehler));
});

Deno.test("B8: Zeilen und Mail zeigen Trichter + Profile < 5/8", async () => {
  const z = await abendberichtZahlenHolen(leserBauen(), zaehlerNull, JETZT);
  const mail = mailAbendbericht(z);
  const text = mail.text;
  assertStringIncludes(text, "Trainerprofile < 5/8 Angaben");
  assertStringIncludes(text, "Trichter (24 h) nach Herkunft");
  assertStringIncludes(text, "meta");
});

Deno.test("B8: fehlende Trichter-Tabelle → nicht verfügbar, kein Absturz", async () => {
  const z = await abendberichtZahlenHolen(leserBauen({ trichterFehlt: true }), zaehlerNull, JETZT);
  assert(z.fehler.some((f) => f.feld === "Trichter (24 h)"), "kein Trichter-Fehler vermerkt");
  const text = mailAbendbericht(z).text;
  assertStringIncludes(text, "nicht verfügbar");
});

Deno.test("B8: trichterSumme und Leer-Prüfung berücksichtigen den Trichter", () => {
  const z = leereAbendberichtZahlen();
  assert(abendberichtLeer(z), "leere Zahlen sollten leer sein");
  z.trichter24h = [{ quelle: "meta", seite: 3, formular: 0, abgesendet: 0, bestaetigt: 0, profil5: 0 }];
  assertEquals(trichterSumme(z.trichter24h), 3);
  assert(!abendberichtLeer(z), "Trichter-Aktivität darf nicht als leer gelten");
});
