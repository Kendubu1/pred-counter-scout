import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Imported facts are not a completed review. Resume these before polling. */
export function pendingCoachMatches(root: string): string[] {
  const dir = path.join(root, 'data/postgame');
  const index = path.join(dir, 'index.json');
  if (!existsSync(index)) return [];
  const matches = JSON.parse(readFileSync(index, 'utf8')).matches ?? [];
  return [...new Set<string>(matches.filter((m: any) => {
    // Solo games (stackSize 1) are reviewed too since 2026-11-10; a film only exists for one the pull admitted (wantsFilm).
    if (!/^[a-f0-9-]{36}$/i.test(m.matchId ?? '') || !(m.stackSize >= 1)) return false;
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

/** Does the squad pull film this game? Stacked games always; a solo game (one squad member) only
 *  when it started at or after `soloFrom` (data/coaching/solo.json), so old solo games never back-fill. */
export function wantsFilm(squadMembers: number, startTime: string, soloFrom: string): boolean {
  if (squadMembers >= 2) return true;
  return squadMembers === 1 && !!soloFrom && new Date(startTime).getTime() >= new Date(soloFrom).getTime();
}
