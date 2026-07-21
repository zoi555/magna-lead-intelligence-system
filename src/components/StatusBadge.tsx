import React from "react";

type Style = { fg: string; bg: string; border?: string };

// Badge colours from docs/18 §15. Text colours chosen for >=4.5:1 contrast on their tint.
const STYLES: Record<string, Style> = {
  complete: { fg: "#137a3b", bg: "#E7F5EC" },
  running: { fg: "#1d4ed8", bg: "#E7EEFD" },
  draft: { fg: "#475569", bg: "#EEF1F5" },
  blocked: { fg: "#b91c1c", bg: "#FBE9E9" },
  warning: { fg: "#92600b", bg: "#FDF3E1" },
  exported: { fg: "#6b21d6", bg: "#F1EAFC" },
  mock: { fg: "#475569", bg: "transparent", border: "#64748B" },
};

function keyFor(status: string): keyof typeof STYLES {
  const s = status.toLowerCase();
  // "incomplete" must never match "complete" — check it first and bail out to a neutral style.
  if (/\bincomplete\b/.test(s)) return "warning";
  if (s.includes("mock")) return "mock";
  if (/\bcomplete/.test(s) || s.includes("contacted") || s.includes("done")) return "complete";
  if (s.includes("export")) return "exported";
  if (s.includes("block")) return "blocked";
  if (s.includes("warn") || s.includes("pending") || s.includes("ready") || s.includes("review")) return "warning";
  if (s.includes("run") || s.includes("progress") || s.includes("active")) return "running";
  return "draft";
}

export function StatusBadge({ status }: { status: string }) {
  const st = STYLES[keyFor(status)];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.3,
        padding: "1px 8px",
        borderRadius: 999,
        color: st.fg,
        background: st.bg,
        border: `1px solid ${st.border ?? st.fg + "33"}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}
