// /Users/js/Projekte/Vexfit/app/vexfit/logo_test.ts
//
// Baustein "Neues Logo". Prueft, dass nirgends im eingebauten Bereich mehr das
// alte vexfit-logo.png steht, dass Favicons/Manifest/Vorschaubild auf
// existierende Dateien in marke/ zeigen, dass die Kopf-/Fusszeilen das Inline-V
// + "EXFIT" tragen und der Mailkopf das Wortmarkenbild mit alt="VEXFIT".
//
// Aufruf:  deno test --allow-read logo_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const hier = (p: string) => new URL(p, import.meta.url);
const lies = (p: string) => Deno.readTextFile(hier(p));
async function existiert(p: string): Promise<boolean> {
  try {
    await Deno.stat(hier(p));
    return true;
  } catch {
    return false;
  }
}
async function htmlDateien(): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(hier("."))) {
    if (e.isFile && e.name.endsWith(".html")) out.push(e.name);
  }
  return out.sort();
}

Deno.test("kein Verweis mehr auf vexfit-logo.png; Datei geloescht", async () => {
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    assert(!s.includes("vexfit-logo.png"), `${f} verweist noch auf vexfit-logo.png`);
  }
  assert(!(await lies("./manifest.json")).includes("vexfit-logo.png"));
  assert(
    !(await lies("./supabase/functions/_shared/mailgeruest.ts")).includes("vexfit-logo.png"),
  );
  assert(
    !(await lies("./werkzeuge/stadtseiten.mjs")).includes("vexfit-logo.png"),
    "stadtseiten.mjs verweist noch auf vexfit-logo.png",
  );
  assert(!(await existiert("./vexfit-logo.png")), "vexfit-logo.png existiert noch");
});

Deno.test("jede .html hat beide Favicon-Links auf existierende Dateien", async () => {
  assert(await existiert("./marke/favicon-32.png"));
  assert(await existiert("./marke/favicon-180.png"));
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    assertStringIncludes(s, 'href="marke/favicon-32.png"');
    assertStringIncludes(s, 'href="marke/favicon-180.png"');
  }
});

Deno.test("manifest.json zeigt auf existierende Icons 192/512", async () => {
  const m = await lies("./manifest.json");
  assertStringIncludes(m, "marke/favicon-192.png");
  assertStringIncludes(m, "marke/favicon-512.png");
  assert(await existiert("./marke/favicon-192.png"));
  assert(await existiert("./marke/favicon-512.png"));
});

Deno.test("og:image/twitter:image auf das Vorschaubild, Datei existiert", async () => {
  assert(await existiert("./marke/vexfit-vorschau-1200x630.png"));
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    if (s.includes("og:image")) {
      assertStringIncludes(s, "https://vexfit.app/marke/vexfit-vorschau-1200x630.png");
    }
  }
});

Deno.test("Kopf-/Fusszeilen mit Logo tragen das Inline-V und EXFIT", async () => {
  let geprueft = 0;
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    if (s.includes('class="logo"') || s.includes('class="footer-logo"')) {
      assertStringIncludes(s, 'viewBox="168 166 1265 1270"'); // das Inline-V, eng begrenzt
      assertStringIncludes(s, "height:0.7em"); // buendig mit Bebas Neue
      assert(
        !s.includes('viewBox="150 150 1300 1300"'),
        `${f} hat noch die alte Logo-viewBox`,
      );
      assertStringIncludes(s, "EX<span>FIT</span>");
      assert(!s.includes("VEX<span>FIT</span>"), `${f} hat noch die alte Text-Wortmarke`);
      geprueft++;
    }
  }
  assert(geprueft >= 14, `zu wenige Seiten mit Logo geprueft: ${geprueft}`);
});

Deno.test("Mailkopf: dunkler Balken (#0A0A0A) + Wortmarkenbild mit alt=VEXFIT", async () => {
  const mg = await lies("./supabase/functions/_shared/mailgeruest.ts");
  assertStringIncludes(mg, "https://vexfit.app/marke/vexfit-wortmarke-transparent.png");
  assertStringIncludes(mg, 'alt="VEXFIT"');
  assertStringIncludes(mg, 'width="180"');
  // Kopfbalken jetzt dunkel (statt #e8ff00), zusaetzlich bgcolor gegen Gmail-Dunkelmodus.
  assertStringIncludes(mg, 'bgcolor="#0A0A0A"');
  assertStringIncludes(mg, "background:#0A0A0A;padding:18px;text-align:center");
});

Deno.test("jeder Wortmarken-Link traegt aria-label", async () => {
  let geprueft = 0;
  for (const f of await htmlDateien()) {
    const s = await lies("./" + f);
    // Jeder <a ... class="logo"/"footer-logo"> muss das aria-label tragen.
    const offen = s.match(/<a [^>]*class="(?:logo|footer-logo)"[^>]*>/g) ?? [];
    for (const tag of offen) {
      assert(
        tag.includes('aria-label="Vexfit – zur Startseite"'),
        `${f}: Wortmarken-Link ohne aria-label: ${tag}`,
      );
      geprueft++;
    }
  }
  assert(geprueft >= 19, `zu wenige Links geprueft: ${geprueft}`);
});
