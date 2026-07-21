// Read-only, clearly-labelled application defaults. These are NOT owner-editable yet — no
// persistence layer exists for settings the owner can change from the UI (that is a
// separate feature). This module exists so /settings can show what the defaults currently
// are without inventing per-run controls there — actual per-run values (territory, anchors,
// spend ceiling, provider selection) live only in the Create New Run wizard and the run's
// own target_filters, never here.

export interface SettingsDefaults {
  defaultSpendCeilingGbp: number | null;
  defaultProviders: string[];
  dataRetentionDays: number | null;
  importDefaults: { defaultFormat: "csv" | "json"; requireChecksumMatch: boolean };
  exportDefaults: { defaultFormat: "csv"; includeUnverifiedFields: boolean };
}

export const SETTINGS_DEFAULTS: SettingsDefaults = {
  defaultSpendCeilingGbp: null, // no ceiling until an owner sets one per run — never fabricated
  defaultProviders: ["just_eat"],
  dataRetentionDays: null, // no retention policy has been decided yet
  importDefaults: { defaultFormat: "csv", requireChecksumMatch: true },
  exportDefaults: { defaultFormat: "csv", includeUnverifiedFields: false },
};
