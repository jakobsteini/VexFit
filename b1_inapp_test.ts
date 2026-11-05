// /Users/js/Projekte/Vexfit/app/vexfit/b1_inapp_test.ts
//
// Dauerlauf 05./06.11.2026 – B1: Anmeldeweg im In-App-Browser von
// Facebook/Instagram robust machen. Geprüft wird strukturell an
// registrieren.html (die Logik steckt inline):
//   * UTM-Parameter werden EINMAL beim Laden erfasst (inkl. utm_content) und
//     best effort in sessionStorage gespiegelt, damit sie ein Neuladen ohne
//     Query überleben;
//   * der Browsertyp (facebook/instagram/sonst) wird grob erkannt;
//   * utm_content UND browsertyp gehen an die Automation-Function (Trainer &
//     Kunde);
//   * der Cookie-Banner verdeckt den Absenden-Knopf nicht (Body-Klasse + Platz);
//   * kein window.open / target-Popup im Kernablauf (bricht im In-App-Browser).
//
// Aufruf:  deno test --allow-read b1_inapp_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const lies = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("B1: UTM werden beim Laden erfasst, utm_content inklusive, in sessionStorage gespiegelt", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, "const VEXFIT_WERBUNG=(function(){");
  assertStringIncludes(s, "'utm_source','utm_campaign','utm_content','utm_medium','utm_term'");
  assertStringIncludes(s, "sessionStorage.setItem('vexfit_werbung'");
  assertStringIncludes(s, "sessionStorage.getItem('vexfit_werbung')");
});

Deno.test("B1: Browsertyp-Erkennung für Facebook- und Instagram-In-App-Browser", async () => {
  const s = await lies("./registrieren.html");
  const i = s.indexOf("function vexfitBrowserTyp(");
  assert(i !== -1, "vexfitBrowserTyp fehlt");
  const f = s.slice(i, i + 400);
  assertStringIncludes(f, "instagram");
  assert(f.includes("fban") && f.includes("fbav"), "FB-In-App-Kennungen fehlen");
  assertStringIncludes(f, "return 'sonst'");
});

Deno.test("B1: utm_content und browsertyp gehen für Trainer UND Kunde an die Function", async () => {
  const s = await lies("./registrieren.html");
  assertEquals((s.match(/utm_content: utmCont, browsertyp: browserTyp/g) || []).length, 2,
    "utm_content+browsertyp nicht in beiden Submit-Pfaden");
  // Nicht mehr direkt aus location.search beim Abschicken, sondern aus dem
  // beim Laden gefüllten robusten Speicher.
  assert(!s.includes("new URLSearchParams(location.search).get('utm_campaign')"),
    "UTM wird noch fragil beim Abschicken aus location.search gelesen");
  // Beide Submit-Pfade lesen die Kampagne aus dem robusten Speicher.
  assertEquals((s.match(/const utm=VEXFIT_WERBUNG\.utm_campaign\|\|''/g) || []).length, 2);
});

Deno.test("B1: herkunftText berücksichtigt utm_content", async () => {
  const s = await lies("./registrieren.html");
  const i = s.indexOf("function herkunftText(");
  const f = s.slice(i, i + 320);
  assertStringIncludes(f, "utm_content");
  // Beide Nachträge geben das ganze Werbe-Objekt weiter.
  assertEquals((s.match(/herkunftText\(VEXFIT_WERBUNG\)/g) || []).length, 2);
});

Deno.test("B1: Cookie-Banner verdeckt den Absenden-Knopf nicht", async () => {
  const s = await lies("./registrieren.html");
  assertStringIncludes(s, "classList.add('cookie-banner-offen')");
  assertStringIncludes(s, "classList.remove('cookie-banner-offen')");
  assertStringIncludes(s, "body.cookie-banner-offen .page-wrap{padding-bottom:");
});

Deno.test("B1: kein window.open / Popup im Anmeldeablauf (bricht im In-App-Browser)", async () => {
  const s = await lies("./registrieren.html");
  assert(!s.includes("window.open"), "window.open vorhanden – im In-App-Browser unzuverlässig");
});
