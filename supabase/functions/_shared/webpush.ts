// /Users/js/Projekte/Vexfit/app/vexfit/supabase/functions/_shared/webpush.ts
//
// Teil A: Web Push ohne Fremdbibliothek – nur mit der eingebauten Web-Crypto von
// Deno. Zwei Dinge:
//   1. VAPID-Signatur (RFC 8292): ein kurzer ES256-JWT, der sich gegenüber dem
//      Push-Dienst (Apple/Google/Mozilla) ausweist.
//   2. Nutzlast-Verschlüsselung (RFC 8291/8188, Content-Encoding aes128gcm):
//      ECDH P-256 + HKDF-SHA256 + AES-128-GCM.
//
// Die Schlüssel kommen NUR aus Secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT). Der private Schlüssel steht nie im Code. Fehlt ein Secret,
// meldet vapidKonfig() null – der Aufrufer (kern.ts) überspringt Push dann,
// die Mail läuft weiter.
//
// Diese Datei wird NUR von index.ts importiert (die Netz-/Krypto-Schicht);
// kern.ts bleibt netz- und bibliotheksfrei und ist ohne Netz prüfbar.

import type { PushAbo, PushNachricht } from "../vexfit-automation/kern.ts";

// ── base64url ──
function b64urlZuBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const roh = atob(b64);
  const out = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) out[i] = roh.charCodeAt(i);
  return out;
}
function bytesZuB64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function verketten(...teile: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const t of teile) n += t.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const t of teile) { out.set(t, o); o += t.length; }
  return out;
}

// ── HKDF über HMAC-SHA256 (len <= 32, daher ein Expand-Block) ──
async function hmacSha256(schluessel: Uint8Array, daten: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", schluessel as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, daten as BufferSource);
  return new Uint8Array(sig);
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, laenge: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, verketten(info, new Uint8Array([1])));
  return t.slice(0, laenge);
}

// ── VAPID-Konfiguration aus den Secrets ──
export interface VapidKonfig { publicKey: string; privateKey: string; subject: string }
export function vapidKonfig(): VapidKonfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

// ES256-Signierschlüssel aus den beiden VAPID-Rohwerten bauen (public = 65 Byte
// unkomprimierter Punkt 0x04||X||Y, private = 32 Byte Skalar d).
async function ecdsaSchluessel(cfg: VapidKonfig): Promise<CryptoKey> {
  const pub = b64urlZuBytes(cfg.publicKey); // 65
  const d = cfg.privateKey;
  const x = bytesZuB64url(pub.slice(1, 33));
  const y = bytesZuB64url(pub.slice(33, 65));
  return await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** VAPID-Autorisierungskopf für einen Endpunkt: "vapid t=<jwt>, k=<pubkey>". */
export async function vapidHeader(endpoint: string, cfg: VapidKonfig): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesZuB64url(textBytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesZuB64url(textBytes(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: cfg.subject,
  })));
  const eingabe = `${header}.${payload}`;
  const key = await ecdsaSchluessel(cfg);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(eingabe) as BufferSource);
  const jwt = `${eingabe}.${bytesZuB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${cfg.publicKey}`;
}

/** Nutzlast nach RFC 8291/8188 (aes128gcm) verschlüsseln. Gibt den fertigen
 *  Body (Header + ein Record) zurück. */
export async function verschluesseln(
  klartext: Uint8Array,
  p256dhB64: string,
  authB64: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlZuBytes(p256dhB64); // 65
  const authSecret = b64urlZuBytes(authB64); // 16

  // Flüchtiges ECDH-Schlüsselpaar des Absenders.
  const asPaar = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asPaar.publicKey)); // 65
  const uaKey = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPaar.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh, "WebPush: info\0"||ua_public||as_public, 32)
  const infoKombi = verketten(textBytes("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, infoKombi, 32);

  // Content-Encoding-Schlüssel aus einem zufälligen 16-Byte-Salt.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, textBytes("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, textBytes("Content-Encoding: nonce\0"), 12);

  // Ein einziger Record: Klartext + Trenner 0x02 (letzter Record).
  const record = verketten(klartext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 }, aesKey, record as BufferSource));

  // aes128gcm-Kopf: salt(16) || rs(4, big-endian) || idlen(1) || keyid(as_public 65)
  const rs = 4096;
  const kopf = new Uint8Array(16 + 4 + 1 + asPublic.length);
  kopf.set(salt, 0);
  kopf[16] = (rs >>> 24) & 0xff;
  kopf[17] = (rs >>> 16) & 0xff;
  kopf[18] = (rs >>> 8) & 0xff;
  kopf[19] = rs & 0xff;
  kopf[20] = asPublic.length;
  kopf.set(asPublic, 21);
  return verketten(kopf, chiffre);
}

/** Eine Mitteilung an EIN Abo senden. Gibt den HTTP-Status zurück (404/410 =
 *  Abo abgelaufen). Ohne VAPID-Secrets gibt es 0 zurück (nichts gesendet). */
export async function pushEinzelSenden(abo: PushAbo, nachricht: PushNachricht): Promise<number> {
  const cfg = vapidKonfig();
  if (!cfg) return 0;
  const klartext = textBytes(JSON.stringify(nachricht));
  const body = await verschluesseln(klartext, abo.p256dh, abo.auth);
  const auth = await vapidHeader(abo.endpoint, cfg);
  const res = await fetch(abo.endpoint, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
    },
    body: body as BufferSource,
  });
  // Body nicht weiterverwenden – schließen, damit keine Verbindung offen bleibt.
  await res.arrayBuffer().catch(() => {});
  return res.status;
}
