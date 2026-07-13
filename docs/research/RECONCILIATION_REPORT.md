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

Final command results and merge identifiers are recorded in the pull request
that lands this reconciliation.
