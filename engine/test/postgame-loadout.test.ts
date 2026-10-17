// What each player RAN in a reviewed game (augment, Eternal, minors, crest),
// decoded from a pred.gg public match-stream row by the same function the perk
// evidence counter uses, and written onto the films by npm run postgame:loadout.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadoutOf, type PerkInfo } from '../src/ingest/match-stream.js';

const ROOT = path.resolve(__dirname, '..', '..');

const perk = (id: string, displayName: string, slot: string): [string, PerkInfo] =>
  [`internal_${id}`, { id, displayName, slot, description: '', hero: null }];

describe('postgame loadout (match-stream decode)', () => {
  const perks = new Map<string, PerkInfo>([
    perk('140', 'Disc Of Demise', 'HERO_SPECIFIC_1'),
    perk('e1', 'Exarch', 'ETERNAL_1'),
    perk('m1', 'Revelation', 'BLESSING_MINOR_1'),
    perk('m2', 'Fervour', 'BLESSING_MINOR_2'),
  ]);
  const crests = new Map([[901, { name: 'Warlock Crest', slug: 'warlock-crest' }]]);

  it('decodes every slot from the stream row, crest from the inventory', () => {
    const unknown = new Set<string>();
    const lo = loadoutOf({
      heroPerkData: ['internal_140', 'internal_e1', 'internal_m1', 'internal_m2', 'Perk_Retired_Thing'].map((perkName) => ({ perkName })),
      inventoryData: [{ itemId: 5 }, { itemId: 901 }],
    }, perks, crests, unknown);
    expect(lo).toEqual({
      augment: { id: '140', name: 'Disc Of Demise' }, eternal: 'Exarch', minor1: 'Revelation', minor2: 'Fervour',
      crest: 'Warlock Crest', crestSlug: 'warlock-crest',
    });
    // An unknown perk name is reported, never guessed into a slot.
    expect([...unknown]).toEqual(['Perk_Retired_Thing']);
  });

  it('leaves slots empty when the row carries nothing', () => {
    expect(loadoutOf({}, perks, crests)).toEqual({ augment: null, eternal: null, minor1: null, minor2: null, crest: null, crestSlug: null });
  });

  it('films marked as found carry a loadout for every player the stream returned', () => {
    const dir = path.join(ROOT, 'data/postgame');
    const films = readdirSync(dir).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
      .filter((f) => f.loadoutSource?.found);
    for (const f of films) {
      const withLo = f.players.filter((p: any) => p.loadout);
      // The stream row is the whole lobby; a gap is recorded in loadoutSource.note.
      if (withLo.length < f.players.length) expect(f.loadoutSource.note, f.matchId).toMatch(/absent from the stream/);
      for (const p of withLo) {
        expect(Object.keys(p.loadout).sort(), `${f.matchId}/${p.heroSlug}`).toEqual(['augment', 'crest', 'crestSlug', 'eternal', 'minor1', 'minor2']);
      }
    }
  });
});
