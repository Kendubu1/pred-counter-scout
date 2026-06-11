// Field probe for the omeda.city match feed. Run before building anything
// on an assumed field: prints what the API actually returns today.
//
// Findings as of June 11, 2026 (keep updated when re-run):
//  - The feed is OLDEST-FIRST: no timestamp param returns 2022 matches.
//    Drive ingestion with ?timestamp=<unix> + cursor, never the default page.
//  - Matches carry NO patch/version field. Partition by start_time against
//    patch release dates.
//  - CORRECTED June 11, 2026: matches 1h old are already fully enriched.
//    The earlier "null enrichment on fresh matches" observation came from
//    the oldest-first default page (2022 matches predate those fields).
//    A short ingest lag remains prudent; 72h is not required.
//  - No augment or Eternal fields exist. Their winrates are not computable.
//  - gold_earned_at_interval is a per-minute cumulative gold array: the
//    source for real checkpoint gold curves (replaces fixture placeholders).

const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function enrichment(players: Record<string, unknown>[]): string {
  const p = players[0] ?? {};
  const fields = ['inventory_data', 'role', 'rank', 'level', 'gold_earned_at_interval'];
  return fields.map((f) => `${f}=${p[f] == null ? 'NULL' : 'ok'}`).join(' ');
}

async function main() {
  const lagDays = Number(process.argv[2] ?? 3);
  for (const [label, ts] of [
    ['fresh (now)', Math.floor(Date.now() / 1000) - 3600],
    [`lagged (${lagDays}d)`, Math.floor(Date.now() / 1000) - lagDays * 86400],
  ] as const) {
    const page = (await get(`https://omeda.city/matches.json?per_page=3&timestamp=${ts}`)) as {
      matches?: { id: string; start_time: string; game_mode: string; players: Record<string, unknown>[] }[];
    };
    const matches = page.matches ?? [];
    console.log(`\n== ${label} ==`);
    for (const m of matches) {
      console.log(`${m.start_time} ${m.game_mode} ${m.id.slice(0, 8)}  ${enrichment(m.players)}`);
    }
  }
  console.log('\nIf lagged rows show NULL enrichment, increase the ingest lag before aggregating.');
}

main().catch((e) => { console.error(e); process.exit(1); });
