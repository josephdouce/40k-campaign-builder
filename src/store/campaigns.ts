// Reading and writing Campaign records through Amplify Data. Pure data access: no React.
import { fresh, mulberry } from "../game/index.ts";
import type { CampaignState } from "../game/index.ts";
import { dataClient } from "./backend.ts";
import { later, localCreate, localDelete, localGet, localList, localSaveState, localSetMembers, localWatch } from "./localBackend.ts";
import { localMode } from "./localMode.ts";
import { normaliseState } from "./normalise.ts";

export interface CampaignRecord {
  id: string;
  name: string;
  /** Lowercase emails. */
  members: string[];
  state: CampaignState;
  version: number;
  updatedAt: string;
}

/** Thrown by `saveState` when another save got in first (the stored version is no longer the expected one). */
export class VersionConflict extends Error {
  constructor() {
    super("Version conflict");
  }
}

interface RawCampaign {
  id: string;
  name: string;
  members?: ReadonlyArray<string | null> | null;
  state?: unknown;
  version?: number | null;
  updatedAt?: string | null;
}

const FIELDS = "id name members state version updatedAt";

export function toRecord(raw: RawCampaign): CampaignRecord | null {
  let parsed: unknown = raw.state;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const state = normaliseState(parsed);
  if (!state) return null;
  return {
    id: raw.id,
    name: raw.name,
    members: (raw.members ?? []).filter((m): m is string => typeof m === "string"),
    state,
    version: raw.version ?? 0,
    updatedAt: raw.updatedAt ?? "",
  };
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Every campaign the signed-in user may read (members: theirs; the organiser: all). */
export async function listCampaigns(): Promise<CampaignRecord[]> {
  const out: CampaignRecord[] = [];
  if (localMode) {
    for (const raw of await later(localList)) {
      const rec = toRecord(raw);
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  let nextToken: string | null | undefined;
  do {
    const res = await dataClient().models.Campaign.list({ limit: 100, nextToken });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    for (const raw of res.data) {
      const rec = toRecord(raw);
      if (rec) out.push(rec);
    }
    nextToken = res.nextToken;
  } while (nextToken);
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** One campaign, or null if it does not exist or the caller can no longer see it. */
export async function getCampaign(id: string): Promise<CampaignRecord | null> {
  if (localMode) {
    const raw = await later(() => localGet(id));
    return raw ? toRecord(raw) : null;
  }
  const res = await dataClient().models.Campaign.get({ id });
  // Not a member (any more) reads as an authorisation error: the same as gone.
  if (res.errors?.some((e) => /Unauthorized|Not Authorized/i.test(`${e.errorType ?? ""} ${e.message}`))) return null;
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data ? toRecord(res.data) : null;
}

/** Organiser only (enforced by the backend). A new campaign has no players: members pick their own. */
export async function createCampaign(name: string): Promise<CampaignRecord> {
  const state = fresh([], mulberry(Math.floor(Math.random() * 2 ** 31)));
  if (localMode) {
    const rec = toRecord(await later(() => localCreate(name.trim(), state)));
    if (!rec) throw new Error("Could not create the campaign");
    return rec;
  }
  const res = await dataClient().models.Campaign.create({
    name: name.trim(),
    members: [],
    state: JSON.stringify(state),
    version: 1,
  });
  const rec = res.data ? toRecord(res.data) : null;
  if (!rec) throw new Error(res.errors?.[0]?.message ?? "Could not create the campaign");
  return rec;
}

export async function deleteCampaign(id: string): Promise<void> {
  if (localMode) return later(() => localDelete(id));
  const res = await dataClient().models.Campaign.delete({ id });
  if (res.errors?.length) throw new Error(res.errors[0].message);
}

/** Organiser only in the UI. Writes `members` alone, so it never touches the game state or version. */
export async function setMembers(id: string, members: string[]): Promise<void> {
  if (localMode) return later(() => localSetMembers(id, members));
  const res = await dataClient().models.Campaign.update({ id, members });
  if (res.errors?.length) throw new Error(res.errors[0].message);
}

const UPDATE = `mutation UpdateCampaign($input: UpdateCampaignInput!, $condition: ModelCampaignConditionInput) {
  updateCampaign(input: $input, condition: $condition) { ${FIELDS} }
}`;

/** The errors on a failed GraphQL call: on the result, or on what the client throws. */
export interface GraphqlFailure {
  errors?: ReadonlyArray<{ message?: string; errorType?: string }>;
}

/** The first error message on a failed call (a result or a thrown value), if there is one. */
export function firstError(e: unknown): string | undefined {
  return (e as GraphqlFailure | null)?.errors?.[0]?.message || undefined;
}

const isConditionFailure = (e: unknown): boolean => {
  const errors = (e as GraphqlFailure | null)?.errors ?? [];
  return errors.some((x) => /ConditionalCheckFailed/i.test(`${x.errorType ?? ""} ${x.message ?? ""}`));
};

/**
 * Save `state` as version `expected + 1`, only if the stored version is still `expected`.
 * Throws VersionConflict if someone else saved first.
 */
export async function saveState(id: string, state: CampaignState, expected: number): Promise<CampaignRecord> {
  if (localMode) {
    const raw = await later(() => localSaveState(id, state, expected));
    if (!raw) throw new VersionConflict();
    const rec = toRecord(raw);
    if (!rec) throw new Error("Save returned an unreadable campaign");
    return rec;
  }
  let result: { data?: { updateCampaign?: RawCampaign | null } | null } & GraphqlFailure;
  try {
    result = (await dataClient().graphql({
      query: UPDATE,
      variables: {
        input: { id, state: JSON.stringify(state), version: expected + 1 },
        condition: { version: { eq: expected } },
      },
    })) as typeof result;
  } catch (e) {
    if (isConditionFailure(e)) throw new VersionConflict();
    throw e;
  }
  if (isConditionFailure(result)) throw new VersionConflict();
  const raw = result.data?.updateCampaign;
  if (!raw) {
    // A conditional failure can come back as a null result without a recognisable error.
    if (result.errors?.length) throw new Error(firstError(result) ?? "Save failed");
    throw new VersionConflict();
  }
  const rec = toRecord(raw);
  if (!rec) throw new Error("Save returned an unreadable campaign");
  return rec;
}

/** Live changes to one campaign. Returns an unsubscribe function. */
export function watchCampaign(id: string, onChange: (rec: CampaignRecord) => void, onDelete: () => void, onError: () => void): () => void {
  if (localMode) {
    return localWatch(
      id,
      (raw) => {
        const rec = toRecord(raw);
        if (rec) onChange(rec);
      },
      onDelete,
    );
  }
  const model = dataClient().models.Campaign;
  const up = model.onUpdate({ filter: { id: { eq: id } } }).subscribe({
    next: (raw) => {
      const rec = toRecord(raw);
      if (rec) onChange(rec);
    },
    error: onError,
  });
  const del = model.onDelete({ filter: { id: { eq: id } } }).subscribe({ next: onDelete, error: onError });
  return () => {
    up.unsubscribe();
    del.unsubscribe();
  };
}
