// Ground-check for AI-written copy (priorities item 8): a line may only
// cite numbers that exist in the data it was prompted with. Pure and
// shared by every copy pass (augment lines, Eternal lines), so the
// verifier itself is unit-testable without an API key.

/** Every numeric token in a piece of source text. */
export function numbersInText(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
}

/** Allowed renderings for a set of source numbers (int, 1-decimal, rounded, localized). */
export function buildAllowed(values: number[], texts: string[] = []): Set<string> {
  const out = new Set<string>();
  const add = (x: number) => {
    out.add(String(x));
    out.add(x.toFixed(1));
    out.add(String(Math.round(x)));
    out.add(x.toLocaleString('en-US'));
  };
  for (const v of values) add(v);
  for (const t of texts) for (const v of numbersInText(t)) add(v);
  add(100); add(5); // "per 100 games", "5v5"
  return out;
}

/** A line passes only if every number it cites is an allowed rendering. */
export function verifyLine(line: string, allowed: Set<string>): boolean {
  for (const m of line.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const tok = m[0].replace(/,/g, '');
    if (!allowed.has(tok) && !allowed.has(parseFloat(tok).toFixed(1)) && !allowed.has(String(parseFloat(tok)))) return false;
  }
  return true;
}

/** Winrates plus their pairwise gaps: the numbers comparison copy needs. */
export function winrateNumbers(cells: { n: number; w: number }[]): number[] {
  const wrs = cells.map((c) => (c.w / c.n) * 100);
  const out: number[] = [];
  for (const [i, c] of cells.entries()) out.push(c.n, wrs[i]!);
  for (const a of wrs) for (const b of wrs) if (a !== b) out.push(Math.abs(a - b));
  return out;
}
