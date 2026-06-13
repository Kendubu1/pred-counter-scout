// Standalone, self-contained preview of the "Playstyle by lane" panel for one
// hero — inlines the artifact's laneFlex so it opens in any browser with no
// server. Usage: npx tsx src/ingest/flex-preview.ts <slug> [<slug> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('usage: tsx flex-preview.ts <slug> [<slug>...]'); process.exit(1); }

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const sections = slugs.map((slug) => {
  const a = JSON.parse(readFileSync(path.join(ROOT, `data/artifacts/${slug}.json`), 'utf8'));
  const rows = (a.laneFlex ?? []).map((f: any) => `
    <div class="flexrow">
      <div class="flex-head">
        <span class="flex-lane">${esc(f.lane)}</span>
        <span class="flex-aug">${esc(f.augment.name)}</span>
        <span class="flex-ps">${esc(f.playstyle)}</span>
        <span class="flex-prov ${f.modeled ? 'modeled' : 'steered'}">${f.modeled ? '⚙ sim-modeled' : '🔬 evidence-steered'}</span>
        ${f.wr != null ? `<span class="flex-wr ${f.wr >= 50 ? 'up' : 'flat'}">${f.wr.toFixed(1)}%</span>` : ''}
      </div>
      <div class="flex-core">${f.core.map((i: any) => `<span class="pill">${esc(i.name)}</span>`).join('<span class="arrow">→</span>')}</div>
      <div class="flex-note">${esc(f.provenance)}</div>
    </div>`).join('');
  return `<section class="card"><h2>${esc(a.name)} — Playstyle by lane <span class="hint">what the sim can't see, exposed</span></h2>${rows}</section>`;
}).join('\n');

const html = `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playstyle by lane — preview</title><style>
:root{--bg-0:#0e1014;--bg-1:#161a21;--bg-2:#1d222b;--bg-3:#272d38;--border:#2b323d;--text-1:#e6e9ef;--text-2:#8a93a3;--green:#52c785;--blue:#7aa2ff;--gold:#e8b84b;--radius:14px}
*{box-sizing:border-box}body{margin:0;background:var(--bg-0);color:var(--text-1);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:1.2rem;max-width:760px;margin:auto}
h1{font-size:1.1rem}.card{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.1rem;margin-bottom:1rem}
h2{font-size:1rem;margin:.1rem 0 .7rem}.hint{font-weight:400;font-size:.74rem;color:var(--text-2)}
.flexrow{padding:.6rem 0;border-top:1px solid var(--border)}.flexrow:first-of-type{border-top:none}
.flex-head{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}
.flex-lane{font-weight:800;text-transform:capitalize;min-width:4.6rem}.flex-aug{font-size:.85rem}
.flex-ps{font-size:.66rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:.1rem .42rem;border-radius:999px;background:var(--bg-3)}
.flex-prov{font-size:.7rem;padding:.1rem .42rem;border-radius:999px}.flex-prov.modeled{background:rgba(80,200,120,.14);color:var(--green)}.flex-prov.steered{background:rgba(120,160,255,.14);color:var(--blue)}
.flex-wr{margin-left:auto;font-weight:800}.flex-wr.up{color:var(--green)}.flex-wr.flat{color:var(--text-1)}
.flex-core{display:flex;align-items:center;gap:.3rem;margin-top:.4rem;flex-wrap:wrap}
.pill{font-size:.72rem;background:var(--bg-2);border:1px solid var(--border);border-radius:7px;padding:.18rem .44rem}
.arrow{color:var(--text-2);font-size:.7rem}.flex-note{font-size:.74rem;color:var(--text-2);margin-top:.34rem}
</style></head><body>
<h1>Predecessor Scout — “Playstyle by lane” (augment-as-playstyle steer)</h1>
<p style="color:var(--text-2);font-size:.82rem">The lane selects the augment; the augment declares the playstyle. ⚙ = the sim models the augment's mechanic; 🔬 = steered by the declared playstyle + field evidence (magnitude not simulated). THEORY — sim on unverified constants.</p>
${sections}
</body></html>`;

const outPath = path.join(ROOT, `flex-preview.html`);
writeFileSync(outPath, html);
console.log('wrote', outPath);
