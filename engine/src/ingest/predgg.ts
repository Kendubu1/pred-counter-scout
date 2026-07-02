// pred.gg GraphQL client (the community API behind the dev portal).
// Auth discovered June 12: GET https://pred.gg/auth/token with HTTP Basic
// (client_id:client_secret) returns a ~30-minute JWT; /gql accepts it as
// a Bearer token. Public reads work unauthenticated; leaderboards and the
// statistic scopes require the token.
//
// Credentials come from PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET env vars
// and are NEVER written to the repo. Without them, callers degrade
// gracefully (return null) and the pipeline stays anonymous-tier.

const BASE = 'https://pred.gg';
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };

let cachedToken: { token: string; expiresAt: number } | null = null;

export function hasCredentials(): boolean {
  return !!(process.env.PREDGG_CLIENT_ID && process.env.PREDGG_CLIENT_SECRET);
}

export async function getToken(): Promise<string | null> {
  if (!hasCredentials()) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const basic = Buffer.from(`${process.env.PREDGG_CLIENT_ID}:${process.env.PREDGG_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/auth/token`, { headers: { ...UA, Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new Error(`pred.gg token exchange failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 1800) * 1000 };
  return cachedToken.token;
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const res = await fetch(`${BASE}/gql`, {
      method: 'POST',
      headers: {
        ...UA,
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status >= 500 || res.status === 429) {
      lastErr = new Error(`pred.gg gql: HTTP ${res.status}`);
      continue; // transient; back off and retry
    }
    if (!res.ok) throw new Error(`pred.gg gql: HTTP ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(`pred.gg gql: ${body.errors.map((e) => e.message).join('; ')}`);
    return body.data as T;
  }
  throw lastErr ?? new Error('pred.gg gql: retries exhausted');
}

/** The newest NAMED game version on pred.gg (e.g. { id: "152", name: "1.15" }).
 *  Used to pin build/perk statistics to the current patch; entries with a null
 *  name are unreleased/internal and skipped. Cached per process. */
let cachedVersion: { id: string; name: string } | null = null;
export async function currentVersion(): Promise<{ id: string; name: string }> {
  if (cachedVersion) return cachedVersion;
  const d = await gql<{ versions: { id: string; name: string | null }[] }>(`{ versions { id name } }`);
  const named = d.versions.filter((v) => v.name);
  const last = named[named.length - 1];
  if (!last) throw new Error('pred.gg: no named versions');
  cachedVersion = { id: last.id, name: last.name! };
  return cachedVersion;
}

const LANES = ['CARRY', 'MIDLANE', 'OFFLANE', 'JUNGLE', 'SUPPORT'] as const;

export interface TopPlayer {
  ranking: number;
  name: string;
  uuid: string | null;   // links to pred.gg/players/<uuid>
  points: number;
  rank: string;
  heroName: string | null;
  heroSlug: string | null;
}

/** Current ranked split: the rating with no end time (latest start wins). */
export async function currentRatingId(): Promise<string> {
  const d = await gql<{ ratings: { id: string; startTime: string; endTime: string | null }[] }>(
    '{ ratings { id startTime endTime } }',
  );
  const open = d.ratings.filter((r) => !r.endTime).sort((a, b) => b.startTime.localeCompare(a.startTime));
  if (!open.length) throw new Error('no open rating split');
  return open[0]!.id;
}

/**
 * Top ranked players per lane from the split leaderboard (favRole filter).
 * Requires credentials; returns null without them. Null player names
 * (private profiles) are skipped.
 */
export async function topPlayersPerLane(limit = 5): Promise<Record<string, TopPlayer[]> | null> {
  if (!hasCredentials()) return null;
  const ratingId = await currentRatingId();
  const out: Record<string, TopPlayer[]> = {};
  for (const lane of LANES) {
    const d = await gql<{
      leaderboardPaginated: {
        results: {
          ranking: number; points: number;
          rank: { name: string } | null;
          player: { name: string | null; uuid: string | null; favHero: { name: string; slug: string } | null } | null;
        }[];
      };
    }>(
      `{ leaderboardPaginated(ratingId: "${ratingId}", limit: ${limit + 5}, filter: { favRole: ${lane} }) {
        results { ranking points rank { name } player { name uuid favHero { name slug } } }
      } }`,
    );
    out[lane.toLowerCase()] = d.leaderboardPaginated.results
      .filter((r) => r.player?.name)
      .slice(0, limit)
      .map((r) => ({
        ranking: r.ranking,
        name: r.player!.name!,
        uuid: r.player!.uuid ?? null,
        points: Math.round(r.points),
        rank: r.rank?.name ?? '',
        heroName: r.player!.favHero?.name ?? null,
        heroSlug: r.player!.favHero?.slug ?? null,
      }));
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}
