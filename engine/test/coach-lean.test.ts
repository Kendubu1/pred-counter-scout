import { describe, it, expect } from 'vitest';
import { applyLeanCritique, hashLine, leanLines, validateLean, type LeanReview } from '../src/coach-lean.js';
import { buildAllowed } from '../src/copy-verify.js';

const film = {
  matchId: 'm1',
  players: [
    { pid: 'a', us: true, heroName: 'Kira', squadName: 'Goldi' },
    { pid: 'b', us: true, heroName: 'Steel', squadName: 'Rock' },
    { pid: 'x', us: false, heroName: 'Sparrow' },
  ],
  interrogation: { gameFlags: [{ id: 'draft' }, { id: 'threat' }] },
};
const review = (): LeanReview => ({
  version: 'lean-v10', authoredAt: '2026-11-08T00:00:00Z',
  headline: 'Two divers and no tank lost the draft before a fight started.',
  flags: [{ ref: 'draft', text: 'No tank against their frontline.' }, { ref: 'threat', text: 'Sparrow killed our carry six times.' }],
  focus: { action: 'Draft a real tank first and peel the carry when Sparrow walks up.' },
  playerBullets: { a: ['Six deaths to Sparrow.', 'Hold the dash for her ult.'], b: ['Opened every fight.', 'Peel more.'] },
  buildCall: { a: 'Add armor second next time against Sparrow.', b: 'Right build for the lane.' },
  review: { status: 'draft', round: 0, approved: [], dropped: [], rounds: [] },
});
const allowed = buildAllowed([6], ['six']);

describe('lean coach review', () => {
  it('accepts a valid review and catches contract breaks', () => {
    expect(validateLean(film, review())).toEqual([]);
    const r = review();
    r.playerBullets.a![0] = 'Kira died at 12m to Sparrow.';
    r.flags[1]!.ref = 'draft';
    const p = validateLean(film, r).join(' | ');
    expect(p).toMatch(/exact time/);
    expect(p).toMatch(/names "Kira"/);
    expect(p).toMatch(/same game flag twice/);
  });

  it('approves passed lines and only sends changed lines next round', () => {
    const r = review();
    const rec = applyLeanCritique(film, r, [{ key: 'bullet.b.1', issue: 'generic', rewrite: 'Hold the knock-back for whoever dives the carry.' }], allowed, 3);
    expect(rec).toMatchObject({ round: 1, judged: leanLines(review()).length, flagged: 1, rewritten: 1, dropped: 0 });
    expect(r.review.status).toBe('draft');
    const ok = new Set(r.review.approved);
    const pending = leanLines(r).filter((l) => !ok.has(hashLine(l.text)));
    expect(pending.map((l) => l.key)).toEqual(['bullet.b.1']);
    applyLeanCritique(film, r, [], allowed, 3);
    expect(r.review.status).toBe('published');
    expect(r.review.publishedDigest).toBeTruthy();
  });

  it('drops a line whose rewrite cites a number not in the facts, and a line flagged in the last round', () => {
    const r = review();
    applyLeanCritique(film, r, [{ key: 'flags.1', rewrite: 'Sparrow killed our carry 9 times.' }], allowed, 3);
    expect(r.flags.length).toBe(1);
    expect(r.review.dropped[0]).toMatchObject({ key: 'flags.1' });
    const s = review();
    s.review.round = 2;
    applyLeanCritique(film, s, [{ key: 'bullet.a.1', rewrite: 'A fine grounded rewrite.' }], allowed, 3);
    expect(s.playerBullets.a).toEqual(['Six deaths to Sparrow.']);
    expect(s.review.status).toBe('published');
  });

  it('blocks when the last round still flags the headline', () => {
    const r = review();
    r.review.round = 2;
    applyLeanCritique(film, r, [{ key: 'headline', rewrite: null }], allowed, 3);
    expect(r.review.status).toBe('blocked');
    expect(r.review.blockedReason).toMatch(/headline/);
  });
});
