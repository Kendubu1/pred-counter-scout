// Copy pass: one "Pick it when ..." line per build item, the line that tells an item apart from
// the others that do the same job (maintainer, 2026-11-10: three on-hit items all read "Basic attacks
// that add to your combo", though one adds damage to every attack, one ramps on a single target and
// one empowers the attack after each ability). The tag sheet's rule-based lane line cannot make that
// distinction; this is authored copy, bracketed like every other pass:
//
//   COPY_MODE=prepare npm run review:itempicks   # tasks: items grouped with their look-alikes
//   (pred-scout-coach agent writes engine/copy-tasks/itempicks.responses.json)
//   (an INDEPENDENT critic writes engine/copy-tasks/itempicks.critique.json:
//      { "<slug>": { "verdict": "ok" | "fix" | "drop", "line"?: "<replacement>", "why": "..." } })
//   npm run review:itempicks                      # number check + critic verdicts -> aggregate
//
// Items are grouped by what the tag sheet says they are for (lead answer, else purpose), so the
// author sees the look-alikes together and must say what separates each. Every number in a line
// must be in that item's own stats or game text (src/copy-verify.ts); a line the critic drops,
// or whose replacement fails the number check, is left out and the page falls back to the lane line.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { COPY_DIR, ask, flushTasks, isPrepare, writeAggregate } from '../copy-session.js';
import { strip, tagItems, type CatalogItem } from '../item-tags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PASS = 'itempicks';
export const MAX_WORDS = 18;
const catalog = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as (CatalogItem & { total_price?: number })[];
const tags = tagItems(catalog);
const bySlug = new Map(catalog.map((i) => [i.slug, i]));
const fxText = (i: CatalogItem) => (i.effects ?? []).filter((e) => e.menu_description && !/\{[A-Za-z]+\}/.test(e.menu_description))
  .map((e) => `${e.active ? 'ACTIVE ' : ''}${e.name?.trim() || 'effect'}: ${strip(`${e.condition ?? ''} ${e.menu_description}`).replace(/\s+/g, ' ').trim()}`);
const block = (slug: string) => {
  const i = bySlug.get(slug)!, t = tags[slug]!;
  return `- slug=${slug} "${t.name}" (${i.total_price ?? '?'} gold): stats: ${t.gives.map((g) => `${g.v}${g.pct ? '%' : ''} ${g.label}`).join(', ') || 'none'}. effects: ${fxText(i).join(' | ') || 'none'}`;
};

// Build items only (crests and consumables are picked on other cards), grouped with their look-alikes.
const groups = new Map<string, string[]>();
for (const [slug, t] of Object.entries(tags)) if (t.kind === 'item') { const k = t.answers[0] ? `answers ${t.answers[0]}` : `for ${t.purpose}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(slug); }

const ok = (line: unknown, slug: string): line is string => {
  if (typeof line !== 'string' || !/^Pick it /.test(line.trim())) return false;
  if (line.trim().split(/\s+/).length > MAX_WORDS) return false;
  const i = bySlug.get(slug)!;
  return verifyLine(line, buildAllowed([i.total_price ?? 0], [Object.values(i.stats ?? {}).join(' '), ...fxText(i)]));
};

async function main() {
  const out: Record<string, string> = {};
  const critique = existsSync(path.join(COPY_DIR, `${PASS}.critique.json`)) ? JSON.parse(readFileSync(path.join(COPY_DIR, `${PASS}.critique.json`), 'utf8')) as Record<string, { verdict: string; line?: string }> : null;
  let written = 0, rejected = 0, fixed = 0, dropped = 0;
  for (const [key, slugs] of groups) {
    const prompt = `You write one-line item guidance for Predecessor (a 5v5 MOBA). The data below is the ONLY source of truth for what each item does.

These items all get bought for the same broad job ("${key}"), so a player choosing between them needs to know what SEPARATES each one:

${slugs.map(block).join('\n')}

For each item write ONE line that starts with "Pick it when" or "Pick it if" (max ${MAX_WORDS} words, plain words a new player understands) naming the situation or playstyle where THIS item beats the others in the list. Ground it in the item's own trigger or stats: what has to happen for its effect to work (every basic attack, after each ability cast, a target below a health threshold, standing still, staying on one target, many enemies close together, and so on).
Rules: no two items in the list may get the same advice. Do not say "combo" unless the item's text is about using separate abilities together. Never state an effect the text does not state. Never claim it wins more. Only use numbers that appear in that item's data. No hero names. No semicolons or dashes.

Return strict JSON only: {"<slug>": "<line>", ...}`;
    let parsed: Record<string, string> = {};
    try { parsed = JSON.parse((await ask(PASS, key, prompt)).trim().replace(/^```json?\s*|```$/g, '')) as Record<string, string>; } catch { /* unanswered group */ }
    for (const slug of slugs) {
      let line: unknown = parsed[slug];
      if (line == null) continue;
      const c = critique?.[slug];
      if (c?.verdict === 'drop') { dropped++; continue; }
      if (c?.verdict === 'fix' && c.line) { line = c.line; fixed++; }
      if (ok(line, slug)) { out[slug] = line.trim().replace(/\.$/, ''); written++; } else rejected++;
    }
  }
  flushTasks(PASS);
  if (isPrepare()) { console.log(`${groups.size} groups, ${[...groups.values()].reduce((t, g) => t + g.length, 0)} items -> copy-tasks/${PASS}.tasks.json`); return; }
  if (!writeAggregate(path.join(ROOT, 'data/aggregates/item-picks.json'), {
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over data/catalog/items.json only, items grouped with their look-alikes; every number ground-checked against the item; reviewed by an independent critic',
    critic: critique ? { reviewed: Object.keys(critique).length, fixed, dropped } : null,
    written, rejected, items: out,
  })) return;
  console.log(`${written} lines written, ${rejected} rejected by the number/format check${critique ? `, critic fixed ${fixed} and dropped ${dropped}` : ' (NO critic file: not reviewed)'} -> data/aggregates/item-picks.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
