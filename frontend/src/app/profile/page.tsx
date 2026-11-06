"use client";

import { useState, type FormEvent } from "react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { FormField } from "@/components/FormField";
import { ShieldCheckIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Ready } from "@/components/Ready";
import { Pill } from "@/components/StatusPill";
import { timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";

type Errors = Partial<Record<"name" | "phone" | "upi", string>>;

function ProfileForm() {
  const { me, reports, receivedRatings, actions } = useStore();
  const [name, setName] = useState(me.name);
  const [branch, setBranch] = useState(me.branch);
  const [year, setYear] = useState(me.year);
  const [hostel, setHostel] = useState(me.hostel);
  const [phone, setPhone] = useState(me.phone);
  const [upiId, setUpiId] = useState(me.upiId);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const err: Errors = {};
    if (name.trim().length < 2) err.name = "Your name needs at least 2 characters.";
    if (!/^[0-9+\- ]{0,20}$/.test(phone.trim())) err.phone = "Phone can contain digits, spaces, + and - only.";
    if (upiId.trim() && !/^[\w.-]{2,}@[A-Za-z][\w.-]*$/.test(upiId.trim())) err.upi = "A UPI ID looks like name@bank.";
    setErrors(err);
    if (Object.keys(err).length > 0) return;
    setBusy(true);
    await actions.updateProfile({ name: name.trim(), branch: branch.trim(), year, hostel: hostel.trim(), phone: phone.trim(), upiId: upiId.trim() });
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Profile" intro="Your details as other students will see them. Your email and phone are never shown to others." />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={save} className="card space-y-5 p-6" noValidate>
          <AvatarEditor />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="p-name" label="Display name" error={errors.name}>
              <input id="p-name" className="field" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "p-name-error" : undefined} />
            </FormField>
            <FormField id="p-email" label="Thapar email" hint="Used to sign in. It cannot be changed.">
              <input id="p-email" className="field" value={me.email} readOnly aria-readonly="true" />
            </FormField>
            <FormField id="p-branch" label="Branch">
              <input id="p-branch" className="field" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </FormField>
            <FormField id="p-year" label="Year">
              <select id="p-year" className="field" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="p-hostel" label="Hostel">
              <input id="p-hostel" className="field" value={hostel} onChange={(e) => setHostel(e.target.value)} />
            </FormField>
            <FormField id="p-phone" label="Phone (optional, private)" error={errors.phone}>
              <input id="p-phone" className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "p-phone-error" : undefined} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField id="p-upi" label="UPI ID for collecting fare shares" error={errors.upi} hint="Only riders who owe you a share can see it.">
                <input id="p-upi" className="field" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@bank" aria-invalid={!!errors.upi} aria-describedby={errors.upi ? "p-upi-error" : "p-upi-hint"} />
              </FormField>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Save profile"}
          </button>
        </form>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
              <ShieldCheckIcon className="h-5 w-5 text-mist" /> Verification
            </h2>
            <div className="mt-2">
              <Pill tone="ok">Thapar email confirmed</Pill>
            </div>
            <p className="mt-3 text-sm text-mist">
              You proved you can read mail at your @thapar.edu address with a one-time code. CampusPool does not check student ID numbers, so this is not proof of enrolment.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-2xl font-semibold">Your rating</h2>
            {me.ratingCount && me.ratingAvg ? (
              <p className="tabular mt-2 text-3xl font-semibold">
                ★ {me.ratingAvg.toFixed(1)} <span className="text-base font-normal text-mist">from {me.ratingCount} rating{me.ratingCount === 1 ? "" : "s"}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-mist">No ratings yet. After a completed ride, riders and creators can rate each other.</p>
            )}
            {receivedRatings.length > 0 && (
              <ul className="mt-3 space-y-3 text-sm">
                {receivedRatings.map((r) => (
                  <li key={r.id}>
                    <p className="tabular font-medium">{"★".repeat(r.stars)}<span className="text-mist">{"★".repeat(5 - r.stars)}</span> <span className="font-normal text-mist">{r.rideTitle}</span></p>
                    {r.comment && <p className="text-mist">&ldquo;{r.comment}&rdquo;</p>}
                    <p className="text-xs text-mist">{timeAgo(r.at)} · reviews are anonymous</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-display text-2xl font-semibold">Reports you filed</h2>
            {reports.length === 0 ? (
              <p className="mt-2 text-sm text-mist">None. Use Report on any ride or activity page.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {reports.map((r) => (
                  <li key={r.id}>
                    <p className="font-medium">{r.targetTitle}</p>
                    <p className="text-mist">{r.reason}</p>
                    <p className="text-xs text-mist">{timeAgo(r.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Ready>
      <ProfileForm />
    </Ready>
  );
}
