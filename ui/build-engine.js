// Kit-aligned build engine — Phase 1 of the v4 plan.
//
// Deterministic, owned-data-only: recommends a build by matching ITEM STATS
// (data/game-data/items.json) to a hero's SCALING PROFILE derived from curated
// attributes + damageType + baseTraits (data/game-data/hero-profiles.json).
// No win rates, no scraping. Every pick comes with a transparent "why".
//
// Usage (browser):  BuildEngine.recommend(heroProfile, role)
// Usage (node):     const BuildEngine = require('./ui/build-engine.js')
//                   BuildEngine.recommend(heroProfile, role, itemsArray)

(function (root) {
  'use strict';

  // ── Per-stat weight from a hero's scaling profile ──────────────
  function statWeights(hero) {
    const a = hero.attributes || {};
    const ap = (a.attackPower || 0) / 10;   // wants physical power
    const mp = (a.abilityPower || 0) / 10;  // wants magical power
    const dur = (a.durability || 0) / 10;   // wants defenses
    const dmg = hero.damageType || 'hybrid';
    const phys = dmg === 'physical', mag = dmg === 'magical', hybrid = dmg === 'hybrid';
    const t = new Set(hero.baseTraits || []);
    const roles = (hero.roles || []).map(r => String(r).toLowerCase());
    const isCarry = roles.includes('carry');
    const isSupport = roles.includes('support');
    const aaFocused = t.has('as_steroid') || t.has('on_hit');
    const caster = mp >= ap;

    return {
      PHYSICAL_POWER:       ap,
      MAGICAL_POWER:        mp,
      PHYSICAL_PENETRATION: ap * (phys ? 1.3 : hybrid ? 0.9 : 0.4),
      MAGICAL_PENETRATION:  mp * (mag ? 1.3 : hybrid ? 0.9 : 0.4),
      ATTACK_SPEED:         ap * (aaFocused ? 1.4 : 0.5),
      CRITICAL_CHANCE:      ap * ((aaFocused || isCarry) ? 0.9 : 0.25),
      ABILITY_HASTE:        0.35 + mp * 0.5 + ((t.has('cc') || t.has('stacking') || t.has('mobility') || t.has('dot')) ? 0.25 : 0),
      LIFESTEAL:            ap * (t.has('lifesteal') ? 1.3 : 0.4),
      MAGICAL_LIFESTEAL:    mp * (t.has('lifesteal') ? 1.3 : 0.35),
      OMNIVAMP:             (t.has('lifesteal') || t.has('self_heal') ? 1.0 : 0.3) * Math.max(ap, mp),
      HEALTH:               dur,
      PHYSICAL_ARMOR:       dur * 0.9,
      MAGICAL_ARMOR:        dur * 0.9,
      TENACITY:             dur * 0.7 + (isSupport ? 0.2 : 0),
      // Enchanter output stat — only for heroes that heal/shield ALLIES, not self-sustainers.
      HEAL_AND_SHIELD_POWER:(t.has('ally_heal') || t.has('ally_shield')) ? 1.1 : (t.has('shield') ? 0.4 : 0),
      MANA:                 0.15 + mp * 0.25,
      MOVEMENT_SPEED:       0.3,
      BASE_HEALTH_REGENERATION: 0.12,
      BASE_MANA_REGENERATION:   caster ? 0.2 : 0.1,
      GOLD_PER_SECOND:      isSupport ? 0.6 : 0.03,
    };
  }

  // Plain-language reason buckets for the "why".
  function statReason(stat, hero) {
    const t = new Set(hero.baseTraits || []);
    const sustainKit = t.has('lifesteal') || t.has('self_heal');
    const map = {
      PHYSICAL_POWER: 'Physical Power — scales your damage',
      MAGICAL_POWER: 'Magical Power — scales your abilities',
      PHYSICAL_PENETRATION: 'Physical Pen — cuts through armor',
      MAGICAL_PENETRATION: 'Magical Pen — cuts through magic resist',
      ATTACK_SPEED: 'Attack Speed — fuels your on-hit/auto damage',
      CRITICAL_CHANCE: 'Crit — spikes your auto-attack damage',
      ABILITY_HASTE: 'Ability Haste — more ability uptime',
      LIFESTEAL: sustainKit ? 'Lifesteal — feeds your sustain kit' : 'Lifesteal — sustain in fights',
      MAGICAL_LIFESTEAL: 'Magical Lifesteal — sustain off your spells',
      OMNIVAMP: sustainKit ? 'Omnivamp — feeds your sustain kit' : 'Omnivamp — all-around sustain',
      HEALTH: 'Health — survivability',
      PHYSICAL_ARMOR: 'Armor — tank physical damage',
      MAGICAL_ARMOR: 'Magic Resist — tank magical damage',
      TENACITY: 'Tenacity — shrug off CC',
      HEAL_AND_SHIELD_POWER: 'Heal & Shield Power — amps your support output',
      MANA: 'Mana — sustains your casting',
      MOVEMENT_SPEED: 'Move Speed — kiting/roaming',
    };
    return map[stat] || null;
  }

  function isCoreCandidate(item) {
    const d = item.data || {};
    return (d.slotType === 'PASSIVE' || d.slotType === 'ACTIVE') && d.rarity === 'EPIC';
  }
  function isCrest(item) { return (item.data || {}).slotType === 'CREST'; }

  function scoreItem(item, w, hero) {
    const d = item.data || {};
    const stats = d.stats || [];
    let score = 0;
    const matched = [];
    for (const s of stats) {
      const weight = w[s.stat] || 0;
      if (weight <= 0) continue;
      score += weight;
      matched.push({ stat: s.stat, weight });
    }
    if (!stats.length) return null;
    // Light effect-text alignment bonus (transparent, capped).
    const fx = (d.effects || []).map(e => (typeof e === 'string' ? e : (e && e.text) || '')).join(' ').toLowerCase();
    if (fx) {
      const t = new Set(hero.baseTraits || []);
      const cues = [];
      if (t.has('lifesteal') || t.has('self_heal')) cues.push('lifesteal', 'omnivamp', 'heal');
      if (t.has('on_hit') || t.has('as_steroid')) cues.push('attack speed', 'basic attack', 'on-hit');
      if ((hero.abilityPower || (hero.attributes || {}).abilityPower || 0) >= 6) cues.push('ability', 'magical');
      if (cues.some(c => fx.includes(c))) score += 0.4;
    }
    // Reward focus (fewer wasted stats) slightly.
    score *= (matched.length / stats.length) >= 0.5 ? 1.05 : 0.95;
    matched.sort((x, y) => y.weight - x.weight);
    return { item, score, matched };
  }

  function whyFor(scored, hero) {
    const reasons = scored.matched
      .map(m => statReason(m.stat, hero))
      .filter(Boolean);
    // de-dup while preserving order, keep top 2
    const seen = new Set(), out = [];
    for (const r of reasons) { if (!seen.has(r)) { seen.add(r); out.push(r); } if (out.length === 2) break; }
    return out;
  }

  // Main entry. `items` optional in browser (BuildEngine.items set by init).
  function recommend(hero, role, items) {
    items = items || api.items || [];
    const w = statWeights(hero);

    const core = items.filter(isCoreCandidate)
      .map(i => scoreItem(i, w, hero)).filter(Boolean)
      .sort((a, b) => b.score - a.score);

    // Ensure a defensive item shows for durable heroes (dur >= 6).
    const dur = (hero.attributes || {}).durability || 0;
    let picks = core.slice(0, 5);
    if (dur >= 6 && !picks.some(p => p.matched.some(m => /ARMOR|HEALTH|TENACITY/.test(m.stat)))) {
      const def = core.find(p => p.matched.some(m => /ARMOR|HEALTH|TENACITY/.test(m.stat)));
      if (def) picks = picks.slice(0, 4).concat(def);
    }

    const crestScored = items.filter(isCrest)
      .map(i => scoreItem(i, w, hero)).filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const crest = crestScored[0] || null;

    return {
      hero: hero.name,
      role: role || (hero.roles && hero.roles[0]) || null,
      profile: {
        attackPower: (hero.attributes || {}).attackPower,
        abilityPower: (hero.attributes || {}).abilityPower,
        durability: (hero.attributes || {}).durability,
        damageType: hero.damageType,
        traits: hero.baseTraits || [],
      },
      crest: crest && { name: crest.item.data.displayName, why: whyFor(crest, hero) },
      items: picks.map(p => ({
        name: p.item.data.displayName,
        slug: p.item.slug,
        score: Math.round(p.score * 100) / 100,
        why: whyFor(p, hero),
        stats: (p.item.data.stats || []).map(s => `${s.stat.replace(/_/g, ' ').toLowerCase()} ${s.value}`),
      })),
    };
  }

  const api = { statWeights, scoreItem, recommend, items: null };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BuildEngine = api;
})(typeof self !== 'undefined' ? self : this);
