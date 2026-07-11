import React from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { PrototypeBanner } from "./PrototypeBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <PrototypeBanner />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
