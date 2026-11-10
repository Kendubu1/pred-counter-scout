// npm run itemtags (zero-API): the item tag sheet, data/aggregates/item-tags.json.
// Rules live in src/item-tags.ts; rerun after any catalog change (it is in `npm run refresh`).
//
//   npm run itemtags            write the artifact
//   npm run itemtags -- --list  print every item's tags (review the rules by eye)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWER_LABEL, DOES, ROLE_LANGUAGE, tagItems, type CatalogItem } from '../item-tags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const items = tagItems(read('data/catalog/items.json') as CatalogItem[]);
const meta = read('data/catalog/META.json');

if (process.argv.includes('--list')) {
  for (const [slug, r] of Object.entries(items)) {
    console.log(`${slug} [${r.kind}] gives: ${r.gives.map((g) => `${g.v}${g.pct ? '%' : ''} ${g.label}`).join(', ') || '-'}`);
    console.log(`   does: ${r.does.join(', ') || '-'} | answers: ${r.answers.join(', ') || '-'}`);
    for (const u of r.unique) console.log(`   · ${u}`);
  }
}
const rows = Object.values(items);
writeFileSync(path.join(ROOT, 'data/aggregates/item-tags.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), patch: meta.patch,
  source: 'data/catalog/items.json only (stats, aggression type and the game\'s effect text); rules in engine/src/item-tags.ts',
  note: 'Per completed item: gives = stat chips in one fixed order; does = how the passive/active works, from the fixed vocabulary in `does`; answers = the enemy problem it answers; unique = the item\'s own effect, condensed from the game text. roleLanguage[answer][role] phrases an answer for a lane.',
  does: DOES, answerLabel: ANSWER_LABEL, roleLanguage: ROLE_LANGUAGE, items,
}));
const none = Object.entries(items).filter(([, r]) => r.kind === 'item' && !r.does.length).map(([s]) => s);
console.log(`item-tags: ${rows.length} items (${rows.filter((r) => r.kind === 'item').length} build items, ${rows.filter((r) => r.kind === 'crest').length} crests); ${rows.filter((r) => r.answers.length).length} answer something; ${rows.filter((r) => r.unique.length).length} carry a statement`);
if (none.length) console.log(`  no mechanic tag (stats only): ${none.join(', ')}`);
