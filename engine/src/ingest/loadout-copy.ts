// Coach copy for loadouts (zero-API; session compute per the copy policy): plain-language
// explanations of what each augment / Eternal / minor / crest does for a hero, and, per high
// performer in recent games, how the loadout worked together that game. Written by the
// pred-scout-coach agent from the kit and catalog text, number-checked by copy-verify (a line citing
// a number absent from its source is dropped), then reviewed by an independent critic.
//
//   npm run loadout:copy -- prepare-pieces      -> copy-tasks/loadout-pieces.tasks.json (one task per hero)
//   npm run loadout:copy -- ingest-pieces       -> data/aggregates/loadout-explain.json
//   npm run loadout:copy -- critique-prepare    -> copy-tasks/loadout-critique.tasks.json
//   npm run loadout:copy -- critique            -> applies grounded rewrites / drops flagged lines
//   npm run loadout:copy -- prepare-games [YYYY-MM-DD] -> copy-tasks/loadout-games.tasks.json (performers since that date)
//   npm run loadout:copy -- ingest-games        -> film.loadoutCoach[heroSlug] = { bullets, at }
// postgame:comp attaches explain[hero][kind|name] to every loadout piece (pieces[i].plain).
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PG = path.join(ROOT, 'data/postgame');
const TASKS = path.join(ROOT, 'engine/copy-tasks');
const OUT = path.join(ROOT, 'data/aggregates/loadout-explain.json');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s*•\s*/g, ' ').replace(/\s+/g, ' ').trim();
const cmd = process.argv[2] ?? '';
const films = () => readdirSync(PG).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(PG, f), 'utf8')));
const heroCat = new Map((read('data/catalog/heroes.json') as any[]).map((h) => [h.slug, h]));
const kitText = (slug: string) => (heroCat.get(slug)?.abilities ?? []).map((a: any) => `${a.key} ${a.display_name}${a.cooldown?.length ? ` (cooldown ${a.cooldown.join('/')}s)` : ''}: ${plain(a.menu_description ?? a.game_description).slice(0, 420)}`).join('\n');
const writeTasks = (pass: string, tasks: unknown[]) => { mkdirSync(TASKS, { recursive: true }); writeFileSync(path.join(TASKS, `${pass}.tasks.json`), JSON.stringify({ pass, generatedAt: new Date().toISOString(), count: tasks.length, tasks }, null, 1)); };
function responses(pass: string): Record<string, any> {
  const t = path.join(TASKS, `${pass}.tasks.json`), r = path.join(TASKS, `${pass}.responses.json`);
  if (!existsSync(r)) throw new Error(`no ${pass}.responses.json`);
  if (statSync(r).mtimeMs < statSync(t).mtimeMs) throw new Error(`${pass}.responses.json is older than its tasks`);
  return JSON.parse(readFileSync(r, 'utf8'));
}
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v.trim().replace(/^```json?\s*|```$/g, '')) : v);
const loadExplain = () => (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { heroes: {} as Record<string, Record<string, string>> });

const RULES = `Never add an effect the game text does not state (for example "homing" or "untargetable" when the text says neither). Write for a regular player, as their coach: plain words, no game-text copying, no jargon (say "ability cooldowns" not "AH", "the target's health" not "HP pool"). Explain what the piece DOES in a fight for this hero: which of the hero's abilities it works with, when it kicks in, and what it changes about how the hero plays. If it does nothing special with the kit (a generic stat or gold boost), say so plainly in one line. Use only numbers that appear in the data below; never invent one. No em dashes. One or two sentences, at most 40 words.`;

function piecesOf(): Map<string, Map<string, string>> {
  const by = new Map<string, Map<string, string>>();
  for (const f of films()) for (const t of Object.values(f.threatBuilds ?? {}) as any[]) for (const x of t.loadout ?? []) {
    const m = by.get(t.slug) ?? new Map(); m.set(`${x.kind}|${x.name}`, x.text); by.set(t.slug, m);
  }
  return by;
}

if (cmd === 'prepare-pieces') {
  const have = loadExplain().heroes;
  const tasks = [...piecesOf()].map(([slug, m]) => {
    const todo = [...m].filter(([k]) => !have[slug]?.[k]);
    if (!todo.length) return null;
    return { id: slug, keys: todo.map(([k]) => k), prompt: `Hero: ${heroCat.get(slug)?.display_name ?? slug}.\nKIT (current patch):\n${kitText(slug)}\n\nLOADOUT PIECES this hero ran in our reviewed games (kind|name: game text):\n${todo.map(([k, t]) => `${k}: ${t}`).join('\n')}\n\n${RULES}\nReturn strict JSON: { "<kind|name>": "<explanation>" } with one entry per piece above.` };
  }).filter(Boolean);
  writeTasks('loadout-pieces', tasks);
  console.log(`${tasks.length} hero task(s), ${tasks.reduce((a: number, t: any) => a + t.keys.length, 0)} piece(s) -> engine/copy-tasks/loadout-pieces.tasks.json`);
} else if (cmd === 'ingest-pieces' || cmd === 'critique') {
  const pass = cmd === 'critique' ? 'loadout-critique' : 'loadout-pieces';
  const res = responses(pass);
  const tasks = JSON.parse(readFileSync(path.join(TASKS, `${pass}.tasks.json`), 'utf8')).tasks as { id: string; prompt: string; keys: string[] }[];
  const ex = loadExplain();
  let ok = 0, dropped = 0, changed = 0;
  for (const t of tasks) {
    if (!(t.id in res)) continue;
    const allowed = buildAllowed([], [t.prompt]);
    const ans = parse(res[t.id]) as Record<string, any>;
    const h = (ex.heroes[t.id] ??= {});
    for (const k of t.keys) {
      const v = ans[k];
      if (cmd === 'critique') {
        if (!v || v.ok !== false) continue;
        const rw = typeof v.rewrite === 'string' ? v.rewrite.trim() : '';
        if (rw && verifyLine(rw, allowed) && !/—/.test(rw)) { h[k] = rw; changed++; } else { delete h[k]; dropped++; }
        continue;
      }
      const text = typeof v === 'string' ? v.trim() : '';
      if (!text || !verifyLine(text, allowed) || /—/.test(text) || text.split(/\s+/).length > 48) { dropped++; continue; }
      h[k] = text; ok++;
    }
  }
  ex.generatedAt = new Date().toISOString();
  ex.note = 'Coach explanations of loadout pieces per hero (pred-scout-coach, session compute; numbers checked against the kit and catalog text; reviewed by an independent critic). Keys: <kind>|<name>.';
  writeFileSync(OUT, JSON.stringify(ex, null, 1));
  console.log(cmd === 'critique' ? `critique: ${changed} rewritten, ${dropped} dropped` : `pieces: ${ok} saved, ${dropped} dropped (number check, length or em dash)`);
} else if (cmd === 'critique-prepare') {
  const ex = loadExplain();
  const all = piecesOf();
  const tasks = Object.entries(ex.heroes as Record<string, Record<string, string>>).map(([slug, h]) => {
    const keys = Object.keys(h);
    if (!keys.length) return null;
    return { id: slug, keys, prompt: `You are an INDEPENDENT critic of a coach's plain-language explanations for ${heroCat.get(slug)?.display_name ?? slug}'s loadout pieces. You did not write them. Check each against the KIT and the GAME TEXT only. Flag an explanation that gets the mechanic wrong, names an ability that does not interact with the piece, claims an effect the text does not support, uses a number not in the data, or is jargon a regular player would not follow.\nKIT:\n${kitText(slug)}\n\nGAME TEXT (kind|name: text):\n${keys.map((k) => `${k}: ${all.get(slug)?.get(k) ?? '(not in recent games)'}`).join('\n')}\n\nEXPLANATIONS UNDER REVIEW:\n${keys.map((k) => `${k}: ${h[k]}`).join('\n')}\n\nReturn strict JSON: { "<kind|name>": { "ok": true } or { "ok": false, "issue": "<one phrase>", "rewrite": "<corrected explanation, same rules: plain words, at most 40 words, only numbers from the data, or null to drop>" } } with one entry per key.` };
  }).filter(Boolean);
  writeTasks('loadout-critique', tasks);
  console.log(`${tasks.length} critique task(s) -> engine/copy-tasks/loadout-critique.tasks.json`);
} else if (cmd === 'prepare-games') {
  const since = process.argv[3] ?? '2026-11-03';
  const ex = loadExplain();
  const tasks: unknown[] = [];
  for (const f of films()) {
    if (String(f.startTime ?? '') < since) continue;
    for (const t of Object.values(f.threatBuilds ?? {}) as any[]) {
      const p = f.players.find((x: any) => x.heroSlug === t.slug);
      if (!p) continue;
      const st = t.card?.story?.lead;
      const src = [
        `${t.hero} (${p.us ? 'our team' : 'their team'}, ${p.role}) ${p.kills}/${p.deaths}/${p.assists} in ${f.durationMin} min, result for our team: ${f.result}.`,
        st ? `Lead story from the data: ${st.title}. ${st.text}` : 'No lead story (not above the hero-role norm).',
        `KIT:\n${kitText(t.slug)}`,
        `LOADOUT:\n${(t.loadout ?? []).map((x: any) => `${x.kind} ${x.name}: ${x.text}${ex.heroes[t.slug]?.[`${x.kind}|${x.name}`] ? ` [coach: ${ex.heroes[t.slug][`${x.kind}|${x.name}`]}]` : ''}${x.numbers?.length ? ` [this game: ${x.numbers.join('; ')}]` : ''}`).join('\n')}`,
        `ITEMS (damage build): ${(t.power?.items ?? []).map((i: any) => `${i.name}${i.effects?.length ? ` (${i.effects.join(' ')})` : ''}`).join('; ') || 'none'}`,
        `WHAT STACKED: ${(t.worked?.stacks ?? []).map((s: any) => `${s.title}: ${s.members.map((m: any) => m.name).join(', ')}`).join(' | ') || 'none'}`,
        `COOLDOWNS: ${(t.lines ?? []).filter((l: string) => /ability haste|cooldown|came back/i.test(l)).join(' ')}`,
      ].join('\n');
      tasks.push({ id: `${f.matchId}|${t.slug}`, prompt: `${src}\n\nAs this player's coach, explain in 2 or 3 bullets how this loadout and build worked TOGETHER in this game: the interactions between the augment, Eternal, minors, crest, items and the hero's abilities that made the performance, in plain words a regular player follows. Lead with the most important interaction. Each bullet at most 28 words. Only numbers from the data above. No em dashes. Do not repeat the lead story; explain the mechanics behind it.\nReturn strict JSON: { "bullets": ["...", "..."] }` });
    }
  }
  writeTasks('loadout-games', tasks);
  console.log(`${tasks.length} performer task(s) since ${since} -> engine/copy-tasks/loadout-games.tasks.json`);
} else if (cmd === 'ingest-games') {
  const res = responses('loadout-games');
  const tasks = JSON.parse(readFileSync(path.join(TASKS, 'loadout-games.tasks.json'), 'utf8')).tasks as { id: string; prompt: string }[];
  const byFilm = new Map<string, { slug: string; bullets: string[] }[]>();
  let ok = 0, dropped = 0;
  for (const t of tasks) {
    if (!(t.id in res)) continue;
    const allowed = buildAllowed([], [t.prompt]);
    const bullets = ((parse(res[t.id]) as any).bullets ?? []).map((b: string) => String(b).trim()).filter((b: string) => { const good = b && verifyLine(b, allowed) && !/—/.test(b) && b.split(/\s+/).length <= 34; if (!good) dropped++; else ok++; return good; });
    const [mid, slug] = t.id.split('|');
    if (bullets.length) (byFilm.get(mid!) ?? byFilm.set(mid!, []).get(mid!)!).push({ slug: slug!, bullets });
  }
  for (const [mid, list] of byFilm) {
    const p = path.join(PG, `${mid}.json`);
    const f = JSON.parse(readFileSync(p, 'utf8'));
    f.loadoutCoach ??= {};
    for (const x of list) f.loadoutCoach[x.slug] = { bullets: x.bullets, at: new Date().toISOString(), by: 'pred-scout-coach' };
    writeFileSync(p, JSON.stringify(f, null, 1));
  }
  console.log(`game reads: ${ok} bullets saved, ${dropped} dropped; ${byFilm.size} film(s) updated`);
} else {
  console.log('usage: npm run loadout:copy -- prepare-pieces | ingest-pieces | critique-prepare | critique | prepare-games [since] | ingest-games');
}
