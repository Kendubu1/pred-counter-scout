# Coaching presets

`data/coaching/personas.json` selects shared author, critic and display instructions. Active `blunt-concise-v2` gives a verdict, why, one next-game action and distinct per-player comments. Evidence remains available separately. Adult humor and profanity are optional and concern play; factual checks still apply.

From `engine/`, run `npm run coach:preset -- classic-v0` to switch instructions and layout only. Run `npm run coach:preset -- blunt-detailed-v1 --restore-reviews` to also restore saved coaching. Return to concise instructions and layout with `npm run coach:preset -- blunt-concise-v2`. To restore its saved reviewed text as well, use `npm run coach:preset -- blunt-concise-v2 --restore-reviews`; returning to any preset without that flag leaves current review text unchanged.

Restoration replaces only coaching for matches in the selected snapshot; current players, facts, events and other metadata survive. All inputs are validated before writing. Missing snapshots or invalid match/player identities fail without writes. Disk failures during writing are not transactional; retain version control. Other matches remain untouched.

Snapshots live under `data/coaching/review-presets/` with `id`, `sourceCommit`, `note`, and `reviews` keyed by match ID. All three snapshots include the five newest matches from the October 19 release. Selecting a preset does not regenerate copy or fetch data. Both prompt generators and agent directives load the active profile; intentionally empty concise ranking/verdicts/microReads/whatShiftedIt/whatWorked are permitted.

Active `blunt-actions-v3` renders optional Keep and Change actions instead of each player paragraph. Empty actions are omitted; no praise or criticism is forced. The first five matches have a saved v3 snapshot, and v2 remains available for rollback.

Active `blunt-paragraph-v4` restores one paragraph per player with the behavior to keep and change woven into the prose. The optional playerFormat distinguishes paragraphs from v3 action labels, so selecting/restoring an older preset also restores its presentation.


### Expanded evidence layout
Build analysis is grouped in per-player disclosures. Each opens with the build decision, followed by separate matchup, item, Eternal/minor, augment and crest sections. Desktop uses paired loadout cards; mobile stacks them. Totals and event timelines are separate disclosures. Existing review prose and legacy missing-field support are preserved.

2026-10-22: Bullet preset v8 keeps two short playerBullets per ally, with detailed builds separate. Older paragraph reviews still render. The latest previous review is preserved in the v7 snapshot. Every bullet requires independent grounding review.

2026-10-26: Active `blunt-flags-v9` leads every review with what decided the game. The headline names the cause, then 2-4 ranked one-line flags ("What lost it" / "What won it"), then one clean lesson line ("Next game"). The team paragraph and loss reflection are retired under this preset. Each flag cites an engine-computed candidate in `interrogation.gameFlags` (src/game-flags.ts: inhibitors with no finish, an objective bought with deaths, fights started down, a struggling player against their own norm, a kill lead with no gold lead, a closing kill streak, a standout) or "other"; the page shows the cited flags' evidence collapsed. Profanity is a spotlight: the contract allows at most three explicit words per review, none in the lesson. v8 reviews still render as before.
