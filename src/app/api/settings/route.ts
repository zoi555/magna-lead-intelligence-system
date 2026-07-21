// GET/PATCH /api/settings — real, persisted, audited tenant settings.
//
// GET: any authenticated tenant member can read.
// PATCH: owner/admin only. Writes go through the caller's OWN session-scoped Supabase
// client (createSupabaseServerClient), never the service-role client — RLS
// (tenant_settings_write / source_operational_settings_write, migration 0027) is the
// real enforcement boundary. The role check below is defence in depth (a friendlier 403
// message), not the only guard: if this check had a bug, RLS still blocks the write.
//
// Source enablement is validated against SOURCE_REGISTRY's code-defined capabilities —
// a PATCH can never mark a technically unsupported source (adapterImplemented===false or
// sourceAuthorised===false) as enabled, regardless of who's asking.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { requireSessionAndRole } from "@/lib/auth/require-session";
import { SOURCE_REGISTRY } from "@/lib/sources/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALWAYS_SUPPORTED = new Set(["manual_import"]);

function isTechnicallySupported(sourceId: string): boolean {
  if (ALWAYS_SUPPORTED.has(sourceId)) return true;
  const s = SOURCE_REGISTRY.find((r) => r.id === sourceId);
  return Boolean(s?.adapterImplemented && s?.sourceAuthorised);
}

export async function GET() {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;

  const supabase = await createSupabaseServerClient();
  const [settingsRes, sourcesRes, auditRes] = await Promise.all([
    supabase.from("tenant_settings").select("*").eq("tenant_id", session.tenantId).maybeSingle(),
    supabase.from("source_operational_settings").select("*").eq("tenant_id", session.tenantId),
    supabase.from("app_audit_log").select("id, action, actor_email, target_table, old_value, new_value, created_at")
      .eq("tenant_id", session.tenantId).eq("action", "settings_update").order("created_at", { ascending: false }).limit(20),
  ]);
  if (settingsRes.error) return NextResponse.json({ ok: false, error: settingsRes.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    role: session.role,
    settings: settingsRes.data,
    sources: sourcesRes.data ?? [],
    recentAudit: auditRes.data ?? [],
  });
}

export async function PATCH(req: Request) {
  const session = await requireSessionAndRole({ roles: ["owner", "admin"] });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const supabase = await createSupabaseServerClient();

  if (body.settings && typeof body.settings === "object") {
    const s = body.settings as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if ("display_name" in s) {
      const v = String(s.display_name ?? "").trim();
      patch.display_name = v || null;
    }
    if ("default_spend_ceiling_gbp" in s) {
      const v = s.default_spend_ceiling_gbp;
      if (v !== null && (typeof v !== "number" || v < 0)) return NextResponse.json({ ok: false, error: "default_spend_ceiling_gbp must be a non-negative number or null" }, { status: 400 });
      patch.default_spend_ceiling_gbp = v;
    }
    if ("data_retention_days" in s) {
      const v = s.data_retention_days;
      if (v !== null && (typeof v !== "number" || v <= 0)) return NextResponse.json({ ok: false, error: "data_retention_days must be a positive number or null" }, { status: 400 });
      patch.data_retention_days = v;
    }
    if ("default_existing_customer_exclusion" in s) {
      if (typeof s.default_existing_customer_exclusion !== "boolean") return NextResponse.json({ ok: false, error: "default_existing_customer_exclusion must be boolean" }, { status: 400 });
      patch.default_existing_customer_exclusion = s.default_existing_customer_exclusion;
    }
    if ("default_territory_behaviour" in s) patch.default_territory_behaviour = String(s.default_territory_behaviour);
    if ("import_defaults" in s) patch.import_defaults = s.import_defaults;
    if ("export_defaults" in s) patch.export_defaults = s.export_defaults;
    if ("ui_preferences" in s) patch.ui_preferences = s.ui_preferences;
    if ("default_sources" in s) {
      if (!Array.isArray(s.default_sources)) return NextResponse.json({ ok: false, error: "default_sources must be an array" }, { status: 400 });
      const unsupported = (s.default_sources as string[]).filter((id) => !isTechnicallySupported(id));
      if (unsupported.length) return NextResponse.json({ ok: false, error: `Not technically supported: ${unsupported.join(", ")}` }, { status: 400 });
      patch.default_sources = s.default_sources;
    }

    if (Object.keys(patch).length) {
      const res = await supabase.from("tenant_settings").update(patch).eq("tenant_id", session.tenantId).select().maybeSingle();
      if (res.error) return NextResponse.json({ ok: false, error: `Settings update rejected: ${res.error.message}` }, { status: 403 });
    }
  }

  if (Array.isArray(body.sources)) {
    for (const entry of body.sources as { source_id: string; enabled: boolean }[]) {
      if (entry.enabled && !isTechnicallySupported(entry.source_id)) {
        return NextResponse.json({ ok: false, error: `${entry.source_id} is not technically supported and cannot be marked operational` }, { status: 400 });
      }
      const res = await supabase.from("source_operational_settings")
        .update({ enabled: entry.enabled })
        .eq("tenant_id", session.tenantId).eq("source_id", entry.source_id);
      if (res.error) return NextResponse.json({ ok: false, error: `Source update rejected for ${entry.source_id}: ${res.error.message}` }, { status: 403 });
    }
  }

  return NextResponse.json({ ok: true });
}
