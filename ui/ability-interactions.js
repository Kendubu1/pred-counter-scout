/**
 * Ability Interaction Engine — Browser-side port
 * Analyzes hero abilities for defensive/offensive traits and generates matchup tips.
 */

const AbilityInteractions = (() => {
  let heroProfiles = null; // slug → profile

  // GQL uses internal codenames — map to actual display names
  const DISPLAY_NAMES = {
    'Tidebinder': 'Yurei', 'Bright': 'Renna', 'DemonKing': 'Akeron',
    'Fey': 'The Fey', 'GRIMexe': 'GRIM.exe', 'FengMao': 'Feng Mao',
    'LtBelica': 'Lt. Belica', 'Cryptmaker': 'Bayle', 'Lizard': 'Zarus',
    'Swiftpaw': 'Maco', 'Huntress': 'Kira', 'IggyScorch': 'Iggy & Scorch',
    'Wood': 'Mourn', 'Boost': 'Skylar', 'Mech': 'Eden', 'Emerald': 'Argus',
  };
  function displayName(raw) { return DISPLAY_NAMES[raw] || raw; }

  // ── Trait Detection Patterns ──

  const DEFENSIVE_PATTERNS = [
    { trait: 'cleanse', patterns: [/\bcleanse\b/i, /removes? (?:all )?debuffs/i, /removes? crowd control/i] },
    { trait: 'cc_immunity', patterns: [/cc immun/i, /crowd control immun/i, /\bunstoppable\b/i] },
    { trait: 'spell_shield', patterns: [/spell shield/i, /blocks? (?:the next |an? )?abilit/i] },
    { trait: 'dash', patterns: [/\bdash(?:es)?\b/i, /\bleap(?:s)?\b/i, /\bblink(?:s)?\b/i, /\bteleport(?:s)?\b/i, /shadow walk/i] },
    { trait: 'healing', patterns: [/\bheals?\b/i, /\bregenerat/i, /restore.*health/i, /health regen/i, /life steal/i, /lifesteal/i, /omnivamp/i] },
    { trait: 'shield', patterns: [/\bshield\b/i, /\bbarrier\b/i] },
    { trait: 'damage_reduction', patterns: [/damage reduction/i, /reduce.*damage.*taken/i, /takes? \d+% less/i] },
  ];

  const OFFENSIVE_PATTERNS = [
    { trait: 'stun', patterns: [/\bstun(?:s|ned|ning)?\b/i] },
    { trait: 'root', patterns: [/\broot(?:s|ed|ing)?\b/i] },
    { trait: 'suppress', patterns: [/\bsuppress(?:es|ed|ion)?\b/i] },
    { trait: 'silence', patterns: [/\bsilence(?:s|d)?\b/i] },
    { trait: 'knockup', patterns: [/knock(?:s|ed|ing)?\s*up/i, /knock(?:s|ed|ing)?\s*back/i, /displac/i] },
    { trait: 'slow', patterns: [/\bslow(?:s|ed|ing)?\b/i] },
    { trait: 'pull', patterns: [/\bpull(?:s|ed|ing)?\b/i, /\bgrab(?:s)?\b/i, /drags?\b/i] },
    { trait: 'anti_heal', patterns: [/anti[- ]?heal/i, /grievous/i, /reduc.*healing/i, /healing.*reduc/i] },
    { trait: 'execute', patterns: [/\bexecute\b/i, /deals? more damage.*low health/i, /bonus damage.*missing health/i] },
  ];

  const HARD_CC_TRAITS = ['stun', 'root', 'suppress', 'knockup', 'pull'];

  function cleanDesc(text) {
    return (text || '').replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  }

  function analyzeAbility(ability) {
    const desc = cleanDesc(ability.description);
    const traits = { defensive: [], offensive: [] };

    for (const { trait, patterns } of DEFENSIVE_PATTERNS) {
      if (patterns.some(p => p.test(desc))) traits.defensive.push(trait);
    }
    for (const { trait, patterns } of OFFENSIVE_PATTERNS) {
      if (patterns.some(p => p.test(desc))) traits.offensive.push(trait);
    }

    // Check structured CC array
    for (const cc of (ability.cc || [])) {
      const ccType = (cc.type || '').toLowerCase();
      if (ccType === 'stun' && !traits.offensive.includes('stun')) traits.offensive.push('stun');
      if (ccType === 'root' && !traits.offensive.includes('root')) traits.offensive.push('root');
      if (ccType === 'slow' && !traits.offensive.includes('slow')) traits.offensive.push('slow');
      if (ccType === 'suppress' && !traits.offensive.includes('suppress')) traits.offensive.push('suppress');
      if (ccType === 'silence' && !traits.offensive.includes('silence')) traits.offensive.push('silence');
      if (ccType.includes('knock') && !traits.offensive.includes('knockup')) traits.offensive.push('knockup');
    }

    const cooldowns = ability.cooldowns || [];
    return {
      name: ability.name,
      key: ability.key,
      type: ability.type,
      traits,
      cooldown: { max: cooldowns[0] || null, min: cooldowns[cooldowns.length - 1] || null },
    };
  }

  function profileHero(heroData) {
    const abilities = (heroData.abilities || []).map(analyzeAbility);
    const defensive = [];
    const offensive = [];

    for (const ab of abilities) {
      for (const t of ab.traits.defensive) {
        defensive.push({ trait: t, ability: ab.name, key: ab.key, cooldown: ab.cooldown });
      }
      for (const t of ab.traits.offensive) {
        offensive.push({ trait: t, ability: ab.name, key: ab.key, cooldown: ab.cooldown });
      }
    }

    return {
      slug: heroData.slug,
      name: displayName(heroData.name),
      abilities,
      defensive,
      offensive,
      summary: {
        hasHardCC: offensive.some(o => HARD_CC_TRAITS.includes(o.trait)),
        hasCleanse: defensive.some(d => d.trait === 'cleanse'),
        hasCCImmunity: defensive.some(d => d.trait === 'cc_immunity'),
        hasDash: defensive.some(d => d.trait === 'dash'),
        hasHealing: defensive.some(d => d.trait === 'healing'),
        hasShield: defensive.some(d => d.trait === 'shield'),
      },
    };
  }

  function generateTips(attackerSlug, defenderSlug) {
    if (!heroProfiles) return [];
    const attacker = heroProfiles[attackerSlug];
    const defender = heroProfiles[defenderSlug];
    if (!attacker || !defender) return [];

    const tips = [];

    const attackerCC = attacker.offensive.filter(o => HARD_CC_TRAITS.includes(o.trait));
    const defenderCleanse = defender.defensive.filter(d => d.trait === 'cleanse');
    const defenderCCImmune = defender.defensive.filter(d => d.trait === 'cc_immunity');
    const defenderDash = defender.defensive.filter(d => d.trait === 'dash');
    const defenderHeal = defender.defensive.filter(d => d.trait === 'healing');
    const defenderShield = defender.defensive.filter(d => d.trait === 'shield');
    const defenderDR = defender.defensive.filter(d => d.trait === 'damage_reduction');
    const attackerAntiHeal = attacker.offensive.filter(o => o.trait === 'anti_heal');
    const defenderCC = defender.offensive.filter(o => HARD_CC_TRAITS.includes(o.trait));
    const attackerCleanse = attacker.defensive.filter(d => d.trait === 'cleanse');

    // Attacker CC vs Defender Cleanse
    if (attackerCC.length && defenderCleanse.length) {
      for (const cl of defenderCleanse) {
        const cdStr = cl.cooldown.max ? `${cl.cooldown.max}s` : '';
        const cdMinStr = cl.cooldown.min && cl.cooldown.min !== cl.cooldown.max ? `-${cl.cooldown.min}s` : '';
        tips.push({
          type: 'warning', category: 'cleanse',
          tip: `Your CC is less effective — ${defender.name} has a Cleanse on ${cl.ability} (${cdStr}${cdMinStr} CD)`,
          detail: `Bait out ${cl.ability} first, THEN commit your hard CC`,
          cooldown: cl.cooldown, ability: cl.ability,
        });
        if (cl.cooldown.max && cl.cooldown.max >= 15) {
          tips.push({
            type: 'advantage', category: 'window',
            tip: `Punish during ${cl.cooldown.max}s ${cl.ability} cooldown — that's a big window`,
            detail: `After they Cleanse, you have ${cl.cooldown.max}s where CC sticks`,
            cooldown: cl.cooldown, ability: cl.ability,
          });
        }
      }
    }

    // Attacker CC vs Defender CC Immunity
    if (attackerCC.length && defenderCCImmune.length) {
      for (const imm of defenderCCImmune) {
        tips.push({
          type: 'warning', category: 'cc_immunity',
          tip: `${defender.name} has CC Immunity on ${imm.ability} — don't waste abilities during it`,
          detail: `Wait for immunity window to expire, then layer your CC`,
          cooldown: imm.cooldown, ability: imm.ability,
        });
      }
    }

    // Attacker CC vs Defender Dash/Escape
    if (attackerCC.length && defenderDash.length) {
      const seenDash = new Set();
      for (const dash of defenderDash) {
        if (seenDash.has(dash.ability)) continue;
        seenDash.add(dash.ability);
        const bestCC = attackerCC[0];
        tips.push({
          type: 'advantage', category: 'escape_counter',
          tip: `Save ${bestCC.ability} to cancel ${defender.name}'s ${dash.ability} escape`,
          detail: `Don't open with CC — hold it to punish their escape attempt`,
          cooldown: dash.cooldown, ability: dash.ability,
        });
      }
    }

    // Attacker anti-heal vs Defender healing
    if (attackerAntiHeal.length && defenderHeal.length) {
      const healAbilities = [...new Set(defenderHeal.map(h => h.ability))];
      tips.push({
        type: 'advantage', category: 'anti_heal',
        tip: `Your anti-heal counters ${defender.name}'s healing (${healAbilities.join(', ')})`,
        detail: `Apply anti-heal before they use healing abilities for maximum impact`,
      });
    }

    // Defender has lots of healing, no attacker anti-heal
    if (!attackerAntiHeal.length && defenderHeal.length >= 2) {
      const healAbilities = [...new Set(defenderHeal.map(h => h.ability))];
      tips.push({
        type: 'warning', category: 'healing',
        tip: `${defender.name} has strong healing (${healAbilities.join(', ')}) — consider anti-heal items`,
        detail: `Without anti-heal, extended trades heavily favor them`,
      });
    }

    // Defender has shield
    if (defenderShield.length) {
      const seenShield = new Set();
      for (const sh of defenderShield) {
        if (seenShield.has(sh.ability)) continue;
        seenShield.add(sh.ability);
        if (sh.cooldown.max) {
          tips.push({
            type: 'advantage', category: 'shield_window',
            tip: `Wait for ${sh.ability} shield cooldown (${sh.cooldown.max}s) before committing burst`,
            detail: `Baiting the shield first means your damage isn't wasted`,
            cooldown: sh.cooldown, ability: sh.ability,
          });
        }
      }
    }

    // Defender has damage reduction
    if (defenderDR.length) {
      for (const dr of defenderDR) {
        tips.push({
          type: 'warning', category: 'damage_reduction',
          tip: `${defender.name} can reduce damage with ${dr.ability} — don't burst into it`,
          detail: `Wait for ${dr.ability} to expire before going all-in`,
          cooldown: dr.cooldown, ability: dr.ability,
        });
      }
    }

    // Defender CC vs Attacker
    if (defenderCC.length && !attackerCleanse.length) {
      const ccAbilities = [...new Set(defenderCC.map(c => `${c.ability} (${c.trait})`))];
      tips.push({
        type: 'warning', category: 'enemy_cc',
        tip: `Watch out for ${defender.name}'s CC: ${ccAbilities.join(', ')}`,
        detail: `You have no cleanse — getting caught means death if they follow up`,
      });
    }

    // Attacker cleanse vs defender CC
    if (attackerCleanse.length && defenderCC.length) {
      const cl = attackerCleanse[0];
      tips.push({
        type: 'advantage', category: 'your_cleanse',
        tip: `Your ${cl.ability} cleanses ${defender.name}'s CC — save it for their key ability`,
        detail: `Don't waste your cleanse early; hold it for their most dangerous CC`,
        cooldown: cl.cooldown, ability: cl.ability,
      });
    }

    // CD advantage
    if (attackerCC.length && defenderCleanse.length) {
      const ccCD = attackerCC[0].cooldown.min || attackerCC[0].cooldown.max;
      const cleanseCD = defenderCleanse[0].cooldown.max;
      if (ccCD && cleanseCD && ccCD < cleanseCD) {
        tips.push({
          type: 'advantage', category: 'cd_advantage',
          tip: `Your ${attackerCC[0].ability} (${ccCD}s) comes up faster than their ${defenderCleanse[0].ability} (${cleanseCD}s)`,
          detail: `Chain CC attempts — your CC will be ready before their cleanse`,
        });
      }
    }

    return tips;
  }

  function getProfile(slug) {
    return heroProfiles?.[slug] || null;
  }

  async function init(dataBase) {
    try {
      const resp = await fetch(`${dataBase}/game-data/hero-abilities.json`);
      const raw = await resp.json();
      heroProfiles = {};
      for (const [slug, heroData] of Object.entries(raw)) {
        heroProfiles[slug] = profileHero(heroData);
      }
      return true;
    } catch (e) {
      console.error('AbilityInteractions init failed:', e);
      return false;
    }
  }

  function isReady() { return !!heroProfiles; }

  /**
   * Render ability matchup tips HTML for a given attacker vs defender.
   */
  function renderTips(attackerSlug, defenderSlug) {
    const tips = generateTips(attackerSlug, defenderSlug);
    if (!tips.length) return '';

    let html = '<div class="ability-tips-section">';
    html += '<h4>⚔️ Ability Matchup Tips</h4>';

    for (const tip of tips) {
      const cls = tip.type === 'advantage' ? 'ability-tip-advantage' : 'ability-tip-warning';
      const icon = tip.type === 'advantage' ? '✅' : '⚠️';
      html += `<div class="ability-tip ${cls}">`;
      html += `<div class="ability-tip-main">${icon} ${escHtml(tip.tip)}</div>`;
      if (tip.detail) {
        html += `<div class="ability-tip-detail">${escHtml(tip.detail)}</div>`;
      }
      if (tip.cooldown?.max) {
        html += `<div class="ability-tip-cd">⏱ CD: ${tip.cooldown.max}s${tip.cooldown.min && tip.cooldown.min !== tip.cooldown.max ? ` → ${tip.cooldown.min}s` : ''}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Render defender-only tips for "How to Counter" (no specific attacker).
   */
  function renderDefenderTips(defenderSlug) {
    const defender = heroProfiles?.[defenderSlug];
    if (!defender) return '';

    const tips = [];

    // Summarize defensive traits
    for (const d of defender.defensive) {
      const cdStr = d.cooldown.max ? ` (${d.cooldown.max}s${d.cooldown.min && d.cooldown.min !== d.cooldown.max ? `-${d.cooldown.min}s` : ''} CD)` : '';
      if (d.trait === 'cleanse') {
        tips.push({ type: 'warning', tip: `Has Cleanse on ${d.ability}${cdStr} — CC is less reliable`, detail: `Bait it out first, then commit hard CC. Stack CC chains — cleanse only works once.` });
        if (d.cooldown.max >= 15) {
          tips.push({ type: 'advantage', tip: `${d.ability} has a ${d.cooldown.max}s cooldown at rank 1 — big punish window`, detail: `After cleanse is used, you have a long window to lock them down.` });
        }
      }
      if (d.trait === 'cc_immunity') {
        tips.push({ type: 'warning', tip: `Has CC Immunity on ${d.ability}${cdStr}`, detail: `Don't waste key abilities during their immunity window.` });
      }
      if (d.trait === 'dash') {
        tips.push({ type: 'warning', tip: `Has escape/mobility on ${d.ability}${cdStr}`, detail: `Save hard CC to cancel their escape. Don't blow everything before they dash.` });
      }
      if (d.trait === 'shield') {
        tips.push({ type: 'warning', tip: `Has shield on ${d.ability}${cdStr}`, detail: `Bait or wait out the shield before committing burst damage.` });
      }
      if (d.trait === 'damage_reduction') {
        tips.push({ type: 'warning', tip: `Has damage reduction on ${d.ability}${cdStr}`, detail: `Don't burst into it — wait for it to expire.` });
      }
    }

    // Healing summary
    const healAbilities = [...new Set(defender.defensive.filter(d => d.trait === 'healing').map(d => d.ability))];
    if (healAbilities.length >= 2) {
      tips.push({ type: 'warning', tip: `Strong healing kit: ${healAbilities.join(', ')}`, detail: `Anti-heal items are essential. Without them, extended trades heavily favor this hero.` });
    } else if (healAbilities.length === 1) {
      tips.push({ type: 'warning', tip: `Has healing on ${healAbilities[0]}`, detail: `Consider anti-heal if they're sustaining through fights.` });
    }

    // Offensive threats to watch
    const hardCC = defender.offensive.filter(o => HARD_CC_TRAITS.includes(o.trait));
    if (hardCC.length) {
      const ccList = [...new Set(hardCC.map(c => `${c.ability} (${c.trait})`))];
      tips.push({ type: 'warning', tip: `Dangerous CC: ${ccList.join(', ')}`, detail: `Respect their engage range. Cleanse items/abilities help survive their combo.` });
    }

    if (!tips.length) return '';

    let html = '<div class="ability-tips-section">';
    html += '<h4>⚔️ Ability Breakdown</h4>';

    // Deduplicate
    const seen = new Set();
    for (const tip of tips) {
      const key = tip.tip;
      if (seen.has(key)) continue;
      seen.add(key);
      const cls = tip.type === 'advantage' ? 'ability-tip-advantage' : 'ability-tip-warning';
      const icon = tip.type === 'advantage' ? '✅' : '⚠️';
      html += `<div class="ability-tip ${cls}">`;
      html += `<div class="ability-tip-main">${icon} ${escHtml(tip.tip)}</div>`;
      if (tip.detail) html += `<div class="ability-tip-detail">${escHtml(tip.detail)}</div>`;
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, isReady, getProfile, generateTips, renderTips, renderDefenderTips };
})();
