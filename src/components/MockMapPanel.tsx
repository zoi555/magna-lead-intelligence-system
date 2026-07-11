import React from "react";
import { coverageTiles } from "@/lib/mock-data";

// Schematic MOCK coverage panel (not real geography). Uses the fixed map tokens from docs/18 §6.
const LEVEL_FILL = ["#F3F4F6", "#DBEAFE", "#93C5FD", "#2563EB", "#7C3AED"];

const COLS = 6;
const TW = 108;
const TH = 74;
const GX = 12;
const GY = 12;
const CW = 116;
const CH = 84;
const W = GX + COLS * CW;
const H = GY + 4 * CH;

function Swatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="mr-4 inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span
        style={{
          width: 16,
          height: 12,
          display: "inline-block",
          background: dashed ? "transparent" : color,
          border: dashed ? `2px dashed ${color}` : "1px solid #cbd2dc",
        }}
      />
      {label}
    </span>
  );
}

export function MockMapPanel() {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Coverage (schematic — mock)</h2>
        <span className="text-[12px] text-muted">Blue → purple = run count · amber = delivery gaps</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 760, background: "#F3F4F6", borderRadius: 8 }}>
          {/* roads (schematic) */}
          <line x1={0} y1={H - 40} x2={W} y2={H - 40} stroke="#334155" strokeWidth={4} opacity={0.8} />
          <line x1={0} y1={GY + CH + 20} x2={W} y2={GY + CH + 20} stroke="#16A34A" strokeWidth={2.5} strokeDasharray="10 5" opacity={0.75} />
          {coverageTiles.map((t, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const x = GX + col * CW;
            const y = GY + row * CH;
            const uncovered = t.level === 0;
            const fill = t.gap ? "rgba(245,158,11,0.35)" : LEVEL_FILL[t.level];
            const stroke = t.gap ? "#F59E0B" : t.expansion ? "#8B5CF6" : "#cbd2dc";
            const textColor = t.level >= 3 ? "#ffffff" : "#111827";
            return (
              <g key={t.code}>
                <rect
                  x={x}
                  y={y}
                  width={TW}
                  height={TH}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={t.expansion ? 2 : 1}
                  strokeDasharray={t.expansion ? "6 3" : uncovered && !t.gap ? "3 3" : undefined}
                />
                <text x={x + 8} y={y + 20} fontSize={12} fontWeight={700} fill={textColor}>
                  {t.code}
                </text>
                <text x={x + 8} y={y + TH - 8} fontSize={9} fill={t.level >= 3 ? "#e5e7eb" : "#6B7280"}>
                  {t.gap ? "gap" : uncovered ? "not targeted" : `${t.level}× runs`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center">
        <Swatch color="#DBEAFE" label="1" />
        <Swatch color="#93C5FD" label="2–3" />
        <Swatch color="#2563EB" label="4" />
        <Swatch color="#7C3AED" label="5+" />
        <Swatch color="#F59E0B" label="delivery gap" />
        <Swatch color="#8B5CF6" label="expansion" dashed />
        <Swatch color="#334155" label="roads" />
        <Swatch color="#16A34A" label="A roads" />
      </div>
    </div>
  );
}
