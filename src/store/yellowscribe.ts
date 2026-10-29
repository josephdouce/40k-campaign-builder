// Thin wrapper over the two Yellowscribe custom operations. Errors are thrown as plain Errors with a user-safe message.
import { parseFetched } from "../game/index.ts";
import type { YsFetched } from "../game/index.ts";
import { backendConfigured, dataClient } from "./backend.ts";
import { firstError } from "./campaigns.ts";
import type { GraphqlFailure } from "./campaigns.ts";
import { localMode } from "./localMode.ts";

const NOT_DEPLOYED = "Export isn't available yet: the backend update hasn't been deployed.";
const OFFLINE = "Could not reach the server. Check your connection and try again.";

type OpResult = { data?: unknown } & GraphqlFailure;

/** The typed client, once the backend is configured. An old amplify_outputs.json lacks the operations, hence the runtime check. */
function client() {
  if (!backendConfigured) throw new Error("Export needs the online campaign. Sign in to use it.");
  const c = dataClient();
  if (typeof c.queries.yellowscribeArmy !== "function" || typeof c.mutations.yellowscribePost !== "function") {
    throw new Error(NOT_DEPLOYED);
  }
  return c;
}

async function run(call: () => Promise<OpResult>): Promise<unknown> {
  let res: OpResult;
  try {
    res = await call();
  } catch (e) {
    throw new Error(firstError(e) ?? OFFLINE);
  }
  const msg = firstError(res);
  if (msg) throw new Error(msg);
  if (res.data === null || res.data === undefined) throw new Error("The server sent nothing back. Try again.");
  // The Lambda returns a JSON string for the AWSJSON result. Not yet checked against live AppSync, so accept an
  // object, a JSON string, or a JSON string of a JSON string.
  let data: unknown = res.data;
  for (let i = 0; i < 2 && typeof data === "string"; i++) {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error("The server sent something unreadable. Try again.");
    }
  }
  return data;
}

/** Local dev mode: the Vite dev server runs the Lambda handler itself (see vite.config.ts). */
async function viaDevServer(fieldName: string, args: Record<string, unknown>): Promise<OpResult> {
  const res = await fetch("/__local/yellowscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fieldName, arguments: args }),
  });
  const body = (await res.json()) as { data?: unknown; error?: string };
  return body.error ? { errors: [{ message: body.error }] } : { data: body.data };
}

/** Fetches the army behind a Yellowscribe code. */
export async function fetchArmy(code: string): Promise<YsFetched> {
  if (localMode) {
    const parsed = parseFetched(await run(() => viaDevServer("yellowscribeArmy", { code })));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.fetched;
  }
  const c = client();
  const data = await run(() => c.queries.yellowscribeArmy({ code }));
  const parsed = parseFetched(data);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.fetched;
}

/** Posts the edited units back and returns the new code. */
export async function postArmy(fetched: YsFetched, units: Record<string, unknown>): Promise<string> {
  const { edition, order, modules, uiHeight, uiWidth, decorativeNames } = fetched;
  const payload = JSON.stringify({ edition, order, units, modules, uiHeight, uiWidth, decorativeNames });
  const data = localMode
    ? await run(() => viaDevServer("yellowscribePost", { payload }))
    : await (() => {
        const c = client();
        return run(() => c.mutations.yellowscribePost({ payload }));
      })();
  const code = typeof data === "object" && data !== null ? (data as { code?: unknown }).code : undefined;
  if (typeof code !== "string" || !code) throw new Error("The server did not return a code. Try again.");
  return code;
}
