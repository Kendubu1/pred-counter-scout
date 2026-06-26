// Map calibration: derive the canonical positions of every turret, lane, and
// objective on the Predecessor map from where structures/objectives actually die
// in pred.gg match data (their locations are fixed, so aggregating across games
// recovers the map geometry). Writes data/game-data/map-landmarks.json — a static
// reference the coach fight-map draws. Needs PREDGG_CLIENT_ID/SECRET.
//
//   npm run map:calibrate
//
// World frame (from the data): Y is the base axis (Dawn core ~+16k, Dusk ~-13k),
// X is the flank axis (Fangtooth left ~-5k, Prime right ~+6.7k). The minimap image
// rotates this 45° for its diamond look; we keep world coords.

import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

type XY = [number, number];
const mean = (a: XY[]): XY => [Math.round(a.reduce((s, v) => s + v[0], 0) / a.length), Math.round(a.reduce((s, v) => s + v[1], 0) / a.length)];

/** Split a tier's tower instances into left/mid/right by the two widest X gaps. */
function lanes(pts: XY[]): { lane: string; x: number; y: number }[] {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 3) return [];
  const gaps = sorted.slice(1).map((p, i) => ({ i: i + 1, g: p[0] - sorted[i]![0] }));
  const cuts = gaps.sort((a, b) => b.g - a.g).slice(0, 2).map((c) => c.i).sort((a, b) => a - b);
  const groups = [sorted.slice(0, cuts[0]), sorted.slice(cuts[0], cuts[1]), sorted.slice(cuts[1])];
  return groups.map((g, k) => { const [x, y] = mean(g); return { lane: ['left', 'mid', 'right'][k]!, x, y }; });
}

const OBJ_ALIAS: Record<string, string> = { ORB_PRIME: 'prime', MINI_PRIME: 'prime', FANGTOOTH: 'fangtooth', PRIMAL_FANGTOOTH: 'fangtooth', RIVER: 'river', SEEDLING: 'seedling', GOLD_BUFF: 'gold_buff', CYAN_BUFF: 'cyan_buff', RED_BUFF: 'red_buff', BLUE_BUFF: 'blue_buff', GENESIS_CORE: 'genesis' };

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET'); process.exit(1); }
  const squad = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/squad.json'), 'utf8')) as { lead: string; members: { uuid: string }[] };
  const uuids = [...new Set([squad.lead, ...squad.members.map((m) => m.uuid)])];
  const struct = new Map<string, XY[]>();   // team|tier -> points
  const obj = new Map<string, XY[]>();       // type -> points
  let matches = 0;
  for (const uuid of uuids) {
    try {
      const d = await gql<any>(`{ player(by:{uuid:"${uuid}"}){ matchesPaginated(limit:40, filter:{gameModes:[RANKED]}){ results { match {
        structureDestructions { structureEntityType structureTeam location { x y } }
        objectiveKills { killedEntityType location { x y } } } } } } }`);
      for (const r of (d.player?.matchesPaginated?.results ?? [])) {
        matches++;
        for (const s of (r.match.structureDestructions ?? [])) { if (!s.location) continue; const k = `${String(s.structureTeam).toLowerCase()}|${s.structureEntityType}`; (struct.get(k) ?? struct.set(k, []).get(k)!).push([s.location.x, s.location.y]); }
        for (const o of (r.match.objectiveKills ?? [])) { if (!o.location) continue; const t = OBJ_ALIAS[o.killedEntityType] ?? o.killedEntityType.toLowerCase(); (obj.get(t) ?? obj.set(t, []).get(t)!).push([o.location.x, o.location.y]); }
      }
    } catch { /* skip a member's feed on error */ }
    await new Promise((r) => setTimeout(r, 150));
  }

  const TIER: Record<string, string> = { OUTER_TOWER: 'outer', INNER_TOWER: 'inner', INHIBITOR: 'inhibitor' };
  const structures: { team: string; tier: string; lane: string; x: number; y: number }[] = [];
  const cores: { team: string; x: number; y: number }[] = [];
  for (const [k, pts] of struct) {
    const [team, type] = k.split('|') as [string, string];
    if (type === 'CORE') { const [x, y] = mean(pts); cores.push({ team, x, y }); continue; }
    const tier = TIER[type]; if (!tier) continue;
    for (const l of lanes(pts)) structures.push({ team, tier, lane: l.lane, x: l.x, y: l.y });
  }
  const objectives = [...obj].filter(([, p]) => p.length >= 5).map(([type, p]) => { const [x, y] = mean(p); return { type, x, y, n: p.length }; });

  const allX = [...struct.values(), ...obj.values()].flat().map((p) => p[0]);
  const allY = [...struct.values(), ...obj.values()].flat().map((p) => p[1]);
  const out = {
    generatedAt: new Date().toISOString(),
    source: `pred.gg structureDestructions + objectiveKills locations, aggregated over ${matches} ranked matches`,
    note: 'Y = base axis (dawn core +, dusk core -); X = flank axis. Static map geometry for the coach fight-map.',
    bounds: { xMin: Math.min(...allX), xMax: Math.max(...allX), yMin: Math.min(...allY), yMax: Math.max(...allY) },
    cores, structures, objectives,
  };
  writeFileSync(path.join(ROOT, 'data/game-data/map-landmarks.json'), JSON.stringify(out, null, 1));
  console.log(`map-landmarks: ${matches} matches · ${structures.length} towers · ${cores.length} cores · ${objectives.length} objectives -> data/game-data/map-landmarks.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
