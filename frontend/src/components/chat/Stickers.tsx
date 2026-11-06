"use client";

/**
 * CampusPool's own sticker pack: small animated SVG drawings of campus life.
 * A sticker message carries only the sticker id (inside the encrypted envelope), so nothing is fetched from anywhere.
 * Animations run for a moment when a sticker arrives and again on hover; "reduce motion" turns them off.
 */

import { useEffect, useId, useState, type ReactNode } from "react";

const INK = "#1B2A22";

type Art = { label: string; caption: string; pill: string; pillInk?: string; art: ReactNode };

function Caption({ text, fill, ink = "#fff" }: { text: string; fill: string; ink?: string }) {
  const w = Math.min(116, text.length * 7.3 + 20);
  return (
    <g>
      <rect x={60 - w / 2} y={91} width={w} height={22} rx={11} fill={fill} />
      <text x={60} y={106.5} textAnchor="middle" fontSize={13} fontWeight={800} fill={ink} style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.01em" }}>
        {text}
      </text>
    </g>
  );
}

const Wheel = ({ cx, cy }: { cx: number; cy: number }) => (
  <g className="anim stk-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
    <circle cx={cx} cy={cy} r={9} fill={INK} />
    <circle cx={cx} cy={cy} r={4} fill="#CFD8D3" />
    <path d={`M${cx - 7} ${cy}H${cx + 7}M${cx} ${cy - 7}V${cy + 7}`} stroke="#CFD8D3" strokeWidth={1.6} />
  </g>
);

export const STICKERS: Record<string, Art> = {
  auto: {
    label: "Auto-rickshaw on its way",
    caption: "On my way!",
    pill: "#1E8C4E",
    art: (
      <>
        <g className="anim stk-bob">
          <path d="M30 34q2-12 16-12h26q12 0 14 12z" fill="#FFD23F" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M22 70V48q0-14 14-16h34q16 0 22 16l6 14q2 8-6 8z" fill="#1E8C4E" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M62 36h20l8 16H62z" fill="#BFE8FF" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <rect x={30} y={38} width={26} height={20} rx={3} fill="#0E3B26" />
          <circle cx={70} cy={45} r={4.5} fill="#7A4A2E" />
          <rect x={22} y={61} width={76} height={4} fill="#FFD23F" />
          <circle cx={94} cy={58} r={3} fill="#FFF3B0" stroke={INK} strokeWidth={1.5} />
          <Wheel cx={36} cy={72} />
          <Wheel cx={84} cy={72} />
        </g>
      </>
    ),
  },
  chai: {
    label: "Kulhad of chai, steaming",
    caption: "Chai?",
    pill: "#C8643B",
    art: (
      <>
        <g fill="none" stroke="#8FA69B" strokeWidth={3.5} strokeLinecap="round">
          <path className="anim stk-steam" d="M48 36q-6-7 0-13t0-13" />
          <path className="anim stk-steam d2" d="M60 34q-6-7 0-13t0-13" />
          <path className="anim stk-steam d3" d="M72 36q-6-7 0-13t0-13" />
        </g>
        <path d="M33 45h54l-7 38q-20 7-40 0z" fill="#C8643B" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M37 60h46" stroke="#E58A5C" strokeWidth={3} />
        <ellipse cx={60} cy={45} rx={27} ry={6.5} fill="#E58A5C" stroke={INK} strokeWidth={2.5} />
        <ellipse cx={60} cy={45} rx={21} ry={4} fill="#8A4B21" />
      </>
    ),
  },
  split: {
    label: "Rupee coin splitting in two",
    caption: "Split it!",
    pill: "#FFB300",
    pillInk: "#2B1D00",
    art: (
      <>
        <defs>
          <clipPath id="stk-split-l">
            <rect x={0} y={0} width={60} height={90} />
          </clipPath>
          <clipPath id="stk-split-r">
            <rect x={60} y={0} width={60} height={90} />
          </clipPath>
        </defs>
        {(["l", "r"] as const).map((side) => (
          <g key={side} className={`anim stk-split-${side}`} clipPath={`url(#stk-split-${side})`}>
            <circle cx={60} cy={50} r={30} fill="#FFB300" stroke={INK} strokeWidth={2.5} />
            <circle cx={60} cy={50} r={23} fill="none" stroke="#C77F00" strokeWidth={2} strokeDasharray="3 4" />
            <text x={60} y={63} textAnchor="middle" fontSize={36} fontWeight={800} fill="#7A4A00" style={{ fontFamily: "system-ui, sans-serif" }}>
              ₹
            </text>
          </g>
        ))}
        <path className="anim stk-twinkle" d="M98 18l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#FFD23F" stroke={INK} strokeWidth={1.5} />
        <path className="anim stk-twinkle d2" d="M20 74l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#FFD23F" stroke={INK} strokeWidth={1.5} />
      </>
    ),
  },
  late: {
    label: "Alarm clock ringing",
    caption: "5 min late",
    pill: "#E0414B",
    art: (
      <g className="anim stk-shake" style={{ transformOrigin: "60px 54px" }}>
        <path d="M44 80l-6 6M76 80l6 6" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={38} cy={27} r={9} fill="#FF5D5D" stroke={INK} strokeWidth={2.5} />
        <circle cx={82} cy={27} r={9} fill="#FF5D5D" stroke={INK} strokeWidth={2.5} />
        <circle cx={60} cy={54} r={29} fill="#FF5D5D" stroke={INK} strokeWidth={2.5} />
        <circle cx={60} cy={54} r={22} fill="#FFF6E0" />
        <path d="M60 54V39M60 54l10 5" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={60} cy={54} r={2.5} fill={INK} />
        <path d="M18 46l-6-2M18 56h-7M102 46l6-2M102 56h7" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      </g>
    ),
  },
  seat: {
    label: "Car seat with a tick",
    caption: "Seat saved",
    pill: "#1670B8",
    art: (
      <>
        <rect x={48} y={10} width={22} height={13} rx={5} fill="#4DB3F2" stroke={INK} strokeWidth={2.5} />
        <rect x={40} y={21} width={38} height={48} rx={11} fill="#4DB3F2" stroke={INK} strokeWidth={2.5} />
        <path d="M50 32v26M68 32v26" stroke="#2B86D9" strokeWidth={3} strokeLinecap="round" />
        <rect x={33} y={63} width={52} height={17} rx={8} fill="#2B86D9" stroke={INK} strokeWidth={2.5} />
        <g className="anim stk-pop" style={{ transformOrigin: "88px 28px" }}>
          <circle cx={88} cy={28} r={14} fill="#1E8C4E" stroke={INK} strokeWidth={2.5} />
          <path d="M81 28l5 5 9-10" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </>
    ),
  },
  paid: {
    label: "Paid stamp",
    caption: "All settled",
    pill: "#1E8C4E",
    art: (
      <g className="anim stk-stamp" style={{ transformOrigin: "60px 50px" }}>
        <g transform="rotate(-12 60 50)">
          <circle cx={60} cy={50} r={33} fill="#E6F7EC" stroke="#1E8C4E" strokeWidth={5} />
          <circle cx={60} cy={50} r={26} fill="none" stroke="#1E8C4E" strokeWidth={1.5} strokeDasharray="2 3" />
          <text x={60} y={58} textAnchor="middle" fontSize={22} fontWeight={900} fill="#1E8C4E" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.06em" }}>
            PAID
          </text>
          <path d="M50 30l6 5 12-10" fill="none" stroke="#1E8C4E" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    ),
  },
  smash: {
    label: "Badminton shuttlecock",
    caption: "Game on",
    pill: "#E8642B",
    art: (
      <>
        <path className="anim stk-dash" d="M20 70q10-30 40-48" fill="none" stroke="#F3B27A" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 7" />
        <g className="anim stk-bounce">
          <g transform="rotate(24 62 52)">
            <path d="M50 68L36 22h52L74 68z" fill="#fff" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
            <path d="M54 68l-6-46M62 68V22M70 68l6-46" stroke="#B9C7BB" strokeWidth={2} />
            <path d="M38 30h48" stroke={INK} strokeWidth={2} />
            <rect x={49} y={66} width={26} height={6} rx={2} fill="#E8642B" stroke={INK} strokeWidth={2} />
            <path d="M50 72h24a12 12 0 0 1-24 0z" fill="#FFF6E0" stroke={INK} strokeWidth={2.5} />
          </g>
        </g>
      </>
    ),
  },
  study: {
    label: "Open book with sparkles",
    caption: "Study mode",
    pill: "#6A4CE0",
    art: (
      <>
        <path d="M14 34q22-8 46 4v44q-24-12-46-4z" fill="#fff" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M106 34q-22-8-46 4v44q24-12 46-4z" fill="#fff" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M14 78q22-8 46 4 24-12 46-4v5q-22-7-46 4-24-11-46-4z" fill="#8B6CF6" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M24 46q14-4 28 2M24 56q14-4 28 2M68 48q14-6 28-2M68 58q14-6 28-2" stroke="#B9C7BB" strokeWidth={2.5} strokeLinecap="round" fill="none" />
        <path className="anim stk-twinkle" d="M60 8l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" fill="#FFD23F" stroke={INK} strokeWidth={1.5} />
        <path className="anim stk-twinkle d2" d="M94 14l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z" fill="#FFD23F" stroke={INK} strokeWidth={1.5} />
        <path className="anim stk-twinkle d3" d="M24 14l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z" fill="#FFD23F" stroke={INK} strokeWidth={1.5} />
      </>
    ),
  },
  thanks: {
    label: "Beating heart",
    caption: "Thank you!",
    pill: "#D6336C",
    art: (
      <>
        <path className="anim stk-float" d="M22 34c-3-4-9-1-6 4l6 6 6-6c3-5-3-8-6-4z" fill="#FF8FA8" stroke={INK} strokeWidth={1.5} />
        <path className="anim stk-float d2" d="M98 26c-3-4-9-1-6 4l6 6 6-6c3-5-3-8-6-4z" fill="#FF8FA8" stroke={INK} strokeWidth={1.5} />
        <path
          className="anim stk-pulse"
          style={{ transformOrigin: "60px 52px" }}
          d="M60 84C30 64 24 48 28 38c4-12 22-14 32 0 10-14 28-12 32 0 4 10-2 26-32 46z"
          fill="#FF5D73"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <path d="M40 40q2-6 8-6" stroke="#FFC2CE" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      </>
    ),
  },
  lol: {
    label: "Face laughing with tears",
    caption: "LOL",
    pill: "#FFB300",
    pillInk: "#2B1D00",
    art: (
      <g className="anim stk-wobble" style={{ transformOrigin: "60px 50px" }}>
        <circle cx={60} cy={50} r={32} fill="#FFD23F" stroke={INK} strokeWidth={2.5} />
        <path d="M42 42q6-7 12 0M66 42q6-7 12 0" stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" />
        <path d="M40 54h40q-2 20-20 20t-20-20z" fill="#8A2E2E" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M50 66q10-6 20 0q-4 8-10 8t-10-8z" fill="#FF7A85" />
        <path className="anim stk-tear" d="M30 44q-6 8-2 12t8-2q-2-6-6-10z" fill="#4DB3F2" stroke={INK} strokeWidth={1.5} />
        <path className="anim stk-tear d2" d="M90 44q6 8 2 12t-8-2q2-6 6-10z" fill="#4DB3F2" stroke={INK} strokeWidth={1.5} />
      </g>
    ),
  },
  wait: {
    label: "Hand waving",
    caption: "Wait for me!",
    pill: "#1670B8",
    art: (
      <>
        <path className="anim stk-dash" d="M26 30q-6 6-6 14M18 24q-10 10-10 22M94 30q6 6 6 14M102 24q10 10 10 22" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />
        <g className="anim stk-wave" style={{ transformOrigin: "60px 84px" }}>
          <path
            d="M44 84V46a5 5 0 0 1 10 0V30a5 5 0 0 1 10 0v-4a5 5 0 0 1 10 0v6a5 5 0 0 1 10 0v26q0 26-20 26z"
            fill="#FFD23F"
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <path d="M44 62q-10-12-16-6t12 20" fill="#FFD23F" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M54 46v14M64 30v28M74 28v30" stroke="#E0A800" strokeWidth={2} strokeLinecap="round" />
        </g>
      </>
    ),
  },
  snack: {
    label: "Bowl of noodles at night",
    caption: "Snack run?",
    pill: "#E8642B",
    art: (
      <>
        <path d="M94 10a12 12 0 1 0 10 18 10 10 0 0 1-10-18z" fill="#FFE58A" stroke={INK} strokeWidth={2} />
        <g fill="none" stroke="#B0C4BA" strokeWidth={3} strokeLinecap="round">
          <path className="anim stk-steam" d="M50 32q-5-6 0-11t0-11" />
          <path className="anim stk-steam d2" d="M64 30q-5-6 0-11t0-11" />
        </g>
        <path d="M40 46q6-8 12 0t12 0 12 0" stroke="#FFD23F" strokeWidth={5} fill="none" strokeLinecap="round" />
        <path d="M76 18L52 50M86 22L60 50" stroke="#A0522D" strokeWidth={3.5} strokeLinecap="round" />
        <path d="M26 52h68q-2 30-34 32-32-2-34-32z" fill="#FF7A3D" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M34 62h52" stroke="#FFB38A" strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={60} cy={52} rx={34} ry={5} fill="#FFD23F" stroke={INK} strokeWidth={2.5} />
      </>
    ),
  },
};

export const STICKER_IDS = Object.keys(STICKERS);

/** Draws one sticker. `live` plays its animation for a few seconds, for example when it has just arrived. */
export function Sticker({ id, size = 120, live = false }: { id: string; size?: number; live?: boolean }) {
  const filterId = useId().replace(/:/g, "");
  const s = STICKERS[id];
  const [playing, setPlaying] = useState(live);
  useEffect(() => {
    if (!live) return;
    setPlaying(true);
    const t = window.setTimeout(() => setPlaying(false), 3600);
    return () => window.clearTimeout(t);
  }, [live]);

  if (!s) return <span className="text-sm italic opacity-80">Sticker</span>;
  return (
    <span className={`sticker ${playing ? "is-live" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Sticker: ${s.caption} (${s.label})`}>
        <defs>
          <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
            <feMorphology in="SourceAlpha" operator="dilate" radius={3.2} result="grown" />
            <feGaussianBlur in="grown" stdDeviation={2.2} result="blur" />
            <feOffset in="blur" dy={2.5} result="drop" />
            <feFlood floodColor="#000" floodOpacity={0.22} />
            <feComposite in2="drop" operator="in" result="shadow" />
            <feFlood floodColor="#fff" />
            <feComposite in2="grown" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>
          {s.art}
          <Caption text={s.caption} fill={s.pill} ink={s.pillInk} />
        </g>
      </svg>
    </span>
  );
}
