// Lean coach review (pure): the second, slimmer coach pipeline that runs beside the
// standard one (film.coaching, untouched). It writes film.coachLean.
//
//   shape     headline, 2-4 flags, the lesson, 2-3 bullets per ally, ONE buildCall per ally
//             (the 6-field buildReads is retired; the engine's film.buildNotes carries the
//             build facts and the page shows them)
//   critique  every line has a hash; a line the critic passed is approved and never sent
//             again, so round 2+ judges only rewritten lines (change 1)
//   cap       maxRounds (3): in the last round a flagged line is dropped, not rewritten
//             again; a flagged headline or lesson that cannot be dropped blocks the review
//             for a human (change 3)
// Spec: .claude/agents/pred-scout-coach-lean.md. CLI: src/ingest/coach-lean.ts.
import { createHash } from 'node:crypto';
import { verifyLine } from './copy-verify.js';
import { PROFANITY } from './coach-contract.js';

export const LEAN_VERSION = 'lean-v10';
export interface LeanFlag { ref: string; text: string }
export interface LeanRound { round: number; at: string; judged: number; flagged: number; rewritten: number; dropped: number }
export interface LeanReview {
  version: string; authoredAt: string;
  headline: string; flags: LeanFlag[]; focus: { action: string };
  playerBullets: Record<string, string[]>; buildCall: Record<string, string>;
  review: { status: 'draft' | 'published' | 'blocked'; round: number; approved: string[]; dropped: { key: string; text: string; issue: string }[]; rounds: LeanRound[]; publishedDigest?: string; blockedReason?: string };
}
export interface LeanLine { key: string; text: string; cap: number }
export interface CritiqueFlag { key: string; issue?: string; rewrite?: string | null }

const CAPS = { headline: 25, flag: 18, focus: 35, bullet: 30, build: 25 };
const TIME = /\b\d{1,2}:\d{2}\b|\b\d+(?:\.\d+)?\s*(?:m|min|mins|minutes)\b/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const hashLine = (text: string) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 16);
export const leanDigest = (r: LeanReview) => createHash('sha256').update(JSON.stringify({ ...r, review: undefined })).digest('hex');

export function leanLines(r: LeanReview): LeanLine[] {
  return [
    { key: 'headline', text: r.headline, cap: CAPS.headline },
    ...r.flags.map((f, i) => ({ key: `flags.${i}`, text: f.text, cap: CAPS.flag })),
    { key: 'focus', text: r.focus.action, cap: CAPS.focus },
    ...Object.entries(r.playerBullets).flatMap(([pid, bs]) => bs.map((text, i) => ({ key: `bullet.${pid}.${i}`, text, cap: CAPS.bullet }))),
    ...Object.entries(r.buildCall).map(([pid, text]) => ({ key: `build.${pid}`, text, cap: CAPS.build })),
  ];
}

interface FilmLite { matchId: string; players: { pid: string; us: boolean; heroName?: string; squadName?: string; name?: string }[]; interrogation?: { gameFlags?: { id: string }[] } }

/** Problems with one line on its own (length, em dash, exact time, card label, own name). */
export function lineProblems(f: FilmLite, key: string, text: string, cap: number): string[] {
  const out: string[] = [];
  if (typeof text !== 'string' || !text.trim()) return [`${key} is empty`];
  if (words(text) > cap) out.push(`${key} is ${words(text)} words (max ${cap})`);
  if (/[\r\n—]/.test(text)) out.push(`${key} has a line break or em dash`);
  if (TIME.test(text)) out.push(`${key} has an exact time`);
  if (/\b(?:keep|change|check|receipt)\s*:/i.test(text)) out.push(`${key} has a card label`);
  const pid = /^(?:bullet|build)\.([^.]+)/.exec(key)?.[1];
  const p = pid ? f.players.find((x) => x.pid === pid) : undefined;
  if (p) {
    const own = [p.heroName, p.squadName, p.name].filter((n): n is string => typeof n === 'string' && n.length >= 3 && !/private/i.test(n));
    const named = own.find((n) => text.toLowerCase().includes(n.toLowerCase()));
    if (named) out.push(`${key} names "${named}"; the row already shows the player and hero`);
  }
  if (key === 'focus' && PROFANITY.test(text)) out.push('the lesson stays clean');
  return out;
}

/** The whole-review contract. Returns problems; empty = valid. `authoring` asks the full shape
 *  (2-4 flags, 2-3 bullets); after the critic drops lines, 1+ flags and 1+ bullets are enough. */
export function validateLean(f: FilmLite, r: LeanReview, authoring = true): string[] {
  const out: string[] = [];
  const allies = f.players.filter((p) => p.us).map((p) => p.pid);
  const known = new Set((f.interrogation?.gameFlags ?? []).map((g) => g.id));
  const minFlags = authoring ? 2 : 1, minBullets = authoring ? 2 : 1;
  if (!Array.isArray(r.flags) || r.flags.length < minFlags || r.flags.length > 4) out.push(`flags needs ${minFlags}-4 entries`);
  for (const [i, fl] of (r.flags ?? []).entries()) if (!fl || (fl.ref !== 'other' && !known.has(fl.ref))) out.push(`flags.${i} must cite a gameFlags id or "other"`);
  const refs = (r.flags ?? []).map((fl) => fl.ref).filter((x) => x !== 'other');
  if (new Set(refs).size !== refs.length) out.push('flags cite the same game flag twice');
  for (const pid of allies) {
    const bs = r.playerBullets?.[pid];
    if (!Array.isArray(bs) || bs.length < minBullets || bs.length > 3) out.push(`${pid} needs ${minBullets}-3 bullets`);
    if (authoring && !r.buildCall?.[pid]) out.push(`${pid} needs a buildCall`);
  }
  for (const k of [...Object.keys(r.playerBullets ?? {}), ...Object.keys(r.buildCall ?? {})]) if (!allies.includes(k)) out.push(`unknown player ${k}`);
  if (!r.focus || typeof r.focus.action !== 'string') out.push('focus.action is missing');
  else for (const l of leanLines(r)) out.push(...lineProblems(f, l.key, l.text, l.cap));
  const swears = leanLines(r).map((l) => l.text).join(' ').match(new RegExp(PROFANITY.source, 'gi')) ?? [];
  if (swears.length > 3) out.push(`profanity is a spotlight: ${swears.length} explicit words, maximum 3`);
  return out;
}

function setLine(r: LeanReview, key: string, text: string | null): boolean {
  const [kind, a, b] = key.split('.');
  if (kind === 'headline') { if (text == null) return false; r.headline = text; return true; }
  if (kind === 'focus') { if (text == null) return false; r.focus.action = text; return true; }
  if (kind === 'flags') { const i = Number(a); if (!r.flags[i]) return false; if (text == null) { if (r.flags.length <= 1) return false; r.flags.splice(i, 1); } else r.flags[i]!.text = text; return true; }
  if (kind === 'bullet') { const bs = r.playerBullets[a!]; const i = Number(b); if (!bs?.[i]) return false; if (text == null) { if (bs.length <= 1) return false; bs.splice(i, 1); } else bs[i] = text; return true; }
  if (kind === 'build') { if (!(a! in r.buildCall)) return false; if (text == null) delete r.buildCall[a!]; else r.buildCall[a!] = text; return true; }
  return false;
}

/** Apply one critic round. Lines the critic passed are approved; flagged lines are rewritten
 *  (grounded rewrites only) or dropped; on the last round a flagged line is dropped. */
export function applyLeanCritique(f: FilmLite, r: LeanReview, flags: CritiqueFlag[], allowed: Set<string>, maxRounds: number, at = new Date().toISOString()): LeanRound {
  const approved = new Set(r.review.approved);
  const pending = leanLines(r).filter((l) => !approved.has(hashLine(l.text)));
  const round = r.review.round + 1, last = round >= maxRounds;
  const byKey = new Map(flags.filter((x) => pending.some((l) => l.key === x.key)).map((x) => [x.key, x]));
  let rewritten = 0, dropped = 0;
  for (const l of pending) if (!byKey.has(l.key)) approved.add(hashLine(l.text));
  // Drops shift indices: rewrite first, then drop from the highest index down.
  const drops: { l: LeanLine; issue: string }[] = [];
  for (const l of pending) {
    const fl = byKey.get(l.key);
    if (!fl) continue;
    const rw = fl.rewrite?.replace(/^\s*\d+\.\s*/, '').trim();
    if (!last && rw && verifyLine(rw, allowed) && !lineProblems(f, l.key, rw, l.cap).length) { setLine(r, l.key, rw); rewritten++; }
    else drops.push({ l, issue: fl.issue ?? (rw ? 'rewrite failed checks' : 'dropped by the critic') });
  }
  const idx = (k: string) => Number(k.split('.').pop());
  drops.sort((x, y) => idx(y.l.key) - idx(x.l.key));
  const stuck: string[] = [];
  for (const d of drops) {
    if (setLine(r, d.l.key, null)) { dropped++; r.review.dropped.push({ key: d.l.key, text: d.l.text, issue: d.issue }); }
    else stuck.push(d.l.key);
  }
  r.review.round = round;
  r.review.approved = [...approved];
  const rec: LeanRound = { round, at, judged: pending.length, flagged: byKey.size, rewritten, dropped };
  r.review.rounds.push(rec);
  const left = leanLines(r).filter((l) => !approved.has(hashLine(l.text)));
  const problems = validateLean(f, r, false);
  if (!left.length && !problems.length) { r.review.status = 'published'; r.review.publishedDigest = leanDigest(r); delete r.review.blockedReason; }
  else if (last) { r.review.status = 'blocked'; r.review.blockedReason = [...stuck.map((k) => `${k} still flagged`), ...problems].join('; ') || `${left.length} line(s) unjudged`; }
  else r.review.status = 'draft';
  return rec;
}
