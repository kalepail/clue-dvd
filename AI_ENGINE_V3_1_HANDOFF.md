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

These are implemented and targeted-tested, but the selection changes have not
yet received the full 120-case release sweep or a new live prose sample:

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

## Exact pause point and validation status

Completed after the latest edits:

```text
npm run typecheck
npx vitest run src/services/ai-mystery-provider.test.ts \
  src/services/ai-mystery-engine.test.ts \
  src/services/clue-verifier.test.ts \
  src/routes/scenarios.test.ts
```

Result: typecheck clean; 35/35 targeted tests passed.

Completed before the final `ai-last-10` tuning:

- 120/120 deterministic release sweep passed.
- Full scheduler-heavy tests passed.
- Full project test suite and production build passed.
- Earlier live generations completed successfully.

Still required because the final suspect/context balancing edits came afterward:

```text
npm run eval:mysteries -- 120
npm test
npm run build
```

Then run at least 3–5 live generations and inspect both the rendered clues and
their debug JSONs. API usage is authorized; the owner refilled the account.

## Recommended continuation

1. Run the full deterministic sweep. Compare recipe rates, world attempts,
   fairness counts, narrative-floor rate, and statement rate with the prior
   passing baseline.
2. Add a population metric for “questioned movement symmetry”: when a slate
   contains a named departure/solo/fog/errand, measure how often a second
   different suspect receives a comparable moment. Keep this diagnostic, not
   a hard validity rule.
3. Add a scene-setting repetition metric over selected story seeds: exact
   context phrase count and set-dressing noun count. Verify the new balancer
   spreads props without stripping occasion identity.
4. Generate live cases across different occasion families. Do not judge only
   costume fêtes; test a fundraiser, rehearsal/performance, memorial, garden
   event, and one quieter social occasion.
5. Read each case as a player before opening debug data. Check whether one
   person's clue treatment is unique, whether the opening's occasion explains
   the day's activity, and whether recurring characters form a story rather
   than merely recurring nouns.
6. If output remains structurally repetitive, first expand deterministic fact
   and episode composition—not prompt length. The model should receive richer
   material, not a larger rule stack.

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

## Definition of the next successful checkpoint

The next checkpoint is not “all tests pass” alone. It is reached when a small
live batch demonstrates all of the following:

- clues clearly belong to the occasion introduced in the opening;
- several named suspects receive meaningful human moments without any one
  clue treatment correlating with guilt;
- at least one continuing scene or statement thread gives the day continuity;
- props and set dressing recur enough to unify the case but not so often that
  one noun dominates it;
- clue syntax and openings vary naturally across a game and across sessions;
- the answer is not apparent by clue 5, yet the final evidence feels coherent
  and earned when combined with the physical cards.
