# AI Mystery Engine V3.1 — Implementation Handoff

Last updated: 2026-07-13

This is the continuation guide for the large V3.1 Scene & Occasion engine
iteration. Read `AI_ENGINE.md` first for the durable architecture and
invariants, then `AI_ENGINE_SCENE_PLAN.md` for the original phase plan. This
file records what was actually implemented, why, the exact pause point, and
what should happen next.

## Product goal

The owner is recreating the spirit of the 2006 Clue DVD Game with endlessly
fresh mysteries. The clues must be truthful, fair, mechanically useful, and
read like excerpts from one lived day rather than ten database statements.

The current north star is not merely “themed wording.” The opening's occasion
must cause the characters' activities, excuses, props, gatherings, and clue
language. A costume fête should naturally produce scenes about fittings,
masks, costume judging, interrupted rehearsals, and plausible reasons to step
away. Players should have to reconstruct who had motive, opportunity, access,
and an unaccounted stretch without the prose quietly spotlighting the answer.

## Architecture now in place

The engine is deliberately split between deterministic truth and answer-blind
prose:

1. Application code chooses the answer, occasion family, and seeded occasion
   spine.
2. `world-sim.ts` simulates a complete day around that fixed answer: all ten
   suspects, movements, gatherings, episodes, items, side threads, statements,
   excuses, and discovery.
3. `fact-harvest.ts` derives only truthful public facts with exact joint-cell
   semantics and strict mention licenses.
4. `clue-scheduler.ts` first chooses an answer-blind story skeleton, then fills
   around it until the fair-play candidate windows are proven.
5. The dossier model invents answer-blind occasion vocabulary, not case truth.
6. The renderer model receives only the selected factual briefs and turns them
   into Ashe's ten testimonies plus two Inspector notes.
7. The closing is the only answer-aware prose call.
8. Deterministic verification repairs individual prose failures without
   regenerating the case or changing its evidence.

The runtime model is currently `claude-opus-4-8`.

## What this iteration implemented

### Occasion spine

- Added an authored catalog for every occasion family in
  `src/data/occasion-catalog.ts`.
- Each family owns beats over the ten printed times, group and solo activities,
  plausible excuses, anonymity devices, set dressing, and side-thread causes.
- The spine is instantiated before world simulation, so the opening and clues
  share actual world truth rather than receiving theme words after the fact.
- Beat phrases provide broad time language. The answer hour is never printed
  in clue prose; innocent hours also use broad phrases often enough that the
  style is not a tell.

### Lived scenes and recurring cast

- Added 3–5 uniformly selected featured suspects per world. Selection does not
  read the answer, and the thief is not guaranteed a seat.
- Added multi-hour scene episodes with participants, activity, room, prop,
  tension, and optional step-away.
- Added continuous-presence harvesting: people may remain together across
  several slots even while others join or leave.
- Added transition remarks and occasion-native excuses.
- Innocents receive suspicious errands and step-aways through the same
  machinery as the thief, preserving anti-meta-gaming symmetry.

### New fact material

- Formalized `scene_continuation`, `witness_account`, and `excuse_given`.
- Added fused `scene_evidence` facts that combine a lived social scene with one
  compatible room/item observation without changing either truth.
- Witness accounts can be truthful or fabricated and can come from innocents
  or the thief. Their public wrapper does not reveal which variant it is.
- Claims, motives, foggy recollections, and suspicious side threads remain
  mention-only; the physical cards and truthful facts are still the baseline.
- Lists remain short in Butler testimony, while Inspector notes carry more of
  the unavoidable bookkeeping.

### Story-first scheduling

- Replaced elimination-first economics with two passes.
- Pass 1 samples one of four answer-blind recipes: witness-centric,
  statement-driven, motive-and-fog, or continuing-scene.
- Pass 1 reserves a connected narrative skeleton before bookkeeping can consume
  all ten Butler slots.
- Pass 2 satisfies the exact candidate floors and final windows around that
  skeleton, preferring facts that do both story and deduction work.
- The scheduler repairs an infeasible skeleton by dropping its least-connected
  piece and retrying a cheap deterministic world; it never accepts an unfair
  mystery.
- There are no clue-kind position gates. Only actual episode causality requires
  a setup to precede its continuation or testimony.
- Structural pattern signatures are stored and recent signatures nudge later
  games toward a different recipe/shape.

### Rendering and verification

- The prompt now receives explicit scope locks, movement locks, outdoor/indoor
  setting locks, and episode callbacks derived from code.
- Clues should begin inside the remembered action rather than with canned
  greetings; opening-word diversity is verified and repaired.
- Repeated five-word runs, accidental card names, answer-hour wording, scope
  changes, and several common grammatical failures are caught deterministically.
- The event brief is explicitly described as evidence to dramatize, not a
  sentence template to paraphrase.
- Generation remains answer-blind through dossier and rendering.

### Diagnostics and evaluation

- `last-ai.json`/downloaded debug output now exposes setup, world, facts,
  schedule, story seeds, model stages, repairs, verification, and final package.
- Added `scripts/run-eval-mysteries.sh` and greatly expanded
  `scripts/eval-mysteries.ts`.
- The sweep audits fairness windows, recipe distribution, narrative floor,
  episode linkage, witness variants, featured-cast symmetry, side-thread
  symmetry, answer-hour leakage, malformed briefs, list width, and occasion
  overlap.
- Scenario metadata now carries engine version, mystery signature, and clue
  pattern signature; recent pattern signatures flow back into generation.

## Most recent owner test: `ai-last-10.json`

External artifact:

`/Users/lawson/Downloads/ai-last-10.json`

Owner assessment:

- Overall result was a massive improvement and clearly the right direction.
- Costume use in the clues was excellent.
- C3 and C7 were especially close to the desired lived-story style.
- Some clues still resembled older structural templates.
- C2 and C8 exposed literal `\\u2014` text.
- C3 was the only conspicuous named departure, so Green became a structural
  tell even though the clue itself was excellent.
- Too many references reused colored lanterns/lanterns.
- More suspect-centered moments, more original sentence movement, and more
  varied scene setting are still wanted.

### Changes made in response, immediately before this handoff

These were the first response edits; the resumed work then traced their
population behavior through the deterministic world rather than stopping at
the visible symptoms:

1. `ai-mystery-provider.ts` now recursively converts literal typography escape
   strings (`\\u2014`, smart quotes, ellipsis, nonbreaking space, and related
   characters) at the provider boundary before schema validation or storage.
   A provider regression test passes.
2. `clue-scheduler.ts` now softly rewards fresh named-character coverage.
3. If one conspicuous questioned movement enters a slate, the selector strongly
   prefers a similarly uncertain movement involving someone else. This is
   answer-blind, position-free, and not a hard clue quota. Its purpose is to
   prevent a lone departure from becoming an accidental finger-point.
4. Occasion observation/inspection contexts now cycle without replacement in
   fact harvest rather than being independently hashed with replacement.
5. The engine performs a final answer-blind cosmetic balancing pass over the
   contexts actually selected. It tracks props already present in the opening
   and episode texture, then favors an equally truthful unused context. This
   attacks lantern/ribbon repetition at its source rather than adding another
   prose-only warning.

### Root work completed after resumption

1. Added exact private `questionedSuspectIds` and
   `questionedMovementPairs` metadata. Selection and diagnostics now know who
   actually stepped away or drew attention instead of guessing from every name
   in a fused clue or scanning prose with regular expressions.
2. The population audit exposed the real culprit spotlight: the simulator's
   mandatory answer-cell placement was being harvested as a rich named
   departure/re-entry scene. The world and harvester now suppress both
   boundaries around that forced cell. Genuine, independently generated
   departures remain available with identical rules for every suspect.
3. Rebuilt ordinary social supply around two shuffled guest circles (5/3)
   rather than fragile 3/3/2 groups, and fixed episode derivation to inspect
   every leaver at a boundary instead of only the first. Real step-aways now
   exist without borrowing the theft placement.
4. Occasion activities cycle without replacement on a dedicated cosmetic RNG.
   The structural RNG consumes its historical draw, so richer wording and
   catalog reordering cannot silently change movements or schedule feasibility.
5. Removed repeated prop checks from `sceneTexture`; episode facts already
   carry occasion material, so recurring texture now contributes only a human
   tension or preoccupation. Dossier observation/inspection arrays are
   supplemented to six distinct, prop-spread contexts from the authored spine.
6. Added exact `continuousSuspectIds` to fused facts and composites. Renderer
   and repair prompts identify both the named person who leaves and the people
   who continue together. The verifier rejects a clue that dramatizes the
   departure but drops the alibi-bearing continuation.
7. Hardened prose at deterministic boundaries: all ten Butler first words must
   differ; complex clues top out at 54 words; up to four bounded line repairs
   handle repair chains. New checks catch dangling actions, impersonal
   recollections, malformed "Checking X lay..." syntax, articles before printed
   multiword times, ambiguous departure pronouns, and false departure matches
   inside explicit negatives.
8. Expanded `eval-mysteries.ts` with exact suspect-attention incidence,
   answer-blind expectation, clue-level person coverage, questioned-fact kind
   mix, set-dressing variety, and live context-use diagnostics. These metrics
   remain measurements, not clue quotas or reveal-position rules.
9. Completed live Opus acceptance across costume (`930000`), scholarly
   (`931013`), and engagement (`932026`) occasions. Final packages had no
   unresolved defects, did not question the answer disproportionately, used
   ten distinct openers, and produced the desired continuing-scene and
   anonymous-witness shapes. Saved diagnostics live in `tmp/ai-evals/`.

## Non-negotiable design decisions

Do not regress these while tuning prose:

- No answer-aware AI call may touch clue material. Only the closing knows the
  answer. A model that knows the answer creates narrative gravity even when it
  avoids literal leakage.
- `factKillsCell` remains the single definition of evidence semantics.
- No true fact may eliminate the answer.
- Keep exact checkpoint floors: at least four candidates in every category
  after reveal 6 and at least three after reveal 9.
- Keep final category windows; “more than one solution remains” is not enough.
- The answer hour is never named in public clue prose.
- Do not add arbitrary clue-kind caps, quotas, or order gates. Fix selection
  economics and source material instead.
- Do not guarantee the thief is featured, suspicious, motivated on screen, or
  part of any shortlist.
- Lies remain unpaired. The owner explicitly rejected a mandatory planted
  contradiction for every lie.
- Any wrapper capable of carrying a lie must regularly carry truthful material
  too.
- Keep all ten suspects in the world. A clue may focus on a smaller group, but
  that group is never presented as the only people in play.

## Exact checkpoint and validation status

All release validation was rerun after the final source changes:

```text
npm run eval:mysteries -- 120
npm test -- --run
npm run typecheck
npm run build
```

Results:

- Deterministic acceptance: 120/120 schedules; zero story-floor,
  spine-overlap, answer-hour, wide-inventory, or deterministic-language
  failures.
- Attention symmetry: 16 culprit appearances in questioned fields against an
  answer-blind expectation of 18.7; featured culprit 47 vs 47.7 expected;
  suspicious-side-thread culprit 31 vs 35.0 expected.
- Composition: 120/120 games with a multi-fragment episode, 113/120 with a
  statement-shaped fact, mean 5.2 person-centered Butler clues, and mean 8.6
  distinct suspects represented.
- Full suite: 11 files and 102 tests passed, including the scheduler/world
  sweep and new attention/continuation regressions.
- TypeScript typecheck and the production worker/client build passed.
- Live Opus generation was repeatedly inspected across three occasion
  families; all final packages completed with no unresolved verifier defects.

## Recommended next product iteration

The engineering checkpoint described here is complete once the final project
suite/build pass. Do not preemptively add another prompt layer. The next useful
input is several owner playthroughs without opening diagnostics first:

1. Play at least two of the new cases blind and record the clue number where a
   suspect, time, place, or item first feels dominant.
2. Generate another 3–5 occasions and compare the shape of their scenes, not
   merely vocabulary. The evaluator now makes exact suspect attention and prop
   use visible if a new pattern emerges.
3. If a real repeated structure remains, expand deterministic episode/fact
   composition or source catalogs first. Keep measurement answer-blind and
   position-free; do not add clue-kind quotas or early/late gates.
4. Revisit the pinned deception-system idea only as a separately measured
   extension. Keep one indistinguishable wrapper for true and false accounts,
   and never force a contradiction pair.
5. Board/card digitization remains the intended later phase after blind
   playthroughs accept story and deduction quality.

## Testing notes and useful commands

Deterministic sweep:

```bash
npm run eval:mysteries -- 120
```

Inspect one deterministic seed:

```bash
npm run eval:mysteries -- --inspect-seed 942027
```

Live prose samples:

```bash
npm run eval:mysteries -- 1 --ai-only --ai 1 --seed-base 900000
```

Important: the deterministic evaluator derives an answer from its seed. A UI
generation may use the same seed with a separately chosen answer, so replaying
only the numeric seed from `ai-last-10.json` does not necessarily recreate its
world. Reproduction must use all four IDs from `setup.answer` plus the occasion
family and recent signatures.

## Main files by responsibility

- `src/data/occasion-catalog.ts`: authored occasion truth and vocabulary.
- `src/services/world-sim.ts`: hidden day, movement, episodes, statements,
  side threads, items, and symmetry.
- `src/services/fact-harvest.ts`: truthful public material and semantics.
- `src/services/clue-scheduler.ts`: story recipe selection, fairness solving,
  ordering, and pattern signature.
- `src/data/ai-v3-prompts.ts`: compact dossier/render/repair/closing prompts.
- `src/services/clue-verifier.ts`: deterministic prose guardrails.
- `src/services/ai-mystery-engine.ts`: orchestration and story-seed assembly.
- `scripts/eval-mysteries.ts`: release metrics and live sampling harness.
- `AI_ENGINE.md`: durable architecture/invariants.
- `AI_ENGINE_SCENE_PLAN.md`: original phase requirements and rationale.

## Accepted checkpoint definition

This checkpoint was judged on behavior as well as green tests. Its live batch
demonstrated all of the following:

- clues clearly belong to the occasion introduced in the opening;
- several named suspects receive meaningful human moments without any one
  clue treatment correlating with guilt;
- at least one continuing scene or statement thread gives the day continuity;
- props and set dressing recur enough to unify the case but not so often that
  one noun dominates it;
- clue syntax and openings vary naturally across a game and across sessions;
- no deterministic clue treatment statistically points toward the answer, and
  final evidence remains coherent and intentionally dependent on the physical
  cards.

The owner's blind playthrough remains the final subjective test of whether the
new prose feels fun, but there is no known engineering blocker at this pause
point.
