# Gameplay Improvement Plan

Date: 2026-07-13  
Status: research synthesis; no product-code changes  
Mission: make cases and rounds feel more organic without weakening deterministic truth, fair deduction, or the physical-card finish

> **Historical baseline:** This plan describes V3.0 before Lawson's Scene &
> Occasion V3.1 engine landed. Its evidence and product goals remain useful,
> but its engine-specific prescriptions are not current. See
> [`RECONCILIATION_REPORT.md`](RECONCILIATION_REPORT.md).

## Executive decision

Do not replace the V3 deduction engine. Its world-first generation, joint-cell scheduler, answer-blind clue renderer, and physical-card finish are the correct foundation. The engine generated 500/500 valid mysteries in the audit, all 69 tests passed, and TypeScript typechecking passed.

The generic feeling has two different causes that need two coordinated workstreams:

1. **Case shape is repetitive.** Fourteen occasion labels feed essentially one deterministic day model; static item accounting and room checks dominate the selected evidence; innocent subplots are one-shot explanations rather than arcs; and the scheduler accepts the first valid schedule instead of choosing among valid schedules for a distinct dramatic/evidentiary shape.
2. **Round play is too static.** The app has reduced the physical game to a mostly digital clue-turn loop. It only partially represents move-then-one-action, the Butler/Pantry ritual, item-card inspection, Inspector Challenges, post-turn events, door/passage state, and wrong-accusation payment/elimination.

There are also two truth-boundary defects to fix before adding more expressive content:

- A scheduled `Fact` is deterministic, but the rendered player-facing prose is not semantically proven to express that fact.
- The pre-generated closing receives optional private-note facts and the post-note candidate field, then describes them as evidence revealed during play even when nobody read those notes.

The recommended program is therefore:

> protect the truth boundary -> restore the authentic round economy -> select better-shaped valid schedules -> enrich deterministic world events -> add staged subplots and authentic post-turn events -> experiment with cadence only after playtests

## What the current game actually is

### Mystery generation

The active AI01 path is:

1. Select a deterministic answer and occasion label.
2. Simulate an answer-consistent day in `world-sim.ts`.
3. Harvest typed, answer-blind facts from that world.
4. Schedule ten public Butler reveals and two private Inspector notes over the full joint answer grid.
5. Build answer-blind story seeds and render the opening/clues/notes with AI.
6. Generate the answer-aware closing separately.
7. Verify and repair a narrow set of output properties, then apply the package to the game shell.

The strongest invariant is worth preserving: the prose model that writes clues never sees the answer. It can decorate only licensed truth from the scheduled fact.

### Current deduction shape

- The app format always schedules ten public clues and two private notes.
- The scheduler protects the answer after every reveal, enforces intermediate survivor windows, and leaves physical cards necessary at the end.
- Notes are mathematically included in the combined final field but are optional, private actions during play.
- Suggestions, clue reveals, notes, secret-passage rolls, and accusations are available, but there is no full pawn/location/action/event state machine.
- Exact 0–4 feedback after an accusation is authentic and should remain.

### Current physical/digital mismatch

The official physical loop is broadly: move to an adjacent location, take one action, resolve it, then process any DVD event after the turn. Relevant actions include Suggest, Summon Butler, Look at Item Card, Read Inspector Note, and Accuse. The current app approximates only part of that loop.

The app must remain a companion to the physical game. It should track public state, counts, and acknowledgements, but never ask for the identities of cards in a player's hand.

## Evidence baseline

### Reliability

- 500/500 deterministic mystery schedules succeeded.
- 402 succeeded on the first generated world; the worst required 16 worlds.
- Typechecking passed.
- 69/69 tests passed.
- Mean evaluator time was 25.1 ms per mystery in the existing sweep.

This is strong evidence against a solver rewrite. It is not evidence that the experience is already varied.

No `.dev.vars` was present locally, so this review did not generate a fresh live batch from the configured AI provider. Prose-boundary findings come from the active prompts, deterministic writer briefs, verifier/repair code, and original corpus. Before changing prompt style, capture a consent-safe batch of live outputs and score it separately from the deterministic case-shape metrics.

### Repetition measured across 500 cases

Across 6,000 scheduled reveals:

| Signal | Observed baseline | Interpretation |
| --- | ---: | --- |
| `item_intact` | 33.9% | One fact kind carries too much of the experience |
| `room_undisturbed` | 18.6% | Repeated static room accounting |
| Those two combined | 52.5% | More than half the evidence uses two static mechanisms |
| Item as primary axis | 38.4% | Evidence selection leans heavily on item facts |
| Item + time as converged pair | 477/500 (95.4%) | Cases have a strong macro-pattern even when prose differs |
| Time reduced to one candidate | 289/500 (57.8%) | Dealt time cards often lose their intended finishing value |
| Notes using room/item accounting | 69.9% | Private notes often feel like more of the same |

Thread instrumentation found that 202/500 cases selected no thread-linked reveal, 214 selected one, and no case selected two reveals from the same thread. The current “threads” therefore cannot create setup/escalation/payoff arcs in play.

### Knowledge-path mismatch

After only the ten public Butler facts, the mean remaining marginal fields were:

- 7.83 suspects
- 4.16 items
- 7.75 locations
- 3.72 times

The closing instead receives the narrower state after both optional private notes. This does not make the deduction unfair—the physical cards still finish it—but it makes the closing capable of narrating a path that the table never experienced.

### Original-corpus correction

The ten original cases each used eight Butler testimonies, while their Inspector-note counts ranged from one to six. The current ten-plus-two format is a product decision, not a requirement inherited from the DVD. It should not be changed until the physical-card/event budget and play duration have been tested.

## Finding ledger

### Verified defects or mismatches

#### V1. Rendered clue semantics are not proven

`clue-verifier.ts` checks non-empty text, known card-name mentions, loose sentence counts, and closing-name presence. It does not prove scope, quantity, polarity, chronology, or entailment. Repair can still end with unresolved clue warnings accepted. The actual rate of semantic drift has not been measured against a fresh live sample in this environment.

**Decision:** fix before increasing semantic complexity. Add a deterministic evidence capsule generated directly from `Fact`; keep Ashe's narration expressive and answer-blind; make the capsule the authoritative “write this down” statement. Do not add broad heuristic polarity/negation gates or routinely suppress narration before a live-output audit demonstrates their value; those checks can flatten voice and false-positive on ordinary negative evidence. This is justified by the repository's truth gap, not by an unverified claim that the original DVD used the same UI.

#### V2. The closing assumes an evidence path that may not happen

The closing input includes both note seeds and the combined post-note candidate field before runtime play. Notes are optional/private and a correct accusation can happen before all clues are revealed.

**Decision:** the default pre-generated closing must use only the public case record guaranteed by its chosen reveal assumption, plus the answer and a public-only candidate view. It may call unread material later Inspector-file confirmation, but must never claim it was witnessed.

#### V3. Occasion family is inert in deterministic simulation

`occasionFamily` is selected and stored but does not change gatherings, activities, item states, threads, room use, or evidence supply. It changes the dossier after scheduling, so it mostly reskins the same underlying day.

**Decision:** begin with answer-independent, occasion-gated catalog overlays that change deterministic activity/item/thread supply. Escalate to fuller world archetypes only if that smaller intervention is not player-perceptible. Do not let the prose model invent the structural difference.

#### V4. The round shell only partially implements the physical loop

The current shell lacks a full move/action/post-turn state machine, the Butler/Pantry draw ritual, item-card challenge economy, regular movement/position, and complete wrong-accusation payment/elimination. Host copy already tells the host to turn in cards, so the accusation penalty is **partially**, not wholly, implemented.

**Decision:** restore the smallest truthful state machine and count-level physical-card economy. Keep identity private. Inability to pay must be reported through a manual host control; the app must not infer it from a digitized hand.

#### V5. The closing verifier has a token-boundary bug

Plain substring checks can accept answer time `Night` from `Midnight` or “tonight.”

**Decision:** use canonical card-name/token matching and mutation tests.

#### V6. Several docs and comments describe a different system

The scheduler header advertises tighter final windows than the executable constants; `finalCandidates` is described as public even though it includes notes; planning docs claim simulated movement respects board adjacency when it does not; README/CLAUDE material still describes older V2 paths.

**Decision:** mark historical docs clearly and maintain one active-runtime map. Treat the narrated-day adjacency statement as a documentation error, not a proven gameplay bug.

### Strongly supported design concerns

#### C1. The fact supply is static

Items have only a small set of day-long states and observations. Rooms and inventory checks become the reliable workhorses. The AI cannot create a truthful loan, display, handoff, return, repair, attempted inspection, or custody transition if the world never modeled one.

**Decision:** add interval-aware item lifecycles to deterministic world state, then harvest new facts from them.

#### C2. The scheduler proves feasibility but not experience quality

It computes a soft score but returns the first valid schedule. It has no portfolio objective for mechanism mix, source mix, note role, thread stage, occasion relevance, or session-to-session convergence shape.

**Decision:** keep all hard invariants and choose the best of multiple individually valid schedules using a lexicographic experience score.

#### C3. Notes have positions, not jobs

Note 1 and Note 2 are selected from largely the same pool. They can repeat the same kind/axis and the scheduler validates combined knowledge rather than the important public/private views.

**Decision:** give N1 a cross-index/reframing role and N2 a discriminator/reconciliation role. Validate usefulness without making either note a private proof of the answer.

#### C4. Innocent threads do not unfold

Thread cause and explanation often appear in one brief; `threadId` is not used for scheduling. The result is color text, not a subplot the table remembers and revises.

**Decision:** begin with one featured two- or three-stage benign thread per experimental case. The payoff explains only its own anomaly and never exonerates a suspect unless a separate formal fact does so.

#### C5. Answer entities may have structural negative space

The answer room and suspect are excluded from several ordinary social/thread patterns to protect coherence. This is safe locally but may make the answer a unique absence across repeated play.

**Decision:** instrument structural leakage before changing constraints. If a held-out classifier or human study finds a learnable pattern, add answer-independent shadow opportunities and allow answer entities to participate in unrelated benign activity outside the theft interval.

#### C6. Live events are disconnected from the physical information state

Generated V3 cases currently emit no locked rooms or dramatic events. The existing secret-passage behavior is a random 20/60/20 good/neutral/bad outcome, whereas passages in the physical rules are movement edges that can be locked. Timed interruptions can happen mid-turn and may not occur until near or after a typical game length.

**Decision:** use a seeded post-turn `ScenarioEventPlan` whose events alter access and physical information, never historical case truth. These events are not “free” or neutral: they change Pantry supply, reachability, and private information, so every branch needs validation. Retain the random passage outcome only as an explicit house variant, off by default.

### Optional experiments, not established problems

- Variable Butler/note cadence.
- Hard quotas for fact families or convergence pairs.
- Multiple simultaneous subplot arcs.
- Full runtime/path-specific generated closing.
- Enforcing board adjacency on the narrated historical day.
- Making every occasion family a unique generator rather than sharing a smaller set of profiles.

These ideas need data; they are not part of the first implementation tranche.

### Rejected non-issues and unsafe remedies

- **Reject:** replacing the joint-cell solver to get variety.
- **Reject:** removing exact 0–4 accusation feedback; it is authentic.
- **Reject:** giving the clue renderer the answer so it can write “better.”
- **Reject:** making public clues solve all four categories; that would devalue physical hands.
- **Reject:** tracking the identities of private physical cards in the app.
- **Reject:** adding random prose “twists” that do not exist in deterministic world state.
- **Reject:** treating 10+2 as the official DVD cadence.
- **Reject:** forcing coarse narrated time-slot transitions to follow pawn adjacency without play evidence.
- **Reject:** making all subplot color eliminative or making an innocent payoff a blanket alibi.

## Target table experience

### A case should have an intelligible arc

Keep the current 10+2 format during the first redesign so changes are attributable:

| Evidence window | Player experience | Mechanical job |
| --- | --- | --- |
| C1–C2 | Orientation | Establish occasion activity, one anomaly, and several plausible routes |
| C3–C4 | Pattern | Show two different evidence mechanisms/sources; begin item or social movement |
| C5 | Hinge | Make an Inspector consultation tempting without requiring it |
| N1 | Cross-index | Connect or reframe earlier public facts; change what its reader watches |
| C6–C7 | Complication | Escalate the featured thread or item lifecycle; avoid repeating N1's mechanism |
| N2 | Discriminator | Reconcile or distinguish late joint theories; not merely a stronger N1 |
| C8–C9 | Payoff | Resolve the benign thread and deliver stronger access/custody boundaries |
| C10 | Closure | Leave a coherent but non-unique public field that physical cards can finish |

This is an experience objective layered after fairness, not a rigid screenplay. A valid unusual case may break the pattern.

### A turn should create a decision, not just reveal text

Target public rhythm:

```text
Start turn
  -> move on the physical board or use an unlocked passage
  -> choose exactly one action
       Suggest | Summon Butler | Look at Item Card | Read Note | Accuse
  -> resolve and acknowledge physical-card effects
  -> process at most one queued post-turn event
  -> next player
```

The physical board should remain authoritative for pawn position. The companion can show movement/lock reminders and ask for the selected action/location when that action needs it; it should not add a mandatory MoveConfirm tap that validates nothing.

The companion should know:

- public door/passage state, but not necessarily every pawn position;
- public counts of Pantry, board-placed item cards, and Evidence Room payments;
- which public clues/events have occurred;
- whether a player has unlocked access to a note, without publicizing its content;
- whether a player reports being unable to pay a wrong-accusation penalty.

It should not know:

- the identity of a player's private cards;
- which physical item card was drawn, looked at, or paid;
- the private deduction grid;
- whether a player believed or acted on a private note.

## Target architecture

### 1. Immutable truth boundary

```text
WorldState
  -> typed Fact
  -> EvidenceCapsule (deterministic, authoritative)
  -> answer-blind expressive narration
  -> existing hard validation + capsule-backed dispute resolution
```

An `EvidenceCapsule` should carry typed entities, scope, polarity, interval, quantity, and a deterministic write-down sentence. Narration remains colorful and is treated as performance; the capsule is always persisted as the canonical record. Keep the existing hard failure for unlicensed card names. Add narration suppression only for deterministic, low-false-positive violations proven useful by a live-output audit. The capsule never receives the answer except through the already licensed fact.

### 2. Public-path-independent closing

Default `ClosingInput` should contain:

- answer card names;
- only public evidence guaranteed by the selected closing contract;
- a public-only `EvidenceView` (modeled app evidence, not total player knowledge);
- an explicit post-solve case-file reconstruction mode that never implies every cited public clue was actually summoned before an early correct accusation;
- a statement that physical cards distinguish the remaining candidates.

Optional note facts can appear only as clearly labeled post-solve file confirmation. A future runtime-specific closing is acceptable only with a deterministic offline fallback and no disclosure of which player read what.

### 3. Occasion-conditioned world supply

Start by mapping the fourteen occasion labels into small catalog overlays for reusable structural families such as performance, competition, exhibition, committee/benefit, house weekend, and working household. An overlay can bias:

- gatherings and room activities;
- item display/use policies;
- benign thread causes;
- observation-source preferences;

Select the overlay independently of the answer and keep the existing world-retry safety gate. The renderer receives only the resulting licensed dossier. Graduate to a larger `WorldArchetype`/beat-grammar layer only if overlays fail to produce player-perceptible structural differences; building that abstraction first would recreate too much of the abandoned CaseBible surface.

### 4. Item lifecycles

Move from all-day item flags to interval events such as:

- displayed at a room;
- handled or demonstrated by a person/group;
- moved intact with a witness;
- loaned offsite and returned;
- secured for an interval;
- sent for repair and returned;
- last seen intact;
- discovered missing.

Each fact kind needs conservative formal semantics and boundary tests. A display at one time must not imply day-long custody. Handling need not imply exclusive possession. The answer item can have a normal pre-theft life as long as the theft window remains valid.

### 5. Staged benign threads

A featured thread should contain typed `setup`, optional `escalation`, and `payoff` stages with reveal bounds. In the first release every stage is mention-only: it changes no candidate cells. That still is not cognitively neutral, so its capsule must avoid implying guilt. The payoff explains only the anomaly. Answer-suspect eligibility and mechanically constraining payoffs are separate later experiments and must not be introduced together.

### 6. Best-of-K schedule selection

Generate several schedules that each satisfy all current hard guarantees. First measure candidate variance; then rank them lexicographically if the current supply offers meaningful choice:

1. truth and answer survival;
2. checkpoint/final fairness;
3. physical-card reachability;
4. public/private knowledge safety;
5. mechanism and source portfolio;
6. thread-stage order and spacing;
7. distinct note roles;
8. convergence-shape diversity;
9. existing repetition penalties.

Never trade a hard invariant for a better style score. Group near-synonymous fact kinds into player-perceived mechanism families before scoring. Include a schedule-shape signature so every case does not converge on the same maximally “balanced” portfolio. Any recent-case distance must be passed as explicit, versioned input; otherwise use a seed-derived target shape so replay remains deterministic. Start targets as soft diagnostics; harden only after broad feasibility and blind-play evidence.

### 7. Separate live event director

Events are seeded state transitions processed after a completed action. They live on a separate clock from the historical `WorldState`; `world.roomClosure` must not be wired directly into live locks. A `ScenarioEventPlan` may reuse answer-independent room-role metadata, but never an answer-shaped historical trajectory. Initial event types should be limited to:

- lock or unlock a door/passage;
- place the top Pantry item card face down at a location;
- enable an Inspector Challenge/private look at that location;
- public reminders or pacing events that do not spend hidden information.

Every branch must preserve physical-card conservation. If `initial non-solution item cards = pantry + board face-down + private hands + Evidence Room face-up`, the companion tracks only the counts and acknowledgements on the right side.

## Implementation roadmap

### Phase 0 — Contracts, documentation, and measurement

**Risk:** low  
**Player impact:** indirect but essential  
**Dependencies:** none

- Establish one active architecture/rules document and mark legacy paths historical.
- Correct scheduler window and public/combined-knowledge comments.
- Check in the fact-family, axis-pair, note-role, thread, occasion, and public-knowledge evaluator.
- Define privacy-safe playtest/telemetry fields and feature flags.
- Record 10+2 as the current product format.

**Exit gate:** one reproducible command emits the audit baseline; docs no longer contradict executable rules; no private-card identity is proposed or recorded.

### Phase 1 — Truthfulness backstops

**Risk:** medium  
**Player impact:** exact clues without flattening the voice  
**Dependencies:** EvidenceCapsule and EvidenceView schemas

- Generate and display the deterministic evidence capsule.
- Preserve the existing hard name check and add the canonical capsule; audit live outputs before adding any broader narration gate.
- Make the closing public-path-independent.
- Fix exact closing-card token matching.

**Exit gate:** capsule property tests cover polarity, group membership, interval, and quantity; closing tests catch `Night` substring collisions; capsules appear and persist for every reveal; clue render prompts remain answer-blind. A live-output audit measures narration drift before any suppression policy is authorized.

### Phase 2A — Minimal authentic round shell

**Risk:** medium  
**Player impact:** immediate table agency and physical-card relevance  
**Dependencies:** official action/penalty/event transition table and persistence migration

- Implement one action -> post-turn -> end-turn state, with a clear move-first reminder owned by the physical board rather than a mandatory app confirmation.
- Rename/describe reveal as Summon Butler and add the Pantry draw acknowledgement.
- Enforce Evidence Room restrictions and structured three-category suggestions.
- Correct item-card payment wording on host/phone; let the host acknowledge payment or manually report inability to pay; remove the player only from that host report.
- Convert passages to movement edges and put the random passage roll behind an off-by-default house-variant flag.
- Preserve note privacy and current first-read/revisit behavior.

**Exit gate:** state-transition and host/phone parity tests; a scripted game exercises summon/draw, suggestion, note, wrong accusation/payment/elimination, and passage/lock behavior; median added ritual overhead is acceptable in blind play.

### Phase 2B — Best-of-K over the proven fact supply

**Risk:** low-to-medium  
**Player impact:** faster variety gain before world-model expansion  
**Dependencies:** Phase 0 instrumentation

- Generate K individually valid schedules with deterministic seed derivation.
- Before building a large score, run a K=8 variance probe over the current supply; if valid schedules have near-identical descriptors, move effort upstream instead of optimizing an impotent selector.
- Actually use the existing soft score and add diagnostic portfolio/note/convergence terms.
- Select lexicographically; never accept an invalid schedule for diversity.
- Compare experience metrics and generation latency against first-valid.

**Exit gate:** at least the current schedule-yield baseline with zero answer-cell deaths; deterministic replay; no checkpoint regression; measurable reduction in dominant mechanism/note repetition without unacceptable generation cost. Numeric diversity thresholds remain experimental until playtests correlate them with perceived variety.

Phases 2A and 2B can proceed in parallel after Phase 0 because one changes table state and the other selects among already-valid mystery schedules.

### Phase 3 — One complete vertical slice of richer truth

**Risk:** medium-high  
**Player impact:** cases feel structurally different, not merely differently worded  
**Dependencies:** Phase 1 truth boundary and new fact metadata

- Ship one supply slice at a time behind separate flags: first the occasion catalog overlay, then one item-lifecycle fact with unchanged/conservative elimination semantics, then one mention-only featured thread with setup and payoff.
- Extend the scheduler score only for a slice after its semantics and selection rate are measured.
- Add decoy/shadow opportunities only if structural leakage is measured.

**Exit gate:** paired same-answer seeds show material topology differences when the occasion profile changes, while the same seed/profile remains byte-deterministic; all old invariants pass; blind reviewers can distinguish profile families from evidence structure without seeing occasion prose.

### Phase 4 — Note portfolios and case-arc shaping

**Risk:** medium  
**Player impact:** stronger within-case momentum and private-information play  
**Dependencies:** richer facts and best-of-K selection

- Add explicit N1 and N2 role metadata.
- Compute public, public+N1, public+N2, and combined marginal views in evaluation tooling; require a production `publicOnly` view for closing input, but do not make every partition a hard scheduler gate.
- Schedule featured-thread stages with spacing/payoff rules.
- Use soft arc and convergence descriptors, not a single ideal formula.
- Measure a loose public-only convergence floor so note-averse tables degrade gracefully; enforce it only if feasibility cost is negligible and playtests show the broader public field is actually a problem.

**Exit gate:** notes differ in job and mechanism; neither is useless or a private answer certificate; closings remain truthful across every note-access state; featured threads have no dangling or over-broad payoff.

### Phase 5 — Authentic event economy and cadence decision

**Risk:** high  
**Player impact:** strongest round-to-round dynamism if implemented cleanly  
**Dependencies:** Phase 2A state machine, transcribed event rules, and physical-card conservation model

- Choose a delivery model before implementation: fewer summons with Pantry cards reserved for placements; testimony without a draw after placements as an explicit house rule; or events that relocate rather than consume cards.
- Queue seeded events only at post-turn boundaries.
- Generate live lock/unlock transitions from the separate `ScenarioEventPlan` and apply them to movement.
- Place top Pantry cards face down and support Inspector Challenges/private looks.
- Validate every reachable Pantry/payment/event branch.
- Keep timed/random interruptions only as labeled variants until replaced.
- Compare the resulting reachable cadence with the current 10+2 format; event placement and cadence cannot be decided independently because both spend the same ten non-solution item cards.

**Exit gate:** zero mid-turn events; the conservation equation holds on every reachable branch; every scheduled testimony has a reachable delivery trigger; no item identity is entered; playtests show greater agency without longer or more confusing turns.

### Phase 6 — Rollout and cleanup

**Risk:** product/operational  
**Player impact:** unknown until tested  
**Dependencies:** stable event/delivery model

- Measure duration, early-solve timing, note uptake, physical-card relevance, and perceived repetition for the Phase 5 delivery choice.
- Roll out behind deterministic feature flags with rollback.
- Retire dormant legacy event/lock plumbing only after replacement is stable.

**Exit gate:** the selected delivery/event model wins blind tests without reducing generation reliability, truthfulness, or physical-card importance.

## Evaluation program

### Machine gates

- Answer cell survives every reveal in every case.
- Existing checkpoint/final windows remain enforced.
- 1,000-seed release sweep and 10,000-seed nightly sweep succeed at the agreed rate.
- Same seed/configuration is byte-deterministic.
- Every new fact kind has exhaustive or property-based truth tests at interval boundaries.
- Evidence capsules have exact entity/scope/polarity/quantity tests.
- Closing tests cover public reveal count 0–10 and all four N1/N2 access combinations.
- Best-of-K cannot let a soft objective outrank a hard invariant.
- Event/state tests cover movement, locks, Pantry conservation, note privacy, payment, and elimination.
- Host and phone provide equivalent public instructions.

### Experience diagnostics

Continue reporting, but do not immediately hard-code, these measures:

- share of each fact/mechanism family;
- share of room/item accounting in notes;
- adjacent repeated axes/mechanisms;
- converged-axis pair distribution;
- selected thread stages and spacing;
- note incremental joint-cell and marginal impact;
- occasion-profile/evidence-source distinguishability;
- public-only versus private/combined candidate fields;
- turn duration and event frequency.

Initial improvement direction is clear: reduce the present 52.5% two-mechanism share, 69.9% room/item-note share, and 95.4% item+time convergence dominance. Exact target bands should be set only after the new supply is feasible and human ratings show that the metrics track felt variety.

### Blind playtest questions

For each cohort, capture without recording private cards:

1. Did the case feel like events unfolded, or like a sequence of generic alibis?
2. Could players retell one distinctive subplot or item journey afterward?
3. Did Note 1 change a hypothesis and Note 2 distinguish or reconcile theories?
4. Did any narration appear to contradict its write-down capsule?
5. Did physical cards materially settle at least one final distinction?
6. Did events create meaningful choices or merely add delay?
7. When did a leading theory emerge, and was it stable too early?
8. Did the closing accurately describe evidence the table actually encountered?

Two blind tables per small cohort are a minimum signal, not statistical proof. Pair ratings with deterministic case fingerprints so failures can be reproduced.

## Risk controls

| Risk | Control |
| --- | --- |
| “Variety” breaks truth | New semantics originate in deterministic world state and typed facts only |
| Prose becomes sterile | Keep expressive narration; capsule is a separate authoritative channel |
| Diversity score is Goodharted | Hard invariants first, multiple soft descriptors, blind-play correlation before quotas |
| Occasion reveals the answer | Select the profile answer-independently; audit structural leakage before changing constraints |
| Events exhaust physical cards | Count-only conservation model and exhaustive branch tests |
| App digitizes hidden hands | Never collect card identities; use acknowledgements/counts only |
| Private notes become mandatory | Public-only floor, distinct useful roles, closing independent of access |
| Subplot implies false innocence | Payoff scope limited to its anomaly; formal alibis remain separate facts |
| Added ritual slows play | One-screen acknowledgements; measure turn overhead |
| Rewrite obscures attribution | Ship vertical slices behind separate deterministic flags |

## First implementation tickets to authorize

1. **Research hygiene:** check in the evaluator and correct active docs/comments.
2. **Closing honesty:** add a public-only EvidenceView and remove optional notes/post-note field from default closing input.
3. **Evidence capsule:** define schemas for the existing fact kinds and render the capsule beside narration.
4. **Round skeleton:** implement move/action/post-turn state with host/phone parity tests.
5. **Physical rituals:** Butler/Pantry acknowledgement and correct wrong-accusation item-card copy, payment acknowledgement, and manual host elimination control.
6. **Best-of-K experiment:** first measure score variance, then choose among valid schedules using current and new diagnostic soft scores if selection has leverage.
7. **First supply slice:** one occasion catalog profile, with item-lifecycle and two-stage-thread slices following independently only after its gate passes.

Do not start with a wholesale world rewrite or the full event economy. The first seven tickets make the system safer, more authentic, and measurably less repetitive while keeping every change reversible and attributable.

## Research basis

This synthesis is grounded in:

- the active repository and its current/historical explainers;
- the official Hasbro rules page and archived rulebook;
- a 500-mystery deterministic evaluation and an additional 500-case structural instrumentation pass;
- independent high-reasoning reviews by Claude Fable, GPT-5.6 Sol, Terra Opus, and Codex GPT-5.4 through Solo;
- adversarial cross-review among those reports;
- MDA, quality-diversity, game-generation orchestration, and experience-driven procedural-content research.

The external literature supports a limited conclusion: changing prose alone changes presentation, not the underlying player dynamics; diversity should be measured across explicit behavior dimensions while validity remains non-negotiable; generated facets need coordination; and logical validation does not replace human experience testing. It does not prove any particular numeric quota or mechanic is fun for this game.
