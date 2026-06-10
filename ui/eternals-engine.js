// Eternals recommendation engine.
// Eternals are new in patch 1.14 and have no win-rate data yet, so picks are
// scored by how each Eternal's effects synergize with a hero's stat profile,
// traits, damage type, and role. Pure heuristic — no scraped stats involved.
const EternalsEngine = (() => {
  let catalog = null;      // raw eternals.json
  let eternals = [];       // catalog.eternals
  let ready = false;

  const ATTR_LABELS = {
    attackPower: 'basic-attack power',
    abilityPower: 'ability power',
    durability: 'durability',
    mobility: 'mobility',
  };

  async function init(dataBase) {
    if (ready) return true;
    try {
      const res = await fetch(`${dataBase}/game-data/eternals.json?v=${new Date().toISOString().slice(0, 10)}`);
      if (!res.ok) return false;
      catalog = await res.json();
      eternals = catalog.eternals || [];
      ready = eternals.length > 0;
      return ready;
    } catch {
      return false;
    }
  }

  function isReady() { return ready; }
  function getSystemInfo() { return catalog?.system || null; }
  function getCatalog() { return eternals; }

  // Score a single Eternal against a hero profile + selected role.
  // Returns { score, reasons: [{text, weight}] }.
  function _score(et, profile, role) {
    const fit = et.fit || {};
    let score = fit.baseline || 0;
    const reasons = [];

    // Attribute contributions (attrs are 0-10). Negative weights are penalties
    // that lower the score but never surface as a "why".
    const attrs = profile?.attributes || {};
    let bestAttr = null;
    for (const [key, weight] of Object.entries(fit.attrs || {})) {
      const val = attrs[key];
      if (typeof val !== 'number') continue;
      const contrib = (val / 10) * weight;
      score += contrib;
      if (contrib > 0 && (!bestAttr || contrib > bestAttr.contrib)) {
        bestAttr = { key, val, contrib };
      }
    }
    if (bestAttr) {
      reasons.push({
        text: `High ${ATTR_LABELS[bestAttr.key] || bestAttr.key} (${bestAttr.val}/10)`,
        weight: bestAttr.contrib,
      });
    }

    // Trait contributions — includes kit-derived playstyle tags (burst, poke,
    // dive, dueling, crit, scaling, sustain, enchant…) when KitEngine has
    // merged them into the profile, activating those fits in eternals.json.
    const heroTraits = new Set([...(profile?.baseTraits || []), ...(profile?.playstyle || [])]);
    const matched = [];
    let traitWeight = 0;
    for (const [trait, weight] of Object.entries(fit.traits || {})) {
      if (heroTraits.has(trait)) { matched.push(trait); traitWeight += weight; }
    }
    if (matched.length) {
      score += traitWeight;
      const labelled = matched
        .map(t => (typeof traitLabel === 'function' ? traitLabel(t) : t))
        .join(', ');
      reasons.push({ text: `Kit synergy: ${labelled}`, weight: traitWeight });
    }

    // Role contribution.
    const roleWeight = (fit.roles || {})[role];
    if (roleWeight) {
      score += roleWeight;
      reasons.push({ text: `Strong in ${_roleLabel(role)}`, weight: roleWeight });
    }

    // Damage-type contribution.
    const dt = profile?.damageType;
    const dtWeight = dt ? (fit.damageType || {})[dt] : 0;
    if (dtWeight) {
      score += dtWeight;
      const dtName = dt.charAt(0).toUpperCase() + dt.slice(1);
      reasons.push({ text: `${dtName} damage scales it`, weight: dtWeight });
    }

    // Flex baseline note (Lotus).
    if ((fit.baseline || 0) >= 1) {
      reasons.push({ text: 'Flexible — works on almost any hero', weight: 0.4 });
    }

    reasons.sort((a, b) => b.weight - a.weight);
    return { score, reasons: reasons.slice(0, 3) };
  }

  function _roleLabel(role) {
    const map = { offlane: 'Offlane', jungle: 'Jungle', midlane: 'Midlane', carry: 'Carry', support: 'Support' };
    return map[role] || role;
  }

  // Rank all Eternals for a hero/role. Returns the full ranked list.
  function recommend(profile, role) {
    if (!ready || !profile) return { error: 'Eternals data unavailable', ranked: [] };
    const ranked = eternals.map(et => {
      const { score, reasons } = _score(et, profile, role);
      return {
        id: et.id,
        name: et.name,
        deity: et.deity,
        archetype: et.archetype,
        major: et.major,
        minorSlot1: et.minorSlot1 || [],
        minorSlot2: et.minorSlot2 || [],
        recommend: et.recommend || null,
        counterTip: et.counterTip || null,
        score,
        reasons,
      };
    });
    ranked.sort((a, b) => b.score - a.score);
    // Tier the list relative to the top score for display.
    const top = ranked[0]?.score || 1;
    ranked.forEach(r => {
      const ratio = top > 0 ? r.score / top : 0;
      r.tier = ratio >= 0.8 ? 'best' : ratio >= 0.55 ? 'good' : 'situational';
    });
    return { ranked, top: ranked[0] || null, role };
  }

  return { init, isReady, getSystemInfo, getCatalog, recommend };
})();
