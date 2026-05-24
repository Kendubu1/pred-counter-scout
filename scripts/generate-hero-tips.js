#!/usr/bin/env node
// Generate / refresh per-hero "tips" data: deterministic trait sourcing.
//
//   node scripts/generate-hero-tips.js
//
// For every hero in hero-profiles.json, map each baseTrait to the ability /
// passive it actually comes from, by scanning that hero's entries in
// hero-abilities.json (descriptions + structured cc fields). The result is
// written to data/game-data/hero-tips.json as:
//
//   { generated, heroes: { <slug>: { traitSources: { <trait>: [{ability,key}] },
//                                     notes: [ ... ] } } }
//
// traitSources is fully derived here (re-run any time). The `notes` array
// (hero-specific tactical reminders) is curated separately and PRESERVED
// across re-runs — this script never overwrites it.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROFILES = path.join(ROOT, 'data', 'game-data', 'hero-profiles.json');
const ABILITIES = path.join(ROOT, 'data', 'game-data', 'hero-abilities.json');
const OUT = path.join(ROOT, 'data', 'game-data', 'hero-tips.json');

// Keywords that signal a trait inside an ability description.
const TRAIT_KEYWORDS = {
  cc: ['stun', 'root', 'slow', 'snare', 'knock', 'silence', 'immobiliz', 'taunt', 'fear', 'bind', 'suppress', 'pull', 'displace', 'sleep', 'polymorph', 'disarm', 'blind', 'tether', 'grip', 'entangle'],
  mobility: ['dash', 'blink', 'leap', 'teleport', 'lunge', 'charge', 'jump', 'vault', 'sprint', 'untargetable', 'reposition', 'movement speed', 'move speed'],
  aoe: ['nearby', 'all enemies', 'area', 'around', 'radius', 'cone', 'enemies in', 'splash', 'adjacent', 'surrounding', 'all nearby', 'each enemy'],
  healing: ['heal', 'restore', 'regenerat'],
  self_heal: ['heal', 'restore', 'lifesteal', 'omnivamp'],
  ally_heal: ['heal', 'restore'],
  lifesteal: ['lifesteal', 'life steal', 'omnivamp', 'vamp', 'siphon'],
  shield: ['shield'],
  self_shield: ['shield'],
  ally_shield: ['shield'],
  dot: ['per second', 'over ', 'burn', 'poison', 'bleed', 'damage over time', 'ticks', 'each second'],
  as_steroid: ['attack speed'],
  on_hit: ['on-hit', 'on hit', 'next basic attack', 'basic attacks deal', 'empowers', 'amplifies', 'basic attack to deal', 'empowered basic'],
  stacking: ['stack'],
  execute: ['execute', 'missing health', 'low health', 'current health', '% health', 'lower health', 'below'],
  stealth: ['invisible', 'stealth', 'camouflage', 'unseen', 'cloak'],
  global: ['global', 'anywhere on the map', 'across the map', 'any location', 'target location anywhere'],
  summons: ['summon', 'spawn', 'turret', 'pet', 'minion', 'construct', 'deploy', 'totem', 'trap'],
  anti_heal: ['reduce healing', 'reduced healing', 'anti-heal', 'grievous', 'healing reduction', 'less healing'],
  cd_reset: ['reset', 'reduce cooldown', 'refund', 'cooldown is reduced', 'lowers cooldown', 'reduce his ability'],
  pen: ['penetration', 'armor reduction', 'reduce armor', 'shred', 'ignores armor', 'reduces armor'],
  crit: ['critical'],
};

const ALLY_HINTS = ['allied', 'allies', 'ally', 'teammate', 'nearby heroes'];
const SELF_HINTS = ['himself', 'herself', 'yourself', 'self', 'his next', 'her next', 'heals crunch'];

function abilityText(ab) {
  const cc = Array.isArray(ab.cc) ? ab.cc.join(' ') : '';
  const eff = Array.isArray(ab.effects) ? ab.effects.join(' ') : '';
  return `${ab.name} ${ab.description || ''} ${cc} ${eff} ${ab.type || ''}`.toLowerCase();
}

function matchTrait(trait, ab, heroName) {
  const text = abilityText(ab);
  const kws = TRAIT_KEYWORDS[trait];
  if (!kws) return false;
  const hit = kws.some(k => text.includes(k));
  if (!hit) return false;

  // Disambiguate self vs ally heal/shield by who the effect targets.
  const hintsSelf = SELF_HINTS.some(h => text.includes(h)) || text.includes(heroName.toLowerCase());
  const hintsAlly = ALLY_HINTS.some(h => text.includes(h));
  if (trait === 'ally_heal' || trait === 'ally_shield') return hintsAlly;
  if (trait === 'self_heal' || trait === 'self_shield') return hintsSelf || !hintsAlly;
  return true;
}

function main() {
  const profiles = JSON.parse(fs.readFileSync(PROFILES, 'utf8'));
  const abilities = JSON.parse(fs.readFileSync(ABILITIES, 'utf8'));

  // Preserve existing curated notes.
  let prev = { heroes: {} };
  if (fs.existsSync(OUT)) { try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {} }

  const heroes = {};
  let sourced = 0, unsourced = 0;
  const gaps = [];

  for (const p of profiles) {
    const slug = p.slug;
    const kit = abilities[slug];
    const traitSources = {};
    const traits = p.baseTraits || [];

    if (kit && Array.isArray(kit.abilities)) {
      for (const trait of traits) {
        const matches = [];
        for (const ab of kit.abilities) {
          if (matchTrait(trait, ab, p.name)) matches.push({ ability: ab.name, key: ab.key });
        }
        // Prefer non-basic abilities as the "source".
        matches.sort((a, b) => (a.key === 'BASIC' ? 1 : 0) - (b.key === 'BASIC' ? 1 : 0));
        if (matches.length) { traitSources[trait] = matches.slice(0, 2); sourced++; }
        else { unsourced++; gaps.push(`${slug}:${trait}`); }
      }
    }

    heroes[slug] = {
      traitSources,
      notes: prev.heroes?.[slug]?.notes || [],
    };
  }

  const out = { generated: new Date().toISOString(), heroes };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  const line = '─'.repeat(52);
  console.log(`\n${line}\n  Hero tips — trait sources generated\n${line}`);
  console.log(`  Heroes        : ${Object.keys(heroes).length}`);
  console.log(`  Traits sourced: ${sourced}`);
  console.log(`  Unsourced     : ${unsourced}${unsourced ? '  (' + gaps.slice(0, 12).join(', ') + (gaps.length > 12 ? ', …' : '') + ')' : ''}`);
  console.log(`  Notes carried : ${Object.values(heroes).filter(h => h.notes.length).length} heroes`);
  console.log(`\n  Wrote: ${path.relative(ROOT, OUT)}\n`);
}

main();
