import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectCoachingPreset } from '../coaching-presets.js';
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--restore-reviews') || args[0]!.startsWith('--')) {
  throw new Error('Usage: npm run coach:preset -- <preset-id> [--restore-reviews]');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const count = selectCoachingPreset(root, args[0]!, args.includes('--restore-reviews'));
console.log(`Selected ${args[0]}; restored ${count} coaching blocks. Existing facts preserved.`);
