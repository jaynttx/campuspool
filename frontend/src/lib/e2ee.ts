/**
 * End-to-end encryption for one-to-one chats, using the browser's built-in WebCrypto.
 *
 *  - Each student has one chat identity: an ECDH P-256 key pair made in their browser the first time they sign in.
 *    The public key is stored on the server. The private key stays in the browser (IndexedDB) and is never sent
 *    in readable form, so nobody has to type anything to read their messages.
 *  - For each conversation both sides derive the same AES-256-GCM key from ECDH + HKDF.
 *    Every message uses a fresh random IV, and its authenticated data binds it to the conversation and sender.
 *  - A new device gets the identity from an existing one (a "device link"): the new device makes a one-time key
 *    pair and shows a code derived from its public key. The student types that code on the old device, which then
 *    seals the identity to the one-time key. A server that swapped the one-time key would change the code.
 *  - Optionally the identity is also sealed with a random recovery key that only the student keeps.
 *  - Students who set up the older passphrase scheme can open that copy once to move over (see unwrapPrivateKey).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const EC = { name: "ECDH", namedCurve: "P-256" } as const;

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 10;

export const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

const randomBytes = (n: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(n));
  globalThis.crypto.getRandomValues(out);
  return out;
};

const bytes = (s: string): Uint8Array<ArrayBuffer> => {
  const e = enc.encode(s);
  const out = new Uint8Array(new ArrayBuffer(e.length));
  out.set(e);
  return out;
};

/* ---------- identity ---------- */

export type Identity = { publicKey: string; privateKey: CryptoKey };

/** A new identity. The private key is extractable so it can be passed to the student's other devices. */
export async function generateIdentity(): Promise<Identity> {
  const pair = await subtle().generateKey(EC, true, ["deriveBits"]);
  return { publicKey: toB64(await subtle().exportKey("spki", pair.publicKey)), privateKey: pair.privateKey };
}

/** The public key (SPKI, base64url) that belongs to a private key in JWK form. */
async function publicFromJwk(jwk: JsonWebKey): Promise<string> {
  const pub = await subtle().importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true }, EC, true, []);
  return toB64(await subtle().exportKey("spki", pub));
}

async function importIdentityJwk(jwk: JsonWebKey): Promise<Identity> {
  const privateKey = await subtle().importKey("jwk", jwk, EC, true, ["deriveBits"]);
  return { privateKey, publicKey: await publicFromJwk(jwk) };
}

/** Reads the public half back out of a private key (the key must be extractable). */
export async function describeIdentity(privateKey: CryptoKey): Promise<Identity> {
  return importIdentityJwk(await subtle().exportKey("jwk", privateKey));
}

export async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return subtle().importKey("spki", fromB64(spkiB64), EC, true, []);
}

/* ---------- short codes (Crockford base32: no I, L, O or U, so they are easy to read out) ---------- */

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toBase32(data: Uint8Array, chars: number): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= chars) break;
  }
  return out;
}

function fromBase32(code: string): Uint8Array<ArrayBuffer> {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of code) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad character");
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const arr = new Uint8Array(new ArrayBuffer(out.length));
  arr.set(out);
  return arr;
}

/** Accepts what people type: any case, spaces or dashes, and the usual look-alikes (O for 0, I or L for 1). */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export const groupCode = (code: string, size = 4): string => code.match(new RegExp(`.{1,${size}}`, "g"))?.join("-") ?? code;

/* ---------- recovery key ---------- */

const RECOVERY_CHARS = 24; // 120 random bits
const RECOVERY_INFO = "campuspool-recovery-v2";

export type RecoveryBlob = { v: 2; salt: string; iv: string; ct: string };

/** A new random recovery key, for example "7K2M-QX9D-...". Shown once; the server never sees it. */
export function newRecoveryKey(): string {
  return groupCode(toBase32(randomBytes(15), RECOVERY_CHARS));
}

async function recoveryAesKey(code: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const normalized = normalizeCode(code);
  if (normalized.length !== RECOVERY_CHARS) throw new Error("A recovery key has 24 letters and numbers.");
  const secret = fromBase32(normalized);
  const base = await subtle().importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: bytes(RECOVERY_INFO) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Seals the identity with a recovery key. The result is safe to store on the server. */
export async function sealWithRecovery(privateKey: CryptoKey, code: string): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const jwk = await subtle().exportKey("jwk", privateKey);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: bytes(RECOVERY_INFO) }, await recoveryAesKey(code, salt), bytes(JSON.stringify(jwk)));
  const blob: RecoveryBlob = { v: 2, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  return JSON.stringify(blob);
}

/** Opens a recovery copy. Throws if the key is wrong. */
export async function openWithRecovery(sealed: string, code: string): Promise<Identity> {
  const b = JSON.parse(sealed) as RecoveryBlob;
  if (b.v !== 2) throw new Error("Unsupported recovery format.");
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(b.iv), additionalData: bytes(RECOVERY_INFO) }, await recoveryAesKey(code, fromB64(b.salt)), fromB64(b.ct));
  return importIdentityJwk(JSON.parse(dec.decode(plain)) as JsonWebKey);
}

/* ---------- device link ---------- */

const LINK_CHARS = 8; // 40 bits: far too many for a server to search through while a request is open

export type LinkKeys = { publicKey: string; privateKey: CryptoKey };

/** One-time key pair for a new device. The private half cannot leave this browser. */
export async function newLinkKeys(): Promise<LinkKeys> {
  const pair = await subtle().generateKey(EC, false, ["deriveBits"]);
  return { publicKey: toB64(await subtle().exportKey("spki", pair.publicKey)), privateKey: pair.privateKey };
}

/** The code both devices show for a link request. It depends only on the new device's one-time public key. */
export async function linkCode(requestPublicKey: string): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", bytes(`campuspool-link-v1|${requestPublicKey}`)));
  return toBase32(digest, LINK_CHARS);
}

async function linkAesKey(myPrivate: CryptoKey, theirPublicB64: string, linkId: string, requestPub: string, approverPub: string): Promise<CryptoKey> {
  const bits = await subtle().deriveBits({ name: "ECDH", public: await importPublicKey(theirPublicB64) }, myPrivate, 256);
  const base = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(new ArrayBuffer(32)), info: bytes(`campuspool-link-v1:${linkId}:${requestPub}:${approverPub}`) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Run on the existing device after the student typed the matching code. */
export async function sealForLink(identity: CryptoKey, linkId: string, requestPublicKey: string): Promise<{ publicKey: string; sealed: string }> {
  const mine = await subtle().generateKey(EC, false, ["deriveBits"]);
  const approverPub = toB64(await subtle().exportKey("spki", mine.publicKey));
  const key = await linkAesKey(mine.privateKey, requestPublicKey, linkId, requestPublicKey, approverPub);
  const iv = randomBytes(12);
  const jwk = await subtle().exportKey("jwk", identity);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: bytes(`campuspool-link-v1:${linkId}`) }, key, bytes(JSON.stringify(jwk)));
  return { publicKey: approverPub, sealed: JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) }) };
}

/** Run on the new device once the request is approved. Returns the student's identity. */
export async function openLink(link: LinkKeys, linkId: string, approverPublicKey: string, sealed: string): Promise<Identity> {
  const s = JSON.parse(sealed) as { v: number; iv: string; ct: string };
  if (s.v !== 1) throw new Error("Unsupported link format.");
  const key = await linkAesKey(link.privateKey, approverPublicKey, linkId, link.publicKey, approverPublicKey);
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(s.iv), additionalData: bytes(`campuspool-link-v1:${linkId}`) }, key, fromB64(s.ct));
  return importIdentityJwk(JSON.parse(dec.decode(plain)) as JsonWebKey);
}

/* ---------- older passphrase scheme (read only, to move students over) ---------- */

export type WrappedKey = { v: 1; salt: string; iv: string; iter: number; ct: string };

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", bytes(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

/** Used by the tests and by students who still have the old passphrase copy. */
export async function wrapPrivateKey(privateKey: CryptoKey, passphrase: string, iter = PBKDF2_ITERATIONS): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrapKey = await passphraseKey(passphrase, salt, iter);
  const ct = await subtle().wrapKey("pkcs8", privateKey, wrapKey, { name: "AES-GCM", iv });
  const blob: WrappedKey = { v: 1, salt: toB64(salt), iv: toB64(iv), iter, ct: toB64(ct) };
  return JSON.stringify(blob);
}

/** Opens an old passphrase copy. Throws if the passphrase is wrong. */
export async function unwrapPrivateKey(wrapped: string, passphrase: string, extractable = true): Promise<CryptoKey> {
  const w = JSON.parse(wrapped) as WrappedKey;
  if (w.v !== 1) throw new Error("Unsupported key format.");
  const wrapKey = await passphraseKey(passphrase, fromB64(w.salt), w.iter);
  return subtle().unwrapKey("pkcs8", fromB64(w.ct), wrapKey, { name: "AES-GCM", iv: fromB64(w.iv) }, EC, extractable, ["deriveBits"]);
}

/* ---------- conversations and messages ---------- */

/** Both students derive the same key for the same conversation. */
export async function conversationKey(myPrivate: CryptoKey, peerPublicB64: string, conversationId: string): Promise<CryptoKey> {
  const peer = await importPublicKey(peerPublicB64);
  const bits = await subtle().deriveBits({ name: "ECDH", public: peer }, myPrivate, 256);
  const hkdf = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(new ArrayBuffer(32)), info: bytes(`campuspool-chat-v1:${conversationId}`) },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Binds a message to its conversation and sender so it cannot be replayed elsewhere. */
export const messageContext = (conversationId: string, senderUserId: number): Uint8Array<ArrayBuffer> => bytes(`campuspool:chat:${conversationId}:${senderUserId}`);

/** Everything a chat message can carry. All of it is encrypted before it leaves the browser. */
export type Payload =
  | { k: "text"; t: string }
  | { k: "img"; mime: string; iv: string }
  | { k: "sticker"; id: string }
  | { k: "gif"; url: string; w: number; h: number; title?: string }
  | { k: "react"; to: number; e: string };

/** Returns an envelope string the server stores without being able to read it. */
export async function encryptPayload(key: CryptoKey, payload: Payload, context: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: context }, key, bytes(JSON.stringify(payload)));
  return toB64(bytes(JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) })));
}

export async function decryptPayload(key: CryptoKey, envelope: string, context: Uint8Array<ArrayBuffer>): Promise<Payload> {
  const e = JSON.parse(dec.decode(fromB64(envelope))) as { v: number; iv: string; ct: string };
  if (e.v !== 1) throw new Error("Unsupported message format.");
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(e.iv), additionalData: context }, key, fromB64(e.ct));
  return JSON.parse(dec.decode(plain)) as Payload;
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>, context: Uint8Array<ArrayBuffer>): Promise<{ iv: string; data: Uint8Array<ArrayBuffer> }> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: context }, key, data);
  return { iv: toB64(iv), data: new Uint8Array(ct) };
}

export async function decryptBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>, ivB64: string, context: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: fromB64(ivB64), additionalData: context }, key, data));
}

/** 12 groups of 4 digits both students can compare out loud to confirm no one is in the middle. */
export async function safetyNumber(myPublicB64: string, peerPublicB64: string): Promise<string> {
  const [a, b] = [myPublicB64, peerPublicB64].sort();
  const digest = new Uint8Array(await subtle().digest("SHA-256", bytes(`${a}|${b}`)));
  let n = BigInt(0);
  const eight = BigInt(8);
  for (const byte of digest.subarray(0, 20)) n = (n << eight) | BigInt(byte);
  const digits = n.toString().padStart(48, "0").slice(-48);
  return digits.match(/.{4}/g)!.join(" ");
}
