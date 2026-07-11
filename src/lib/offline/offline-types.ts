// Offline-first data-entry model — Vertical Slice 001 (PLACEHOLDER TYPES).
// Design intent only. No service worker, no PWA, no server sync implemented yet.
// See docs/21_MVP_VERTICAL_SLICE_001_BUILD_PLAN.md → "Offline-first data entry".

/** UI-facing sync state for a locally-entered change. */
export type SyncStatus =
  | "saved_locally" // written to local store, not yet queued/sent
  | "pending_sync" // queued, waiting for connection
  | "synced" // confirmed by the server
  | "sync_failed" // send failed (retryable)
  | "conflict"; // server has a newer version — needs review

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  saved_locally: "Saved locally",
  pending_sync: "Pending sync",
  synced: "Synced",
  sync_failed: "Sync failed",
  conflict: "Conflict needs review",
};

/** Actions that MAY be captured offline and synced later. */
export type OfflineActionType =
  | "lead_note"
  | "telesales_worked_status"
  | "call_outcome"
  | "assigned_rep_update"
  | "manual_platform_presence_note"
  | "export_review_comment"
  | "lead_correction_note";

/**
 * Actions that are NOT offline-approved — they require a server round-trip and
 * explicit confirmation before taking effect.
 */
export type ServerConfirmedActionType =
  | "final_export_approval"
  | "delete_record"
  | "bulk_destructive_change"
  | "admin_security_change";

export const SERVER_CONFIRMED_ACTIONS: ServerConfirmedActionType[] = [
  "final_export_approval",
  "delete_record",
  "bulk_destructive_change",
  "admin_security_change",
];

/** True if this action must be confirmed by the server (never offline-approved). */
export function requiresServerConfirmation(type: string): boolean {
  return (SERVER_CONFIRMED_ACTIONS as string[]).includes(type);
}

/** A queued offline action. `base_version` supports optimistic conflict detection. */
export interface OfflineAction {
  id: string; // client-generated id
  type: OfflineActionType;
  entity_kind: "lead" | "telesales_assignment" | "export_review";
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string; // ISO
  updated_at: string; // ISO
  status: SyncStatus;
  retries: number;
  base_version?: string | number; // entity version the edit was made against (conflict check)
  last_error?: string;
}
