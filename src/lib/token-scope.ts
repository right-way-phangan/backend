import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token scopes for the API. One flat API_TOKEN used to open everything:
 * the same secret the site keeps for public beacons (/track/*, /ratelimit)
 * could DELETE /objects or purge photos if it leaked from a Vercel env. A
 * second, optional token (API_TOKEN_TRACK) is accepted ONLY on the beacon
 * paths; the full token keeps working everywhere, so rollout is additive.
 */
export interface TokenSet {
  full?: string;
  track?: string;
}

const TRACK_PREFIXES = ["/track/"];
const TRACK_EXACT = ["/ratelimit"];

export function isTrackPath(path: string): boolean {
  return TRACK_EXACT.includes(path) || TRACK_PREFIXES.some((p) => path.startsWith(p));
}

/** Constant-time compare so a wrong token can't be narrowed by response timing. */
export function safeEqual(got: string | undefined, want: string): boolean {
  const a = Buffer.from(got ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when the Authorization header opens `path` under the given token set. */
export function tokenAllows(path: string, authorization: string | undefined, tokens: TokenSet): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const presented = authorization.slice("Bearer ".length);
  if (tokens.full && safeEqual(presented, tokens.full)) return true;
  if (tokens.track && isTrackPath(path) && safeEqual(presented, tokens.track)) return true;
  return false;
}
