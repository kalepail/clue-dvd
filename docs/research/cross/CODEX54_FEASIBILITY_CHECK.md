# CODEX54 Feasibility Check

## Scope

This cross-review challenges the current brief, external evidence note, and four panel reports against the active code path, not against historical plans. Binding constraints come from the current brief's corrected rulebook section and the active V3 route (`src/routes/scenarios.ts:25-68`).

## Non-negotiables

- Preserve the deterministic truth boundary: world facts and schedule stay authoritative; no answer-aware clue writing (`docs/research/EXTERNAL_DESIGN_EVIDENCE.md:72-76`, `src/services/ai-mystery-engine.ts:163-265`).
- Preserve answer-blind clue rendering; only the closing may be answer-aware (`src/data/ai-v3-prompts.ts:91-138,176-205`).
- Preserve the physical-card boundary: track counts, availability, and acknowledgements, not hidden item identities (`docs/research/EXTERNAL_DESIGN_EVIDENCE.md:75-78`, `src/client/hooks/useGameStore.ts:615-685`).

## Cross-panel rulings

### 1. Preserve the V3 solver/world/fact/schedule spine

Ruling: `ACCEPT`  
Classification: `Rejected/non-issue` against replacement.  
Evidence: the active AI route already retries deterministic worlds until a valid schedule exists, then renders prose only after proof (`src/routes/scenarios.ts:47-57`, `src/services/ai-mystery-engine.ts:164-195`). The scheduler enforces checkpoints, final windows, and answer survival (`src/services/clue-scheduler.ts:74-101,389-430`).  
Why this survives challenge: none of the reports produced code evidence that the core proof layer is failing. The complaints are about portfolio shape, shell fidelity, and prose honesty.  
Counterargument: genericity may still emerge from deterministic over-constraint. That is plausible, but the right lever is supply and selection, not solver replacement.  
Risk if ignored: rewriting here destroys the one verified safety property while leaving the actual coupling problems untouched.  
Acceptance: keep current invariants green and require any change proposal to show a failing seed class or an invariant the current core cannot express.

### 2. Path-independent closing is an immediate fix, not a later polish item

Ruling: `ACCEPT`  
Classification: `Verified defect or mismatch`.  
Evidence: the closing is generated before play from all `storySeeds`, including both notes, plus `schedule.finalCandidates` (`src/services/ai-mystery-engine.ts:197-213,252-265`). The prompt labels that recap as evidence revealed during play (`src/data/ai-v3-prompts.ts:176-205`). The brief's verified public-only field is much broader (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:189-191`).  
Panel conflict resolved: SOL and FABLE place this first (`docs/research/panel/SOL_PRIMARY_PLAN.md:592-604`, `docs/research/panel/FABLE_PRIMARY_REVIEW.md:225-227`); my earlier panel report placed it too late (`docs/research/panel/CODEX54_IMPLEMENTATION_REVIEW.md:560-571`). That later ordering was wrong.  
Hidden dependency: none on shell or world work; only a public-only survivor computation and prompt contract are needed.  
Player impact: direct trust gain; stops post-game narration from citing unread private evidence.  
Acceptance: the default pre-generated closing must be identical and truthful under note-access states `none`, `N1`, `N2`, and `both`; prompt inputs must exclude note briefs from the public recap and must not present post-note candidates as public evidence.

### 3. Deterministic evidence capsule is directionally correct, but the first slice must stay small

Ruling: `MODIFY`  
Classification: `Supported design concern`.  
Evidence: `clue-verifier.ts` checks card names, emptiness, and loose sentence counts, but not entailment, polarity, chronology, scope, or invented non-card people (`src/services/clue-verifier.ts:4-18,77-118`). The external evidence note explicitly supports a separate canonical write-down channel (`docs/research/EXTERNAL_DESIGN_EVIDENCE.md:72-76`).  
Why modify: SOL's Phase 1 bundles new `Fact` metadata such as polarity, interval, quantity, and source (`docs/research/panel/SOL_PRIMARY_PLAN.md:596-599`). That is strategically sound but too wide for the first truth-boundary slice.  
Smallest safe slice: add a deterministic player-visible summary derived from existing fact semantics, without first redesigning the full fact schema. Fall back to that summary whenever narration fails current checks or new lightweight guards.  
Hidden dependency: host and phone UI surfaces for the write-down artifact; not a scheduler or world dependency.  
Counterargument: a capsule without richer metadata may be bland. True, but bland and truthful is acceptable at the canonical layer.  
Acceptance: every reveal displays one immutable deterministic summary; simulated adversarial narration mutations cannot change what the player is officially told to record.

### 4. Best-of-K scheduler selection is the right early optimization, but only as a selector over current valid schedules

Ruling: `MODIFY`  
Classification: `Supported design concern`.  
Evidence: `scheduleMystery` returns the first valid schedule and only reports `softScore` after selection (`src/services/clue-scheduler.ts:380-430,730-758`). The current greedy explicitly converges the most tractable axes first, which biases repeated item/time endings (`src/services/clue-scheduler.ts:563-583`).  
Why modify: FABLE and TERRA are right that this is cheap leverage (`docs/research/panel/FABLE_PRIMARY_REVIEW.md:229-231,268-269`, `docs/research/panel/TERRA_OPUS_ADVERSARIAL_REVIEW.md:591-596`), but FABLE's proposed public-only convergence floor and aggressive thresholds are overconfident before knowledge-view modeling and new fact supply exist (`docs/research/panel/FABLE_PRIMARY_REVIEW.md:230-231`).  
Hidden dependency: telemetry must land first so changes are judged against baseline variance, not intuition.  
Smallest safe slice: collect `K` already-valid schedules, score by only properties visible in today's fact set, and choose the best. Do not yet hard-enforce public-only windows, thread spacing, or occasion share.  
Player impact: moderate immediate replay gain without touching proof semantics.  
Acceptance: 500-seed sweep preserves current hard invariants and success rate, improves note-kind duplication and same-kind streak metrics, and stays within an agreed latency budget.

### 5. Public-only knowledge-view validation is necessary eventually, but not as an early hard checkpoint

Ruling: `MODIFY`  
Classification: `Supported design concern`.  
Evidence: the runtime keeps notes optional and private (`src/client/hooks/useGameStore.ts:512-556`), while the scheduler validates only the combined 12-reveal trajectory (`src/services/clue-scheduler.ts:389-430`).  
Why modify: SOL is correct that `KnowledgeView` partitions are a hidden dependency for later note-role and closing work (`docs/research/panel/SOL_PRIMARY_PLAN.md:633-635`). FABLE's "public-only convergence floor" is plausible, but turning it into an early hard checkpoint risks optimizing the wrong thing before those views exist (`docs/research/panel/FABLE_PRIMARY_REVIEW.md:230-231`).  
Smallest safe slice: compute public-only, public+N1, public+N2, and combined counts in evaluation tooling first.  
Risk: hardening too early can distort puzzle shape toward public over-solution and weaken the physical-card boundary.  
Acceptance: no production constraint until the evaluation pass shows the public-only floor that is desired and affordable.

### 6. Restore the minimal physical turn shell before adding event economy or world expansion

Ruling: `ACCEPT`  
Classification: `Verified defect or mismatch`.  
Evidence: the brief's binding rulebook section requires move then one action and post-turn events (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:199-208`). The current shell advances turns through clue reveal, keeps notes as progress-gated private reads, and uses a random secret-passage roll (`src/client/hooks/useGameStore.ts:527-556,757-783`).  
Panel conflict resolved: SOL's ordering is correct here (`docs/research/panel/SOL_PRIMARY_PLAN.md:606-617`); FABLE and my earlier report both under-prioritized this by putting scheduler or world work ahead of the shell (`docs/research/panel/FABLE_PRIMARY_REVIEW.md:229-239`, `docs/research/panel/CODEX54_IMPLEMENTATION_REVIEW.md:519-558`).  
Hidden dependency: a `TurnPhase` state machine and count-only pantry/payment acknowledgements.  
Player impact: highest table-play gain per unit complexity.  
Acceptance: canonical mode enforces Move -> one Action -> optional PostTurnEvent, secret passages are movement not loot rolls, and host/phone parity exists for accusation payment prompts and note access.

### 7. Wrong-accusation handling is a partial implementation gap, not a total omission and not an information leak

Ruling: `ACCEPT`  
Classification: `Verified defect or mismatch`.  
Evidence: the host already tells the player to turn in `N` cards face up (`src/client/components/AccusationPanel.tsx:254-265`), but it says generic cards; phone feedback only shows the correct count (`src/client/phone/PhonePlayerPage.tsx:1067-1085`); game state does not record payment or eliminate inability-to-pay cases (`src/client/hooks/useGameStore.ts:622-685`). The corrected brief is binding here (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:205-221`).  
Counterargument rejected: removing `0-4` feedback would be anti-authentic; the rulebook makes it canonical.  
Hidden dependency: a lightweight acknowledgement record, not hidden-hand tracking.  
Player impact: restores accusation cost and threat without digitizing physical hands.  
Acceptance: both UIs say `item card`; host can record `paid` or `unable to pay`; inability to pay removes the player; no item identity is entered into the app.

### 8. Random secret-passage outcomes should be rejected in canonical mode

Ruling: `ACCEPT`  
Classification: `Verified defect or mismatch`.  
Evidence: the rulebook correction says passages are movement edges, sometimes locked, and not random rewards/penalties (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:207-208`). Current canonical behavior rolls `Math.random()` and can force card reveals or peeks (`src/client/hooks/useGameStore.ts:757-783`).  
Hidden dependency: none beyond live movement state and lock state.  
Counterargument: the random roll may be fun. Fine, but only as a clearly labeled house-rule variant.  
Acceptance: canonical mode uses configured passage endpoints and lock state only; any random roll is variant-gated and seeded.

### 9. Event economy should be split into a cheap authenticity slice and a later pantry-validated slice

Ruling: `MODIFY`  
Classification: `Supported design concern`.  
Evidence: the world already simulates `roomClosure` (`src/services/world-sim.ts:340-352`) and the host already has room-unlock state (`src/client/hooks/useGameStore.ts:500-509`), but AI scenarios zero out `lockedRooms` and `dramaticEvents` (`src/routes/scenarios.ts:236-242`).  
Why modify: FABLE is right that post-turn events are the largest missing dynamism source (`docs/research/panel/FABLE_PRIMARY_REVIEW.md:245-247,271`). SOL is right that pantry-budgeted placements and cadence changes must wait for a physical budget model (`docs/research/panel/SOL_PRIMARY_PLAN.md:639-647,717-719`).  
Smallest safe slice: wire existing `roomClosure` into lock/unlock behavior after the turn state machine lands. Do not add facedown pantry placements or Inspector Challenge until pantry conservation exists.  
Risk: skipping the split invites a broad migration that couples movement, setup, item economy, and cadence all at once.  
Acceptance: first event slice contains only deterministic lock/unlock state sourced from scenario data and occurs post-turn; pantry-moving events ship only after a validated conservation model exists.

### 10. Occasion/world/item/thread expansion is necessary, but the first vertical slice must be singular

Ruling: `MODIFY`  
Classification: `Supported design concern`.  
Evidence: `occasionFamily` is selected and stored but unused by simulation (`src/services/ai-mystery-engine.ts:151-155,220-225`, `src/services/world-sim.ts:204-210,374-392`). Item states are narrow (`src/services/world-sim.ts:49-56,576-616`). Threads are single-shot and excluded from scheduler logic (`src/services/world-sim.ts:632-689`, `src/services/clue-scheduler.ts:461-758`).  
Why modify: all panels agree the supply layer is narrow, but bundled proposals are too large. FABLE combines occasion gating, new fact kinds, answer-room relaxation, and thread stage-facts in one phase (`docs/research/panel/FABLE_PRIMARY_REVIEW.md:237-243`). That is too much coupling for the first world rewrite.  
Smallest safe slice: pick one of these, not all four:
- one occasion-gated catalog overlay with no new fact semantics,
- or one staged benign thread,
- or one item-lifecycle reskin with unchanged elimination semantics.
Dependency: selector telemetry should already exist so new supply is actually chosen.  
Acceptance: one new slice ships with invariant sweeps and a measurable distribution change, without combining multiple new fact semantics in the same tranche.

### 11. Variable cadence and 8-testimony pilots should be deferred

Ruling: `REJECT` for the near-term sequence  
Classification: `Optional experiment`.  
Evidence: originals do have 8 testimonies and variable note counts, so `10+2` is not an authenticity requirement (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:140-142`, `src/services/clue-scheduler.ts:74-78`). But the active shell, prompts, checkpoints, and note timing all assume `10+2` (`src/services/clue-scheduler.ts:74-78`, `src/data/ai-v3-prompts.ts:91-138`, `src/client/hooks/useGameStore.ts:527-531`).  
Why reject now: cadence touches too many systems at once and is not a verified root cause of today's trust, shell, or replay problems. SOL's deferral is correct (`docs/research/panel/SOL_PRIMARY_PLAN.md:639-647`).  
Acceptance for reopening: only after shell state, pantry budget, event branches, and knowledge-view tooling are stable.

### 12. Board adjacency belongs to live turn movement, not necessarily narrated-day simulation

Ruling: `ACCEPT`  
Classification: `Verified defect or mismatch` for docs, `Rejected/non-issue` as mandatory world-sim change.  
Evidence: `AI_ENGINE_V3_PLAN.md` still claims adjacency-aware movement (`AI_ENGINE_V3_PLAN.md:72-73`), but `buildMovementGrid` does not read adjacency data (`src/services/world-sim.ts:399-430`). The brief explicitly warns against forcing adjacency into coarse time slots (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:170-171,231`).  
Player impact: correcting the doc prevents wasted engineering effort. Enforcing adjacency in live pawn movement still matters.  
Acceptance: remove the stale simulation claim; require adjacency or a legal passage only in the live turn shell.

## Stale docs and legacy code that will mislead reviewers

- `README.md` still mixes current V3 facts with stale claims such as no real-time sync, phone polling, story-first V2 pipeline, and expert difficulty as 8 clues (`README.md:97-104,170-177,572-607,704-706`). Reviewers must not use it as an implementation map.
- `AI_ENGINE_V3_PLAN.md` still claims adjacency/passages in world movement and lists unbuilt fact types such as `key_event` and `cross_category` as if they are live (`AI_ENGINE_V3_PLAN.md:72-73,92-99`).
- `src/services/clue-scheduler.ts` still has stale comments: header windows at `2-4/2-3/2-3/2-3` conflict with `FINAL_TARGET`, and `finalCandidates` is described as after all public evidence even though both notes are included (`src/services/clue-scheduler.ts:10-18,65-68,92-101`).
- The active route is `AI01` through `generateMysteryV2`; legacy scenario-generation paths and V2 docs are historical unless directly referenced by the current route (`src/routes/scenarios.ts:25-68`).

## Smallest safe vertical slices

### Slice A: trust-boundary cleanup

- Scope: path-independent closing, `verifyClosing` token-match fix, stale comment/doc cleanup, telemetry baseline.
- Why first: low coupling, direct trust fix, no gameplay regression surface.
- Falsifiable acceptance: all note-access permutations yield the same truthful default closing; comment/doc updates match executable behavior.

### Slice B: minimal physical turn shell

- Scope: `TurnPhase`, move-then-one-action framing, structured Suggestion, Summon ritual/reminder, correct accusation payment flow, canonical secret-passage movement.
- Why second: unlocks all later authentic event work and closes the largest rulebook mismatch.
- Falsifiable acceptance: integration tests prove action sequencing, item-card payment acknowledgement, and host/phone parity.

### Slice C: best-of-K selector on existing facts

- Scope: collect multiple valid schedules and choose by measured diversity terms available today.
- Why third: low-risk replay improvement after telemetry exists.
- Falsifiable acceptance: improved schedule-shape metrics with unchanged hard invariants and acceptable latency.

### Slice D: one world-supply experiment

- Scope: one occasion overlay or one staged thread or one item-lifecycle reskin.
- Why fourth: isolates the first supply-side risk.
- Falsifiable acceptance: measurable portfolio change with no schedule-yield collapse.

### Slice E: cheap authentic events

- Scope: room closures wired into lock/unlock state only.
- Why fifth: uses already-simulated truth without consuming pantry cards.
- Falsifiable acceptance: deterministic post-turn lock events with no pantry or cadence coupling.

### Slice F: pantry-moving event economy

- Scope: facedown placements, Look at Item Card, Inspector Challenge, and only then any cadence experiments.
- Why last: this is where hidden coupling to physical budget, setup, and fairness becomes real.
- Falsifiable acceptance: conservation checks over every reachable branch and no mid-turn events.

## Corrected sequence I would authorize

1. `Phase 0A` — path-independent closing, verifier/comment/doc cleanup, baseline telemetry.
2. `Phase 0B` — deterministic evidence capsule as the canonical write-down channel, using the smallest existing-fact implementation.
3. `Phase 1` — minimal physical turn state machine and accusation/suggestion/passage parity.
4. `Phase 2` — best-of-K selection over already-valid schedules; no early public-only hard checkpoint.
5. `Phase 3` — one world/fact vertical slice only, measured behind evaluation gates.
6. `Phase 4` — wire existing room closures into deterministic post-turn lock state.
7. `Phase 5` — pantry-moving events, Look/Challenge, and only then any variable-cadence pilot.
