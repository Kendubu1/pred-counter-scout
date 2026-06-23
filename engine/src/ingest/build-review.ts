// Build-reasoning copy pass: per hero + role, explain the item-to-ability synergy
// and purchase order of the meta builds + the optimizer build, JUSTIFY each
// optimizer swap as a concrete gain/lose for THIS hero (why "X over Y"), and log
// a blunt "holes" caveat per build. Runs on the IN-SESSION agent (no Anthropic
// API key) via copy-session; every number is ground-checked by copy-verify.
//
//   COPY_MODE=prepare npm run review:builds   # emit grounded prompts
//   (pred-scout-coach agent fills engine/copy-tasks/builds.responses.json)
//   npm run review:builds                      # verify + write
//
// Reads the committed per-hero artifacts (so it sees the actual meta builds, the
// optimizer build, the swap text, and the build titles) + omeda items/heroes for
// item effects and the ability kit.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface RawItem { slug: string; display_name: string; stats?: Record<string, number>; effects?: { name?: string; menu_description?: string; game_description?: string }[] }
interface RawAbility { key: string; display_name: string; cooldown?: number[]; menu_description?: string; game_description?: string }
interface RawHero { slug: string; name?: string; display_name?: string; abilities?: RawAbility[] }

const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const itemsRaw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/items.json'), 'utf8')) as RawItem[] | { items: RawItem[] };
const itemBySlug = new Map((Array.isArray(itemsRaw) ? itemsRaw : itemsRaw.items).map((i) => [i.slug, i]));
const heroesRaw = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as RawHero[] | { heroes: RawHero[] };
const heroBySlug = new Map((Array.isArray(heroesRaw) ? heroesRaw : heroesRaw.heroes).map((h) => [h.slug, h]));

const itemLine = (slug: string | null): string => {
  if (!slug) return '- (item not in our data)';
  const i = itemBySlug.get(slug);
  if (!i) return `- ${slug}: (not in item data)`;
  const stats = Object.entries(i.stats || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ');
  const fx = (i.effects || []).map((e) => `${e.name ?? 'effect'}: ${clean(e.menu_description || e.game_description)}`).join(' | ');
  return `- ${i.display_name}: stats ${stats || 'none'}; effects: ${fx || 'none'}`;
};

const kitText = (hero: RawHero): string =>
  (hero.abilities || []).filter((a) => a.menu_description || a.game_description)
    .map((a) => `- ${a.key} "${a.display_name}": ${clean(a.menu_description || a.game_description)}`).join('\n');

/** Numbers a build line may cite: item stat values + ability cooldowns + the
 *  winrate/swap numbers from the artifact's own text. */
function allowedFor(itemSlugs: (string | null)[], hero: RawHero, texts: string[], vals: number[]): Set<string> {
  const v = [...vals];
  const t = [...texts];
  for (const slug of itemSlugs) {
    if (!slug) continue;
    const i = itemBySlug.get(slug);
    if (!i) continue;
    for (const val of Object.values(i.stats || {})) if (typeof val === 'number') v.push(val);
    for (const e of i.effects || []) t.push(clean(e.menu_description || e.game_description));
  }
  for (const a of hero.abilities || []) { for (const c of a.cooldown || []) v.push(c); t.push(clean(a.menu_description || a.game_description)); }
  return buildAllowed(v, t);
}

interface MetaB { title: string; items: { name: string; slug: string | null }[]; shrunkWr: number; n: number; whyLine: string; optimizer: string | null }
interface RoleV { role: string; build: { title: string; items: { name: string; slug: string }[] }; metaBuilds: MetaB[] }
interface Artifact { slug: string; name: string; roles: RoleV[] }

async function main() {
  const out: Record<string, Record<string, unknown>> = {};
  let written = 0, rejected = 0;
  const artDir = path.join(ROOT, 'data/artifacts');
  const files = readdirSync(artDir).filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.includes('matrix'));

  for (const f of files) {
    const art = JSON.parse(readFileSync(path.join(artDir, f), 'utf8')) as Artifact;
    const hero = heroBySlug.get(art.slug);
    if (!hero || !art.roles) continue;
    for (const rv of art.roles) {
      const id = `${art.slug}:${rv.role}`;
      const metaBlocks = rv.metaBuilds.map((m, i) =>
        `META BUILD ${i} — "${m.title}" (${(m.shrunkWr * 100).toFixed(1)}% over ${m.n} games): ${m.items.map((it) => it.name).join(' -> ')}\n${m.items.map((it) => itemLine(it.slug)).join('\n')}\n why(sim): ${m.whyLine}${m.optimizer ? `\n optimizer-swap: ${m.optimizer}` : ''}`).join('\n\n');
      const optBlock = `OPTIMIZER BUILD — "${rv.build.title}": ${rv.build.items.map((it) => it.name).join(' -> ')}\n${rv.build.items.map((it) => itemLine(it.slug)).join('\n')}`;
      const prompt = `You explain Predecessor (a MOBA) builds for ${art.name} played as ${rv.role}. The data below — the hero's abilities, the field's META BUILDS (with sim notes and any optimizer swap), and our OPTIMIZER BUILD — is the ONLY source of truth.

HERO ABILITIES:
${kitText(hero)}

${metaBlocks}

${optBlock}

Return strict JSON only:
{"metaBuilds":[{"synergy":"...","items":{"<item name>":"<why>"},"holes":"..."}, ... one per META BUILD in order ...],
 "optimizer":{"synergy":"...","items":{"<item name>":"<why>"},"swaps":[{"out":"<item>","in":"<item>","gain":"...","lose":"..."}],"holes":"..."}}

Rules:
- synergy = ONE sentence (max 30 words) on how these items work WITH this hero's abilities and why the purchase order — name the ability/passive interaction, not just the stat.
- items = for EACH item in that build, ONE short clause (max 14 words) on why it's bought and where it fits in the order, tied to the hero's ability/synergy (not just the stat). Key it by the item's EXACT name as shown above.
- For EACH optimizer-swap line ("try X over Y"), add a swap with the concrete GAIN (what X adds to this hero) and LOSE (what dropping Y costs this hero). If a build has no optimizer-swap line, omit it.
- holes = ONE blunt caveat poking a hole in that build for THIS hero (when it falls flat).
- Plain language, action-first, no jargon (say "tankiness" not "eHP"). Use ONLY numbers that appear above; when unsure, use none.`;

      const raw = (await ask('builds', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
      if (isPrepare()) continue;
      try {
        type BuildR = { synergy?: string; items?: Record<string, string>; holes?: string };
        const parsed = JSON.parse(raw) as { metaBuilds?: BuildR[]; optimizer?: BuildR & { swaps?: { out?: string; in?: string; gain?: string; lose?: string }[] } };
        const allItems = [...rv.build.items.map((i) => i.slug), ...rv.metaBuilds.flatMap((m) => m.items.map((i) => i.slug))];
        const texts = [...rv.metaBuilds.map((m) => m.optimizer ?? ''), ...rv.metaBuilds.map((m) => m.whyLine)];
        const allowed = allowedFor(allItems, hero, texts, rv.metaBuilds.map((m) => Math.round(m.shrunkWr * 1000) / 10));
        const keep = (s?: string): string | null => { if (!s) return null; if (verifyLine(s, allowed)) { written++; return s; } rejected++; return null; };
        // Per-item "why" map: verify each clause, keep only grounded ones.
        const keepItems = (m?: Record<string, string>): Record<string, string> => {
          const o2: Record<string, string> = {};
          for (const [k, v] of Object.entries(m ?? {})) { const kept = keep(v); if (kept) o2[k] = kept; }
          return o2;
        };
        const metaOut = rv.metaBuilds.map((_, i) => ({ synergy: keep(parsed.metaBuilds?.[i]?.synergy), items: keepItems(parsed.metaBuilds?.[i]?.items), holes: keep(parsed.metaBuilds?.[i]?.holes) }));
        const o = parsed.optimizer;
        const optOut = o ? {
          synergy: keep(o.synergy),
          items: keepItems(o.items),
          // dedupe by out+in: several meta builds can share the same optimizer swap
          // (e.g. all run Storm Breaker), which would otherwise repeat it verbatim.
          swaps: (() => { const seen = new Set<string>(); return (o.swaps ?? []).map((sw) => ({ out: sw.out ?? '', in: sw.in ?? '', gain: keep(sw.gain), lose: keep(sw.lose) })).filter((sw) => { const k = `${sw.out}|${sw.in}`; if (seen.has(k)) return false; seen.add(k); return true; }); })(),
          holes: keep(o.holes),
        } : null;
        (out[art.slug] ??= {})[rv.role] = { metaBuilds: metaOut, optimizer: optOut };
        process.stdout.write('.');
      } catch { process.stdout.write('x'); }
    }
  }
  flushTasks('builds');
  if (isPrepare()) return;
  writeFileSync(path.join(ROOT, 'data/aggregates/build-reasoning.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over the committed artifacts + omeda item/ability data only; every number ground-checked, failing lines dropped',
    written, rejected, heroes: out,
  }, null, 1));
  console.log(`\n${written} build-reasoning lines written, ${rejected} rejected -> data/aggregates/build-reasoning.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
