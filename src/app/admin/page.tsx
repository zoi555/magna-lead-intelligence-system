import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { adminUsers } from "@/lib/mock-data";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" subtitle="Users & roles (RLS-backed in the real app). Mock data only." />
      <DataTable
        columns={[
          { key: "name", label: "User" },
          { key: "role", label: "Role" },
          { key: "tenant", label: "Tenant" },
          { key: "active", label: "Active" },
        ]}
        rows={adminUsers.map((u) => ({ ...u, active: u.active ? "Yes" : "No" }))}
        searchKeys={["name", "role"]}
        searchPlaceholder="Search users…"
        filter={{ key: "role", label: "Role", options: ["Owner / Admin", "Management", "Telesales", "Developer (UAT)"] }}
        emptyTitle="No users"
      />
      <div className="rounded-card border border-bordergrey bg-card p-4 text-[13px] text-muted shadow-soft">
        Role model: Owner/Admin manage; Management read; Telesales see only assigned exported leads; Developer is
        UAT-only. Enforced by Postgres RLS in the real app (see draft migrations).
      </div>
    </div>
  );
}
