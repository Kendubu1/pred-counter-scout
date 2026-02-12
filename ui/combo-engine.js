// combo-engine.js — Browser-side ability analysis & combo engine for Predecessor Scout

const ComboEngine = (() => {
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
    if (heroAbilities) return;
    const [aRes, pRes] = await Promise.all([
      fetch('../data/game-data/hero-abilities.json?v=' + Date.now()),
      fetch('../data/game-data/hero-profiles.json?v=' + Date.now()),
    ]);
    heroAbilities = await aRes.json();
    heroProfiles = await pRes.json();
  }

  function getHero(slug) {
    return heroAbilities?.[slug] || null;
  }

  function isSupport(slug) {
    if (!heroProfiles) return false;
    for (const p of heroProfiles) {
      if (p.slug === slug && p.roles?.some(r => r.toUpperCase() === 'SUPPORT')) return true;
    }
    return false;
  }

  // ── CC extraction from descriptions ──
  function extractCC(ability) {
    const results = [];
    if (ability.cc?.length) {
      for (const cc of ability.cc) {
        results.push({ type: cc.type, duration: cc.value || 0.5, hard: ['stun', 'root', 'suppress', 'knockup', 'fear', 'pull', 'knockback'].includes(cc.type) });
      }
    }
    const desc = ability.description || '';
    const patterns = [
      { type: 'stun', re: /stunn?(?:ing|ed|s)?\s+(?:them\s+)?(?:for\s+)?(\d+\.?\d*)/i, hard: true },
      { type: 'root', re: /root(?:ing|ed|s)?\s+(?:them\s+)?(?:for\s+)?(\d+\.?\d*)/i, hard: true },
      { type: 'knockup', re: /knock(?:ing)?\s*(?:them\s+)?up/i, hard: true },
      { type: 'silence', re: /silenc(?:ing|ed|es?)?\s+(?:them\s+)?(?:for\s+)?(\d+\.?\d*)/i, hard: false },
      { type: 'pull', re: /pull(?:ing|s|ed)?\s+(?:all\s+)?(?:them|targets?|enem)/i, hard: true },
      { type: 'slow', re: /slow(?:ing|ed|s)?\s+(?:them\s+)?(?:by\s+)?(\d+)%/i, hard: false },
    ];
    for (const pat of patterns) {
      if (results.some(r => r.type === pat.type)) continue;
      const m = desc.match(pat.re);
      if (m) results.push({ type: pat.type, duration: parseFloat(m[1] || '0.75') || 0.5, hard: pat.hard });
    }
    return results;
  }

  // ── Ability purpose explanations ──
  function getAbilityPurpose(ability) {
    const desc = (ability.description || '').toLowerCase();
    const cc = extractCC(ability);
    const traits = [];

    if (cc.some(c => c.hard)) traits.push('lock down');
    else if (cc.some(c => c.type === 'slow')) traits.push('slow');
    if (/shield/.test(desc)) traits.push('shield ally');
    if (/heal(?!ing.*reduc)/.test(desc) || /restore.*health/.test(desc)) traits.push('heal');
    if (/area|aoe|nearby enem/i.test(desc)) traits.push('AoE damage');
    if (/dash|charge|leap/i.test(desc)) traits.push('gap close');
    if (/empower|buff|enhance/i.test(desc)) traits.push('buff');

    const hasDmg = ability.damage?.[0]?.values?.[0] > 0;
    if (hasDmg && !traits.length) traits.push('damage');
    if (ability.key === 'ULTIMATE') traits.push('ultimate');

    return traits.length ? traits.join(' + ') : 'utility';
  }

  function analyzeHeroCombo(hero, rank = 2) {
    const abilities = hero.abilities || [];
    const active = abilities.filter(a =>
      a.key !== 'BASIC' && a.key !== 'PASSIVE' && (a.cooldowns?.length > 0 || a.costs?.length > 0)
    );
    if (active.length === 0) return null;

    const scored = active.map(a => {
      const ri = Math.min(rank, (a.cooldowns?.length || 1) - 1);
      const cd = a.cooldowns?.[ri] ?? 0;
      const cost = a.costs?.[ri] ?? 0;
      const primaryDmg = a.damage?.[0];
      const dmgValue = primaryDmg?.values?.[ri] ?? 0;
      const scaling = primaryDmg?.scaling ?? 0;
      const cc = extractCC(a);

      let ccScore = 0, ccDuration = 0;
      for (const c of cc) {
        if (c.hard) { ccScore += 3; ccDuration += c.duration; }
        else if (c.type === 'silence') ccScore += 2;
        else if (c.type === 'slow') ccScore += 1;
      }

      return {
        ...a, cd, cost, dmgValue, scaling, ccScore, ccDuration, cc,
        purpose: getAbilityPurpose(a),
        dps: cd > 0 ? dmgValue / cd : 0,
        manaEfficiency: cost > 0 ? dmgValue / cost : Infinity,
      };
    });

    const burstOrder = [...scored].sort((a, b) => {
      if (a.ccScore !== b.ccScore) return b.ccScore - a.ccScore;
      return b.dmgValue - a.dmgValue;
    });

    const dpsRotation = [...scored].sort((a, b) => b.dps - a.dps);

    const totalComboCost = scored.reduce((s, a) => s + a.cost, 0);

    const manaRanked = [...scored]
      .filter(a => a.cost > 0 && a.dmgValue > 0)
      .sort((a, b) => b.manaEfficiency - a.manaEfficiency);

    // Support-specific combos
    let supportCombos = null;
    if (isSupport(hero.slug)) {
      const ccAbilities = scored.filter(a => a.ccScore > 0);
      const healShield = scored.filter(a => {
        const d = (a.description || '').toLowerCase();
        return /shield|heal(?!ing.*reduc)|restore.*health/.test(d);
      });
      const dmgAbilities = scored.filter(a => a.dmgValue > 0);

      // Peel combo: shield/heal + CC to protect carry
      const peelCombo = [...healShield, ...ccAbilities.filter(a => !healShield.includes(a))];
      // Engage combo: CC first, then damage
      const engageCombo = [...ccAbilities, ...dmgAbilities.filter(a => !ccAbilities.includes(a))];
      // Sustain rotation: sort heals/shields by CD for uptime
      const sustainRotation = [...healShield].sort((a, b) => a.cd - b.cd);
      if (sustainRotation.length === 0 && healShield.length === 0) {
        // Add any abilities sorted by CD
        sustainRotation.push(...[...scored].sort((a, b) => a.cd - b.cd));
      }

      supportCombos = { peelCombo, engageCombo, sustainRotation };
    }

    return {
      heroName: displayName(hero.name),
      heroSlug: hero.slug,
      rank,
      burstCombo: burstOrder.map(a => ({
        name: a.name, key: a.key, purpose: a.purpose,
        reason: a.ccScore > 0 ? `CC (${a.cc.map(c => c.type).join(', ')})` :
                a.key === 'ULTIMATE' ? 'Ultimate' : 'Damage',
        damage: a.dmgValue, scaling: a.scaling, cost: a.cost, cd: a.cd,
      })),
      dpsRotation: dpsRotation.map(a => ({
        name: a.name, key: a.key, dps: Math.round(a.dps * 10) / 10, cost: a.cost, cd: a.cd, purpose: a.purpose,
      })),
      supportCombos: supportCombos ? {
        peel: supportCombos.peelCombo.map(a => ({ name: a.name, key: a.key, purpose: a.purpose, cd: a.cd, cost: a.cost })),
        engage: supportCombos.engageCombo.map(a => ({ name: a.name, key: a.key, purpose: a.purpose, cd: a.cd, cost: a.cost })),
        sustain: supportCombos.sustainRotation.map(a => ({ name: a.name, key: a.key, purpose: a.purpose, cd: a.cd, cost: a.cost })),
      } : null,
      classification: {
        spam: scored.filter(a => a.classification === 'spam'),
        save: scored.filter(a => a.classification === 'save'),
        moderate: scored.filter(a => a.classification === 'moderate'),
      },
    };
  }

  // Key display mapping — platform-aware
  const KEY_MAPS = {
    pc:    { BASIC: 'Basic', ALTERNATE: 'RMB', PRIMARY: 'Q', SECONDARY: 'E', ULTIMATE: 'R (Ult)', PASSIVE: 'Passive' },
    ps:    { BASIC: 'R2', ALTERNATE: 'R1', PRIMARY: '□', SECONDARY: '○', ULTIMATE: '△ (Ult)', PASSIVE: 'Passive' },
    xbox:  { BASIC: 'RT', ALTERNATE: 'RB', PRIMARY: 'X', SECONDARY: 'B', ULTIMATE: 'Y (Ult)', PASSIVE: 'Passive' },
  };
  function getPlatform() { return localStorage.getItem('pred-platform') || 'pc'; }
  function setPlatform(p) { localStorage.setItem('pred-platform', p); }
  function getKeyLabels() { return KEY_MAPS[getPlatform()] || KEY_MAPS.pc; }
  const KEY_LABELS = new Proxy({}, { get: (_, key) => getKeyLabels()[key] });
  const KEY_COLORS = {
    BASIC: '#888', ALTERNATE: '#4fc3f7', PRIMARY: '#66bb6a', SECONDARY: '#ffa726',
    ULTIMATE: '#ef5350', PASSIVE: '#ab47bc',
  };

  // ── Render combo flow (visual arrows) ──
  function renderComboFlow(abilities, label, icon) {
    let html = `<div class="combo-flow-section">`;
    html += `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">`;
    for (let i = 0; i < abilities.length; i++) {
      const a = abilities[i];
      const color = KEY_COLORS[a.key] || '#888';
      const keyLabel = KEY_LABELS[a.key] || a.key;
      if (i > 0) html += '<span class="combo-arrow">→</span>';
      html += `<div class="combo-step" style="border-color:${color}" title="${a.cd}s CD · ${a.cost} mana${a.damage ? ' · ' + a.damage + ' dmg' : ''}">`;
      html += `<div class="combo-step-key" style="color:${color}">${keyLabel}</div>`;
      html += `<div class="combo-step-name">${a.name}</div>`;
      html += `<div class="combo-step-why">${a.purpose || ''}</div>`;
      html += `</div>`;
    }
    html += '</div></div>';
    return html;
  }

  // ── Battery-style usage indicator ──
  function renderUsageBattery(classification) {
    const all = [
      ...classification.spam.map(a => ({ ...a, tier: 'spam', label: '🟢 Spam', color: '#66bb6a' })),
      ...classification.moderate.map(a => ({ ...a, tier: 'moderate', label: '🟡 Moderate', color: '#ffa726' })),
      ...classification.save.map(a => ({ ...a, tier: 'save', label: '🔴 Save', color: '#ef5350' })),
    ];
    if (!all.length) return '';

    let html = '<div style="display:flex;flex-direction:column;gap:0.5rem">';
    for (const a of all) {
      const keyLabel = KEY_LABELS[a.key] || a.key;
      const tierLabel = a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
      html += `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0.6rem;background:var(--bg-2);border-radius:6px;border-left:3px solid ${a.color}">`;
      html += `<strong style="min-width:5rem">[${keyLabel}] ${a.name}</strong>`;
      html += `<span style="padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;color:#fff;background:${a.color}">${tierLabel}</span>`;
      html += `<span style="font-size:0.75rem;color:var(--text-2)">${a.cd}s CD · ${a.cost} mana</span>`;
      html += `</div>`;
    }
    html += '</div>';
    return html;
  }

  function renderAbilityGuide(container, slug) {
    const hero = getHero(slug);
    if (!hero) { container.innerHTML = '<p style="color:var(--text-2)">No ability data available.</p>'; return; }

    const analysis = analyzeHeroCombo(hero);
    const abilities = hero.abilities || [];
    const isSup = isSupport(slug);

    let html = '';

    // ── Ability Table (compact) ──
    html += '<h3 style="margin-bottom:0.5rem">⚡ Abilities</h3>';
    html += '<div class="ability-table">';
    for (const a of abilities) {
      const color = KEY_COLORS[a.key] || '#888';
      const label = KEY_LABELS[a.key] || a.key;
      const hasCd = a.cooldowns?.length > 0;
      const hasCost = a.costs?.length > 0;
      const cc = extractCC(a);

      html += `<div class="ability-row" style="border-left:3px solid ${color};padding:0.5rem;margin-bottom:0.5rem;background:var(--bg-2);border-radius:4px">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">`;
      html += `<strong style="color:${color}">[${label}] ${a.name}</strong>`;
      // Battery-style classification badge
      if (a.classification) {
        const cls = a.classification;
        const bars = cls === 'spam' ? 3 : cls === 'moderate' ? 2 : 1;
        const clr = cls === 'spam' ? '#66bb6a' : cls === 'moderate' ? '#ffa726' : '#ef5350';
        html += `<span class="ability-usage-mini" title="${cls}: ${a.cooldowns?.[2] || '?'}s CD · ${a.costs?.[2] || '?'} mana">`;
        for (let i = 0; i < 3; i++) {
          html += `<span class="battery-segment-mini${i < bars ? ' active' : ''}" style="${i < bars ? 'background:' + clr : ''}"></span>`;
        }
        html += `</span>`;
      }
      html += '</div>';

      // Quick stats line
      const quickStats = [];
      if (hasCd) quickStats.push(`⏱ ${a.cooldowns[2] || a.cooldowns[0]}s`);
      if (hasCost) quickStats.push(`💧 ${a.costs[2] || a.costs[0]}`);
      if (cc.length) quickStats.push(`🔒 ${cc.map(c => c.type).join(', ')}`);
      if (quickStats.length) {
        html += `<div style="font-size:0.8rem;color:var(--text-2);display:flex;gap:0.75rem">${quickStats.join(' ')}</div>`;
      }

      // Clean description: strip raw scaling numbers like "50/52.38/54.89/..." and "(+55%)" 
      let cleanDesc = (a.description?.split('\n')[0] || '')
        .replace(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?){3,}/g, '…')  // 4+ slash-separated numbers
        .replace(/\s*\(\+?\d+%?\)\s*/g, ' ')                      // (+55%) or (+40%)
        .replace(/dealing\s*…\s*/gi, 'dealing ')                   // clean up "dealing …"
        .replace(/for\s*…\s*/gi, 'for ')
        .replace(/\s{2,}/g, ' ').trim();
      html += `<div style="font-size:0.75rem;color:var(--text-3);margin-top:0.25rem;overflow:hidden;text-overflow:ellipsis;word-break:break-word;max-height:3.6em;line-height:1.2em">${cleanDesc}</div>`;

      // Collapsible details
      if ((a.damage?.length) || (hasCd && a.cooldowns.length > 1) || (hasCost && a.costs.length > 1)) {
        html += `<details style="margin-top:0.25rem"><summary style="font-size:0.7rem;color:var(--accent);cursor:pointer">📊 Full numbers</summary>`;
        html += '<div style="font-size:0.75rem;color:var(--text-3);padding-top:0.25rem">';
        if (hasCd) html += `<div>CD by rank: ${a.cooldowns.join(' / ')}s</div>`;
        if (hasCost) html += `<div>Cost by rank: ${a.costs.join(' / ')}</div>`;
        if (a.damage?.length) {
          for (const d of a.damage) {
            const ctx = d.context === 'empowered' ? ' (empowered)' : d.context === 'dot' ? ' (DoT)' : '';
            html += `<div>💥 ${d.values.join('/')} (+${d.scaling}% ${d.damageType})${ctx}</div>`;
          }
        }
        html += '</div></details>';
      }

      html += '</div>';
    }
    html += '</div>';

    if (!analysis) {
      container.innerHTML = html;
      return;
    }

    // ── Support-specific combos ──
    if (isSup && analysis.supportCombos) {
      const sc = analysis.supportCombos;

      if (sc.peel.length) {
        html += '<h3 style="margin:1rem 0 0.5rem">🛡️ Peel Combo <span style="font-size:0.8rem;color:var(--text-2);font-weight:normal">(protect your carry)</span></h3>';
        html += renderComboFlow(sc.peel, 'Peel', '🛡️');
      }
      if (sc.engage.length) {
        html += '<h3 style="margin:1rem 0 0.5rem">⚔️ Engage Combo <span style="font-size:0.8rem;color:var(--text-2);font-weight:normal">(initiate fights)</span></h3>';
        html += renderComboFlow(sc.engage, 'Engage', '⚔️');
      }
      if (sc.sustain.length) {
        html += '<h3 style="margin:1rem 0 0.5rem">💚 Sustain Rotation <span style="font-size:0.8rem;color:var(--text-2);font-weight:normal">(max healing/shielding uptime)</span></h3>';
        html += renderComboFlow(sc.sustain, 'Sustain', '💚');
      }
    }

    // ── Burst Combo (visual flow first, numbers in details) ──
    html += `<h3 style="margin:1rem 0 0.5rem">🎯 Burst Combo${isSup ? ' <span style="font-size:0.8rem;color:var(--text-2);font-weight:normal">(max damage)</span>' : ''}</h3>`;
    html += renderComboFlow(analysis.burstCombo, 'Burst', '🎯');
    // Collapsible numbers
    html += `<details style="margin-top:0.25rem"><summary style="font-size:0.8rem;color:var(--accent);cursor:pointer">📊 Damage breakdown</summary>`;
    html += '<div style="padding:0.5rem;font-size:0.8rem;color:var(--text-2)">';
    let totalDmg = 0;
    for (const a of analysis.burstCombo) {
      totalDmg += a.damage || 0;
      html += `<div>${a.name}: ${a.damage || 0} base dmg (+${a.scaling}% scaling) · ${a.cost} mana · ${a.cd}s CD</div>`;
    }
    html += `<div style="margin-top:0.25rem;color:var(--text-1)"><strong>Total: ${totalDmg} base damage</strong></div>`;
    html += '</div></details>';

    // ── DPS Rotation ──
    html += '<h3 style="margin:1rem 0 0.5rem">🔁 DPS Rotation</h3>';
    html += renderComboFlow(analysis.dpsRotation, 'DPS', '🔁');

    // ── Usage Classification (battery style) ──
    html += '<h3 style="margin:1rem 0 0.5rem">📋 Usage Guide</h3>';
    html += '<p style="font-size:0.8rem;color:var(--text-2);margin:0 0 0.5rem">How freely you can use each ability based on cooldown and mana cost:</p>';
    html += renderUsageBattery(analysis.classification);

    // Mana Budget removed — needs per-level scaling to be useful

    container.innerHTML = html;
  }

  function renderPlatformToggle(onSwitch) {
    const current = getPlatform();
    const opts = [
      { id: 'pc', label: '🖥 PC' },
      { id: 'ps', label: '🎮 PS' },
      { id: 'xbox', label: '🎮 Xbox' },
    ];
    let html = '<div class="platform-toggle" style="display:inline-flex;gap:0.25rem;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);padding:2px;font-size:0.8rem">';
    for (const o of opts) {
      const active = o.id === current;
      html += `<button data-platform="${o.id}" style="padding:4px 10px;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;${active ? 'background:var(--accent);color:#fff' : 'background:transparent;color:var(--text-2)'}">${o.label}</button>`;
    }
    html += '</div>';
    return html;
  }

  function bindPlatformToggle(container, onSwitch) {
    container.querySelectorAll('[data-platform]').forEach(btn => {
      btn.addEventListener('click', () => {
        setPlatform(btn.dataset.platform);
        if (onSwitch) onSwitch();
      });
    });
  }

  return { load, getHero, analyzeHeroCombo, renderAbilityGuide, isSupport, renderPlatformToggle, bindPlatformToggle, getPlatform, setPlatform };
})();
