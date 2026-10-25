// Who runs each Eternal, and what it actually does, counted and parsed from
// committed data only (zero-API). Two halves, both deterministic:
//
//   usage      — from predgg-augments.json (ranked match stream): how often the
//                Eternal is picked, in which roles, by which heroes, and how
//                often each minor and minor pair is taken under it.
//   mechanics  — from eternals.json text: what the major and each minor give
//                (gold, mana, healing, shields, …), with the blessing that gives
//                it, so a tag like "Gold income" always names its source.
//
// The Eternal popup and Learn Eternals render this directly; the authored
// "why it's picked" pass (ingest/eternal-review.ts) is grounded in it.

export interface Cell { n: number; w: number; name: string }
export interface EternalCell extends Cell { minor1?: Cell[]; minor2?: Cell[]; pairs?: { minor1: string; minor2: string; n: number; w: number }[] }
export interface RoleCell { games: number; wins: number; eternals?: EternalCell[] }
export interface Augs { source?: string; heroes: Record<string, Record<string, RoleCell>> }
export interface Minor { name: string; desc: string }
export interface Eternal { id: string; name: string; major: string; minorSlot1?: Minor[]; minorSlot2?: Minor[] }

export interface Usage {
  games: number; wins: number;
  /** Share of all ranked hero-games that ran this Eternal. */
  pickShare: number;
  roles: { role: string; n: number; w: number; pickRate: number }[];
  /** Hero-roles that run it most, by games; pickRate = share of that hero-role's games. */
  heroes: { slug: string; name: string; role: string; n: number; pickRate: number }[];
  minors: Record<string, { slot: 1 | 2; n: number; w: number; share: number }>;
  topPair: { minor1: string; minor2: string; n: number; share: number } | null;
  mechanics: { id: string; label: string; from: string[] }[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

// Ordered: the first matches lead the tag row. Each regex reads one blessing's
// text; it should match what the blessing GIVES, not what it reacts to.
// Within one sentence; a decimal point ("0.2%") does not end it.
const W = String.raw`(?:[^.]|\.(?=\d))*`;
const rx = (src: string) => new RegExp(src.replace(/~/g, W), 'i');
export const MECHANICS: { id: string; label: string; re: RegExp; not?: RegExp }[] = [
  { id: 'gold', label: 'Gold income', re: rx(String.raw`\bgold\b(?! earned)`) },
  { id: 'mana', label: 'Mana', re: rx(String.raw`\bmana\b`) },
  { id: 'heal', label: 'Healing & lifesteal', re: rx(String.raw`lifesteal|omnivamp|\bheal(s|ing|ed)?\b|\b(restore|regenerate)s? ~health|health regen`), not: rx(String.raw`reduc\w* ~(healing|health regen)|health regen reduced`) },
  { id: 'antiheal', label: 'Anti-heal', re: rx(String.raw`reduc\w* ~(healing|health regen)|health regen reduced`) },
  { id: 'shield', label: 'Shields', re: rx(String.raw`\bshield`) },
  { id: 'tank', label: 'Toughness', re: rx(String.raw`damage reduction|take ~less damage|damage they deal to you|incoming damage ~reduced|dealing \d+% decreased damage|(gain|grant)s? ~(armor|max(imum)? health)|increase~max(imum)? health|gain \d+ health|tenacity`) },
  { id: 'shred', label: 'Armor shred', re: rx(String.raw`reduc\w* ~armor|shred|penetration`) },
  { id: 'damage', label: 'Damage boost', re: rx(String.raw`(bonus|increased|more) (physical |magical |true )?damage|increas\w* (your )?damage|\d% damage\b(?! reduction)|damage dealt by item effects|damage enemies take|as a dot\b`) },
  { id: 'haste', label: 'Cooldowns', re: rx(String.raw`(gain|grant)s? ~ability haste|ultimate (ability )?haste|cooldown progression|(reduc|decreas)\w* ~cooldowns?|cooldowns ~faster|into [\d.]+ ability haste`) },
  { id: 'ult', label: 'Ultimate', re: rx(String.raw`\bultimate`) },
  { id: 'autos', label: 'Basic attacks', re: rx(String.raw`basic attacks?\b(?! you)|on-hit|(gain|grant)s? ~attack speed`) },
  { id: 'execute', label: 'Execute & %health damage', re: rx(String.raw`health as (bonus )?(physical |magical |true )?damage|targets? below \d+% (max )?health|enemy hero below \d+% health`) },
  { id: 'speed', label: 'Movement speed', re: rx(String.raw`(gain|grant)s? ~move(ment)? speed|\+[\d.]+% move speed|steal~movement speed|movement speed cannot`) },
  { id: 'slow', label: 'Slows enemies', re: rx(String.raw`\bslowed\b|lose \d+% movement speed`) },
  { id: 'scaling', label: 'Grows over the game', re: rx(String.raw`per minute|per level|permanent(ly)?\b|every \d+s, increase|every \d+ minutes|at levels?\b|levels \d+/\d+|additional level|per \d+ units killed|at \d+ minutes`) },
  { id: 'allies', label: 'Helps allies', re: rx(String.raw`\ball(y|ies)\b|healing or shielding a target`) },
  { id: 'vision', label: 'Vision', re: rx(String.raw`reveal`) },
  { id: 'farm', label: 'Farming & camps', re: rx(String.raw`river buff|minions?\b|camp leader|monsters? kill|minions and monsters|enemy unit|unit kill|units killed|killing \d+ units|\btowers?\b(?! damage)`) },
];

export function mechanicsOf(e: Eternal): Usage['mechanics'] {
  const blessings = [{ name: 'Major', desc: e.major }, ...(e.minorSlot1 ?? []), ...(e.minorSlot2 ?? [])];
  return MECHANICS.map((m) => ({ id: m.id, label: m.label, from: blessings.filter((b) => m.re.test(b.desc) && !m.not?.test(b.desc)).map((b) => b.name) }))
    .filter((m) => m.from.length);
}

export function eternalUsage(augs: Augs, eternals: Eternal[], heroName: (slug: string) => string, opts = { heroes: 8, minHeroGames: 50 }): Record<string, Usage> {
  let total = 0;
  const roleTotals = new Map<string, number>();
  for (const roles of Object.values(augs.heroes)) for (const [role, c] of Object.entries(roles)) {
    total += c.games; roleTotals.set(role, (roleTotals.get(role) ?? 0) + c.games);
  }
  const out: Record<string, Usage> = {};
  for (const e of eternals) {
    const key = e.name.toLowerCase();
    const u: Usage = { games: 0, wins: 0, pickShare: 0, roles: [], heroes: [], minors: {}, topPair: null, mechanics: mechanicsOf(e) };
    const roles = new Map<string, { n: number; w: number }>();
    const minors = new Map<string, { slot: 1 | 2; n: number; w: number }>();
    const pairs = new Map<string, { minor1: string; minor2: string; n: number }>();
    for (const [slug, heroRoles] of Object.entries(augs.heroes)) for (const [role, c] of Object.entries(heroRoles)) {
      const ec = (c.eternals ?? []).find((x) => x.name.toLowerCase() === key);
      if (!ec) continue;
      u.games += ec.n; u.wins += ec.w;
      const rr = roles.get(role) ?? { n: 0, w: 0 }; rr.n += ec.n; rr.w += ec.w; roles.set(role, rr);
      if (c.games >= opts.minHeroGames) u.heroes.push({ slug, name: heroName(slug), role, n: ec.n, pickRate: r3(ec.n / c.games) });
      for (const [slot, list] of [[1, ec.minor1], [2, ec.minor2]] as const) for (const m of list ?? []) {
        const mm = minors.get(m.name) ?? { slot, n: 0, w: 0 }; mm.n += m.n; mm.w += m.w; minors.set(m.name, mm);
      }
      for (const p of ec.pairs ?? []) {
        const k = `${p.minor1}|${p.minor2}`;
        const pp = pairs.get(k) ?? { minor1: p.minor1, minor2: p.minor2, n: 0 }; pp.n += p.n; pairs.set(k, pp);
      }
    }
    u.pickShare = total ? r3(u.games / total) : 0;
    u.roles = [...roles].map(([role, v]) => ({ role, n: v.n, w: v.w, pickRate: r3(v.n / (roleTotals.get(role) || 1)) })).sort((a, b) => b.n - a.n);
    u.heroes = u.heroes.sort((a, b) => b.n - a.n).slice(0, opts.heroes);
    // A slot's share is out of the games where that slot was recorded, so the
    // three options in a slot add up to 100%.
    const slotTotal = (s: 1 | 2) => [...minors.values()].filter((m) => m.slot === s).reduce((t, m) => t + m.n, 0) || 1;
    for (const [name, m] of minors) u.minors[name] = { ...m, share: r3(m.n / slotTotal(m.slot)) };
    const best = [...pairs.values()].sort((a, b) => b.n - a.n)[0];
    u.topPair = best && u.games ? { ...best, share: r3(best.n / u.games) } : null;
    out[e.id] = u;
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ROLE: Record<string, string> = { midlane: 'mid lane', offlane: 'off lane', carry: 'carry', jungle: 'jungle', support: 'support' };

/** The grounded facts block the "why it's picked" author and its judge both see. */
export function eternalFacts(e: Eternal & { archetype?: string }, u: Usage, sampleNote: string): string {
  const minorLine = (m: Minor) => {
    const s = u.minors[m.name] ?? u.minors[m.name.replace(/’/g, "'")];
    return `- ${m.name}: ${m.desc}${s ? ` [taken in ${pct(s.share)} of ${e.name} games]` : ' [no field sample]'}`;
  };
  const roles = u.roles.filter((r) => r.pickRate >= 0.01).map((r) => `${ROLE[r.role] ?? r.role} (${pct(r.pickRate)} of all ${ROLE[r.role] ?? r.role} games)`);
  const heroes = u.heroes.map((h) => `${h.name} ${ROLE[h.role] ?? h.role} (${pct(h.pickRate)} of their games)`);
  return `ETERNAL: ${e.name}${e.archetype ? ` (catalog archetype: ${e.archetype})` : ''}
MAJOR (always on): ${e.major}
MINOR SLOT 1 (pick one):
${(e.minorSlot1 ?? []).map(minorLine).join('\n')}
MINOR SLOT 2 (pick one):
${(e.minorSlot2 ?? []).map(minorLine).join('\n')}
WHAT IT GIVES (parsed from the text above; the blessing that gives it in brackets): ${u.mechanics.map((m) => `${m.label} [${m.from.join(', ')}]`).join('; ') || 'none parsed'}
WHO RUNS IT (${sampleNote}): ${u.games.toLocaleString('en-US')} games, ${pct(u.pickShare)} of all hero-games, ${pct(u.games ? u.wins / u.games : 0)} win rate.
Roles: ${roles.join('; ') || 'none'}
Heroes that run it most: ${heroes.join('; ') || 'none'}
Most common minor pair: ${u.topPair ? `${u.topPair.minor1} + ${u.topPair.minor2} (${pct(u.topPair.share)} of ${e.name} games)` : 'none'}`;
}
