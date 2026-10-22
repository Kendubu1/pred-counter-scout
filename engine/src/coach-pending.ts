import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Imported facts are not a completed review. Resume these before polling. */
export function pendingCoachMatches(root: string): string[] {
  const dir = path.join(root, 'data/postgame');
  const index = path.join(dir, 'index.json');
  if (!existsSync(index)) return [];
  const matches = JSON.parse(readFileSync(index, 'utf8')).matches ?? [];
  return [...new Set<string>(matches.filter((m: any) => {
    if (!/^[a-f0-9-]{36}$/i.test(m.matchId ?? '') || m.stackSize < 2) return false;
    const file = path.join(dir, m.matchId + '.json');
    if (!existsSync(file)) return true;
    const f = JSON.parse(readFileSync(file, 'utf8'));
    const allies = (f.players ?? []).filter((p: any) => p.us);
    if (!m.hasCoaching || !f.coaching?.headline) return true;
    if (f.coaching.personaId?.startsWith('blunt-bullets-')) return !allies.length || allies.some((p: any) => !Array.isArray(f.coaching.playerBullets?.[p.pid]) || f.coaching.playerBullets[p.pid].length < 2 || f.coaching.playerBullets[p.pid].some((s: any) => typeof s !== 'string' || !s.trim()));
    // Published classic reviews may use another player-card schema.
    return !!f.coaching.personaId?.startsWith('blunt-paragraph-') && (!allies.length || allies.some((p: any) => !f.coaching?.perPlayer?.[p.pid]?.trim()));
  }).map((m: any) => m.matchId))];
}
