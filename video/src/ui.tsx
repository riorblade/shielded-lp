import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY, MONO, SANS } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Scene timing: seconds since the scene started, and the voice-over length (for beats as fractions of it). */
export const SceneCtx = React.createContext({ vd: 5, lead: 0.3, frames: 150 });
export function useT() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { vd, lead } = React.useContext(SceneCtx);
  // beat(x): frame at which a fraction x of the narration has been spoken
  const beat = (x: number) => Math.round((lead + vd * x) * fps);
  return { f, fps, vd, beat };
}

export const useSpring = (at: number, damping = 18, mass = 0.7) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping, mass, stiffness: 170 } });
};

/** Big Anton line that slides up out of a mask. */
export const Line: React.FC<{ at: number; size: number; color?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({
  at,
  size,
  color = C.paper,
  children,
  style,
}) => {
  const p = useSpring(at, 20, 0.6);
  return (
    <div style={{ overflow: "hidden", lineHeight: 0.92, paddingBottom: size * 0.02, ...style }}>
      <div
        style={{
          transform: `translateY(${(1 - p) * 105}%)`,
          fontFamily: DISPLAY,
          fontSize: size,
          color,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Fades and lifts any block in. */
export const Pop: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; from?: number }> = ({ at, children, style, from = 30 }) => {
  const p = useSpring(at, 16, 0.6);
  return <div style={{ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * from}px)`, ...style }}>{children}</div>;
};

/** Shows exactly one child: the last one whose start frame has passed (hard cuts). */
export const Cuts: React.FC<{ at: number[]; children: React.ReactNode[] }> = ({ at, children }) => {
  const f = useCurrentFrame();
  let i = 0;
  at.forEach((a, k) => {
    if (f >= a) i = k;
  });
  return (
    <>
      {children.map((c, k) =>
        k === i ? (
          <Sequence key={k} from={at[k]} layout="none">
            {c}
          </Sequence>
        ) : null,
      )}
    </>
  );
};

export const Coin: React.FC<{ size?: number; label?: string; ink?: string; gold?: string; style?: React.CSSProperties }> = ({
  size = 120,
  label,
  ink = C.ink,
  gold = C.zec,
  style,
}) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ overflow: "visible", ...style }}>
    <circle r="48" fill={ink} />
    <circle r="40" fill="none" stroke={gold} strokeWidth="5" />
    {label ? (
      <text textAnchor="middle" dy="13" fontFamily={DISPLAY} fontSize="38" fill={gold}>
        {label}
      </text>
    ) : (
      <path d="M-15-14H15L-15 14H15M0-22V-14M0 14V22" fill="none" stroke={gold} strokeWidth="7" strokeLinejoin="round" />
    )}
  </svg>
);

export const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 22,
  color = C.dim,
  style,
}) => <div style={{ fontFamily: MONO, fontSize: size, letterSpacing: "0.14em", textTransform: "uppercase", color, ...style }}>{children}</div>;

export const Body: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 40,
  color = C.dim,
  style,
}) => <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: size, lineHeight: 1.3, color, ...style }}>{children}</div>;

/** Yellow callout pill used over demo footage. */
export const Callout: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const p = useSpring(at, 15, 0.5);
  return (
    <div
      style={{
        position: "absolute",
        padding: "16px 28px",
        borderRadius: 999,
        background: C.zec,
        color: C.ink,
        fontFamily: DISPLAY,
        fontSize: 44,
        textTransform: "uppercase",
        boxShadow: "0 18px 40px rgba(0,0,0,.45)",
        transform: `scale(${0.6 + 0.4 * p})`,
        opacity: Math.min(1, p * 2),
        transformOrigin: "left center",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ---------- Demo footage in a browser frame, with zoom/pan per cut ----------

export type Focus = [cx: number, cy: number, scale: number];
export type Cut = { src: string; from: number; to: number; speed?: number; zoom?: [Focus, Focus]; label?: string };

const FW = 1600; // frame width; footage is 1920x1080
const FH = 900;
const K = FW / 1920;

function focusTransform([cx, cy, s]: Focus) {
  const half = 960 / s;
  const halfY = 540 / s;
  const x = Math.min(Math.max(cx, half), 1920 - half);
  const y = Math.min(Math.max(cy, halfY), 1080 - halfY);
  return { tx: FW / 2 - x * K * s, ty: FH / 2 - y * K * s, s: K * s };
}

const CutView: React.FC<{ cut: Cut; frames: number }> = ({ cut, frames }) => {
  const f = useCurrentFrame();
  const [a, b] = cut.zoom ?? [
    [960, 540, 1],
    [960, 540, 1],
  ];
  const p = interpolate(f, [0, frames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const A = focusTransform(a);
  const B = focusTransform(b);
  const tx = A.tx + (B.tx - A.tx) * p;
  const ty = A.ty + (B.ty - A.ty) * p;
  const s = A.s + (B.s - A.s) * p;
  const rate = ((cut.to - cut.from) * 30) / frames;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
      <OffthreadVideo src={staticFile(cut.src)} trimBefore={Math.round(cut.from * 30)} playbackRate={rate} muted style={{ width: 1920, height: 1080 }} />
    </div>
  );
};

/** Plays cuts back to back, scaling their speed so together they fill `total` frames. */
export const Footage: React.FC<{ cuts: Cut[]; total: number; url: string; start?: number }> = ({ cuts, total, url, start = 0 }) => {
  const base = cuts.map((c) => (c.to - c.from) / (c.speed ?? 1));
  const sum = base.reduce((x, y) => x + y, 0);
  const lens = base.map((b) => Math.max(8, Math.round(((total - start) * b) / sum)));
  const starts = lens.map((_, i) => start + lens.slice(0, i).reduce((x, y) => x + y, 0));
  const enter = useSpring(0, 18, 0.7);
  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - FW) / 2,
        top: 120,
        width: FW,
        height: FH + 46,
        borderRadius: 26,
        overflow: "hidden",
        background: C.ink2,
        boxShadow: `0 40px 120px rgba(0,0,0,.6), 0 0 0 2px ${C.ink3}`,
        transform: `translateY(${(1 - enter) * 60}px) scale(${0.96 + 0.04 * enter})`,
      }}
    >
      <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: C.ink2 }}>
        {[C.pink, C.zec, C.thor].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c, opacity: 0.85 }} />
        ))}
        <div style={{ marginLeft: 20, padding: "6px 18px", borderRadius: 999, background: C.ink, fontFamily: MONO, fontSize: 18, color: C.dim }}>{url}</div>
      </div>
      <div style={{ position: "relative", width: FW, height: FH, overflow: "hidden", background: C.ink }}>
        {cuts.map((c, i) => (
          <Sequence key={i} from={starts[i]} durationInFrames={lens[i]}>
            <CutView cut={c} frames={lens[i]} />
          </Sequence>
        ))}
      </div>
    </div>
  );
};

/** Cut start frames for a Footage, so callouts can be timed to them. */
export function cutStarts(cuts: Cut[], total: number, start = 0) {
  const base = cuts.map((c) => (c.to - c.from) / (c.speed ?? 1));
  const sum = base.reduce((x, y) => x + y, 0);
  const lens = base.map((b) => Math.max(8, Math.round(((total - start) * b) / sum)));
  return lens.map((_, i) => start + lens.slice(0, i).reduce((x, y) => x + y, 0));
}

/** Yellow panel that sweeps off at the start of a scene. */
export const Wipe: React.FC<{ color?: string }> = ({ color = C.zec }) => {
  const f = useCurrentFrame();
  const x = interpolate(f, [0, 9], [0, 105], { ...clamp, easing: Easing.in(Easing.cubic) });
  if (f > 10) return null;
  return <AbsoluteFill style={{ background: color, transform: `translateX(${x}%)`, zIndex: 50 }} />;
};

export const Ghost: React.FC<{ children: React.ReactNode; color?: string; top?: number }> = ({ children, color = "rgba(246,244,251,0.035)", top = 40 }) => (
  <div style={{ position: "absolute", left: -20, top, fontFamily: DISPLAY, fontSize: 520, lineHeight: 0.85, color, textTransform: "uppercase", whiteSpace: "nowrap" }}>
    {children}
  </div>
);
