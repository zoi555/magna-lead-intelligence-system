// Offline action queue — Vertical Slice 001 (PLACEHOLDER).
//
// Lightweight localStorage-backed queue so user-entered operational changes are not
// lost when WiFi drops. This is a DESIGN placeholder: it persists and tracks status
// locally, but does NOT implement real server sync yet (no service worker, no PWA).
//
// SECURITY: the browser queue must NEVER store secrets, API keys, or sensitive
// enrichment internals. Only user-entered operational fields are allowed. Payloads
// are validated on enqueue and rejected if they contain forbidden keys.

import type { OfflineAction, OfflineActionType, SyncStatus } from "./offline-types";
import { requiresServerConfirmation } from "./offline-types";

const STORAGE_KEY = "li_offline_queue_v1";

// Keys that must never be persisted in the browser queue.
const FORBIDDEN_KEY_RE = /secret|api[_-]?key|token|password|bearer|score|confidence|companies?_house|financ|margin|enrichment|internal|service_role/i;

/** Throws if a payload contains anything that must not live in the browser. */
export function assertOfflineSafe(payload: Record<string, unknown>): void {
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_KEY_RE.test(k)) {
      throw new Error(`Offline queue: refusing to store forbidden field "${k}" (no secrets/internals in the browser).`);
    }
    const v = payload[k];
    if (v && typeof v === "object") assertOfflineSafe(v as Record<string, unknown>);
  }
}

function browserAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): OfflineAction[] {
  if (!browserAvailable()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as OfflineAction[];
  } catch {
    return [];
  }
}

function writeAll(actions: OfflineAction[]): void {
  if (!browserAvailable()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface EnqueueInput {
  id: string;
  type: OfflineActionType;
  entity_kind: OfflineAction["entity_kind"];
  entity_id: string;
  payload: Record<string, unknown>;
  base_version?: string | number;
}

/** Queue a user-entered operational change. Returns the stored action. */
export function enqueue(input: EnqueueInput): OfflineAction {
  if (requiresServerConfirmation(input.type)) {
    throw new Error(`Offline queue: "${input.type}" requires server confirmation and cannot be queued offline.`);
  }
  assertOfflineSafe(input.payload);
  const action: OfflineAction = {
    ...input,
    created_at: nowIso(),
    updated_at: nowIso(),
    status: "saved_locally",
    retries: 0,
  };
  const all = readAll();
  all.push(action);
  writeAll(all);
  return action;
}

export function listActions(): OfflineAction[] {
  return readAll();
}

export function updateStatus(id: string, status: SyncStatus, error?: string): void {
  const all = readAll();
  const a = all.find((x) => x.id === id);
  if (!a) return;
  a.status = status;
  a.updated_at = nowIso();
  if (status === "sync_failed") a.retries += 1;
  if (error) a.last_error = error;
  writeAll(all);
}

export function retry(id: string): void {
  updateStatus(id, "pending_sync");
}

export function remove(id: string): void {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function clearSynced(): void {
  writeAll(readAll().filter((x) => x.status !== "synced"));
}

/** Counts by status — for a UI sync badge. */
export function statusCounts(): Record<SyncStatus, number> {
  const base: Record<SyncStatus, number> = { saved_locally: 0, pending_sync: 0, synced: 0, sync_failed: 0, conflict: 0 };
  for (const a of readAll()) base[a.status] += 1;
  return base;
}

// NOTE: real sync (flush pending → server, apply base_version conflict detection,
// mark conflict/synced) is intentionally NOT implemented in this slice.
