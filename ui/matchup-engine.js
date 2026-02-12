// matchup-engine.js — Browser-side counter-meta engine for Predecessor Scout

const MatchupEngine = (() => {
  let itemsData = null;     // raw items array
  let heroProfiles = null;  // slug → profile
  let itemIndex = null;     // indexed items
  let augmentDescriptions = {};  // lowercase name → description

  // ── Item Index (ported from item-index.js) ──

  const EFFECT_TAG_PATTERNS = [
    { tag: 'anti_heal', patterns: [/reduce.*healing/i, /grievous/i, /blighted/i] },
    { tag: 'physical_shred', patterns: [/reduce.*physical armor/i, /physical armor.*reduc/i, /shred.*physical/i] },
    { tag: 'magical_shred', patterns: [/reduce.*magical armor/i, /magical armor.*reduc/i, /shred.*magic/i] },
    { tag: 'on_hit', patterns: [/on basic attack/i, /on-hit/i, /basic attack.*deal/i, /on attacking/i] },
    { tag: 'sustain', patterns: [/heal(?!ing.*reduc)/i, /lifesteal/i, /omnivamp/i, /life steal/i, /restore.*health/i] },
    { tag: 'shield', patterns: [/shield/i, /barrier/i] },
    { tag: 'mobility', patterns: [/movement speed/i, /dash/i, /blink/i, /sprint/i] },
    { tag: 'cc', patterns: [/slow/i, /stun/i, /root/i, /silence/i, /pull/i, /knockback/i] },
    { tag: 'cleave', patterns: [/cleave/i, /splash/i, /area.*damage/i, /nearby enem/i] },
    { tag: 'burst', patterns: [/bonus damage/i, /execute/i, /empower.*next/i] },
    { tag: 'crit', patterns: [/critical/i, /crit/i] },
    { tag: 'true_damage', patterns: [/true damage/i] },
    { tag: 'aura', patterns: [/aura/i, /nearby all/i] },
    { tag: 'mana', patterns: [/mana/i] },
    { tag: 'cooldown_reduction', patterns: [/ability haste/i, /cooldown/i] },
    { tag: 'percent_health', patterns: [/maximum health/i, /max health/i, /% health/i] },
    { tag: 'tenacity', patterns: [/tenacity/i, /crowd control.*reduc/i] },
    { tag: 'pen', patterns: [/penetrat/i, /lethality/i] },
  ];

  const STAT_CATEGORIES = {
    PHYSICAL_POWER: 'offense_physical',
    MAGICAL_POWER: 'offense_magical',
    ATTACK_SPEED: 'offense_physical',
    CRITICAL_CHANCE: 'offense_physical',
    PHYSICAL_PENETRATION: 'offense_physical',
    MAGICAL_PENETRATION: 'offense_magical',
    LIFESTEAL: 'sustain',
    MAGICAL_LIFESTEAL: 'sustain',
    OMNIVAMP: 'sustain',
    HEALTH: 'defense',
    PHYSICAL_ARMOR: 'defense_physical',
    MAGICAL_ARMOR: 'defense_magical',
    ABILITY_HASTE: 'utility',
    MANA: 'utility',
    MOVEMENT_SPEED: 'utility',
    BASE_HEALTH_REGENERATION: 'sustain',
    BASE_MANA_REGENERATION: 'utility',
    HEAL_AND_SHIELD_POWER: 'support',
    TENACITY: 'defense',
    GOLD_PER_SECOND: 'utility',
  };

  const GOLD_PER_STAT = {
    PHYSICAL_POWER: 43.3, MAGICAL_POWER: 21.7, ATTACK_SPEED: 30,
    HEALTH: 2.67, MANA: 2.33, PHYSICAL_ARMOR: 20, MAGICAL_ARMOR: 20,
    ABILITY_HASTE: 50, CRITICAL_CHANCE: 40, PHYSICAL_PENETRATION: 50,
    MAGICAL_PENETRATION: 50, LIFESTEAL: 75, MAGICAL_LIFESTEAL: 75,
    OMNIVAMP: 100, MOVEMENT_SPEED: 100, BASE_HEALTH_REGENERATION: 100,
    BASE_MANA_REGENERATION: 100, HEAL_AND_SHIELD_POWER: 50, TENACITY: 50,
    GOLD_PER_SECOND: 500,
  };

  function stripTags(text) {
    return (text || '').replace(/<[^>]*>/g, '').replace(/<img[^>]*>/g, '');
  }

  /** Clean game data text — strips XML tags, img tags, and normalizes whitespace */
  function cleanGameText(text) {
    return (text || '')
      .replace(/<img[^>]*>/gi, '')       // remove img tags
      .replace(/<\/>/g, '')              // remove empty closing tags
      .replace(/<\/?[A-Za-z]\w*>/g, '')  // remove XML-style tags like <AbilityPowerText>, <HealthText>, etc.
      .replace(/<[^>]*>/g, '')           // catch any remaining HTML tags
      .replace(/\s+/g, ' ')             // normalize whitespace
      .trim();
  }

  function extractEffectTags(item) {
    const tags = new Set();
    for (const s of (item.data?.stats || [])) {
      if (s.stat === 'LIFESTEAL' || s.stat === 'OMNIVAMP' || s.stat === 'MAGICAL_LIFESTEAL') tags.add('sustain');
      if (s.stat === 'PHYSICAL_PENETRATION') tags.add('pen');
      if (s.stat === 'MAGICAL_PENETRATION') tags.add('pen');
      if (s.stat === 'CRITICAL_CHANCE') tags.add('crit');
      if (s.stat === 'ATTACK_SPEED') tags.add('attack_speed');
      if (s.stat === 'ABILITY_HASTE') tags.add('cooldown_reduction');
      if (s.stat === 'HEAL_AND_SHIELD_POWER') tags.add('shield');
    }
    const allText = (item.data?.effects || []).map(e => stripTags(e.text || '') + ' ' + stripTags(e.condition || '')).join(' ');
    for (const { tag, patterns } of EFFECT_TAG_PATTERNS) {
      if (patterns.some(p => p.test(allText))) tags.add(tag);
    }
    return [...tags];
  }

  function getStatCategories(item) {
    const cats = new Set();
    for (const s of (item.data?.stats || [])) {
      const cat = STAT_CATEGORIES[s.stat];
      if (cat) cats.add(cat);
    }
    return [...cats];
  }

  function calcGoldEfficiency(item) {
    if (!item.data?.totalPrice) return null;
    let statValue = 0;
    for (const s of (item.data.stats || [])) {
      const gpv = GOLD_PER_STAT[s.stat];
      if (gpv) statValue += s.value * gpv;
    }
    return { statValue: Math.round(statValue), totalPrice: item.data.totalPrice, efficiency: Math.round((statValue / item.data.totalPrice) * 100) };
  }

  function buildItemIndex(rawItems) {
    const idx = { items: [], bySlug: {}, byName: {}, byTag: {}, byStatCategory: {} };
    for (const item of rawItems) {
      if (!item.data) continue;
      const indexed = { ...item, tags: extractEffectTags(item), statCategories: getStatCategories(item), goldEfficiency: calcGoldEfficiency(item) };
      idx.items.push(indexed);
      idx.bySlug[item.slug] = indexed;
      idx.byName[item.data.displayName] = indexed;
      for (const tag of indexed.tags) {
        if (!idx.byTag[tag]) idx.byTag[tag] = [];
        idx.byTag[tag].push(indexed);
      }
      for (const cat of indexed.statCategories) {
        if (!idx.byStatCategory[cat]) idx.byStatCategory[cat] = [];
        idx.byStatCategory[cat].push(indexed);
      }
    }
    idx.get = (key) => idx.bySlug[key] || idx.byName[key] || null;
    idx.findByTag = (tag) => idx.byTag[tag] || [];
    idx.findByStatCategory = (cat) => idx.byStatCategory[cat] || [];
    idx.getCompletedItems = () => idx.items.filter(i => i.data.rarity === 'EPIC' || i.data.rarity === 'LEGENDARY');
    return idx;
  }

  // ── Helpers ──

  function parseWinRate(str) { return parseFloat(String(str)) || 0; }
  function parseMatchCount(str) { const m = String(str).match(/(\d+)/); return m ? parseInt(m[1]) : 0; }

  // ── Core Engine ──

  function getHighestWRBuild(heroData, role, minMatches = 2) {
    if (!heroData?.roles) return null;
    const rolesToCheck = role ? [role] : Object.keys(heroData.roles);
    let best = null, bestScore = -Infinity;
    for (const r of rolesToCheck) {
      const rd = heroData.roles[r];
      if (!rd?.buildTabs?.length) continue;
      for (const build of rd.buildTabs) {
        const wr = parseWinRate(build.winRate);
        const matches = parseMatchCount(build.matches);
        if (matches < minMatches) continue;
        const score = wr * Math.log2(matches + 1);
        if (score > bestScore) {
          bestScore = score;
          best = { role: r, name: build.name, items: build.items, winRate: wr, matches, augments: rd.augments || [], crests: rd.crests || [] };
        }
      }
    }
    if (!best && minMatches > 1) return getHighestWRBuild(heroData, role, 1);
    return best;
  }

  function analyzeBuild(buildItems, heroProfile) {
    const analysis = {
      totalPhysicalPower: 0, totalMagicalPower: 0, totalArmor: 0, totalMagicResist: 0,
      totalHealth: 0, totalAttackSpeed: 0, hasCrit: false, hasOnHit: false, hasAntiHeal: false,
      hasSustain: false, hasShield: false, hasPen: false, hasTenacity: false, hasCleave: false,
      primaryDamageType: heroProfile?.damageType || 'physical',
      effectTags: new Set(), threatProfile: [], weaknesses: [],
    };
    for (const itemName of buildItems) {
      const item = itemIndex.get(itemName);
      if (!item) continue;
      for (const s of (item.data.stats || [])) {
        switch (s.stat) {
          case 'PHYSICAL_POWER': analysis.totalPhysicalPower += s.value; break;
          case 'MAGICAL_POWER': analysis.totalMagicalPower += s.value; break;
          case 'PHYSICAL_ARMOR': analysis.totalArmor += s.value; break;
          case 'MAGICAL_ARMOR': analysis.totalMagicResist += s.value; break;
          case 'HEALTH': analysis.totalHealth += s.value; break;
          case 'ATTACK_SPEED': analysis.totalAttackSpeed += s.value; break;
          case 'CRITICAL_CHANCE': analysis.hasCrit = true; break;
        }
      }
      for (const tag of item.tags) {
        analysis.effectTags.add(tag);
        if (tag === 'on_hit') analysis.hasOnHit = true;
        if (tag === 'anti_heal') analysis.hasAntiHeal = true;
        if (tag === 'sustain') analysis.hasSustain = true;
        if (tag === 'shield') analysis.hasShield = true;
        if (tag === 'pen') analysis.hasPen = true;
        if (tag === 'tenacity') analysis.hasTenacity = true;
        if (tag === 'cleave') analysis.hasCleave = true;
        if (tag === 'crit') analysis.hasCrit = true;
      }
    }
    if (analysis.totalPhysicalPower > 60 || analysis.hasCrit) analysis.threatProfile.push('high physical damage');
    if (analysis.totalMagicalPower > 80) analysis.threatProfile.push('high magic damage');
    if (analysis.hasOnHit && analysis.totalAttackSpeed > 20) analysis.threatProfile.push('on-hit DPS');
    if (analysis.hasCrit) analysis.threatProfile.push('crit burst');
    if (analysis.hasSustain) analysis.threatProfile.push('heals a lot');
    if (analysis.hasPen) analysis.threatProfile.push('shreds your armor');
    if (analysis.hasCleave) analysis.threatProfile.push('AoE damage');
    if (analysis.totalHealth > 400 || analysis.totalArmor > 40) analysis.threatProfile.push('hard to kill');
    if (!analysis.hasAntiHeal) analysis.weaknesses.push('cant_cut_your_healing');
    if (analysis.totalArmor < 20 && analysis.totalMagicResist < 20) analysis.weaknesses.push('no_defenses');
    if (!analysis.hasTenacity) analysis.weaknesses.push('dies_to_cc');
    if (analysis.totalAttackSpeed > 30 && !analysis.hasCrit) analysis.weaknesses.push('needs_attack_speed');
    if (analysis.hasCrit) analysis.weaknesses.push('relies_on_crit');
    if (analysis.hasSustain && !analysis.hasAntiHeal) analysis.weaknesses.push('healing_is_counterable');
    analysis.effectTags = [...analysis.effectTags];
    return analysis;
  }

  function _generateBuildName(items, yourProfile, buildAnalysis) {
    const allTags = new Set();
    for (const item of items) {
      for (const tag of (item.tags || [])) allTags.add(tag);
      for (const cat of (item.statCategories || [])) allTags.add(cat);
    }
    const candidates = [];
    if (allTags.has('crit')) candidates.push({ label: 'Crit', weight: 10 });
    if (allTags.has('on_hit')) candidates.push({ label: 'On-Hit', weight: 9 });
    if (allTags.has('pen') || allTags.has('physical_shred') || allTags.has('magical_shred')) candidates.push({ label: 'Pen', weight: 8 });
    if (allTags.has('anti_heal')) candidates.push({ label: 'Anti-Heal', weight: 15 });
    if ((allTags.has('defense_physical') || allTags.has('defense_magical')) && (allTags.has('offense_physical') || allTags.has('offense_magical'))) candidates.push({ label: 'Bruiser', weight: 7 });
    else if (allTags.has('defense_physical') || allTags.has('defense_magical')) candidates.push({ label: 'Tanky', weight: 6 });
    if (allTags.has('shield') || allTags.has('aura')) candidates.push({ label: 'Utility', weight: 5 });
    if (allTags.has('sustain') && !allTags.has('anti_heal')) candidates.push({ label: 'Sustain', weight: 4 });
    candidates.sort((a, b) => b.weight - a.weight);
    let parts = candidates.slice(0, 3).map(c => c.label);
    if (!parts.length) {
      if (yourProfile.damageType === 'physical') parts = ['AD', 'Counter'];
      else if (yourProfile.damageType === 'magical') parts = ['AP', 'Counter'];
      else parts = ['Counter'];
    }
    return parts.join('/');
  }

  function _pickAugment(roleData, buildAnalysis, yourProfile) {
    if (!roleData?.augments?.length) return { recommended: null, alternatives: [], note: 'No augment data' };
    const scored = roleData.augments.map(aug => {
      const wr = parseWinRate(aug.winRate);
      const matches = parseMatchCount(aug.matches || 0);
      let score = wr * Math.log2(matches + 1);
      const nl = (aug.name || '').toLowerCase().trim();
      if (buildAnalysis?.hasSustain && (nl.includes('tainted') || nl.includes('anti-heal') || nl.includes('grievous'))) score *= 1.8;
      if (buildAnalysis?.threatProfile?.includes('hard to kill') && (nl.includes('shred') || nl.includes('pen') || nl.includes('break'))) score *= 1.5;
      if (yourProfile?.playstyle?.includes('sustained_dps') && (nl.includes('hit') || nl.includes('attack'))) score *= 1.3;
      if (yourProfile?.playstyle?.includes('burst') && (nl.includes('burst') || nl.includes('soul') || nl.includes('limit break'))) score *= 1.3;
      return { ...aug, score };
    }).sort((a, b) => b.score - a.score);
    const top = scored[0];
    let reason = `${top.winRate} WR across ${top.matches || '?'} matches`;
    const tl = (top.name || '').toLowerCase().trim();
    if (buildAnalysis?.hasSustain && (tl.includes('tainted') || tl.includes('anti-heal'))) reason += ' — adds anti-heal pressure';
    return {
      recommended: { name: (top.name || '').trim(), winRate: top.winRate, matches: top.matches, reason },
      alternatives: scored.slice(1, 3).map(a => ({ name: (a.name || '').trim(), winRate: a.winRate, matches: a.matches })),
    };
  }

  function _crestSwapReason(crest, yourProfile, buildAnalysis) {
    const r = [];
    if (crest.tags.includes('sustain')) r.push('if you need healing between fights');
    if (crest.tags.includes('shield')) r.push('if you need burst survival');
    if (crest.tags.includes('mobility')) r.push('if you need to dodge or chase');
    if (crest.tags.includes('anti_heal')) r.push('if enemy healing is out of control');
    if (crest.statCategories.includes('defense_physical')) r.push('if physical damage is killing you');
    if (crest.statCategories.includes('defense_magical')) r.push('if magic damage is killing you');
    if (crest.tags.includes('crit')) r.push('for max damage late game');
    if (crest.tags.includes('attack_speed')) r.push('for faster auto-attacks');
    return r.length ? r.join('; ') : 'general alternative';
  }

  function _itemSwapReason(item, yourProfile, buildAnalysis, enemyProfile) {
    const r = [];
    if (item.tags.includes('anti_heal')) r.push('if nobody else has anti-heal');
    if (item.tags.includes('pen') || item.tags.includes('physical_shred') || item.tags.includes('magical_shred')) r.push('if enemy buys armor/MR');
    if (item.statCategories.includes('defense_physical')) r.push('if you\'re getting burst down');
    if (item.statCategories.includes('defense_magical')) r.push('if enemy mages are a problem');
    if (item.tags.includes('sustain') && !item.tags.includes('anti_heal')) r.push('if you need to stay in lane longer');
    if (item.tags.includes('tenacity')) r.push('if you keep getting CC\'d');
    if (item.tags.includes('mobility')) r.push('if you need to dodge skillshots');
    if (item.tags.includes('crit')) r.push('for max damage late game');
    if (item.tags.includes('shield')) r.push('if you need to survive burst');
    if (item.tags.includes('on_hit')) r.push('if enemies stack HP');
    return r.length ? r.join('; ') : 'solid alternative for your kit';
  }

  function _itemSwapReasonDuo(item, yourProfile, laneThreats, isSupport) {
    const r = [];
    if (item.tags.includes('anti_heal')) r.push('if your partner can\'t carry anti-heal');
    if (item.tags.includes('pen')) r.push('if enemies buy armor/MR');
    if (item.statCategories.includes('defense_physical') && laneThreats.primaryPhysical) r.push('if you\'re getting burst down');
    if (item.statCategories.includes('defense_magical') && laneThreats.primaryMagical) r.push('if enemy mage rotates');
    if (item.tags.includes('sustain') && !item.tags.includes('anti_heal')) r.push('if you need lane sustain');
    if (item.tags.includes('tenacity')) r.push('if you keep getting CC\'d');
    if (item.tags.includes('shield') || item.tags.includes('aura')) r.push('for teamfight protection');
    if (item.tags.includes('on_hit')) r.push('if enemies stack HP');
    if (item.tags.includes('crit') && !isSupport) r.push('for late game damage');
    return r.length ? r.join('; ') : 'solid alternative';
  }

  /**
   * Extract "family" prefix from item names to detect duplicates
   * e.g. "Tainted Scepter" → "Tainted", "Tainted Guard" → "Tainted"
   */
  function getItemFamily(itemName) {
    const FAMILY_PREFIXES = ['Tainted', 'Ashenblade', 'Hexbound', 'Oathkeeper', 'Mindrazor'];
    const name = itemName || '';
    for (const prefix of FAMILY_PREFIXES) {
      if (name.startsWith(prefix + ' ')) return prefix;
    }
    return null;
  }

  function scoreForPath(item, yourProfile, buildAnalysis, provenItems, coveredTags, usedFamilies) {
    let score = 0;
    if (yourProfile.damageType === 'physical' && item.statCategories.includes('offense_physical')) score += 20;
    if (yourProfile.damageType === 'magical' && item.statCategories.includes('offense_magical')) score += 20;
    if (yourProfile.damageType === 'hybrid' && (item.statCategories.includes('offense_physical') || item.statCategories.includes('offense_magical'))) score += 12;
    if (yourProfile.damageType === 'physical' && item.statCategories.includes('offense_magical') && !item.statCategories.includes('offense_physical')) score -= 30;
    if (yourProfile.damageType === 'magical' && item.statCategories.includes('offense_physical') && !item.statCategories.includes('offense_magical')) score -= 30;
    for (const syn of (yourProfile.synergies || [])) {
      if (item.tags.includes(syn.tag) || item.statCategories.includes(syn.tag)) score += 15;
    }
    if (yourProfile.hasASSteroid && item.tags.includes('attack_speed')) score -= 5;
    if (buildAnalysis.hasSustain && item.tags.includes('anti_heal')) score += 30;
    if (buildAnalysis.hasCrit && item.statCategories.includes('defense_physical')) score += 15;
    if (buildAnalysis.primaryDamageType === 'physical' && item.statCategories.includes('defense_physical')) score += 12;
    if (buildAnalysis.primaryDamageType === 'magical' && item.statCategories.includes('defense_magical')) score += 12;
    if (buildAnalysis.threatProfile.includes('hard to kill') && item.tags.includes('pen')) score += 15;
    if (buildAnalysis.threatProfile.includes('on-hit DPS') && item.statCategories.includes('defense')) score += 8;
    const proven = provenItems.get(item.data.displayName);
    if (proven) {
      score += 10;
      if (proven.avgWR > 55) score += 10;
      if (proven.appearances >= 2) score += 5;
    }
    if (item.goldEfficiency?.efficiency > 100) score += 5;
    if (item.data.rarity === 'LEGENDARY') score += 3;
    for (const tag of item.tags) {
      if (coveredTags.has(tag)) score -= 25;
    }
    // Item family diversity: penalize same family (e.g. multiple "Tainted" items)
    const family = getItemFamily(item.data.displayName);
    if (family && usedFamilies && usedFamilies.has(family)) score -= 40;
    return score;
  }

  function getProvenItems(heroData, role) {
    const rd = heroData?.roles?.[role] || (heroData?.roles ? heroData.roles[Object.keys(heroData.roles)[0]] : null);
    const proven = new Map();
    if (rd?.buildTabs) {
      for (const build of rd.buildTabs) {
        const wr = parseWinRate(build.winRate);
        const matches = parseMatchCount(build.matches);
        for (const name of build.items) {
          if (!proven.has(name)) proven.set(name, { appearances: 0, totalWR: 0, totalMatches: 0 });
          const p = proven.get(name);
          p.appearances++;
          p.totalWR += wr * matches;
          p.totalMatches += matches;
        }
      }
    }
    const list = new Map();
    for (const [name, p] of proven) {
      list.set(name, { ...p, avgWR: p.totalMatches > 0 ? p.totalWR / p.totalMatches : 50 });
    }
    return { provenItems: list, roleData: rd };
  }

  function generateMatchupTips(buildAnalysis, yourProfile, enemyProfile) {
    const tips = [];
    if (buildAnalysis.hasSustain) tips.push(`🩸 Anti-heal is non-negotiable. ${enemyProfile.name}'s build has sustain. Without anti-heal you lose extended trades.`);
    if (buildAnalysis.weaknesses.includes('no_defenses')) tips.push(`💀 ${enemyProfile.name}'s build has ZERO defensive stats. Short burst trades favor you.`);
    if (buildAnalysis.weaknesses.includes('dies_to_cc')) tips.push(`🎯 No tenacity in their build. CC = kill.`);
    if (buildAnalysis.hasCrit) tips.push(`🛡️ They build crit — armor items with anti-crit passives are gold-efficient counters.`);
    if (buildAnalysis.threatProfile.includes('on-hit DPS')) tips.push(`⚔️ On-hit DPS build — they win sustained fights. Force short trades or all-in with burst + CC.`);
    if (buildAnalysis.threatProfile.includes('shreds your armor')) tips.push(`🧱 They have armor shred — HP stacking is more valuable than pure armor.`);
    if (yourProfile.playstyle?.includes('burst') && buildAnalysis.weaknesses.includes('no_defenses')) tips.push(`🔥 Your burst vs their squishiness = favorable. Look for 100-0 windows.`);
    return tips;
  }

  function generateDuoTips(laneThreats, allies, enemies) {
    const tips = [];
    if (laneThreats.hasSustain) tips.push('🩸 Enemy lane has sustain — make sure ONE of you has anti-heal. Don\'t double up.');
    if (laneThreats.weaknesses.includes('no_defenses')) tips.push('💀 Enemy builds are squishy — coordinate burst trades. CC → all-in together.');
    if (laneThreats.weaknesses.includes('dies_to_cc')) tips.push('🎯 No tenacity on enemy side — chain CC for guaranteed kills.');
    if (laneThreats.threats.includes('on-hit DPS') && laneThreats.threats.includes('heals a lot')) tips.push('⚔️ Enemy has sustained DPS + healing. Short trades only.');
    if (laneThreats.hasCrit) tips.push('🛡️ Enemy builds crit — at least one of you needs armor.');
    return tips;
  }

  // ── Shared Counter Data Lookup ──

  /**
   * Look up direct counter data between two heroes for a given role.
   * Checks both directions: yourHero's counters for enemy, and enemy's counters for yourHero.
   * Returns { yourVsEnemy, enemyVsYou, hasDirectData }
   */
  function lookupCounterData(yourSlug, enemySlug, yourRole, heroDataMap) {
    const yourData = heroDataMap[yourSlug];
    const enemyData = heroDataMap[enemySlug];
    const yourName = heroProfiles[yourSlug]?.name || yourSlug;
    const enemyName = heroProfiles[enemySlug]?.name || enemySlug;

    let yourVsEnemy = null; // from your counters list: your WR vs enemy
    let enemyVsYou = null;  // from enemy's counters list: enemy WR vs you

    // Check your hero's counter data for the enemy
    if (yourData?.roles) {
      const rd = yourData.roles[yourRole] || yourData.roles[yourData.activeRoles?.[0]] || Object.values(yourData.roles)[0];
      if (rd?.counters) {
        const match = rd.counters.find(c => c.hero.toLowerCase() === enemyName.toLowerCase());
        if (match && match.matches >= 1) {
          yourVsEnemy = { winRate: match.winRate, matches: match.matches };
        }
      }
    }

    // Check enemy's counter data for your hero (across all enemy roles)
    if (enemyData?.roles) {
      for (const rd of Object.values(enemyData.roles)) {
        if (!rd?.counters) continue;
        const match = rd.counters.find(c => c.hero.toLowerCase() === yourName.toLowerCase());
        if (match && match.matches >= 1) {
          // Enemy's WR vs you — so your WR is (100 - enemyWR) approximately
          enemyVsYou = { enemyWinRate: match.winRate, matches: match.matches };
          break;
        }
      }
    }

    return {
      yourVsEnemy,
      enemyVsYou,
      hasDirectData: !!(yourVsEnemy || enemyVsYou),
    };
  }

  /**
   * Check role validity and find best fallback role.
   * Returns { validRole, isRoleMismatch, requestedRole, fallbackRole, activeRoles }
   */
  function resolveRole(heroSlug, requestedRole, heroDataMap) {
    const data = heroDataMap[heroSlug];
    const activeRoles = data?.activeRoles || [];
    const profile = heroProfiles[heroSlug];
    const heroName = profile?.name || heroSlug;

    if (!requestedRole || activeRoles.includes(requestedRole)) {
      return { validRole: requestedRole, isRoleMismatch: false, requestedRole, fallbackRole: null, activeRoles, heroName };
    }

    // Role mismatch — find best fallback
    // Prefer the role with most data
    let bestRole = activeRoles[0] || Object.keys(data?.roles || {})[0] || null;
    let bestMatches = 0;
    for (const role of activeRoles) {
      const rd = data?.roles?.[role];
      if (!rd?.buildTabs) continue;
      const totalMatches = rd.buildTabs.reduce((sum, b) => sum + (parseMatchCount(b.matches) || 0), 0);
      if (totalMatches > bestMatches) {
        bestMatches = totalMatches;
        bestRole = role;
      }
    }

    return {
      validRole: bestRole,
      isRoleMismatch: true,
      requestedRole,
      fallbackRole: bestRole,
      activeRoles,
      heroName,
    };
  }

  /**
   * Get scraped counter build data for a specific matchup if it exists.
   * Returns the best build from counter data, or null.
   */
  function getScrapedCounterBuild(yourSlug, yourRole, enemySlug, heroDataMap) {
    const yourData = heroDataMap[yourSlug];
    const enemyName = heroProfiles[enemySlug]?.name || enemySlug;
    if (!yourData?.roles) return null;

    const rd = yourData.roles[yourRole] || yourData.roles[yourData.activeRoles?.[0]];
    if (!rd?.counters) return null;

    const matchup = rd.counters.find(c => c.hero.toLowerCase() === enemyName.toLowerCase());
    if (!matchup || matchup.matches < 5) return null;

    // Get the highest WR build for this role as the "counter build baseline"
    const build = getHighestWRBuild(yourData, yourRole);
    if (!build) return null;

    return {
      build,
      matchupData: matchup,
    };
  }

  // ── Public API ──

  async function init(dataBase) {
    const cb = '?v=' + Date.now();
    const [itemsRes, profilesRes] = await Promise.all([
      fetch(`${dataBase}/game-data/items.json${cb}`),
      fetch(`${dataBase}/game-data/hero-profiles.json${cb}`),
    ]);
    const itemsRaw = await itemsRes.json();
    itemsData = itemsRaw.items || itemsRaw;
    itemIndex = buildItemIndex(itemsData);

    const profilesRaw = await profilesRes.json();
    heroProfiles = {};
    augmentDescriptions = {};
    for (const p of profilesRaw) {
      heroProfiles[p.slug] = p;
      for (const a of (p.augments || [])) {
        augmentDescriptions[a.name.trim().toLowerCase()] = cleanGameText(a.description || '');
      }
    }
  }

  function isReady() { return !!(itemIndex && heroProfiles); }

  function getProfile(slug) { return heroProfiles?.[slug] || null; }
  function getAugmentDesc(name) { return augmentDescriptions[(name || '').trim().toLowerCase()] || null; }

  /**
   * Solo lane counter build.
   * heroData maps: { yourSlug: heroJsonData, enemySlug: heroJsonData }
   */
  function counterBuildPath(yourSlug, yourRole, enemySlug, heroDataMap) {
    const yourProfile = heroProfiles[yourSlug];
    const enemyProfile = heroProfiles[enemySlug];
    if (!yourProfile) return { error: `Hero "${yourSlug}" not found in profiles` };
    if (!enemyProfile) return { error: `Enemy "${enemySlug}" not found in profiles` };

    // ── Role Resolution ──
    const roleInfo = resolveRole(yourSlug, yourRole, heroDataMap);
    const effectiveRole = roleInfo.validRole || yourRole;

    // ── Counter Data Lookup ──
    const counterData = lookupCounterData(yourSlug, enemySlug, effectiveRole, heroDataMap);

    const enemyData = heroDataMap[enemySlug];
    const enemyBuild = getHighestWRBuild(enemyData, null);
    if (!enemyBuild) return { error: `No build data for ${enemyProfile.name}` };

    const buildAnalysis = analyzeBuild(enemyBuild.items, enemyProfile);

    const yourData = heroDataMap[yourSlug];
    const { provenItems, roleData: yourRoleData } = getProvenItems(yourData, effectiveRole);

    const completedItems = itemIndex.getCompletedItems().filter(i => i.data.slotType !== 'CREST');
    const crests = itemIndex.getCompletedItems().filter(i => i.data.slotType === 'CREST');

    // Build 3-item counter path with family diversity
    const path = [];
    const usedSlugs = new Set();
    const coveredTags = new Set();
    const usedFamilies = new Set();

    for (let slot = 0; slot < 3; slot++) {
      const scored = completedItems
        .filter(i => !usedSlugs.has(i.slug))
        .map(i => ({ item: i, score: scoreForPath(i, yourProfile, buildAnalysis, provenItems, coveredTags, usedFamilies) }))
        .sort((a, b) => b.score - a.score);

      let pick = scored[0];
      if (buildAnalysis.hasSustain && slot <= 2 && !path.some(p => p.item.tags.includes('anti_heal'))) {
        const ahPick = scored.find(s => s.item.tags.includes('anti_heal') && s.score > 0);
        if (ahPick) pick = ahPick;
      }
      if (pick) {
        path.push(pick);
        usedSlugs.add(pick.item.slug);
        const fam = getItemFamily(pick.item.data.displayName);
        if (fam) usedFamilies.add(fam);
        for (const tag of pick.item.tags) {
          if (['anti_heal', 'tenacity', 'shield'].includes(tag)) coveredTags.add(tag);
        }
      }
    }

    // Score crests
    const crestScored = crests.map(c => {
      let score = 0;
      if (yourProfile.damageType === 'physical' && c.statCategories.includes('offense_physical')) score += 15;
      if (yourProfile.damageType === 'magical' && c.statCategories.includes('offense_magical')) score += 15;
      if (buildAnalysis.hasSustain && c.tags.includes('anti_heal')) score += 20;
      const provenCrest = yourRoleData?.crests?.find(cr => cr.name === c.data.displayName);
      if (provenCrest) { score += 10; if (parseWinRate(provenCrest.winRate) > 55) score += 10; }
      for (const syn of (yourProfile.synergies || [])) {
        if (c.tags.includes(syn.tag) || c.statCategories.includes(syn.tag)) score += 8;
      }
      return { crest: c, score };
    }).sort((a, b) => b.score - a.score);

    // Enemy augment warnings
    const enemyAugmentNotes = [];
    if (enemyBuild.augments?.length) {
      const topAug = [...enemyBuild.augments].sort((a, b) => parseWinRate(b.winRate) - parseWinRate(a.winRate))[0];
      if (topAug && parseWinRate(topAug.winRate) > 55) {
        enemyAugmentNotes.push({ name: topAug.name, winRate: topAug.winRate, matches: topAug.matches, note: `Enemy likely runs ${topAug.name} (${topAug.winRate} WR)` });
      }
    }

    // Build reasoning
    const reasoning = path.map(p => {
      const reasons = [];
      if (p.item.statCategories.includes('offense_physical') || p.item.statCategories.includes('offense_magical')) reasons.push(`powers your ${yourProfile.damageType} damage`);
      if (p.item.tags.includes('anti_heal') && buildAnalysis.hasSustain) reasons.push(`shuts down ${enemyProfile.name}'s sustain`);
      if (p.item.tags.includes('pen') && buildAnalysis.threatProfile.includes('hard to kill')) reasons.push(`cuts through their tankiness`);
      if (p.item.statCategories.includes('defense_physical') && buildAnalysis.primaryDamageType === 'physical') reasons.push(`armor vs their physical damage`);
      if (p.item.statCategories.includes('defense_magical') && buildAnalysis.primaryDamageType === 'magical') reasons.push(`MR vs their magic damage`);
      const proven = provenItems.get(p.item.data.displayName);
      if (proven && proven.avgWR > 55) reasons.push(`proven on ${yourProfile.name} (${proven.avgWR.toFixed(1)}% avg WR)`);
      return { item: p.item.data.displayName, score: p.score, reasons: reasons.length ? reasons : ['strong overall synergy with your kit'] };
    });

    // Also consider — with family diversity
    const alsoConsiderFamilies = new Set(usedFamilies);
    const alsoConsider = completedItems
      .filter(i => !usedSlugs.has(i.slug))
      .map(i => {
        let s = 0;
        if (yourProfile.damageType === 'physical' && i.statCategories.includes('offense_physical')) s += 15;
        if (yourProfile.damageType === 'magical' && i.statCategories.includes('offense_magical')) s += 15;
        if (yourProfile.damageType === 'physical' && i.statCategories.includes('offense_magical') && !i.statCategories.includes('offense_physical')) s -= 30;
        if (yourProfile.damageType === 'magical' && i.statCategories.includes('offense_physical') && !i.statCategories.includes('offense_magical')) s -= 30;
        if (buildAnalysis.hasSustain && i.tags.includes('anti_heal')) s += 20;
        if (buildAnalysis.primaryDamageType === 'physical' && i.statCategories.includes('defense_physical')) s += 10;
        if (buildAnalysis.primaryDamageType === 'magical' && i.statCategories.includes('defense_magical')) s += 10;
        if (buildAnalysis.threatProfile.includes('hard to kill') && i.tags.includes('pen')) s += 12;
        const proven = provenItems.get(i.data.displayName);
        if (proven) s += 8;
        for (const syn of (yourProfile.synergies || [])) {
          if (i.tags.includes(syn.tag) || i.statCategories.includes(syn.tag)) s += 10;
        }
        // Family diversity penalty
        const fam = getItemFamily(i.data.displayName);
        if (fam && alsoConsiderFamilies.has(fam)) s -= 35;
        return { item: i, score: s };
      })
      .filter(i => i.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(r => ({ item: r.item.data.displayName, slug: r.item.slug, swapWhen: _itemSwapReason(r.item, yourProfile, buildAnalysis, enemyProfile) }));

    const altCrests = crestScored.slice(1, 3).map(c => ({ crest: c.crest.data.displayName, swapWhen: _crestSwapReason(c.crest, yourProfile, buildAnalysis) }));

    // ── Aggressive Build (highest WR build for YOUR hero, regardless of matchup) ──
    const yourBuild = getHighestWRBuild(yourData, effectiveRole);
    const aggressiveBuild = yourBuild ? {
      name: yourBuild.name,
      coreItems: yourBuild.items,
      winRate: yourBuild.winRate + '%',
      matches: yourBuild.matches,
    } : null;

    // Fill aggressive build to 6 items using slot data
    if (aggressiveBuild && yourRoleData?.itemSlots) {
      aggressiveBuild.fullItems = _fillFullBuild(aggressiveBuild.coreItems, yourRoleData.itemSlots);
    } else if (aggressiveBuild) {
      aggressiveBuild.fullItems = aggressiveBuild.coreItems;
    }

    // ── Meta Build (baseline — same as aggressive, used for diff) ──
    const metaBuild = aggressiveBuild ? {
      name: aggressiveBuild.name,
      items: aggressiveBuild.fullItems || aggressiveBuild.coreItems,
      winRate: aggressiveBuild.winRate,
      matches: aggressiveBuild.matches,
    } : null;

    // ── Fill counter build to 6 items ──
    const counterCoreItems = path.map(p => p.item.data.displayName);
    const counterFullItems = yourRoleData?.itemSlots
      ? _fillFullBuild(counterCoreItems, yourRoleData.itemSlots, buildAnalysis, yourProfile)
      : counterCoreItems;

    // ── Meta diff: what changed and why ──
    const metaDiff = metaBuild ? _generateMetaDiff(metaBuild.items, counterFullItems, buildAnalysis, enemyProfile) : null;

    return {
      yourHero: { name: yourProfile.name, slug: yourSlug, role: effectiveRole, damageType: yourProfile.damageType },
      roleInfo,
      counterData,
      vsEnemy: { name: enemyProfile.name, slug: enemySlug, metaBuild: { name: enemyBuild.name, items: enemyBuild.items, winRate: enemyBuild.winRate + '%', matches: enemyBuild.matches } },
      aggressiveBuild: aggressiveBuild ? {
        name: aggressiveBuild.name,
        items: aggressiveBuild.fullItems || aggressiveBuild.coreItems,
        coreItems: aggressiveBuild.coreItems,
        winRate: aggressiveBuild.winRate,
        matches: aggressiveBuild.matches,
        label: '🗡️ Aggressive — highest WR build, use when winning',
      } : null,
      counterBuild: {
        name: _generateBuildName(path.map(p => p.item), yourProfile, buildAnalysis),
        items: counterFullItems,
        coreItems: counterCoreItems,
        crest: crestScored[0]?.crest.data.displayName || 'N/A',
        augment: _pickAugment(yourRoleData, buildAnalysis, yourProfile),
        path: reasoning,
        label: '🛡️ Counter — matchup-specific, use against this enemy',
      },
      metaBuild,
      metaDiff,
      alsoConsider,
      altCrests,
      enemyAugmentWarnings: enemyAugmentNotes,
      enemyBuildAnalysis: { threats: buildAnalysis.threatProfile, weaknesses: buildAnalysis.weaknesses, hasSustain: buildAnalysis.hasSustain, hasCrit: buildAnalysis.hasCrit, hasOnHit: buildAnalysis.hasOnHit },
      tips: generateMatchupTips(buildAnalysis, yourProfile, enemyProfile),
    };
  }

  /**
   * Duo lane counter build.
   * allies = [{ slug, role }, { slug, role }]
   * enemySlugs = [slug1, slug2?]
   * heroDataMap = { slug: heroJsonData, ... }
   */
  function duoCounterBuild(allies, enemySlugs, heroDataMap) {
    const supportClasses = ['SUPPORT', 'WARDEN', 'TANK', 'ENCHANTER', 'CATCHER'];

    const allyProfiles = allies.map(a => ({ ...a, profile: heroProfiles[a.slug] }));
    if (allyProfiles.some(a => !a.profile)) return { error: `Hero not found: ${allyProfiles.filter(a => !a.profile).map(a => a.slug).join(', ')}` };

    // Analyze enemies
    const enemyAnalyses = enemySlugs.filter(Boolean).map(slug => {
      const profile = heroProfiles[slug];
      if (!profile) return null;
      const data = heroDataMap[slug];
      const build = getHighestWRBuild(data, null);
      if (!build) return null;
      return { slug, profile, build, analysis: analyzeBuild(build.items, profile) };
    }).filter(Boolean);

    const laneThreats = {
      hasSustain: enemyAnalyses.some(e => e.analysis.hasSustain),
      hasCrit: enemyAnalyses.some(e => e.analysis.hasCrit),
      hasOnHit: enemyAnalyses.some(e => e.analysis.hasOnHit),
      hasPen: enemyAnalyses.some(e => e.analysis.hasPen),
      primaryPhysical: enemyAnalyses.some(e => e.analysis.primaryDamageType === 'physical'),
      primaryMagical: enemyAnalyses.some(e => e.analysis.primaryDamageType === 'magical'),
      threats: [...new Set(enemyAnalyses.flatMap(e => e.analysis.threatProfile))],
      weaknesses: [...new Set(enemyAnalyses.flatMap(e => e.analysis.weaknesses))],
    };

    // Role assignment
    const roleAssignment = allyProfiles.map(a => {
      const classes = a.profile.classes || [];
      const isSupport = a.role === 'support' || classes.some(c => supportClasses.includes(c.toUpperCase()));
      return { ...a, isSupport, isCarry: !isSupport };
    });

    // Anti-heal assignment
    let antiHealAssigned = null;
    if (laneThreats.hasSustain) {
      const supportAlly = roleAssignment.find(a => a.isSupport);
      const carryAlly = roleAssignment.find(a => a.isCarry);
      const ahItems = itemIndex.findByTag('anti_heal').filter(i => i.data.rarity === 'EPIC' || i.data.rarity === 'LEGENDARY');
      const supportAH = supportAlly && ahItems.find(i => {
        if (supportAlly.profile.damageType === 'physical') return i.statCategories.includes('offense_physical') || i.statCategories.includes('defense');
        if (supportAlly.profile.damageType === 'magical') return i.statCategories.includes('offense_magical') || i.statCategories.includes('defense');
        return i.statCategories.includes('defense');
      });
      antiHealAssigned = (supportAH && supportAlly) ? supportAlly.slug : (carryAlly?.slug || null);
    }

    const duoCoveredEffects = new Set();
    const duoUsedSlugs = new Set();
    const builds = [];

    for (const ally of roleAssignment) {
      const yourProfile = ally.profile;
      const yourData = heroDataMap[ally.slug];
      const { provenItems, roleData: yourRoleData } = getProvenItems(yourData, ally.role);

      const completedItems = itemIndex.getCompletedItems().filter(i => i.data.slotType !== 'CREST');
      const crests = itemIndex.getCompletedItems().filter(i => i.data.slotType === 'CREST');

      function scoreDuo(item) {
        let score = 0;
        if (yourProfile.damageType === 'physical' && item.statCategories.includes('offense_physical')) score += 20;
        if (yourProfile.damageType === 'magical' && item.statCategories.includes('offense_magical')) score += 20;
        if (yourProfile.damageType === 'physical' && item.statCategories.includes('offense_magical') && !item.statCategories.includes('offense_physical')) score -= 30;
        if (yourProfile.damageType === 'magical' && item.statCategories.includes('offense_physical') && !item.statCategories.includes('offense_magical')) score -= 30;
        for (const syn of (yourProfile.synergies || [])) {
          if (item.tags.includes(syn.tag) || item.statCategories.includes(syn.tag)) score += 15;
        }
        if (yourProfile.hasASSteroid && item.tags.includes('attack_speed')) score -= 5;
        if (laneThreats.hasCrit && item.statCategories.includes('defense_physical')) score += 12;
        if (laneThreats.primaryPhysical && item.statCategories.includes('defense_physical')) score += 10;
        if (laneThreats.primaryMagical && item.statCategories.includes('defense_magical')) score += 10;
        if (laneThreats.threats.includes('hard to kill') && item.tags.includes('pen')) score += 12;
        if (laneThreats.threats.includes('on-hit DPS') && item.statCategories.includes('defense')) score += 6;
        if (laneThreats.hasSustain && item.tags.includes('anti_heal')) {
          score += antiHealAssigned === ally.slug ? 35 : -20;
        }
        if (ally.isSupport) {
          if (item.statCategories.includes('defense') || item.statCategories.includes('defense_physical') || item.statCategories.includes('defense_magical')) score += 10;
          if (item.tags.includes('shield') || item.tags.includes('aura')) score += 12;
          if (item.statCategories.includes('support')) score += 15;
        }
        if (ally.isCarry) {
          if (item.statCategories.includes('offense_physical') || item.statCategories.includes('offense_magical')) score += 8;
          if (item.statCategories.includes('defense') && !item.statCategories.includes('offense_physical') && !item.statCategories.includes('offense_magical')) score -= 5;
        }
        const proven = provenItems.get(item.data.displayName);
        if (proven) { score += 10; if (proven.avgWR > 55) score += 10; if (proven.appearances >= 2) score += 5; }
        if (item.goldEfficiency?.efficiency > 100) score += 5;
        if (item.data.rarity === 'LEGENDARY') score += 3;
        if (duoUsedSlugs.has(item.slug)) score -= 40;
        for (const tag of item.tags) {
          if (duoCoveredEffects.has(tag) && ['anti_heal', 'tenacity', 'aura'].includes(tag)) score -= 20;
        }
        return score;
      }

      const path = [];
      const localUsed = new Set();
      const localCovered = new Set();

      for (let slot = 0; slot < 3; slot++) {
        const scored = completedItems
          .filter(i => !localUsed.has(i.slug) && !duoUsedSlugs.has(i.slug))
          .map(i => {
            let s = scoreDuo(i);
            for (const tag of i.tags) {
              if (localCovered.has(tag) && ['anti_heal', 'tenacity', 'shield'].includes(tag)) s -= 25;
            }
            return { item: i, score: s };
          })
          .sort((a, b) => b.score - a.score);

        let pick = scored[0];
        if (antiHealAssigned === ally.slug && laneThreats.hasSustain && !path.some(p => p.item.tags.includes('anti_heal'))) {
          const ahPick = scored.find(s => s.item.tags.includes('anti_heal') && s.score > -10);
          if (ahPick) pick = ahPick;
        }
        if (pick) {
          path.push(pick);
          localUsed.add(pick.item.slug);
          duoUsedSlugs.add(pick.item.slug);
          for (const tag of pick.item.tags) {
            if (['anti_heal', 'tenacity', 'shield', 'aura'].includes(tag)) { localCovered.add(tag); duoCoveredEffects.add(tag); }
          }
        }
      }

      const crestScored = crests.filter(c => !duoUsedSlugs.has(c.slug)).map(c => {
        let score = 0;
        if (yourProfile.damageType === 'physical' && c.statCategories.includes('offense_physical')) score += 15;
        if (yourProfile.damageType === 'magical' && c.statCategories.includes('offense_magical')) score += 15;
        if (ally.isSupport && (c.tags.includes('shield') || c.tags.includes('aura') || c.statCategories.includes('support'))) score += 15;
        const provenCrest = yourRoleData?.crests?.find(cr => cr.name === c.data.displayName);
        if (provenCrest) { score += 10; if (parseWinRate(provenCrest.winRate) > 55) score += 10; }
        for (const syn of (yourProfile.synergies || [])) {
          if (c.tags.includes(syn.tag) || c.statCategories.includes(syn.tag)) score += 8;
        }
        return { crest: c, score };
      }).sort((a, b) => b.score - a.score);

      const bestCrest = crestScored[0]?.crest;
      if (bestCrest) duoUsedSlugs.add(bestCrest.slug);

      const reasoning = path.map(p => {
        const reasons = [];
        if (p.item.statCategories.includes('offense_physical') || p.item.statCategories.includes('offense_magical')) reasons.push(`powers your ${yourProfile.damageType} damage`);
        if (p.item.tags.includes('anti_heal') && laneThreats.hasSustain) reasons.push(`you're the anti-heal carrier`);
        if (p.item.statCategories.includes('defense_physical') && laneThreats.primaryPhysical) reasons.push(`armor vs enemy physical`);
        if (p.item.statCategories.includes('defense_magical') && laneThreats.primaryMagical) reasons.push(`MR vs enemy magic`);
        if (p.item.tags.includes('pen')) reasons.push(`penetration`);
        if (p.item.tags.includes('shield') || p.item.tags.includes('aura')) reasons.push(`team utility`);
        const proven = provenItems.get(p.item.data.displayName);
        if (proven && proven.avgWR > 55) reasons.push(`proven on ${yourProfile.name}`);
        return { item: p.item.data.displayName, score: p.score, reasons: reasons.length ? reasons : ['strong synergy'] };
      });

      const alsoConsider = completedItems
        .filter(i => !localUsed.has(i.slug) && !duoUsedSlugs.has(i.slug))
        .map(i => {
          let s = scoreDuo(i);
          for (const tag of i.tags) { if (localCovered.has(tag) && ['anti_heal', 'tenacity', 'shield'].includes(tag)) s -= 25; }
          return { item: i, score: s };
        })
        .filter(i => i.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(r => ({ item: r.item.data.displayName, slug: r.item.slug, swapWhen: _itemSwapReasonDuo(r.item, yourProfile, laneThreats, ally.isSupport) }));

      const altCrests = crestScored.slice(1, 3).map(c => ({ crest: c.crest.data.displayName, swapWhen: _crestSwapReason(c.crest, yourProfile, { primaryDamageType: laneThreats.primaryPhysical ? 'physical' : 'magical', threatProfile: laneThreats.threats }) }));
      const nameAnalysis = { primaryDamageType: laneThreats.primaryPhysical ? 'physical' : 'magical', threatProfile: laneThreats.threats };

      builds.push({
        hero: { name: yourProfile.name, slug: ally.slug, role: ally.role, damageType: yourProfile.damageType },
        isSupport: ally.isSupport,
        build: {
          name: _generateBuildName(path.map(p => p.item), yourProfile, nameAnalysis),
          items: path.map(p => p.item.data.displayName),
          crest: bestCrest?.data.displayName || 'N/A',
          augment: _pickAugment(yourRoleData, enemyAnalyses[0]?.analysis || null, yourProfile),
          path: reasoning,
        },
        alsoConsider,
        altCrests,
        responsibility: ally.isSupport
          ? (antiHealAssigned === ally.slug ? 'Anti-heal carrier + peel + CC' : 'Peel + CC + frontline')
          : (antiHealAssigned === ally.slug ? 'Primary damage + anti-heal' : 'Primary damage dealer'),
      });
    }

    // Synergy notes
    const synergyNotes = [];
    const dmgTypes = new Set(allyProfiles.map(a => a.profile.damageType));
    if (dmgTypes.has('physical') && dmgTypes.has('magical')) synergyNotes.push('🎯 Mixed damage lane — enemy can\'t stack one resist type');
    else if (dmgTypes.size === 1) synergyNotes.push(`⚠️ Same damage type (${[...dmgTypes][0]}) — enemy can stack one resist`);
    const hasCC = allyProfiles.some(a => a.profile.playstyle?.includes('cc_heavy'));
    const hasBurst = allyProfiles.some(a => a.profile.playstyle?.includes('burst'));
    if (hasCC && hasBurst) synergyNotes.push('💥 CC + burst synergy — CC into burst combo');
    if (hasCC && laneThreats.weaknesses.includes('dies_to_cc')) synergyNotes.push('🔒 Enemy has no tenacity — your CC advantage is huge');
    if (antiHealAssigned) {
      const carrier = builds.find(b => b.hero.slug === antiHealAssigned);
      const other = builds.find(b => b.hero.slug !== antiHealAssigned);
      if (carrier && other) synergyNotes.push(`🩸 Anti-heal on ${carrier.hero.name} — ${other.hero.name} can focus on core build`);
    }

    const enemyBreakdown = enemyAnalyses.map(e => ({
      hero: e.profile.name, metaBuild: { name: e.build.name, items: e.build.items, winRate: e.build.winRate + '%', matches: e.build.matches },
      threats: e.analysis.threatProfile, weaknesses: e.analysis.weaknesses,
    }));

    const augWarnings = [];
    for (const e of enemyAnalyses) {
      if (e.build.augments?.length) {
        const top = [...e.build.augments].sort((a, b) => parseWinRate(b.winRate) - parseWinRate(a.winRate))[0];
        if (top && parseWinRate(top.winRate) > 55) augWarnings.push({ hero: e.profile.name, augment: top.name, winRate: top.winRate, matches: top.matches });
      }
    }

    return {
      allies: builds,
      enemies: enemyBreakdown,
      laneThreats,
      synergyNotes,
      augmentWarnings: augWarnings,
      tips: generateDuoTips(laneThreats, allyProfiles, enemyAnalyses),
    };
  }

  /**
   * General counter analysis — "How to counter this hero?" without needing to pick your own hero.
   * Shows enemy build variants, what each does, and a suggested counter build route for each.
   */
  function counterHeroAnalysis(enemySlug, heroDataMap) {
    const enemyProfile = heroProfiles[enemySlug];
    if (!enemyProfile) return { error: `Hero "${enemySlug}" not found` };

    const enemyData = heroDataMap[enemySlug];
    if (!enemyData?.roles) return { error: `No build data for ${enemyProfile.name}` };

    // Collect all build variants across roles (deduplicate by item set)
    const allBuilds = [];
    const seenItemSets = new Set();
    for (const [role, rd] of Object.entries(enemyData.roles)) {
      for (const build of (rd.buildTabs || [])) {
        const wr = parseWinRate(build.winRate);
        const matches = parseMatchCount(build.matches);
        if (matches < 2) continue;
        const itemKey = build.items.sort().join('|');
        if (seenItemSets.has(itemKey)) continue;
        seenItemSets.add(itemKey);
        allBuilds.push({ role, name: build.name, items: build.items, winRate: wr, matches, augments: rd.augments || [] });
      }
    }

    // Sort by WR (confidence-gated: 30+ matches first, then rest)
    allBuilds.sort((a, b) => {
      const aConf = a.matches >= 30 ? 1 : 0;
      const bConf = b.matches >= 30 ? 1 : 0;
      if (aConf !== bConf) return bConf - aConf;
      return b.winRate - a.winRate;
    });
    const topBuilds = allBuilds.slice(0, 2);

    if (!topBuilds.length) return { error: `No build data for ${enemyProfile.name}` };

    // For each build variant, analyze and generate a general counter route
    const variants = topBuilds.map(build => {
      const analysis = analyzeBuild(build.items, enemyProfile);

      // Generate a general counter build (not tied to specific hero)
      // Pick items that counter this build's profile, for both physical AND magical heroes
      const counterRoutes = [];

      // Physical counter route
      const physRoute = _generateGeneralCounterRoute('physical', analysis);
      if (physRoute.length) counterRoutes.push({ label: 'If you deal physical damage', damageType: 'physical', items: physRoute });

      // Magical counter route
      const magRoute = _generateGeneralCounterRoute('magical', analysis);
      if (magRoute.length) counterRoutes.push({ label: 'If you deal magical damage', damageType: 'magical', items: magRoute });

      // What to watch out for
      const dangers = [];
      if (analysis.hasSustain) dangers.push('Heals a lot — buy anti-heal or you lose trades');
      if (analysis.hasCrit) dangers.push('Builds crit — armor with anti-crit passives shuts them down');
      if (analysis.hasOnHit) dangers.push('On-hit damage — they scale with attack speed, avoid long fights');
      if (analysis.hasPen) dangers.push('Has penetration — stacking one resist type won\'t save you, buy HP too');
      if (analysis.totalHealth > 400 || analysis.totalArmor > 40) dangers.push('They\'re tanky — you\'ll need penetration to deal real damage');
      if (analysis.totalArmor < 20 && analysis.totalMagicResist < 20 && analysis.totalHealth < 300) dangers.push('Squishy — burst them before they can fight back');

      // What you can exploit
      const exploits = [];
      if (analysis.weaknesses.includes('no_defenses')) exploits.push('No defensive stats — burst and all-ins work great');
      if (analysis.weaknesses.includes('dies_to_cc')) exploits.push('No tenacity — stuns and roots = guaranteed kills');
      if (analysis.weaknesses.includes('cant_cut_your_healing')) exploits.push('They can\'t reduce your healing — sustain is extra effective');
      if (analysis.weaknesses.includes('healing_is_counterable')) exploits.push('Their healing is their lifeline — anti-heal guts their entire gameplan');
      if (analysis.weaknesses.includes('relies_on_crit')) exploits.push('Crit-reliant — armor items are gold-efficient counters');

      return {
        build: { name: build.name, role: build.role, items: build.items, winRate: build.winRate + '%', matches: build.matches },
        dangers,
        exploits,
        counterRoutes,
      };
    });

    // Augment warnings (across all roles)
    const augWarnings = [];
    const seenAugs = new Set();
    for (const build of allBuilds) {
      for (const aug of (build.augments || [])) {
        if (seenAugs.has(aug.name)) continue;
        seenAugs.add(aug.name);
        if (parseWinRate(aug.winRate) > 55) {
          augWarnings.push({ name: (aug.name || '').trim(), winRate: aug.winRate, matches: aug.matches });
        }
      }
    }
    augWarnings.sort((a, b) => parseWinRate(b.winRate) - parseWinRate(a.winRate));

    return {
      enemy: {
        name: enemyProfile.name,
        slug: enemySlug,
        damageType: enemyProfile.damageType,
        classes: enemyProfile.classes || [],
      },
      variants,
      augmentWarnings: augWarnings.slice(0, 3),
    };
  }

  /**
   * Generate a general 3-item counter route for a given damage type vs an enemy build analysis.
   */
  function _generateGeneralCounterRoute(damageType, buildAnalysis) {
    const completedItems = itemIndex.getCompletedItems().filter(i => i.data.slotType !== 'CREST');
    const items = [];
    const usedSlugs = new Set();
    const coveredTags = new Set();
    const usedFams = new Set();

    for (let slot = 0; slot < 3; slot++) {
      const scored = completedItems
        .filter(i => !usedSlugs.has(i.slug))
        .map(i => {
          let score = 0;

          if (damageType === 'physical' && i.statCategories.includes('offense_physical')) score += 20;
          if (damageType === 'magical' && i.statCategories.includes('offense_magical')) score += 20;
          if (damageType === 'physical' && i.statCategories.includes('offense_magical') && !i.statCategories.includes('offense_physical')) score -= 30;
          if (damageType === 'magical' && i.statCategories.includes('offense_physical') && !i.statCategories.includes('offense_magical')) score -= 30;

          if (buildAnalysis.hasSustain && i.tags.includes('anti_heal')) score += 30;
          if (buildAnalysis.primaryDamageType === 'physical' && i.statCategories.includes('defense_physical')) score += 12;
          if (buildAnalysis.primaryDamageType === 'magical' && i.statCategories.includes('defense_magical')) score += 12;
          if (buildAnalysis.hasCrit && i.statCategories.includes('defense_physical')) score += 10;
          if (buildAnalysis.threatProfile.includes('hard to kill') && i.tags.includes('pen')) score += 15;

          if (i.goldEfficiency?.efficiency > 100) score += 5;
          if (i.data.rarity === 'LEGENDARY') score += 3;

          for (const tag of i.tags) {
            if (coveredTags.has(tag) && ['anti_heal', 'tenacity', 'shield'].includes(tag)) score -= 25;
          }
          // Family diversity
          const fam = getItemFamily(i.data.displayName);
          if (fam && usedFams.has(fam)) score -= 40;

          return { item: i, score };
        })
        .sort((a, b) => b.score - a.score);

      let pick = scored[0];

      if (buildAnalysis.hasSustain && !items.some(i => i.tags.includes('anti_heal'))) {
        const ahPick = scored.find(s => s.item.tags.includes('anti_heal') && s.score > 0);
        if (ahPick) pick = ahPick;
      }

      if (pick && pick.score > -10) {
        items.push(pick.item);
        usedSlugs.add(pick.item.slug);
        const fam = getItemFamily(pick.item.data.displayName);
        if (fam) usedFams.add(fam);
        for (const tag of pick.item.tags) {
          if (['anti_heal', 'tenacity', 'shield'].includes(tag)) coveredTags.add(tag);
        }
      }
    }

    return items.map(i => {
      const reasons = [];
      if (i.statCategories.includes('offense_physical') || i.statCategories.includes('offense_magical')) reasons.push('damage');
      if (i.tags.includes('anti_heal')) reasons.push('cuts their healing');
      if (i.statCategories.includes('defense_physical')) reasons.push('armor');
      if (i.statCategories.includes('defense_magical')) reasons.push('magic resist');
      if (i.tags.includes('pen')) reasons.push('penetration');
      return { name: i.data.displayName, why: reasons.join(' + ') || 'strong stats' };
    });
  }

  /**
   * Fill a 3-item core build to 6 items using scraped itemSlots data.
   * Picks best 4th/5th/6th items by WR * log(matches), avoiding duplicates and enforcing family diversity.
   */
  function _fillFullBuild(coreItems, itemSlots, buildAnalysis, yourProfile) {
    const full = [...coreItems];
    const used = new Set(coreItems.map(n => n.toLowerCase()));
    const usedFamilies = new Set();
    for (const name of coreItems) {
      const fam = getItemFamily(name);
      if (fam) usedFamilies.add(fam);
    }

    for (const slotKey of ['4th', '5th', '6th']) {
      const slotItems = itemSlots[slotKey];
      if (!slotItems?.length) continue;

      // Score each candidate
      const scored = slotItems
        .filter(si => !used.has(si.name.toLowerCase()))
        .map(si => {
          const wr = parseWinRate(si.winRate);
          const matches = si.matches || parseMatchCount(si.matches);
          let score = wr * Math.log2(matches + 1);

          // Family diversity
          const fam = getItemFamily(si.name);
          if (fam && usedFamilies.has(fam)) score *= 0.3;

          // Matchup-specific boost if analysis provided
          if (buildAnalysis && yourProfile) {
            const item = itemIndex?.get(si.name);
            if (item) {
              if (buildAnalysis.hasSustain && item.tags.includes('anti_heal') && !full.some(f => {
                const fi = itemIndex?.get(f);
                return fi && fi.tags.includes('anti_heal');
              })) score *= 1.5;
              if (buildAnalysis.primaryDamageType === 'physical' && item.statCategories.includes('defense_physical')) score *= 1.2;
              if (buildAnalysis.primaryDamageType === 'magical' && item.statCategories.includes('defense_magical')) score *= 1.2;
            }
          }

          return { name: si.name, score, wr, matches };
        })
        .sort((a, b) => b.score - a.score);

      if (scored.length) {
        const pick = scored[0];
        full.push(pick.name);
        used.add(pick.name.toLowerCase());
        const fam = getItemFamily(pick.name);
        if (fam) usedFamilies.add(fam);
      }
    }
    return full;
  }

  /**
   * Generate a meta diff showing what changed between meta build and counter build, and why.
   */
  function _generateMetaDiff(metaItems, counterItems, buildAnalysis, enemyProfile) {
    const metaSet = new Set(metaItems.map(i => i.toLowerCase()));
    const counterSet = new Set(counterItems.map(i => i.toLowerCase()));

    const kept = metaItems.filter(i => counterSet.has(i.toLowerCase()));
    const removed = metaItems.filter(i => !counterSet.has(i.toLowerCase()));
    const added = counterItems.filter(i => !metaSet.has(i.toLowerCase()));

    const swaps = [];
    for (let i = 0; i < Math.min(removed.length, added.length); i++) {
      let reason = 'matchup adjustment';
      const addedItem = itemIndex?.get(added[i]);
      if (addedItem) {
        if (addedItem.tags.includes('anti_heal') && buildAnalysis.hasSustain)
          reason = `enemy ${enemyProfile.name} has sustain — need anti-heal`;
        else if (addedItem.statCategories.includes('defense_physical') && buildAnalysis.primaryDamageType === 'physical')
          reason = `enemy deals physical damage — need armor`;
        else if (addedItem.statCategories.includes('defense_magical') && buildAnalysis.primaryDamageType === 'magical')
          reason = `enemy deals magic damage — need MR`;
        else if (addedItem.tags.includes('pen') && buildAnalysis.threatProfile.includes('hard to kill'))
          reason = `enemy is tanky — need penetration`;
      }
      swaps.push({ removed: removed[i], added: added[i], reason });
    }

    return {
      kept,
      swaps,
      removedExtra: removed.slice(added.length),
      addedExtra: added.slice(removed.length),
      identical: removed.length === 0 && added.length === 0,
    };
  }

  return { init, isReady, getProfile, getAugmentDesc, counterBuildPath, duoCounterBuild, counterHeroAnalysis, lookupCounterData, resolveRole, getScrapedCounterBuild };
})();
