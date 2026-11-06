/**
 * Real encryption checks for src/lib/e2ee.ts (runs in Node 20+ with WebCrypto): `npm run test:e2ee`.
 */
import * as mod from "../src/lib/e2ee.ts";
const e: typeof import("../src/lib/e2ee.ts") = (mod as any).default ?? mod;

let passed = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
  console.log("PASS", msg);
};
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

const alice = await e.generateIdentity();
const bob = await e.generateIdentity();

/* conversations */
const kA = await e.conversationKey(alice.privateKey, bob.publicKey, "42");
const kB = await e.conversationKey(bob.privateKey, alice.publicKey, "42");
const ctxFromAlice = e.messageContext("42", 7);
const env = await e.encryptPayload(kA, { k: "text", t: "meet at the main gate" }, ctxFromAlice);
const got = await e.decryptPayload(kB, env, ctxFromAlice);
ok(got.k === "text" && got.t === "meet at the main gate", "peer decrypts the message");
ok(!Buffer.from(env, "base64url").toString().includes("main gate"), "envelope does not contain the plaintext");

const parsed = JSON.parse(Buffer.from(env, "base64url").toString());
parsed.ct = parsed.ct.slice(0, -4) + "AAAA";
const tampered = Buffer.from(JSON.stringify(parsed)).toString("base64url");
ok(await fails(() => e.decryptPayload(kB, tampered, ctxFromAlice)), "tampered ciphertext is rejected");
ok(await fails(() => e.decryptPayload(kB, env, e.messageContext("43", 7))), "message cannot be moved to another conversation");
ok(await fails(() => e.decryptPayload(kB, env, e.messageContext("42", 8))), "message cannot be attributed to another sender");
const eve = await e.generateIdentity();
const kE = await e.conversationKey(eve.privateKey, alice.publicKey, "42");
ok(await fails(() => e.decryptPayload(kE, env, ctxFromAlice)), "a third person cannot decrypt");
const env2 = await e.encryptPayload(kA, { k: "text", t: "meet at the main gate" }, ctxFromAlice);
ok(env !== env2, "same text encrypts differently each time (fresh IV)");

/* new message kinds */
for (const p of [
  { k: "sticker", id: "auto" },
  { k: "gif", url: "https://media.giphy.com/media/x/giphy.gif", w: 200, h: 150 },
  { k: "react", to: 12, e: "❤️" },
] as const) {
  const back = await e.decryptPayload(kB, await e.encryptPayload(kA, p, ctxFromAlice), ctxFromAlice);
  ok(JSON.stringify(back) === JSON.stringify(p), `${p.k} message round-trips`);
}

/* photos */
const photo = new Uint8Array(new ArrayBuffer(4096));
for (let i = 0; i < photo.length; i++) photo[i] = i % 251;
const sealed = await e.encryptBytes(kA, photo, ctxFromAlice);
const opened = await e.decryptBytes(kB, sealed.data, sealed.iv, ctxFromAlice);
ok(Buffer.compare(Buffer.from(opened), Buffer.from(photo)) === 0, "photo round-trips");
ok(Buffer.compare(Buffer.from(sealed.data.subarray(0, 64)), Buffer.from(photo.subarray(0, 64))) !== 0, "photo ciphertext differs from the photo");

/* device link: the happy path */
const newDevice = await e.newLinkKeys();
ok(newDevice.privateKey.extractable === false, "one-time link key cannot be exported");
const codeShownOnNewDevice = await e.linkCode(newDevice.publicKey);
ok(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(codeShownOnNewDevice), "link code is 8 easy-to-read characters");
const codeOnOldDevice = await e.linkCode(newDevice.publicKey);
ok(codeShownOnNewDevice === codeOnOldDevice, "both devices show the same code");
const sealedLink = await e.sealForLink(alice.privateKey, "link-1", newDevice.publicKey);
ok(!sealedLink.sealed.includes('"d"'), "sealed link holds only ciphertext");
const moved = await e.openLink(newDevice, "link-1", sealedLink.publicKey, sealedLink.sealed);
ok(moved.publicKey === alice.publicKey, "new device receives the same identity");
const kMoved = await e.conversationKey(moved.privateKey, bob.publicKey, "42");
ok((await e.decryptPayload(kMoved, env2, ctxFromAlice)).k === "text", "new device reads old messages");

/* device link: a server swapping in its own one-time key changes the code, and cannot open the seal */
const serverKeys = await e.newLinkKeys();
ok((await e.linkCode(serverKeys.publicKey)) !== codeShownOnNewDevice, "a swapped one-time key shows a different code");
ok(await fails(() => e.openLink(serverKeys, "link-1", sealedLink.publicKey, sealedLink.sealed)), "only the requesting device can open the seal");
ok(await fails(() => e.openLink(newDevice, "link-2", sealedLink.publicKey, sealedLink.sealed)), "a seal cannot be reused for another request");
const otherApprover = await e.newLinkKeys();
ok(await fails(() => e.openLink(newDevice, "link-1", otherApprover.publicKey, sealedLink.sealed)), "a swapped approver key is rejected");

/* recovery key */
const recovery = e.newRecoveryKey();
ok(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/.test(recovery), "recovery key has 6 groups of 4");
const backup = await e.sealWithRecovery(alice.privateKey, recovery);
const restored = await e.openWithRecovery(backup, recovery.toLowerCase().replace(/-/g, " "));
ok(restored.publicKey === alice.publicKey, "recovery key restores the identity (any case, spaces allowed)");
ok(await fails(() => e.openWithRecovery(backup, e.newRecoveryKey())), "a wrong recovery key is rejected");
ok(await fails(() => e.openWithRecovery(backup, "too-short")), "a malformed recovery key is rejected");
ok(!backup.includes(recovery.replace(/-/g, "")), "recovery copy does not contain the recovery key");

/* older passphrase copies still open once (low iteration count only to keep the test quick) */
const wrapped = await e.wrapPrivateKey(alice.privateKey, "correct horse battery", 1000);
const fromLegacy = await e.unwrapPrivateKey(wrapped, "correct horse battery");
ok(fromLegacy.extractable === true, "legacy copy opens as a key that can move to new devices");
ok(await fails(() => e.unwrapPrivateKey(wrapped, "wrong passphrase!!")), "wrong legacy passphrase is rejected");

/* safety numbers */
const s1 = await e.safetyNumber(alice.publicKey, bob.publicKey);
const s2 = await e.safetyNumber(bob.publicKey, alice.publicKey);
const s3 = await e.safetyNumber(eve.publicKey, bob.publicKey);
ok(s1 === s2 && s1 !== s3 && s1.split(" ").length === 12, "safety numbers agree for the pair and change for an impostor");

console.log(`ALL ${passed} E2EE CHECKS PASSED`);
