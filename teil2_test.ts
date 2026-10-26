// /Users/js/Projekte/Vexfit/app/vexfit/teil2_test.ts
//
// Teil 2 - Gefaehrliche Ruecknahme-Dateien. Prueft, dass in supabase/migrations
// keine Datei mit "entfernen" im Namen und keine Datei mit DROP TABLE liegt
// (ein supabase db push wuerde sonst Tabellen loeschen).
//
// Aufruf:  deno test --allow-read teil2_test.ts
import { assert } from "jsr:@std/assert@1";

const DIR = new URL("./supabase/migrations/", import.meta.url);

Deno.test("supabase/migrations ohne 'entfernen' und ohne DROP TABLE", async () => {
  const dateien: string[] = [];
  for await (const e of Deno.readDir(DIR)) {
    if (e.isFile && e.name.endsWith(".sql")) dateien.push(e.name);
  }
  assert(dateien.length > 0, "keine Migrationsdateien gefunden - Pfad falsch?");

  for (const name of dateien) {
    assert(
      !name.toLowerCase().includes("entfernen"),
      `Datei mit 'entfernen' im Namen gefunden: ${name}`,
    );
    const inhalt = await Deno.readTextFile(new URL(name, DIR));
    assert(
      !/drop\s+table/i.test(inhalt),
      `DROP TABLE gefunden in: ${name}`,
    );
  }
});
