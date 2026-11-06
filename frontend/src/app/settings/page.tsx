"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ACTIVITY_LABEL, ACTIVITY_TYPES } from "@/components/ActivityCard";
import { CheckIcon, MoonIcon, ShieldCheckIcon, SunIcon, SystemIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/StatusPill";
import { Ready } from "@/components/Ready";
import { Avatar } from "@/components/Avatar";
import { SecureChatSettings } from "@/components/SecureChatGate";
import { Switch } from "@/components/Switch";
import type { ActivityType } from "@/data/types";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BUBBLES, usePrefs, type ThemePref } from "@/lib/prefs";
import { playSound } from "@/lib/sounds";
import { useStore } from "@/lib/store";

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {intro && <p className="mt-1 text-sm text-mist">{intro}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const store = useStore();
  const { settings, me, actions } = store;
  const { signOut, markSignedOut } = useAuth();
  const settingsRelations = [
    ...store.relations.blocked.map((p) => ({ ...p, kind: "block" as const })),
    ...store.relations.restricted.map((p) => ({ ...p, kind: "restrict" as const })),
  ];
  const [deleteError, setDeleteError] = useState("");
  const prefs = usePrefs();
  const [othersMsg, setOthersMsg] = useState("");
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [pickup, setPickup] = useState(settings.defaultPickup);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const checklist = [
    { done: me.name.trim().length > 0, text: "Display name added", href: "/profile", cta: "Edit profile" },
    { done: me.hostel.trim().length > 0 && me.branch.trim().length > 0, text: "Branch and hostel added", href: "/profile", cta: "Edit profile" },
    { done: me.upiId.trim().length > 0, text: "UPI ID added, so riders can pay you", href: "/profile", cta: "Add UPI ID" },
  ];

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: store.me,
      relations: store.relations,
      settings: store.settings,
      rides: store.rides,
      rideRequests: store.rideRequests,
      payments: store.payments,
      activities: store.activities,
      activityRequests: store.activityRequests,
      reports: store.reports,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "campuspool-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Account" title="Settings" intro="Preferences are saved to your account." />

      <Section title="Finish setting up">
        <ul className="divide-y divide-line">
          {checklist.map((c) => (
            <li key={c.text} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${c.done ? "bg-lime text-forest-deep" : "border border-dashed border-line-strong text-transparent"}`}>
                  <CheckIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className={c.done ? "text-mist" : "font-medium"}>{c.text}</span>
              </span>
              {!c.done && (
                <Link href={c.href} className="font-semibold text-forest underline-offset-4 hover:underline">
                  {c.cta}
                </Link>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="flex items-center gap-3">
              <ShieldCheckIcon className="h-6 w-6 text-mist" aria-hidden="true" />
              <span>Thapar email verification</span>
            </span>
            <Pill tone="ok">Thapar email confirmed</Pill>
          </li>
        </ul>
      </Section>

      <Section title="Ride defaults" intro="Prefilled when you offer a ride. You can still change them each time.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pickup" className="label">
              Usual pickup point
            </label>
            <input id="pickup" className="field" value={pickup} onChange={(e) => setPickup(e.target.value)} onBlur={() => actions.updateSettings({ defaultPickup: pickup.trim() || settings.defaultPickup })} />
          </div>
          <div>
            <label htmlFor="dseats" className="label">
              Usual free seats
            </label>
            <select id="dseats" className="field" value={settings.defaultSeats} onChange={(e) => actions.updateSettings({ defaultSeats: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title="Activity defaults">
        <label htmlFor="dtype" className="label">
          Usual activity type
        </label>
        <select id="dtype" className="field max-w-xs" value={settings.defaultActivityType} onChange={(e) => actions.updateSettings({ defaultActivityType: e.target.value as ActivityType })}>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_LABEL[t]}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Notifications" intro="Choose which updates appear in your Notifications list and bell.">
        <div className="divide-y divide-line">
          <Switch id="n-in" label="Requests to my rides and activities" description="Someone asks to join something you posted." checked={settings.notifyIncoming} onChange={(v) => actions.updateSettings({ notifyIncoming: v })} />
          <Switch id="n-ans" label="Answers to my requests" description="A creator accepts or declines a request you sent." checked={settings.notifyAnswers} onChange={(v) => actions.updateSettings({ notifyAnswers: v })} />
        </div>
      </Section>

      <Section title="Blocked and restricted students" intro="Restricted students reach you quietly, with no notifications. Blocked students cannot message you or ask to join your posts. Neither is told.">
        {settingsRelations.length === 0 ? (
          <p className="text-sm text-mist">No one yet. Use More next to a student&apos;s name on a ride, activity or chat.</p>
        ) : (
          <ul className="divide-y divide-line">
            {settingsRelations.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <Avatar name={r.name} src={r.avatarUrl} size={34} />
                  <span>
                    <span className="block font-medium">{r.name}</span>
                    <span className="text-xs text-mist">{r.kind === "block" ? "Blocked" : "Restricted"}</span>
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void (r.kind === "block" ? actions.blockStudent(r.id, false) : actions.restrictStudent(r.id, false))}>
                  {r.kind === "block" ? "Unblock" : "Remove restriction"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Privacy" intro="Choose what other students can see about you. Your email and phone number are never shown to other students.">
        <div className="divide-y divide-line">
          <Switch id="p-year" label="Show my year of study" description="Shown next to your name, for example 2nd year." checked={settings.showYear} onChange={(v) => actions.updateSettings({ showYear: v })} />
          <Switch id="p-branch" label="Show my branch" checked={settings.showBranch} onChange={(v) => actions.updateSettings({ showBranch: v })} />
          <Switch id="p-hostel" label="Show my hostel" checked={settings.showHostel} onChange={(v) => actions.updateSettings({ showHostel: v })} />
          <Switch id="p-photo" label="Show my profile photo" description="When off, others see your initials." checked={settings.showPhoto} onChange={(v) => actions.updateSettings({ showPhoto: v })} />
        </div>
        <p className="mt-3 text-sm">
          <Link href="/privacy" className="font-semibold text-forest underline underline-offset-4">
            Read how CampusPool handles your data
          </Link>
        </p>
      </Section>

      <Section title="Reminders" intro="Get a reminder before a ride or activity you are part of. It appears in Notifications, and by email if you switch that on.">
        <div className="max-w-xs">
          <label htmlFor="remind" className="label">
            Remind me
          </label>
          <select id="remind" className="field" value={settings.reminderMinutes} onChange={(e) => actions.updateSettings({ reminderMinutes: Number(e.target.value) })}>
            <option value={0}>Never</option>
            <option value={15}>15 minutes before</option>
            <option value={30}>30 minutes before</option>
            <option value={60}>1 hour before</option>
            <option value={120}>2 hours before</option>
          </select>
        </div>
        <div className="divide-y divide-line">
          <Switch id="remind-email" label="Also email me" description="Sent to your Thapar email. Needs the server to have email set up." checked={settings.emailReminders} onChange={(v) => actions.updateSettings({ emailReminders: v })} />
        </div>
        <div className="mt-3 border-t border-line pt-4">
          <p className="font-medium">Desktop notifications</p>
          <p className="text-sm text-mist">Shows a pop-up when something new arrives while CampusPool is open in a background tab. It does not work when the site is closed.</p>
          {desktop === "unsupported" ? (
            <p className="mt-2 text-sm text-mist">This browser does not support them.</p>
          ) : desktop === "granted" ? (
            <p className="mt-2 text-sm text-verified">On for this browser.</p>
          ) : desktop === "denied" ? (
            <p className="mt-2 text-sm text-mist">Blocked in your browser settings. Allow notifications for this site there to use them.</p>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => void Notification.requestPermission().then(setDesktop)}>
              Turn on desktop notifications
            </button>
          )}
        </div>
      </Section>

      <Section title="Secure chat" intro="Chats are end-to-end encrypted: they are locked on your device and only the person you are talking to can open them.">
        <SecureChatSettings />
      </Section>

      <Section title="Appearance" intro="Saved on this device.">
        <fieldset>
          <legend className="label">Theme</legend>
          <div className="grid max-w-md grid-cols-3 gap-2">
            {(
              [
                { id: "light", label: "Light", Icon: SunIcon },
                { id: "dark", label: "Dark", Icon: MoonIcon },
                { id: "system", label: "Match device", Icon: SystemIcon },
              ] as { id: ThemePref; label: string; Icon: typeof SunIcon }[]
            ).map(({ id, label, Icon }) => (
              <label key={id} className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${prefs.theme === id ? "border-forest bg-sage" : "border-line-strong hover:bg-sage/60"}`}>
                <input type="radio" name="theme" value={id} className="sr-only" checked={prefs.theme === id} onChange={() => prefs.setTheme(id)} />
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="label">Your chat bubbles</legend>
          <div className="flex flex-wrap gap-3">
            {BUBBLES.map((b) => (
              <label key={b.id} className="cursor-pointer" title={b.label}>
                <input type="radio" name="bubble" value={b.id} className="peer sr-only" checked={prefs.bubble === b.id} onChange={() => prefs.setBubble(b.id)} />
                <span
                  className="block h-10 w-10 rounded-full ring-offset-2 ring-offset-paper transition-transform peer-checked:scale-110 peer-checked:ring-[3px] peer-checked:ring-ink peer-focus-visible:ring-[3px] peer-focus-visible:ring-forest"
                  style={{ background: b.swatch }}
                />
                <span className="sr-only">{b.label}</span>
              </label>
            ))}
          </div>
          <div className="chat-ground mt-4 max-w-md space-y-2 rounded-2xl border border-line p-4" aria-hidden="true">
            <div className="flex">
              <p className="bubble bubble-theirs">Leaving for the station at 6?</p>
            </div>
            <div className="flex justify-end">
              <p className="bubble bubble-mine">Yes! Saving you a seat 🛺</p>
            </div>
          </div>
        </fieldset>

        <div className="mt-4 divide-y divide-line">
          <Switch
            id="sounds"
            label="Chat sounds"
            description="Soft sounds when you send, receive and react."
            checked={prefs.sounds}
            onChange={(v) => {
              prefs.setSounds(v);
              if (v) playSound("receive", true);
            }}
          />
          <Switch id="motion" label="Reduce motion" description="Turns off animations, including moving stickers. Saved to your account." checked={settings.reduceMotion} onChange={(v) => actions.updateSettings({ reduceMotion: v })} />
        </div>
      </Section>

      <Section title="Account" intro={`Signed in as ${me.email}`}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportData}>
            Download my data (JSON)
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              try {
                const r = await api<{ signedOut: number }>("/auth/logout-others", { method: "POST", body: {} });
                setOthersMsg(r.signedOut === 0 ? "You were not signed in anywhere else." : `Signed out of ${r.signedOut === 1 ? "1 other browser" : `${r.signedOut} other browsers`}.`);
              } catch (e) {
                setOthersMsg(errorMessage(e));
              }
            }}
          >
            Sign out everywhere else
          </button>
        </div>
        {othersMsg && (
          <p role="status" className="mt-2 text-sm text-mist">
            {othersMsg}
          </p>
        )}
      </Section>

      <Section title="Delete account" intro="Removes your profile, photo, rides, activities and messages for good. You cannot delete while ride payments are unsettled.">
        {!confirmDelete ? (
          <button type="button" className="btn btn-bad" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            This cannot be undone.
            <button
              type="button"
              className="btn btn-bad btn-sm"
              onClick={async () => {
                setDeleteError("");
                try {
                  await api("/auth/me", { method: "DELETE" });
                  markSignedOut();
                } catch (e) {
                  setDeleteError(errorMessage(e));
                  setConfirmDelete(false);
                }
              }}
            >
              Yes, delete everything
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
              Keep my account
            </button>
          </div>
        )}
        {deleteError && (
          <p role="alert" className="error-text">
            {deleteError}
          </p>
        )}
      </Section>
    </div>
  );
}

export default function SettingsRoute() {
  return (
    <Ready>
      <SettingsPage />
    </Ready>
  );
}
