"use client";

/**
 * Secure (end-to-end encrypted) chat state. Keys are made and used only in the browser; see lib/e2ee.ts.
 *
 * status:
 *   loading       checking keys
 *   ready         this device holds the student's chat key: nothing to type, ever
 *   needs-device  the account has a chat key but this browser does not yet (a new device)
 *   offline       the server could not be reached; retry()
 *
 * The key is kept in this browser's IndexedDB across sign-outs, so signing back in needs nothing.
 * Settings has "Sign out and remove chat keys" for shared computers.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import {
  conversationKey,
  describeIdentity,
  generateIdentity,
  linkCode,
  messageContext,
  newLinkKeys,
  newRecoveryKey,
  normalizeCode,
  openLink,
  openWithRecovery,
  safetyNumber,
  sealForLink,
  sealWithRecovery,
  unwrapPrivateKey,
  type Identity,
  type LinkKeys,
} from "./e2ee";
import { forgetKey, loadKey, saveKey } from "./keystore";
import { useStore } from "./store";

export type SecureStatus = "loading" | "ready" | "needs-device" | "offline";
type KeysDto = { publicKey: string | null; recovery: string | null; legacyWrappedKey: string | null };

export type PendingLink = { id: string; label: string; publicKey: string; createdAt: number; expiresAt: number; code: string };
export type LinkRequest = { id: string; code: string; expiresAt: number; state: "waiting" | "denied" | "expired" | "failed"; error?: string };

export type ConversationCrypto =
  | { ready: false }
  | { ready: true; key: CryptoKey; safety: string; peerPublicKey: string; peerChanged: boolean; verified: boolean };

type Ctx = {
  status: SecureStatus;
  myUserId: number | null;
  /** False only for a device set up with the old passphrase scheme; it can chat but cannot pass keys on. */
  canShare: boolean;
  hasRecovery: boolean;
  hasLegacy: boolean;
  retry(): void;

  /* a new device */
  link: LinkRequest | null;
  startLink(): Promise<void>;
  cancelLink(): Promise<void>;
  restoreWithRecovery(code: string): Promise<void>;
  /** Opens the old passphrase copy once and moves this device to the new scheme. Works on old devices too. */
  restoreWithPassphrase(passphrase: string): Promise<void>;
  startFresh(): Promise<void>;

  /* a device that already has the key */
  pendingLinks: PendingLink[];
  approveLink(id: string, typedCode: string): Promise<void>;
  denyLink(id: string): Promise<void>;
  createRecoveryKey(): Promise<string>;
  removeRecoveryKey(): Promise<void>;
  forgetThisDevice(): Promise<void>;

  /* conversations */
  conversation(conversationId: string, peerUserId: string): Promise<ConversationCrypto>;
  /** Key for opening chat-list previews. Null when either side has no key yet. */
  previewKey(conversationId: string, peerPublicKey: string | null): Promise<CryptoKey | null>;
  context(conversationId: string, senderUserId: number): Uint8Array<ArrayBuffer>;
  markVerified(peerUserId: string, safety: string): void;
  acceptNewKey(peerUserId: string, peerPublicKey: string): void;
};

const SecureContext = createContext<Ctx | null>(null);

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone or iPad" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const notReady = () => new Error("Secure chat is not ready on this device yet.");
const cannotShare = () => new Error("This device set up chat with the old passphrase. Open Settings > Secure chat and enter that passphrase once to update it, or approve from another device.");

export function SecureChatProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const { me, ready, lastEvent } = useStore();
  const myUserId = me.userId ?? null;
  const [status, setStatus] = useState<SecureStatus>("loading");
  const [account, setAccount] = useState<KeysDto | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [pendingLinks, setPending] = useState<PendingLink[]>([]);
  const [link, setLink] = useState<LinkRequest | null>(null);
  const [attempt, setAttempt] = useState(0);
  const identity = useRef<Identity | null>(null);
  const linkKeys = useRef<LinkKeys | null>(null);
  const cache = useRef(new Map<string, CryptoKey>());

  // Signing out clears what is in memory. The key itself stays in this browser so the next sign-in needs nothing.
  useEffect(() => {
    if (authStatus === "anonymous") {
      identity.current = null;
      linkKeys.current = null;
      cache.current.clear();
      setAccount(null);
      setPending([]);
      setLink(null);
      setStatus("loading");
    }
  }, [authStatus]);

  const adopt = useCallback(
    async (id: Identity) => {
      identity.current = id;
      cache.current.clear();
      setCanShare(id.privateKey.extractable);
      if (myUserId !== null) await saveKey(myUserId, id).catch(() => undefined);
      setStatus("ready");
    },
    [myUserId],
  );

  // Find, or quietly create, this student's chat key.
  useEffect(() => {
    if (authStatus !== "authed" || !ready || myUserId === null) return;
    let cancelled = false;
    (async () => {
      try {
        let dto = await api<KeysDto>("/e2ee/me");
        const saved = await loadKey(myUserId).catch(() => undefined);
        if (cancelled) return;
        if (!dto.publicKey) {
          // First time anywhere: make keys now. (If this browser still has keys, for example after the database was reset, publish those.)
          const id = saved ?? (await generateIdentity());
          try {
            dto = await api<KeysDto>("/e2ee/me", { method: "PUT", body: { publicKey: id.publicKey } });
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) throw e;
            dto = await api<KeysDto>("/e2ee/me"); // another device set up first
          }
          if (cancelled) return;
          setAccount(dto);
          if (dto.publicKey === id.publicKey) return void (await adopt(id));
          return setStatus("needs-device");
        }
        setAccount(dto);
        if (saved && saved.publicKey === dto.publicKey) return void (await adopt(saved));
        if (saved) await forgetKey(myUserId).catch(() => undefined); // left over from before a reset
        setStatus("needs-device");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, ready, myUserId, adopt, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  /* ---------- requests from the student's other devices ---------- */

  const loadPending = useCallback(async () => {
    if (status !== "ready") return;
    try {
      const r = await api<{ links: Omit<PendingLink, "code">[] }>("/e2ee/links");
      setPending(await Promise.all(r.links.map(async (l) => ({ ...l, code: await linkCode(l.publicKey) }))));
    } catch {
      /* try again on the next event */
    }
  }, [status]);

  useEffect(() => {
    void loadPending();
  }, [loadPending, lastEvent]);

  useEffect(() => {
    if (status !== "ready") return;
    const t = window.setInterval(() => void loadPending(), 30000);
    return () => window.clearInterval(t);
  }, [status, loadPending]);

  const approveLink = useCallback(
    async (id: string, typedCode: string) => {
      const l = pendingLinks.find((x) => x.id === id);
      if (!l) throw new Error("This request has expired. Start again on the new device.");
      if (normalizeCode(typedCode) !== l.code) throw new Error("That code does not match the one on your new device. Check each character and try again.");
      const mine = identity.current;
      if (!mine) throw notReady();
      if (!mine.privateKey.extractable) throw cannotShare();
      const sealed = await sealForLink(mine.privateKey, id, l.publicKey);
      await api(`/e2ee/links/${id}/approve`, { method: "POST", body: sealed });
      setPending((p) => p.filter((x) => x.id !== id));
    },
    [pendingLinks],
  );

  const denyLink = useCallback(async (id: string) => {
    setPending((p) => p.filter((x) => x.id !== id));
    await api(`/e2ee/links/${id}/deny`, { method: "POST", body: {} }).catch(() => undefined);
  }, []);

  /* ---------- this device asking for the key ---------- */

  const startLink = useCallback(async () => {
    const keys = await newLinkKeys();
    linkKeys.current = keys;
    const r = await api<{ id: string; expiresAt: number }>("/e2ee/links", { method: "POST", body: { publicKey: keys.publicKey, label: deviceLabel() } });
    setLink({ id: r.id, code: await linkCode(keys.publicKey), expiresAt: r.expiresAt, state: "waiting" });
  }, []);

  const cancelLink = useCallback(async () => {
    const current = link;
    setLink(null);
    linkKeys.current = null;
    if (current) await api(`/e2ee/links/${current.id}`, { method: "DELETE" }).catch(() => undefined);
  }, [link]);

  const linkId = link?.id;
  const linkState = link?.state;
  const linkExpires = link?.expiresAt;
  const accountKey = account?.publicKey ?? null;

  useEffect(() => {
    if (!linkId || linkState !== "waiting") return;
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      if (linkExpires && Date.now() > linkExpires) return setLink((l) => l && { ...l, state: "expired" });
      try {
        const r = await api<{ status: string; approverKey: string | null; sealed: string | null }>(`/e2ee/links/${linkId}`);
        if (stopped) return;
        if (r.status === "DENIED") return setLink((l) => l && { ...l, state: "denied" });
        if (r.status === "APPROVED" && r.approverKey && r.sealed && linkKeys.current) {
          stopped = true;
          try {
            const id = await openLink(linkKeys.current, linkId, r.approverKey, r.sealed);
            if (id.publicKey !== accountKey) throw new Error("The key that arrived does not match your account. Try again.");
            linkKeys.current = null;
            setLink(null);
            void api(`/e2ee/links/${linkId}`, { method: "DELETE" }).catch(() => undefined);
            await adopt(id);
          } catch (e) {
            setLink((l) => l && { ...l, state: "failed", error: e instanceof Error ? e.message : "The key could not be opened." });
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setLink((l) => l && { ...l, state: "expired" });
      }
    };
    void check();
    const t = window.setInterval(() => void check(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [linkId, linkState, linkExpires, accountKey, adopt, lastEvent]);

  const restoreWithRecovery = useCallback(
    async (code: string) => {
      if (!account?.recovery) throw new Error("No recovery key was saved for this account.");
      let id: Identity;
      try {
        id = await openWithRecovery(account.recovery, code);
      } catch {
        throw new Error("That recovery key is not right. Check each group of four.");
      }
      if (id.publicKey !== account.publicKey) throw new Error("That recovery key belongs to older chat keys.");
      await adopt(id);
    },
    [account, adopt],
  );

  const restoreWithPassphrase = useCallback(
    async (passphrase: string) => {
      if (!account?.legacyWrappedKey) throw new Error("There is no passphrase copy for this account.");
      let id: Identity;
      try {
        id = await describeIdentity(await unwrapPrivateKey(account.legacyWrappedKey, passphrase, true));
      } catch {
        throw new Error("That passphrase is not right.");
      }
      if (id.publicKey !== account.publicKey) throw new Error("That passphrase belongs to older chat keys.");
      await adopt(id);
      // The passphrase copy is no longer needed: new devices are approved from this one instead.
      await api("/e2ee/me/legacy", { method: "DELETE" }).catch(() => undefined);
      setAccount((a) => a && { ...a, legacyWrappedKey: null });
    },
    [account, adopt],
  );

  const startFresh = useCallback(async () => {
    const id = await generateIdentity();
    const dto = await api<KeysDto>("/e2ee/me", { method: "PUT", body: { publicKey: id.publicKey, replace: true } });
    setAccount(dto);
    setLink(null);
    linkKeys.current = null;
    await adopt(id);
  }, [adopt]);

  const createRecoveryKey = useCallback(async () => {
    const mine = identity.current;
    if (!mine) throw notReady();
    if (!mine.privateKey.extractable) throw cannotShare();
    const code = newRecoveryKey();
    const sealed = await sealWithRecovery(mine.privateKey, code);
    await api("/e2ee/me/recovery", { method: "PUT", body: { recovery: sealed } });
    setAccount((a) => a && { ...a, recovery: sealed });
    return code;
  }, []);

  const removeRecoveryKey = useCallback(async () => {
    await api("/e2ee/me/recovery", { method: "PUT", body: { recovery: null } });
    setAccount((a) => a && { ...a, recovery: null });
  }, []);

  const forgetThisDevice = useCallback(async () => {
    if (myUserId !== null) await forgetKey(myUserId).catch(() => undefined);
    identity.current = null;
    cache.current.clear();
    setPending([]);
    setStatus("needs-device");
  }, [myUserId]);

  /* ---------- conversations ---------- */

  const derive = useCallback(async (conversationId: string, peerPublicKey: string) => {
    const mine = identity.current;
    if (!mine) return null;
    const cacheKey = `${conversationId}:${peerPublicKey}`;
    let key = cache.current.get(cacheKey);
    if (!key) {
      key = await conversationKey(mine.privateKey, peerPublicKey, conversationId);
      cache.current.set(cacheKey, key);
    }
    return key;
  }, []);

  const conversation = useCallback(
    async (conversationId: string, peerUserId: string): Promise<ConversationCrypto> => {
      const mine = identity.current;
      if (!mine || myUserId === null) return { ready: false };
      const peer = await api<{ publicKey: string | null }>(`/e2ee/peers/${peerUserId}`);
      if (!peer.publicKey) return { ready: false };
      const key = await derive(conversationId, peer.publicKey);
      if (!key) return { ready: false };
      const safety = await safetyNumber(mine.publicKey, peer.publicKey);
      const seenKey = `cp-peer-${myUserId}-${peerUserId}`;
      const seen = window.localStorage.getItem(seenKey);
      if (seen === null) window.localStorage.setItem(seenKey, peer.publicKey);
      const verified = window.localStorage.getItem(`cp-verified-${myUserId}-${peerUserId}`) === safety;
      return { ready: true, key, safety, peerPublicKey: peer.publicKey, peerChanged: seen !== null && seen !== peer.publicKey, verified };
    },
    [myUserId, derive],
  );

  const previewKey = useCallback(
    async (conversationId: string, peerPublicKey: string | null) => (peerPublicKey && status === "ready" ? derive(conversationId, peerPublicKey) : null),
    [derive, status],
  );

  const context = useCallback((conversationId: string, senderUserId: number) => messageContext(conversationId, senderUserId), []);
  const markVerified = useCallback(
    (peerUserId: string, safety: string) => {
      if (myUserId !== null) window.localStorage.setItem(`cp-verified-${myUserId}-${peerUserId}`, safety);
    },
    [myUserId],
  );
  const acceptNewKey = useCallback(
    (peerUserId: string, peerPublicKey: string) => {
      if (myUserId !== null) window.localStorage.setItem(`cp-peer-${myUserId}-${peerUserId}`, peerPublicKey);
    },
    [myUserId],
  );

  const value = useMemo<Ctx>(
    () => ({
      status,
      myUserId,
      canShare,
      hasRecovery: !!account?.recovery,
      hasLegacy: !!account?.legacyWrappedKey,
      retry,
      link,
      startLink,
      cancelLink,
      restoreWithRecovery,
      restoreWithPassphrase,
      startFresh,
      pendingLinks,
      approveLink,
      denyLink,
      createRecoveryKey,
      removeRecoveryKey,
      forgetThisDevice,
      conversation,
      previewKey,
      context,
      markVerified,
      acceptNewKey,
    }),
    [
      status,
      myUserId,
      canShare,
      account,
      retry,
      link,
      startLink,
      cancelLink,
      restoreWithRecovery,
      restoreWithPassphrase,
      startFresh,
      pendingLinks,
      approveLink,
      denyLink,
      createRecoveryKey,
      removeRecoveryKey,
      forgetThisDevice,
      conversation,
      previewKey,
      context,
      markVerified,
      acceptNewKey,
    ],
  );
  return <SecureContext.Provider value={value}>{children}</SecureContext.Provider>;
}

export function useSecureChat(): Ctx {
  const ctx = useContext(SecureContext);
  if (!ctx) throw new Error("useSecureChat must be used inside <SecureChatProvider>");
  return ctx;
}
