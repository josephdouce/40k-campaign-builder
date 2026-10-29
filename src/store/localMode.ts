// Local dev mode (`npm run dev:local`): no AWS. A pretend user stands in for Cognito, campaigns live in
// localStorage, and Yellowscribe goes through the Vite dev server. Never on in a production build.
import type { AuthUser } from "./useAuth.ts";

export const localMode = import.meta.env.DEV && import.meta.env.MODE === "offline";

// Per tab (sessionStorage), so two tabs can be two different players on the same campaigns.
const USER_KEY = "varkesh.local.user";
const CHANGE = "varkesh-local-user";

export function localUserFor(email: string, isOrganiser: boolean): AuthUser {
  const e = email.trim().toLowerCase();
  return { userId: `local-${e}`, email: e, isOrganiser };
}

export function readLocalUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { email?: unknown; isOrganiser?: unknown };
    return typeof v.email === "string" && v.email ? localUserFor(v.email, v.isOrganiser === true) : null;
  } catch {
    return null;
  }
}

export function setLocalUser(user: { email: string; isOrganiser: boolean } | null): void {
  try {
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_KEY);
  } catch {
    // Storage blocked: the change still applies until reload.
  }
  window.dispatchEvent(new CustomEvent(CHANGE));
}

export function onLocalUserChange(cb: () => void): () => void {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
}
