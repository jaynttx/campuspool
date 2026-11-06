"use client";

/**
 * App data store. Everything shown in the app comes from the CampusPool API:
 * /bootstrap returns the signed-in student's view (rides, activities, requests, payments, notifications),
 * and each action below calls the server, which does the real checks, and then reloads.
 * A WebSocket tells the browser when something changed so lists update without a refresh.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Activity, ActivityStatus, Person, Profile, Ride, Settings, Snapshot } from "@/data/types";
import { api, ApiError, errorMessage, getApiUrl } from "./api";
import { useAuth } from "./auth";
import { mapBootstrap, type BootstrapDto } from "./mappers";
import { DEFAULT_SETTINGS } from "./settings";

type State = Snapshot & { ready: boolean; chatUnread: number };

const EMPTY: State = {
  ready: false,
  chatUnread: 0,
  me: { id: "me", email: "", name: "", branch: "", year: 1, hostel: "", phone: "", upiId: "" },
  people: [],
  rides: [],
  rideRequests: [],
  payments: [],
  activities: [],
  activityRequests: [],
  notifications: [],
  reports: [],
  settings: DEFAULT_SETTINGS,
  relations: { blocked: [], restricted: [] },
  myRatings: [],
  receivedRatings: [],
};

/* ---------- pure helpers (used by pages) ---------- */

export const seatsLeft = (r: Ride) => Math.max(0, r.totalSeats - r.participants.length);
export const spotsLeft = (a: Activity) => Math.max(0, a.maxParticipants - 1 - a.participants.length);
export const rideHeadcount = (r: Ride) => r.participants.length + 1;

export function personName(s: { me: Profile; people: Person[] }, id: string): string {
  if (id === "me") return s.me.name || "You";
  return s.people.find((p) => p.id === id)?.name ?? "A student";
}

export function personUpi(s: { me: Profile; people: Person[] }, id: string): string | undefined {
  if (id === "me") return s.me.upiId || undefined;
  return s.people.find((p) => p.id === id)?.upiId;
}

export type Relation = "mine" | "joined" | "requested" | "full" | "closed" | "open";

export function rideRelation(s: State, r: Ride): Relation {
  if (r.creatorId === "me") return "mine";
  if (r.participants.includes("me")) return "joined";
  if (s.rideRequests.some((q) => q.rideId === r.id && q.requesterId === "me" && q.status === "PENDING")) return "requested";
  if (r.status !== "PENDING") return "closed";
  if (seatsLeft(r) <= 0) return "full";
  return "open";
}

export function activityRelation(s: State, a: Activity): Relation {
  if (a.creatorId === "me") return "mine";
  if (a.participants.includes("me")) return "joined";
  if (s.activityRequests.some((q) => q.activityId === a.id && q.requesterId === "me" && q.status === "PENDING")) return "requested";
  if (a.status !== "UPCOMING") return "closed";
  if (spotsLeft(a) <= 0) return "full";
  return "open";
}

/* ---------- reducer ---------- */

type Action = { type: "SET"; snapshot: Snapshot; chatUnread: number } | { type: "SETTINGS"; patch: Partial<Settings> } | { type: "CLEAR" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "SET":
      return { ...a.snapshot, chatUnread: a.chatUnread, ready: true };
    case "SETTINGS":
      return { ...s, settings: { ...s.settings, ...a.patch } };
    case "CLEAR":
      return EMPTY;
    default:
      return s;
  }
}

/* ---------- actions ---------- */

export type Result = { ok: boolean; id?: string };
export type NewRide = Pick<Ride, "source" | "destination" | "date" | "time" | "totalSeats" | "expectedFare" | "note" | "srcLat" | "srcLng" | "dstLat" | "dstLng"> & {
  /** Extra departures for a repeating series (the first is date + time). */
  repeatAt?: { date: string; time: string }[];
};
export type NewActivity = Pick<Activity, "title" | "type" | "location" | "date" | "time" | "description" | "maxParticipants">;
type ToastFn = (text: string, tone?: "ok" | "error") => void;
export type RealtimeEvent = { type: "refresh" | "chat" | "e2ee-link" | "e2ee-key"; conversationId?: string; at: number };

const localToIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();

function makeActions(refresh: () => Promise<void>, toast: ToastFn, dispatch: (a: Action) => void, getSettings: () => Settings) {
  /** Runs a server call, reloads data, and turns failures into a readable toast. */
  async function act<T>(call: () => Promise<T>, success?: string): Promise<{ ok: boolean; data?: T }> {
    try {
      const data = await call();
      await refresh();
      if (success) toast(success);
      return { ok: true, data };
    } catch (e) {
      toast(errorMessage(e), "error");
      if (e instanceof ApiError && e.status === 401) await refresh();
      return { ok: false };
    }
  }
  const post = (path: string, body?: unknown) => api<{ id?: string }>(path, { method: "POST", body: body ?? {} });

  return {
    /* profile and settings */
    async updateProfile(patch: Partial<Omit<Profile, "id" | "email" | "avatarUrl">>): Promise<Result> {
      const r = await act(() => api("/me", { method: "PATCH", body: patch }), "Profile saved.");
      return { ok: r.ok };
    },
    updateSettings(patch: Partial<Settings>) {
      dispatch({ type: "SETTINGS", patch });
      void api("/me/settings", { method: "PATCH", body: { ...getSettings(), ...patch } }).catch((e: unknown) => toast(errorMessage(e), "error"));
    },
    async uploadAvatar(image: Blob): Promise<Result> {
      const r = await act(() => api("/me/avatar", { method: "POST", raw: image }), "Photo updated.");
      return { ok: r.ok };
    },
    async removeAvatar(): Promise<Result> {
      const r = await act(() => api("/me/avatar", { method: "DELETE" }), "Photo removed.");
      return { ok: r.ok };
    },

    /* rides */
    async createRide(input: NewRide): Promise<Result> {
      const extra = input.repeatAt ?? [];
      const r = await act(
        () =>
          post("/rides", {
            source: input.source,
            destination: input.destination,
            departsAt: localToIso(input.date, input.time),
            totalSeats: input.totalSeats,
            expectedFare: input.expectedFare,
            note: input.note ?? null,
            srcLat: input.srcLat ?? null,
            srcLng: input.srcLng ?? null,
            dstLat: input.dstLat ?? null,
            dstLng: input.dstLng ?? null,
            repeatAt: extra.map((d) => localToIso(d.date, d.time)),
          }),
        extra.length > 0 ? `${extra.length + 1} rides to ${input.destination} posted.` : `Ride to ${input.destination} posted. Students can now request a seat.`,
      );
      return { ok: r.ok, id: r.data?.id };
    },
    async cancelSeries(id: string) {
      await act(() => post(`/rides/${id}/cancel-series`), "This ride and the later ones in the series were cancelled.");
    },
    async rateRide(rideId: string, rateeId: string, stars: number, comment: string): Promise<Result> {
      const r = await act(() => post(`/rides/${rideId}/ratings`, { rateeId: Number(rateeId), stars, comment: comment.trim() || null }), "Thanks for rating.");
      return { ok: r.ok };
    },
    async requestJoinRide(id: string): Promise<Result> {
      const r = await act(() => post(`/rides/${id}/request`), "Request sent. You will see the answer in Notifications.");
      return { ok: r.ok };
    },
    async decideRideRequest(id: string, approve: boolean): Promise<Result> {
      const r = await act(() => post(`/ride-requests/${id}/decide`, { approve }), approve ? "Rider accepted." : "Request declined.");
      return { ok: r.ok };
    },
    async startRide(id: string) {
      await act(() => post(`/rides/${id}/start`), "Ride marked as started.");
    },
    async cancelRide(id: string) {
      await act(() => post(`/rides/${id}/cancel`), "Ride cancelled. Riders were told.");
    },
    async completeRide(id: string, fare: number): Promise<Result> {
      const r = await act(() => post(`/rides/${id}/complete`, { actualFare: fare }), "Ride completed. Each rider's share is now listed.");
      return { ok: r.ok };
    },
    async markPaid(paymentId: string) {
      await act(() => post(`/payments/${paymentId}/mark-paid`), "Marked as paid. The ride creator will confirm it.");
    },
    async confirmPayment(paymentId: string) {
      await act(() => post(`/payments/${paymentId}/confirm`), "Payment confirmed.");
    },

    /* activities */
    async createActivity(input: NewActivity): Promise<Result> {
      const r = await act(
        () =>
          post("/activities", {
            title: input.title,
            type: input.type,
            location: input.location,
            startsAt: localToIso(input.date, input.time),
            description: input.description,
            maxParticipants: input.maxParticipants,
          }),
        `Activity posted: ${input.title}.`,
      );
      return { ok: r.ok, id: r.data?.id };
    },
    async requestJoinActivity(id: string): Promise<Result> {
      const r = await act(() => post(`/activities/${id}/request`), "Request sent. You will see the answer in Notifications.");
      return { ok: r.ok };
    },
    async decideActivityRequest(id: string, approve: boolean): Promise<Result> {
      const r = await act(() => post(`/activity-requests/${id}/decide`, { approve }), approve ? "Student accepted." : "Request declined.");
      return { ok: r.ok };
    },
    async setActivityStatus(id: string, status: Extract<ActivityStatus, "COMPLETED" | "CANCELLED">) {
      await act(() => post(`/activities/${id}/status`, { status }), status === "COMPLETED" ? "Activity marked as completed." : "Activity cancelled.");
    },
    async postMessage(activityId: string, text: string) {
      if (!text.trim()) return;
      await act(() => post(`/activities/${activityId}/messages`, { text }));
    },

    /* community */
    async fileReport(kind: "ride" | "activity", targetId: string, reason: string): Promise<Result> {
      if (reason.trim().length < 3) {
        toast("Tell us what went wrong so the report can be reviewed.", "error");
        return { ok: false };
      }
      const r = await act(() => post("/reports", { kind, targetId: Number(targetId), reason }), "Report sent. Thank you.");
      return { ok: r.ok };
    },
    async markRead(id: string) {
      await act(() => post("/notifications/read", { id: Number(id) }));
    },
    async markAllRead() {
      await act(() => post("/notifications/read", {}));
    },
    async removeRide(id: string): Promise<Result> {
      const r = await act(() => api(`/rides/${id}`, { method: "DELETE" }), "Ride removed.");
      return { ok: r.ok };
    },
    async removeActivity(id: string): Promise<Result> {
      const r = await act(() => api(`/activities/${id}`, { method: "DELETE" }), "Activity removed.");
      return { ok: r.ok };
    },
    /** Hides a finished ride or activity from this student's own lists only. */
    async hideItem(kind: "ride" | "activity", id: string): Promise<Result> {
      const r = await act(() => post("/hide", { kind, targetId: Number(id) }), "Removed from your list.");
      return { ok: r.ok };
    },
    async blockStudent(userId: string, on: boolean) {
      await act(() => post("/relations/block", { userId: Number(userId), on }), on ? "Student blocked." : "Student unblocked.");
    },
    async restrictStudent(userId: string, on: boolean) {
      await act(() => post("/relations/restrict", { userId: Number(userId), on }), on ? "Student restricted. They are not told." : "Restriction removed.");
    },
    /** Starts (or opens) a one-to-one chat. Returns the conversation id. */
    async startChat(userId: string): Promise<Result> {
      try {
        const r = await api<{ id: string }>("/chats", { method: "POST", body: { userId: Number(userId) } });
        return { ok: true, id: r.id };
      } catch (e) {
        toast(errorMessage(e), "error");
        return { ok: false };
      }
    },
  };
}

export type Actions = ReturnType<typeof makeActions>;

/* ---------- provider ---------- */

type Store = State & {
  actions: Actions;
  lastEvent: RealtimeEvent | null;
  /** When the other person was last seen typing, per conversation id (milliseconds). */
  typing: Record<string, number>;
  /** Tells the other person in a conversation that you are typing. Throttled; safe to call on every keystroke. */
  sendTyping: (conversationId: string) => void;
};
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { status, markSignedOut } = useAuth();
  const authed = status === "authed";
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: "ok" | "error" }[]>([]);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const socket = useRef<WebSocket | null>(null);
  const lastTypingSent = useRef<Record<string, number>>({});
  const settingsRef = useRef<Settings>(state.settings);
  const seenNotes = useRef<Set<string> | null>(null);
  settingsRef.current = state.settings;

  const refresh = useCallback(async () => {
    try {
      const dto = await api<BootstrapDto>("/bootstrap");
      const { snapshot, chatUnread } = mapBootstrap(dto);
      dispatch({ type: "SET", snapshot, chatUnread });
      // Desktop notification for something new, only while this tab is in the background and permission was given.
      if (seenNotes.current !== null && typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
        for (const n of snapshot.notifications) if (!n.read && !seenNotes.current.has(n.id)) new Notification("CampusPool", { body: n.text });
      }
      seenNotes.current = new Set(snapshot.notifications.map((n) => n.id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) markSignedOut();
    }
  }, [markSignedOut]);

  // Load when signed in, clear when signed out.
  useEffect(() => {
    if (!authed) {
      seenNotes.current = null;
      dispatch({ type: "CLEAR" });
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authed, refresh]);

  // Live updates over WebSocket, reconnecting with backoff.
  useEffect(() => {
    if (!authed) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: number | undefined;
    const connect = () => {
      ws = new WebSocket(`${getApiUrl().replace(/^http/, "ws")}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
      };
      ws.onmessage = (m: MessageEvent<string>) => {
        try {
          const ev = JSON.parse(m.data) as { type: "refresh" | "chat" | "e2ee-link" | "e2ee-key" | "typing"; conversationId?: string };
          if (ev.type === "typing") {
            // A hint only: no reload, and it fades by itself after a few seconds.
            if (ev.conversationId) setTyping((t) => ({ ...t, [ev.conversationId as string]: Date.now() }));
            return;
          }
          if (ev.type === "chat" && ev.conversationId) setTyping((t) => ({ ...t, [ev.conversationId as string]: 0 }));
          setLastEvent({ type: ev.type, conversationId: ev.conversationId, at: Date.now() });
          if (ev.type !== "e2ee-link" && ev.type !== "e2ee-key") void refresh();
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        socket.current = null;
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = window.setTimeout(connect, 1000 * 2 ** retry);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [authed, refresh]);

  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.reduceMotion ? "reduced" : "full";
  }, [state.settings.reduceMotion]);

  const actions = useMemo(() => {
    const toast: ToastFn = (text, tone = "ok") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, text, tone }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
    };
    return makeActions(refresh, toast, dispatch, () => settingsRef.current);
  }, [refresh]);

  const sendTyping = useCallback((conversationId: string) => {
    const now = Date.now();
    if (now - (lastTypingSent.current[conversationId] ?? 0) < 3000) return;
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    lastTypingSent.current[conversationId] = now;
    ws.send(JSON.stringify({ type: "typing", conversationId }));
  }, []);

  const value = useMemo<Store>(() => ({ ...state, actions, lastEvent, typing, sendTyping }), [state, actions, lastEvent, typing, sendTyping]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 md:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`card toast pointer-events-auto max-w-sm border-l-4 px-4 py-3 text-sm ${t.tone === "error" ? "border-l-alert" : "border-l-verified"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
