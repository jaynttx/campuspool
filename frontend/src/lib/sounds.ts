/**
 * Small chat sounds, synthesised with the Web Audio API: no audio files to download or license.
 * Browsers only allow sound after the person has interacted with the page, so the first call may be silent.
 */

export type SoundName = "send" | "receive" | "sticker" | "react" | "ping" | "success";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Note = { f: number; to?: number; at: number; dur: number; type?: OscillatorType; gain?: number };

function play(notes: Note[]) {
  const ac = audio();
  if (!ac || ac.state !== "running") return;
  const master = ac.createGain();
  master.gain.value = 0.18;
  master.connect(ac.destination);
  const t0 = ac.currentTime + 0.01;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
    const peak = n.gain ?? 1;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(master);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

const SOUNDS: Record<SoundName, Note[]> = {
  // a quick upward "bloop" as a message leaves
  send: [{ f: 420, to: 880, at: 0, dur: 0.12, type: "sine" }],
  // two soft bell notes for an incoming message
  receive: [
    { f: 988, at: 0, dur: 0.16, type: "triangle", gain: 0.8 },
    { f: 1319, at: 0.09, dur: 0.22, type: "triangle", gain: 0.6 },
  ],
  // a springy boing for stickers and GIFs
  sticker: [
    { f: 220, to: 660, at: 0, dur: 0.09, type: "square", gain: 0.25 },
    { f: 660, to: 330, at: 0.09, dur: 0.14, type: "sine", gain: 0.8 },
  ],
  // a light tick for reactions
  react: [{ f: 1600, to: 1200, at: 0, dur: 0.06, type: "triangle", gain: 0.7 }],
  // a single gentle note when a message arrives in another chat
  ping: [{ f: 880, at: 0, dur: 0.18, type: "sine", gain: 0.7 }],
  // three rising notes: device linked, recovery key saved
  success: [
    { f: 660, at: 0, dur: 0.12, type: "triangle" },
    { f: 880, at: 0.1, dur: 0.12, type: "triangle" },
    { f: 1175, at: 0.2, dur: 0.2, type: "triangle" },
  ],
};

export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled) return;
  try {
    play(SOUNDS[name]);
  } catch {
    /* sound is a nicety; never let it break the chat */
  }
}

/** Call from a click or key handler so later sounds are allowed to play. */
export function unlockAudio() {
  try {
    audio();
  } catch {
    /* ignore */
  }
}
