"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ACTIVITY_LABEL, ActivityBadge } from "@/components/ActivityCard";
import { Avatar } from "@/components/Avatar";
import { CheckIcon, CloseIcon, SendIcon } from "@/components/Icons";
import { Ready } from "@/components/Ready";
import { ReportBox } from "@/components/ReportBox";
import { RequestActivityButton } from "@/components/RequestSeatButton";
import { MessageButton } from "@/components/MessageButton";
import { StudentLabel } from "@/components/StudentLabel";
import { StudentActions } from "@/components/StudentActions";
import { LifecyclePill, StatusPill } from "@/components/StatusPill";
import { dayLabel, timeAgo } from "@/lib/format";
import { personName, spotsLeft, useStore } from "@/lib/store";

function ActivityDetail({ id }: { id: string }) {
  const store = useStore();
  const { actions } = store;
  const router = useRouter();
  const activity = store.activities.find((a) => a.id === id);
  const [text, setText] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!activity) {
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-semibold">Activity not found</p>
        <p className="mt-1 text-mist">It may have been removed. Browse Find Company for current activities.</p>
        <Link href="/company" className="btn btn-primary mt-4">
          Back to Find Company
        </Link>
      </div>
    );
  }

  const mine = activity.creatorId === "me";
  const creator = personName(store, activity.creatorId);
  const isMember = mine || activity.participants.includes("me");
  const requests = store.activityRequests.filter((q) => q.activityId === activity.id);
  const pending = requests.filter((q) => q.status === "PENDING");
  const decided = requests.filter((q) => q.status !== "PENDING");
  const myRequest = requests.find((q) => q.requesterId === "me");
  const open = activity.status === "UPCOMING";

  function send(e: FormEvent) {
    e.preventDefault();
    if (!activity) return;
    actions.postMessage(activity.id, text);
    setText("");
  }

  return (
    <div className="space-y-6">
      <Link href="/company" className="text-sm text-mist underline underline-offset-4">
        Find Company
      </Link>

      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <ActivityBadge type={activity.type} size="lg" />
          <span className="eyebrow">{ACTIVITY_LABEL[activity.type]}</span>
          <LifecyclePill status={activity.status} />
          {mine && <span className="text-xs text-mist">Your activity</span>}
        </div>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">{activity.title}</h1>
        <p className="mt-1 text-mist">
          {dayLabel(activity.date)}, {activity.time} at {activity.location}
        </p>
        {activity.description && <p className="mt-4 rounded-xl bg-sage px-4 py-3 text-sm">{activity.description}</p>}
        <p className="tabular mt-4 text-sm text-mist">
          {activity.participants.length + 1} of {activity.maxParticipants} going · {spotsLeft(activity)} spots left · No payment for activities
        </p>
        {!mine && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <RequestActivityButton activity={activity} />
            {(myRequest?.status === "PENDING" || activity.participants.includes("me")) && <MessageButton userId={activity.creatorId} label={`Message ${creator.split(" ")[0]}`} small={false} />}
            {myRequest && (
              <span className="flex items-center gap-2 text-sm text-mist">
                Your request: <StatusPill status={myRequest.status} /> sent {timeAgo(myRequest.requestedOn)}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display text-2xl font-semibold">Who is going ({activity.participants.length + 1})</h2>
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <Avatar name={creator} userId={activity.creatorId} />
            <StudentLabel id={activity.creatorId} className="font-medium" />
            <span className="text-xs text-mist">host</span>
            {!mine && <StudentActions userId={activity.creatorId} name={creator} />}
          </li>
          {activity.participants.map((pid) => (
            <li key={pid} className="flex items-center gap-3">
              <Avatar userId={pid} name={personName(store, pid)} />
              <StudentLabel id={pid} className="font-medium" />
              {pid !== "me" && <StudentActions userId={pid} name={personName(store, pid)} />}
            </li>
          ))}
        </ul>
      </section>

      {mine && (
        <section className="card space-y-5 p-5">
          <h2 className="font-display text-2xl font-semibold">Requests to join ({pending.length} waiting)</h2>
          {pending.length === 0 ? (
            <p className="text-mist">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar userId={q.requesterId} name={personName(store, q.requesterId)} />
                    <div>
                      <p>
                        <StudentLabel id={q.requesterId} className="font-medium" />
                      </p>
                      <p className="text-xs text-mist">Asked {timeAgo(q.requestedOn)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MessageButton userId={q.requesterId} />
                    <button type="button" className="btn btn-good btn-sm" disabled={spotsLeft(activity) <= 0 || !open} onClick={() => actions.decideActivityRequest(q.id, true)}>
                      <CheckIcon className="h-4 w-4" /> Accept
                    </button>
                    <button type="button" className="btn btn-bad btn-sm" disabled={!open} onClick={() => actions.decideActivityRequest(q.id, false)}>
                      <CloseIcon className="h-4 w-4" /> Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <ul className="space-y-1 text-sm text-mist">
              {decided.map((q) => (
                <li key={q.id} className="flex items-center gap-2">
                  <StudentLabel id={q.requesterId} /> <StatusPill status={q.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isMember && (
        <section className="card p-5">
          <h2 className="font-display text-2xl font-semibold">Plan together</h2>
          <p className="text-sm text-mist">Only the host and accepted students can see this thread.</p>
          {activity.messages.length === 0 ? (
            <p className="mt-4 text-mist">No messages yet. Share the meeting point or a plan.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {activity.messages.map((m) => (
                <li key={m.id} className="flex items-start gap-3">
                  <Avatar userId={m.authorId} name={personName(store, m.authorId)} size={30} />
                  <div className="min-w-0 rounded-2xl bg-sage px-3 py-2">
                    <p className="text-xs text-mist">
                      {m.authorId === "me" ? "You" : personName(store, m.authorId)} · {timeAgo(m.at)}
                    </p>
                    <p className="break-words text-sm">{m.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={send} className="mt-4 flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Message</span>
              <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              <SendIcon className="h-4 w-4" /> Send
            </button>
          </form>
        </section>
      )}

      {mine && open && (
        <section className="card flex flex-wrap items-center gap-3 p-5">
          <button type="button" className="btn btn-good" onClick={() => actions.setActivityStatus(activity.id, "COMPLETED")}>
            Mark activity completed
          </button>
          {!confirmCancel ? (
            <button type="button" className="btn btn-bad" onClick={() => setConfirmCancel(true)}>
              Cancel activity
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Cancel and decline pending requests?</span>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => actions.setActivityStatus(activity.id, "CANCELLED")}>
                Yes, cancel
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(false)}>
                Keep it
              </button>
            </span>
          )}
        </section>
      )}

      {(activity.status === "COMPLETED" || activity.status === "CANCELLED") && (mine || activity.participants.includes("me") || myRequest) && (
        <section className="card p-5" aria-labelledby="tidy-title">
          <h2 id="tidy-title" className="font-display text-2xl font-semibold">
            Tidy up
          </h2>
          <p className="mt-1 text-sm text-mist">{mine ? "This activity is finished. Remove it now, or it disappears by itself shortly after it ends." : "Remove it from your lists. Other people still see it."}</p>
          <button
            type="button"
            className={`btn mt-3 ${mine ? "btn-bad" : "btn-ghost"}`}
            onClick={async () => {
              const r = mine ? await actions.removeActivity(activity.id) : await actions.hideItem("activity", activity.id);
              if (r.ok) router.push("/activities");
            }}
          >
            {mine ? "Remove activity" : "Remove from my list"}
          </button>
        </section>
      )}

      {!mine && <ReportBox kind="activity" targetId={activity.id} />}
    </div>
  );
}

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <Ready>
      <ActivityDetail id={params.id} />
    </Ready>
  );
}
