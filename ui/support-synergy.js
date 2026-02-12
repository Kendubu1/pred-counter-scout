// support-synergy.js — Support duo synergy analyzer for Predecessor Scout

const SupportSynergy = (() => {
  let heroAbilities = null;
  let heroProfiles = null;

  // GQL uses internal codenames — map to actual display names
  const DISPLAY_NAMES = {
    'Tidebinder': 'Yurei', 'Bright': 'Renna', 'DemonKing': 'Akeron',
    'Fey': 'The Fey', 'GRIMexe': 'GRIM.exe', 'FengMao': 'Feng Mao',
    'LtBelica': 'Lt. Belica', 'Cryptmaker': 'Bayle', 'Lizard': 'Zarus',
    'Swiftpaw': 'Maco', 'Huntress': 'Kira', 'IggyScorch': 'Iggy & Scorch',
    'Wood': 'Mourn', 'Boost': 'Skylar', 'Mech': 'Eden', 'Emerald': 'Argus',
  };
  function displayName(raw) { return DISPLAY_NAMES[raw] || raw; }

  async function load() {
    if (heroAbilities && heroProfiles) return;
    const [aRes, pRes] = await Promise.all([
      fetch('../data/game-data/hero-abilities.json?v=' + Date.now()),
      fetch('../data/game-data/hero-profiles.json?v=' + Date.now()),
    ]);
    heroAbilities = await aRes.json();
    heroProfiles = await pRes.json();
  }

  // ── CC extraction from description + cc array ──
  const CC_PATTERNS = [
    { type: 'stun', re: /stunn?(?:ing|ed|s)?\b.{0,60}?(?:for\s+)?(\d+\.?\d*)\s*s/i, hard: true },
    { type: 'root', re: /root(?:ing|ed|s)?\b.{0,60}?(?:for\s+)?(\d+\.?\d*)\s*s/i, hard: true },
    { type: 'suppress', re: /suppress(?:ing|ed|es)?\b.{0,60}?(?:for\s+)?(\d+\.?\d*)\s*s/i, hard: true },
    { type: 'knockup', re: /knock(?:ing)?\s*(?:them\s+)?(?:all\s+)?(?:enem\w*\s+)?up\b.{0,40}?(?:for\s+)?(\d+\.?\d*)?\s*s?/i, hard: true },
    { type: 'knockup', re: /knock(?:ing)?\s+up\b/i, hard: true, fallbackDur: 0.75 },
    { type: 'silence', re: /silenc(?:ing|ed|es?)?\b.{0,60}?(?:for\s+)?(\d+\.?\d*)\s*s/i, hard: false },
    { type: 'pull', re: /pull(?:ing|s|ed)?\s+(?:all\s+)?(?:them|targets?|enem)/i, hard: true },
    { type: 'fear', re: /fear(?:ing|ed|s)?\b.{0,60}?(?:for\s+)?(\d+\.?\d*)\s*s/i, hard: true },
    { type: 'slow', re: /slow(?:ing|ed|s)?\b.{0,60}?(?:by\s+)?(\d+)%\s*(?:for\s+)?(\d+\.?\d*)?\s*s?/i, hard: false },
    { type: 'knockback', re: /knock(?:ing)?\s*(?:them\s+)?back/i, hard: true },
    { type: 'stun', re: /stunn?(?:ing|ed|s)?\s+instead/i, hard: true, fallbackDur: 1.0 },
  ];

  function extractCC(ability) {
    const results = [];
    // Use existing cc array first
    if (ability.cc?.length) {
      for (const cc of ability.cc) {
        const isHard = ['stun', 'root', 'suppress', 'knockup', 'fear', 'pull', 'knockback'].includes(cc.type);
        // cc.value for slows is the percentage (e.g. 35 = 35%), not duration — use 1s default for slows
        const dur = (cc.type === 'slow' && cc.value > 10) ? 1.0 : (cc.value || 0.5);
        results.push({ type: cc.type, duration: dur, hard: isHard });
      }
    }
    // Parse from description
    const desc = ability.description || '';
    for (const pat of CC_PATTERNS) {
      if (results.some(r => r.type === pat.type)) continue;
      const m = desc.match(pat.re);
      if (m) {
        const dur = pat.fallbackDur || (pat.type === 'slow' ? parseFloat(m[2] || '1') : parseFloat(m[1] || '0.75'));
        results.push({ type: pat.type, duration: dur || 0.5, hard: pat.hard });
      }
    }
    return results;
  }

  // ── Ability trait extraction ──
  function getAbilityTraits(ability) {
    const desc = (ability.description || '').toLowerCase();
    const traits = [];
    if (/shield/.test(desc)) traits.push('shield');
    if (/\bheal(?!th)(?!ing.*reduc)/i.test(desc) || /\brestore.*\bhealth\b/.test(desc) || /\bregen.*\bhealth\b/.test(desc)) traits.push('heal');
    if (/movement speed/.test(desc) || /haste/.test(desc) || /speed boost/.test(desc)) traits.push('speed_boost');
    if (/damage reduc/.test(desc) || /armor/.test(desc)) traits.push('damage_reduction');
    if (/area|aoe|nearby enem|all enem/i.test(desc)) traits.push('aoe');
    if (/dash|charge|leap|teleport|blink/i.test(desc)) traits.push('mobility');
    return traits;
  }

  function getHeroKit(slug) {
    const hero = heroAbilities?.[slug];
    if (!hero) return null;
    const abilities = hero.abilities || [];
    const active = abilities.filter(a => a.key !== 'BASIC');
    // Include passives for trait detection (heal/shield) but not CC scoring

    let totalHardCC = 0, totalSoftCC = 0, ccAbilities = [];
    let hasHeal = false, hasShield = false, hasAoE = false, hasMobility = false;
    let totalBurstDmg = 0;

    for (const a of active) {
      const cc = extractCC(a);
      const traits = getAbilityTraits(a);
      const hardCC = cc.filter(c => c.hard);
      const softCC = cc.filter(c => !c.hard);
      totalHardCC += hardCC.reduce((s, c) => s + c.duration, 0);
      totalSoftCC += softCC.reduce((s, c) => s + c.duration, 0);
      if (cc.length) ccAbilities.push({ name: a.name, key: a.key, cc, cooldown: a.cooldowns?.[2] || a.cooldowns?.[0] || 0 });
      if (traits.includes('heal')) hasHeal = true;
      if (traits.includes('shield')) hasShield = true;
      if (traits.includes('aoe')) hasAoE = true;
      if (traits.includes('mobility')) hasMobility = true;

      const dmg = a.damage?.[0]?.values?.[2] ?? a.damage?.[0]?.values?.[0] ?? 0;
      totalBurstDmg += dmg;
    }

    return {
      slug, name: displayName(hero.name), abilities: active,
      totalHardCC, totalSoftCC, ccAbilities,
      hasHeal, hasShield, hasAoE, hasMobility, totalBurstDmg,
    };
  }

  function getRole(slug) {
    if (!heroProfiles) return [];
    for (const p of heroProfiles) {
      if (p.slug === slug) return (p.roles || []).map(r => r.toUpperCase());
    }
    return [];
  }

  function isSupport(slug) { return getRole(slug).includes('SUPPORT'); }
  function isCarry(slug) { return getRole(slug).includes('CARRY'); }
  function isOfflaner(slug) { return getRole(slug).includes('OFFLANE'); }

  // ── Synergy scoring ──
  function scoreSynergy(supportKit, partnerKit) {
    let score = 0;
    const reasons = [];
    const combos = [];

    // 0. Base lane synergy — every support/carry duo has some baseline value
    score += 10;

    // 0.5. Soft CC contributes too (slows, silences help in lane)
    if (supportKit.totalSoftCC > 0) {
      const softScore = Math.min(supportKit.totalSoftCC * 3, 10);
      score += softScore;
      reasons.push(`❄️ Soft CC: ${supportKit.totalSoftCC.toFixed(1)}s of slows/silences`);
    }

    // 1. CC Chain scoring (capped to prevent CC from dominating)
    // Note: don't gate on partnerKit.totalBurstDmg — carries always deal damage via basics
    if (supportKit.totalHardCC > 0) {
      const ccChainScore = Math.min(supportKit.totalHardCC * 10, 30);
      score += ccChainScore;
      for (const ccAb of supportKit.ccAbilities) {
        const hardCC = ccAb.cc.filter(c => c.hard);
        if (hardCC.length) {
          const dur = hardCC.reduce((s, c) => s + c.duration, 0);
          // Find partner's highest damage ability
          const partnerDmg = [...partnerKit.abilities].sort((a, b) =>
            (b.damage?.[0]?.values?.[2] ?? 0) - (a.damage?.[0]?.values?.[2] ?? 0)
          )[0];
          if (partnerDmg) {
            combos.push({
              type: 'cc_chain',
              text: `${supportKit.name} ${ccAb.name} (${hardCC.map(c => c.type).join('+')}) → ${partnerKit.name} ${partnerDmg.name} during ${dur.toFixed(2)}s window`,
              value: dur,
            });
          }
        }
      }
      reasons.push(`⛓️ CC chain: ${supportKit.totalHardCC.toFixed(1)}s hard CC for ${partnerKit.name} to follow up`);
    }

    // Partner also has CC → extended chain (capped)
    if (supportKit.totalHardCC > 0 && partnerKit.totalHardCC > 0) {
      const chainBonus = Math.min((supportKit.totalHardCC + partnerKit.totalHardCC) * 5, 25);
      score += chainBonus;
      reasons.push(`🔗 Combined CC: ${(supportKit.totalHardCC + partnerKit.totalHardCC).toFixed(1)}s total lockdown`);
    }

    // 2. Peel combos
    if ((supportKit.hasShield || supportKit.hasHeal) && !partnerKit.hasMobility) {
      score += 20;
      reasons.push(`🛡️ Peel: ${supportKit.name} protects immobile ${partnerKit.name}`);
    }
    if (supportKit.hasShield && supportKit.hasHeal) {
      score += 15;
      reasons.push(`💚 Double sustain: ${supportKit.name} has both heal and shield`);
    }
    if (supportKit.hasHeal) {
      score += 10;
      reasons.push(`💚 Healer: ${supportKit.name} keeps ${partnerKit.name} healthy in lane`);
    }
    if (supportKit.hasShield) {
      score += 10;
      reasons.push(`🛡️ Shields: ${supportKit.name} absorbs damage for ${partnerKit.name}`);
    }

    // 3. Engage combos
    const supportEngageCC = supportKit.ccAbilities.filter(a =>
      a.cc.some(c => ['pull', 'knockup', 'knockback', 'stun'].includes(c.type))
    );
    if (supportEngageCC.length && partnerKit.hasAoE) {
      score += 15;
      reasons.push(`⚔️ Engage: ${supportKit.name} CC into ${partnerKit.name} AoE damage`);
      for (const eng of supportEngageCC) {
        const aoeAb = partnerKit.abilities.find(a => getAbilityTraits(a).includes('aoe'));
        if (aoeAb) {
          combos.push({
            type: 'engage',
            text: `${supportKit.name} ${eng.name} → ${partnerKit.name} ${aoeAb.name} (AoE on grouped enemies)`,
          });
        }
      }
    }

    // 4. Sustain duo
    if (supportKit.hasHeal && partnerKit.hasHeal) {
      score += 12;
      reasons.push(`💚 Sustain duo: both have healing for extended fights`);
    }

    // 5. Mixed damage bonus
    const supportDmgType = heroAbilities[supportKit.slug]?.abilities?.find(a => a.damage?.[0])?.damage?.[0]?.damageType;
    const partnerDmgType = heroAbilities[partnerKit.slug]?.abilities?.find(a => a.damage?.[0])?.damage?.[0]?.damageType;
    if (supportDmgType && partnerDmgType && supportDmgType !== partnerDmgType) {
      score += 8;
      reasons.push(`🎯 Mixed damage: ${supportDmgType} + ${partnerDmgType}`);
    }

    return { score: Math.round(score), reasons, combos, combinedHardCC: supportKit.totalHardCC + partnerKit.totalHardCC };
  }

  // ── Get top duo partners for a support ──
  function getTopDuos(supportSlug, count = 5) {
    const supportKit = getHeroKit(supportSlug);
    if (!supportKit) return [];

    const candidates = [];
    const allSlugs = Object.keys(heroAbilities);
    for (const slug of allSlugs) {
      if (slug === supportSlug) continue;
      // For lane partners, only show carries (supports lane with carries)
      if (!isCarry(slug)) continue;
      const partnerKit = getHeroKit(slug);
      if (!partnerKit) continue;
      const synergy = scoreSynergy(supportKit, partnerKit);
      candidates.push({
        partner: partnerKit,
        ...synergy,
      });
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, count);
  }

  // ── Analyze synergy between two specific heroes ──
  function analyzeDuo(slug1, slug2) {
    const kit1 = getHeroKit(slug1);
    const kit2 = getHeroKit(slug2);
    if (!kit1 || !kit2) return null;

    const support = isSupport(slug1) ? kit1 : isSupport(slug2) ? kit2 : kit1;
    const partner = support === kit1 ? kit2 : kit1;
    return { support, partner, ...scoreSynergy(support, partner) };
  }

  // ── Rendering ──

  const KEY_COLORS = {
    BASIC: '#888', ALTERNATE: '#4fc3f7', PRIMARY: '#66bb6a', SECONDARY: '#ffa726',
    ULTIMATE: '#ef5350', PASSIVE: '#ab47bc',
  };

  function getTopSupportsFor(carrySlug, count = 5) {
    const carryKit = getHeroKit(carrySlug);
    if (!carryKit) return [];
    
    const results = [];
    for (const slug of Object.keys(heroAbilities)) {
      if (slug === carrySlug) continue;
      if (!isSupport(slug)) continue;
      const supportKit = getHeroKit(slug);
      if (!supportKit) continue;
      const syn = scoreSynergy(supportKit, carryKit);
      results.push({ partner: supportKit, ...syn });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, count);
  }

  // Off-meta versions that skip role filtering
  function getTopDuosUnfiltered(supportSlug, count = 5) {
    const supportKit = getHeroKit(supportSlug);
    if (!supportKit) return [];
    const results = [];
    for (const slug of Object.keys(heroAbilities)) {
      if (slug === supportSlug) continue;
      const partnerKit = getHeroKit(slug);
      if (!partnerKit) continue;
      const syn = scoreSynergy(supportKit, partnerKit);
      results.push({ partner: partnerKit, ...syn });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, count);
  }

  function getTopSupportsForUnfiltered(carrySlug, count = 5) {
    const carryKit = getHeroKit(carrySlug);
    if (!carryKit) return [];
    const results = [];
    for (const slug of Object.keys(heroAbilities)) {
      if (slug === carrySlug) continue;
      const supportKit = getHeroKit(slug);
      if (!supportKit) continue;
      const syn = scoreSynergy(supportKit, carryKit);
      results.push({ partner: supportKit, ...syn });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, count);
  }

  let _offMetaEnabled = false;

  function renderSynergySection(container, heroSlug) {
    const isHeroSupport = isSupport(heroSlug);
    const isHeroCarry = isCarry(heroSlug);
    
    // Show for supports (best partners) and carries (best supports)
    if (!isHeroSupport && !isHeroCarry) {
      container.innerHTML = '';
      return;
    }

    const getDuos = () => {
      if (_offMetaEnabled) {
        return isHeroSupport ? getTopDuosUnfiltered(heroSlug, 8) : getTopSupportsForUnfiltered(heroSlug, 8);
      }
      return isHeroSupport ? getTopDuos(heroSlug, 5) : getTopSupportsFor(heroSlug, 5);
    };

    const duos = getDuos();
    if (!duos.length) {
      container.innerHTML = '<p style="color:var(--text-2)">No duo data available.</p>';
      return;
    }

    const heroKit = getHeroKit(heroSlug);
    const label = isHeroSupport ? 'Best Duo Partners' : 'Best Support Partners';
    const toggleId = 'offMetaToggle';
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">`;
    html += `<h3 style="margin:0">🤝 ${label} for ${heroKit.name}</h3>`;
    html += `<label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.8rem;color:var(--text-2);user-select:none">`;
    html += `<input type="checkbox" id="${toggleId}" ${_offMetaEnabled ? 'checked' : ''} style="accent-color:#ab47bc;cursor:pointer">`;
    html += `Show off-meta picks</label></div>`;

    for (let i = 0; i < duos.length; i++) {
      const duo = duos[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const pctRaw = Math.min(100, Math.round(duo.score * 100 / 130));
      const scoreColor = pctRaw >= 70 ? '#66bb6a' : pctRaw >= 40 ? '#ffa726' : '#ef5350';

      html += `<div class="synergy-duo-card" style="background:var(--bg-2);border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;border-left:3px solid ${scoreColor}">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">`;
      html += `<div style="font-size:1.05rem"><strong>${medal} ${duo.partner.name}</strong></div>`;
      html += `<div style="display:flex;align-items:center;gap:0.5rem">`;
      if (duo.combinedHardCC > 0) {
        html += `<span class="synergy-cc-badge" title="Combined hard CC duration" style="font-size:0.75rem;padding:2px 8px;border-radius:12px;background:#4a148c;color:#ce93d8">🔒 ${duo.combinedHardCC.toFixed(1)}s CC</span>`;
      }
      const pct = pctRaw;
      html += `<span class="synergy-pct-badge" data-duo-idx="${i}" title="Synergy Score — measures how well these kits complement each other based on CC chains, peel, engage, heals/shields, and damage amplification. Not a win rate." style="font-weight:bold;color:${scoreColor};font-size:1.1rem;user-select:none">${pct}%</span>`;
      html += ` <button class="synergy-expand-btn" data-duo-idx="${i}" style="background:none;border:1px solid var(--text-2);color:var(--text-2);border-radius:4px;padding:2px 8px;font-size:0.72rem;cursor:pointer;margin-left:6px;transition:all 0.15s">▸ Why &amp; Combos</button>`;
      html += `</div></div>`;

      // Synergy detail panel (hidden by default)
      html += `<div id="synergy-detail-${i}" style="display:none;background:var(--bg-3);border-radius:6px;padding:0.75rem;margin-bottom:0.5rem;font-size:0.82rem">`;
      // Reasons
      if (duo.reasons.length) {
        html += '<div style="margin-bottom:0.5rem"><strong style="font-size:0.78rem;color:var(--text-2)">Why this works:</strong>';
        for (const r of duo.reasons) {
          html += `<div style="margin:2px 0;padding-left:0.5rem">• ${r}</div>`;
        }
        html += '</div>';
      }
      // Combos
      if (duo.combos.length) {
        html += '<div style="margin-bottom:0.5rem"><strong style="font-size:0.78rem;color:var(--text-2)">Combo Chains:</strong>';
        for (const c of duo.combos) {
          const icon = c.type === 'cc_chain' ? '⛓️' : c.type === 'engage' ? '⚔️' : '🤝';
          html += `<div style="padding:3px 6px;background:var(--bg-2);border-radius:4px;margin:3px 0">${icon} ${c.text}`;
          if (c.value) html += ` <span style="color:#ce93d8">(${c.value.toFixed(2)}s window)</span>`;
          html += '</div>';
        }
        html += '</div>';
      }
      // Combined hard CC
      if (duo.combinedHardCC > 0) {
        html += `<div style="margin-bottom:0.5rem">🔒 <strong>Combined Hard CC:</strong> ${duo.combinedHardCC.toFixed(1)}s</div>`;
      }
      // Legend
      html += '<div style="color:var(--text-2);font-size:0.72rem;border-top:1px solid var(--bg-2);padding-top:0.4rem;margin-top:0.25rem">Score based on: CC Chains (15pts per second), Heal/Shield (+20), Engage (+18), Peel (+10), Anti-heal (+12), Pen/Shred (+8)</div>';
      html += '</div>';

      html += '</div>';
    }

    container.innerHTML = html;

    // Wire up synergy expand buttons → toggle detail panel
    container.querySelectorAll('.synergy-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.duoIdx;
        const panel = document.getElementById('synergy-detail-' + idx);
        if (panel) {
          const show = panel.style.display === 'none';
          panel.style.display = show ? '' : 'none';
          btn.textContent = show ? '▾ Hide' : '▸ Why & Combos';
          btn.style.borderColor = show ? 'var(--accent)' : 'var(--text-2)';
          btn.style.color = show ? 'var(--accent)' : 'var(--text-2)';
        }
      });
    });

    // Wire up off-meta toggle
    const toggle = document.getElementById('offMetaToggle');
    if (toggle) {
      toggle.addEventListener('change', () => {
        _offMetaEnabled = toggle.checked;
        renderSynergySection(container, heroSlug);
      });
    }
  }

  // Render synergy analysis for duo lane matchup builder
  function renderDuoSynergyAnalysis(slug1, slug2) {
    const kit1 = getHeroKit(slug1);
    const kit2 = getHeroKit(slug2);
    if (!kit1 || !kit2) return '';

    // Score both directions and pick the better framing
    const s1 = scoreSynergy(kit1, kit2);
    const s2 = scoreSynergy(kit2, kit1);
    const best = s1.score >= s2.score ? { support: kit1, partner: kit2, ...s1 } : { support: kit2, partner: kit1, ...s2 };

    if (best.score === 0 && best.reasons.length === 0) return '';

    let html = '<div class="mb-card" style="margin-bottom:1rem"><h3>🤝 Synergy Analysis</h3>';

    const bestPctRaw = Math.min(100, Math.round(best.score * 100 / 130));
    const scoreColor = bestPctRaw >= 70 ? '#66bb6a' : bestPctRaw >= 40 ? '#ffa726' : '#ef5350';
    const bestPct = bestPctRaw;
    html += `<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">`;
    html += `<span style="font-size:1.2rem;font-weight:bold;color:${scoreColor};user-select:none">${bestPct}%</span>`;
    html += ` <button onclick="(function(btn){var p=btn.parentElement.parentElement.querySelector('.duo-synergy-detail-panel');if(p){var show=p.style.display==='none';p.style.display=show?'':'none';btn.textContent=show?'▾ Hide':'▸ Why & Combos';btn.style.borderColor=show?'var(--accent)':'var(--text-2)';btn.style.color=show?'var(--accent)':'var(--text-2)'}})(this)" style="background:none;border:1px solid var(--text-2);color:var(--text-2);border-radius:4px;padding:2px 8px;font-size:0.72rem;cursor:pointer;margin-left:6px;transition:all 0.15s">▸ Why &amp; Combos</button>`;
    if (best.combinedHardCC > 0) {
      html += `<span style="font-size:0.8rem;padding:2px 8px;border-radius:12px;background:#4a148c;color:#ce93d8">🔒 ${best.combinedHardCC.toFixed(1)}s combined CC</span>`;
    }
    html += '</div>';

    html += `<div class="duo-synergy-detail-panel" style="display:none;background:var(--bg-3);border-radius:6px;padding:0.75rem;margin-bottom:0.5rem;font-size:0.82rem">`;
    for (const r of best.reasons) {
      html += `<div style="margin:2px 0;padding-left:0.5rem">• ${r}</div>`;
    }
    if (best.combos.length) {
      html += '<div style="margin-top:0.4rem"><strong style="font-size:0.78rem;color:var(--text-2)">Combo Chains:</strong>';
      for (const c of best.combos) {
        const icon = c.type === 'cc_chain' ? '⛓️' : c.type === 'engage' ? '⚔️' : '🤝';
        html += `<div style="padding:3px 6px;background:var(--bg-2);border-radius:4px;margin:3px 0">${icon} ${c.text}`;
        if (c.value) html += ` <span style="color:#ce93d8">(${c.value.toFixed(2)}s window)</span>`;
        html += '</div>';
      }
      html += '</div>';
    }
    if (best.combinedHardCC > 0) {
      html += `<div style="margin-top:0.4rem">🔒 <strong>Combined Hard CC:</strong> ${best.combinedHardCC.toFixed(1)}s</div>`;
    }
    html += '<div style="color:var(--text-2);font-size:0.72rem;border-top:1px solid var(--bg-2);padding-top:0.4rem;margin-top:0.25rem">Score based on: CC Chains (15pts per second), Heal/Shield (+20), Engage (+18), Peel (+10), Anti-heal (+12), Pen/Shred (+8)</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  return { load, isSupport, isCarry, getTopDuos, getTopSupportsFor, analyzeDuo, renderSynergySection, renderDuoSynergyAnalysis, getHeroKit };
})();
