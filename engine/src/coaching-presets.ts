import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const profile = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), layout: z.enum(['classic', 'concise']), lossReflection: z.boolean().optional(), playerFormat: z.enum(['paragraph', 'actions']).optional(), instructions: z.string().min(1) });
const registry = z.object({ active: z.string(), presets: z.array(profile).min(1) }).superRefine((v, ctx) => {
  if (new Set(v.presets.map(p => p.id)).size !== v.presets.length || !v.presets.some(p => p.id === v.active)) ctx.addIssue({ code: 'custom', message: 'Duplicate or missing active preset' });
});
export function loadCoachingPreset(root: string) {
  const config = registry.parse(JSON.parse(readFileSync(path.join(root, 'data/coaching/personas.json'), 'utf8')));
  return config.presets.find(p => p.id === config.active)!;
}
export function coachingPresetPrompt(root: string): string {
  const preset = loadCoachingPreset(root);
  return `ACTIVE COACHING PRESET: ${preset.id} (layout: ${preset.layout}). These format/tone rules override older format requirements in this prompt and agent instructions; factual grounding and safety still apply. ${preset.instructions}`;
}
const coaching = z.object({ headline: z.string(), team: z.string(), perPlayer: z.record(z.string()) }).passthrough();
const snapshot = z.object({ id: z.string(), sourceCommit: z.string().min(1), note: z.string(), reviews: z.record(coaching) });
/** Validate every target before changing anything. Restore only authored coaching. */
export function selectCoachingPreset(root: string, id: string, restoreReviews = false): number {
  const configPath = path.join(root, 'data/coaching/personas.json');
  const config = registry.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (!config.presets.some(p => p.id === id)) throw new Error(`Unknown coaching preset: ${id}`);
  const pending: { file: string; text: string }[] = [];
  if (restoreReviews) {
    const saved = snapshot.parse(JSON.parse(readFileSync(path.join(root, 'data/coaching/review-presets', `${id}.json`), 'utf8')));
    if (saved.id !== id) throw new Error('Snapshot preset identity mismatch');
    if (!Object.keys(saved.reviews).length) throw new Error('Snapshot contains no reviews');
    for (const [matchId, review] of Object.entries(saved.reviews)) {
      if (!/^[a-zA-Z0-9-]+$/.test(matchId)) throw new Error('Invalid match identity');
      const file = path.join(root, 'data/postgame', `${matchId}.json`);
      const match = z.object({ matchId: z.literal(matchId), players: z.array(z.object({ pid: z.string() }).passthrough()) }).passthrough().parse(JSON.parse(readFileSync(file, 'utf8')));
      if (Object.keys(review.perPlayer).some(pid => !match.players.some(p => p.pid === pid))) throw new Error(`Unknown review player in ${matchId}`);
      pending.push({ file, text: JSON.stringify({ ...match, coaching: review }, null, 2) + '\n' });
    }
  }
  for (const update of pending) writeFileSync(update.file, update.text);
  writeFileSync(configPath, JSON.stringify({ ...config, active: id }, null, 2) + '\n');
  return pending.length;
}
