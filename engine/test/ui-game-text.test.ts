import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const context: { GameText?: { plain: (s: string) => string } } = {};
runInNewContext(readFileSync(new URL('../../ui/v6/game-text.js', import.meta.url), 'utf8'), context);
const plain = context.GameText!.plain;

describe('readable game formulas', () => {
  it('preserves both stats in a mixed health/power payload', () => {
    expect(plain('100 <HealthText>(+5%</><img id="HealthIconGreen"></img>) <AbilityPowerText>(+70%</><img id="APIconBlue"></img>) damage.'))
      .toBe('100 (+5% Health) (+70% Magical Power) damage.');
  });
  it('keeps unknown icon identifiers visible instead of silently losing meaning', () => {
    expect(plain('(+10%<img id="FutureStat"></img>)')).toBe('(+10% [FutureStat])');
  });
  it('preserves trigger text and treats markup as text, never executable HTML', () => {
    expect(plain('<Condition>On being</Condition> <CC_Text>Immobilized</CC_Text><Condition>:</Condition>'))
      .toBe('On being Immobilized:');
    expect(plain('<br>Gain <EffectText>25%</EffectText><br/> mitigation.')).toBe('Gain 25% mitigation.');
  });
});
