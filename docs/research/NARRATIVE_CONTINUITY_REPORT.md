# Narrative Continuity Research and Implementation Report

Date: 2026-07-13

Scope: stacked follow-up to the gameplay implementation branch

## Direction from the recording

The recording's central request is not simply “more colorful prose.” Clues should feel like pieces of a mystery unfolding across a real day at Tudor Mansion. Players should be able to reconstruct chronology, opportunity, and eventually motive rather than merely cross names from a list. The example of guests admiring costumes in a room at a particular hour captures the desired creative latitude: the model may make an established event feel specific and thematic, but it must not change the event's participants, location, time, duration, or certainty.

Two constraints were explicit:

- do not impose a rigid clue-type recipe on each round;
- do not trade away truthfulness, fairness, or playability for drama.

## Inputs examined

The investigation read the active engine, gameplay and engine explainers, the previous research reports, the recording transcript, and seven full debug artifacts (`ai-last-3.json` through `ai-last-9.json`). The artifacts are evidence of prior behavior, not current golden outputs: several predate the current scheduler fields and later artifacts contain experimental fields that are not in the active engine.

Across the seven artifacts, 32 of 84 selected reveals (38.1%) were `item_intact` or `room_undisturbed`. Later artifacts added more occasion texture, but usually applied it to isolated statements rather than sustaining a case-wide thread. One artifact also exposed a concrete truth-boundary defect: a bundled item-intact clue licensed the answer item's room for several decoys whose actual home rooms differed.

The current implementation branch was measured separately. Its 100-seed baseline selected static item/room accounting for 616 of 1,200 reveals (51.3%) and selected a complete setup-to-resolution thread in 37 of 100 cases. These measurements explain the “generic” feeling without proving that every inventory clue is bad: the static facts do substantial fair-play work, while the renderer previously saw no explicit case chronology or safe callback graph.

## Solo multimodel review

Four read-only Solo agents independently inspected the same repository and evidence packet:

- Claude Fable at high effort reviewed gameplay and narrative experience.
- Codex GPT-5.6 Sol at high reasoning reviewed the architecture and safety seam.
- Codex GPT-5.6 Terra at high reasoning audited the artifacts and measurements.
- Claude Opus at high effort adversarially reviewed truth and verifier failure modes.

They then challenged a common proposal. Three selected direct deterministic continuity context as the smallest justified experiment; Opus preferred a separate, fallback-safe planning call but accepted direct context as the lighter alternative. All rejected folding planning into the occasion dossier. The common guardrails were stronger than the implementation proposal:

- never expose raw world state, the answer, solver effects, decoy metadata, or unselected facts;
- never widen a clue's card-name license for a callback;
- never allow a private note or future clue to become a public callback source;
- keep capsules authoritative and do not claim the verifier proves semantic entailment;
- keep schedule diversity soft and subordinate to every existing hard gate.

The implementation follows those constraints and does not add a fourth provider call.

## Implemented slice

### Selected-case continuity

After scheduling, deterministic code derives a `ScheduledCaseContinuity` packet from exactly the 12 selected story seeds. It preserves reveal order, provides a separate chronological view, and records structural relationships to earlier public Butler clues: shared suspect, item, location, time, adjacent time, or selected thread.

The renderer receives that packet as a private writing map. It may weave a true group-presence event into an occasion-specific activity and may frame static checks through Ashe's household work with ordinary non-card props. It may echo an earlier public scene without importing that scene's card names or claim. Inspector notes can use earlier public context but can never become callback sources themselves.

The repair prompt receives only the current beat's validated earlier-public relationships. Existing per-line verification, two-attempt repair, and exact-capsule fallback remain unchanged.

### Mixed-home bundle truth fix

An answer-anchor `item_intact` fact can bundle the answer item with decoy items. The previous harvest path assigned the answer item's home room to the whole bundle even when the decoys lived elsewhere. The fixed path includes a location only when every bundled item's home is identical; mixed-home bundles now license and state no shared room.

### Soft portfolio preference

Best-of-K schedule ranking now mildly disfavors portfolios dominated by `item_intact` and `room_undisturbed`, and disfavors placing two such facts adjacently. This runs only after answer survival, checkpoints, final windows, and physical-finish scoring have accepted the schedule. It is not a quota, rejection gate, or round recipe.

### Evaluation support

The evaluation harness now reports the complete selected fact-kind portfolio, static-accounting share, and the number of validated continuity relationships available to the renderer.

## Verification and measured result

The final deterministic 500-seed sweep succeeded 500/500. All hard candidate windows and answer-survival checks remained intact. Static accounting moved to 3,053 of 6,000 reveals (50.9%). That is a modest change from the 51.3% current-branch baseline, so the portfolio preference should be considered a supporting measure rather than a solved diversity problem.

A fixed-seed real-gateway pass exercised all requested unified-billing models against identical deterministic inputs:

| Model | Result | End-to-end | Repairs | Unresolved |
| --- | ---: | ---: | ---: | ---: |
| `anthropic/claude-opus-4.8` | 1/1 | 28.3 s | 0 | 0 |
| `anthropic/claude-sonnet-5` | 1/1 | 28.2 s | 0 | 0 |
| `openai/gpt-5.6-luna` | 1/1 | 10.0 s | 0 | 0 |
| `openai/gpt-5.6-terra` | 1/1 | 28.9 s | 0 | 0 |
| `openai/gpt-5.6-sol` | 1/1 | 20.1 s | 0 | 0 |
| `openai/gpt-5.4` | 1/1 | 10.7 s | 0 | 0 |

Every model received 14 validated continuity relationships. The best outputs added safe small activities—serving coffee, checking display ribbons, straightening table things—and naturally connected repeated evening rounds and the Gold Pen setup/resolution. The weaker outputs still paraphrased several capsules almost directly. One seed is qualification evidence, not a model ranking or proof of broad prose quality.

## What this does not claim to solve

This slice improves the code/model relationship around facts already known to be true. It cannot manufacture motive, deception, false alibis, or detailed opportunity from facts that do not encode those semantics. Adding those notions as prompt color would create claims that the current verifier cannot prove.

The next justified experiment is therefore evidence-led:

1. Run a larger fixed-seed blinded comparison and score cross-clue connectedness, generic repeated phrasing, repairs/fallbacks, and unsupported relational claims.
2. If direct continuity is repeatedly ignored, test a separate answer-blind, card-free narrative-plan call behind a clean fallback and compare it against the unchanged renderer. Do not fold that plan into the dossier.
3. Add motive, claim, or alibi mechanics only alongside deterministic world semantics and capsule forms that can state and test them exactly.
4. Expand truthful, time-flexible fact supply before attempting a stronger reduction in inventory/search clues. Do not force an aesthetic quota through the scheduler.

This sequence preserves the useful conclusion of the recording: the model needs room to dramatize a mystery, but deterministic state must define the edges of that room.
