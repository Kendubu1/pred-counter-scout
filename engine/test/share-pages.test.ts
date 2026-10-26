import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Section link previews (climb-when-to-swap.html etc.) must track their source sections.
describe('section share pages', () => {
  it('are up to date with ui/v6 climb.html and about.html', () => {
    const script = fileURLToPath(new URL('../scripts/share-pages.mjs', import.meta.url));
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
