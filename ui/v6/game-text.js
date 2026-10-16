// Turn the game's rich text into readable text before HTML-escaping it.
// Stat icons are part of a formula, not decoration. Labels deliberately do not
// guess total/bonus stat basis when the source does not specify it.
globalThis.GameText = Object.freeze({
  hasEffectDescription(effect) {
    const text = this.plain(effect.menu_description || effect.game_description);
    // Unnamed runtime counters have no value outside a running match.
    return !!text && (!!effect.name || !/^(?:[^{}:]+:\s*\{[^}]+\}\s*)+$/.test(text));
  },
  plain(value) {
    const stats = {
      ADIconOrange: 'Physical Power', APIconBlue: 'Magical Power',
      HealthIconGreen: 'Health', ArmorOrange: 'Physical Armor', MRIcon: 'Magical Armor',
      ManaBlue: 'Mana', ASIconOrange: 'Attack Speed', AttackSpeedIcon: 'Attack Speed',
      AbilityHaste: 'Ability Haste', HasteIconWhite: 'Ability Haste',
      CritIconGold: 'Critical Chance', PhysPen: 'Physical Penetration', BonusDamage: 'Bonus Damage',
    };
    return String(value ?? '')
      .replace(/<img\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi,
        (_, id) => ` ${stats[id] || `[${id}]`}`)
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ').trim();
  },
});
