import React from "react";
import { AbsoluteFill, Audio, Composition, Sequence, Series, staticFile, useCurrentFrame } from "remotion";
import { App, Cta, Hook, How, Idea, Landing, Options, Problem, Terminal } from "./scenes";
import { C, DISPLAY, FPS, MONO } from "./theme";
import { Coin, SceneCtx, Wipe } from "./ui";
import vo from "./vo.json";

// Each scene lasts as long as its voice-over (plus a short tail), or its visual minimum.
const TAIL = 0.8;
const DEF = [
  { id: "hook", Comp: Hook, label: "shielded-lp", min: 6 },
  { id: "problem", Comp: Problem, label: "01  The problem" },
  { id: "options", Comp: Options, label: "02  What exists today" },
  { id: "idea", Comp: Idea, label: "03  Our idea" },
  { id: "how", Comp: How, label: "04  How it works", min: 16 },
  { id: "landing", Comp: Landing, label: "05  Demo: landing", lead: 1.5, min: 12 },
  { id: "terminal", Comp: Terminal, label: "06  Demo: terminal", min: 26 },
  { id: "app", Comp: App, label: "07  Demo: app", min: 36 },
  { id: "cta", Comp: Cta, label: "Try it", min: 9 },
] as const;

export const SCENES = DEF.map((d) => {
  const lead = "lead" in d ? d.lead : 0.3;
  const vd = (vo as Record<string, number>)[d.id];
  const frames = Math.ceil(Math.max("min" in d ? d.min : 0, lead + vd + TAIL) * FPS);
  return { ...d, lead, vd, frames };
});
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, s) => a + s.frames, 0));
export const TOTAL = SCENES.reduce((a, s) => a + s.frames, 0);

const Chrome: React.FC = () => {
  const f = useCurrentFrame();
  let i = 0;
  STARTS.forEach((s, k) => {
    if (f >= s) i = k;
  });
  const pill: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderRadius: 999, background: "rgba(13,12,20,.82)" };
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 40 }}>
      <div style={{ ...pill, position: "absolute", left: 40, top: 34 }}>
        <Coin size={30} ink={C.zec} gold={C.ink} />
        <span style={{ fontFamily: DISPLAY, fontSize: 30, color: C.paper, textTransform: "uppercase" }}>shielded-lp</span>
      </div>
      {i > 0 && (
        <div style={{ ...pill, position: "absolute", right: 40, top: 34 }}>
          <span style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: C.paper, whiteSpace: "pre" }}>{SCENES[i].label}</span>
        </div>
      )}
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${(100 * f) / TOTAL}%`, background: C.zec, boxShadow: "0 0 0 1px rgba(13,12,20,.6)" }} />
    </AbsoluteFill>
  );
};

const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Series>
      {SCENES.map((s, i) => (
        <Series.Sequence key={s.id} durationInFrames={s.frames} premountFor={30}>
          <SceneCtx.Provider value={{ vd: s.vd, lead: s.lead, frames: s.frames }}>
            <s.Comp />
            {i > 0 && <Wipe color={i % 2 ? C.zec : C.paper} />}
            <Sequence from={Math.round(s.lead * FPS)} name="vo">
              <Audio src={staticFile(`vo/${s.id}.mp3`)} />
            </Sequence>
          </SceneCtx.Provider>
        </Series.Sequence>
      ))}
    </Series>
    <Chrome />
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <>
    <Composition id="Demo" component={Demo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    {SCENES.map((s) => (
      <Composition
        key={s.id}
        id={`scene-${s.id}`}
        component={() => (
          <AbsoluteFill style={{ background: C.ink }}>
            <SceneCtx.Provider value={{ vd: s.vd, lead: s.lead, frames: s.frames }}>
              <s.Comp />
            </SceneCtx.Provider>
          </AbsoluteFill>
        )}
        durationInFrames={s.frames}
        fps={FPS}
        width={1920}
        height={1080}
      />
    ))}
  </>
);
