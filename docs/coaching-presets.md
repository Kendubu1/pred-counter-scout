# Coaching presets

`data/coaching/personas.json` selects shared author, critic and display instructions. Active `blunt-concise-v2` gives a verdict, why, one next-game action and distinct per-player comments. Evidence remains available separately. Adult humor and profanity are optional and concern play; factual checks still apply.

From `engine/`, run `npm run coach:preset -- classic-v0` to switch instructions and layout only. Run `npm run coach:preset -- blunt-detailed-v1 --restore-reviews` to also restore saved coaching. Return to concise instructions and layout with `npm run coach:preset -- blunt-concise-v2`. To restore its saved reviewed text as well, use `npm run coach:preset -- blunt-concise-v2 --restore-reviews`; returning to any preset without that flag leaves current review text unchanged.

Restoration replaces only coaching for matches in the selected snapshot; current players, facts, events and other metadata survive. All inputs are validated before writing. Missing snapshots or invalid match/player identities fail without writes. Disk failures during writing are not transactional; retain version control. Other matches remain untouched.

Snapshots live under `data/coaching/review-presets/` with `id`, `sourceCommit`, `note`, and `reviews` keyed by match ID. All three snapshots include the five newest matches from the October 19 release. Selecting a preset does not regenerate copy or fetch data. Both prompt generators and agent directives load the active profile; intentionally empty concise ranking/verdicts/microReads/whatShiftedIt/whatWorked are permitted.
