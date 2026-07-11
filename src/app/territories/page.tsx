import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { territories } from "@/lib/mock-data";

export default function TerritoriesPage() {
  return (
    <div>
      <PageHeader title="Territories" subtitle="Reusable territory sets (mixed outer codes, inner sectors, uploads, expansion)." />
      <DataTable
        columns={[
          { key: "name", label: "Set name" },
          { key: "items", label: "Items" },
          { key: "postcodes", label: "Postcodes" },
          { key: "lastUsed", label: "Last used" },
          { key: "status", label: "Status", badge: true },
        ]}
        rows={territories}
        searchKeys={["name", "items"]}
        searchPlaceholder="Search territory sets…"
        filter={{ key: "status", label: "Status", options: ["Draft", "Complete"] }}
        emptyTitle="No territory sets"
        emptyHint="Create a territory set from outer codes, inner sectors, or an uploaded boundary."
      />
    </div>
  );
}
