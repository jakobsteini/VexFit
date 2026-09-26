// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/trainer-alert/geheimnisse_test.ts
//
// Durchsucht ALLE versionierten Dateien des Repositorys nach Schluesseln,
// Passwoertern und Telefonnummern. Schlaegt bei jedem Fund fehl, der nicht
// ausdruecklich unten als harmlos eingetragen ist.
//
// Warum das hier steht: jakobsteini/Vexfit ist oeffentlich. Am 12.09.2026 lag
// schon einmal ein service_role-Schluessel im Repo. Diese Pruefung soll das
// beim naechsten Mal vor dem Commit abfangen.
//
// Aufruf:  deno test --allow-run --allow-read supabase/functions/trainer-alert/
import { assertEquals } from "jsr:@std/assert@1";
import { dirname, fromFileUrl, resolve } from "jsr:@std/path@1";

const WURZEL = resolve(dirname(fromFileUrl(import.meta.url)), "..", "..", "..");

/**
 * Bekannte, geprueft harmlose Fundstellen. Alles andere laesst die Pruefung
 * scheitern. Eingetragen wird die Pruefsumme des Fundes, nicht der Text selbst
 * — sonst stuende der Fund ja wieder im Repository. Wer hier etwas eintraegt,
 * muss den Grund danebenschreiben.
 */
const HARMLOS: { datei: string; hash: string; grund: string }[] = [
  {
    datei: "profil-bearbeiten.html",
    hash: "95ad93c682971600ee9670d6d7509bf6ce6da4b206be86618fa0d752f0e44071",
    grund: "Platzhalter-Telefonnummer im Eingabefeld, keine echte Nummer",
  },
  {
    datei: "trainer-bereich.html",
    hash: "95ad93c682971600ee9670d6d7509bf6ce6da4b206be86618fa0d752f0e44071",
    grund: "Platzhalter-Telefonnummer im Eingabefeld, keine echte Nummer",
  },
];

/** SHA-256 in Hex — damit die Ausnahmen oben ohne den Klartext auskommen. */
async function pruefsumme(text: string): Promise<string> {
  const roh = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(roh)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const MUSTER: { name: string; regex: RegExp }[] = [
  {
    name: "Passwort/Schluessel-Zuweisung",
    regex:
      /(passwor[dt]|secret|api[_-]?key|apikey|token|pwd)["']?\s*[:=]\s*["'][^"']{8,}["']/gi,
  },
  { name: "privater Schluessel", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    name: "Stripe-Schluessel",
    regex: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/g,
  },
  { name: "Stripe-Signaturgeheimnis", regex: /\bwhsec_[A-Za-z0-9]{10,}/g },
  { name: "Telefonnummer", regex: /\+[0-9]{2,3}[ /-]?[0-9][0-9 /-]{7,}[0-9]/g },
  {
    name: "CallMeBot-Schluessel in einer Adresse",
    regex: /apikey=[A-Za-z0-9]{4,}/g,
  },
];

function versionierteDateien(): string[] {
  const lauf = new Deno.Command("git", { args: ["ls-files"], cwd: WURZEL })
    .outputSync();
  if (!lauf.success) throw new Error("git ls-files ist fehlgeschlagen");
  return new TextDecoder().decode(lauf.stdout).split("\n").filter(Boolean);
}

function textDatei(pfad: string): string | null {
  try {
    const roh = Deno.readFileSync(resolve(WURZEL, pfad));
    if (roh.includes(0)) return null; // binaer (Bilder, Schriften)
    return new TextDecoder("utf-8", { fatal: false }).decode(roh);
  } catch {
    return null;
  }
}

/** Rolle eines JWT lesen, ohne die Signatur zu pruefen. */
function rolle(token: string): string {
  try {
    const teil = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(teil + "===".slice((teil.length + 3) % 4))).role ??
      "unbekannt";
  } catch {
    return "nicht lesbar";
  }
}

Deno.test("kein Schluessel, kein Passwort, keine Telefonnummer in versionierten Dateien", async () => {
  const dateien = versionierteDateien();
  const funde: string[] = [];

  for (const datei of dateien) {
    const inhalt = textDatei(datei);
    if (inhalt === null) continue;
    for (const { name, regex } of MUSTER) {
      for (const treffer of inhalt.match(regex) ?? []) {
        const summe = await pruefsumme(treffer);
        const erlaubt = HARMLOS.some((h) =>
          h.datei === datei && h.hash === summe
        );
        if (!erlaubt) {
          funde.push(`${datei}: ${name} → Pruefsumme ${summe.slice(0, 12)}…`);
        }
      }
    }
  }

  console.log(
    `  ${dateien.length} versionierte Dateien durchsucht, ${MUSTER.length} Muster`,
  );
  assertEquals(funde, [], `Geheimnisverdacht:\n${funde.join("\n")}`);
});

Deno.test("jeder JWT im Repository ist der oeffentliche anon-Schluessel, kein service_role", () => {
  const dateien = versionierteDateien();
  const gefunden = new Map<string, string[]>();

  for (const datei of dateien) {
    const inhalt = textDatei(datei);
    if (inhalt === null) continue;
    for (
      const token of inhalt.match(
        /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
      ) ?? []
    ) {
      const r = rolle(token);
      if (!gefunden.has(r)) gefunden.set(r, []);
      if (!gefunden.get(r)!.includes(datei)) gefunden.get(r)!.push(datei);
    }
  }

  const rollen = [...gefunden.keys()].sort();
  console.log(
    `  gefundene JWT-Rollen: ${rollen.length ? rollen.join(", ") : "(keine)"}`,
  );
  const verboten = rollen.filter((r) => r !== "anon");
  assertEquals(
    verboten,
    [],
    `Nur der oeffentliche anon-Schluessel darf im Repo stehen. Gefunden: ${
      verboten.map((r) => `${r} in ${gefunden.get(r)!.join(", ")}`).join(" | ")
    }`,
  );
});

Deno.test("die neuen Dateien des Bausteins enthalten keine Zugangsdaten", () => {
  const neu = [
    "supabase/functions/trainer-alert/index.ts",
    "supabase/functions/trainer-alert/kern.ts",
    "supabase/functions/trainer-alert/kern_test.ts",
    "supabase/functions/trainer-alert/geheimnisse_test.ts",
    "supabase/migrations/20260926193000_trainer_alert_zeitplan.sql",
    "supabase/migrations/20260926193100_trainer_alert_zeitplan_entfernen.sql",
    // 26.09.2026 dazugekommen (Ersatz fuer "Komplette Automation v4")
    "supabase/functions/_shared/text.ts",
    "supabase/functions/vexfit-automation/index.ts",
    "supabase/functions/vexfit-automation/kern.ts",
    "supabase/functions/vexfit-automation/kern_test.ts",
    "supabase/migrations/20260926210000_stripe_events_verarbeitet.sql",
    "supabase/migrations/20260926210100_stripe_events_verarbeitet_entfernen.sql",
    "werkzeuge/stripe-endpunkt-anlegen.sh",
  ];
  const funde: string[] = [];
  for (const datei of neu) {
    const inhalt = textDatei(datei);
    if (inhalt === null) {
      funde.push(`${datei}: nicht lesbar`);
      continue;
    }
    // Der Schluessel darf nur als Name vorkommen, nie mit einem Wert dahinter.
    for (
      const m of inhalt.match(/TRAINER_ALERT_KEY\s*[:=]\s*["'][^"']+["']/g) ??
        []
    ) {
      funde.push(`${datei}: TRAINER_ALERT_KEY mit Wert → ${m.slice(0, 30)}`);
    }
    for (
      const _ of inhalt.match(/GMAIL_PASSWORT\s*[:=]\s*["'][^"']+["']/g) ?? []
    ) {
      funde.push(`${datei}: GMAIL_PASSWORT mit Wert`);
    }
    for (
      const _ of inhalt.match(
        /(STRIPE_WEBHOOK_SECRET|STRIPE_API_KEY|ADMIN_PASSWORT_HINWEIS)\s*[:=]\s*["'][^"']{6,}["']/g,
      ) ?? []
    ) {
      funde.push(`${datei}: Secret mit Wert`);
    }
    for (const _ of inhalt.match(/\beyJ[A-Za-z0-9_-]{8,}\./g) ?? []) {
      funde.push(`${datei}: JWT-artige Zeichenfolge`);
    }
    for (const _ of inhalt.match(/decrypted_secret\s*=\s*'[^']+'/g) ?? []) {
      funde.push(`${datei}: Vault-Wert im Klartext`);
    }
  }
  console.log(`  ${neu.length} neue Dateien geprueft`);
  assertEquals(funde, []);
});
