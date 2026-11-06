"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { ArrowIcon, MailIcon, ShieldCheckIcon } from "@/components/Icons";
import { Wordmark } from "@/components/Logo";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DOMAIN = "thapar.edu";
type Mode = "signin" | "signup";
type Notice = "required" | "expired" | "signed-out" | null;
type OtpResponse = { ok: boolean; expiresInMinutes: number; delivery: "email" | "console" };

export default function LoginPage() {
  const { signedIn } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState(1);
  const [hostel, setHostel] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"email" | "name" | "code" | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [delivery, setDelivery] = useState<"email" | "console">("email");
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("notice");
    setNotice(n === "required" || n === "expired" || n === "signed-out" ? n : null);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const cleanEmail = email.trim().toLowerCase();

  async function requestCode() {
    const e: typeof errors = {};
    if (!cleanEmail.endsWith(`@${DOMAIN}`) || cleanEmail.length <= DOMAIN.length + 1 || cleanEmail.includes("+")) e.email = `Use your @${DOMAIN} email address (no + aliases).`;
    if (mode === "signup" && name.trim().length < 2) e.name = "Enter your full name.";
    setErrors(e);
    if (Object.keys(e).length > 0) return false;
    setBusy(true);
    try {
      const res = await api<OtpResponse>("/auth/request-otp", {
        method: "POST",
        body: { email: cleanEmail, purpose: mode, profile: mode === "signup" ? { name: name.trim(), branch: branch.trim(), year, hostel: hostel.trim() } : null },
      });
      setDelivery(res.delivery);
      setCooldown(30);
      setStep("code");
      setCode("");
      return true;
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onDetails(ev: FormEvent) {
    ev.preventDefault();
    await requestCode();
  }

  async function onVerify(ev: FormEvent) {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErrors({ code: "Enter the 6-digit code from the email." });
    setErrors({});
    setBusy(true);
    try {
      await api("/auth/verify-otp", { method: "POST", body: { email: cleanEmail, code } });
      signedIn(cleanEmail);
    } catch (err) {
      setErrors({ code: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("details");
    setErrors({});
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <aside className="on-forest relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-white lg:flex">
        <div className="[&_span]:text-white [&_.text-forest]:!text-lime">
          <Wordmark />
        </div>
        <div>
          <p className="eyebrow !text-lime">Thapar students only</p>
          <h1 className="mt-4 font-display text-6xl font-semibold leading-[1.05] tracking-tight">
            Find your people.
            <br />
            Share the ride.
            <br />
            <span className="italic text-lime">Split the fare.</span>
          </h1>
          <p className="mt-6 max-w-sm text-lg text-white/80">Ride pools and campus activities, open only to people with a working @{DOMAIN} mailbox.</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-white/70">
          <ShieldCheckIcon className="h-4 w-4 text-lime" aria-hidden="true" /> We never hold or move your money.
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>

          {notice && step === "details" && (
            <div role="status" className="mb-6 rounded-2xl border border-line bg-sage px-5 py-4 text-sm">
              {notice === "required" && (
                <>
                  <p className="font-semibold">Please sign in first</p>
                  <p className="mt-1 text-mist">
                    You need a CampusPool account to use this site. New here? Choose <strong className="text-ink">Create account</strong> first, then sign in with the code we email you.
                  </p>
                </>
              )}
              {notice === "expired" && (
                <>
                  <p className="font-semibold">Your session ended</p>
                  <p className="mt-1 text-mist">Please sign in again to carry on.</p>
                </>
              )}
              {notice === "signed-out" && <p className="font-semibold">You have signed out.</p>}
            </div>
          )}

          {step === "details" ? (
            <>
              <h2 className="font-display text-4xl font-semibold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
              <p className="mt-2 text-mist">
                {mode === "signin" ? `Enter your @${DOMAIN} email. We will send a one-time code.` : `Use your @${DOMAIN} email. We will confirm it with a one-time code.`}
              </p>

              <div role="tablist" aria-label="Sign in or create an account" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-sage p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => switchMode(m)} className={`rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? "bg-paper shadow-sm" : "text-mist hover:text-ink"}`}>
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form onSubmit={onDetails} className="mt-6 space-y-4" noValidate>
                {mode === "signup" && (
                  <>
                    <FormField id="name" label="Full name" error={errors.name}>
                      <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField id="branch" label="Branch (optional)">
                        <input id="branch" className="field" value={branch} onChange={(e) => setBranch(e.target.value)} />
                      </FormField>
                      <FormField id="year" label="Year">
                        <select id="year" className="field" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                          {[1, 2, 3, 4, 5].map((y) => (
                            <option key={y} value={y}>
                              Year {y}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                    <FormField id="hostel" label="Hostel (optional)">
                      <input id="hostel" className="field" value={hostel} onChange={(e) => setHostel(e.target.value)} />
                    </FormField>
                  </>
                )}
                <FormField id="email" label="Thapar email" error={errors.email}>
                  <input id="email" className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${DOMAIN}`} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
                </FormField>
                {errors.form && (
                  <p role="alert" className="rounded-xl border border-alert/40 bg-bad-bg px-4 py-3 text-sm text-alert">
                    {errors.form}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
                  {busy ? "Sending code..." : "Send me a code"} {!busy && <ArrowIcon className="h-5 w-5" />}
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime text-forest-deep">
                <MailIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="font-display text-4xl font-semibold tracking-tight">Check your email</h2>
              <p className="mt-2 text-mist">
                {delivery === "email" ? (
                  <>
                    If <span className="font-medium text-ink">{cleanEmail}</span> can sign in, a 6-digit code is on its way. It expires in 10 minutes.
                  </>
                ) : (
                  <>Development mode: email is not set up, so the code is printed in the backend terminal for {cleanEmail}.</>
                )}
              </p>
              <p className="mt-2 text-sm text-mist">No code? Check the spelling of your email. New here? Go back and choose Create account.</p>
              <form onSubmit={onVerify} className="mt-6 space-y-4" noValidate>
                <FormField id="code" label="One-time code" error={errors.code}>
                  <input
                    id="code"
                    className="field tabular text-center font-display text-3xl tracking-[0.5em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    aria-invalid={!!errors.code}
                    aria-describedby={errors.code ? "code-error" : undefined}
                    autoFocus
                  />
                </FormField>
                <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || code.length !== 6}>
                  {busy ? "Checking..." : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                <button type="button" className="font-medium text-forest underline underline-offset-4" onClick={() => setStep("details")}>
                  Use a different email
                </button>
                <button type="button" className="font-medium text-forest underline underline-offset-4 disabled:text-mist disabled:no-underline" disabled={cooldown > 0 || busy} onClick={() => void requestCode()}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
              {errors.form && (
                <p role="alert" className="mt-4 text-sm text-alert">
                  {errors.form}
                </p>
              )}
            </>
          )}

          <p className="mt-8 text-xs leading-relaxed text-mist">
            Signing in proves you can read mail at @{DOMAIN}. CampusPool does not check student ID numbers.{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              How we handle your data
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
