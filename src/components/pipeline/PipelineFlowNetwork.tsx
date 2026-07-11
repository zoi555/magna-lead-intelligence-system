"use client";

import React from "react";
import type { RunState, StageId, StageState } from "@/lib/pipeline/types";
import { useLiveRunState, usePrefersReducedMotion } from "./useLiveRunState";
import {
  STAGE_KIND, STAGE_SHORT, STAGE_NOW, KIND_COLOR, STATUS_COLOR, STATUS_LABEL,
  realFrontier, fmtElapsed, nfmt,
} from "./pipeline-meta";

const COLS = 5;
const X0 = 96, XGAP = 200, Y0 = 96, YGAP = 152;
const VW = X0 + (COLS - 1) * XGAP + 96;

function nodePos(i: number): { x: number; y: number } {
  const row = Math.floor(i / COLS);
  let col = i % COLS;
  if (row % 2 === 1) col = COLS - 1 - col; // serpentine
  return { x: X0 + col * XGAP, y: Y0 + row * YGAP };
}

export function PipelineFlowNetwork({ state: initialState }: { state: RunState }) {
  const reduced = usePrefersReducedMotion();
  const { run, lastRefreshed, isLive } = useLiveRunState(initialState);
  const state = run;
  const stages = state.stages;
  const rows = Math.ceil(stages.length / COLS);
  const VH = Y0 + (rows - 1) * YGAP + 96;
  const base = Math.max(state.counters.fetched, ...stages.map((s) => s.output_count), 1);

  const isPaused = state.status === "paused";
  const isRunning = state.status === "running";
  const motion = !reduced && !isPaused;
  const staticFrontier = realFrontier(state);
  const failedIndex = stages.findIndex((s) => s.status === "failed");

  // Looping playhead drives which pipe carries the bright travelling bulge.
  const loopMax = isRunning ? Math.max(0, staticFrontier) : stages.length - 2;
  const [head, setHead] = React.useState(0);
  React.useEffect(() => {
    if (!motion) return;
    const id = setInterval(() => setHead((h) => (h >= loopMax ? 0 : h + 1)), 900);
    return () => clearInterval(id);
  }, [motion, loopMax]);
  const flowFront = motion ? Math.min(head, loopMax) : staticFrontier;

  const [sel, setSel] = React.useState<StageId | null>(null);
  const selStage = sel ? stages.find((s) => s.stage_id === sel) ?? null : null;
  const activeStage = stages[Math.max(0, Math.min(flowFront, stages.length - 1))];
  const nowText = isPaused ? "Paused — flow frozen." : activeStage ? (STAGE_NOW[activeStage.stage_id] ?? (() => "Processing…"))(state.config.postcode_prefixes) : "Idle.";
  const elapsed = fmtElapsed((state.completed_at ? Date.parse(state.completed_at) : Date.now()) - (state.started_at ? Date.parse(state.started_at) : NaN));

  const segs = stages.slice(0, -1).map((s, i) => {
    const a = nodePos(i), b = nodePos(i + 1);
    const frac = Math.max(0.05, s.output_count / base);
    return { i, a, b, w: 6 + frac * 26, d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, len: Math.hypot(b.x - a.x, b.y - a.y), kc: KIND_COLOR[STAGE_KIND[s.stage_id]] };
  });

  return (
    <div className="flownet">
      <div className="nowline" role="status" aria-live="polite">
        <span className={`livedot ${(isLive || motion) ? "on" : ""}`} aria-hidden />
        <span className="nowtext">{nowText}</span>
        <span className="nowmeta">{state.run_id} · elapsed {elapsed}{isLive && <> · ⟳ live {lastRefreshed ?? ""}</>}</span>
      </div>

      <div className="canvas">
        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          <defs>
            <linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(0,0,0,.16)" /><stop offset="0.5" stopColor="rgba(255,255,255,.32)" /><stop offset="1" stopColor="rgba(0,0,0,.16)" />
            </linearGradient>
            <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.18" /></filter>
            <filter id="pglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {/* pipes: casing + fluid + sheen */}
          {segs.map((seg) => {
            const reached = seg.i <= flowFront;
            const jam = failedIndex >= 0 && seg.i >= failedIndex;
            return (
              <g key={`p${seg.i}`}>
                <path d={seg.d} stroke="#c3ccd8" strokeWidth={seg.w + 5} fill="none" strokeLinecap="round" filter="url(#soft)" opacity={0.9} />
                <path d={seg.d} stroke={jam ? "#DC2626" : reached ? seg.kc : "#dfe5ec"} strokeWidth={seg.w} fill="none" strokeLinecap="round" opacity={reached || jam ? 0.5 : 0.4} />
                <path d={seg.d} stroke="rgba(255,255,255,.55)" strokeWidth={Math.max(1, seg.w * 0.16)} fill="none" strokeLinecap="round" opacity={0.7} />
              </g>
            );
          })}

          {/* MOTION layer: particle streams on reached pipes + travelling bulge on the front */}
          {motion &&
            segs.map((seg) => {
              const reached = seg.i <= flowFront;
              const jam = failedIndex >= 0 && seg.i >= failedIndex;
              if (!reached || jam) return null;
              const dur = Math.max(0.7, Math.min(2.2, seg.len / 150));
              const rr = Math.max(1.4, seg.w * 0.16);
              const front = seg.i === flowFront;
              return (
                <g key={`m${seg.i}`}>
                  {[0, 1, 2].map((k) => (
                    <circle key={k} r={rr} fill={seg.kc} opacity={0.85}>
                      <animateMotion dur={`${dur}s`} begin={`${(k * dur) / 3}s`} repeatCount="indefinite" path={seg.d} />
                    </circle>
                  ))}
                  {front && (
                    <>
                      <ellipse rx={seg.w * 0.62} ry={seg.w * 0.46} fill={seg.kc} opacity={0.92} filter="url(#pglow)">
                        <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" path={seg.d} />
                      </ellipse>
                      <path className="ripple" d={seg.d} stroke={seg.kc} strokeWidth={Math.max(2, seg.w * 0.5)} fill="none" strokeLinecap="round" strokeDasharray={`2 ${Math.round(seg.w * 2.4)}`} opacity={0.6} />
                    </>
                  )}
                </g>
              );
            })}

          {/* tanks / chambers */}
          {stages.map((s, i) => {
            const { x, y } = nodePos(i);
            const kc = KIND_COLOR[STAGE_KIND[s.stage_id]];
            const frac = Math.max(0, Math.min(1, s.output_count / base));
            const reached = i <= flowFront;
            const active = motion && i === flowFront;
            const failed = s.status === "failed";
            const W = 58, H = 62, rx = x - W / 2, ry = y - H / 2;
            const fillH = (H - 10) * frac;
            return (
              <g key={s.stage_id} className={`tank ${active ? "active" : ""} ${failed ? "failed" : ""}`} onClick={() => setSel(sel === s.stage_id ? null : s.stage_id)} style={{ cursor: "pointer" }}>
                <rect x={rx} y={ry} width={W} height={H} rx={10} fill="#f4f7fa" stroke={failed ? "#DC2626" : STATUS_COLOR[s.status]} strokeWidth={active ? 2.4 : 1.4} filter="url(#soft)" opacity={reached || failed ? 1 : 0.5} />
                <clipPath id={`clip-${s.stage_id}`}><rect x={rx} y={ry} width={W} height={H} rx={10} /></clipPath>
                <g clipPath={`url(#clip-${s.stage_id})`}>
                  <rect className={active ? "wobble" : ""} x={rx} y={ry + (H - 10) - fillH + 5} width={W} height={fillH} fill={failed ? "#DC2626" : kc} opacity={0.5} />
                </g>
                <rect x={rx} y={ry} width={W} height={H} rx={10} fill="url(#cyl)" opacity={0.5} pointerEvents="none" />
                <text x={x} y={ry - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#334155" fontFamily="ui-monospace,Menlo,monospace">{STAGE_SHORT[s.stage_id]}</text>
                <text x={x} y={y + 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a" fontFamily="ui-monospace,Menlo,monospace">{nfmt(s.output_count)}</text>
                {s.rejected_count > 0 && <text x={x} y={ry + H + 13} textAnchor="middle" fontSize="9.5" fill="#b45309" fontFamily="ui-monospace,Menlo,monospace">−{nfmt(s.rejected_count)}</text>}
                {failed && <text x={x} y={y + 20} textAnchor="middle" fontSize="9" fill="#DC2626" fontWeight="700">JAM</text>}
              </g>
            );
          })}
        </svg>
      </div>

      {selStage ? <StageDetail s={selStage} prefixes={state.config.postcode_prefixes} /> : (
        <p className="hint">Glowing slug + particle stream = records flowing; pipe thickness = surviving count (narrows after each filter). Click a chamber for details. Frozen when paused, red “JAM” on failure, static under reduced-motion.</p>
      )}
      <StyleTag />
    </div>
  );
}

function StageDetail({ s, prefixes }: { s: StageState; prefixes: string[] }) {
  const now = (STAGE_NOW[s.stage_id] ?? (() => "—"))(prefixes);
  return (
    <div className="sd">
      <div className="sd-h"><b>{s.label}</b><span className="sd-badge" style={{ color: STATUS_COLOR[s.status] }}>{STATUS_LABEL[s.status]}</span></div>
      <p className="sd-now">{now}</p>
      <div className="sd-counts"><span><em>in</em> {nfmt(s.input_count)}</span><span><em>out</em> {nfmt(s.output_count)}</span><span><em>rejected</em> {nfmt(s.rejected_count)}</span><span><em>errors</em> {nfmt(s.error_count)}</span></div>
      {s.metrics && <div className="sd-chips">{Object.entries(s.metrics).map(([k, v]) => (<span key={k} className="chip"><em>{k.replace(/_/g, " ")}</em> {nfmt(v)}</span>))}</div>}
      {s.notes && <p className="sd-notes">{s.notes}</p>}
      {s.errors.length > 0 && <ul className="sd-errs">{s.errors.slice(0, 6).map((e, j) => (<li key={j}><code>{e.error_code}</code> {e.message}</li>))}</ul>}
    </div>
  );
}

function StyleTag() {
  return (
    <style jsx>{`
      .nowline { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid #223049; border-radius:12px; background:#0B1220; color:#E2E8F0; }
      .nowtext { font-size:14px; font-weight:600; } .nowmeta { margin-left:auto; font-family:ui-monospace,Menlo,monospace; font-size:12px; color:#94A3B8; }
      .livedot { width:9px; height:9px; border-radius:50%; background:#334155; } .livedot.on { background:#22D3EE; animation:pulse 1.6s infinite; }
      @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(34,211,238,.6)} 70%{box-shadow:0 0 0 8px rgba(34,211,238,0)} 100%{box-shadow:0 0 0 0 rgba(34,211,238,0)} }
      .canvas { margin-top:12px; border:1px solid #E5E7EB; border-radius:14px; background:radial-gradient(circle at 30% 20%, #f7fafc, #eef2f6); overflow:hidden; }
      .ripple { animation:ripple 0.9s linear infinite; } @keyframes ripple { to { stroke-dashoffset:-60; } }
      .tank.active :global(.wobble) { animation:wob 1.1s ease-in-out infinite; } @keyframes wob { 0%,100%{opacity:.42} 50%{opacity:.74} }
      .tank.failed { animation:flash 1s steps(2) infinite; } @keyframes flash { 50% { opacity:.55 } }
      .hint { font-size:12px; color:#64748B; margin-top:10px; }
      .sd { margin-top:12px; border:1px solid #E5E7EB; border-radius:12px; background:#fff; padding:12px 14px; }
      .sd-h { display:flex; align-items:center; gap:10px; } .sd-h b { font-size:14px; color:#0f172a; } .sd-badge { font-size:12px; font-weight:600; }
      .sd-now { margin:6px 0 8px; font-size:13px; color:#334155; }
      .sd-counts { display:flex; gap:16px; font-family:ui-monospace,Menlo,monospace; font-size:12px; color:#0f172a; } .sd-counts em { font-style:normal; color:#94A3B8; }
      .sd-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; } .chip { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#334155; border:1px solid #E5E7EB; border-radius:6px; padding:2px 8px; } .chip em { font-style:normal; color:#94A3B8; }
      .sd-notes { margin:8px 0 0; font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#64748B; }
      .sd-errs { list-style:none; padding:0; margin:8px 0 0; } .sd-errs li { font-size:12px; color:#334155; padding:2px 0; border-bottom:1px dashed #E5E7EB; }
      .sd-errs code { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#b45309; background:#FDF3E1; padding:0 4px; border-radius:3px; }
      @media (prefers-reduced-motion: reduce) { .livedot.on, .ripple, .tank.active :global(.wobble), .tank.failed { animation:none !important; } }
    `}</style>
  );
}
