import React from "react";
import { TENANT_NAME, ENVIRONMENT_LABEL } from "@/lib/app-config";

const ENV_STYLE: Record<string, { bg: string; fg: string }> = {
  Production: { bg: "#FBE9E9", fg: "#b91c1c" }, // deliberately the most visually distinct — production deserves attention
  Preview: { bg: "#FDF3E1", fg: "#92600b" },
  Development: { bg: "#EEF1F5", fg: "#475569" },
  "Local Development": { bg: "#EEF1F5", fg: "#475569" },
};

export function TopHeader() {
  const envStyle = ENV_STYLE[ENVIRONMENT_LABEL] ?? ENV_STYLE["Local Development"];
  return (
    <header className="flex h-14 items-center justify-between border-b border-bordergrey bg-card px-6">
      {/* Tenant identity is DATA (configurable per deployment), not the product brand. */}
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted">Tenant</span>
        <span className="rounded-btn border border-bordergrey px-2 py-1 text-[13px] font-medium text-headertext">
          {TENANT_NAME}
        </span>
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: envStyle.bg, color: envStyle.fg }}>
          {ENVIRONMENT_LABEL}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* No authentication is implemented yet — this is never a fabricated signed-in user. */}
        <span className="text-[13px] text-muted">No authentication configured</span>
      </div>
    </header>
  );
}
