import type { Config } from "tailwindcss";

// Fixed tokens from docs/18_UI_BRANDING_GUIDELINES.md. Do not invent new colours.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F6F8FB",
        card: "#FFFFFF",
        sidebar: "#111827",
        headertext: "#1F2937",
        actionblue: "#2563EB",
        actionhover: "#3B82F6",
        intel: "#7C3AED",
        analytics: "#0891B2",
        bordergrey: "#E5E7EB",
        ink: "#111827",
        muted: "#6B7280",
        success: "#16A34A",
        warning: "#F59E0B",
        danger: "#DC2626",
        slate: "#64748B",
        // map
        covlow: "#DBEAFE",
        covmed: "#93C5FD",
        covhigh: "#2563EB",
        covsat: "#7C3AED",
        gaps: "#F59E0B",
        expansion: "#8B5CF6",
        roads: "#334155",
        aroads: "#16A34A",
        mapbg: "#F3F4F6",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
        btn: "8px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 3px rgba(17, 24, 39, 0.03)",
      },
    },
  },
  plugins: [],
};
export default config;
