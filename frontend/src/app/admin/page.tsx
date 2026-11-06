"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Ready } from "@/components/Ready";
import { Pill } from "@/components/StatusPill";
import { api, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";

type Overview = {
  users: number;
  newUsers7d: number;
  suspended: number;
  openRides: number;
  ridesTotal: number;
  openActivities: number;
  openReports: number;
  newFeedback: number;
  averageRating: number | null;
  popularRoutes: { destination: string; count: number }[];
  postsPerDay: { date: string; count: number }[];
};
type Person = { id: string; name: string; email: string; banned: boolean };
type ReportRow = {
  id: string;
  kind: "ride" | "activity" | "user";
  targetTitle: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  resolution: string | null;
  at: number;
  evidence: string | null;
  reporter: Person | null;
  targetExists: boolean;
  owner: Person | null;
};
type UserRow = Person & { branch: string; hostel: string; joinedAt: number; isAdmin: boolean };
type Tab = "overview" | "reports" | "feedback" | "students";
type FeedbackRow = { id: string; category: string; rating: number | null; message: string; status: "NEW" | "READ"; at: number; from: Person | null };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-4">
      <p className="tabular font-display text-3xl font-semibold">{value}</p>
      <p className="text-sm text-mist">{label}</p>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Overview>("/admin/overview")
      .then(setData)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);
  if (error) return <p role="alert" className="text-alert">{error}</p>;
  if (!data) return <div className="skeleton h-48" aria-busy="true" />;
  const peak = Math.max(1, ...data.postsPerDay.map((d) => d.count));
  const top = Math.max(1, ...data.popularRoutes.map((r) => r.count));
  return (
    <div className="space-y-6">
      <div className="card grid grid-cols-2 divide-line md:grid-cols-3 md:divide-x lg:grid-cols-6">
        <Stat label="Students" value={data.users} />
        <Stat label="New this week" value={data.newUsers7d} />
        <Stat label="Open rides" value={data.openRides} />
        <Stat label="Open activities" value={data.openActivities} />
        <Stat label="Open reports" value={data.openReports} />
        <Stat label="Suspended" value={data.suspended} />
        <Stat label="New feedback" value={data.newFeedback} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="ppd">
          <h2 id="ppd" className="font-display text-2xl font-semibold">
            Posts in the last 7 days
          </h2>
          <div className="mt-5 flex h-36 items-end gap-2" role="img" aria-label={data.postsPerDay.map((d) => `${d.date}: ${d.count}`).join(", ")}>
            {data.postsPerDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="tabular text-xs text-mist">{d.count}</span>
                <div className="w-full rounded-t-md bg-forest" style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }} />
                <span className="text-[11px] text-mist">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-6" aria-labelledby="pr">
          <h2 id="pr" className="font-display text-2xl font-semibold">
            Popular routes
          </h2>
          {data.popularRoutes.length === 0 ? (
            <p className="mt-3 text-mist">No rides yet.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {data.popularRoutes.map((r) => (
                <li key={r.destination}>
                  <div className="flex justify-between text-sm">
                    <span>{r.destination}</span>
                    <span className="tabular text-mist">{r.count}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-sage">
                    <div className="h-2 rounded-full bg-forest" style={{ width: `${(r.count / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ReportsTab() {
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "ALL">("OPEN");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; action: "remove_post" | "ban_user" } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reports: ReportRow[] }>(`/admin/reports?status=${status}`);
      setRows(r.reports);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, action: "dismiss" | "remove_post" | "ban_user") {
    try {
      await api(`/admin/reports/${id}/resolve`, { method: "POST", body: { action } });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="rf" className="label !mb-0">
          Show
        </label>
        <select id="rf" className="field max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {error && <p role="alert" className="mb-3 text-alert">{error}</p>}
      {rows === null ? (
        <div className="skeleton h-40" aria-busy="true" />
      ) : rows.length === 0 ? (
        <Empty>No reports here. Reports sent by students will appear in this list.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Reports from students</caption>
            <thead className="border-b border-line text-xs text-mist">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Reported</th>
                <th scope="col" className="px-2 py-3 font-medium">Reason</th>
                <th scope="col" className="px-2 py-3 font-medium">By</th>
                <th scope="col" className="px-2 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3">
                    <Pill tone="mute">{r.kind}</Pill>
                    <p className="mt-1 font-medium">{r.targetTitle}</p>
                    <p className="text-xs text-mist">
                      Posted by {r.owner ? `${r.owner.name}${r.owner.banned ? " (suspended)" : ""}` : "unknown"}
                      {!r.targetExists && r.kind !== "user" ? " · already removed" : ""}
                    </p>
                  </td>
                  <td className="max-w-xs px-2 py-3">
                    {r.reason}
                    {r.evidence && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-forest">Chat lines shared by the reporter</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-sage p-2 text-xs">{r.evidence}</pre>
                      </details>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {r.reporter?.name ?? "Former student"}
                    <p className="text-xs text-mist">{timeAgo(r.at)}</p>
                  </td>
                  <td className="px-2 py-3">
                    {r.status === "OPEN" ? <Pill tone="warn">Open</Pill> : <Pill tone="ok">Resolved</Pill>}
                    {r.resolution && <p className="mt-1 text-xs text-mist">{r.resolution}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "OPEN" &&
                      (confirm?.id === r.id ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <span className="w-full text-xs">{confirm.action === "remove_post" ? "Delete this post?" : "Suspend this student?"}</span>
                          <button type="button" className="btn btn-bad btn-sm" onClick={() => void resolve(r.id, confirm.action)}>
                            Confirm
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                            Back
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void resolve(r.id, "dismiss")}>
                            Dismiss
                          </button>
                          {r.targetExists && r.kind !== "user" && (
                            <button type="button" className="btn btn-bad btn-sm" onClick={() => setConfirm({ id: r.id, action: "remove_post" })}>
                              Remove post
                            </button>
                          )}
                          {r.owner && !r.owner.banned && (
                            <button type="button" className="btn btn-bad btn-sm" onClick={() => setConfirm({ id: r.id, action: "ban_user" })}>
                              Suspend
                            </button>
                          )}
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeedbackTab() {
  const [status, setStatus] = useState<"NEW" | "READ" | "ALL">("NEW");
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api<{ feedback: FeedbackRow[] }>(`/admin/feedback?status=${status}`);
      setRows(r.feedback);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  async function markRead(id: string) {
    try {
      await api(`/admin/feedback/${id}/read`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="ff" className="label !mb-0">
          Show
        </label>
        <select id="ff" className="field max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="NEW">New</option>
          <option value="READ">Read</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {error && <p role="alert" className="mb-3 text-alert">{error}</p>}
      {rows === null ? (
        <div className="skeleton h-40" aria-busy="true" />
      ) : rows.length === 0 ? (
        <Empty>No feedback here yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((f) => (
            <li key={f.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill tone="mute">{f.category}</Pill>
                  {f.rating && <span className="tabular text-sm">{f.rating} / 5</span>}
                </div>
                <span className="text-xs text-mist">
                  {f.from?.name ?? "Former student"} · {timeAgo(f.at)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[15px]">{f.message}</p>
              {f.status === "NEW" && (
                <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => void markRead(f.id)}>
                  Mark as read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentsTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (term: string) => {
    try {
      const r = await api<{ users: UserRow[] }>(`/admin/users?q=${encodeURIComponent(term)}`);
      setRows(r.users);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load("");
  }, [load]);

  async function toggle(u: UserRow) {
    try {
      await api(`/admin/users/${u.id}/ban`, { method: "POST", body: { banned: !u.banned } });
      await load(q);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void load(q);
        }}
        className="mb-4 flex max-w-md gap-2"
        role="search"
      >
        <label className="flex-1">
          <span className="sr-only">Search students by name or email</span>
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
        </label>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      {error && <p role="alert" className="mb-3 text-alert">{error}</p>}
      {rows === null ? (
        <div className="skeleton h-40" aria-busy="true" />
      ) : rows.length === 0 ? (
        <Empty>No students match that search.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Students</caption>
            <thead className="border-b border-line text-xs text-mist">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-2 py-3 font-medium">Branch, hostel</th>
                <th scope="col" className="px-2 py-3 font-medium">Joined</th>
                <th scope="col" className="px-2 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-mist">{u.email}</p>
                  </td>
                  <td className="px-2 py-3 text-mist">{[u.branch, u.hostel].filter(Boolean).join(", ") || "None given"}</td>
                  <td className="px-2 py-3 text-mist">{timeAgo(u.joinedAt)}</td>
                  <td className="px-2 py-3">{u.banned ? <Pill tone="bad">Suspended</Pill> : u.isAdmin ? <Pill tone="info">Admin</Pill> : <Pill tone="ok">Active</Pill>}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className={`btn btn-sm ${u.banned ? "btn-good" : "btn-bad"}`} disabled={u.isAdmin} onClick={() => void toggle(u)}>
                      {u.banned ? "Restore" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Admin() {
  const { me } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  if (!me.isAdmin) {
    return <Empty>This page is for CampusPool administrators. Admin emails are set in the backend settings.</Empty>;
  }
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Admin" intro="Review reports, remove posts and suspend accounts that break the rules." />
      <div role="tablist" aria-label="Admin sections" className="mb-6 flex flex-wrap gap-2">
        {(["overview", "reports", "feedback", "students"] as const).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t)}>
            {t === "overview" ? "Overview" : t === "reports" ? "Reports" : t === "feedback" ? "Feedback" : "Students"}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "students" && <StudentsTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Ready>
      <Admin />
    </Ready>
  );
}
