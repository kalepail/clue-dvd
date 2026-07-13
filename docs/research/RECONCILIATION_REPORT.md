# V3.1 Branch Reconciliation

Date: 2026-07-13  
Status: integration record

## Why this reconciliation exists

Three stacked gameplay PRs and Lawson's Scene & Occasion V3.1 work diverged
from the same post-PR-#1 base (`71825f4`). Lawson's line was merged to `main`
first. The stacked line could therefore not be merged safely as ordinary
follow-up commits: it contains an older world model, scheduler, renderer,
closing, and evaluator that would replace rather than extend V3.1.

The reconciliation used the repository, `AI_ENGINE.md`,
`AI_ENGINE_SCENE_PLAN.md`, `AI_ENGINE_V3_1_HANDOFF.md`, the research packet,
the implementation reports preserved in commits `d1b874a` and `0310bd6`, and
independent high-effort Fable and GPT-5.6 Sol audits. Textual mergeability was
not treated as semantic compatibility.

## Topology at the start

```text
71825f4  shared base
├─ d944fd0  PR #2 research
│  └─ d1b874a  PR #3 implementation
│     └─ 0310bd6  PR #4 narrative continuity
└─ Lawson V3/V3.1 commits
   └─ 39c74fe  merge V3.1
      └─ 9f6a0a8  isolate cosmetic texture (then-current main)
```

Applying PR #3 directly to V3.1 produced 44 textual conflict regions across
nine engine/evaluator files. PR #4 added 26 regions across eight files.
Several client files auto-merged textually but still conflicted semantically.

## Decision ledger

### Retained

- The complete research packet from PR #2, as historical design evidence.
- Lawson's V3.1 occasion spines, featured cast, scene episodes, witness
  accounts, two-pass story scheduler, verifier/repair locks, and recent clue
  pattern feedback.
- The physical companion workflows from PR #3: pending Pantry draws,
  count/category-only suggestions, wrong-accusation payment or elimination,
  and physical secret-passage movement. Hidden card identities remain off the
  device.
- PR #3's Cloudflare binding/REST provider architecture and secret-safe build
  conventions, adapted to keep Claude Opus 4.8 as the default and direct
  Anthropic as a fallback.
- Exact closing-card matching and answer-polarity rejection from PR #3,
  combined with V3.1's stronger route/access/concealment checks.
- PR #4's mixed-home finding. V3.1 already contains the stronger conservative
  production fix, so only its regression coverage is relevant.

### Corrected during reconciliation

- V3.1 requested fabricated witness accounts at 27.5% while its release gate
  required 30–42%. The generator is centered at 35%, which also centers the
  intended thief-as-witness red-herring band.
- The evaluator inferred the witness speaker from a private variant label.
  It now measures the actual selected speaker, correctly counting truthful
  accounts spoken by the thief without confusing the thief with the person
  seen departing.

### Not ported

- PR #3's V3.0 world overlays, item lifecycle, staged thread model, best-of-K
  scheduler, prompts, fact harvesting, candidate windows, and evaluator.
  V3.1 has newer, more comprehensive equivalents and different invariants.
- PR #3's evidence capsules and deterministic closing. Their fact-kind map
  predates V3.1 scene evidence, witness/excuse facts, component semantics, and
  temporal-scope locks; its closing would also discard V3.1's motive,
  opportunity, lie, and provenance payoff.
- PR #4's generic shared-card/adjacent-time continuity graph. V3.1 callbacks
  use causal `episodeId`/`continuesClueNumber` relationships and exact earlier
  rendered text. A correlational graph could imply unsupported co-presence or
  chronology. A future continuity layer must be rebuilt against V3.1 and
  gated independently.
- PR #4's old scheduler nudge, static-accounting penalty, and mixed-home
  production patch. The scheduler work targets the superseded best-of-K path,
  the measured portfolio change was marginal, and main already has the
  stronger mixed-home behavior.

## Follow-up boundary

V3.1-native evidence capsules and broader whole-case continuity remain valid
experiments, not rejected goals. They require exhaustive current `FactKind`
coverage, `suspectTimePairs` and composite semantics, safe unnamed-time
references, answer-blindness tests, unchanged fairness metrics, and live
checks that prose never contradicts the deterministic record. They should be
reviewed in a separate PR rather than smuggled through branch cleanup.

## Release gates

The reconciled tree must pass:

- TypeScript typechecking and the complete unit suite.
- Production build with no `.dev.vars` in build or deploy artifacts.
- The 120-case deterministic V3.1 release sweep, including fairness,
  chronology, story-floor, and witness-distribution gates.
- Focused physical-shell tests covering refresh-safe pending actions and the
  absence of hidden identities.
- Direct-Anthropic and Cloudflare provider tests, including nested typography
  normalization and response-shape handling.
- Several live generations through the configured real gateway, without
  changing the production default model.

## Adversarial review outcomes

Fable implemented the physical-companion reconciliation in an isolated
worktree while GPT-5.6 Sol repeatedly reviewed the result against the V3.1
engine and the physical table rules. The review found and closed several
issues before integration:

- host actions now require a per-session token and the server rejects the
  wrong actor, eliminated players, and out-of-turn actions;
- D1, rather than a phone client, is authoritative for the current turn;
- phone actions have a persisted request ID, ordered event cursor, replay
  protection, and exact source-event correlation;
- Pantry draws and accusation penalties require the exact physical ritual
  and cannot be satisfied by a stale or unrelated event;
- passage results are stored durably, delivered exactly once, and survive a
  refresh or an ambiguous transport failure without permitting a second move;
- only a definite 4xx rejection clears a pending request; 5xx, network, and
  unparsable-success responses remain pending until reconciled; and
- suggestions contain exactly three distinct categories, while passage copy
  says truthfully that the move is free and the player's action remains.

Sol's final review approved the complete physical series without outstanding
blockers. Migrations `0009_phone_host_auth_action_results.sql` and
`0010_phone_turn_number.sql` add the host token, durable action result, and
server turn number. Sessions created before migration 0009 have no host token
and must be recreated; this is intentionally fail-closed.

## Deterministic release evidence

The final 120-mystery V3.1 sweep passed all 120 schedules in 3176.9 ms per
mystery. Statement-shaped games were 114/120 (95.0%) and linked or
multi-fragment games were 118/120 (98.3%). The dealt witness portfolio
contained 36 true-innocent, 5 fabricated-innocent, 15 true-thief-departure,
and 22 fabricated-thief accounts. Fabricated accounts were 27/78 (34.6%), the
thief spoke 23/78 (29.5%), and the thief was featured in 45 games versus 48
expected. Story-floor, spine-overlap, hour-audit, inventory, malformed-brief,
fairness, chronology, and leakage gates reported zero failures.

The exact closing verifier also passed focused name and polarity tests. It
rejects near matches, negated answers, and answer-shaped prose that does not
affirm all four exact solution cards.

## Live provider matrix

Live calls used the configured Cloudflare AI Gateway REST endpoint. There was
no direct Anthropic key, so the Opus result also exercised the gateway path.
These are smoke tests, not statistical gameplay qualification, and no truth
gate was relaxed to make a model pass.

| Model | Result | Notes |
| --- | --- | --- |
| `anthropic/claude-opus-4.8` | Pass | First attempt; 86.6 s; 3 repairs |
| `openai/gpt-5.6-sol` | Pass | First attempt; 70.4 s; 3 repairs |
| `openai/gpt-5.6-terra` | Pass | First attempt; 25.6 s; 0 repairs |
| `openai/gpt-5.4` | Pass | First attempt; 24.4 s; 4 repairs |
| `anthropic/claude-sonnet-5` | Provisional pass | Second attempt; 55.3 s; 1 repair |
| `openai/gpt-5.6-luna` | Provisional pass | Second attempt; 12.7 s; 1 repair |
| `xai/grok-4.3` | Pass | First attempt; 56.9 s; 2 repairs |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Pass | First attempt; 84.5 s; 1 repair |
| `@cf/openai/gpt-oss-120b` | Unqualified | Returned a tool call instead of the required dossier |
| `@cf/moonshotai/kimi-k2.6` | Unqualified | Exceeded the dossier repair cap |
| `@cf/qwen/qwen3-30b-a3b-fp8` | Unqualified | Exceeded the dossier repair cap |

Sonnet 5 and Luna remain provisional because each passed only one of two
attempts. The three failed Workers AI candidates remain explicitly
unqualified. Production continues to default to Opus 4.8, and a requested
model cannot silently fall through to another model.

## Final repository and browser validation

- `pnpm typecheck`: passed.
- `pnpm test`: 16 files and 184 tests passed (354.40 s, including the
  import-time 120-seed scheduler sweep).
- `pnpm build`: passed.
- `pnpm check:artifacts`: passed after proving `.dev.vars*` is ignored and
  absent from the final build artifacts.
- `git diff --check`: passed, and a tracked-file secret-pattern scan found no
  candidate gateway or provider credentials.
- Browser smoke test: created and persisted the developer case; completed the
  Butler/Pantry acknowledgment; enforced exactly three suggestion categories;
  used a passage as movement while retaining the turn across refresh; and
  resolved an incorrect accusation only after the exact four-card payment.
  The browser console contained no application errors.

`wrangler secret list` returned no deployed secrets and the account has no
existing `clue-dvd` Worker. Nothing was deployed and no secret was created as
part of reconciliation. Deployment therefore remains an explicit operator
step after configuring the intended Worker and secrets.

## Late Lawson branch reconciliation

After PR #5 merged, a direct `git ls-remote --heads` audit found one additional
uncached remote head: `codex/v3-1-live-polish` at `b311dac`. It had no pull
request and was neither an ancestor nor a patch-equivalent of `main`, so branch
cleanup paused and the commit received its own semantic reconciliation.

The patch correctly identified a real structural tell: harvesting the
culprit's forced answer-cell boundary as a named departure made that person
unusually likely to receive a rich suspicious scene. We retained suppression
of that private boundary, exact questioned/continuation metadata, multi-leaver
episode discovery, isolated cosmetic RNG, non-repeating activity/context
texture, character-only recurrence texture, and the bounded prose-quality
checks.

Independent high-effort Fable and GPT-5.6 Sol audits did not approve the patch
unchanged. Sol's all-suspect counterfactual found that suppressing the forced
boundary while also excluding the culprit from ordinary solo texture
overcorrected into a reverse tell: the raw culprit-to-innocent questioned-
attention ratio was 0.657. Restoring ordinary answer-blind culprit eligibility
at innocent hours and varying guest-circle topology between 4/4 and 5/3 raised
the ratio to 0.796, but Sol correctly rejected that residual 20% deficit. The
final rule withholds singled-out solo and departure provenance touching the
hidden answer hour for every suspect, not merely the culprit. Ordinary movement
at every innocent hour remains eligible, and the ratio reaches 1.067. A
permanent test now rebuilds 60 seeds for all ten possible culprits (600 worlds)
and requires 0.90–1.10. The selected-package comparison against field size
remains useful diagnostics, but is no longer described as proof of
answer-blindness.

The same review demonstrated four deterministic verifier bypasses: prose could
assign a departure to the wrong licensed actor, replace exact continuing
witnesses with “the others,” treat “without warning” as negating a departure,
or hide a later real departure behind an earlier negated one. The verifier now
checks every departure, recognizes only explicit actor-negation constructions,
and requires the exact questioned actor and exact named continuation. Focused
regressions cover every bypass.

The corrected 120-game selected sweep exposed one obsolete release gate: it
required all four private witness variants to appear in dealt clues. After the
forced theft boundary was removed, truthful culprit departures correctly
remain a small minority (17/298 raw accounts, or 5.7%); a much smaller dealt
sample cannot reliably contain every private subtype. Forcing that cell would
recreate the culprit spotlight. The raw world invariant still requires every variant
and the selected sweep still gates sample size, aggregate truth/fabrication,
culprit-speaker incidence, and duplicate speakers; its four-way histogram is
diagnostic rather than a flaky presence gate.

That sweep also exposed a deeper pre-existing bias: fabricated accounts chose
the culprit as speaker 85% of the time to manufacture a recurring red herring.
After movement attention was made symmetric, fresh-character selection
amplified that hidden quota to 30/50 dealt witness speakers (60%). The rule was
removed rather than retuned. Speaker choice now uses an isolated stream: 40%
of draws are uniform across the full cast and the remainder favor someone
physically capable of grounding an honest account. The voice is fixed before
truth status; an invalid observation converts to a fabrication without changing
the speaker. Variants are labeled only afterward, and the
600-world counterfactual gates culprit/innocent speaker parity overall and for
guest/staff strata. The ordinary 120-game sweep retains a gross 30% spotlight
ceiling because its roughly 50 selected witnesses are too few for a narrow
percentage band.

Fable separately reproduced a composition calibration introduced by the late
branch: with richer episodes and multi-leaver discovery, a 35% direct request
overshoots the 30–42% actual band. Fable's first 27.5% recommendation predated
the counterfactual speaker audit. Once answer-blind speaker exploration was
added, some selected voices necessarily lacked a safe observed departure and
became fabricated. The final direct request is therefore 5%; the 120-world
attempt-one audit yields 115/298 fabricated accounts (38.6%), all four private
variants, and no world without a retained step-away. Raw supply remains gated
at 30–42%. The selected sweep reports its smaller dealt histogram
but does not fail a release on a narrow percentage: the final 36-account sample
landed at 10/36 (27.8%), ordinary binomial variation around the validated raw
population. It still gates witness supply and gross culprit-speaker incidence.
This calibration does not restore the removed culprit quota.

The fixed matrix measures a 0.847 culprit/innocent witness-speaker ratio
overall, 0.861 among guests, and 0.787 among staff. Those results pass the
0.80–1.25 overall and 0.75–1.33 role-stratified gates without adding any
identity-specific culprit preference.

The first fully corrected 120-game sweep scheduled 119/120 worlds: seed 89
exhausted the 240-world budget only when the previous five structural pattern
signatures were present, while the identical world scheduled immediately with
empty history. Recent-pattern memory is cosmetic variety, not a validity rule.
After its normal attempts are exhausted, the scheduler now performs a bounded
history-free half-budget against the same facts, answer, fairness windows, and
story floor. The exact six-seed reproducer (84–89) returns 6/6, with seed 89
scheduling at world 24 rather than failing after 240.

The final scheduled acceptance run passes 120/120 mysteries. It produces
107/120 statement-shaped games, 119/120 multi-fragment episode games, a 34.2%
largest recipe share, 5.1 person-centered clues and 9.3 named suspects per
Butler package. Questioned conduct appears in 90 games and names at least two
suspects in 78; the culprit appears 20 times against a field-size baseline of
20.6. The dealt witness diagnostic is 10/36 fabricated and 3/36 culprit
speakers. Featured casting (49 vs 49.4 expected), suspicious threads (32 vs
33.4), and fog-at-answer-hour incidence (3/55) remain natural. Every story,
truth, answer-hour, overlap, inventory, and deterministic-language gate passes.

This late branch is therefore integrated as a corrected follow-up rather than
discarded or merged wholesale. Final owner-side validation passed: 17 files
and 193 tests, typecheck, production worker/client build with artifact
sanitization, the deterministic 120-game sweep, and a real
`anthropic/claude-opus-4.8` tournament generation through the Cloudflare
gateway (one world attempt, two bounded repairs, zero unresolved defects, ten
distinct clue openers). The source and stacked branches may be deleted only
after the follow-up PR merges to `main`.
