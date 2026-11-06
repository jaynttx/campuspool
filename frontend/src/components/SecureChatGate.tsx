"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { groupCode } from "@/lib/e2ee";
import { usePrefs } from "@/lib/prefs";
import { useSecureChat } from "@/lib/secure-chat";
import { playSound } from "@/lib/sounds";
import { KeyIcon, LockIcon, SmartphoneIcon } from "./Icons";

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="card mx-auto max-w-lg space-y-5 p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime text-forest-deep">
        <LockIcon className="h-6 w-6" aria-hidden="true" />
      </span>
      {children}
    </div>
  );
}

function useCountdown(until: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [until]);
  if (!until) return "";
  const s = Math.max(0, Math.round((until - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Big, readable code that both devices show. */
function CodeDisplay({ code }: { code: string }) {
  return (
    <p className="code-display tabular" aria-label={`Code ${code.split("").join(" ")}`}>
      {groupCode(code)}
    </p>
  );
}

function SecretForm({ label, hint, submit, cta, type = "text" }: { label: string; hint?: string; submit: (value: string) => Promise<void>; cta: string; type?: "text" | "password" }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = `sf-${label.replace(/\W+/g, "-").toLowerCase()}`;
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await submit(value);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div>
        <label htmlFor={id} className="label">
          {label}
        </label>
        <input id={id} type={type} className="field" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={!!error} />
        {hint && <p className="hint">{hint}</p>}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !value.trim()}>
        {busy ? "Opening..." : cta}
      </button>
    </form>
  );
}

/** Shown on a browser that does not hold the student's chat key yet. */
function DeviceSetup() {
  const secure = useSecureChat();
  const { link } = secure;
  const left = useCountdown(link?.state === "waiting" ? link.expiresAt : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [other, setOther] = useState<"recovery" | "passphrase" | "fresh" | null>(null);

  async function getCode() {
    setError("");
    setBusy(true);
    try {
      await secure.startLink();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div>
        <h2 className="font-display text-2xl font-semibold">Open your chats on this device</h2>
        <p className="mt-1 text-sm text-mist">Your messages are locked with a key that lives on your own devices. Pass it to this one from a phone or laptop where your chats already open. You only do this once per device.</p>
      </div>

      {!link ? (
        <div>
          <button type="button" className="btn btn-primary" onClick={() => void getCode()} disabled={busy}>
            <SmartphoneIcon className="h-4 w-4" aria-hidden="true" /> {busy ? "Getting a code..." : "Approve from my other device"}
          </button>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </div>
      ) : link.state === "waiting" ? (
        <div className="space-y-3 rounded-2xl border border-line bg-sage/60 p-4">
          <p className="text-sm font-medium">On your other device, open CampusPool. A box asks for this code. Type it there:</p>
          <CodeDisplay code={link.code} />
          <p className="flex items-center gap-2 text-sm text-mist" role="status">
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Waiting for approval. The code expires in {left}.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void secure.cancelLink()}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-signal/40 bg-warn-bg p-4 text-sm" role="alert">
          <p className="font-medium">
            {link.state === "denied" ? "The request was declined on your other device." : link.state === "expired" ? "That code expired before it was approved." : link.error || "The key could not be opened."}
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void secure.cancelLink().then(getCode)}>
            Get a new code
          </button>
        </div>
      )}

      <div className="space-y-3 border-t border-line pt-4 text-sm">
        <p className="font-medium">No other device nearby?</p>
        <div className="flex flex-wrap gap-2">
          {secure.hasRecovery && (
            <button type="button" className={`btn btn-ghost btn-sm ${other === "recovery" ? "is-on" : ""}`} onClick={() => setOther(other === "recovery" ? null : "recovery")} aria-expanded={other === "recovery"}>
              <KeyIcon className="h-4 w-4" aria-hidden="true" /> Use my recovery key
            </button>
          )}
          {secure.hasLegacy && (
            <button type="button" className={`btn btn-ghost btn-sm ${other === "passphrase" ? "is-on" : ""}`} onClick={() => setOther(other === "passphrase" ? null : "passphrase")} aria-expanded={other === "passphrase"}>
              Use my old chat passphrase
            </button>
          )}
          <button type="button" className={`btn btn-ghost btn-sm ${other === "fresh" ? "is-on" : ""}`} onClick={() => setOther(other === "fresh" ? null : "fresh")} aria-expanded={other === "fresh"}>
            Start fresh on this device
          </button>
        </div>
        {other === "recovery" && <SecretForm label="Recovery key" hint="24 letters and numbers, in groups of four. Spaces and dashes are fine." cta="Open my chats" submit={secure.restoreWithRecovery} />}
        {other === "passphrase" && (
          <SecretForm
            label="Old chat passphrase"
            type="password"
            hint="You will not need it again: after this, new devices are approved from this one."
            cta="Open my chats"
            submit={secure.restoreWithPassphrase}
          />
        )}
        {other === "fresh" && <StartFresh />}
      </div>
    </Card>
  );
}

function StartFresh({ onDone }: { onDone?: () => void }) {
  const secure = useSecureChat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3 rounded-2xl border border-alert/30 bg-bad-bg p-4">
      <p>
        This makes new chat keys. <strong>Messages from before cannot be opened again on any device</strong>, your other devices will need approving again, and the people you chat with will see your security code change.
      </p>
      <button
        type="button"
        className="btn btn-bad btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await secure.startFresh();
            onDone?.();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Making new keys..." : "Make new keys"}
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** Shows children once this device holds the chat key. */
export function SecureChatGate({ children }: { children: ReactNode }) {
  const { status, retry } = useSecureChat();
  const { sounds } = usePrefs();
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === "needs-device" && status === "ready") playSound("success", sounds);
    previous.current = status;
  }, [status, sounds]);

  if (status === "loading") return <div className="skeleton h-48" aria-busy="true" role="status" aria-label="Loading secure chat" />;
  if (status === "offline") {
    return (
      <Card>
        <div>
          <h2 className="font-display text-2xl font-semibold">Secure chat could not load</h2>
          <p className="mt-1 text-sm text-mist">The CampusPool server did not answer. Check your connection, then try again.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={retry}>
          Try again
        </button>
      </Card>
    );
  }
  if (status === "needs-device") return <DeviceSetup />;
  return <>{children}</>;
}

/** Appears on every device that holds the key whenever a new device asks for it. */
export function DeviceLinkPrompt() {
  const secure = useSecureChat();
  const { sounds } = usePrefs();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [signedOutOthers, setSignedOutOthers] = useState<number | null>(null);
  const request = secure.status === "ready" ? secure.pendingLinks[0] : undefined;
  const requestId = request?.id;
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (requestId && shown.current !== requestId) {
      shown.current = requestId;
      setCode("");
      setError("");
      playSound("ping", sounds);
    }
  }, [requestId, sounds]);

  if (declined) {
    return (
      <div role="dialog" aria-labelledby="dl-title" className="card device-prompt">
        <p id="dl-title" className="font-display text-lg font-semibold">
          Request declined
        </p>
        <p className="mt-1 text-sm text-mist">If that was not you, someone may know how to sign in as you. Sign out your other browsers to be safe.</p>
        {signedOutOthers !== null && <p className="mt-2 text-sm text-verified">Signed out of {signedOutOthers === 1 ? "1 other browser" : `${signedOutOthers} other browsers`}.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {signedOutOthers === null && (
            <button
              type="button"
              className="btn btn-bad btn-sm"
              onClick={async () => {
                try {
                  const r = await api<{ signedOut: number }>("/auth/logout-others", { method: "POST", body: {} });
                  setSignedOutOthers(r.signedOut);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Sign out other browsers
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setDeclined(false), setSignedOutOthers(null))}>
            Close
          </button>
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    );
  }
  if (!request) return null;

  async function approve(e: FormEvent) {
    e.preventDefault();
    if (!request) return;
    setBusy(true);
    setError("");
    try {
      await secure.approveLink(request.id, code);
      playSound("success", sounds);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-labelledby="dl-title" aria-describedby="dl-text" className="card device-prompt">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-forest-deep">
          <SmartphoneIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p id="dl-title" className="font-display text-lg font-semibold">
            Approve {request.label}?
          </p>
          <p id="dl-text" className="mt-1 text-sm text-mist">
            It wants to open your chats. If you are signing in there right now, type the code it shows.
          </p>
        </div>
      </div>
      <form onSubmit={approve} className="mt-3 space-y-2" noValidate>
        <label htmlFor="dl-code" className="sr-only">
          Code shown on the new device
        </label>
        <input
          id="dl-code"
          className="field code-field tabular"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          aria-invalid={!!error}
        />
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || code.replace(/[\s-]/g, "").length < 8}>
            {busy ? "Approving..." : "Approve"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void secure.denyLink(request.id);
              setDeclined(true);
            }}
          >
            That was not me
          </button>
        </div>
      </form>
    </div>
  );
}

function RecoveryKeyPanel() {
  const secure = useSecureChat();
  const { sounds } = usePrefs();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError("");
    try {
      setCode(await secure.createRecoveryKey());
      setCopied(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-sage/60 p-4">
        <p className="text-sm font-medium">Your recovery key. Write it down or save it in a password manager. It is shown only now.</p>
        <p className="recovery-key tabular">{code}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([`CampusPool chat recovery key\n\n${code}\n\nKeep this private. Anyone with it and your sign-in can read your chats.\n`], { type: "text/plain" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "campuspool-recovery-key.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download as a file
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setCode(null);
              playSound("success", sounds);
            }}
          >
            I saved it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-medium">Recovery key</p>
      <p className="text-sm text-mist">
        {secure.hasRecovery
          ? "A recovery key is saved. Use it if you ever lose all your devices."
          : "Optional. If you lose every device, a recovery key is the only way back into old messages. Nobody else, including CampusPool, can use or reset it."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void create()} disabled={busy || !secure.canShare}>
          <KeyIcon className="h-4 w-4" aria-hidden="true" /> {busy ? "Creating..." : secure.hasRecovery ? "Replace recovery key" : "Create a recovery key"}
        </button>
        {secure.hasRecovery && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await secure.removeRecoveryKey();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Remove it
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** The Secure chat section of Settings. */
export function SecureChatSettings() {
  const secure = useSecureChat();
  const { signOut } = useAuth();
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);

  if (secure.status === "loading") return <p className="text-sm text-mist">Checking...</p>;
  if (secure.status === "offline") return <p className="text-sm text-mist">Could not reach the server.</p>;
  if (secure.status === "needs-device") {
    return (
      <p className="text-sm text-mist">
        This device cannot open your chats yet.{" "}
        <Link href="/chats" className="font-semibold text-forest underline underline-offset-4">
          Open Messages
        </Link>{" "}
        to approve it from another device.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-sm">
        <LockIcon className="h-4 w-4 text-forest" aria-hidden="true" />
        On. Messages open automatically on this device. New devices are approved from one you already use.
      </p>

      {!secure.canShare && (
        <div className="space-y-3 rounded-2xl border border-signal/40 bg-warn-bg p-4 text-sm">
          <p className="font-medium">Update this device</p>
          <p className="text-mist">This device was set up with a chat passphrase. Enter it one last time so this device can approve your other devices and make a recovery key.</p>
          {secure.hasLegacy ? (
            <SecretForm label="Old chat passphrase" type="password" cta="Update this device" submit={secure.restoreWithPassphrase} />
          ) : (
            <p className="text-mist">The passphrase copy was already used on another device. Approve this one from there instead, after removing its keys below.</p>
          )}
        </div>
      )}

      <RecoveryKeyPanel />

      <div className="space-y-2 border-t border-line pt-4">
        <p className="font-medium">Shared or public computer?</p>
        <p className="text-sm text-mist">Your chat key stays in this browser after you sign out, so signing back in needs nothing. On a computer others use, remove it as you leave.</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await secure.forgetThisDevice();
            await signOut();
          }}
        >
          Sign out and remove chat keys
        </button>
      </div>

      <div className="border-t border-line pt-4 text-sm">
        {!reset ? (
          <button type="button" className="font-medium text-alert underline underline-offset-4" onClick={() => setReset(true)}>
            Reset secure chat (new keys)
          </button>
        ) : (
          <StartFresh onDone={() => setReset(false)} />
        )}
      </div>
    </div>
  );
}
