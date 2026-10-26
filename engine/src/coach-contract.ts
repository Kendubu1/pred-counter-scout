import { createHash } from 'node:crypto';
import { loadCoachingPreset } from './coaching-presets.js';

export function reviewDigest(f: any): string {
  return createHash('sha256').update(JSON.stringify(f)).digest('hex');
}
export function selectReviewScope<T extends { matchId: string }>(games: T[], scope: string[]): T[] {
  if (!scope.length) throw new Error('COACH_GAMES is required for the publication gate');
  const selected = scope.map(prefix => {
    const matches = games.filter(g => g.matchId?.startsWith(prefix));
    if (matches.length !== 1) throw new Error(`Review scope must resolve exactly one match: ${prefix}`);
    return matches[0]!;
  });
  return [...new Set(selected)];
}
/** Format guard only. The independent critic still judges truth, usefulness and tone. */
export function validateCoachContract(root: string, f: any): void {
  const preset = loadCoachingPreset(root);
  const c = f.coaching;
  const fail = (why: string): never => { throw new Error(`${f.matchId}: ${why}`); };
  if (!c || c.personaId !== preset.id) fail(`coaching must declare active personaId ${preset.id}`);
  const allies = f.players.filter((p: any) => p.us).map((p: any) => p.pid);
  const bullets = preset.playerFormat === 'bullets';
  if (bullets) {
    if (!allies.length || allies.some((id: string) => !Array.isArray(c.playerBullets?.[id]) || c.playerBullets[id].length < 2 || c.playerBullets[id].length > 3 || c.playerBullets[id].some((s: any) => typeof s !== 'string' || !s.trim())) || Object.keys(c.playerBullets ?? {}).some(id => !allies.includes(id))) fail('every allied player needs 2-3 nonempty bullets, with no unknown players');
    if (Object.keys(c.perPlayer ?? {}).length) fail('bullets must not duplicate perPlayer paragraphs');
  }
  if (!bullets && (!allies.length || allies.some((id: string) => !c.perPlayer?.[id]?.trim()) || Object.keys(c.perPlayer ?? {}).some(id => !allies.includes(id)))) fail('every allied player needs a review, with no unknown players');
  for (const m of Object.values(c.moments ?? {}) as any[]) if (!m || typeof m.call !== 'string') fail('moments must be objects with a call string');
  if (c.buildAnalysisVersion === 1) {
    for (const id of allies) for (const field of ['matchup','build','eternal','augment','crest','improvement']) {
      const text = c.buildReads?.[id]?.[field];
      if (typeof text !== 'string' || !text.trim()) fail(`build analysis missing ${field} for ${id}`);
      if (text.trim().split(/\s+/).length > 110) fail(`build analysis ${field} is too long for ${id}`);
    }
    if (Object.keys(c.buildReads ?? {}).some(id => !allies.includes(id))) fail('unknown build analysis player');
  }
  // Version 2: each field is 1-3 short bullets (the page renders them as a list).
  if (c.buildAnalysisVersion === 2) {
    for (const id of allies) for (const field of ['matchup','build','eternal','augment','crest','improvement']) {
      const list = c.buildReads?.[id]?.[field];
      if (!Array.isArray(list) || !list.length || list.some((b: any) => typeof b !== 'string' || !b.trim())) fail(`build analysis missing ${field} for ${id}`);
      if (list.length > 3) fail(`build analysis ${field} has more than 3 bullets for ${id}`);
      if (list.some((b: string) => b.trim().split(/\s+/).length > 22)) fail(`build analysis ${field} bullet is too long for ${id}`);
    }
    if (Object.keys(c.buildReads ?? {}).some(id => !allies.includes(id))) fail('unknown build analysis player');
  }
  if (preset.layout !== 'concise' || !['paragraph', 'bullets'].includes(preset.playerFormat ?? '')) return;
  if (preset.lossReflection && f.result === 'loss' && !c.lossReflection?.trim()) fail('lossReflection is required for a loss');
  if (f.result === 'win' && c.lossReflection) fail('lossReflection belongs only on losses');
  const lines: [string, unknown, number][] = [...(c.lossReflection ? [['lossReflection', c.lossReflection, 100] as [string, unknown, number]] : []), ['headline', c.headline, 25], ['team', c.team, 90], ['focus', c.focus?.action, 50], ...(bullets ? Object.entries(c.playerBullets).flatMap(([id, texts]) => (texts as string[]).map((text, i) => [`${id}.${i}`, text, 40] as [string, unknown, number])) : Object.entries(c.perPlayer).map(([id, text]) => [id, text, 80] as [string, unknown, number]))];
  for (const [field, text, cap] of lines) {
    if (typeof text !== 'string' || !text.trim()) fail(`${field} is empty`);
    const s = text as string;
    if (s.trim().split(/\s+/).length > cap) fail(`${field} is too long (maximum ${cap} words)`);
    if (/[\r\n\u2014]/.test(s) || /\b(?:keep|change|check|receipt)\s*:/i.test(s)) fail(`${field} must be a paragraph without card labels or em dashes`);
    if (/\b\d{1,2}:\d{2}\b|\b\d+(?:\.\d+)?\s*(?:m|min|minutes)\b/i.test(s)) fail(`${field} contains an exact time; put evidence in details`);
  }
  if (Object.keys(c.microReads ?? {}).length || Object.keys(c.verdicts ?? {}).length || c.ranking?.length || c.whatShiftedIt || c.whatWorked || c.deepDive) fail('Paragraph presets use the main paragraphs, not duplicate cards/verdicts/deep dives');
}

export function validatePublication(games: any[], report: any): void {
  if (!games.length || !report.reviewedLines || report.flaggedLines !== 0 || report.unmatched !== 0 || report.rewritesDropped !== 0 || games.some(f => report.reviewedDigests?.[f.matchId] !== reviewDigest(f))) throw new Error('A clean independent critique of these exact saved matches is required before publication');
}
