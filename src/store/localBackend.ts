// Local dev mode stand-in for Amplify Data: Campaign records in localStorage, shared by every tab on
// this browser. It keeps the backend's rules (organiser sees and edits all; members read and update
// their own; only the organiser creates or deletes) and its version check, so conflicts behave the same.
// Live updates reach other tabs through BroadcastChannel, and this tab through a listener list.
import type { CampaignState } from "../game/index.ts";
import { readLocalUser } from "./localMode.ts";

const KEY = "varkesh.local.campaigns";

interface Stored {
  id: string;
  name: string;
  members: string[];
  state: CampaignState;
  version: number;
  updatedAt: string;
}

type Change = { kind: "update"; rec: Stored } | { kind: "delete"; id: string };

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("varkesh-local");
const listeners = new Set<(c: Change) => void>();
channel?.addEventListener("message", (e: MessageEvent<Change>) => listeners.forEach((l) => l(e.data)));

function emit(c: Change) {
  listeners.forEach((l) => l(c));
  channel?.postMessage(c);
}

function readAll(): Record<string, Stored> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Stored>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Stored>) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

function me() {
  const user = readLocalUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

function canSee(rec: Stored): boolean {
  const user = readLocalUser();
  return !!user && (user.isOrganiser || rec.members.includes(user.email));
}

function requireOrganiser() {
  if (!me().isOrganiser) throw new Error("Not Authorized: only the organiser can do that");
}

/** A deep copy, so callers never share objects with storage or with each other. */
const copy = (rec: Stored): Stored => JSON.parse(JSON.stringify(rec)) as Stored;

/** The raw record, for `toRecord` to normalise (as it does for AppSync results). */
export type LocalRaw = Stored;

export function localList(): LocalRaw[] {
  me();
  return Object.values(readAll()).filter(canSee).map(copy);
}

export function localGet(id: string): LocalRaw | null {
  me();
  const rec = readAll()[id];
  return rec && canSee(rec) ? copy(rec) : null;
}

export function localCreate(name: string, state: CampaignState): LocalRaw {
  requireOrganiser();
  const all = readAll();
  const rec: Stored = { id: crypto.randomUUID(), name, members: [], state, version: 1, updatedAt: new Date().toISOString() };
  all[rec.id] = rec;
  writeAll(all);
  emit({ kind: "update", rec });
  return copy(rec);
}

export function localDelete(id: string): void {
  requireOrganiser();
  const all = readAll();
  delete all[id];
  writeAll(all);
  emit({ kind: "delete", id });
}

export function localSetMembers(id: string, members: string[]): void {
  requireOrganiser();
  const all = readAll();
  const rec = all[id];
  if (!rec) throw new Error("Campaign not found");
  rec.members = [...members];
  rec.updatedAt = new Date().toISOString();
  writeAll(all);
  emit({ kind: "update", rec });
}

/** Returns null when the stored version is no longer `expected` (the caller raises VersionConflict). */
export function localSaveState(id: string, state: CampaignState, expected: number): LocalRaw | null {
  me();
  const all = readAll();
  const rec = all[id];
  if (!rec || !canSee(rec)) throw new Error("Not Authorized");
  if (rec.version !== expected) return null;
  rec.state = JSON.parse(JSON.stringify(state)) as CampaignState;
  rec.version = expected + 1;
  rec.updatedAt = new Date().toISOString();
  writeAll(all);
  emit({ kind: "update", rec });
  return copy(rec);
}

export function localWatch(id: string, onChange: (raw: LocalRaw) => void, onDelete: () => void): () => void {
  const l = (c: Change) => {
    if (c.kind === "delete" && c.id === id) onDelete();
    // Delivered async, like a subscription, so a save's own result lands first.
    else if (c.kind === "update" && c.rec.id === id && canSee(c.rec)) queueMicrotask(() => onChange(copy(c.rec)));
  };
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Pretend network latency is zero, but keep every call async like the real client. */
export const later = <T>(fn: () => T): Promise<T> => Promise.resolve().then(fn);
