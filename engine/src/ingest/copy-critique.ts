// Independent bias/quality critic over generated copy. A SEPARATE agent (NOT the
// author pred-scout-coach) reviews each hero/role's build-reasoning against the
// source kit + items and flags any line that is misleading, overconfident,
// factually wrong vs the source, jargon-heavy, or broken English — each flag
// carries a suggested rewrite. Produces an audit report
// (data/aggregates/copy-critique.json) whose agreement rate answers "how
// confident is the copy". Suggested rewrites are ground-checked by copy-verify so
// a fix can't introduce an ungrounded number.
//
//   COPY_MODE=prepare npm run review:critique   # emit critique tasks
//   (an INDEPENDENT general-purpose agent fills critique.responses.json)
//   npm run review:critique                      # aggregate + write the report

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';
import { factsFor, isHeroArtifact, type Artifact as HeroArt, type RawHero as KitHero } from '../hero-coach-copy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const clean = (t?: string) => (t || '').replace(/<br\s*\/?>(\n)?/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// A round can be scoped to one copy surface (CRITIQUE_ONLY=herocoach) so a new
// surface converges on its own history instead of re-judging — and churning —
// copy that already converged. Default is every surface, as before. The scope is
// recorded in the round so an agreement rate can never be read wider than it was
// measured; a scoped loop points CRITIQUE_HISTORY/CRITIQUE_REPORT at its own files.
const SURFACES = ['builds', 'herocoach', 'coach'] as const;
type Surface = typeof SURFACES[number];
const SCOPE = new Set<string>((process.env.CRITIQUE_ONLY ?? SURFACES.join(',')).split(',').map((s) => s.trim()).filter(Boolean));
const inScope = (s: Surface) => SCOPE.has(s);
const REPORT_PATH = path.join(ROOT, process.env.CRITIQUE_REPORT ?? 'data/aggregates/copy-critique.json');
const HISTORY_PATH = path.join(ROOT, process.env.CRITIQUE_HISTORY ?? 'data/aggregates/copy-critique-history.json');

interface RawItem { slug: string; display_name: string; stats?: Record<string, number>; effects?: { name?: string; menu_description?: string; game_description?: string }[] }
interface RawHero { slug: string; name?: string; display_name?: string; abilities?: { key: string; display_name: string; cooldown?: number[]; menu_description?: string; game_description?: string }[] }

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
function allowedFor(itemSlugs: (string | null)[], hero: RawHero): Set<string> {
  const v: number[] = [];
  const t: string[] = [];
  for (const slug of itemSlugs) { if (!slug) continue; const i = itemBySlug.get(slug); if (!i) continue; for (const val of Object.values(i.stats || {})) if (typeof val === 'number') v.push(val); for (const e of i.effects || []) t.push(clean(e.menu_description || e.game_description)); }
  for (const a of hero.abilities || []) { for (const c of a.cooldown || []) v.push(c); t.push(clean(a.menu_description || a.game_description)); }
  return buildAllowed(v, t);
}

interface MetaB { title: string; items: { name: string; slug: string | null }[]; whyLine: string; synergy?: string | null; holes?: string | null }
interface RoleV { role: string; build: { title: string; items: { name: string; slug: string }[] } }
interface Artifact { slug: string; name: string; roles: RoleV[] }
interface Reason { metaBuilds?: { synergy?: string | null; holes?: string | null; items?: Record<string, string> }[]; optimizer?: { synergy?: string | null; holes?: string | null; items?: Record<string, string>; swaps?: { out: string; in: string; gain?: string | null; lose?: string | null }[] } }

const lines = (r: Reason): string[] => {
  const out: string[] = [];
  const push = (s?: string | null) => { if (s) out.push(s); };
  (r.metaBuilds ?? []).forEach((m) => { push(m.synergy); push(m.holes); Object.values(m.items ?? {}).forEach(push); });
  if (r.optimizer) { push(r.optimizer.synergy); push(r.optimizer.holes); Object.values(r.optimizer.items ?? {}).forEach(push); (r.optimizer.swaps ?? []).forEach((s) => { push(s.gain); push(s.lose); }); }
  return out;
};

// Replace any string value exactly equal to `from` with `to`, anywhere in a
// hero/role reasoning subtree (synergy, holes, per-item whys, swap gain/lose).
function deepReplace(o: unknown, from: string, to: string): unknown {
  if (typeof o === 'string') return o === from ? to : o;
  if (Array.isArray(o)) return o.map((x) => deepReplace(x, from, to));
  if (o && typeof o === 'object') { const r: Record<string, unknown> = {}; for (const k in o as Record<string, unknown>) r[k] = deepReplace((o as Record<string, unknown>)[k], from, to); return r; }
  return o;
}

async function main() {
  const BR = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/build-reasoning.json'), 'utf8')) as { heroes: Record<string, Record<string, Reason>>; [k: string]: unknown };
  const reasoning = BR.heroes;
  const artDir = path.join(ROOT, 'data/artifacts');
  const files = readdirSync(artDir).filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.includes('matrix'));

  const report: Record<string, Record<string, { quote: string; severity: string; issue: string; rewrite: string | null }[]>> = {};
  let reviewedLines = 0, flaggedLines = 0, rewritesGrounded = 0, rewritesDropped = 0;

  for (const f of inScope('builds') ? files : []) {
    const art = JSON.parse(readFileSync(path.join(artDir, f), 'utf8')) as Artifact;
    const hero = heroBySlug.get(art.slug);
    if (!hero || !art.roles) continue;
    for (const rv of art.roles) {
      const r = reasoning[art.slug]?.[rv.role];
      if (!r) continue;
      const copyLines = lines(r);
      if (!copyLines.length) continue;
      const id = `${art.slug}:${rv.role}`;
      const itemSlugs = [...rv.build.items.map((i) => i.slug), ...(art as unknown as { metaBuilds?: MetaB[] }).metaBuilds?.flatMap((m) => m.items.map((i) => i.slug)) ?? []];
      const prompt = `You are an INDEPENDENT reviewer of build copy for ${art.name} (${rv.role}) in Predecessor (a MOBA). Another agent wrote the COPY below; you did NOT write it. Judge it against the SOURCE only.

SOURCE — hero abilities:
${kitText(hero)}
SOURCE — items in play:
${[...new Set(itemSlugs)].map((s) => itemLine(s)).join('\n')}

COPY UNDER REVIEW (one per line):
${copyLines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Flag ONLY real problems: a line that (a) describes the WRONG item or ability, (b) is factually wrong vs the SOURCE, (c) is overconfident/misleading, (d) uses jargon a new player won't get, or (e) is broken/ungrammatical English. Do not nitpick style.
Return strict JSON: {"flags":[{"quote":"<the exact line text>","severity":"high|med|low","issue":"<what's wrong, one phrase>","rewrite":"<a corrected line, or null if it should just be dropped>"}]}. If the copy is all fine, return {"flags":[]}.`;

      const raw = (await ask('critique', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
      reviewedLines += copyLines.length;
      if (isPrepare()) continue;
      try {
        const parsed = JSON.parse(raw) as { flags?: { quote?: string; severity?: string; issue?: string; rewrite?: string | null }[] };
        const allowed = allowedFor(itemSlugs, hero);
        const flags = (parsed.flags ?? []).filter((fl) => fl.quote).map((fl) => {
          let rewrite = fl.rewrite ?? null;
          if (rewrite) { if (verifyLine(rewrite, allowed)) rewritesGrounded++; else { rewrite = null; rewritesDropped++; } } // a fix can't add an ungrounded number
          return { quote: fl.quote!, severity: fl.severity ?? 'low', issue: fl.issue ?? '', rewrite };
        });
        if (flags.length) { (report[art.slug] ??= {})[rv.role] = flags; flaggedLines += flags.length; }
        process.stdout.write('.');
      } catch { process.stdout.write('x'); }
    }
  }

  // Hero-page coach lines — the SAME independent critic over the third copy
  // surface (data/aggregates/hero-coach-lines.json). Source is the identical
  // facts block the author was handed, rebuilt by the shared pure builder, so
  // the judge grades against exactly what the author could see.
  const HC_PATH = path.join(ROOT, 'data/aggregates/hero-coach-lines.json');
  interface HCCell { line: string | null; watchout: string | null }
  let hcDoc: { heroes: Record<string, Record<string, HCCell>>; [k: string]: unknown } | null = null;
  const hcFlags: Record<string, Record<string, { quote: string; severity: string; issue: string; rewrite: string | null }[]>> = {};
  if (inScope('herocoach') && existsSync(HC_PATH)) {
    hcDoc = JSON.parse(readFileSync(HC_PATH, 'utf8')) as { heroes: Record<string, Record<string, HCCell>> };
    for (const f of readdirSync(artDir).filter(isHeroArtifact)) {
      const art = JSON.parse(readFileSync(path.join(artDir, f), 'utf8')) as HeroArt;
      const kit = heroBySlug.get(art.slug) as KitHero | undefined;
      const cells = hcDoc.heroes[art.slug];
      if (!kit || !cells || !Array.isArray(art.roles)) continue;
      for (const rv of art.roles) {
        const cell = cells[rv.role];
        if (!cell || !(cell.line || cell.watchout)) continue;
        const facts = factsFor(art, rv, kit);
        const copyLines = [cell.line, cell.watchout].filter(Boolean) as string[];
        const prompt = `You are an INDEPENDENT reviewer of hero-page coaching copy for ${art.name} (${rv.role}) in Predecessor (a MOBA). Another agent wrote the COPY below; you did NOT write it. Judge it against the SOURCE only.

SOURCE (everything the author was allowed to use):
${facts}

COPY UNDER REVIEW (one per line):
${copyLines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Flag ONLY real problems: a line that (a) names an ability or item that is not in the SOURCE, or describes one wrongly, (b) is factually wrong vs the SOURCE, (c) leads with a statistic instead of an action, or claims a magnitude the HONESTY NOTES say is not proven (e.g. a size of gain for an augment the sim cannot model), (d) uses jargon a brand-new player won't get, or (e) is broken/ungrammatical English. Do not nitpick style.
Return strict JSON: {"flags":[{"quote":"<the exact line text>","severity":"high|med|low","issue":"<what's wrong, one phrase>","rewrite":"<a corrected line, or null if it should just be dropped>"}]}. If the copy is all fine, return {"flags":[]}.`;

        const raw = (await ask('critique', `herocoach:${art.slug}:${rv.role}`, prompt)).trim().replace(/^```json?\s*|```$/g, '');
        reviewedLines += copyLines.length;
        if (isPrepare()) continue;
        try {
          const parsed = JSON.parse(raw) as { flags?: { quote?: string; severity?: string; issue?: string; rewrite?: string | null }[] };
          const allowed = buildAllowed([], [facts]);
          const flags = (parsed.flags ?? []).filter((fl) => fl.quote).map((fl) => {
            let rewrite = fl.rewrite ?? null;
            if (rewrite) { if (verifyLine(rewrite, allowed)) rewritesGrounded++; else { rewrite = null; rewritesDropped++; } }
            return { quote: fl.quote!, severity: fl.severity ?? 'low', issue: fl.issue ?? '', rewrite };
          });
          if (flags.length) { (hcFlags[art.slug] ??= {})[rv.role] = flags; flaggedLines += flags.length; }
          process.stdout.write('.');
        } catch { process.stdout.write('x'); }
      }
    }
  }

  // Coach report critique — the SAME independent critic, different source (the
  // player's stats + our kit reads). Reviews the agent-written coachReasoning on
  // the lead's coach.json AND on every squad member's report, because that is
  // exactly the set coach-review.ts authors: judging only the lead left five
  // reports of unreviewed coaching on the page.
  interface CoachReport { file: string; id: string; doc: Record<string, unknown> }
  const coachReports: CoachReport[] = [];
  const coachFlags: Record<string, { quote: string; severity: string; issue: string; rewrite: string | null }[]> = {};
  if (inScope('coach')) {
    const coachPath = path.join(ROOT, 'data/artifacts/coach.json');
    const playersDir = path.join(ROOT, 'data/artifacts/players');
    const candidates: { file: string; id: string }[] = [];
    if (existsSync(coachPath)) candidates.push({ file: coachPath, id: 'coach' });
    if (existsSync(playersDir)) {
      for (const f of readdirSync(playersDir).filter((x) => x.endsWith('.json')).sort()) {
        candidates.push({ file: path.join(playersDir, f), id: `coach:player-${f.replace('.json', '')}` });
      }
    }
    for (const { file, id } of candidates) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cj = JSON.parse(readFileSync(file, 'utf8')) as any;
      const cr = cj.coachReasoning;
      if (!cr) continue;
      coachReports.push({ file, id, doc: cj });
      const cLines = [cr.assessment, ...(cr.plan ?? []), ...(cr.insights ?? []).flatMap((i: { title?: string; finding?: string }) => [i.title, i.finding])].filter(Boolean) as string[];
      if (!cLines.length) continue;
      const src = `PLAYER: ${cj.player?.name} — ${cj.player?.career?.games} career games at ${(cj.player?.career?.winrate * 100).toFixed(1)}% winrate, KDA ${cj.player?.career?.kda?.toFixed(1)}, currently ${cj.player?.current?.rank} ${cj.player?.current?.points} VP. Goal ${cj.goal?.tier} (${cj.goal?.vp} VP, gap ${cj.goal?.gapVp}, peak ${cj.goal?.peakAllTime}).
ROLES: ${(cj.roles ?? []).map((r: { role: string; rawWr: number; games: number }) => `${r.role} ${(r.rawWr * 100).toFixed(1)}% over ${r.games}`).join(' · ')}
HEROES: ${(cj.pool ?? []).slice(0, 8).map((h: { name: string; rawWr: number; games: number }) => `${h.name} ${(h.rawWr * 100).toFixed(1)}% over ${h.games}`).join(' · ')}
KIT READS: ${(cj.leanInto ?? []).map((h: { engineCoachLine?: string }) => h.engineCoachLine).filter(Boolean).join(' ')}
LEDGER: ${(cj.ledger?.entries ?? []).map((e: { change: string; winsPer100: number; receipt: string }) => `${e.change} (+${e.winsPer100}; ${e.receipt})`).join(' ')}
INSIGHT EVIDENCE: ${(cj.insights ?? []).map((i: { receipt?: string }) => i.receipt).filter(Boolean).join(' ')}`;
      const prompt = `You are an INDEPENDENT reviewer of COACHING copy for ${cj.player?.name} in Predecessor (a MOBA). Another agent wrote the COPY; you did NOT. Judge it against the SOURCE only.

SOURCE (the player's stats + our kit reads):
${src}

COPY UNDER REVIEW (one per line):
${cLines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Flag ONLY real problems: a line that is factually wrong vs the SOURCE, overconfident/misleading, names the wrong hero/role, uses jargon a new player won't get, or is broken/ungrammatical English. The report is read by the whole squad, so a line written in second person ("you/your") is also a defect — rewrite it naming the player in third person or as a bare imperative. Do not nitpick style.
Return strict JSON: {"flags":[{"quote":"<exact line text>","severity":"high|med|low","issue":"<one phrase>","rewrite":"<corrected line, or null to drop>"}]}. If all fine, return {"flags":[]}.`;
      const raw = (await ask('critique', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
      reviewedLines += cLines.length;
      if (isPrepare()) continue;
      try {
        const parsed = JSON.parse(raw) as { flags?: { quote?: string; severity?: string; issue?: string; rewrite?: string | null }[] };
        const allowed = buildAllowed([], [JSON.stringify(cj)]);
        const flags: { quote: string; severity: string; issue: string; rewrite: string | null }[] = [];
        for (const fl of parsed.flags ?? []) {
          if (!fl.quote) continue;
          let rewrite = fl.rewrite ?? null;
          if (rewrite) { if (verifyLine(rewrite, allowed)) rewritesGrounded++; else { rewrite = null; rewritesDropped++; } }
          flags.push({ quote: fl.quote, severity: fl.severity ?? 'low', issue: fl.issue ?? '', rewrite });
        }
        if (flags.length) { coachFlags[id] = flags; flaggedLines += flags.length; }
        process.stdout.write('.');
      } catch { process.stdout.write('x'); }
    }
  }

  flushTasks('critique');
  if (isPrepare()) return;

  // Apply the grounded rewrites back into build-reasoning.json (reversible via
  // git; the report records every change). Exact string match within the flagged
  // hero/role subtree, so an unmatched/paraphrased quote simply no-ops.
  let applied = 0, unmatched = 0;
  for (const slug in report) {
    const sub = reasoning[slug];
    const roleFlags = report[slug];
    if (!sub || !roleFlags) continue;
    for (const role in roleFlags) {
      const subRole = sub[role];
      const fls = roleFlags[role];
      if (!subRole || !fls) continue;
      let cur = subRole;
      for (const fl of fls) {
        if (!fl.rewrite) continue;
        const before = JSON.stringify(cur);
        cur = deepReplace(cur, fl.quote, fl.rewrite) as Reason;
        if (JSON.stringify(cur) !== before) applied++; else unmatched++;
      }
      sub[role] = cur;
    }
  }
  if (applied) writeFileSync(path.join(ROOT, 'data/aggregates/build-reasoning.json'), JSON.stringify(BR, null, 1));

  // Apply hero-page coach-line rewrites back into hero-coach-lines.json. Exact
  // string match on the flagged cell's own line/watchout, so a paraphrased quote
  // no-ops instead of overwriting the wrong line.
  if (hcDoc && Object.keys(hcFlags).length) {
    for (const slug in hcFlags) {
      for (const role in hcFlags[slug]!) {
        const cell = hcDoc.heroes[slug]?.[role];
        if (!cell) continue;
        for (const fl of hcFlags[slug]![role]!) {
          if (fl.rewrite === undefined) continue;
          let hit = false;
          for (const k of ['line', 'watchout'] as const) {
            if (cell[k] === fl.quote) { cell[k] = fl.rewrite; hit = true; applied++; }
          }
          if (!hit) unmatched++;
        }
      }
    }
    writeFileSync(HC_PATH, JSON.stringify(hcDoc, null, 1));
  }

  // Apply coach rewrites back into each report they came from (lead + members).
  for (const rep of coachReports) {
    const fls = coachFlags[rep.id];
    if (!fls?.length) continue;
    let cr: unknown = (rep.doc as { coachReasoning?: unknown }).coachReasoning;
    for (const fl of fls) {
      if (!fl.rewrite) continue;
      const before = JSON.stringify(cr);
      cr = deepReplace(cr, fl.quote, fl.rewrite);
      if (JSON.stringify(cr) !== before) applied++; else unmatched++;
    }
    (rep.doc as { coachReasoning?: unknown }).coachReasoning = cr;
    writeFileSync(rep.file, JSON.stringify(rep.doc, null, 1));
  }

  const agreement = reviewedLines ? (1 - flaggedLines / reviewedLines) : 1;
  const agreementRate = Math.round(agreement * 1000) / 1000;
  writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope: [...SCOPE],
    source: 'independent (non-author) general-purpose agent reviewing data/aggregates/build-reasoning.json + hero-coach-lines.json + the coach report against their own source blocks; suggested rewrites ground-checked by copy-verify, then applied back',
    reviewedLines, flaggedLines,
    agreementRate,
    rewritesGrounded, rewritesDropped, applied, unmatched,
    heroes: report,
    heroCoach: hcFlags,
    coach: coachFlags,
  }, null, 1));

  // Append this judge round to the loop history so the convergence gate
  // (review:loop:gate) can see the trajectory across rounds. One ingest =
  // one round of the author->judge->apply loop.
  const histPath = HISTORY_PATH;
  const hist = existsSync(histPath)
    ? (JSON.parse(readFileSync(histPath, 'utf8')) as { rounds: unknown[] })
    : { rounds: [] };
  hist.rounds.push({
    round: hist.rounds.length + 1,
    at: new Date().toISOString(),
    scope: [...SCOPE],
    reviewedLines, flaggedLines, agreementRate, applied,
  });
  writeFileSync(histPath, JSON.stringify(hist, null, 1));

  console.log(`\n[${[...SCOPE].join('+')}] ${flaggedLines} lines flagged / ${reviewedLines} reviewed (agreement ${(agreement * 100).toFixed(1)}%); ${rewritesGrounded} grounded rewrites; applied ${applied} (${unmatched} unmatched) -> ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(`[loop] round ${hist.rounds.length} recorded -> ${path.relative(ROOT, histPath)} (run the matching \`*:loop:gate\` to check convergence)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
