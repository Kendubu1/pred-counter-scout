// Kit Engine — derives hero identity from ability data alone. No win rates.
//
// Inputs: hero-profiles.json (curated attributes/traits/classes) and
// hero-abilities.json (per-rank damage, scaling %, cooldowns, CC payloads).
// Outputs, per hero, normalized across the whole roster:
//   - components: earlyPressure, lateCarry, burst, sustained, poke, cc,
//     mobility, sustain, utility (0–1)
//   - playstyle tags: burst / sustained_dps / poke / cc_heavy / dive /
//     dueling / sustain / enchant / scaling / crit
//   - phases: early / mid / late power (20–95) with reasons
//   - kitPower: overall kit strength index (0–100), calibrated against
//     observed win rates by scripts/validate-kit-model.js
//
// Works in browser (script tag, exposes KitEngine) and Node (require).

(function (root) {
  'use strict';

  // Weights calibrated against matches-weighted observed WR
  // (scripts/validate-kit-model.js) — re-run after data updates.
  const KIT_POWER_WEIGHTS = {
    damage: 0.26,        // max(burst, sustained)
    cc: 0.18,
    mobility: 0.12,
    sustain: 0.12,
    durability: 0.12,
    utility: 0.08,
    earlyPressure: 0.06,
    lateCarry: 0.06,
  };

  const HARD_CC = { stun: 2, suppress: 2.2, knockup: 1.8, knockback: 1.4, pull: 1.8, root: 1.6, fear: 1.8, charm: 1.8, taunt: 1.6 };
  const SOFT_CC = { slow: 0.6, silence: 1.2, blind: 1, cripple: 0.8, shrink: 1 };
  const LATE_POWER = 1.5; // assumed ~150 bonus power at full build, per 100% scaling

  // Kit-only matchup forecast, ridge-calibrated on 1,131 head-to-head pairs
  // (20+ games each) from data/2026-02-08 with leave-heroes-out CV.
  // Validation: holdout r = 0.15, direction accuracy 54.3% on decided
  // matchups — a WEAK prior, only for pairs with no observed WR data.
  // Notable: mid-game power and mobility-into-CC win matchups; durability,
  // sustain, and burst stat-checks lose them in solo-queue data.
  // Recalibrate with scripts/validate-kit-model.js after data refreshes.
  const MATCHUP_MODEL = {
    coefs: {
      earlyDiff: 0.036, midDiff: 1.400, lateDiff: -0.788,
      ccDiff: -1.282, mobDiff: -1.955, sustainDiff: -2.472,
      burstDiff: -2.026, sustainedDiff: -0.036, durDiff: -2.698,
      rangedVsMelee: -0.255, mobVsCC: 2.409,
    },
    validation: { holdoutR: 0.146, directionAccuracy: 0.543, pairs: 1131, data: '2026-02-08' },
  };

  const PLAYSTYLE_LABELS = {
    burst: 'Burst — dumps damage in short combos',
    sustained_dps: 'Sustained DPS — wins long fights with autos/on-hit',
    poke: 'Poke — chips from range before committing',
    cc_heavy: 'CC-heavy — controls fights with lockdown',
    dive: 'Diver — uses mobility to reach priority targets',
    dueling: 'Duelist — wins extended 1v1 trades',
    sustain: 'Self-sustain — heals through trades',
    enchant: 'Enchanter — keeps allies alive',
    scaling: 'Scaler — gets stronger as the game goes',
    crit: 'Crit carry — late-game auto-attack damage',
  };

  let profiles = null;   // slug → curated profile
  let kits = null;       // slug → computed kit profile
  let ready = false;
  let loading = null;

  function bestDamageEntry(ability) {
    let best = null;
    for (const d of (ability.damage || [])) {
      const v = d.values || [];
      if (!v.length) continue;
      if (!best || v[0] > best.values[0]) best = d;
    }
    return best;
  }

  function ccWeight(ability) {
    let w = 0;
    for (const c of (ability.cc || [])) {
      const t = String(c.type || '').toLowerCase();
      w += HARD_CC[t] || SOFT_CC[t] || 0;
    }
    // Fallback for CC only present in text (e.g. stuns missing from arrays)
    const desc = (ability.description || '').toLowerCase();
    if (!w) {
      if (/\bstun/.test(desc)) w += HARD_CC.stun;
      else if (/\broot/.test(desc)) w += HARD_CC.root;
      else if (/\bsuppress/.test(desc)) w += HARD_CC.suppress;
    }
    return Math.min(w, 3); // cap per ability so multi-CC kits don't run away
  }

  function computeRaw(slug, heroAbilities, profile) {
    const a = profile?.attributes || {};
    const t = new Set(profile?.baseTraits || []);
    const ranged = profile?.attackType === 'ranged';

    let basic = null;
    const econ = [];
    let healFx = 0, shieldFx = 0, utilityTypes = 0;
    for (const ab of (heroAbilities?.abilities || [])) {
      for (const fx of (ab.effects || [])) {
        if (fx.type === 'heal') healFx++;
        if (fx.type === 'shield') shieldFx++;
      }
      if (['BUFF', 'SHIELD', 'HEALING', 'DURABILITY'].includes(ab.type)) utilityTypes++;
      const d = bestDamageEntry(ab);
      const cds = ab.cooldowns || [];
      const entry = {
        key: ab.key, type: ab.type,
        dmg1: d ? d.values[0] : 0,
        dmgL: d ? d.values[d.values.length - 1] : 0,
        scaling: d ? (d.scaling || 0) : 0,
        cd1: cds[0] || 0, cdL: cds.length ? cds[cds.length - 1] : 0,
        cc: ccWeight(ab),
        isUlt: ab.key === 'ULTIMATE',
        isMobility: ab.type === 'MOBILITY',
      };
      if (ab.key === 'BASIC') { basic = entry; continue; }
      econ.push(entry);
    }

    const r = { earlyPressure: 0, lateCarry: 0, burst: 0, sustained: 0, poke: 0, cc: 0, mobility: 0, sustain: 0, utility: 0, growth: 0, scalingSum: 0 };

    for (const e of econ) {
      const cd1 = Math.max(e.cd1 || 10, 4);
      const cdL = Math.max(e.cdL || e.cd1 || 10, 4);
      const lateHit = e.dmgL + e.scaling * LATE_POWER;
      if (!e.isUlt) r.earlyPressure += e.dmg1 / cd1;
      r.lateCarry += lateHit / cdL;
      if ((e.cd1 || 10) <= 14) r.burst += lateHit * (e.isUlt ? 0.5 : 1);
      else if (e.isUlt) r.burst += lateHit * 0.35;
      if (ranged && !e.isUlt && (e.cd1 || 10) <= 9 && e.dmg1 > 0) r.poke += e.dmg1 / cd1;
      r.cc += e.cc;
      if (e.isMobility) r.mobility += 1;
      r.growth += (e.dmgL - e.dmg1);
      r.scalingSum += e.scaling * (e.key === 'BASIC' ? 0.5 : 1);
    }
    if (basic) {
      r.earlyPressure += basic.dmg1 * 0.012;       // per-hit ≈ scaled to ability uptime terms
      const aaLate = (basic.dmgL + basic.scaling * LATE_POWER) * 0.012;
      r.lateCarry += aaLate;
      r.sustained = (basic.dmgL + basic.scaling * LATE_POWER) *
        (1 + (t.has('as_steroid') ? 0.6 : 0) + (t.has('on_hit') ? 0.5 : 0)) * (ranged ? 1.1 : 1);
      r.scalingSum += basic.scaling * 0.5;
    }
    r.mobility += (a.mobility || 0) * 0.18;
    r.sustain = healFx * 0.8 + (t.has('self_heal') ? 1 : 0) + (t.has('lifesteal') ? 1 : 0) + (t.has('healing') ? 0.6 : 0);
    r.utility = (t.has('ally_heal') ? 1.2 : 0) + (t.has('ally_shield') ? 1.2 : 0) + shieldFx * 0.5 + utilityTypes * 0.35;
    return r;
  }

  function buildKits(profilesArr, abilitiesMap) {
    const raw = {};
    const profMap = {};
    for (const p of profilesArr) profMap[p.slug] = p;
    for (const [slug, h] of Object.entries(abilitiesMap)) {
      if (!profMap[slug]) continue;
      raw[slug] = computeRaw(slug, h, profMap[slug]);
    }

    // Roster-wide min-max normalizers
    const keys = ['earlyPressure', 'lateCarry', 'burst', 'sustained', 'poke', 'cc', 'mobility', 'sustain', 'utility', 'growth', 'scalingSum'];
    const norms = {};
    for (const k of keys) {
      const vals = Object.values(raw).map(r => r[k]);
      const min = Math.min(...vals), max = Math.max(...vals);
      norms[k] = v => max > min ? (v - min) / (max - min) : 0.5;
    }

    const out = {};
    for (const [slug, r] of Object.entries(raw)) {
      const p = profMap[slug];
      const a = p.attributes || {};
      const t = new Set(p.baseTraits || []);
      const classes = (p.classes || []).map(c => String(c).toUpperCase());
      const nz = {};
      for (const k of keys) nz[k] = norms[k](r[k]);

      // ── Phases ──
      const reasons = { early: [], mid: [], late: [] };
      let early = nz.earlyPressure * 45 + (a.durability || 0) * 2.5 + nz.cc * 8;
      if (p.attackType === 'melee' && (a.durability || 0) >= 6) early += 5;
      if (t.has('self_heal') || t.has('healing')) early += 3;
      if (nz.earlyPressure >= 0.6) reasons.early.push('high damage-per-cooldown at rank 1 — hits hard before items exist');
      if ((a.durability || 0) >= 7) reasons.early.push('durable base stats — wins extended early trades');
      if (nz.cc >= 0.6) reasons.early.push('heavy CC — kill pressure with any jungle attention');

      let mid = nz.growth * 35 + nz.mobility * 12 + Math.max(a.attackPower || 0, a.abilityPower || 0) * 1.4;
      if (t.has('execute')) mid += 5;
      if (t.has('global')) mid += 4;
      if (nz.growth >= 0.6) reasons.mid.push('big per-rank damage growth — spikes hard as abilities max');
      if (nz.mobility >= 0.6) reasons.mid.push('high mobility — dominates mid-game skirmishes and rotations');
      if (t.has('global')) reasons.mid.push('global presence — punishes map-wide in mid game');

      let late = nz.lateCarry * 30 + nz.scalingSum * 22;
      if (t.has('stacking')) late += 10;
      if (t.has('as_steroid')) late += 7;
      if (t.has('on_hit')) late += 5;
      if (t.has('execute')) late += 4;
      if (classes.includes('SHARPSHOOTER') || classes.includes('EXECUTIONER')) late += 7;
      if (nz.scalingSum >= 0.6) reasons.late.push('high scaling ratios — items multiply their damage');
      if (t.has('stacking')) reasons.late.push('stacking passive — gets stronger the longer the game goes');
      if (t.has('as_steroid') || t.has('on_hit')) reasons.late.push('attack-speed/on-hit kit — full build turns them into a DPS machine');

      // ── Playstyle tags (scored, top 3) ──
      const cand = [];
      if (nz.burst >= 0.55 && nz.burst >= nz.sustained) cand.push(['burst', nz.burst]);
      if (nz.sustained >= 0.55) cand.push(['sustained_dps', nz.sustained]);
      if (nz.poke >= 0.5 && p.attackType === 'ranged') cand.push(['poke', nz.poke]);
      if (nz.cc >= 0.55) cand.push(['cc_heavy', nz.cc]);
      if (nz.mobility >= 0.55 && (nz.burst >= 0.45 || nz.sustained >= 0.45)) cand.push(['dive', (nz.mobility + Math.max(nz.burst, nz.sustained)) / 2]);
      if (p.attackType === 'melee' && nz.sustain >= 0.4 && nz.earlyPressure >= 0.5) cand.push(['dueling', (nz.sustain + nz.earlyPressure) / 2]);
      if (nz.sustain >= 0.55) cand.push(['sustain', nz.sustain]);
      if (t.has('ally_heal') || t.has('ally_shield')) cand.push(['enchant', 0.7]);
      if (classes.includes('SHARPSHOOTER') && p.attackType === 'ranged' && (a.attackPower || 0) >= 7) cand.push(['crit', 0.65]);
      cand.sort((x, y) => y[1] - x[1]);
      const playstyle = cand.slice(0, 3).map(c => c[0]);
      if (!playstyle.length) {
        const fallback = [['burst', nz.burst], ['sustained_dps', nz.sustained], ['cc_heavy', nz.cc], ['sustain', nz.sustain]].sort((x, y) => y[1] - x[1])[0];
        playstyle.push(fallback[0]);
      }

      // ── Kit power index ──
      const W = KIT_POWER_WEIGHTS;
      const powerParts = {
        damage: Math.max(nz.burst, nz.sustained) * W.damage,
        cc: nz.cc * W.cc,
        mobility: nz.mobility * W.mobility,
        sustain: nz.sustain * W.sustain,
        durability: ((a.durability || 0) / 10) * W.durability,
        utility: nz.utility * W.utility,
        earlyPressure: nz.earlyPressure * W.earlyPressure,
        lateCarry: nz.lateCarry * W.lateCarry,
      };
      const kitPowerRaw = Object.values(powerParts).reduce((s, v) => s + v, 0);

      out[slug] = {
        slug, name: p.name,
        components: nz,
        playstyle,
        phases: { early, mid, late },
        phaseReasons: reasons,
        powerParts,
        kitPowerRaw,
      };
    }

    // Normalize phases (20–95) and kit power (0–100) across roster
    for (const ph of ['early', 'mid', 'late']) {
      const vals = Object.values(out).map(k => k.phases[ph]);
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const k of Object.values(out)) {
        k.phases[ph] = max > min ? Math.round(20 + ((k.phases[ph] - min) / (max - min)) * 75) : 55;
      }
    }
    {
      const vals = Object.values(out).map(k => k.kitPowerRaw);
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const k of Object.values(out)) {
        k.kitPower = max > min ? Math.round(((k.kitPowerRaw - min) / (max - min)) * 100) : 50;
      }
    }
    // 'scaling' tag needs normalized late phase
    for (const k of Object.values(out)) {
      if (k.phases.late >= 65 && !k.playstyle.includes('scaling') && k.playstyle.length < 3) k.playstyle.push('scaling');
    }
    return out;
  }

  // ── Skill order spike (uses per-role scraped data, passed in) ──
  // Returns what the hero maxes first and when it's done, e.g. for
  // "they max Riplash first — respect levels 5–9".
  function skillSpike(roleData) {
    const first = roleData?.skillPriority?.[0];
    if (!first) return null;
    const order = (roleData.skillOrder || []).find(s => s.name === first);
    const levels = order?.levels || [];
    const maxedAt = levels.length ? levels[levels.length - 1] : null;
    return {
      ability: first,
      maxedAt,
      note: maxedAt
        ? `Maxes ${first} first (done by level ${maxedAt}) — their damage spikes hardest around levels ${Math.max(1, maxedAt - 4)}–${maxedAt}`
        : `Maxes ${first} first`,
    };
  }

  // ── Kit-only matchup forecast ──
  // For hero pairs with no observed head-to-head data. Returns a predicted
  // WR for `a` vs `b` plus the strongest drivers, honestly labeled
  // low-confidence (see MATCHUP_MODEL.validation).
  function matchupFeatures(a, b) {
    const Ka = kits[a], Kb = kits[b], Pa = profiles[a], Pb = profiles[b];
    if (!Ka || !Kb || !Pa || !Pb) return null;
    return {
      earlyDiff: (Ka.phases.early - Kb.phases.early) / 75,
      midDiff: (Ka.phases.mid - Kb.phases.mid) / 75,
      lateDiff: (Ka.phases.late - Kb.phases.late) / 75,
      ccDiff: Ka.components.cc - Kb.components.cc,
      mobDiff: Ka.components.mobility - Kb.components.mobility,
      sustainDiff: Ka.components.sustain - Kb.components.sustain,
      burstDiff: Ka.components.burst - Kb.components.burst,
      sustainedDiff: Ka.components.sustained - Kb.components.sustained,
      durDiff: ((Pa.attributes?.durability || 0) - (Pb.attributes?.durability || 0)) / 10,
      rangedVsMelee: (Pa.attackType === 'ranged' ? 1 : 0) - (Pb.attackType === 'ranged' ? 1 : 0),
      mobVsCC: Ka.components.mobility * Kb.components.cc - Kb.components.mobility * Ka.components.cc,
    };
  }

  const DRIVER_LABELS = {
    midDiff: 'mid-game power edge', earlyDiff: 'early-game edge', lateDiff: 'scaling edge',
    ccDiff: 'CC advantage', mobDiff: 'mobility gap', sustainDiff: 'sustain gap',
    burstDiff: 'burst gap', sustainedDiff: 'sustained-DPS gap', durDiff: 'durability gap',
    rangedVsMelee: 'range advantage', mobVsCC: 'mobility into their CC',
  };

  function predictMatchup(a, b) {
    const f = matchupFeatures(a, b);
    if (!f) return null;
    let delta = 0;
    const contribs = [];
    for (const [k, c] of Object.entries(MATCHUP_MODEL.coefs)) {
      const v = (f[k] || 0) * c;
      delta += v;
      contribs.push({ feature: k, label: DRIVER_LABELS[k] || k, value: v });
    }
    delta = Math.max(-8, Math.min(8, delta)); // keep the weak model humble
    contribs.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    return {
      predictedWR: Math.round((50 + delta) * 10) / 10,
      confidence: 'low',
      drivers: contribs.slice(0, 3).filter(c => Math.abs(c.value) >= 0.5)
        .map(c => ({ label: c.label, helps: c.value > 0 })),
      validation: MATCHUP_MODEL.validation,
    };
  }

  // ── Public API ──

  function init(profilesArr, abilitiesMap) {
    if (!profilesArr || !abilitiesMap) return false;
    profiles = {};
    for (const p of profilesArr) profiles[p.slug] = p;
    kits = buildKits(profilesArr, abilitiesMap);
    ready = true;
    return true;
  }

  // Browser convenience — idempotent, safe to call from multiple views.
  async function loadFrom(dataBase) {
    if (ready) return true;
    if (loading) return loading;
    loading = (async () => {
      try {
        const cb = '?v=' + Date.now();
        const [pRes, aRes] = await Promise.all([
          fetch(`${dataBase}/game-data/hero-profiles.json${cb}`),
          fetch(`${dataBase}/game-data/hero-abilities.json${cb}`),
        ]);
        return init(await pRes.json(), await aRes.json());
      } catch (e) {
        return false;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function isReady() { return ready; }
  function getProfile(slug) { return kits?.[slug] || null; }
  function getAllProfiles() { return kits; }
  function playstyleLabel(tag) { return PLAYSTYLE_LABELS[tag] || tag; }

  const api = { init, loadFrom, isReady, getProfile, getAllProfiles, playstyleLabel, skillSpike, predictMatchup, matchupFeatures, KIT_POWER_WEIGHTS, PLAYSTYLE_LABELS, MATCHUP_MODEL };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KitEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
