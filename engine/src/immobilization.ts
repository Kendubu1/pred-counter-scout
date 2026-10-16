import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const reviewed = JSON.parse(readFileSync(new URL('../fixtures/immobilizing-abilities.json', import.meta.url), 'utf8')) as {
  abilities: Record<string, { sha256: string }>;
};

/** Deliberately partial: text keywords alone cannot establish an enemy CC event. */
export function reviewedImmobilization(hero: string, sourceKey: string, description: string): boolean {
  const entry = reviewed.abilities[`${hero}:${sourceKey}`];
  if (!entry) return false;
  if (createHash('sha256').update(description).digest('hex') !== entry.sha256) {
    throw new Error(`Immobilization source changed: ${hero}:${sourceKey}; review trigger eligibility before rebuilding.`);
  }
  return true;
}
