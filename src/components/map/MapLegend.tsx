import React from "react";

// POC colour language (blue→purple coverage, amber gaps, orange territory, roads)
// plus lead grade dots. Presentational only.
const COV = ["rgba(84,120,205,.32)", "rgba(118,74,186,.56)", "rgba(156,42,166,.82)"];
const GRADE: Record<string, string> = { A: "#16A34A", B: "#2563EB", C: "#F59E0B", D: "#94A3B8" };

export function MapLegend() {
  return (
    <div className="rounded-card border border-bordergrey bg-card p-3 text-[12px] shadow-soft">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Legend</div>
      <div className="space-y-1.5">
        <Row><Sw style={{ background: COV[0] }} />Coverage low</Row>
        <Row><Sw style={{ background: COV[1] }} />Coverage medium</Row>
        <Row><Sw style={{ background: COV[2] }} />Coverage high</Row>
        <Row><Sw style={{ background: "rgba(232,150,25,.42)", borderColor: "#B06A12" }} />Delivery gap (no leads)</Row>
        <Row><Sw style={{ background: "transparent", border: "2px dashed #6A4A9A" }} />Expansion zone</Row>
        <Row><Sw style={{ background: "transparent", border: "2px solid #C85A00" }} />Selected territory</Row>
        <Row><Sw style={{ background: "#123C66" }} />Motorway&nbsp;&nbsp;<Sw style={{ background: "#3A9E63" }} />A road</Row>
        <div className="mt-1 border-t border-bordergrey pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Lead grade</div>
        {(["A", "B", "C", "D"] as const).map((g) => (
          <Row key={g}><Dot style={{ background: GRADE[g] }} />Grade {g}</Row>
        ))}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-ink">{children}</div>;
}
function Sw({ style }: { style: React.CSSProperties }) {
  return <span style={{ width: 16, height: 11, borderRadius: 2, border: "1px solid #9AA4AD", display: "inline-block", ...style }} />;
}
function Dot({ style }: { style: React.CSSProperties }) {
  return <span style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", ...style }} />;
}
