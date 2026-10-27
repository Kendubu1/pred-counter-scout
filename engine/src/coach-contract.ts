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
/** Explicit words the flags format budgets (the tone is in the wording, not the swear count). */
export const PROFANITY = /\b(?:fuck\w*|shit\w*|damn\w*|bitch\w*|bastard\w*|piss\w*|cock\w*|dick\w*|asshole\w*|ass|hell|crap\w*|hard-on)\b/i;
/** Team totals a whyFirst review may not lead with (maintainer 2026-10-27: objective damage is a stat line, not the story). */
export const TOTALS = /\bobjective damage\b|\bteam gold\b|\bgold finished\b/i;
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
  const flagsFormat = preset.summaryFormat === 'flags';
  if (flagsFormat) {
    // Flags replace the team paragraph and the loss reflection (2026-10-26):
    // 2-4 ranked one-liners, each citing an engine flag (interrogation.gameFlags) or "other".
    const known = new Set(((f.interrogation?.gameFlags ?? []) as { id: string }[]).map(g => g.id));
    const flags = c.flags;
    const flagWords = preset.flagWords ?? 18;
    if (!Array.isArray(flags) || flags.length < 2 || flags.length > 4) fail('flags needs 2-4 entries');
    for (const [i, fl] of (flags as any[]).entries()) {
      if (!fl || typeof fl.ref !== 'string' || (fl.ref !== 'other' && !known.has(fl.ref))) fail(`flags.${i} must cite a gameFlags id or "other"`);
      if (typeof fl.text !== 'string' || fl.text.trim().split(/\s+/).length > flagWords) fail(`flags.${i} needs one line of at most ${flagWords} words`);
    }
    // whyFirst (blunt-why-v10, 2026-10-27): totals are the consequence, never the lead.
    if (preset.whyFirst) {
      for (const [field, text] of [['headline', c.headline], ...(flags as any[]).map((fl, i) => [`flags.${i}`, fl.text])] as [string, string][]) {
        if (TOTALS.test(text ?? '')) fail(`${field} leads with a total (objective damage, team gold); say what happened and why, totals stay in the evidence`);
      }
      if ((String(c.headline ?? '').match(/\d[\d,.]*k?/g) ?? []).length > 1) fail('headline carries more than one number; name the mechanism, not the stat line');
    }
    const refs = (flags as any[]).map(fl => fl.ref).filter(r => r !== 'other');
    if (new Set(refs).size !== refs.length) fail('flags cite the same game flag twice');
    if (c.team?.trim() || c.lossReflection?.trim()) fail('flags replace team and lossReflection; leave them empty');
    if (PROFANITY.test(c.focus?.action ?? '')) fail('the lesson (focus.action) stays clean');
    const hits = [c.headline, ...(flags as any[]).map(fl => fl.text), ...Object.values(c.playerBullets ?? {}).flat()].join(' ').match(new RegExp(PROFANITY.source, 'gi')) ?? [];
    if (hits.length > 3) fail(`profanity is a spotlight: ${hits.length} explicit words, maximum 3`);
    // The row already shows the player and hero (2026-10-26): bullets start with the point.
    for (const p of f.players.filter((q: any) => q.us)) {
      const own = [p.heroName, p.squadName, p.name].filter((n: any) => typeof n === 'string' && n.length >= 3 && !/private/i.test(n));
      for (const [i, b] of ((c.playerBullets?.[p.pid] ?? []) as string[]).entries()) {
        const named = own.find((n: string) => b.toLowerCase().includes(n.toLowerCase()));
        if (named) fail(`${p.pid}.${i} repeats "${named}"; the row already names the player and hero`);
      }
    }
  }
  const lines: [string, unknown, number][] = [...(c.lossReflection ? [['lossReflection', c.lossReflection, 100] as [string, unknown, number]] : []), ['headline', c.headline, 25], ...(flagsFormat ? (c.flags as any[]).map((fl, i) => [`flags.${i}`, fl.text, preset.flagWords ?? 18] as [string, unknown, number]) : [['team', c.team, 90] as [string, unknown, number]]), ['focus', c.focus?.action, flagsFormat ? 35 : 50], ...(bullets ? Object.entries(c.playerBullets).flatMap(([id, texts]) => (texts as string[]).map((text, i) => [`${id}.${i}`, text, flagsFormat ? 30 : 40] as [string, unknown, number])) : Object.entries(c.perPlayer).map(([id, text]) => [id, text, 80] as [string, unknown, number]))];
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
