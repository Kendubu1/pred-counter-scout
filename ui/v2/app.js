// app.js — Predecessor Scout v2 Flagship

const DATA_BASE = '../data';
const CACHE_BUST = '?v=' + Date.now();
function titleCase(s) { return s ? s.split(/[\s_-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : ''; }

// ── Name fix map ──
const NAME_FIX = {
  DemonKing: 'Akeron', Emerald: 'Argus', Cryptmaker: 'Bayle', Mech: 'Eden',
  Huntress: 'Kira', Swiftpaw: 'Maco', Wood: 'Mourn', Bright: 'Renna',
  Boost: 'Skylar', Tidebinder: 'Yurei', Lizard: 'Zarus',
  FengMao: 'Feng Mao', GRIMexe: 'GRIM.exe', IggyScorch: 'Iggy & Scorch',
  LtBelica: 'Lt. Belica', TwinBlast: 'TwinBlast',
};

const TRAIT_LABELS = {
  dot:'DoT', as_steroid:'AS Boost', on_hit:'On-Hit', cc:'CC', aoe:'AoE',
  stacking:'Stacking', healing:'Healing', sustain:'Sustain', mobility:'Mobility',
  execute:'Execute', stealth:'Stealth', shield:'Shield', global:'Global',
  summons:'Summons', anti_heal:'Anti-Heal', cd_reset:'CD Reset', pen:'Pen', crit:'Crit',
};
function traitLabel(t) { return TRAIT_LABELS[t] || t; }

// ── Augment trait counter tips ──
const AUGMENT_TRAIT_TIPS = {
  healing: 'Buy anti-heal items',
  self_heal: 'You need anti-heal to duel them — Pestilence or Toxic Rounds',
  ally_heal: 'Anti-heal the target being healed, not the healer. Or burst the healer first',
  self_shield: 'Wait out their shield before committing cooldowns',
  ally_shield: 'They shield teammates — burst through or focus the shielder',
  health_sustain: 'Poke is less effective, commit to all-ins or buy anti-heal',
  mana_sustain: "They won't run out of abilities, expect constant pressure",
  execute: "Don't linger at low HP, respect kill thresholds",
  stealth: 'Buy wards/detection items',
  team_stealth: 'Need wards and detection for the whole team',
  shield: 'Wait out the shield or buy shield-break',
  burst_amp: 'Respect their damage, consider building defense',
  cd_reset: 'Expect abilities more often, bait before engaging',
  range_ext: 'Stay further back than usual',
  damage_reduction: 'Need sustained damage to cut through',
  armor_shred: 'Your armor items are less effective',
  anti_heal: 'YOUR healing is reduced in this matchup',
  unstoppable: 'Save CC for after the ability ends',
  zone_control: "Don't fight in their zones",
  isolation: 'Stay grouped with your team',
  mobility: 'Harder to catch or escape, save gap closers',
  scaling: 'End the game early, they outscale',
  cc: 'Tenacity and positioning are more important',
  on_hit: 'Keep trades short, on-hit effects punish extended fights',
  as_steroid: 'Keep trades short, they ramp fast',
  cleanse: 'Your CC chain is less reliable',
  global: 'Watch the minimap, they can impact from anywhere',
  dot: 'Sustain/regen helps outlast their damage over time',
};

// ── State ──
let heroIndex = [];
let heroCache = {};
let heroProfiles = {};
let duoSynergies = {};
let currentHero = null;
let currentRole = null;
let currentVersion = null;
let matchupChart = null;
let currentFlow = null;   // 'learn' | 'counter' | 'draft' | null
let draftState = {
  your: [null, null, null, null, null],
  enemy: [null, null, null, null, null],
  activeSlot: null, // { team: 'your'|'enemy', index: 0-4 }
};

// ── Helpers ──
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function wrClass(wr) {
  const n = typeof wr === 'string' ? parseFloat(wr) : wr;
  if (n >= 52) return 'wr-green'; if (n <= 48) return 'wr-red'; return 'wr-neutral';
}
function wrColor(wr) {
  if (wr >= 52) return '#00c48c'; if (wr <= 48) return '#ff5a5a'; return '#f0b429';
}
function heroDisplayName(n) {
  if (NAME_FIX[n]) return NAME_FIX[n];
  const p = heroProfiles[n]; if (p) return p.name;
  for (const pp of Object.values(heroProfiles)) { if (pp.name === n) return pp.name; }
  return n;
}
function heroSlugFromName(name) {
  const fixed = NAME_FIX[name] || name;
  for (const [slug, p] of Object.entries(heroProfiles)) {
    if (p.name === fixed || p.name === name) return slug;
  }
  return fixed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function getHeroRoles(slug) {
  const p = heroProfiles[slug];
  if (p && p.roles) return p.roles.map(r => r.toLowerCase());
  return [];
}

// ── Archetype Tags ──
function deriveArchetypeTags(profile) {
  if (!profile) return [];
  const tags = [];
  const t = new Set(profile.baseTraits || []);
  const a = profile.attributes || {};
  const isRanged = profile.attackType === 'ranged';
  const isMelee = profile.attackType === 'melee';
  const isAssassinClass = (profile.classes||[]).some(c => /assassin/i.test(c));
  // Burst caster (ranged = Burst Mage, melee assassin = Burst Assassin)
  if (a.abilityPower >= 8 && a.durability <= 3 && isRanged) tags.push({ label: 'Burst Mage', cls: 'burst' });
  else if (a.abilityPower >= 8 && a.durability <= 3 && isMelee) tags.push({ label: isAssassinClass ? 'Burst Assassin' : 'Burst Caster', cls: 'burst' });
  else if (a.attackPower >= 7 && a.durability <= 2 && a.mobility >= 6 && (isMelee || isAssassinClass)) tags.push({ label: 'Assassin', cls: 'burst' });
  else if (a.abilityPower >= 7 && a.attackPower <= 2) tags.push({ label: 'Mage', cls: 'poke' });
  if (t.has('healing') && a.durability >= 5) tags.push({ label: 'Sustain Fighter', cls: 'sustain' });
  else if (t.has('healing')) tags.push({ label: 'Sustain', cls: 'sustain' });
  if (t.has('cc') && a.durability >= 6) tags.push({ label: 'CC Tank', cls: 'cc' });
  else if (t.has('cc') && (profile.classes||[]).some(c => /support|enchanter|catcher/i.test(c))) tags.push({ label: 'CC Support', cls: 'cc' });
  if (a.durability >= 8) tags.push({ label: 'Tank', cls: 'tank' });
  else if (a.durability >= 6 && (a.attackPower >= 4 || a.abilityPower >= 5)) tags.push({ label: 'Bruiser', cls: 'tank' });
  if (t.has('on_hit') && t.has('as_steroid')) tags.push({ label: 'On-Hit DPS', cls: 'dps' });
  else if (t.has('as_steroid') && a.attackPower >= 6) tags.push({ label: 'Auto Attacker', cls: 'dps' });
  else if (a.attackPower >= 8) tags.push({ label: 'ADC', cls: 'dps' });
  else if (a.attackPower >= 7 && isRanged && a.durability <= 2) tags.push({ label: 'Ranged Carry', cls: 'dps' });
  if (t.has('aoe') && a.abilityPower >= 7) tags.push({ label: 'AoE Specialist', cls: 'aoe' });
  if (a.mobility >= 8) tags.push({ label: 'High Mobility', cls: 'mobile' });
  if (t.has('stealth')) tags.push({ label: 'Stealth', cls: 'stealth' });
  if (t.has('execute')) tags.push({ label: 'Execute', cls: 'execute' });
  if (t.has('global')) tags.push({ label: 'Global', cls: 'global' });
  if (t.has('self_heal')) tags.push({ label: 'Self-Heal', cls: 'sustain' });
  if (t.has('ally_heal')) tags.push({ label: 'Ally-Heal', cls: 'sustain' });
  if (t.has('self_shield')) tags.push({ label: 'Self-Shield', cls: 'tank' });
  if (t.has('ally_shield')) tags.push({ label: 'Ally-Shield', cls: 'tank' });
  if (profile.attackType === 'ranged' && a.abilityPower >= 6 && a.durability <= 3 && !tags.some(x => x.label === 'Burst Mage'))
    tags.push({ label: 'Poke', cls: 'poke' });
  return tags.slice(0, 6);
}
// ── Tag Glossary ──
const TAG_GLOSSARY = {
  'Burst Mage':    { icon: '💥', desc: 'High ability power, low durability. Dumps all abilities quickly for massive burst damage. Punishes squishy targets but vulnerable if caught.', tips: 'Build magic defense or dodge their combo. They\'re weak after abilities are on cooldown.' },
  'Assassin':      { icon: '🗡️', desc: 'High attack + mobility, very fragile. Dives backline, deletes a target, gets out. Thrives on isolation picks.', tips: 'Stay grouped. Vision and CC shut them down. Don\'t wander alone.' },
  'Mage':          { icon: '🔮', desc: 'Ability-focused caster. Deals consistent magic damage from range. Usually mid or support role.', tips: 'Close the gap fast or build magic resist. They struggle in melee range.' },
  'Sustain Fighter':{ icon: '💚', desc: 'Tanky with built-in healing. Hard to kill in extended fights. Gets stronger the longer the fight goes.', tips: 'Buy anti-heal early. Burst them down before they can sustain through your damage.' },
  'Sustain':       { icon: '🩹', desc: 'Has healing in their kit but not as tanky. Can outlast you in trades if you don\'t have anti-heal.', tips: 'Anti-heal is mandatory. Short trades are better than long ones.' },
  'CC Tank':       { icon: '🔒', desc: 'High durability with crowd control. Initiates fights and locks down key targets. The frontline anchor.', tips: 'Don\'t group too tight — they want AoE CC. Focus their backline, not them.' },
  'CC Support':    { icon: '⛓️', desc: 'Support with strong crowd control. Sets up kills for their carry. Controls teamfight positioning.', tips: 'Cleanse or CC immunity abilities counter their lockdown. Bait out their CC before committing.' },
  'Tank':          { icon: '🛡️', desc: 'Extremely durable. Soaks damage and disrupts. Hard to kill but lower damage output.', tips: 'Ignore them in fights if possible. Kill their damage dealers first.' },
  'Bruiser':       { icon: '⚔️', desc: 'Balanced durability and damage. Can fight and take hits. Excels in extended 1v1s and skirmishes.', tips: 'Kite them if ranged. Burst them if you can — they win long fights.' },
  'On-Hit DPS':    { icon: '⚡', desc: 'Scales with attack speed and on-hit effects. Shreds tanks and objectives. Needs items to come online.', tips: 'Punish them early before they scale. They\'re weak until 2-3 items.' },
  'Auto Attacker': { icon: '🏹', desc: 'High sustained damage through basic attacks. Primary damage dealer in teamfights.', tips: 'Dive them with CC. They melt if locked down but destroy your team if left alone.' },
  'ADC':           { icon: '🎯', desc: 'Attack Damage Carry. Highest sustained physical damage late game. Team\'s main objective killer.', tips: 'They\'re glass cannons. CC + burst = dead carry. Zone them out of fights.' },
  'AoE Specialist':{ icon: '💫', desc: 'Excels at area damage. Dominates teamfights and wave clear. Wants enemies grouped up.', tips: 'Spread out in fights. Don\'t clump in narrow spaces where they can hit everyone.' },
  'High Mobility': { icon: '💨', desc: 'Extremely mobile. Can chase, escape, and reposition easily. Hard to pin down.', tips: 'Save your CC for when they dash in. Point-and-click CC is more reliable than skillshots.' },
  'Stealth':       { icon: '👻', desc: 'Can go invisible. Excels at flanking, scouting, and surprise engages.', tips: 'Buy wards. Stay near teammates. AoE abilities can reveal them.' },
  'Execute':       { icon: '☠️', desc: 'Has an ability that deals bonus damage to low-health targets. Finishes kills that would otherwise escape.', tips: 'Don\'t fight at low HP — back off and heal. Their execute threshold is their power spike.' },
  'Global':        { icon: '🌍', desc: 'Has abilities that reach across the entire map. Can impact any fight from anywhere.', tips: 'They\'re always a threat. Play as if they could appear at any moment. Watch the map.' },
  'Poke':          { icon: '🎯', desc: 'Ranged ability damage dealer. Chips away at health from safe distance before fights start.', tips: 'Hard engage beats poke. Close the distance fast or sustain through their harass.' },
  'Burst Assassin': { icon: '🗡️💥', desc: 'Melee assassin that dumps abilities for massive burst. Dives in, deletes a target, tries to escape.', tips: 'Group up and save CC. They\'re all-in — if they don\'t kill you in the burst, they\'re dead.' },
  'Burst Caster':  { icon: '💥', desc: 'Melee ability-focused burst dealer. Relies on ability combos rather than basic attacks.', tips: 'Build defensive or burst them first. They\'re vulnerable between ability rotations.' },
  'Ranged Carry':  { icon: '🏹', desc: 'Ranged physical damage dealer. Fragile but dangerous at distance. Scales well with items.', tips: 'Close the gap and CC them. They melt in melee range.' },
  // Damage types
  'Physical':      { icon: '⚔️', desc: 'Deals physical damage. Scales with Attack Power. Reduced by physical armor.', tips: 'Build physical armor items to reduce their damage output.' },
  'Hybrid':        { icon: '🔄', desc: 'Deals both physical and magical damage. Harder to itemize against since you need both armor types.', tips: 'You need mixed defenses. Prioritize the damage type they use more often.' },
  // Attack types
  'Melee':         { icon: '🗡️', desc: 'Fights in close range. Must get within arm\'s reach to deal basic attack damage. Usually tankier to compensate.', tips: 'Kite them if you\'re ranged. Use terrain and abilities to keep distance.' },
  'Ranged':        { icon: '🏹', desc: 'Attacks from distance. Can deal damage safely but usually squishier than melee heroes.', tips: 'Close the gap with dashes or CC. They\'re vulnerable in melee range.' },
  // Classes
  'Fighter':       { icon: '⚔️', desc: 'Versatile melee combatant. Balanced between damage and durability. Excels in extended fights and skirmishes.', tips: 'Burst them down or kite. They win drawn-out 1v1s.' },
  'Assassin':      { icon: '🗡️', desc: 'High burst damage, very fragile. Dives backline, deletes a target, gets out. Thrives on isolation picks.', tips: 'Stay grouped. Vision and CC shut them down. Don\'t wander alone.' },
  'Mage':          { icon: '🔮', desc: 'Ability-focused caster. Deals consistent magic damage from range. Usually mid or support role.', tips: 'Close the gap fast or build magic resist. They struggle in melee range.' },
  'Tank':          { icon: '🛡️', desc: 'Extremely durable frontliner. Absorbs damage and disrupts enemies. Low damage but high CC and survivability.', tips: 'Ignore them in fights if possible. Kill their damage dealers first.' },
  'Support':       { icon: '💚', desc: 'Empowers and protects allies. Provides heals, shields, CC, or vision. The team enabler.', tips: 'Target the carry they\'re protecting, not the support. Or burst the support if they\'re out of position.' },
  'Sharpshooter':  { icon: '🎯', desc: 'Ranged physical carry. Highest sustained damage in late game. Team\'s primary damage dealer and objective killer.', tips: 'Dive them with CC. They\'re glass cannons — burst wins.' },
  'Warden':        { icon: '🏰', desc: 'Defensive tank focused on protecting allies. Peels threats off their backline with CC and body blocking.', tips: 'Flank around them. They want you to fight through them — don\'t.' },
  'Enchanter':     { icon: '✨', desc: 'Support that buffs allies with heals, shields, and stat boosts. Force multiplier for their team.', tips: 'Anti-heal reduces their impact. Focus them or their carry — they\'re squishy.' },
  'Catcher':       { icon: '🪝', desc: 'CC-heavy support that catches enemies out of position. One good hook/stun can win a teamfight.', tips: 'Stay behind minions. Respect their engage range. Cleanse counters their picks.' },
  'Executioner':   { icon: '☠️', desc: 'Finisher. Deals bonus damage to low-health targets. Once you\'re below their threshold, you\'re dead.', tips: 'Back off at low HP — don\'t try to fight through their execute damage.' },
  // Heal/Shield subtypes (2026-02-12)
  'Self-Heal':     { icon: '💚', desc: 'Heals themselves through abilities or passives. Hard to kill in extended fights and 1v1s.', tips: 'YOU need anti-heal (Pestilence, Toxic Rounds) to duel them. Burst them before they can regen.' },
  'Ally-Heal':     { icon: '💖', desc: 'Heals teammates. Keeps their carry alive through fights. Changes how long the enemy team can stay in combat.', tips: 'Anti-heal the target being healed, not the healer. Or burst the healer first to remove the sustain.' },
  'Self-Shield':   { icon: '🛡️', desc: 'Generates a shield on themselves. Effectively extra HP during trades and all-ins.', tips: 'Wait out the shield before committing cooldowns. Their effective HP drops when it expires.' },
  'Ally-Shield':   { icon: '🛡️💖', desc: 'Shields teammates. Adds effective HP to their carry or frontline in fights. Game-changing in teamfights.', tips: 'Burst through the shield or wait it out. Focusing the shielder removes the team-wide protection.' },
  // Augment trait tags
  'DoT':           { icon: '🔥', desc: 'Damage over Time. Applies sustained damage that ticks over several seconds. Wears down targets between fights.', tips: 'Sustain and regen help outlast the damage. Healing and shields mitigate it.' },
  'AS Boost':      { icon: '⚡', desc: 'Attack Speed steroid. Temporarily or passively increases auto-attack speed, ramping DPS in extended fights.', tips: 'Keep trades short. They get stronger the longer the fight goes.' },
  'On-Hit':        { icon: '🎯', desc: 'On-Hit effects. Triggers bonus damage or effects with each basic attack. Scales with attack speed items.', tips: 'Avoid extended trades. Armor and short burst trades limit on-hit value.' },
  'CC':            { icon: '🔒', desc: 'Crowd Control. Stuns, roots, slows, or displacements that lock down enemies. The strongest tool in team fights.', tips: 'Tenacity items reduce CC duration. Positioning and cleanse abilities counter it.' },
  'AoE':           { icon: '💫', desc: 'Area of Effect. Abilities that hit multiple targets in an area. Strong in team fights and wave clear.', tips: 'Spread out so one ability doesn\'t hit your whole team.' },
  'Healing':       { icon: '💚', desc: 'Heals self or allies. Extends fight duration and sustain in lane. Key trait for supports and bruisers.', tips: 'Anti-heal items (any Tainted item) cut healing by 45%.' },
  'Sustain':       { icon: '🩹', desc: 'General sustain through healing, regen, or lifesteal. Stays healthy in lane and during fights.', tips: 'Anti-heal and burst damage counter sustain. Don\'t let them heal back up between trades.' },
  'Mobility':      { icon: '💨', desc: 'Movement abilities like dashes, blinks, or speed boosts. Hard to pin down or escape from.', tips: 'Save your CC for after they dash. Slows and roots counter mobility.' },
  'Execute':       { icon: '🎯', desc: 'Deals bonus damage or kills targets below a health threshold. Punishes low-HP targets.', tips: 'Don\'t linger at low HP. Back off or heal up before you hit their kill range.' },
  'Stealth':       { icon: '👁️', desc: 'Can go invisible. Used for flanks, escapes, or repositioning. Hard to track without detection.', tips: 'Buy wards and detection. Stay grouped so they can\'t pick you off.' },
  'Shield':        { icon: '🛡️', desc: 'Grants a temporary shield that absorbs damage. Adds effective HP for a short window.', tips: 'Wait out the shield before committing cooldowns, or burst through it.' },
  'Global':        { icon: '🌍', desc: 'Ability that impacts the entire map. Can assist or threaten from anywhere on the map.', tips: 'Watch the minimap. Play safer when their global is up.' },
  'Anti-Heal':     { icon: '🚫', desc: 'Reduces enemy healing. Shuts down sustain-heavy champions and healers.', tips: 'YOUR healing is less effective in this matchup. Adjust your build accordingly.' },
  'CD Reset':      { icon: '🔄', desc: 'Cooldown resets or major reduction. Lets them cycle abilities faster in fights.', tips: 'Expect abilities more often than normal. Bait cooldowns before engaging.' },
  'Crit':          { icon: '💥', desc: 'Critical strike chance or amplification. Massive auto-attack damage spikes.', tips: 'Armor items reduce crit damage. Keep trades short against crit builders.' },
  'Pen':           { icon: '🔧', desc: 'Armor or magic penetration. Cuts through defensive stats, making tanks less effective.', tips: 'Stacking one type of defense is less effective. HP items help since pen doesn\'t reduce max HP.' },
  'Stacking':      { icon: '📈', desc: 'Gains power over time through stacks. Gets stronger the longer the game goes or with repeated hits.', tips: 'End early or don\'t let them stack freely. Pressure them before they ramp up.' },
  'Summons':       { icon: '👥', desc: 'Summons units or creatures that fight alongside them. Adds extra damage and zone control.', tips: 'Kill the summons or ignore them and focus the hero. AoE clears summons fast.' },
};

function renderArchetypeTags(profile) {
  const tags = deriveArchetypeTags(profile);
  if (!tags.length) return '';
  return '<div class="hero-archetype-tags">' + tags.map(t => `<span class="archetype-pill archetype-${t.cls}" data-tag-label="${esc(t.label)}" style="cursor:pointer">${esc(t.label)}</span>`).join('') + '</div>';
}

function renderProfileBadges(profile) {
  if (!profile) return '';
  let h = '<div class="profile-badges">';
  h += `<span class="profile-badge badge-${profile.damageType}" data-tag-label="${esc(titleCase(profile.damageType))}" style="cursor:pointer">${esc(titleCase(profile.damageType))}</span>`;
  h += `<span class="profile-badge badge-${profile.attackType}" data-tag-label="${esc(titleCase(profile.attackType))}" style="cursor:pointer">${esc(titleCase(profile.attackType))}</span>`;
  (profile.classes || []).forEach(c => { h += `<span class="profile-badge badge-class" data-tag-label="${esc(titleCase(c))}" style="cursor:pointer">${esc(titleCase(c))}</span>`; });
  h += '</div>';
  return h;
}

function showTagModal(label) {
  const info = TAG_GLOSSARY[label];
  if (!info) return;
  // Find all heroes with this tag (check archetype tags + profile badges)
  const labelLower = label.toLowerCase();
  const heroes = Object.entries(heroProfiles).filter(([slug, p]) => {
    if (deriveArchetypeTags(p).some(t => t.label === label)) return true;
    if (titleCase(p.damageType) === label || titleCase(p.attackType) === label) return true;
    if ((p.classes || []).some(c => titleCase(c) === label)) return true;
    return false;
  }).map(([slug, p]) => ({ slug, name: p.name }));

  let html = `<div class="tag-modal-overlay" onclick="this.remove()">`;
  html += `<div class="tag-modal" onclick="event.stopPropagation()">`;
  html += `<div class="tag-modal-close" onclick="this.closest('.tag-modal-overlay').remove()">✕</div>`;
  html += `<div style="font-size:1.5rem;margin-bottom:0.25rem">${info.icon} ${esc(label)}</div>`;
  html += `<div style="color:var(--text-2);font-size:0.88rem;margin-bottom:0.75rem">${esc(info.desc)}</div>`;
  html += `<div style="background:var(--bg-2);padding:0.6rem 0.75rem;border-radius:6px;margin-bottom:0.75rem">`;
  html += `<div style="font-size:0.75rem;font-weight:600;color:var(--accent);margin-bottom:0.2rem">💡 How to play against</div>`;
  html += `<div style="font-size:0.82rem;color:var(--text-2)">${esc(info.tips)}</div>`;
  html += `</div>`;
  if (heroes.length) {
    html += `<div style="font-size:0.75rem;font-weight:600;color:var(--text-2);margin-bottom:0.35rem">Heroes with this tag (${heroes.length})</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem">`;
    heroes.forEach(h => {
      html += `<div class="tag-hero-chip" data-learn="${esc(h.slug)}"><img src="img/heroes/${esc(h.slug)}.webp" alt="" onerror="this.style.display='none'"> ${esc(h.name)}</div>`;
    });
    html += `</div>`;
  }
  html += `</div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // Wire hero clicks
  document.querySelectorAll('.tag-modal .tag-hero-chip[data-learn]').forEach(chip => {
    chip.onclick = () => {
      document.querySelector('.tag-modal-overlay')?.remove();
      navigate('learn', chip.dataset.learn);
    };
  });
}

// ── Item Tooltip Modal ──
function showItemModal(name) {
  const data = (typeof ITEM_DATA !== 'undefined') ? ITEM_DATA[name] : null;
  const tips = (typeof ITEM_TIPS !== 'undefined') ? ITEM_TIPS[name] : null;
  if (!data && !tips) return;

  let html = `<div class="tag-modal-overlay" onclick="this.remove()">`;
  html += `<div class="tag-modal" onclick="event.stopPropagation()" style="max-width:420px">`;
  html += `<div class="tag-modal-close" onclick="this.closest('.tag-modal-overlay').remove()">✕</div>`;

  // Header with image + name + price
  const slug = (typeof itemSlug !== 'undefined') ? itemSlug(name) : '';
  const imgHtml = slug ? `<img src="img/items/${slug}.webp" alt="" style="width:40px;height:40px;border-radius:6px;margin-right:0.5rem" onerror="this.style.display='none'">` : '';
  const rarity = data ? {E:'Epic',L:'Legendary',R:'Rare',U:'Uncommon',C:'Common'}[data.r] || data.r : '';
  const rarityColor = {E:'var(--purple,#a855f7)',L:'var(--gold,#f59e0b)',R:'var(--blue,#3b82f6)',U:'var(--green,#22c55e)',C:'var(--text-2)'}[data?.r] || 'var(--text-2)';
  const price = data?.p ? `${data.p}g` : '';
  const slot = data ? {P:'Passive',A:'Active',C:'Crest',T:'Trinket'}[data.s] || '' : '';

  html += `<div style="display:flex;align-items:center;margin-bottom:0.5rem">`;
  html += imgHtml;
  html += `<div>`;
  html += `<div style="font-size:1.3rem;font-weight:700">${esc(name)}</div>`;
  html += `<div style="font-size:0.8rem;color:${rarityColor}">${rarity}${slot ? ' · ' + slot : ''}${price ? ' · ' + price : ''}</div>`;
  html += `</div></div>`;

  // Identity line from tips
  if (tips?.id) {
    html += `<div style="font-size:0.92rem;color:var(--text-1);margin-bottom:0.5rem;font-style:italic">${esc(tips.id)}</div>`;
  }

  // Stats
  if (data?.st?.length) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.25rem 0.75rem;margin-bottom:0.5rem;font-size:0.82rem">`;
    data.st.forEach(s => {
      html += `<span style="color:var(--accent)">${esc(s)}</span>`;
    });
    html += `</div>`;
  }

  // Effects
  if (data?.fx?.length) {
    html += `<div style="background:var(--bg-2);padding:0.5rem 0.65rem;border-radius:6px;margin-bottom:0.5rem">`;
    data.fx.forEach(fx => {
      const prefix = fx.a ? '<span style="color:var(--gold,#f59e0b);font-weight:600">[ACTIVE]</span> ' : '';
      const cdText = fx.cd ? ` <span style="color:var(--text-2);font-size:0.75rem">(${fx.cd}s CD)</span>` : '';
      html += `<div style="margin-bottom:0.35rem;font-size:0.82rem">`;
      html += `${prefix}<span style="font-weight:600;color:var(--text-1)">${esc(fx.n)}</span>${cdText}`;
      html += `<div style="color:var(--text-2);margin-top:0.1rem">${esc(fx.t)}</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  }

  // Buy When
  if (tips?.buy) {
    html += `<div style="background:var(--bg-2);padding:0.5rem 0.65rem;border-radius:6px;margin-bottom:0.5rem">`;
    html += `<div style="font-size:0.75rem;font-weight:600;color:var(--green,#22c55e);margin-bottom:0.15rem">🛒 When to buy</div>`;
    html += `<div style="font-size:0.82rem;color:var(--text-2)">${esc(tips.buy)}</div>`;
    html += `</div>`;
  }

  // Counter tip
  if (tips?.tip) {
    html += `<div style="background:var(--bg-2);padding:0.5rem 0.65rem;border-radius:6px;margin-bottom:0.5rem">`;
    html += `<div style="font-size:0.75rem;font-weight:600;color:var(--red,#ef4444);margin-bottom:0.15rem">⚔️ How to counter</div>`;
    html += `<div style="font-size:0.82rem;color:var(--text-2)">${esc(tips.tip)}</div>`;
    html += `</div>`;
  }

  // Tags
  if (tips?.tags?.length) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.25rem">`;
    tips.tags.forEach(t => {
      html += `<span style="font-size:0.72rem;padding:0.15rem 0.4rem;border-radius:4px;background:var(--bg-2);color:var(--text-2)">${esc(t)}</span>`;
    });
    html += `</div>`;
  }

  // Check if on build page
  const onBuildPage = !document.getElementById('buildPage')?.classList.contains('hidden');
  if (onBuildPage) {
    const isCrest = buildCrests.find(c => c.name === name);
    const alreadyInBuild = isCrest ? buildState.crest?.name === name : buildState.items.some(i => i?.name === name);
    const buildFull = isCrest ? !!buildState.crest : !buildState.items.includes(null);
    if (!alreadyInBuild && !buildFull) {
      html += `<button onclick="addItemToBuild('${esc(name).replace(/'/g, "\\'")}'); document.querySelector('.tag-modal-overlay')?.remove();" style="width:100%;margin-top:0.75rem;padding:0.6rem;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer">Add to Build</button>`;
    } else if (alreadyInBuild) {
      html += `<div style="text-align:center;margin-top:0.5rem;color:var(--text-2);font-size:0.8rem">Already in build</div>`;
    }
  }

  html += `</div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ── Data Loading ──
async function findLatestVersion() {
  // Try manifest first (fast, no 404 spam)
  try {
    const mRes = await fetch(`${DATA_BASE}/manifest.json${CACHE_BUST}`);
    if (mRes.ok) {
      const manifest = await mRes.json();
      if (manifest.latest) return manifest.latest;
    }
  } catch {}
  // Fallback: probe folders
  const today = new Date();
  const gameVersions = ['1.11.2','1.11.1','1.11.0','1.10.2','1.10.1','1.10.0','1.9.0','1.8.0'];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const candidates = [dateStr].concat(gameVersions.map(gv => `${gv}_${dateStr}`));
    for (const folder of candidates) {
      try {
        const res = await fetch(`${DATA_BASE}/${folder}/heroes.json${CACHE_BUST}`);
        if (res.ok) { const data = await res.json(); const c = data.heroCount || (data.heroes ? data.heroes.length : 0); if (c >= 10) return folder; }
      } catch {}
    }
  }
  return null;
}

async function loadHeroData(version, slug) {
  if (heroCache[slug]) return heroCache[slug];
  const res = await fetch(`${DATA_BASE}/${version}/${slug}.json${CACHE_BUST}`);
  const raw = await res.json();
  let normalized;
  if (raw.roles && typeof raw.roles === 'object') {
    normalized = { name: raw.name || raw.hero, slug: raw.slug, activeRoles: raw.activeRoles || Object.keys(raw.roles).filter(r => r !== 'all'), roles: raw.roles };
  } else {
    const { name, slug: s, scrapedAt, ...rest } = raw;
    normalized = { name, slug: s, activeRoles: ['all'], roles: { all: rest } };
  }
  normalized.name = NAME_FIX[normalized.name] || normalized.name;
  for (const role of Object.keys(normalized.roles)) {
    const rd = normalized.roles[role];
    if (!rd.counters || rd.counters.length === 0) {
      const merged = [...(rd.strongAgainst||[]), ...(rd.weakAgainst||[])];
      const seen = new Set();
      rd.counters = merged.filter(c => { if (seen.has(c.hero)) return false; seen.add(c.hero); return true; });
    }
    if (rd.counters) rd.counters.forEach(c => { c.hero = NAME_FIX[c.hero] || c.hero; });
  }
  heroCache[slug] = normalized;
  return normalized;
}

function getRoleData(hero, role) {
  if (!hero) return null;
  return hero.roles[role] || hero.roles[hero.activeRoles?.[0]] || Object.values(hero.roles)[0];
}

// ══════════════════════════════════════════
// NAVIGATION / ROUTING
// ══════════════════════════════════════════

function showPage(pageId) {
  document.querySelectorAll('.page, #landingPage').forEach(p => p.classList.add('hidden'));
  const el = document.getElementById(pageId);
  if (el) el.classList.remove('hidden');
  if (pageId === 'landingPage') el.classList.remove('hidden'); // landingPage isn't .page
}

function navigate(flow, heroSlug) {
  window.scrollTo(0, 0);
  currentFlow = flow;
  const bar = document.getElementById('breadcrumbBar');
  const text = document.getElementById('breadcrumbText');

  if (!flow) {
    // Home
    bar.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('landingPage').classList.remove('hidden');
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  bar.style.display = '';

  if (flow === 'learn' && !heroSlug) {
    text.textContent = 'Learn a Hero';
    showPage('heroGridPage');
    document.getElementById('heroGridTitle').textContent = 'Choose Your Hero';
    renderHeroGrid('heroGrid', (slug) => {
      navigate('learn', slug);
    });
    location.hash = '#learn';
  } else if (flow === 'learn' && heroSlug) {
    const name = heroProfiles[heroSlug]?.name || heroSlug;
    text.textContent = `Learn: ${name}`;
    showPage('learnPage');
    loadLearnHero(heroSlug);
    location.hash = `#learn/${heroSlug}`;
  } else if (flow === 'counter' && !heroSlug) {
    text.textContent = 'Counter a Hero';
    showPage('heroGridPage');
    document.getElementById('heroGridTitle').textContent = 'Which Enemy Hero?';
    renderHeroGrid('heroGrid', (slug) => {
      navigate('counter', slug);
    });
    location.hash = '#counter';
  } else if (flow === 'counter' && heroSlug) {
    const name = heroProfiles[heroSlug]?.name || heroSlug;
    text.textContent = `Counter: ${name}`;
    showPage('counterPage');
    loadCounterHero(heroSlug);
    location.hash = `#counter/${heroSlug}`;
  } else if (flow === 'draft') {
    text.textContent = 'Draft Helper';
    showPage('draftPage');
    renderDraftSlots();
    updateDraftSuggestions();
    location.hash = '#draft';
  } else if (flow === 'build') {
    text.textContent = 'Build Lab';
    showPage('buildPage');
    initBuildLab();
    location.hash = '#build';
  } else if (flow === 'about') {
    text.textContent = 'About';
    showPage('aboutPage');
    location.hash = '#about';
  }
}

function handleHashRoute() {
  const hash = location.hash.slice(1);
  if (!hash) { navigate(null); return; }
  const parts = hash.split('/');
  if (parts[0] === 'learn') {
    if (parts[1]) navigate('learn', parts[1]);
    else navigate('learn');
  } else if (parts[0] === 'counter') {
    if (parts[1]) navigate('counter', parts[1]);
    else navigate('counter');
  } else if (parts[0] === 'draft') {
    navigate('draft');
  } else if (parts[0] === 'build') {
    navigate('build');
  } else if (parts[0] === 'about') {
    navigate('about');
  } else {
    navigate(null);
  }
}

// ══════════════════════════════════════════
// HERO GRID COMPONENT
// ══════════════════════════════════════════

function renderHeroGrid(containerId, onClick, opts = {}) {
  const container = document.getElementById(containerId);
  const { unavailable = new Set(), picked = new Set() } = opts;

  let html = '';
  heroIndex.forEach(h => {
    const slug = h.slug;
    const name = heroProfiles[slug]?.name || h.name || slug;
    const cls = unavailable.has(slug) ? 'hero-grid-item unavailable' : picked.has(slug) ? 'hero-grid-item picked' : 'hero-grid-item';
    const roles = getHeroRoles(slug).join(' ');
    html += `<div class="${cls}" data-slug="${esc(slug)}" data-name="${esc(name.toLowerCase())}" data-roles="${roles}">`;
    html += `<img class="hero-portrait" src="img/heroes/${slug}.webp" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
    html += `<div class="hero-portrait-fallback" style="display:none">⚔</div>`;
    html += `<div class="hero-grid-name">${esc(name)}</div>`;
    html += '</div>';
  });
  container.innerHTML = html;

  container.querySelectorAll('.hero-grid-item').forEach(item => {
    item.onclick = () => {
      if (item.classList.contains('unavailable')) return;
      onClick(item.dataset.slug);
    };
  });
}

function setupGridFilters(searchId, filterContainerId, gridId) {
  const search = document.getElementById(searchId);
  const filterContainer = document.getElementById(filterContainerId);
  const grid = document.getElementById(gridId);

  if (search) {
    search.oninput = () => filterGrid(grid, search.value, getActiveRole(filterContainer));
    search.value = '';
  }
  if (filterContainer) {
    filterContainer.querySelectorAll('.role-btn').forEach(btn => {
      btn.onclick = () => {
        filterContainer.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterGrid(grid, search?.value || '', btn.dataset.role);
      };
    });
  }
}

function getActiveRole(filterContainer) {
  const active = filterContainer?.querySelector('.role-btn.active');
  return active?.dataset.role || 'all';
}

function filterGrid(grid, searchText, role) {
  if (!grid) return;
  const query = searchText.toLowerCase().trim();
  grid.querySelectorAll('.hero-grid-item').forEach(item => {
    const name = item.dataset.name || '';
    const roles = item.dataset.roles || '';
    const matchesSearch = !query || name.includes(query);
    const matchesRole = role === 'all' || roles.includes(role);
    item.style.display = (matchesSearch && matchesRole) ? '' : 'none';
  });
}

// ══════════════════════════════════════════
// FLOW 1: LEARN A HERO
// ══════════════════════════════════════════

async function loadLearnHero(slug) {
  currentHero = await loadHeroData(currentVersion, slug);
  // Auto-detect most played role (highest total matches)
  if (currentHero.roles) {
    let bestRole = null, bestMatches = -1;
    for (const [role, rd] of Object.entries(currentHero.roles)) {
      if (role === 'all') continue;
      const totalMatches = (rd.buildTabs || []).reduce((sum, b) => sum + (parseInt(String(b.matches).replace(/\D/g,'')) || 0), 0);
      if (totalMatches > bestMatches) { bestMatches = totalMatches; bestRole = role; }
    }
    currentRole = bestRole || currentHero.activeRoles?.[0] || Object.keys(currentHero.roles)[0];
  } else {
    currentRole = currentHero.activeRoles?.[0] || 'all';
  }
  document.getElementById('learnRoleSelect').value = currentRole;

  switchLearnTab('overview'); // Always start on Overview
  renderLearnHeader();
  renderOverview();
  renderAbilities();
  renderCounters();
  renderSynergy();
  renderStats();
  // Reset matchup
  document.getElementById('enemySelect').value = '';
  renderMatchup();
}

function renderLearnHeader() {
  const el = document.getElementById('learnHeroHeader');
  const hero = currentHero;
  const profile = heroProfiles[hero.slug];
  let html = `<img class="learn-hero-portrait" src="img/heroes/${hero.slug}.webp" alt="${esc(hero.name)}" onerror="this.style.display='none'">`;
  html += '<div>';
  html += `<h2 style="font-size:1.4rem;margin-bottom:0.25rem">${esc(hero.name)}</h2>`;
  if (profile) {
    html += renderProfileBadges(profile);
    html += renderArchetypeTags(profile);
  }
  html += '</div>';
  el.innerHTML = html;
}

function switchLearnTab(tabId) {
  document.querySelectorAll('#learnTabBar .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('#learnTabPanels .tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tabId));
}

// ── OVERVIEW TAB ──
// Build description generator — plain-language "use this to..." from build name
function describeBuild(buildName) {
  const n = (buildName || '').toLowerCase();
  const parts = n.split('/').map(s => s.trim());
  const descs = {
    'burst':           'Dump abilities fast to delete a target',
    'poke':            'Chip them down from range before committing',
    'sustain':         'Outlast them with healing and staying power',
    'on-hit':          'Stack damage through basic attacks over time',
    'crit':            'Hit harder with crit strikes in extended fights',
    'anti tank':       'Shred tanky targets with pen and % damage',
    'scaling':         'Farm up and become a monster late game',
    'dot':             'Apply damage over time and wear them down',
    'pen':             'Cut through defenses for consistent damage',
    'dueling':         'Win 1v1 fights in lane or splitpush',
    'heal&shield':     'Keep your team alive with heals and shields',
    'enchant':         'Buff and empower your allies in fights',
    'aura/enchant':    'Buff your team just by standing near them',
    'area damage':     'Deal damage to everyone in teamfights',
    'mana regen':      'Never run out of abilities to cast',
    'mobility':        'Move fast to rotate, chase, or escape',
    'control':         'Lock enemies down with CC and zone them out',
    'anti disruption': 'Stay in the fight through CC and disruption',
  };
  // Check exact match first (for compound names like "Aura/Enchant")
  if (descs[n]) return descs[n];
  // Build compound description from parts
  const mapped = parts.map(p => descs[p]).filter(Boolean);
  if (mapped.length === 2) {
    // Combine intelligently
    const combos = {
      'burst/poke':        'Poke them down, then burst for the kill',
      'burst/crit':        'Crit-powered burst to one-shot squishies',
      'burst/on-hit':      'Burst combo into sustained on-hit damage',
      'burst/pen':         'Burst through defenses with armor pen',
      'burst/dot':         'Burst upfront then let DoT finish them',
      'crit/burst':        'Crit-powered burst to one-shot squishies',
      'crit/on-hit':       'Auto-attack carry with crit and on-hit procs',
      'crit/sustain':      'Sustained crit carry that heals through fights',
      'on-hit/burst':      'On-hit procs with burst ability combos',
      'on-hit/crit':       'Auto-attack carry with crit and on-hit procs',
      'on-hit/sustain':    'Sustained auto attacks with built-in healing',
      'on-hit/dot':        'Stack on-hit and DoT for relentless damage',
      'on-hit/mobility':   'Fast-moving auto attacker that kites or chases',
      'on-hit/anti tank':  'Shred tanks with on-hit % damage',
      'on-hit/heal&shield':'Auto attacks that heal your team',
      'pen/burst':         'Pen-stacked burst to blow up anyone',
      'pen/poke':          'Poke through defenses from range',
      'pen/on-hit':        'Pen-stacked auto attacks for tank shred',
      'pen/sustain':       'Penetrate defenses while staying healthy',
      'pen/scaling':       'Scale into a late-game pen powerhouse',
      'pen/mobility':      'Fast rotations with armor-shredding damage',
      'poke/burst':        'Poke them low, then burst for the kill',
      'poke/anti tank':    'Chip down tanks from range with pen',
      'sustain/burst':     'Survive the fight, then burst when they\'re low',
      'sustain/on-hit':    'Sustained auto attacks with built-in healing',
      'sustain/pen':       'Outlast while cutting through defenses',
      'sustain/scaling':   'Farm safely and scale into a late-game carry',
      'sustain/anti tank': 'Outlast tanks and shred them over time',
      'sustain/enchant':   'Keep your team alive while buffing them',
      'scaling/burst':     'Farm up and one-shot people late game',
      'scaling/on-hit':    'Scale into a monster auto attacker',
      'scaling/anti tank': 'Scale into a late-game tank shredder',
      'scaling/pen':       'Scale into a late-game pen powerhouse',
      'scaling/sustain':   'Farm safely and outlast everyone late',
      'anti tank/burst':   'Burst down tanks with pen and raw damage',
      'anti tank/control': 'Lock down tanks and shred them',
      'anti tank/dot':     'Melt tanks with % damage over time',
      'anti tank/enchant': 'Buff your team while shredding tanks',
      'anti tank/on-hit':  'Shred tanks with on-hit % damage',
      'anti tank/pen':     'Maximum pen to cut through any tank',
      'anti tank/sustain': 'Outlast tanks and shred them over time',
      'enchant/heal&shield':'Max healing and buffing for your team',
    };
    if (combos[n]) return combos[n];
    return mapped[0] + ', plus ' + mapped[1].toLowerCase();
  }
  if (mapped.length === 1) return mapped[0];
  return null;
}

function renderOverview() {
  const el = document.getElementById('overviewContent');
  if (!currentHero) { el.innerHTML = ''; return; }
  const hero = currentHero;
  const profile = heroProfiles[hero.slug];
  const rd = getRoleData(hero, currentRole);
  if (!rd) { el.innerHTML = '<p style="color:var(--text-2)">No data for this role</p>'; return; }

  let html = '';

  // Augments & Crests (top of overview)
  const augments = (rd.augments||[]).sort((a,b) => parseFloat(b.winRate) - parseFloat(a.winRate)).slice(0,3);
  const crests = (rd.crests||[]).sort((a,b) => parseFloat(b.winRate) - parseFloat(a.winRate)).slice(0,3);
  if (augments.length || crests.length) {
    html += '<div class="grid-2">';
    if (augments.length) {
      html += '<div class="card"><h2>⚡ Best Augments</h2>';
      augments.forEach(a => {
        const wr = parseFloat(a.winRate)||0;
        const profileAug = (profile?.augments||[]).find(pa => pa.name.trim().toLowerCase() === a.name.trim().toLowerCase());
        const desc = profileAug ? profileAug.description.replace(/<[^>]+>/g, '').substring(0, 120) : '';
        const tags = profileAug?.traits || [];
        const shift = profileAug?.playstyleShift;
        html += `<div class="augment-row">`;
        html += augmentImg(a.name);
        html += `<div class="augment-info">`;
        html += `<div class="aug-name">${esc(a.name)}</div>`;
        if (desc) html += `<div class="aug-desc">${esc(desc)}</div>`;
        if (tags.length || shift) {
          html += '<div class="aug-tags">';
          tags.forEach(t => html += `<span class="aug-tag" data-tag-label="${esc(traitLabel(t))}" style="cursor:pointer">${esc(traitLabel(t))}</span>`);
          if (shift && !tags.includes(shift)) html += `<span class="aug-tag shift" data-tag-label="${esc(traitLabel(shift))}" style="cursor:pointer">+${esc(traitLabel(shift))}</span>`;
          html += '</div>';
        }
        // Playstyle tip
        const playstyleNote = profileAug ? augmentPlaystyleNote(profileAug) : '';
        if (playstyleNote) html += `<div style="color:var(--accent);font-size:0.75rem;margin-top:0.2rem;font-style:italic">💡 ${esc(playstyleNote)}</div>`;
        html += `</div>`;
        html += `<div class="augment-stats"><span class="${wrClass(wr)}">${a.winRate||'—'}</span><br><span style="color:var(--text-2);font-size:0.72rem">${a.matches||'?'} games</span></div>`;
        html += `</div>`;
      });
      html += '</div>';
    }
    if (crests.length) {
      html += '<div class="card"><h2>🛡️ Best Crests</h2>';
      crests.forEach(c => {
        const wr = parseFloat(c.winRate)||0;
        html += `<div class="augment-row" style="cursor:pointer" onclick="showItemModal('${esc(c.name).replace(/'/g,"\\'")}')">`;
        html += crestImg(c.name);
        html += `<div class="augment-info"><div class="aug-name">${esc(c.name)}</div></div>`;
        html += `<div class="augment-stats"><span class="${wrClass(wr)}">${c.winRate||'—'}</span><br><span style="color:var(--text-2);font-size:0.72rem">${c.matches||'?'} games</span></div>`;
        html += `</div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // Top 3 builds
  const builds = (rd.buildTabs || []).sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
  if (builds.length) {
    html += '<div class="card"><h2>🏆 Top Builds</h2>';
    html += '<div class="grid-3" id="buildCards">';
    builds.slice(0, 3).forEach((b, i) => {
      const medal = ['🥇','🥈','🥉'][i];
      const wr = parseFloat(b.winRate) || 0;
      const desc = describeBuild(b.name);
      html += `<div class="build-card${i===0?' active':''}" data-build-idx="${i}">`;
      html += `<div class="build-card-header"><span class="build-card-name">${medal} ${esc(b.name || 'Build '+(i+1))}</span>`;
      html += `<span class="${wrClass(wr)}">${esc(b.winRate||'—')}</span></div>`;
      if (desc) html += `<div style="color:var(--text-2);font-size:0.8rem;margin:0.25rem 0 0.4rem;font-style:italic">${esc(desc)}</div>`;
      html += `<div class="build-card-items">${b.items.map(n => `<span>${itemWithImg(n)}</span>`).join('<span class="build-arrow">→</span>')}</div>`;
      html += `<div style="color:var(--text-2);font-size:0.75rem;margin-top:0.3rem">${esc(b.matches||'')}</div>`;
      html += '</div>';
    });
    html += '</div>';
    html += '<div id="buildItemSlots"></div>';
    html += '</div>';
  }

  // Attribute bars
  if (profile?.attributes) {
    html += '<div class="card"><h2>📊 Attributes</h2>';
    html += '<div class="attr-grid">';
    for (const [key, val] of Object.entries(profile.attributes)) {
      const label = key.replace(/([A-Z])/g, ' $1').trim();
      const pct = (val / 10) * 100;
      const color = val >= 7 ? 'var(--green)' : val >= 4 ? 'var(--gold)' : 'var(--red)';
      html += `<span class="attr-label">${esc(label)}</span>`;
      html += `<div class="attr-bar-wrap"><div class="attr-bar" style="width:${pct}%;background:${color}"></div></div>`;
      html += `<span class="attr-val">${val}</span>`;
    }
    html += '</div></div>';
  }

  // Best Teammates (hidden for support/carry — covered by Duo Synergy tab)
  if (currentRole !== 'support' && currentRole !== 'carry') {
    html += renderBestLanePartners(hero.slug, currentRole);
  }

  el.innerHTML = html;

  // Wire build card selection + render initial item slots
  const buildCards = el.querySelectorAll('.build-card');
  const rd2 = getRoleData(hero, currentRole);
  const builds2 = (rd2?.buildTabs || []).sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate)).slice(0,3);
  function renderItemSlots(buildIdx) {
    const slotsEl = document.getElementById('buildItemSlots');
    if (!slotsEl || !rd2?.itemSlots) { if(slotsEl) slotsEl.innerHTML=''; return; }
    const selectedBuild = builds2[buildIdx];
    const coreItems = new Set((selectedBuild?.items || []).map(n => n.toLowerCase()));
    let sh = '';
    for (const [slotKey, items] of Object.entries(rd2.itemSlots)) {
      if (!items?.length) continue;
      // Filter out items already in the selected build's core
      const filtered = items.filter(it => !coreItems.has(it.name.toLowerCase())).slice(0, 4);
      if (!filtered.length) continue;
      sh += `<div class="slot-section"><div class="slot-label">${esc(slotKey)} Item Options</div><div class="slot-items">`;
      filtered.forEach(it => {
        const wr = parseFloat(it.winRate)||0;
        sh += `<span class="item-pill" title="${esc(it.name)}: ${wr.toFixed(1)}% WR in ${it.matches||'?'} games">${itemWithImg(it.name)} <span class="${wrClass(wr)}">${it.winRate||'—'}</span> <span style="color:var(--text-2);font-size:0.72rem">${it.matches||'?'}m</span></span>`;
      });
      sh += '</div></div>';
    }
    slotsEl.innerHTML = sh;
  }
  buildCards.forEach(card => {
    card.onclick = () => {
      buildCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      renderItemSlots(parseInt(card.dataset.buildIdx));
    };
  });
  renderItemSlots(0); // initial render for first build
}

// ── ABILITIES TAB ──
function getAbilityPlatform() { return localStorage.getItem('pred-platform') || 'pc'; }
function setAbilityPlatform(p) { localStorage.setItem('pred-platform', p); }
const ABILITY_KEY_MAPS = {
  pc:   { BASIC:'LMB', ALTERNATE:'RMB', PRIMARY:'Q', SECONDARY:'E', ULTIMATE:'R', PASSIVE:'Passive' },
  xbox: { BASIC:'RT', ALTERNATE:'RB', PRIMARY:'X', SECONDARY:'B', ULTIMATE:'Y', PASSIVE:'Passive' },
  ps5:  { BASIC:'R2', ALTERNATE:'R1', PRIMARY:'□', SECONDARY:'○', ULTIMATE:'△', PASSIVE:'Passive' },
};
function abilityKeyLabel(key) {
  const map = ABILITY_KEY_MAPS[getAbilityPlatform()] || ABILITY_KEY_MAPS.pc;
  return map[key] || key;
}
function abilityKeyOrder(key) {
  const order = { PASSIVE:0, BASIC:1, ALTERNATE:2, PRIMARY:3, SECONDARY:4, ULTIMATE:5 };
  return order[key] ?? 9;
}
const AUGMENT_PLAYSTYLE_TIPS = {
  healing: 'You gain sustain in fights. Play more aggressive in trades knowing you can heal back up',
  self_heal: 'You can self-sustain now. Take longer trades and force the enemy to commit resources to finish you',
  ally_heal: 'You can keep teammates alive. Position near your carry and save your healing for key moments',
  self_shield: 'Extra survivability. Use the shield window to take trades you normally wouldn\'t win',
  ally_shield: 'You can shield teammates through burst. Watch for enemy combos and time your shield to absorb the big hit',
  health_sustain: 'You can stay in lane longer. Use this to out-farm and out-trade opponents who have to back',
  mana_sustain: 'You won\'t run dry. Spam abilities to pressure and zone without worrying about mana',
  execute: 'You have kill pressure on low-HP targets. Track enemy health bars and commit when they\'re in range',
  stealth: 'You can go invisible for plays. Use it to reposition, flank, or escape. Enemy wards counter this',
  team_stealth: 'Your whole team can go unseen. Coordinate ganks and rotations with the stealth window',
  shield: 'You get a shield for survivability. Time it before taking damage, not after',
  burst_amp: 'Your burst gets stronger. Look for one-shot windows on squishy targets',
  cd_reset: 'Your abilities come back faster. You can cycle through rotations more in extended fights',
  range_ext: 'You outrange more matchups now. Abuse the extra distance to poke safely',
  damage_reduction: 'You\'re tankier in fights. You can front-line more and absorb cooldowns for your team',
  armor_shred: 'You shred armor. Focus the tankiest target since your damage cuts through their defenses',
  anti_heal: 'You apply anti-heal. Prioritize hitting enemy healers or sustain-heavy targets first',
  unstoppable: 'You can\'t be interrupted. Use this to force engages through CC-heavy teams',
  zone_control: 'You control space better. Place abilities to cut off escape routes and force fights on your terms',
  isolation: 'You punish lone targets. Look for picks on enemies who split from their team',
  mobility: 'You\'re harder to pin down. Use the extra movement to dodge skillshots and reposition in fights',
  scaling: 'You scale harder into late game. Farm up and don\'t force early fights you don\'t need',
  cc: 'More crowd control in your kit. Layer CC with your team for longer lockdowns',
  on_hit: 'On-hit synergy unlocked. Build attack speed items to maximize procs per fight',
  as_steroid: 'You ramp up in extended trades. Stick to targets and let your attack speed do the work',
  cleanse: 'You can cleanse CC. Save it for the big stun or root, don\'t waste it on slows',
  global: 'You can impact the whole map. Watch for cross-map opportunities and plays in other lanes',
  dot: 'Damage over time wears enemies down. Poke and rotate, let the DoT do work between fights',
  poke: 'Better poke from range. Whittle them down before committing to an all-in',
  displacement: 'You can reposition enemies. Use it to peel for carries or pull targets into your team',
  true_damage: 'True damage ignores all armor and magic resist. Focus tanks since they can\'t itemize against it',
  spam: 'Ability spam unlocked. Keep the pressure constant and overwhelm with volume',
  economy: 'Extra gold generation. This compounds over time so play safe and farm efficiently',
};

function augmentPlaystyleNote(aug) {
  const t = (aug.traits || []);
  const shift = aug.playstyleShift;
  const notes = [];
  for (const trait of t) {
    if (AUGMENT_PLAYSTYLE_TIPS[trait]) { notes.push(AUGMENT_PLAYSTYLE_TIPS[trait]); break; } // show most impactful one
  }
  if (!notes.length && shift) notes.push('Shifts your playstyle toward ' + shift);
  if (!notes.length && t.length) return t.map(x => titleCase(x.replace(/_/g,' '))).join(', ');
  return notes.join('. ');
}
function renderAbilities() {
  const el = document.getElementById('abilitiesContent');
  if (!currentHero) { el.innerHTML = ''; return; }
  const profile = heroProfiles[currentHero.slug];
  const abilities = profile?.abilities || [];
  const augments = profile?.augments || [];
  const rd = getRoleData(currentHero, currentRole);
  const topAugments = (rd?.augments || []).sort((a,b) => parseFloat(b.winRate) - parseFloat(a.winRate));

  let html = '';

  // Augments with descriptions and notes (above abilities)
  if (augments.length) {
    html += '<div class="card"><h2>⚡ Augments</h2>';
    html += '<p style="color:var(--text-2);font-size:0.8rem;margin-bottom:0.5rem">Each augment modifies one of your abilities. Pick based on your matchup and team needs.</p>';
    augments.forEach(aug => {
      const cleanDesc = aug.description ? aug.description.replace(/<[^>]+>/g, '').replace(/<img[^>]*>/g, '') : '';
      const note = augmentPlaystyleNote(aug);
      // Find WR data if available
      const wrData = topAugments.find(a => a.name.trim().toLowerCase() === aug.name.trim().toLowerCase());
      html += `<div style="padding:0.5rem 0;border-bottom:1px solid var(--bg-3)">`;
      html += `<div style="display:flex;align-items:center;gap:0.5rem">`;
      html += augmentImg(aug.name);
      html += `<span style="font-weight:600;font-size:0.85rem">${esc(aug.name)}</span>`;
      if (wrData) html += `<span class="${wrClass(parseFloat(wrData.winRate))}" style="font-size:0.8rem;margin-left:auto">${wrData.winRate}</span>`;
      else html += `<span style="font-size:0.75rem;color:var(--text-2);margin-left:auto;font-style:italic">No data</span>`;
      html += `</div>`;
      if (cleanDesc) html += `<div style="color:var(--text-2);font-size:0.78rem;margin-top:0.2rem;line-height:1.3">${esc(cleanDesc.substring(0, 250))}</div>`;
      if (note) html += `<div style="color:var(--accent);font-size:0.75rem;margin-top:0.2rem;font-style:italic">💡 ${esc(note)}</div>`;
      html += `</div>`;
    });
    html += '</div>';
  }

  // Abilities
  if (abilities.length) {
    html += '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem"><h2 style="margin:0">🎯 Abilities</h2>';
    const plat = getAbilityPlatform();
    html += '<div class="platform-toggle" style="display:inline-flex;gap:0.25rem;background:var(--bg-1);border:1px solid var(--border);border-radius:6px;padding:2px;font-size:0.75rem">';
    [{id:'pc',label:'⌨️ PC'},{id:'xbox',label:'Ⓧ Xbox'},{id:'ps5',label:'△ PS5'}].forEach(o => {
      const active = o.id === plat;
      html += `<button class="platform-btn" data-platform="${o.id}" style="padding:3px 8px;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem;${active?'background:var(--accent);color:#fff':'background:transparent;color:var(--text-2)'}">${o.label}</button>`;
    });
    html += '</div></div>';
    const sorted = [...abilities].sort((a,b) => abilityKeyOrder(a.key) - abilityKeyOrder(b.key));
    sorted.forEach(ab => {
      const keyLabel = abilityKeyLabel(ab.key);
      html += `<div class="ability-row" style="padding:0.5rem 0;border-bottom:1px solid var(--bg-3)">`;
      html += `<div style="display:flex;align-items:center;gap:0.5rem">`;
      html += `<span style="background:var(--bg-3);color:var(--accent);font-weight:700;font-size:0.7rem;padding:0.15rem 0.4rem;border-radius:4px;min-width:2rem;text-align:center">${esc(keyLabel)}</span>`;
      html += `<span style="font-weight:600;font-size:0.9rem">${esc(ab.name)}</span>`;
      if (ab.type) html += `<span style="font-size:0.7rem;color:var(--text-2)">${esc(ab.type)}</span>`;
      html += `</div>`;
      if (ab.summary) html += `<div style="color:var(--text-2);font-size:0.8rem;margin-top:0.2rem;line-height:1.4">${esc(ab.summary)}</div>`;
      html += `</div>`;
    });
    html += '</div>';
  }

  // Skill Priority & Level Order (from role data)
  if (rd) {
    const hasSkillData = rd.skillPriority?.length || rd.skillOrder?.length;
    if (hasSkillData) {
      html += '<div class="card"><h2>🎮 Skill Priority</h2>';
      if (rd.skillPriority?.length) {
        html += '<div class="skill-priority">';
        rd.skillPriority.forEach((s,i) => {
          html += `<span class="skill-badge">${esc(s)}</span>`;
          if (i < rd.skillPriority.length - 1) html += '<span class="skill-arrow">▸</span>';
        });
        html += '</div>';
      }
      if (rd.skillOrder?.length) {
        html += '<div class="skill-order-table"><table><tr><th></th>';
        for (let i=1;i<=18;i++) html += `<th>${i}</th>`;
        html += '</tr>';
        rd.skillOrder.forEach(skill => {
          const lvls = new Set(skill.levels);
          html += `<tr><td class="skill-name">${esc(skill.name)}</td>`;
          for (let i=1;i<=18;i++) html += lvls.has(i) ? `<td class="skill-level">${i}</td>` : '<td></td>';
          html += '</tr>';
        });
        html += '</table></div>';
      }
      html += '</div>';
    }
  }

  if (!abilities.length && !augments.length) {
    html = '<div class="card"><p style="color:var(--text-2)">Ability data not available for this hero.</p></div>';
  }

  el.innerHTML = html;

  // Wire platform toggle
  el.querySelectorAll('.platform-btn').forEach(btn => {
    btn.onclick = () => {
      setAbilityPlatform(btn.dataset.platform);
      renderAbilities();
    };
  });
}

// ── MATCHUPS TAB ── (same as original)
async function renderMatchup() {
  const el = document.getElementById('matchupContent');
  const enemySlug = document.getElementById('enemySelect').value;
  if (!currentHero || !enemySlug) {
    el.innerHTML = `<div class="matchup-empty"><p>🎯 Select an enemy hero to get matchup-specific builds, ability tips, and counter strategies.</p></div>`;
    return;
  }

  el.innerHTML = '<p style="color:var(--text-2)">Analyzing…</p>';

  if (typeof MatchupEngine !== 'undefined' && !MatchupEngine.isReady()) {
    try { await MatchupEngine.init(DATA_BASE); } catch(e) { console.warn('MatchupEngine init failed', e); }
  }
  if (typeof AbilityInteractions !== 'undefined' && !AbilityInteractions.isReady()) {
    try { await AbilityInteractions.init(DATA_BASE); } catch(e) { console.warn('AbilityInteractions init failed', e); }
  }

  const heroDataMap = {};
  try { heroDataMap[currentHero.slug] = currentHero; } catch {}
  try { heroDataMap[enemySlug] = await loadHeroData(currentVersion, enemySlug); } catch {}

  const result = MatchupEngine.counterBuildPath(currentHero.slug, currentRole, enemySlug, heroDataMap);
  if (result.error) { el.innerHTML = `<p style="color:var(--red)">${esc(result.error)}</p>`; return; }

  let html = '';

  // Confidence warnings
  const warnings = [];
  if (result.roleInfo?.isRoleMismatch) {
    warnings.push({ type:'warning', icon:'⚠️', text:`${esc(result.roleInfo.heroName)} isn't commonly played ${esc(result.roleInfo.requestedRole)} — showing ${esc(result.roleInfo.fallbackRole)} data` });
  }
  if (result.counterData?.yourVsEnemy) {
    const cd = result.counterData.yourVsEnemy;
    warnings.push({ type: cd.winRate>=50?'positive':'negative', icon:'📊', text:`${esc(result.yourHero.name)} has <span class="${wrClass(cd.winRate)}" style="font-weight:600">${cd.winRate.toFixed(1)}%</span> WR vs ${esc(result.vsEnemy.name)} in ${cd.matches} games` });
  } else if (result.counterData?.enemyVsYou) {
    const cd = result.counterData.enemyVsYou;
    const yourWR = (100 - cd.enemyWinRate).toFixed(1);
    warnings.push({ type: parseFloat(yourWR)>=50?'positive':'negative', icon:'📊', text:`${esc(result.vsEnemy.name)} has ${cd.enemyWinRate.toFixed(1)}% WR vs you (≈ <span class="${wrClass(parseFloat(yourWR))}" style="font-weight:600">${yourWR}%</span> for you)` });
  } else {
    warnings.push({ type:'warning', icon:'⚠️', text:'No direct matchup data — based on kit analysis' });
  }

  if (warnings.length) {
    html += '<div class="confidence-banner">';
    warnings.forEach(w => {
      const cls = w.type === 'positive' ? 'confidence-positive' : w.type === 'negative' ? 'confidence-negative' : 'confidence-warning';
      html += `<div class="confidence-item ${cls}">${w.icon} ${w.text}</div>`;
    });
    html += '</div>';
  }

  // Combined Matchup Intel: Augment Scouting + Ability Tips
  {
    const enemyProfile = heroProfiles[enemySlug];
    const hasAbilityTips = typeof AbilityInteractions !== 'undefined' && AbilityInteractions.isReady();
    const abilityTips = hasAbilityTips ? AbilityInteractions.generateTips(currentHero.slug, enemySlug) : [];
    const hasAugments = enemyProfile?.augments?.length > 0;

    if (hasAugments || abilityTips.length) {
      html += '<div class="card"><h3>⚔️ Matchup Intel</h3>';

      // Augment Scouting Report
      if (hasAugments) {
        const enemyRd = heroDataMap[enemySlug] ? getRoleData(heroDataMap[enemySlug], currentRole) : null;
        const topAugs = (enemyRd?.augments || []).sort((a,b) => parseFloat(b.winRate) - parseFloat(a.winRate));
        const bestAugName = topAugs[0]?.name?.trim().toLowerCase();

        html += '<div style="margin-bottom:0.75rem"><div style="font-size:0.82rem;font-weight:600;color:var(--text-1);margin-bottom:0.4rem">🔍 Their Augments</div>';

        enemyProfile.augments.forEach(aug => {
          const wrData = topAugs.find(a => a.name.trim().toLowerCase() === aug.name.trim().toLowerCase());
          const isBest = aug.name.trim().toLowerCase() === bestAugName;
          const hasShift = aug.playstyleShift;
          const newTraits = (aug.traits || []).filter(t => !(enemyProfile.baseTraits || []).includes(t));

          html += `<div style="padding:0.5rem;margin-bottom:0.4rem;border-radius:8px;border:1px solid ${isBest ? 'var(--accent)' : 'var(--border)'};background:var(--bg-2)${isBest ? ';box-shadow:0 0 8px rgba(139,92,246,0.15)' : ''}">`;
          html += '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">';
          html += augmentImg(aug.name);
          html += `<span style="font-weight:600;font-size:0.85rem">${esc(aug.name)}</span>`;
          if (isBest) html += '<span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:var(--accent);color:#fff">Most Picked</span>';
          if (wrData) html += `<span class="${wrClass(parseFloat(wrData.winRate))}" style="font-size:0.8rem;margin-left:auto">${wrData.winRate}</span>`;
          else html += '<span style="font-size:0.75rem;color:var(--text-2);margin-left:auto;font-style:italic">No data</span>';
          html += '</div>';

          if (hasShift) {
            html += `<div style="margin-top:0.3rem;font-size:0.78rem;color:var(--yellow, #eab308)">⚡ Shifts toward <strong>${esc(titleCase(hasShift))}</strong></div>`;
          }

          const tips = [];
          for (const trait of newTraits) {
            if (AUGMENT_TRAIT_TIPS[trait]) tips.push(AUGMENT_TRAIT_TIPS[trait]);
          }
          if (tips.length) {
            tips.forEach(tip => {
              html += `<div style="margin-top:0.2rem;font-size:0.75rem;color:var(--text-2)">💡 ${esc(tip)}</div>`;
            });
          }
          // Show description as fallback context when no trait tips
          const cleanDesc = aug.description ? aug.description.replace(/<[^>]+>/g, '').substring(0, 150) : '';
          if (cleanDesc) {
            html += `<div style="margin-top:0.2rem;font-size:0.75rem;color:var(--text-2);font-style:italic">${esc(cleanDesc)}</div>`;
          }
          html += '</div>';
        });
        html += '</div>';
      }

      // Ability Matchup Tips
      if (abilityTips.length) {
        html += '<div style="font-size:0.82rem;font-weight:600;color:var(--text-1);margin-bottom:0.3rem">🎯 Ability Interactions</div>';
        const grouped = {};
        abilityTips.forEach(tip => { const cat = tip.category || 'general'; if (!grouped[cat]) grouped[cat]=[]; grouped[cat].push(tip); });
        const catLabels = { cleanse:'CC Interactions', cc_immunity:'CC Interactions', escape_counter:'CC Interactions', enemy_cc:'CC Interactions', your_cleanse:'CC Interactions', cd_advantage:'Cooldown Windows', window:'Cooldown Windows', shield_window:'Cooldown Windows', anti_heal:'Healing/Anti-Heal', healing:'Healing/Anti-Heal', damage_reduction:'Defensive Abilities' };
        const displayGroups = {};
        for (const [cat, catTips] of Object.entries(grouped)) {
          const label = catLabels[cat] || 'Other';
          if (!displayGroups[label]) displayGroups[label] = [];
          displayGroups[label].push(...catTips);
        }
        for (const [label, gTips] of Object.entries(displayGroups)) {
          html += `<div style="margin-bottom:0.4rem"><div style="font-size:0.75rem;color:var(--text-2);font-weight:600;margin-bottom:0.15rem">${esc(label)}</div>`;
          gTips.forEach(tip => {
            const icon = tip.type === 'advantage' ? '✅' : '⚠️';
            const cls = tip.type === 'advantage' ? '' : ' warning';
            html += `<div class="ability-tip${cls}">${icon} ${esc(tip.tip)}`;
            if (tip.cooldown?.max) html += ` <span class="tip-cd">⏱${tip.cooldown.max}s</span>`;
            html += '</div>';
          });
          html += '</div>';
        }
      }

      html += '</div>';
    }
  }

  // Two builds side by side
  html += '<div class="matchup-builds">';
  if (result.aggressiveBuild) {
    html += '<div class="card">';
    html += `<h3>🗡️ Aggressive Build</h3>`;
    html += `<div style="color:var(--green);font-size:0.78rem;margin-bottom:0.4rem">Highest WR — use when winning</div>`;
    html += `<div style="font-weight:600;margin-bottom:0.3rem">${esc(result.aggressiveBuild.name||'Meta Build')}</div>`;
    html += `<div style="margin-bottom:0.3rem"><span class="${wrClass(result.aggressiveBuild.winRate)}">${esc(result.aggressiveBuild.winRate)}</span> <span style="color:var(--text-2)">${result.aggressiveBuild.matches} games</span></div>`;
    html += '<div class="build-card-items">';
    (result.aggressiveBuild.items||[]).forEach((item,i) => {
      if (i>0) html += '<span class="build-arrow">→</span>';
      html += `<span>${itemWithImg(item)}</span>`;
    });
    html += '</div></div>';
  }

  html += '<div class="card">';
  html += `<h3>🛡️ Counter Build</h3>`;
  html += `<div style="color:var(--blue);font-size:0.78rem;margin-bottom:0.4rem">Matchup-specific vs ${esc(result.vsEnemy.name)}</div>`;
  html += `<div style="font-weight:600;margin-bottom:0.3rem">${esc(result.counterBuild.name)}</div>`;
  html += '<div class="build-card-items">';
  (result.counterBuild.items||[]).forEach((item,i) => {
    if (i>0) html += '<span class="build-arrow">→</span>';
    html += `<span>${itemWithImg(item)}</span>`;
  });
  html += '</div>';
  if (result.counterBuild.path) {
    result.counterBuild.path.forEach(p => {
      html += `<div style="font-size:0.78rem;color:var(--text-2);margin-top:0.2rem">• ${itemWithImg(p.item)}: ${p.reasons.map(esc).join(', ')}</div>`;
    });
  }
  html += '</div></div>';

  // Meta diff
  if (result.metaDiff && !result.metaDiff.identical && result.metaBuild) {
    html += '<div class="meta-diff">';
    html += `<div style="color:var(--text-2);margin-bottom:0.3rem">Changes vs Meta (${esc(result.metaBuild.winRate)}):</div>`;
    if (result.metaDiff.swaps) {
      result.metaDiff.swaps.forEach(sw => {
        html += `<div style="margin:0.15rem 0">❌ <s style="color:var(--red)">${itemWithImg(sw.removed)}</s> → ✅ ${itemWithImg(sw.added)} <span style="color:var(--text-2)">(${esc(sw.reason)})</span></div>`;
      });
    }
    html += '</div>';
  }

  // Enemy profile
  const enemyProfile = heroProfiles[enemySlug];
  html += '<div class="card">';
  html += `<h3>Enemy: ${esc(result.vsEnemy.name)}</h3>`;
  if (enemyProfile) {
    html += renderProfileBadges(enemyProfile);
    html += renderArchetypeTags(enemyProfile);
  }
  if (result.vsEnemy.metaBuild) {
    html += `<div style="margin-top:0.5rem"><strong>${esc(result.vsEnemy.metaBuild.name||'Meta Build')}</strong></div>`;
    html += `<div class="build-card-items" style="margin:0.3rem 0">${result.vsEnemy.metaBuild.items.map(n=>itemWithImg(n)).join(' <span class="build-arrow">→</span> ')}</div>`;
    html += `<div><span class="${wrClass(result.vsEnemy.metaBuild.winRate)}">${esc(result.vsEnemy.metaBuild.winRate)}</span> <span style="color:var(--text-2)">${result.vsEnemy.metaBuild.matches} games</span></div>`;
  }
  if (result.enemyBuildAnalysis?.threats?.length) {
    html += '<h4>Threats</h4>';
    html += result.enemyBuildAnalysis.threats.map(t => `<span class="trait-pill">${esc(t.replace(/_/g,' '))}</span>`).join(' ');
  }
  if (result.enemyBuildAnalysis?.weaknesses?.length) {
    html += '<h4>Weaknesses</h4>';
    html += result.enemyBuildAnalysis.weaknesses.map(w => `<span class="trait-pill">${esc(w.replace(/_/g,' '))}</span>`).join(' ');
  }
  html += '</div>';

  if (result.tips?.length) {
    html += '<div class="card"><h3>💡 Matchup Tips</h3>';
    result.tips.forEach(t => { html += `<div style="font-size:0.85rem;margin:0.3rem 0;color:var(--text-1)">• ${esc(t)}</div>`; });
    html += '</div>';
  }

  // (Augment Scouting Report moved to combined Matchup Intel section above)

  el.innerHTML = html;
}

// ── COUNTERS TAB (Combined with Matchups) ──
async function renderCounters() {
  const el = document.getElementById('countersContent');
  if (!currentHero) { el.innerHTML = ''; return; }
  const hero = currentHero;

  // Build enemy selector at the top
  let headerHtml = '<div class="card" style="margin-bottom:1rem">';
  headerHtml += '<h2>⚔️ Matchup Analysis</h2>';
  headerHtml += '<p style="color:var(--text-2);font-size:0.82rem;margin-bottom:0.5rem">Select an enemy to get matchup-specific builds, tips, and counter strategies</p>';
  headerHtml += '<select id="countersEnemySelect" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-2);color:var(--text-1);font-family:inherit;font-size:0.9rem"><option value="">Select enemy hero...</option>';
  heroIndex.forEach(h => {
    const name = heroProfiles[h.slug]?.name || h.name || h.slug;
    const selected = h.slug === (document.getElementById('enemySelect')?.value || '') ? ' selected' : '';
    headerHtml += `<option value="${esc(h.slug)}"${selected}>${esc(name)}</option>`;
  });
  headerHtml += '</select></div>';
  headerHtml += '<div id="countersMatchupContent"></div>';

  // Gather counters for selected role first, then other roles
  const allCounters = [];
  const roleEmoji = { carry: '🏹', support: '🛡️', midlane: '🔮', offlane: '⚔️', jungle: '🌿' };
  const selectedRole = currentRole;
  // Only show counters from the selected role
  const rd = (hero.roles || {})[selectedRole];
  if (rd) {
    for (const c of (rd.counters || [])) {
      allCounters.push({ ...c, role: selectedRole });
    }
  }

  if (!allCounters.length) {
    el.innerHTML = headerHtml + '<p style="color:var(--text-2);padding:1rem">No matchup data available.</p>';
    wireCountersEnemySelect();
    return;
  }

  // Render header (enemy selector + matchup placeholder) first, then counter list below
  let counterListHtml = '';

  const MIN_MATCHUP_MATCHES = 20;
  // Dedupe: keep the entry with the most matches per hero (but show role badge)
  const heroMap = {};
  allCounters.filter(c => (c.matches || 0) >= MIN_MATCHUP_MATCHES).forEach(c => {
    const slug = heroSlugFromName(c.hero);
    const key = slug + '_' + c.role;
    if (!heroMap[key] || c.matches > heroMap[key].matches) heroMap[key] = c;
  });
  const filtered = Object.values(heroMap);
  const beatsYou = filtered.filter(c => c.winRate < 50).sort((a,b) => a.winRate - b.winRate);
  const youBeat = filtered.filter(c => c.winRate >= 50).sort((a,b) => b.winRate - a.winRate);

  let html = '';

  // Helper to render a counter card (same design as "How to Counter" page)
  function renderCounterCard(c, heroSlug) {
    const enemySlug = heroSlugFromName(c.hero);
    const profile = heroProfiles[enemySlug];
    const heroProfile = heroProfiles[heroSlug];
    const wr = c.winRate.toFixed(1);
    let h = `<div class="counter-pick-card" data-analyze="${esc(enemySlug)}">`;
    h += '<div class="counter-pick-header">';
    h += `<img src="img/heroes/${esc(enemySlug)}.webp" alt="${esc(heroDisplayName(c.hero))}" onerror="this.style.display='none'">`;
    h += '<div>';
    h += `<div class="counter-pick-name">${esc(heroDisplayName(c.hero))}`;
    if (c.role) {
      const emoji = roleEmoji[c.role] || '';
      h += ` <span style="font-size:0.7rem;font-weight:400;padding:1px 6px;border-radius:8px;background:var(--bg-3);color:var(--text-2)">${emoji} ${titleCase(c.role)}</span>`;
    }
    h += '</div>';
    if (profile) h += renderArchetypeTags(profile);
    h += '</div>';
    h += `<div style="flex-shrink:0;text-align:right;margin-left:auto">`;
    h += `<div class="counter-pick-wr ${wrClass(parseFloat(wr))}">${wr}% WR</div>`;
    h += `<div style="font-size:0.72rem;color:var(--text-2)">${c.matches||'?'} games</div>`;
    h += '</div></div>';
    // Why
    const whyReasons = generateCounterWhy(enemySlug, heroSlug, heroProfile, profile);
    if (whyReasons.length) {
      h += `<div class="counter-pick-why">${whyReasons.map(esc).join(' • ')}</div>`;
    }
    h += `<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--accent);cursor:pointer" data-analyze="${esc(enemySlug)}">⚔️ Analyze matchup →</div>`;
    h += '</div>';
    return h;
  }

  html += `<div class="card"><h2>🛡️ Heroes that counter ${esc(hero.name)}</h2>`;
  html += `<p style="color:var(--text-2);font-size:0.82rem;margin-bottom:0.75rem">Your Win Rate shown (lower = harder)</p>`;
  if (beatsYou.length) {
    beatsYou.forEach(c => { html += renderCounterCard(c, hero.slug); });
  } else {
    html += '<p style="color:var(--text-2)">No heroes with enough data to show.</p>';
  }
  html += '</div>';

  html += `<div class="card"><h2>⚔️ Heroes that ${esc(hero.name)} beats</h2>`;
  if (youBeat.length) {
    youBeat.forEach(c => { html += renderCounterCard(c, hero.slug); });
  }
  html += '</div>';

  el.innerHTML = headerHtml + html;

  // Wire enemy selector in counters tab
  wireCountersEnemySelect();

  // Render matchup if enemy is selected
  const selectedEnemy = el.querySelector('#countersEnemySelect')?.value;
  if (selectedEnemy) {
    renderCountersMatchup(selectedEnemy);
  }

  // Wire analyze clicks — clicking card or "Analyze matchup" link (stay in counters tab)
  el.querySelectorAll('[data-analyze]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.analyze;
      const sel = document.getElementById('countersEnemySelect');
      if (sel) {
        sel.value = slug;
        // Sync hidden enemySelect too
        const hiddenSel = document.getElementById('enemySelect');
        if (hiddenSel) hiddenSel.value = slug;
        renderCountersMatchup(slug);
        // Scroll to top of counters content
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  });
}

function wireCountersEnemySelect() {
  const sel = document.getElementById('countersEnemySelect');
  if (!sel) return;
  sel.onchange = () => {
    const slug = sel.value;
    // Sync hidden enemySelect
    const hiddenSel = document.getElementById('enemySelect');
    if (hiddenSel) hiddenSel.value = slug;
    renderCountersMatchup(slug);
  };
}

async function renderCountersMatchup(enemySlug) {
  const el = document.getElementById('countersMatchupContent');
  if (!el) return;

  if (!currentHero || !enemySlug) {
    el.innerHTML = '';
    return;
  }

  // Reuse the existing renderMatchup logic but target countersMatchupContent
  el.innerHTML = '<p style="color:var(--text-2)">Analyzing…</p>';

  if (typeof MatchupEngine !== 'undefined' && !MatchupEngine.isReady()) {
    try { await MatchupEngine.init(DATA_BASE); } catch(e) { console.warn('MatchupEngine init failed', e); }
  }
  if (typeof AbilityInteractions !== 'undefined' && !AbilityInteractions.isReady()) {
    try { await AbilityInteractions.init(DATA_BASE); } catch(e) { console.warn('AbilityInteractions init failed', e); }
  }

  const heroDataMap = {};
  try { heroDataMap[currentHero.slug] = currentHero; } catch {}
  try { heroDataMap[enemySlug] = await loadHeroData(currentVersion, enemySlug); } catch {}

  const result = MatchupEngine.counterBuildPath(currentHero.slug, currentRole, enemySlug, heroDataMap);
  if (result.error) { el.innerHTML = `<p style="color:var(--red)">${esc(result.error)}</p>`; return; }

  // Render the same matchup HTML as renderMatchup() but into this element
  let html = '';

  // Confidence warnings
  const warnings = [];
  if (result.roleInfo?.isRoleMismatch) {
    warnings.push({ type:'warning', icon:'⚠️', text:`${esc(result.roleInfo.heroName)} isn't commonly played ${esc(result.roleInfo.requestedRole)} — showing ${esc(result.roleInfo.fallbackRole)} data` });
  }
  if (result.counterData?.yourVsEnemy) {
    const cd = result.counterData.yourVsEnemy;
    warnings.push({ type: cd.winRate>=50?'positive':'negative', icon:'📊', text:`${esc(result.yourHero.name)} has <span class="${wrClass(cd.winRate)}" style="font-weight:600">${cd.winRate.toFixed(1)}%</span> WR vs ${esc(result.vsEnemy.name)} in ${cd.matches} games` });
  } else if (result.counterData?.enemyVsYou) {
    const cd = result.counterData.enemyVsYou;
    const yourWR = (100 - cd.enemyWinRate).toFixed(1);
    warnings.push({ type: parseFloat(yourWR)>=50?'positive':'negative', icon:'📊', text:`${esc(result.vsEnemy.name)} has ${cd.enemyWinRate.toFixed(1)}% WR vs you (≈ <span class="${wrClass(parseFloat(yourWR))}" style="font-weight:600">${yourWR}%</span> for you)` });
  } else {
    warnings.push({ type:'warning', icon:'⚠️', text:'No direct matchup data — based on kit analysis' });
  }

  if (warnings.length) {
    html += '<div class="confidence-banner">';
    warnings.forEach(w => {
      const cls = w.type === 'positive' ? 'confidence-positive' : w.type === 'negative' ? 'confidence-negative' : 'confidence-warning';
      html += `<div class="confidence-item ${cls}">${w.icon} ${w.text}</div>`;
    });
    html += '</div>';
  }

  // Combined Matchup Intel
  {
    const enemyProfile = heroProfiles[enemySlug];
    const hasAbilityTips = typeof AbilityInteractions !== 'undefined' && AbilityInteractions.isReady();
    const abilityTips = hasAbilityTips ? AbilityInteractions.generateTips(currentHero.slug, enemySlug) : [];
    const hasAugments = enemyProfile?.augments?.length > 0;

    if (hasAugments || abilityTips.length) {
      html += '<div class="card"><h3>⚔️ Matchup Intel</h3>';
      if (hasAugments) {
        const enemyRd = heroDataMap[enemySlug] ? getRoleData(heroDataMap[enemySlug], currentRole) : null;
        const topAugs = (enemyRd?.augments || []).sort((a,b) => parseFloat(b.winRate) - parseFloat(a.winRate));
        const bestAugName = topAugs[0]?.name?.trim().toLowerCase();
        html += '<div style="margin-bottom:0.75rem"><div style="font-size:0.82rem;font-weight:600;color:var(--text-1);margin-bottom:0.4rem">🔍 Their Augments</div>';
        enemyProfile.augments.forEach(aug => {
          const wrData = topAugs.find(a => a.name.trim().toLowerCase() === aug.name.trim().toLowerCase());
          const isBest = aug.name.trim().toLowerCase() === bestAugName;
          const hasShift = aug.playstyleShift;
          const newTraits = (aug.traits || []).filter(t => !(enemyProfile.baseTraits || []).includes(t));
          html += `<div style="padding:0.5rem;margin-bottom:0.4rem;border-radius:8px;border:1px solid ${isBest ? 'var(--accent)' : 'var(--border)'};background:var(--bg-2)${isBest ? ';box-shadow:0 0 8px rgba(139,92,246,0.15)' : ''}">`;
          html += '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">';
          html += augmentImg(aug.name);
          html += `<span style="font-weight:600;font-size:0.85rem">${esc(aug.name)}</span>`;
          if (isBest) html += '<span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:var(--accent);color:#fff">Most Picked</span>';
          if (wrData) html += `<span class="${wrClass(parseFloat(wrData.winRate))}" style="font-size:0.8rem;margin-left:auto">${wrData.winRate}</span>`;
          else html += '<span style="font-size:0.75rem;color:var(--text-2);margin-left:auto;font-style:italic">No data</span>';
          html += '</div>';
          if (hasShift) html += `<div style="margin-top:0.3rem;font-size:0.78rem;color:var(--yellow, #eab308)">⚡ Shifts toward <strong>${esc(titleCase(hasShift))}</strong></div>`;
          const cleanDesc = aug.description ? aug.description.replace(/<[^>]+>/g, '').substring(0, 150) : '';
          if (cleanDesc) html += `<div style="margin-top:0.2rem;font-size:0.75rem;color:var(--text-2);font-style:italic">${esc(cleanDesc)}</div>`;
          const allTags = aug.traits || [];
          const counterTips = augmentCounterTips(allTags, hasShift);
          if (counterTips.length) counterTips.forEach(tip => { html += `<div style="margin-top:0.2rem;font-size:0.75rem;color:var(--gold, #f59e0b)">⚠️ ${esc(tip)}</div>`; });
          else { const traitTips = []; for (const trait of newTraits) { if (AUGMENT_TRAIT_TIPS[trait]) traitTips.push(AUGMENT_TRAIT_TIPS[trait]); } traitTips.forEach(tip => { html += `<div style="margin-top:0.2rem;font-size:0.75rem;color:var(--text-2)">💡 ${esc(tip)}</div>`; }); }
          if (allTags.length || hasShift) {
            html += '<div class="aug-tags" style="margin-top:0.3rem">';
            allTags.forEach(t => html += `<span class="aug-tag" data-tag-label="${esc(traitLabel(t))}" style="cursor:pointer">${esc(traitLabel(t))}</span>`);
            if (hasShift && !allTags.includes(hasShift)) html += `<span class="aug-tag shift" data-tag-label="${esc(traitLabel(hasShift))}" style="cursor:pointer">+${esc(traitLabel(hasShift))}</span>`;
            html += '</div>';
          }
          html += '</div>';
        });
        html += '</div>';
      }
      if (abilityTips.length) {
        html += '<div style="font-size:0.82rem;font-weight:600;color:var(--text-1);margin-bottom:0.3rem">🎯 Ability Interactions</div>';
        const grouped = {};
        abilityTips.forEach(tip => { const cat = tip.category || 'general'; if (!grouped[cat]) grouped[cat]=[]; grouped[cat].push(tip); });
        const catLabels = { cleanse:'CC Interactions', cc_immunity:'CC Interactions', escape_counter:'CC Interactions', enemy_cc:'CC Interactions', your_cleanse:'CC Interactions', cd_advantage:'Cooldown Windows', window:'Cooldown Windows', shield_window:'Cooldown Windows', anti_heal:'Healing/Anti-Heal', healing:'Healing/Anti-Heal', damage_reduction:'Defensive Abilities' };
        const displayGroups = {};
        for (const [cat, catTips] of Object.entries(grouped)) { const label = catLabels[cat] || 'Other'; if (!displayGroups[label]) displayGroups[label] = []; displayGroups[label].push(...catTips); }
        for (const [label, gTips] of Object.entries(displayGroups)) {
          html += `<div style="margin-bottom:0.4rem"><div style="font-size:0.75rem;color:var(--text-2);font-weight:600;margin-bottom:0.15rem">${esc(label)}</div>`;
          gTips.forEach(tip => {
            const icon = tip.type === 'advantage' ? '✅' : '⚠️';
            const cls = tip.type === 'advantage' ? '' : ' warning';
            html += `<div class="ability-tip${cls}">${icon} ${esc(tip.tip)}`;
            if (tip.cooldown?.max) html += ` <span class="tip-cd">⏱${tip.cooldown.max}s</span>`;
            html += '</div>';
          });
          html += '</div>';
        }
      }
      html += '</div>';
    }
  }

  // Builds
  html += '<div class="matchup-builds">';
  if (result.aggressiveBuild) {
    html += '<div class="card">';
    html += '<h3>🗡️ Aggressive Build</h3>';
    html += `<div style="color:var(--green);font-size:0.78rem;margin-bottom:0.4rem">Highest WR — use when winning</div>`;
    html += `<div style="font-weight:600;margin-bottom:0.3rem">${esc(result.aggressiveBuild.name||'Meta Build')}</div>`;
    html += `<div style="margin-bottom:0.3rem"><span class="${wrClass(result.aggressiveBuild.winRate)}">${esc(result.aggressiveBuild.winRate)}</span> <span style="color:var(--text-2)">${result.aggressiveBuild.matches} games</span></div>`;
    html += '<div class="build-card-items">';
    (result.aggressiveBuild.items||[]).forEach((item,i) => { if (i>0) html += '<span class="build-arrow">→</span>'; html += `<span>${itemWithImg(item)}</span>`; });
    html += '</div></div>';
  }
  html += '<div class="card">';
  html += '<h3>🛡️ Counter Build</h3>';
  html += `<div style="color:var(--blue);font-size:0.78rem;margin-bottom:0.4rem">Matchup-specific vs ${esc(result.vsEnemy.name)}</div>`;
  html += `<div style="font-weight:600;margin-bottom:0.3rem">${esc(result.counterBuild.name)}</div>`;
  html += '<div class="build-card-items">';
  (result.counterBuild.items||[]).forEach((item,i) => { if (i>0) html += '<span class="build-arrow">→</span>'; html += `<span>${itemWithImg(item)}</span>`; });
  html += '</div>';
  if (result.counterBuild.path) { result.counterBuild.path.forEach(p => { html += `<div style="font-size:0.78rem;color:var(--text-2);margin-top:0.2rem">• ${itemWithImg(p.item)}: ${p.reasons.map(esc).join(', ')}</div>`; }); }
  html += '</div></div>';

  // Meta diff
  if (result.metaDiff && !result.metaDiff.identical && result.metaBuild) {
    html += '<div class="meta-diff">';
    html += `<div style="color:var(--text-2);margin-bottom:0.3rem">Changes vs Meta (${esc(result.metaBuild.winRate)}):</div>`;
    if (result.metaDiff.swaps) { result.metaDiff.swaps.forEach(sw => { html += `<div style="margin:0.15rem 0">❌ <s style="color:var(--red)">${itemWithImg(sw.removed)}</s> → ✅ ${itemWithImg(sw.added)} <span style="color:var(--text-2)">(${esc(sw.reason)})</span></div>`; }); }
    html += '</div>';
  }

  // Enemy profile
  const enemyProfile2 = heroProfiles[enemySlug];
  html += '<div class="card">';
  html += `<h3>Enemy: ${esc(result.vsEnemy.name)}</h3>`;
  if (enemyProfile2) { html += renderProfileBadges(enemyProfile2); html += renderArchetypeTags(enemyProfile2); }
  if (result.vsEnemy.metaBuild) {
    html += `<div style="margin-top:0.5rem"><strong>${esc(result.vsEnemy.metaBuild.name||'Meta Build')}</strong></div>`;
    html += `<div class="build-card-items" style="margin:0.3rem 0">${result.vsEnemy.metaBuild.items.map(n=>itemWithImg(n)).join(' <span class="build-arrow">→</span> ')}</div>`;
    html += `<div><span class="${wrClass(result.vsEnemy.metaBuild.winRate)}">${esc(result.vsEnemy.metaBuild.winRate)}</span> <span style="color:var(--text-2)">${result.vsEnemy.metaBuild.matches} games</span></div>`;
  }
  if (result.enemyBuildAnalysis?.threats?.length) { html += '<h4>Threats</h4>'; html += result.enemyBuildAnalysis.threats.map(t => `<span class="trait-pill">${esc(t.replace(/_/g,' '))}</span>`).join(' '); }
  if (result.enemyBuildAnalysis?.weaknesses?.length) { html += '<h4>Weaknesses</h4>'; html += result.enemyBuildAnalysis.weaknesses.map(w => `<span class="trait-pill">${esc(w.replace(/_/g,' '))}</span>`).join(' '); }
  html += '</div>';

  if (result.tips?.length) {
    html += '<div class="card"><h3>💡 Matchup Tips</h3>';
    result.tips.forEach(t => { html += `<div style="font-size:0.85rem;margin:0.3rem 0;color:var(--text-1)">• ${esc(t)}</div>`; });
    html += '</div>';
  }

  el.innerHTML = html;
}

// ── SYNERGY TAB ──
function renderSynergy() {
  const el = document.getElementById('synergyContent');
  if (!currentHero) { el.innerHTML = ''; return; }

  let html = '';

  // Support Synergy engine
  if (typeof SupportSynergy !== 'undefined') {
    const slug = currentHero.slug;
    if (SupportSynergy.isSupport(slug) || SupportSynergy.isCarry(slug)) {
      html += '<div class="card"><div id="synergyEngineContent"></div></div>';
    }
  }

  // Best Teammates from duo-synergies data
  html += renderBestLanePartners(currentHero.slug, currentRole);

  if (!html) html = '<p style="color:var(--text-2);padding:1rem">No synergy data available for this hero.</p>';

  el.innerHTML = html;

  // Render support synergy
  if (typeof SupportSynergy !== 'undefined') {
    const slug = currentHero.slug;
    const synergyEl = document.getElementById('synergyEngineContent');
    if (synergyEl && (SupportSynergy.isSupport(slug) || SupportSynergy.isCarry(slug))) {
      SupportSynergy.renderSynergySection(synergyEl, slug);
    }
  }
}

// ── STATS TAB ──
function renderStats() {
  const el = document.getElementById('statsContent');
  if (!currentHero) { el.innerHTML = ''; return; }
  const rd = getRoleData(currentHero, currentRole);
  if (!rd) { el.innerHTML = '<p style="color:var(--text-2)">No data</p>'; return; }

  let html = '';

  html += '<div class="card"><h2>📊 Matchup Win Rates</h2><div class="chart-wrap"><canvas id="matchupChartCanvas"></canvas></div></div>';

  const items = rd.items || [];
  if (items.length) {
    const sorted = [...items].sort((a,b) => (b.matches||0) - (a.matches||0));
    html += '<div class="card"><h2>📦 Item Stats</h2>';
    html += '<table class="item-table"><thead><tr><th data-sortable>Item</th><th class="num" data-sortable>Win Rate</th><th class="num" data-sortable>Matches</th><th class="num" data-sortable>Avg Time</th></tr></thead><tbody>';
    sorted.forEach(it => {
      const wr = it.winRate ?? 0;
      const matches = it.matches || 0;
      let timeDisplay = '—';
      if (matches >= 5 && it.avgTimeSec) {
        timeDisplay = it.avgTimeSec > 2100 ? '35:00+' : (it.avgTime || '—');
      } else if (matches >= 5 && it.avgTime) {
        timeDisplay = it.avgTime;
      }
      html += `<tr><td>${itemWithImg(it.name)}</td><td class="num"><span class="${wrClass(wr)}">${wr.toFixed(1)}%</span></td><td class="num">${matches.toLocaleString()}</td><td class="num" style="color:var(--text-2)">${timeDisplay}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  // Crests table
  const crests = rd.crests || [];
  if (crests.length) {
    html += '<div class="card"><h2>🛡️ Crest Stats</h2>';
    html += '<table class="item-table"><thead><tr><th>Crest</th><th class="num">Win Rate</th><th class="num">Matches</th></tr></thead><tbody>';
    [...crests].sort((a,b) => parseFloat(b.winRate) - parseFloat(a.winRate)).forEach(c => {
      const wr = parseFloat(c.winRate)||0;
      html += `<tr><td>${esc(c.name)}</td><td class="num"><span class="${wrClass(wr)}">${wr.toFixed(1)}%</span></td><td class="num">${c.matches||'?'}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  el.innerHTML = html;
  renderMatchupChartV2(rd.counters);
}

function renderMatchupChartV2(counters) {
  const canvas = document.getElementById('matchupChartCanvas');
  if (!canvas) return;
  if (matchupChart) matchupChart.destroy();
  if (!counters?.length) {
    canvas.parentElement.innerHTML = '<p style="color:var(--text-2);padding:2rem;text-align:center">No matchup data</p>';
    return;
  }
  const sorted = [...counters].sort((a,b) => b.winRate - a.winRate);
  const labels = sorted.map(c => heroDisplayName(c.hero));
  const values = sorted.map(c => c.winRate);
  const colors = values.map(v => wrColor(v));
  const bgColors = values.map(v => v >= 52 ? '#00c48c20' : v <= 48 ? '#ff5a5a20' : '#f0b42920');
  canvas.style.height = Math.max(300, sorted.length * 28) + 'px';
  matchupChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: bgColors, borderColor: colors, borderWidth: 1.5, borderRadius: 4, barPercentage: 0.7 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const c = sorted[ctx.dataIndex]; return `${c.winRate}% WR (${c.matches||'?'} games)`; } }, backgroundColor: '#1a1a26', borderColor: '#2a2a3a', borderWidth: 1 } },
      scales: { x: { min: 20, max: 80, grid: { color: '#2a2a3a' }, ticks: { color: '#6a6a80', callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { color: '#a0a0b8', font: { size: 11, family: 'Inter' } } } }
    }
  });
}

// ── Best Teammates ──
function renderBestLanePartners(heroSlug, role) {
  const heroData = duoSynergies[heroSlug];
  if (!heroData) return '';

  let allPartners = [];
  for (const [r, partners] of Object.entries(heroData)) {
    if (!Array.isArray(partners)) continue;
    allPartners.push(...partners.map(p => ({ ...p, role: r })));
  }
  if (!allPartners.length) return '';

  allPartners.sort((a, b) => b.synergyScore - a.synergyScore);
  const top = allPartners.slice(0, 5);

  // Role-appropriate heading
  const heading = role === 'jungle' ? '🤝 Best Gank Partners' :
                  role === 'midlane' ? '🤝 Best Roam Partners' :
                  '🤝 Best Teammates';

  let html = `<div class="card"><h2>${heading}</h2>`;
  html += '<p style="color:var(--text-2);font-size:0.82rem;margin-bottom:0.5rem">Based on kit synergy analysis</p>';
  top.forEach((p, i) => {
    const scoreColor = p.synergyScore >= 40 ? 'var(--green)' : p.synergyScore >= 25 ? 'var(--gold)' : 'var(--red)';
    // Why this teammate works
    const topReason = (p.reasons || []).slice(0, 2).map(r => r.replace(/\(.*?\)/g, '').trim());

    html += '<div class="lane-partner-row" style="flex-wrap:wrap">';
    html += `<span class="lane-partner-rank">#${i + 1}</span>`;
    html += `<img src="img/heroes/${esc(p.ally)}.webp" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;margin-right:0.25rem" onerror="this.style.display='none'">`;
    html += `<span class="lane-partner-name" data-learn="${esc(p.ally)}" style="cursor:pointer;color:var(--accent)">${esc(p.allyName)}</span>`;
    if (p.winRate) html += `<span class="${wrClass(p.winRate)}" style="margin-right:0.5rem">${p.winRate.toFixed(1)}%</span>`;
    const synPct = Math.min(100, p.synergyScore);
    html += `<span class="lane-partner-score" style="color:${scoreColor}">${synPct}%</span>`;
    if (topReason.length) html += `<div style="width:100%;font-size:0.72rem;color:var(--text-2);padding-left:2.5rem;margin-top:-0.1rem">${topReason.map(r => esc(r)).join(' · ')}</div>`;
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ── Duo Synergy Helpers ──
function getDuoSynergyData(slug1, slug2) {
  for (const [slug, data] of Object.entries(duoSynergies)) {
    if (slug !== slug1 && slug !== slug2) continue;
    for (const partners of Object.values(data)) {
      if (!Array.isArray(partners)) continue;
      const target = slug === slug1 ? slug2 : slug1;
      const match = partners.find(p => p.ally === target);
      if (match) return match;
    }
  }
  return null;
}

// ══════════════════════════════════════════
// FLOW 2: COUNTER A HERO
// ══════════════════════════════════════════

async function loadCounterHero(enemySlug) {
  const el = document.getElementById('counterContent');
  el.innerHTML = '<p style="color:var(--text-2)">Loading counter analysis…</p>';

  const enemyProfile = heroProfiles[enemySlug];
  const enemyName = enemyProfile?.name || enemySlug;

  // Load enemy data
  let enemyData;
  try { enemyData = await loadHeroData(currentVersion, enemySlug); } catch { el.innerHTML = '<p style="color:var(--red)">Could not load hero data</p>'; return; }

  const heroDataMap = { [enemySlug]: enemyData };

  // Get counter analysis from MatchupEngine
  let analysis = null;
  if (typeof MatchupEngine !== 'undefined' && MatchupEngine.isReady()) {
    analysis = MatchupEngine.counterHeroAnalysis(enemySlug, heroDataMap);
  }

  // Determine enemy role (use stored selection or auto-detect most played)
  const enemyRoles = enemyData.activeRoles || Object.keys(enemyData.roles || {}).filter(r => r !== 'all');
  if (!window._counterEnemyRole || !enemyRoles.includes(window._counterEnemyRole)) {
    // Auto-detect most played role
    let bestRole = enemyRoles[0], bestMatches = -1;
    for (const role of enemyRoles) {
      const rd2 = getRoleData(enemyData, role);
      const totalMatches = (rd2?.buildTabs || []).reduce((sum, b) => sum + (parseInt(String(b.matches).replace(/\D/g,'')) || 0), 0);
      if (totalMatches > bestMatches) { bestMatches = totalMatches; bestRole = role; }
    }
    window._counterEnemyRole = bestRole;
  }
  const counterRole = window._counterEnemyRole;

  // Get counter picks for the selected role
  const rd = getRoleData(enemyData, counterRole);
  const MIN_COUNTER_MATCHES = 20;
  const beatsEnemy = (rd?.counters || [])
    .filter(c => c.winRate < 50 && (c.matches || 0) >= MIN_COUNTER_MATCHES)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, 10);

  let html = '';

  // Hero banner
  html += '<div class="counter-hero-banner">';
  html += `<img src="img/heroes/${enemySlug}.webp" alt="${esc(enemyName)}" onerror="this.style.display='none'">`;
  html += '<div>';
  html += `<h2>How to Beat ${esc(enemyName)}</h2>`;
  if (enemyProfile) {
    html += renderProfileBadges(enemyProfile);
    html += renderArchetypeTags(enemyProfile);
  }
  html += '</div></div>';

  // Role selector
  if (enemyRoles.length > 1) {
    const roleEmoji = { carry: '🏹', support: '🛡️', midlane: '🔮', offlane: '⚔️', jungle: '🌿' };
    html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap">';
    html += '<span style="color:var(--text-2);font-size:0.85rem">Their role:</span>';
    enemyRoles.forEach(role => {
      const active = role === counterRole;
      const emoji = roleEmoji[role] || '';
      html += `<button class="counter-role-btn${active ? ' active' : ''}" data-counter-role="${esc(role)}" style="padding:0.3rem 0.75rem;border-radius:6px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'var(--accent)' : 'var(--bg-2)'};color:${active ? '#fff' : 'var(--text-1)'};font-size:0.82rem;cursor:pointer;font-family:inherit">${emoji} ${titleCase(role)}</button>`;
    });
    html += '</div>';
  }

  // Top counter picks
  if (beatsEnemy.length) {
    html += '<div class="counter-section"><h3 style="font-size:1.1rem;margin-bottom:0.75rem">🏆 Top Counter Picks</h3>';
    for (const c of beatsEnemy) {
      const counterSlug = heroSlugFromName(c.hero);
      const counterProfile = heroProfiles[counterSlug];
      const theirWR = (100 - c.winRate).toFixed(1); // counter hero's WR vs enemy
      html += `<div class="counter-pick-card" data-learn="${esc(counterSlug)}" data-matchup-enemy="${esc(enemySlug)}">`;
      html += '<div class="counter-pick-header">';
      html += `<img src="img/heroes/${counterSlug}.webp" alt="${esc(heroDisplayName(c.hero))}" onerror="this.style.display='none'">`;
      html += '<div>';
      html += `<div class="counter-pick-name">${esc(heroDisplayName(c.hero))}</div>`;
      if (counterProfile) html += renderArchetypeTags(counterProfile);
      html += '</div>';
      html += `<div style="flex-shrink:0;text-align:right;margin-left:auto">`;
      html += `<div class="counter-pick-wr ${wrClass(parseFloat(theirWR))}">${theirWR}% WR</div>`;
      html += `<div style="font-size:0.72rem;color:var(--text-2)">${c.matches||'?'} games</div>`;
      html += '</div></div>';

      // Why this hero counters
      const whyReasons = generateCounterWhy(counterSlug, enemySlug, enemyProfile, counterProfile);
      if (whyReasons.length) {
        html += `<div class="counter-pick-why">${whyReasons.map(esc).join(' • ')}</div>`;
      }

      html += `<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--accent);cursor:pointer" data-learn="${esc(counterSlug)}">⚔️ View ${esc(heroDisplayName(c.hero))} matchup guide →</div>`;
      html += '</div>';
    }
    html += '</div>';
  }

  // Engine analysis (general counter strategy)
  if (analysis && !analysis.error && analysis.variants?.length) {
    html += '<div class="counter-section"><h3 style="font-size:1.1rem;margin-bottom:0.75rem">🔬 Counter Strategy</h3>';
    for (const v of analysis.variants) {
      html += '<div class="card">';
      html += `<h3>vs ${esc(v.build.name || 'Build')} <span style="color:var(--text-2);font-weight:400">(${esc(v.build.winRate)} WR, ${v.build.matches} games)</span></h3>`;
      html += `<div class="build-card-items" style="margin:0.3rem 0">${v.build.items.map(n=>itemWithImg(n)).join(' <span class="build-arrow">→</span> ')}</div>`;

      if (v.dangers.length) {
        html += '<h4>⚠️ Watch Out For</h4>';
        v.dangers.forEach(d => { html += `<div style="font-size:0.82rem;color:var(--text-2);margin:0.15rem 0">• ${esc(d)}</div>`; });
      }
      if (v.exploits.length) {
        html += '<h4>✅ Exploit These Weaknesses</h4>';
        v.exploits.forEach(e => { html += `<div style="font-size:0.82rem;color:var(--green);margin:0.15rem 0">• ${esc(e)}</div>`; });
      }
      if (v.counterRoutes.length) {
        html += '<h4>🛡️ Counter Items</h4>';
        v.counterRoutes.forEach(route => {
          html += `<div style="font-size:0.78rem;color:var(--text-2);margin:0.25rem 0;font-style:italic">${esc(route.label)}</div>`;
          route.items.forEach((item, i) => {
            html += `<div style="display:flex;align-items:center;gap:0.4rem;margin:0.2rem 0;font-size:0.82rem">`;
            html += `<span style="flex-shrink:0">${itemWithImg(item.name)}</span>`;
            html += `<span style="font-size:0.72rem;color:var(--text-2)">${esc(item.why)}</span>`;
            if (i < route.items.length - 1) html += `<span class="build-arrow" style="margin-left:0.25rem">→</span>`;
            html += `</div>`;
          });
        });
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // Augment Awareness section - show how enemy augments shift the matchup
  if (enemyProfile?.augments?.length) {
    html += '<div class="counter-section"><h3 style="font-size:1.1rem;margin-bottom:0.75rem">⚡ Watch Their Augments</h3>';
    html += '<div style="font-size:0.78rem;color:var(--text-2);margin-bottom:0.5rem">Their augment choice changes how you should play against them:</div>';
    for (const aug of enemyProfile.augments) {
      const tags = aug.traits || [];
      const shift = aug.playstyleShift;
      const desc = (aug.description || '').replace(/<[^>]+>/g, '').substring(0, 120);
      if (!shift && !tags.length) continue;
      // Generate counter tips from tags
      const tips = augmentCounterTips(tags, shift);
      html += `<div style="background:var(--bg-2);border-radius:8px;padding:0.6rem;margin-bottom:0.5rem">`;
      html += `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem">`;
      html += augmentImg(aug.name);
      html += `<span style="font-weight:600;font-size:0.85rem">${esc(aug.name.trim())}</span>`;
      html += `</div>`;
      if (desc) html += `<div style="color:var(--text-2);font-size:0.75rem;line-height:1.3;margin-bottom:0.3rem">${esc(desc)}</div>`;
      if (tips.length) {
        html += `<div style="font-size:0.78rem;line-height:1.5">`;
        tips.forEach(tip => html += `<div style="color:var(--gold);margin-top:0.15rem">⚠️ ${esc(tip)}</div>`);
        html += `</div>`;
      }
      if (tags.length || shift) {
        html += '<div class="aug-tags" style="margin-top:0.3rem">';
        tags.forEach(t => html += `<span class="aug-tag" data-tag-label="${esc(traitLabel(t))}" style="cursor:pointer">${esc(traitLabel(t))}</span>`);
        if (shift && !tags.includes(shift)) html += `<span class="aug-tag shift" data-tag-label="${esc(traitLabel(shift))}" style="cursor:pointer">→ +${esc(traitLabel(shift))}</span>`;
        html += '</div>';
      }
      html += `</div>`;
    }
    html += '</div>';
  }

  el.innerHTML = html;

  // Wire learn links — counter picks pre-select enemy in matchup tab
  el.querySelectorAll('[data-learn]').forEach(link => {
    link.onclick = (e) => {
      e.stopPropagation();
      const slug = link.dataset.learn;
      const matchupEnemy = link.closest('[data-matchup-enemy]')?.dataset.matchupEnemy;
      navigate('learn', slug);
      if (matchupEnemy) {
        // Wait for hero to load, then switch to counters tab with enemy pre-selected
        setTimeout(() => {
          const countersEnemySelect = document.getElementById('countersEnemySelect');
          if (countersEnemySelect) {
            countersEnemySelect.value = matchupEnemy;
            // Sync to hidden enemySelect
            const enemySelect = document.getElementById('enemySelect');
            if (enemySelect) enemySelect.value = matchupEnemy;
            switchLearnTab('counters');
            renderCounters();
          }
        }, 300);
      }
    };
  });

  // Wire role selector buttons
  el.querySelectorAll('[data-counter-role]').forEach(btn => {
    btn.onclick = () => {
      window._counterEnemyRole = btn.dataset.counterRole;
      loadCounterHero(enemySlug);
    };
  });
}

function augmentCounterTips(tags, shift) {
  const tips = [];
  const t = new Set(tags);
  if (t.has('healing') || t.has('health_sustain')) tips.push('Buy anti-heal items to cut their sustain');
  if (t.has('execute')) tips.push('Don\'t fight below 20% HP - they can execute you');
  if (t.has('stealth') || t.has('team_stealth')) tips.push('Buy wards and detection - they can go invisible');
  if (t.has('burst_amp')) tips.push('They hit harder than usual - build defensive or don\'t get caught');
  if (t.has('shield')) tips.push('They have extra shielding - sustained damage beats burst here');
  if (t.has('cd_reset')) tips.push('Their abilities come back faster - don\'t assume long cooldowns');
  if (t.has('armor_shred')) tips.push('They shred your armor - raw HP or shields are better than stacking armor');
  if (t.has('anti_heal')) tips.push('They cut your healing - don\'t rely on sustain to win trades');
  if (t.has('damage_reduction')) tips.push('They take less damage - extended trades favor them');
  if (t.has('range_ext')) tips.push('They have extended range - be careful about poke distance');
  if (t.has('unstoppable')) tips.push('They can\'t be interrupted - save your CC for after');
  if (t.has('displacement')) tips.push('They can reposition you - watch your positioning near walls/towers');
  if (t.has('isolation')) tips.push('They punish isolated targets - stay near your team');
  if (t.has('on_hit')) tips.push('They stack on-hit damage - short trades are better than long ones');
  if (t.has('as_steroid')) tips.push('They have attack speed bursts - don\'t stand and trade autos');
  if (t.has('cleanse')) tips.push('They can cleanse CC - chain CC or bait the cleanse first');
  if (t.has('true_damage')) tips.push('They deal true damage - armor won\'t help, build HP');
  if (t.has('mobility')) tips.push('They\'re more mobile with this augment - harder to lock down');
  if (t.has('zone_control')) tips.push('They control areas better - don\'t fight in their zones');
  if (t.has('cc')) tips.push('They have more CC - build tenacity or cleanse');
  if (t.has('poke')) tips.push('They poke harder from range - close the gap or dodge');
  if (shift === 'sustain') tips.push('This augment shifts them toward sustain - anti-heal is key');
  if (shift === 'DPS' || shift === 'dps') tips.push('This augment shifts them toward DPS - burst them before they ramp');
  return tips;
}

function generateCounterWhy(counterSlug, enemySlug, enemyProfile, counterProfile) {
  const reasons = [];
  if (!enemyProfile || !counterProfile) return reasons;

  const et = new Set(enemyProfile.baseTraits || []);
  const ct = new Set(counterProfile.baseTraits || []);
  const ea = enemyProfile.attributes || {};
  const ca = counterProfile.attributes || {};
  const eName = enemyProfile.name || enemySlug;
  const cName = counterProfile.name || counterSlug;

  // Specific, high-value interactions first
  if (et.has('ally_heal') && ct.has('anti_heal')) reasons.push(`Anti-heal cuts off ${eName}'s team healing — focus the target they're keeping alive`);
  else if (et.has('self_heal') && ct.has('anti_heal')) reasons.push(`Built-in anti-heal shuts down ${eName}'s self-sustain`);
  else if (et.has('healing') && ct.has('anti_heal')) reasons.push(`Built-in anti-heal shuts down ${eName}'s sustain`);
  if (et.has('ally_shield')) reasons.push(`${eName} shields teammates — burst through or wait out the shield before committing`);
  if (et.has('stealth') && ct.has('cc') && ca.durability >= 5) reasons.push(`Can reveal and lock down ${eName} out of stealth`);
  if (et.has('execute') && ca.durability >= 7) reasons.push(`Too tanky to get into execute range`);
  if (counterProfile.attackType === 'ranged' && enemyProfile.attackType === 'melee' && ea.mobility <= 5) reasons.push(`Kites ${eName} — no gap close to reach ${cName}`);
  if (counterProfile.attackType === 'ranged' && enemyProfile.attackType === 'melee' && ea.mobility >= 6) reasons.push(`Range advantage, but watch for ${eName}'s gap close`);

  // Durability matchups (only when meaningful gap)
  if (ea.abilityPower >= 7 && ca.durability >= 7 && ea.durability <= 3) reasons.push(`Survives ${eName}'s burst and outlasts them`);
  if (ea.attackPower >= 7 && ca.durability >= 7) reasons.push(`Naturally tanky vs ${eName}'s physical damage`);

  // Mobility vs CC (only when there's a real mismatch)
  if (ea.mobility >= 8 && ct.has('cc') && ca.durability >= 5) reasons.push(`Point-and-click CC catches ${eName} despite high mobility`);
  if (ca.mobility >= 8 && ea.abilityPower >= 7 && ea.mobility <= 4) reasons.push(`Too mobile for ${eName}'s skillshots`);

  // AoE vs squishies
  if (ct.has('aoe') && ca.abilityPower >= 7 && ea.durability <= 3) reasons.push(`AoE burst destroys ${eName}'s low HP pool`);

  // Dive potential vs fragile targets
  if (ca.mobility >= 7 && ca.attackPower >= 7 && ea.durability <= 3 && ea.mobility <= 5) reasons.push(`Can dive and burst ${eName} before they react`);

  // Shield/sustain vs poke
  if (ct.has('healing') && ea.abilityPower >= 7 && ea.attackPower <= 3) reasons.push(`Sustain heals through ${eName}'s poke damage`);

  return reasons.slice(0, 3);
}

// ══════════════════════════════════════════
// FLOW 3: DRAFT HELPER
// ══════════════════════════════════════════

function renderDraftSlots() {
  const yourSlotsEl = document.getElementById('draftYourSlots');
  const enemySlotsEl = document.getElementById('draftEnemySlots');

  yourSlotsEl.innerHTML = draftState.your.map((hero, i) => renderDraftSlot('your', i, hero)).join('');
  enemySlotsEl.innerHTML = draftState.enemy.map((hero, i) => renderDraftSlot('enemy', i, hero)).join('');

  // Wire click handlers
  yourSlotsEl.querySelectorAll('.draft-slot').forEach(slot => {
    const idx = parseInt(slot.dataset.index);
    if (draftState.your[idx]) {
      slot.querySelector('.draft-slot-clear').onclick = (e) => {
        e.stopPropagation();
        draftState.your[idx] = null;
        renderDraftSlots();
        updateDraftSuggestions();
      };
    }
    slot.onclick = () => openDraftPicker('your', idx);
  });
  enemySlotsEl.querySelectorAll('.draft-slot').forEach(slot => {
    const idx = parseInt(slot.dataset.index);
    if (draftState.enemy[idx]) {
      slot.querySelector('.draft-slot-clear').onclick = (e) => {
        e.stopPropagation();
        draftState.enemy[idx] = null;
        renderDraftSlots();
        updateDraftSuggestions();
      };
    }
    slot.onclick = () => openDraftPicker('enemy', idx);
  });
}

function renderDraftSlot(team, index, heroSlug) {
  const slotClass = heroSlug ? `draft-slot filled ${team}-slot` : 'draft-slot';
  if (heroSlug) {
    const name = heroProfiles[heroSlug]?.name || heroSlug;
    const roles = getHeroRoles(heroSlug).join(', ') || '';
    return `<div class="${slotClass}" data-index="${index}">
      <img class="draft-slot-img" src="img/heroes/${heroSlug}.webp" alt="${esc(name)}" onerror="this.style.display='none'">
      <div><div class="draft-slot-name">${esc(name)}</div><div class="draft-slot-role">${esc(roles)}</div></div>
      <button class="draft-slot-clear" title="Clear">✕</button>
    </div>`;
  }
  return `<div class="${slotClass}" data-index="${index}">
    <div class="draft-slot-empty">+</div>
  </div>`;
}

function openDraftPicker(team, index) {
  draftState.activeSlot = { team, index };
  const modal = document.getElementById('draftModal');
  modal.classList.remove('hidden');
  document.getElementById('draftModalTitle').textContent = team === 'your' ? 'Pick Your Hero' : 'Pick Enemy Hero';
  document.getElementById('draftModalSearch').value = '';

  // Get all picked slugs — mark as unavailable (greyed out) not "picked" (green)
  const pickedSlugs = new Set([...draftState.your, ...draftState.enemy].filter(Boolean));

  renderHeroGrid('draftHeroGrid', (slug) => {
    draftState[team][index] = slug;
    modal.classList.add('hidden');
    renderDraftSlots();
    updateDraftSuggestions();
  }, { unavailable: pickedSlugs });

  setupGridFilters('draftModalSearch', 'draftRoleFilters', 'draftHeroGrid');
}

// ══════════════════════════════════════════
// ENEMY TEAM SCOUTING
// ══════════════════════════════════════════

function renderEnemyTeamAnalysis() {
  const el = document.getElementById('draftEnemyAnalysis');
  if (!el) return;
  const enemies = draftState.enemy.filter(Boolean);
  if (enemies.length < 2) { el.innerHTML = ''; return; }

  const profiles = enemies.map(s => heroProfiles[s]).filter(Boolean);
  if (!profiles.length) { el.innerHTML = ''; return; }

  // Gather enemy traits
  let ccCount = 0, healCount = 0, mobilityCount = 0, stealthCount = 0;
  let burstCount = 0, executeCount = 0, pokeCount = 0, aoeCount = 0;
  let physCount = 0, magCount = 0, antiHealCount = 0, shieldCount = 0;
  const allTraits = new Set();

  profiles.forEach(p => {
    const bt = new Set(p.baseTraits || []);
    bt.forEach(t => allTraits.add(t));
    if (bt.has('cc')) ccCount++;
    if (bt.has('healing')) healCount++;
    if (bt.has('mobility')) mobilityCount++;
    if (bt.has('stealth')) stealthCount++;
    if (bt.has('burst')) burstCount++;
    if (bt.has('execute')) executeCount++;
    if (bt.has('poke')) pokeCount++;
    if (bt.has('aoe')) aoeCount++;
    if (bt.has('anti_heal')) antiHealCount++;
    if (bt.has('shield')) shieldCount++;
    if (p.damageType === 'physical') physCount++;
    else if (p.damageType === 'magical') magCount++;
    else { physCount += 0.5; magCount += 0.5; }
  });

  const n = profiles.length;

  // Detect comp style
  let compStyle = '';
  if (mobilityCount >= 2 && (burstCount >= 2 || stealthCount >= 1)) compStyle = '🗡️ Dive / Pick comp';
  else if (pokeCount >= 2) compStyle = '🏹 Poke / Siege comp';
  else if (aoeCount >= 3 || ccCount >= 3) compStyle = '💥 Teamfight AoE comp';
  else if (healCount >= 2 || shieldCount >= 2) compStyle = '💚 Sustain / Attrition comp';
  else if (burstCount >= 2) compStyle = '⚡ Burst / Blow-up comp';
  else compStyle = '⚔️ Standard comp';

  // Key threats
  const threats = [];
  if (ccCount >= 3) threats.push(`${ccCount} heroes with hard CC — buy tenacity`);
  else if (ccCount >= 2) threats.push(`${ccCount} CC threats — watch for chain stuns`);
  if (burstCount >= 2) threats.push('Heavy burst — don\'t get caught alone');
  if (stealthCount >= 1) {
    const stealthNames = enemies.filter(s => (heroProfiles[s]?.baseTraits || []).includes('stealth')).map(s => heroProfiles[s]?.name).filter(Boolean);
    threats.push(`Stealth assassin (${stealthNames.join(', ')}) — need wards`);
  }
  if (executeCount >= 1) {
    const exNames = enemies.filter(s => (heroProfiles[s]?.baseTraits || []).includes('execute')).map(s => heroProfiles[s]?.name).filter(Boolean);
    threats.push(`Execute damage (${exNames.join(', ')}) — don't linger low HP`);
  }
  if (healCount >= 2) threats.push(`${healCount} sustain heroes — anti-heal is mandatory`);
  if (mobilityCount >= 3) threats.push('High mobility — hard to pin down');

  // How to counter
  const tips = [];
  const physPct = (physCount / n) * 100;
  const magPct = (magCount / n) * 100;
  if (physPct >= 75) tips.push('Stack armor — they\'re almost all physical');
  else if (magPct >= 75) tips.push('Stack magic resist — they\'re almost all magical');
  if (ccCount >= 3) tips.push('Tenacity items are critical this game');
  if (healCount >= 2) tips.push('Prioritize anti-heal — Pestilence, Toxic Rounds');
  if (stealthCount >= 1) tips.push('Keep wards up and group for objectives');
  if (burstCount >= 2 && stealthCount === 0) tips.push('Build some durability on your carries');
  if (mobilityCount >= 3) tips.push('Draft/build CC to lock down their dive');
  if (!tips.length) tips.push('Play fundamentals — no glaring weakness to exploit');

  let html = '<div class="card" style="margin-top:1rem">';
  html += '<h3 style="margin-bottom:0.75rem">🔍 Enemy Team Threats</h3>';
  html += `<div style="font-size:0.95rem;font-weight:600;margin-bottom:0.5rem">${compStyle}</div>`;

  if (threats.length) {
    html += '<div style="margin-bottom:0.5rem">';
    threats.slice(0, 4).forEach(t => {
      html += `<div style="font-size:0.85rem;color:var(--red,#e74c3c);margin:0.2rem 0">⚠️ ${esc(t)}</div>`;
    });
    html += '</div>';
  }

  html += '<div style="border-top:1px solid var(--bg-3);padding-top:0.5rem;margin-top:0.5rem">';
  html += '<div style="font-size:0.8rem;color:var(--text-2);margin-bottom:0.25rem">How to counter:</div>';
  tips.slice(0, 3).forEach(t => {
    html += `<div style="font-size:0.85rem;color:var(--green,#22c55e);margin:0.2rem 0">✅ ${esc(t)}</div>`;
  });
  html += '</div></div>';

  el.innerHTML = html;
}

// ══════════════════════════════════════════
// KIT-AWARE SUGGESTION REASONS
// ══════════════════════════════════════════

function getKitAwareReasons(heroSlug, enemies, yours) {
  const hp = heroProfiles[heroSlug];
  if (!hp) return [];
  const heroTraits = new Set(hp.baseTraits || []);
  const reasons = [];

  // Collect enemy team-level data
  let enemyPhys = 0, enemyMag = 0;
  const enemyHealers = [], enemyStealthy = [], enemyLowMobility = [], enemyBursters = [], enemyExecuters = [];

  for (const eSlug of enemies) {
    const ep = heroProfiles[eSlug];
    if (!ep) continue;
    const et = new Set(ep.baseTraits || []);
    const eName = ep.name || eSlug;

    if (ep.damageType === 'physical') enemyPhys++;
    else if (ep.damageType === 'magical') enemyMag++;
    else { enemyPhys += 0.5; enemyMag += 0.5; }

    if (et.has('healing')) enemyHealers.push(eName);
    if (et.has('stealth')) enemyStealthy.push(eName);
    if (!et.has('mobility') && !et.has('dash')) enemyLowMobility.push(eName);
    if (et.has('burst')) enemyBursters.push(eName);
    if (et.has('execute')) enemyExecuters.push(eName);
  }

  // Hero has anti-heal vs enemy healers
  if (heroTraits.has('anti_heal') && enemyHealers.length) {
    const targets = enemyHealers.slice(0, 2).join(' & ');
    reasons.push({ text: `Anti-heal shuts down ${targets}'s sustain`, weight: 12 });
  }

  // Hero has CC vs stealth enemies
  if (heroTraits.has('cc') && enemyStealthy.length) {
    const targets = enemyStealthy.slice(0, 2).join(' & ');
    reasons.push({ text: `CC locks down ${targets}'s stealth engages`, weight: 11 });
  }

  // Hero has CC/burst vs low mobility enemies
  if ((heroTraits.has('cc') || heroTraits.has('burst')) && enemyLowMobility.length >= 2) {
    const targets = enemyLowMobility.slice(0, 2).join(' & ');
    if (heroTraits.has('burst')) {
      reasons.push({ text: `Burst punishes ${targets}'s low mobility`, weight: 9 });
    } else {
      reasons.push({ text: `CC pins down immobile targets like ${targets}`, weight: 8 });
    }
  }

  // Hero has shield/sustain vs burst enemies
  if ((heroTraits.has('shield') || heroTraits.has('healing')) && enemyBursters.length) {
    const targets = enemyBursters.slice(0, 2).join(' & ');
    if (heroTraits.has('shield')) {
      reasons.push({ text: `Shield absorb protects against ${targets} burst`, weight: 10 });
    } else {
      reasons.push({ text: `Sustain helps survive ${targets}'s burst`, weight: 7 });
    }
  }

  // Hero has shield vs execute enemies
  if (heroTraits.has('shield') && enemyExecuters.length) {
    const targets = enemyExecuters.slice(0, 2).join(' & ');
    reasons.push({ text: `Shield buffer denies ${targets}'s execute threshold`, weight: 9 });
  }

  // Mixed damage when enemy stacks one type
  const enemyTotal = enemyPhys + enemyMag;
  if (enemyTotal >= 2) {
    const enemyPhysPct = enemyPhys / enemyTotal;
    if (hp.damageType === 'magical' && enemyPhysPct >= 0.7) {
      reasons.push({ text: 'Magic damage — they\'re stacking physical armor', weight: 10 });
    } else if (hp.damageType === 'physical' && enemyPhysPct <= 0.3) {
      reasons.push({ text: 'Physical damage — they\'re stacking magic resist', weight: 10 });
    }
  }

  // Team needs CC and hero provides it
  const yourCC = yours.some(s => (heroProfiles[s]?.baseTraits || []).includes('cc'));
  if (!yourCC && heroTraits.has('cc')) {
    reasons.push({ text: 'Your team needs CC — brings lockdown', weight: 11 });
  }

  // Hero has AoE vs clumpy/teamfight enemy comp
  if (heroTraits.has('aoe') && enemies.length >= 3) {
    const enemyCCCount = enemies.filter(s => (heroProfiles[s]?.baseTraits || []).includes('cc')).length;
    if (enemyCCCount >= 2) {
      reasons.push({ text: 'AoE damage punishes their teamfight-heavy comp', weight: 7 });
    }
  }

  // Sort by weight, return top reasons
  reasons.sort((a, b) => b.weight - a.weight);
  return reasons.slice(0, 3).map(r => r.text);
}

async function updateDraftSuggestions() {
  renderDraftTeamAnalysis();
  renderEnemyTeamAnalysis();
  const sugEl = document.getElementById('draftSuggestionsList');
  const hintEl = document.querySelector('.draft-suggestions-hint');

  const enemies = draftState.enemy.filter(Boolean);
  const yours = draftState.your.filter(Boolean);
  const allPicked = new Set([...enemies, ...yours]);

  if (!enemies.length) {
    sugEl.innerHTML = '';
    if (hintEl) hintEl.style.display = '';
    return;
  }
  if (hintEl) hintEl.style.display = 'none';

  // Load enemy data
  const heroDataMap = {};
  for (const slug of enemies) {
    try { heroDataMap[slug] = await loadHeroData(currentVersion, slug); } catch {}
  }

  // Score all unpicked heroes
  const scores = [];
  for (const h of heroIndex) {
    if (allPicked.has(h.slug)) continue;

    let counterScore = 0;
    let counterReasons = [];

    // 60% counter value
    for (const enemySlug of enemies) {
      const enemyData = heroDataMap[enemySlug];
      if (!enemyData) continue;
      const rd = getRoleData(enemyData, enemyData.activeRoles?.[0] || 'all');
      if (!rd?.counters) continue;
      const heroName = heroDisplayName(h.slug);
      const match = rd.counters.find(c => {
        const cName = heroDisplayName(c.hero);
        return cName === heroName || c.hero === h.slug || heroSlugFromName(c.hero) === h.slug;
      });
      if (match) {
        const advantage = 50 - match.winRate;
        counterScore += advantage;
        if (advantage > 2) {
          const enemyName = heroProfiles[enemySlug]?.name || enemySlug;
          counterReasons.push(`${(50 + advantage).toFixed(0)}% WR vs ${enemyName}`);
        }
      }
    }

    // 40% team fit
    let fitScore = 0;
    let fitReasons = [];
    const heroProfile = heroProfiles[h.slug];
    const heroRoles = getHeroRoles(h.slug);

    // Check role gaps
    const yourRoles = yours.map(s => getHeroRoles(s)).flat();
    const roleCounts = {};
    yourRoles.forEach(r => { roleCounts[r] = (roleCounts[r] || 0) + 1; });

    const neededRoles = ['carry', 'support', 'midlane', 'jungle', 'offlane'].filter(r => !roleCounts[r]);
    if (heroRoles.some(r => neededRoles.includes(r))) {
      fitScore += 15;
      const filledRole = heroRoles.find(r => neededRoles.includes(r));
      fitReasons.push(`Fills ${filledRole} role`);
    }

    // Damage balance
    const yourDmgTypes = yours.map(s => heroProfiles[s]?.damageType).filter(Boolean);
    const physCount = yourDmgTypes.filter(t => t === 'physical').length;
    const magCount = yourDmgTypes.filter(t => t === 'magical').length;
    if (heroProfile?.damageType === 'magical' && physCount > magCount + 1) {
      fitScore += 8;
    } else if (heroProfile?.damageType === 'physical' && magCount > physCount + 1) {
      fitScore += 8;
    }

    // CC needs
    const yourCC = yours.some(s => (heroProfiles[s]?.baseTraits || []).includes('cc'));
    if (!yourCC && (heroProfile?.baseTraits || []).includes('cc')) {
      fitScore += 10;
    }

    // Get kit-aware reasons (replaces generic "Adds CC", "Adds magic damage")
    const kitReasons = getKitAwareReasons(h.slug, enemies, yours);

    const totalScore = counterScore * 0.6 + fitScore * 0.4;
    // Prefer kit-aware reasons, fall back to WR reasons, then fit reasons
    const reasons = kitReasons.length
      ? [...kitReasons, ...counterReasons].slice(0, 3)
      : [...counterReasons, ...fitReasons].slice(0, 3);

    if (totalScore > 0 || !enemies.length) {
      scores.push({ slug: h.slug, score: totalScore, reasons });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const topSuggestions = scores.slice(0, 8);

  if (!topSuggestions.length) {
    sugEl.innerHTML = '<p style="color:var(--text-2);padding:0.5rem">No strong suggestions found</p>';
    return;
  }

  let html = '';
  topSuggestions.forEach(s => {
    const name = heroProfiles[s.slug]?.name || s.slug;
    const scoreColor = s.score >= 10 ? 'var(--green)' : s.score >= 5 ? 'var(--gold)' : 'var(--text-1)';
    html += `<div class="draft-suggestion-item" data-slug="${esc(s.slug)}">`;
    html += `<img class="draft-suggestion-img" src="img/heroes/${s.slug}.webp" alt="${esc(name)}" onerror="this.style.display='none'">`;
    html += `<div class="draft-suggestion-info">`;
    html += `<div class="draft-suggestion-name">${esc(name)}</div>`;
    html += `<div class="draft-suggestion-reason">${s.reasons.map(esc).join(' • ') || 'Solid pick'}</div>`;
    html += `</div>`;
    html += `<div class="draft-suggestion-score" style="color:${scoreColor}">${s.score > 0 ? '+' + s.score.toFixed(0) : '—'}</div>`;
    html += `</div>`;
  });
  sugEl.innerHTML = html;

  // Click suggestion → auto-fill next empty your slot
  sugEl.querySelectorAll('.draft-suggestion-item').forEach(item => {
    item.onclick = () => {
      const slug = item.dataset.slug;
      const emptyIdx = draftState.your.indexOf(null);
      if (emptyIdx !== -1) {
        draftState.your[emptyIdx] = slug;
        renderDraftSlots();
        updateDraftSuggestions();
      }
    };
  });
}

// ══════════════════════════════════════════
// DRAFT TEAM ANALYSIS (progressive)
// ══════════════════════════════════════════

function renderDraftTeamAnalysis() {
  const el = document.getElementById('draftTeamAnalysis');
  if (!el) return;
  const heroes = draftState.your.filter(Boolean);
  if (!heroes.length) { el.innerHTML = ''; return; }

  // Gather data
  const profiles = heroes.map(s => heroProfiles[s]).filter(Boolean);
  const count = heroes.length;

  // Damage split
  let phys = 0, mag = 0;
  profiles.forEach(p => {
    if (p.damageType === 'physical') phys++;
    else if (p.damageType === 'magical') mag++;
    else { phys += 0.5; mag += 0.5; } // hybrid
  });
  const total = phys + mag || 1;
  const physPct = Math.round((phys / total) * 100);
  const magPct = 100 - physPct;

  // Traits & roles
  const allTraits = new Set();
  const rolesFilled = new Set();
  let ccCount = 0, healCount = 0, mobilityCount = 0, tankCount = 0, hasEngage = false;
  profiles.forEach(p => {
    (p.baseTraits || []).forEach(t => allTraits.add(t));
    (p.roles || []).forEach(r => rolesFilled.add(r.toLowerCase()));
    if ((p.baseTraits || []).includes('cc')) ccCount++;
    if ((p.baseTraits || []).includes('healing') || (p.baseTraits || []).includes('shield')) healCount++;
    if ((p.baseTraits || []).includes('mobility')) mobilityCount++;
    if ((p.attributes?.durability || 0) >= 7) tankCount++;
    if ((p.baseTraits || []).includes('cc') && (p.attributes?.durability || 0) >= 6) hasEngage = true;
  });

  const allRoles = ['offlane', 'jungle', 'midlane', 'carry', 'support'];
  const missingRoles = allRoles.filter(r => !rolesFilled.has(r));

  // Grade calculation
  function calcGrade() {
    let score = 50;
    // Role coverage: +10 per role filled
    score += rolesFilled.size * 10;
    // Damage balance: best at 40-60 split
    if (physPct >= 30 && physPct <= 70) score += 15;
    else if (physPct >= 20 && physPct <= 80) score += 5;
    else score -= 10;
    // CC
    if (ccCount >= 3) score += 15;
    else if (ccCount >= 2) score += 10;
    else if (ccCount >= 1) score += 5;
    else score -= 10;
    // Frontline
    if (tankCount >= 1) score += 10;
    else score -= 10;
    // Sustain
    if (healCount >= 1) score += 5;
    // Engage
    if (hasEngage) score += 5;
    // Normalize to grade
    if (score >= 110) return 'A';
    if (score >= 95) return 'B';
    if (score >= 75) return 'C';
    if (score >= 55) return 'D';
    return 'F';
  }

  // Strengths & weaknesses
  function getStrengths() {
    const s = [];
    if (physPct >= 30 && physPct <= 70) s.push('✨ Balanced damage — enemies can\'t stack one resist');
    if (ccCount >= 3) s.push('🔒 Strong CC chain potential');
    else if (ccCount >= 2) s.push('🔒 Decent CC coverage');
    if (tankCount >= 2) s.push('🛡️ Strong frontline presence');
    else if (tankCount >= 1) s.push('🛡️ Has a frontline');
    if (healCount >= 1) s.push('💚 Has sustain (heals/shields)');
    if (hasEngage) s.push('⚡ Has engage tools');
    if (mobilityCount >= 3) s.push('💨 High mobility team');
    return s;
  }
  function getWeaknesses() {
    const w = [];
    if (physPct >= 80) w.push('⚠️ All physical — enemies will stack armor');
    else if (physPct >= 70) w.push('⚠️ Skews physical');
    if (magPct >= 80) w.push('⚠️ All magical — enemies will stack magic resist');
    else if (magPct >= 70) w.push('⚠️ Skews magical');
    if (ccCount === 0) w.push('🚨 No CC — can\'t lock anyone down');
    if (tankCount === 0 && count >= 3) w.push('🚨 No frontline — carries will get dove');
    if (healCount === 0 && count >= 3) w.push('⚠️ No sustain — lose attrition fights');
    if (missingRoles.length > 0 && count >= 3) w.push('⚠️ Missing roles: ' + missingRoles.join(', '));
    return w;
  }

  // Smart last-pick suggestion (4 heroes)
  function getLastPickHint() {
    const hints = [];
    if (physPct >= 70 && magPct < 30) hints.push('Need magical damage');
    if (magPct >= 70 && physPct < 30) hints.push('Need physical damage');
    if (tankCount === 0) hints.push('No frontline yet');
    if (ccCount === 0) hints.push('Need CC');
    if (healCount === 0) hints.push('Need sustain');
    if (missingRoles.length) hints.push('Fill: ' + missingRoles.join(' or '));
    return hints;
  }

  // Damage bar HTML
  const dmgBar = `<div style="margin:0.5rem 0">
    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-2);margin-bottom:0.25rem">
      <span>Physical ${physPct}%</span><span>Magical ${magPct}%</span>
    </div>
    <div style="display:flex;height:18px;border-radius:4px;overflow:hidden">
      <div style="width:${physPct}%;background:var(--red,#e74c3c)"></div>
      <div style="width:${magPct}%;background:var(--accent,#8b5cf6)"></div>
    </div>
  </div>`;

  // Grade badge
  const grade = calcGrade();
  const gradeColors = { A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#ef4444' };
  const gradeBadge = `<span style="display:inline-block;background:${gradeColors[grade]};color:#000;font-weight:700;font-size:1.2rem;padding:0.2rem 0.6rem;border-radius:6px;margin-right:0.5rem">${grade}</span>`;

  let html = '<div class="card" style="margin-top:1rem">';
  html += '<h3 style="margin-bottom:0.75rem">📊 Team Analysis</h3>';

  if (count === 1) {
    const p = profiles[0];
    html += `<div style="font-size:0.9rem"><strong>${esc(p.name)}</strong> — ${esc(p.damageType)} damage</div>`;
    const traits = (p.baseTraits || []).map(t => `<span style="background:var(--bg-3);padding:0.15rem 0.4rem;border-radius:3px;font-size:0.75rem;margin:0.15rem">${esc(t)}</span>`).join(' ');
    if (traits) html += `<div style="margin:0.5rem 0">${traits}</div>`;
    if (missingRoles.length) html += `<div style="font-size:0.82rem;color:var(--text-2);margin-top:0.5rem">Still need: ${missingRoles.join(', ')}</div>`;
  } else if (count === 2) {
    html += dmgBar;
    html += `<div style="font-size:0.85rem;color:var(--text-1);margin:0.3rem 0">CC heroes: ${ccCount}/2</div>`;
    if (missingRoles.length) html += `<div style="font-size:0.82rem;color:var(--text-2)">Still need: ${missingRoles.join(', ')}</div>`;
  } else if (count === 3) {
    html += `<div style="margin-bottom:0.5rem">${gradeBadge} <span style="color:var(--text-2);font-size:0.85rem">Draft Grade (3/5)</span></div>`;
    html += dmgBar;
    const strengths = getStrengths();
    if (strengths.length) html += `<div style="margin-top:0.5rem">${strengths.map(s => `<div style="font-size:0.82rem;color:var(--green,#22c55e)">${s}</div>`).join('')}</div>`;
    if (missingRoles.length) html += `<div style="font-size:0.82rem;color:var(--text-2);margin-top:0.3rem">Still need: ${missingRoles.join(', ')}</div>`;
  } else if (count === 4) {
    html += `<div style="margin-bottom:0.5rem">${gradeBadge} <span style="color:var(--text-2);font-size:0.85rem">Draft Grade (4/5)</span></div>`;
    html += dmgBar;
    const strengths = getStrengths();
    const weaknesses = getWeaknesses();
    if (strengths.length) html += `<div style="margin-top:0.5rem">${strengths.map(s => `<div style="font-size:0.82rem;color:var(--green,#22c55e)">${s}</div>`).join('')}</div>`;
    if (weaknesses.length) html += `<div style="margin-top:0.3rem">${weaknesses.map(w => `<div style="font-size:0.82rem;color:var(--red,#ef4444)">${w}</div>`).join('')}</div>`;
    const hints = getLastPickHint();
    if (hints.length) html += `<div style="margin-top:0.5rem;padding:0.5rem;background:var(--bg-3);border-radius:6px;font-size:0.85rem">🎯 <strong>Last pick tip:</strong> ${hints.join(' • ')}</div>`;
  } else {
    // Full 5-hero analysis
    html += `<div style="margin-bottom:0.5rem">${gradeBadge} <span style="color:var(--text-2);font-size:0.85rem">Team Grade</span></div>`;
    html += dmgBar;
    html += `<div style="font-size:0.85rem;color:var(--text-1);margin:0.3rem 0">Total CC heroes: ${ccCount}/5</div>`;
    const strengths = getStrengths();
    const weaknesses = getWeaknesses();
    if (strengths.length) {
      html += `<div style="margin-top:0.75rem"><div style="font-size:0.75rem;font-weight:600;color:var(--green,#22c55e);text-transform:uppercase;margin-bottom:0.3rem">Strengths</div>`;
      html += strengths.map(s => `<div style="font-size:0.82rem;color:var(--green,#22c55e)">${s}</div>`).join('');
      html += '</div>';
    }
    if (weaknesses.length) {
      html += `<div style="margin-top:0.5rem"><div style="font-size:0.75rem;font-weight:600;color:var(--red,#ef4444);text-transform:uppercase;margin-bottom:0.3rem">Weaknesses</div>`;
      html += weaknesses.map(w => `<div style="font-size:0.82rem;color:var(--red,#ef4444)">${w}</div>`).join('');
      html += '</div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;
}

// ══════════════════════════════════════════
// DUO ANALYSIS (from original)
// ══════════════════════════════════════════

function renderDuoResultV2(r) {
  let html = '';
  if (r.synergyNotes?.length) {
    html += '<div class="card" style="margin-bottom:1rem"><h3>🤝 Lane Synergy</h3>';
    r.synergyNotes.forEach(n => { html += `<div style="font-size:0.85rem;color:var(--text-2);margin:0.2rem 0">• ${esc(n)}</div>`; });
    html += '</div>';
  }
  html += '<div class="matchup-builds">';
  for (const ally of (r.allies || [])) {
    html += '<div class="card">';
    html += `<h3>${esc(ally.hero?.name || '?')} (${esc(ally.hero?.role || '?')})</h3>`;
    const allyProfile = heroProfiles[ally.hero?.slug];
    if (allyProfile) html += renderArchetypeTags(allyProfile);
    if (ally.responsibility) html += `<div style="font-size:0.82rem;color:var(--accent);margin:0.3rem 0">${esc(ally.responsibility)}</div>`;
    if (ally.build) {
      html += `<div style="font-weight:600;margin-bottom:0.3rem">${esc(ally.build.name || 'Counter Build')}</div>`;
      html += '<div class="build-card-items">';
      (ally.build.items || []).forEach((item, i) => {
        if (i > 0) html += '<span class="build-arrow">→</span>';
        html += `<span>${itemWithImg(item)}</span>`;
      });
      html += '</div>';
      if (ally.build.path) {
        ally.build.path.forEach(p => {
          html += `<div style="font-size:0.78rem;color:var(--text-2);margin-top:0.2rem">• ${itemWithImg(p.item)}: ${p.reasons.map(esc).join(', ')}</div>`;
        });
      }
    }
    html += '</div>';
  }
  html += '</div>';
  if (r.tips?.length) {
    html += '<div class="card" style="margin-top:1rem"><h3>💡 Tips</h3>';
    r.tips.forEach(t => { html += `<div style="font-size:0.85rem;margin:0.2rem 0">• ${esc(t)}</div>`; });
    html += '</div>';
  }
  return html;
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

async function init() {
  // Load hero profiles
  try {
    const pRes = await fetch(`${DATA_BASE}/game-data/hero-profiles.json${CACHE_BUST}`);
    if (pRes.ok) {
      const profiles = await pRes.json();
      profiles.forEach(p => { heroProfiles[p.slug] = p; });
    }
  } catch {}

  // Load duo synergies
  try {
    const dsRes = await fetch(`${DATA_BASE}/game-data/duo-synergies.json${CACHE_BUST}`);
    if (dsRes.ok) duoSynergies = await dsRes.json();
  } catch {}

  // Load engines
  try { if (typeof ComboEngine !== 'undefined') await ComboEngine.load(); } catch {}
  try { if (typeof SupportSynergy !== 'undefined') await SupportSynergy.load(); } catch {}
  try { if (typeof MatchupEngine !== 'undefined') await MatchupEngine.init(DATA_BASE); } catch {}
  try { if (typeof AbilityInteractions !== 'undefined') await AbilityInteractions.init(DATA_BASE); } catch {}

  // Find data
  currentVersion = await findLatestVersion();
  if (!currentVersion) {
    document.getElementById('landingPage').innerHTML = '<p style="color:var(--red);text-align:center;padding:3rem">No data found. Please check data directory.</p>';
    return;
  }

  // Load hero index
  const res = await fetch(`${DATA_BASE}/${currentVersion}/heroes.json${CACHE_BUST}`);
  const index = await res.json();
  heroIndex = (index.heroes || []).filter(h => !h.error && !h.skipped);

  // Show patch version badge
  try {
    const sampleHero = heroIndex[0];
    if (sampleHero) {
      const sampleData = await loadHeroData(currentVersion, sampleHero.slug);
      const gv = sampleData?.gameVersion;
      const badge = document.getElementById('patchBadge');
      if (badge && gv) {
        const dateStr = currentVersion.replace(/_.*/, '');
        badge.textContent = `Patch ${gv} · ${dateStr}`;
      }
    }
  } catch {}

  // Scan for additional heroes
  const slugsInIndex = new Set(heroIndex.map(h => h.slug));
  const knownSlugs = [
    'twinblast','shinbi','eden','narbash','countess','crunch','muriel','terra',
    'sparrow','steel','kira','sevarog','morigesh','wukong','gadget','aurora',
    'bayle','rampage','revenant','yurei','grim-exe','greystone','zinx','skylar',
    'murdock','the-fey','yin','phase','akeron','kallari','lt-belica','riktor',
    'zarus','drongo','grux','iggy-scorch','renna','serath','howitzer','argus',
    'kwang','feng-mao','dekker','gideon','maco','khaimera','wraith','mourn','boris'
  ];
  for (const slug of knownSlugs) {
    if (!slugsInIndex.has(slug)) {
      try {
        const r = await fetch(`${DATA_BASE}/${currentVersion}/${slug}.json${CACHE_BUST}`, { method: 'HEAD' });
        if (r.ok) heroIndex.push({ slug, name: slug });
      } catch {}
    }
  }

  heroIndex.sort((a, b) => {
    const nameA = heroProfiles[a.slug]?.name || a.name || a.slug;
    const nameB = heroProfiles[b.slug]?.name || b.name || b.slug;
    return nameA.localeCompare(nameB);
  });

  // Populate enemy select dropdown (for matchup tab)
  const enemySelect = document.getElementById('enemySelect');
  heroIndex.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.slug;
    opt.textContent = heroProfiles[h.slug]?.name || h.name || h.slug;
    enemySelect.appendChild(opt);
  });

  // Populate duo selects
  const duoSelects = ['duoAlly1Hero', 'duoAlly2Hero', 'duoEnemy1Hero', 'duoEnemy2Hero'];
  for (const id of duoSelects) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    heroIndex.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.slug;
      opt.textContent = heroProfiles[h.slug]?.name || h.name || h.slug;
      sel.appendChild(opt);
    });
  }

  // ── Wire up navigation ──

  // Landing cards
  document.querySelectorAll('.landing-card').forEach(card => {
    card.onclick = () => navigate(card.dataset.flow);
  });

  // Home button / breadcrumb
  document.getElementById('homeBtn').onclick = () => navigate(null);
  document.getElementById('aboutLink').onclick = (e) => { e.preventDefault(); navigate('about'); };
  document.getElementById('breadcrumbHome').onclick = () => navigate(null);

  // Counter teaser link
  document.getElementById('counterTeaserLink').onclick = (e) => {
    e.preventDefault();
    navigate('counter');
  };

  // Hero grid filters
  setupGridFilters('heroGridSearch', 'roleFilters', 'heroGrid');

  // Learn tab switching
  document.querySelectorAll('#learnTabBar .tab').forEach(tab => {
    tab.onclick = () => switchLearnTab(tab.dataset.tab);
  });

  // Role change on learn page
  document.getElementById('learnRoleSelect').onchange = () => {
    if (currentHero) {
      currentRole = document.getElementById('learnRoleSelect').value;
      renderOverview();
      renderMatchup();
      renderAbilities();
      renderCounters();
      renderStats();
      renderSynergy();
    }
  };

  // Enemy select change
  document.getElementById('enemySelect').onchange = () => renderMatchup();

  // Matchup mode toggle
  document.querySelectorAll('.matchup-mode-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.matchup-mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      document.getElementById('matchupSolo').classList.toggle('hidden', mode !== 'solo');
      document.getElementById('matchupDuo').classList.toggle('hidden', mode !== 'duo');
    };
  });

  // Duo analyze
  const duoAnalyzeBtn = document.getElementById('duoAnalyzeBtn');
  if (duoAnalyzeBtn) {
    duoAnalyzeBtn.onclick = async () => {
      const a1 = document.getElementById('duoAlly1Hero').value;
      const a1r = document.getElementById('duoAlly1Role').value;
      const a2 = document.getElementById('duoAlly2Hero').value;
      const a2r = document.getElementById('duoAlly2Role').value;
      const e1 = document.getElementById('duoEnemy1Hero').value;
      const e2 = document.getElementById('duoEnemy2Hero').value;
      const resultsEl = document.getElementById('duoResults');

      if (!a1 || !a2) { resultsEl.innerHTML = '<p style="color:var(--text-2);padding:1rem">Select both allies.</p>'; return; }
      resultsEl.innerHTML = '<p style="color:var(--text-2)">Analyzing…</p>';

      const slugs = [a1, a2, e1, e2].filter(Boolean);
      const heroDataMap = {};
      for (const slug of slugs) { try { heroDataMap[slug] = await loadHeroData(currentVersion, slug); } catch {} }

      let html = '';
      if (typeof SupportSynergy !== 'undefined') html += SupportSynergy.renderDuoSynergyAnalysis(a1, a2);

      const duoData = getDuoSynergyData(a1, a2);
      if (duoData) {
        const scoreColor = duoData.synergyScore >= 40 ? '#66bb6a' : duoData.synergyScore >= 25 ? '#ffa726' : '#ef5350';
        html += `<div class="duo-synergy-banner">`;
        html += `<span class="duo-synergy-score" style="color:${scoreColor}">${Math.min(100, duoData.synergyScore)}%</span>`;
        if (duoData.combinedCC > 0) html += `<span class="duo-synergy-cc">🔒 ${duoData.combinedCC}s CC</span>`;
        if (duoData.winRate) html += `<span style="font-weight:600"><span class="${wrClass(duoData.winRate)}">${duoData.winRate.toFixed(1)}%</span> WR in ${duoData.matches} games</span>`;
        html += '</div>';
        if (duoData.reasons?.length) {
          html += '<div class="card" style="margin-bottom:1rem">';
          duoData.reasons.forEach(r => { html += `<div class="duo-synergy-reason">• ${esc(r)}</div>`; });
          html += '</div>';
        }
      }

      if (e1 && typeof MatchupEngine !== 'undefined' && MatchupEngine.isReady()) {
        const enemies = [e1]; if (e2) enemies.push(e2);
        const result = MatchupEngine.duoCounterBuild([{ slug: a1, role: a1r }, { slug: a2, role: a2r }], enemies, heroDataMap);
        if (!result.error) html += renderDuoResultV2(result);
        else html += `<p style="color:var(--red)">${esc(result.error)}</p>`;
      }

      resultsEl.innerHTML = html;
    };
  }

  // Draft clear button
  document.getElementById('draftClearBtn').onclick = () => {
    draftState.your = [null, null, null, null, null];
    draftState.enemy = [null, null, null, null, null];
    renderDraftSlots();
    updateDraftSuggestions();
  };

  // Draft modal close
  document.getElementById('draftModalClose').onclick = () => {
    document.getElementById('draftModal').classList.add('hidden');
  };
  document.getElementById('draftModal').onclick = (e) => {
    if (e.target === document.getElementById('draftModal')) {
      document.getElementById('draftModal').classList.add('hidden');
    }
  };

  // Hash routing
  window.onhashchange = handleHashRoute;
  handleHashRoute();

  // Global tag click handler (delegation)
  document.addEventListener('click', (e) => {
    const tag = e.target.closest('[data-tag-label]');
    if (tag) {
      e.stopPropagation();
      showTagModal(tag.dataset.tagLabel);
      return;
    }
    const itemEl = e.target.closest('[data-item-name]');
    if (itemEl && !itemEl.closest('.tag-modal-overlay, button, a, .tab-btn, .hero-grid-item, select, input, .build-card-header')) {
      e.preventDefault();
      showItemModal(itemEl.dataset.itemName);
      return;
    }
    const learn = e.target.closest('[data-learn]');
    if (learn && !learn.closest('.tag-modal')) {
      e.stopPropagation();
      navigate('learn', learn.dataset.learn);
    }
  });
}

// ══════════════════════════════════════════
// FLOW 4: BUILD LAB
// ══════════════════════════════════════════

const buildState = {
  items: [null, null, null, null, null, null], // 6 item slots
  crest: null,
  hero: null,
  activeSlot: null, // which slot is being filled
  initialized: false,
};

// Item categories for filtering (stat-based)
const ITEM_CATEGORIES = {
  'phys-atk': ['PHYSICAL_POWER','CRITICAL_CHANCE','PHYSICAL_PENETRATION'],
  'atk-spd': ['ATTACK_SPEED'],
  'magic-atk': ['MAGICAL_POWER','MAGICAL_PENETRATION','ABILITY_HASTE'],
  'phys-def': ['PHYSICAL_ARMOR'],
  'magic-def': ['MAGICAL_ARMOR'],
  sustain: ['LIFESTEAL','MAGICAL_LIFESTEAL','OMNIVAMP','HEAL_AND_SHIELD_POWER','BASE_HEALTH_REGENERATION'],
  lifesteal: ['LIFESTEAL'],
  omnivamp: ['OMNIVAMP','MAGICAL_LIFESTEAL'],
  utility: ['ABILITY_HASTE','MOVEMENT_SPEED','MANA','BASE_MANA_REGENERATION','GOLD_PER_SECOND'],
};

// Rarity to tier mapping
const RARITY_TIER = { COMMON: 1, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 3 };

// Stat display names
const STAT_NAMES = {
  PHYSICAL_POWER: 'Physical Power', MAGICAL_POWER: 'Magical Power',
  ATTACK_SPEED: 'Attack Speed', CRITICAL_CHANCE: 'Crit Chance',
  PHYSICAL_ARMOR: 'Physical Armor', MAGICAL_ARMOR: 'Magic Resist',
  HEALTH: 'Health', MANA: 'Mana', ABILITY_HASTE: 'Ability Haste',
  PHYSICAL_PENETRATION: 'Physical Pen', MAGICAL_PENETRATION: 'Magic Pen',
  LIFESTEAL: 'Lifesteal', MAGICAL_LIFESTEAL: 'Magical Lifesteal', OMNIVAMP: 'Omnivamp',
  MOVEMENT_SPEED: 'Move Speed', TENACITY: 'Tenacity',
  HEAL_AND_SHIELD_POWER: 'Heal & Shield Power',
  BASE_HEALTH_REGENERATION: 'Health Regen', BASE_MANA_REGENERATION: 'Mana Regen',
  GOLD_PER_SECOND: 'Gold/sec',
};

const PERCENT_STATS = new Set(['ATTACK_SPEED','CRITICAL_CHANCE','LIFESTEAL','MAGICAL_LIFESTEAL','OMNIVAMP','TENACITY','HEAL_AND_SHIELD_POWER']);

// Parsed items cache (from items.json loaded via ITEM_DATA)
let buildItems = []; // { name, slug, rarity, tier, price, slotType, stats: [{stat,value}], effects }
let buildCrests = [];

function parseBuildItems() {
  if (buildItems.length) return;
  // ITEM_DATA is from item-data.js (window scope), CREST_DATA from crest-data.js
  if (typeof ITEM_DATA === 'undefined') return;
  const allData = { ...ITEM_DATA, ...(typeof CREST_DATA !== 'undefined' ? CREST_DATA : {}) };
  for (const [name, d] of Object.entries(allData)) {
    const rarity = { C: 'COMMON', U: 'UNCOMMON', R: 'RARE', E: 'EPIC', L: 'LEGENDARY' }[d.r] || d.r;
    const tier = RARITY_TIER[rarity] || 1;
    const slotType = { P: 'PASSIVE', C: 'CREST', A: 'ACTIVE', T: 'TRINKET' }[d.s] || d.s;
    const stats = (d.st || []).map(s => {
      // Parse stat strings like "+50 Physical Power" or "20% Critical Chance"
      const m = s.match(/^\+?([\d.]+)(%?)\s+(.+)$/);
      if (!m) return null;
      const value = parseFloat(m[1]);
      const statName = m[3];
      // Reverse lookup stat key
      const statKey = Object.entries(STAT_NAMES).find(([k, v]) => v.toLowerCase() === statName.toLowerCase())?.[0];
      return statKey ? { stat: statKey, value } : null;
    }).filter(Boolean);
    const item = { name, rarity, tier, price: d.p, slotType, stats, effects: d.fx || [] };
    if (slotType === 'CREST') buildCrests.push(item);
    else if (slotType === 'PASSIVE') buildItems.push(item);
  }
  // Sort by price descending (most expensive first = most interesting)
  buildItems.sort((a, b) => b.price - a.price);
  buildCrests.sort((a, b) => a.name.localeCompare(b.name));
}

function initBuildLab() {
  parseBuildItems();
  if (!buildState.initialized) {
    buildState.initialized = true;
    // Populate hero select
    const sel = document.getElementById('buildHeroSelect');
    if (sel.options.length <= 1) {
      heroIndex.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.slug;
        opt.textContent = heroProfiles[h.slug]?.name || h.name || h.slug;
        sel.appendChild(opt);
      });
    }
    sel.onchange = () => {
      buildState.hero = sel.value || null;
      updateBuildHeroInfo();
      updateBuildFeedback();
      const presetBtn = document.getElementById('buildLoadPreset');
      presetBtn.style.display = buildState.hero ? '' : 'none';
    };
    document.getElementById('buildLoadPreset').onclick = loadBuildPreset;
    document.getElementById('buildClearAll').onclick = clearBuild;

    // Category tabs
    document.getElementById('buildCategoryTabs').onclick = (e) => {
      const btn = e.target.closest('.build-cat-btn');
      if (!btn) return;
      document.querySelectorAll('.build-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBuildItemGrid();
    };
    // Search
    document.getElementById('buildItemSearch').oninput = () => renderBuildItemGrid();
    // Crest search merged into main item search

    // Slot click handlers
    wireSlotClicks();
  }
  renderBuildSlots();
  renderBuildItemGrid();
  updateBuildStats();
  updateBuildFeedback();
  // Safety: re-render if grid is empty (race condition on first load)
  setTimeout(() => {
    if (!document.getElementById('buildItemGrid')?.children.length) {
      parseBuildItems();
      renderBuildItemGrid();
    }
  }, 100);
}

function wireSlotClicks() {
  document.getElementById('buildItemSlots').onclick = (e) => {
    const slot = e.target.closest('.build-slot');
    if (!slot) return;
    const clear = e.target.closest('.build-slot-clear');
    const isCrest = slot.dataset.slot === 'crest';

    if (clear) {
      if (isCrest) { buildState.crest = null; }
      else { buildState.items[parseInt(slot.dataset.slot)] = null; }
      renderBuildSlots();
      updateBuildStats();
      updateBuildFeedback();
      renderBuildItemGrid();
      return;
    }

    if (isCrest) {
      // Switch to crest category and scroll to shop
      document.querySelectorAll('.build-cat-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.build-cat-btn[data-cat="crest"]').classList.add('active');
      renderBuildItemGrid();
    }
    document.getElementById('buildItemGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function renderBuildSlots() {
  const slotsEl = document.getElementById('buildItemSlots');
  let html = buildState.items.map((item, i) => {
    if (item) {
      const imgSrc = getItemImgSrc(item.name);
      return `<div class="build-slot filled" data-slot="${i}">
        <img src="${imgSrc}" alt="${esc(item.name)}" title="${esc(item.name)}">
        <button class="build-slot-clear">&times;</button>
      </div>`;
    }
    return `<div class="build-slot empty" data-slot="${i}"><span class="build-slot-label">${i + 1}</span></div>`;
  }).join('');

  // Divider + crest slot inline
  html += '<div style="width:1px;background:var(--border);margin:0 0.15rem;align-self:stretch"></div>';
  if (buildState.crest) {
    const imgSrc = getCrestImgSrc(buildState.crest.name);
    html += `<div class="build-slot build-crest-slot filled" data-slot="crest"><img src="${imgSrc}" alt="${esc(buildState.crest.name)}" title="${esc(buildState.crest.name)}"><button class="build-slot-clear">&times;</button></div>`;
  } else {
    html += '<div class="build-slot build-crest-slot empty" data-slot="crest"><span class="build-slot-label">C</span></div>';
  }
  slotsEl.innerHTML = html;

  // Gold total
  let existingGold = document.querySelector('.build-gold-total');
  if (!existingGold) {
    existingGold = document.createElement('div');
    existingGold.className = 'build-gold-total';
    slotsEl.parentElement.appendChild(existingGold);
  }
  const totalGold = buildState.items.filter(Boolean).reduce((sum, it) => sum + (it.price || 0), 0);
  existingGold.innerHTML = totalGold > 0 ? `Total: <span>${totalGold.toLocaleString()}g</span>` : '';
}

function getItemImgSrc(name) {
  return `img/items/${itemSlug(name)}.webp`;
}

function getCrestImgSrc(name) {
  return `img/crests/${crestSlug(name)}.webp`;
}

// Tag-based category filters (use ITEM_TIPS tags)
const TAG_CATEGORIES = {
  'anti-heal': ['anti-heal'],
  'pen': ['pen','pen-physical','pen-magic','armor-shred'],
  'crit': ['crit'],
  'on-hit': ['on-hit'],
};

function renderBuildItemGrid() {
  const container = document.getElementById('buildItemGrid');
  const search = document.getElementById('buildItemSearch').value.toLowerCase().trim();
  const activeCat = document.querySelector('.build-cat-btn.active')?.dataset.cat || 'all';
  const activeTier = 3;
  const inBuild = new Set(buildState.items.filter(Boolean).map(i => i.name));
  const allItemsFilled = buildState.items.every(i => i !== null);

  // Show crests if: crest category selected, all 6 items filled, or search matches a crest
  const showCrestsOnly = activeCat === 'crest';
  const showCrestsToo = allItemsFilled || showCrestsOnly;

  let filtered = [];

  if (!showCrestsOnly) {
    filtered = buildItems.filter(item => {
      if (item.tier !== activeTier) return false;
      if (search && !itemMatchesSearch(item, search)) return false;
      if (activeCat !== 'all' && activeCat !== 'crest') {
        const catStats = ITEM_CATEGORIES[activeCat];
        const tagCats = TAG_CATEGORIES[activeCat];
        if (catStats) {
          if (!item.stats.some(s => catStats.includes(s.stat))) return false;
        } else if (tagCats) {
          const tips = typeof ITEM_TIPS !== 'undefined' ? ITEM_TIPS[item.name] : null;
          if (!tips || !(tips.tags || []).some(t => tagCats.includes(t))) return false;
        }
      }
      return true;
    });
  }

  // Add crests
  let crestFiltered = [];
  if (showCrestsToo || showCrestsOnly) {
    crestFiltered = buildCrests.filter(c => {
      if (search && !c.name.toLowerCase().includes(search)) {
        const tips = typeof CREST_TIPS !== 'undefined' ? CREST_TIPS[c.name] : null;
        if (!tips || !(tips.tags || []).some(t => t.includes(search))) return false;
      }
      return true;
    });
  }

  // Render items
  let html = '';
  if (showCrestsToo && !showCrestsOnly && crestFiltered.length) {
    html += '<div style="grid-column:1/-1;font-size:0.75rem;color:var(--text-2);font-weight:600;padding:0.3rem 0">ITEMS</div>';
  }
  html += filtered.map(item => {
    const imgSrc = getItemImgSrc(item.name);
    const selected = inBuild.has(item.name) ? ' in-build' : '';
    return `<div class="build-shop-item${selected}" data-item-build="${esc(item.name)}">
      <img src="${imgSrc}" alt="${esc(item.name)}" onerror="this.style.display='none'">
      <div class="build-shop-item-name" title="${esc(item.name)}">${esc(item.name)}</div>
      <div class="build-shop-item-price">${item.price ? item.price.toLocaleString() + 'g' : ''}</div>
      <button class="build-shop-item-add">+</button>
    </div>`;
  }).join('');

  // Crest section
  if (crestFiltered.length) {
    html += '<div style="grid-column:1/-1;font-size:0.75rem;color:var(--text-2);font-weight:600;padding:0.3rem 0;margin-top:0.5rem">CRESTS</div>';
    html += crestFiltered.map(crest => {
      const imgSrc = getCrestImgSrc(crest.name);
      const selected = buildState.crest?.name === crest.name ? ' in-build' : '';
      return `<div class="build-shop-item${selected}" data-item-build="${esc(crest.name)}">
        <img src="${imgSrc}" alt="${esc(crest.name)}" onerror="this.style.display='none'">
        <div class="build-shop-item-name" title="${esc(crest.name)}">${esc(crest.name)}</div>
        <button class="build-shop-item-add">+</button>
      </div>`;
    }).join('');
  }

  container.innerHTML = html || '<p class="text-muted" style="grid-column:1/-1;text-align:center">No items match</p>';

  // Click handlers
  container.onclick = (e) => {
    const el = e.target.closest('.build-shop-item');
    if (!el) return;
    const name = el.dataset.itemBuild;
    const addBtn = e.target.closest('.build-shop-item-add');

    if (addBtn) {
      addItemToBuild(name);
    } else {
      // Show tooltip — check if crest or item
      if (buildCrests.find(c => c.name === name)) {
        showItemModal(name); // TODO: showCrestModal when ready
      } else {
        showItemModal(name);
      }
    }
  };
}

function itemMatchesSearch(item, search) {
  if (item.name.toLowerCase().includes(search)) return true;
  const tips = typeof ITEM_TIPS !== 'undefined' ? ITEM_TIPS[item.name] : null;
  if (tips && (tips.tags || []).some(t => t.includes(search))) return true;
  if (tips && (tips.id || '').toLowerCase().includes(search)) return true;
  return false;
}

// Crest picker merged into main item grid

function addItemToBuild(name) {
  // Check if it's a crest
  const crest = buildCrests.find(c => c.name === name);
  if (crest) {
    buildState.crest = crest;
    renderBuildSlots();
    updateBuildStats();
    updateBuildFeedback();
    renderBuildItemGrid();
    return;
  }

  const item = buildItems.find(i => i.name === name);
  if (!item) return;

  // Always auto-fill next empty slot
  const idx = buildState.items.indexOf(null);
  if (idx === -1) return; // all full
  buildState.items[idx] = item;

  renderBuildSlots();
  updateBuildStats();
  updateBuildFeedback();
  renderBuildItemGrid();
  // Scroll back to slots briefly to show what filled
  document.getElementById('buildItemSlots').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearBuild() {
  buildState.items = [null, null, null, null, null, null];
  buildState.crest = null;
  renderBuildSlots();
  updateBuildStats();
  updateBuildFeedback();
  renderBuildItemGrid();
}

function updateBuildStats() {
  const grid = document.getElementById('buildStatsGrid');
  const allItems = [...buildState.items.filter(Boolean), buildState.crest].filter(Boolean);
  if (!allItems.length) {
    grid.innerHTML = '<p class="text-muted">Add items to see total stats</p>';
    return;
  }

  // Aggregate stats
  const totals = {};
  allItems.forEach(item => {
    (item.stats || []).forEach(s => {
      totals[s.stat] = (totals[s.stat] || 0) + s.value;
    });
  });

  // Display order
  const order = [
    'PHYSICAL_POWER','MAGICAL_POWER','ATTACK_SPEED','CRITICAL_CHANCE',
    'PHYSICAL_PENETRATION','MAGICAL_PENETRATION',
    'LIFESTEAL','MAGICAL_LIFESTEAL','OMNIVAMP',
    'HEALTH','MANA','PHYSICAL_ARMOR','MAGICAL_ARMOR',
    'ABILITY_HASTE','MOVEMENT_SPEED','TENACITY',
    'HEAL_AND_SHIELD_POWER','BASE_HEALTH_REGENERATION','BASE_MANA_REGENERATION','GOLD_PER_SECOND',
  ];

  let html = '';
  order.forEach(stat => {
    const val = totals[stat];
    if (!val) return;
    const pct = PERCENT_STATS.has(stat) ? '%' : '';
    const display = Number.isInteger(val) ? val : val.toFixed(1);
    html += `<div class="build-stat-item">
      <span class="build-stat-name">${STAT_NAMES[stat] || stat}</span>
      <span class="build-stat-value has-value">+${display}${pct}</span>
    </div>`;
  });

  grid.innerHTML = html || '<p class="text-muted">Add items to see total stats</p>';
}

function updateBuildFeedback() {
  const el = document.getElementById('buildFeedback');
  const items = buildState.items.filter(Boolean);
  const crest = buildState.crest;
  const allItems = [...items, crest].filter(Boolean);
  const hero = buildState.hero ? heroProfiles[buildState.hero] : null;

  if (!allItems.length) {
    el.innerHTML = '<p class="text-muted">Add items to get build feedback</p>';
    return;
  }

  const feedback = [];

  // ── ERRORS ──

  // 1. Multiple Tainted items
  const tainted = items.filter(i => i.name.startsWith('Tainted'));
  if (tainted.length > 1) {
    feedback.push({ type: 'error', text: `❌ You have ${tainted.length} Tainted items (${tainted.map(t => t.name).join(', ')}). The anti-heal effect (45% healing reduction) doesn't stack. Keep one, swap the rest. Tip: Serrated Blade (T2) gives anti-heal for less gold if you just need the passive.` });
  }

  // 2. Duplicate items
  const nameCounts = {};
  items.forEach(i => { nameCounts[i.name] = (nameCounts[i.name] || 0) + 1; });
  Object.entries(nameCounts).filter(([_, c]) => c > 1).forEach(([name, count]) => {
    feedback.push({ type: 'error', text: `❌ Duplicate: ${name} appears ${count} times. You can only equip one of each item.` });
  });

  // Aggregate stats for rule checks
  const totals = {};
  allItems.forEach(item => {
    (item.stats || []).forEach(s => { totals[s.stat] = (totals[s.stat] || 0) + s.value; });
  });

  // 3. Wrong damage type (hero-aware)
  if (hero) {
    const physPow = totals.PHYSICAL_POWER || 0;
    const magPow = totals.MAGICAL_POWER || 0;
    if (hero.damageType === 'physical' && magPow > 60 && physPow < 20) {
      feedback.push({ type: 'error', text: `❌ ${hero.name} deals physical damage, but you're building mostly Magical Power (${magPow}). This won't scale your abilities or autos.` });
    }
    if (hero.damageType === 'magical' && physPow > 60 && magPow < 20) {
      feedback.push({ type: 'error', text: `❌ ${hero.name} deals magical damage, but you're building mostly Physical Power (${physPow}). Consider magic items instead.` });
    }
  }

  // 4. Wrong vamp type (hero-aware)
  if (hero) {
    const ls = totals.LIFESTEAL || 0;
    const mls = totals.MAGICAL_LIFESTEAL || 0;
    const ov = totals.OMNIVAMP || 0;
    if (hero.damageType === 'magical' && ls > 5 && mls === 0 && ov === 0) {
      feedback.push({ type: 'error', text: `❌ Lifesteal only heals from basic attacks (physical). ${hero.name} is a mage — consider Magical Lifesteal or Omnivamp instead.` });
    }
    if (hero.damageType === 'physical' && mls > 5) {
      feedback.push({ type: 'error', text: `❌ Magical Lifesteal only heals from magical damage. ${hero.name} deals physical — Lifesteal or Omnivamp would be better.` });
    }
  }

  // ── WARNINGS ──

  // 5. Crit without AS
  const crit = totals.CRITICAL_CHANCE || 0;
  const as = totals.ATTACK_SPEED || 0;
  if (crit >= 20 && as < 10) {
    feedback.push({ type: 'warning', text: `⚠️ ${crit}% crit but only ${as}% attack speed. Crit procs on autos — more attack speed means more crits per second.` });
  }

  // 6. Physical pen on magic hero
  if (hero) {
    const physPen = totals.PHYSICAL_PENETRATION || 0;
    const magPen = totals.MAGICAL_PENETRATION || 0;
    if (hero.damageType === 'magical' && physPen > 0 && magPen === 0) {
      feedback.push({ type: 'warning', text: `⚠️ Physical Pen doesn't help ${hero.name}'s magical abilities. Build Magic Pen instead.` });
    }
    if (hero.damageType === 'physical' && magPen > 0 && physPen === 0) {
      feedback.push({ type: 'warning', text: `⚠️ Magic Pen on a physical hero. ${hero.name}'s damage scales with Physical Pen.` });
    }
  }

  // 7. Lifesteal without HP (glass cannon sustain)
  const ls = totals.LIFESTEAL || 0;
  const hp = totals.HEALTH || 0;
  if (ls >= 15 && hp === 0 && (totals.PHYSICAL_ARMOR || 0) === 0 && (totals.MAGICAL_ARMOR || 0) === 0) {
    feedback.push({ type: 'warning', text: `⚠️ High lifesteal (${ls}%) but no defensive stats. You'll heal a lot but die to burst before you can auto. Consider 1 HP item.` });
  }

  // 8. All offense on non-carry
  if (hero && items.length >= 4) {
    const isCarry = (hero.classes || []).some(c => /sharpshooter|assassin/i.test(c)) || hero.attackType === 'ranged';
    const defItems = items.filter(i => i.stats.some(s => ['PHYSICAL_ARMOR','MAGICAL_ARMOR','HEALTH'].includes(s.stat) && !['PHYSICAL_POWER','MAGICAL_POWER','CRITICAL_CHANCE'].some(off => i.stats.some(s2 => s2.stat === off))));
    if (!isCarry && defItems.length === 0 && items.length >= 5) {
      feedback.push({ type: 'warning', text: `⚠️ ${items.length} items and no pure defense. ${hero.name} isn't a carry — consider at least 1 defensive item to survive teamfights.` });
    }
  }

  // 9. Omnivamp on pure AA hero
  if (hero && (totals.OMNIVAMP || 0) > 5 && hero.attackType === 'ranged' && (hero.classes || []).some(c => /sharpshooter/i.test(c))) {
    const hasLifesteal = (totals.LIFESTEAL || 0) > 0;
    if (!hasLifesteal) {
      feedback.push({ type: 'warning', text: `⚠️ Omnivamp on a ranged carry. Lifesteal gives more healing per gold for basic attacks. Omnivamp is better on heroes who mix abilities and autos.` });
    }
  }

  // ── SYNERGIES ──

  // 10. On-hit + Attack Speed
  const onHitItems = items.filter(i => {
    const tips = typeof ITEM_TIPS !== 'undefined' ? ITEM_TIPS[i.name] : null;
    return tips && (tips.tags || []).includes('on-hit');
  });
  if (onHitItems.length > 0 && as >= 15) {
    feedback.push({ type: 'synergy', text: `✅ On-hit items (${onHitItems.map(i => i.name).join(', ')}) + ${as}% attack speed. More autos = more on-hit procs.` });
  }

  // 11. Pen + matching damage
  if ((totals.PHYSICAL_PENETRATION || 0) > 0 && (totals.PHYSICAL_POWER || 0) > 30) {
    feedback.push({ type: 'synergy', text: `✅ Physical Pen + Physical Power. Your damage cuts through enemy armor.` });
  }
  if ((totals.MAGICAL_PENETRATION || 0) > 0 && (totals.MAGICAL_POWER || 0) > 30) {
    feedback.push({ type: 'synergy', text: `✅ Magic Pen + Magical Power. Your abilities hit harder through magic resist.` });
  }

  // 12. Crit + lifesteal
  if (crit >= 20 && ls >= 7) {
    feedback.push({ type: 'synergy', text: `✅ Crit (${crit}%) + Lifesteal (${ls}%). Crits heal for more since lifesteal is based on damage dealt.` });
  }

  // 13. Anti-heal + burst
  if (tainted.length === 1) {
    const hasBurst = (totals.PHYSICAL_POWER || 0) >= 60 || (totals.MAGICAL_POWER || 0) >= 60;
    if (hasBurst) {
      feedback.push({ type: 'synergy', text: `✅ ${tainted[0].name} anti-heal + high damage. Apply the 45% healing reduction, then burst them down.` });
    }
  }

  // ── SUGGESTIONS ──

  // 14. Hero has healing trait but no anti-heal reminder
  if (items.length >= 3 && tainted.length === 0 && hero) {
    feedback.push({ type: 'suggestion', text: `💡 Need anti-heal? If the enemy has healers, any Tainted item applies 45% healing reduction. Serrated Blade (T2) is a cheap option.` });
  }

  // 16. No hero selected hint
  if (!hero && items.length >= 1) {
    feedback.push({ type: 'suggestion', text: `💡 Select a hero above for personalized feedback on your build.` });
  }

  // 15. Vamp education
  if ((totals.LIFESTEAL || 0) > 0 || (totals.OMNIVAMP || 0) > 0 || (totals.MAGICAL_LIFESTEAL || 0) > 0) {
    const vampTypes = [];
    if (totals.LIFESTEAL) vampTypes.push(`Lifesteal ${totals.LIFESTEAL}% (basic attacks only)`);
    if (totals.MAGICAL_LIFESTEAL) vampTypes.push(`Magical Lifesteal ${totals.MAGICAL_LIFESTEAL}% (magic damage only)`);
    if (totals.OMNIVAMP) vampTypes.push(`Omnivamp ${totals.OMNIVAMP}% (all damage types)`);
    feedback.push({ type: 'suggestion', text: `💡 Your sustain: ${vampTypes.join(' + ')}. ${totals.OMNIVAMP ? 'Omnivamp heals from abilities AND autos, great for heroes who use both.' : ''}` });
  }

  // Render
  if (feedback.length === 0 && items.length > 0) {
    el.innerHTML = '<p class="text-muted">Looking good so far! Add more items for detailed feedback.</p>';
    return;
  }
  el.innerHTML = feedback.map(f => `<div class="feedback-item feedback-${f.type}">${f.text}</div>`).join('');
}

function updateBuildHeroInfo() {
  const el = document.getElementById('buildHeroInfo');
  const hero = buildState.hero ? heroProfiles[buildState.hero] : null;
  if (!hero) { el.innerHTML = ''; return; }
  const traits = (hero.baseTraits || []).filter(t => !t.startsWith('_'));
  el.innerHTML = `<strong>${hero.name}</strong> — ${titleCase(hero.damageType)} ${titleCase(hero.attackType)} ${(hero.classes||[]).map(c => titleCase(c)).join('/')}
    ${traits.length ? '<br><span style="font-size:0.8rem">Traits: ' + traits.join(', ') + '</span>' : ''}`;
}

async function loadBuildPreset() {
  if (!buildState.hero) return;
  const slug = buildState.hero;
  const data = await loadHeroData(currentVersion, slug);
  if (!data) return;

  // Get the first role's data
  const roles = data.roles || {};
  const roleKey = Object.keys(roles)[0];
  if (!roleKey) return;
  const roleData = roles[roleKey];

  // Clear build
  buildState.items = [null, null, null, null, null, null];
  buildState.crest = null;

  // Try buildTabs first (named builds with core items)
  const buildTabs = roleData?.buildTabs || [];
  if (buildTabs.length) {
    const topBuild = buildTabs[0];
    const itemNames = topBuild.items || [];
    itemNames.slice(0, 6).forEach((name, i) => {
      const item = buildItems.find(it => it.name.toLowerCase() === name.toLowerCase());
      if (item) buildState.items[i] = item;
    });
  } else {
    // Fallback: use coreItems
    const core = roleData?.coreItems;
    if (core && core.items) {
      core.items.slice(0, 6).forEach((name, i) => {
        const item = buildItems.find(it => it.name.toLowerCase() === name.toLowerCase());
        if (item) buildState.items[i] = item;
      });
    }
  }

  // Fill remaining empty slots from roleData.items (non-crest, sorted by matches)
  const usedNames = new Set(buildState.items.filter(Boolean).map(i => i.name.toLowerCase()));
  const extraItems = (roleData?.items || [])
    .filter(i => i.slot !== 'crest' && !usedNames.has(i.name.toLowerCase()))
    .sort((a, b) => (b.matches || 0) - (a.matches || 0));
  for (const ei of extraItems) {
    const emptyIdx = buildState.items.indexOf(null);
    if (emptyIdx === -1) break;
    const item = buildItems.find(it => it.name.toLowerCase() === ei.name.toLowerCase());
    if (item) {
      buildState.items[emptyIdx] = item;
    }
  }

  // Load top crest from items list
  const crestItems = (roleData?.items || []).filter(i => i.slot === 'crest');
  if (crestItems.length) {
    const topCrest = crestItems.sort((a, b) => b.matches - a.matches)[0];
    const crest = buildCrests.find(c => c.name.toLowerCase() === topCrest.name.toLowerCase());
    if (crest) buildState.crest = crest;
  }

  renderBuildSlots();
  updateBuildStats();
  updateBuildFeedback();
  renderBuildItemGrid();
}

init();
