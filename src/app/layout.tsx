import "maplibre-gl/dist/maplibre-gl.css";
import "../styles/globals.css";
import type { Metadata } from "next";
import React from "react";
import { AppShell } from "@/components/AppShell";
import { APP_FULL_NAME } from "@/lib/app-config";

export const metadata: Metadata = {
  title: APP_FULL_NAME,
  description: "SaaS-neutral app shell — mock data only, not production.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
