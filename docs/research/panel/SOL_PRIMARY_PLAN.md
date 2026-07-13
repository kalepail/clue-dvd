# Primary Architecture and Implementation Plan

Date: 2026-07-13  
Scope: repository-only audit; no web research; no product-code changes  
Reviewer role: primary architecture and implementation planner

## Executive ruling

Keep the V3 world-first engine, joint-cell solver, answer-blind renderer, and physical-card finish. They are the right foundation. The 500-seed sweep reproduced the brief exactly: 500/500 schedules, 402 on the first world, 71 on the second, and a worst case of 16 worlds. All 69 tests and TypeScript typechecking pass. Replacing this core to gain variety would trade a proven safety property for an unproven aesthetic one.

The next evolution should instead repair three boundaries around that core:

1. Restore trustworthy player-facing fact and closing boundaries. The scheduled Fact is proven, but the final prose is not semantically verified, and the pre-generated closing treats optional private notes as revealed. Display a deterministic, write-down evidence capsule alongside answer-blind expressive narration, fall back to the capsule whenever narration cannot be proven safe enough, and make the closing independent of note-read history.
2. Restore the physical turn economy. The current shell omits move-then-one-action structure, the Butler item-card draw, Look at an Item Card and Inspector Challenge, authentic door/passage behavior, and complete wrong-accusation payment handling. Preserve the authentic 0–4 count. Track acknowledgements and counts, not item identities.
3. Add experience objectives after mathematical feasibility. Occasion-bound world archetypes, staged threads, dynamic item lifecycles, fact portfolios, distinct note roles, and converged-axis diversity should be optimized lexicographically after every existing truth and fairness invariant.

The five highest-value conclusions are:

- The largest verified narrative-safety gaps are semantic and path-dependent: clue-verifier.ts does not prove that rendered prose entails its scheduled fact, and the closing assumes optional notes were read.
- The largest gameplay gap is the lost physical event/action economy, not a shortage of prose randomness.
- Occasion families currently reskin prose without changing the deterministic day; the world catalogs and item states are too narrow for repeated play.
- The scheduler reliably controls deduction but does not optimize experiential shape; 477/500 cases converge item plus time, and 69.9% of notes are room checks or item accounting.
- Innocent threads are not arcs: in an additional 500-case pass, 202 cases scheduled no thread-linked reveal and zero cases scheduled two reveals from the same thread.

## Scope, active path, and audit method

The active AI route is unambiguous. The scenario route forces expert difficulty, builds a V3 shell, calls generateMysteryV2, applies the package, and then invokes the legacy scenario validator (src/routes/scenarios.ts:25-68). The shell fixes ten clues and emits no locked rooms or dramatic events (src/services/ai-mystery-setup.ts:40-79). The V3 engine retries deterministic worlds until a schedule exists, then builds answer-blind story seeds before any prose call (src/services/ai-mystery-engine.ts:141-224). DEV01 still uses the template campaign path, but it is not evidence of AI01 behavior (src/routes/scenarios.ts:46-60).

Historical documents were used only for failure lessons. AI_ENGINE.md explicitly marks V3 as active and older redesign documents as historical (AI_ENGINE.md:1-5), and CHANGELOG.md records the V3 replacement and the same status distinction (CHANGELOG.md:1-9). README.md and CLAUDE.md contain stale V2 or older architecture descriptions, so code controls where they disagree; examples include the obsolete Case Bible diagram (README.md:133-153) and removed route/service names (CLAUDE.md:71-99).

Read-only verification performed:

- npx -y tsx scripts/eval-mysteries.ts 500
- npm test -- --run: 8 files, 69 tests passed
- npm run typecheck: passed
- A 500-case fact, note, thread, axis, occasion, and movement instrumentation pass
- A 500-case private-note knowledge-view instrumentation pass
- Direct counts from src/data/original-mysteries.ts

The baseline distributions are recorded in docs/research/GAMEPLAY_RESEARCH_BRIEF.md:82-138. The additional pass found:

- 50/50 paired simulations were byte-identical after removing only occasionFamily, proving occasion has no deterministic effect.
- Soft penalty was nonzero in 499/500 cases, mean 7.16, but is only returned as telemetry.
- 480/500 schedules contained at least one adjacent repeated non-color primary axis, totaling 1,391 repeated-axis adjacencies.
- Thread-linked reveal counts per case were 0:202, 1:214, 2:80, 3:4; no case repeated the same thread ID.
- 305/1,000 notes overlapped no Butler fact by the scheduler's own related-clue definition.
- 116/500 cases assigned both notes the same primary axis.
- 32/1,000 notes killed zero additional live joint cells at their reveal position; 306/1,000 killed no marginal category candidate, although most of those still reduced joint cells.
- If private notes are excluded from a final shared-public view, 492/500 cases fall outside at least one current final maximum. This is not automatically a defect, but it proves the scheduler currently validates a combined-knowledge state, not all relevant private/public knowledge partitions.
- After the ten public Butler facts alone, the mean marginal fields were 7.83 suspects, 4.16 items, 7.75 locations, and 3.72 times. The pre-generated closing instead receives the much narrower post-N1/N2 field.
- 73.6% of consecutive non-null simulated room transitions were not board-adjacent or a secret passage. That verifies the documentation mismatch but does not establish a narrated-day gameplay defect because time slots are coarse.

## Finding register

Each finding has one required classification, confidence, counterargument, risk, dependency, player impact, and falsifiable acceptance criterion.

### F1. The deterministic fairness core is healthy

Classification: Rejected/non-issue — reject replacement of the scheduler as a remedy for genericity.  
Confidence: Very high.

Evidence: The scheduler applies facts over 12,100 joint cells, asserts the answer cell after every reveal, checks both checkpoints, and returns only schedules inside the final windows (src/services/clue-scheduler.ts:362-430). The hard windows and two-axis convergence requirement are explicit (src/services/clue-scheduler.ts:74-101). The seed-sweep tests cover checkpoints, final windows, answer-mention timing, and note positions (src/services/clue-scheduler.test.ts:35-98). The reproduced 500-case success and final distributions match docs/research/GAMEPLAY_RESEARCH_BRIEF.md:82-100 exactly.

Counterargument: Reliable schedules may still feel repetitive. That is true, but it indicts the objective function and source facts, not joint-cell propagation.

Risk if ignored: A rewrite could reintroduce contradiction, early convergence, answer leakage, or generation failure.

Dependency: None.

Expected player impact: Preserving this core maintains fair, non-obvious cases while other layers improve.

Falsifiable acceptance: Every future engine version must pass at least 1,000 deterministic seeds with zero answer-cell deaths, all checkpoint/final invariants, and no lower scheduling success than the V3 baseline. A proposal that cannot do so is rejected.

### F2. Player-facing prose is not semantically proven

Classification: Verified defect or mismatch.  
Confidence: Very high.

Evidence: Story seeds contain a neutral brief and allowed names, and the prompt asks the renderer to retain exact scope (src/data/ai-v3-prompts.ts:20-29, 91-136). The verifier checks non-empty text, licensed real card-name mentions, and sentence-count warnings only (src/services/clue-verifier.ts:65-100). It does not require every licensed participant, test polarity, chronology, quantities, or entailment. It also cannot catch an invented non-card person because its scanner only recognizes the 42 real card names (src/services/clue-verifier.ts:30-63). The comment's claim that invented people are caught by prompt plus audit warnings has no implementing audit in this file (src/services/clue-verifier.ts:4-16). After two repair rounds, unresolved opening/clue/note problems are logged and accepted; only a broken closing hard-fails (src/services/ai-mystery-engine.ts:307-379). The legacy scenario validator then sees AI clues with elimination metadata removed and checks only card IDs, clue counts, and non-empty clue text (src/routes/scenarios.ts:220-253; src/services/campaign-validator.ts:73-113, 199-232).

Counterargument: Strong prompts and licensed names make semantic drift uncommon. They reduce frequency, but cannot prove truth. A sentence can use every allowed name while reversing before/after, changing all to some, or inventing a witness.

Risk if fixed badly: An answer-aware semantic judge would restore telegraphing. Rigid prose templates would restore mechanical writing.

Dependency: A deterministic EvidenceCapsule schema per FactKind and a UI that can display it independently of narration.

Expected player impact: Players get an exact write-down fact even when Ashe's narration is colorful, preventing disputes and incorrect deduction without flattening voice.

Falsifiable acceptance: Mutation tests must reverse polarity, drop one group member, swap before/after, change an item or room, and invent a person. Every mutation must either fail deterministic validation or leave the immutable evidence capsule as the only displayed authoritative statement. Across 100 adversarial mocked render outputs, zero unsupported claims may appear in the capsule and no failed narration may be shown without a visible capsule fallback.

### F3. Occasion families do not alter deterministic truth

Classification: Verified defect or mismatch.  
Confidence: Very high.

Evidence: occasionFamily is selected from fourteen values (src/services/ai-mystery-engine.ts:57-72, 141-155), passed into simulateWorld, stored, and returned, but no branch in simulateWorld uses it to choose gatherings, movement, threads, items, closures, or discovery (src/services/world-sim.ts:204-213, 267-392). It reaches the answer-blind dossier only after the schedule exists (src/services/ai-mystery-engine.ts:163-224). The paired instrumentation found 50/50 worlds identical after removing the stored occasion string.

Counterargument: Prose reskinning still produces some novelty. It does, but the evidence topology and underlying day remain unchanged.

Risk if fixed badly: Occasion-specific rules could make some answer cells impossible or give the renderer structural hints about the answer.

Dependency: Data-driven WorldArchetype definitions, independent archetype selection, and feasibility tests across all answer categories/times.

Expected player impact: A recital, tournament, exhibition, and committee meeting produce different schedules of activity and evidence rather than different nouns over the same day.

Falsifiable acceptance: For a fixed answer and seed, changing archetype must alter at least two of beat topology, item lifecycle, thread grammar, room-role use, or evidence-source portfolio in at least 90% of 200 paired cases. Repeating the same archetype/seed/answer must remain byte-deterministic. All existing fairness tests must still pass.

### F4. The world is answer-consistent but also answer-shaped

Classification: Supported design concern.  
Confidence: High.

Evidence: The answer time cannot host a gathering (src/services/world-sim.ts:267-303); the answer location is excluded from normal social rooms and innocent-thread rooms (src/services/world-sim.ts:399-410, 649-650); the thief is forced alone there at the answer time (src/services/world-sim.ts:452-462); the answer item is forced to use the answer location as home and receives a constructed last-seen anchor (src/services/world-sim.ts:576-615); room closure and undisturbed-room facts exclude the answer location (src/services/world-sim.ts:340-351; src/services/fact-harvest.ts:490-511). The renderer is answer-blind, but selected observable facts can still have an answer-shaped absence or late-only signature.

Counterargument: These conditions are necessary to embed a coherent theft. Some local conditions are necessary; globally reserving the answer entities across unrelated activity is not.

Risk if changed badly: Allowing contradictory witnesses or a secured answer item would kill the answer. Making every entity symmetrical could also create incoherent fiction.

Dependency: Constraint-based shadow opportunities and a structural-leakage metric.

Expected player impact: Suspicion feels distributed because several suspects, items, rooms, and times have comparable gaps, rather than the answer being the unique absence in a regular pattern.

Falsifiable acceptance: Before reveal seven, a classifier using only fact kinds, mention positions, omission counts, source types, and thread participation must predict each answer category no better than a preregistered chance-plus-5-percentage-point ceiling on held-out seeds. Every answer cell must still survive. Each case must contain at least two non-answer shadow opportunities matching the answer's key structural exemptions.

### F5. The fact portfolio is dominated by static accounting

Classification: Supported design concern.  
Confidence: Very high.

Evidence: Item intact plus room undisturbed account for 52.5% of 6,000 scheduled reveals, and item is the primary axis for 38.4% (docs/research/GAMEPLAY_RESEARCH_BRIEF.md:102-126). Items expose only home location, displayedForOccasion, all-day offsite, and intact sightings (src/services/world-sim.ts:49-56); non-answer states are otherwise static and home assignment is fixed for the day (src/services/world-sim.ts:566-629). Staff-round bundles deliberately act as the workhorse facts (src/services/fact-harvest.ts:531-592).

Counterargument: Accounting facts are authentic and mathematically effective. They should remain, but not occupy half the experience.

Risk if changed badly: A more active item lifecycle can create false location implications or consume physical item cards incoherently.

Dependency: Interval-aware ItemLifecycleEvent semantics and physical pantry budgeting.

Expected player impact: Players hear about display, handling, loan, movement, storage, damage, attempted inspection, disappearance, and discovery rather than repeated inventories.

Falsifiable acceptance: In a 500-case pilot, no one mechanism family exceeds 35% of reveals, each case uses at least four mechanism families, and scheduler success remains at least 99%. Every new lifecycle fact must pass exhaustive answer-cell and interval-boundary property tests.

### F6. Innocent threads are facts, not staged arcs

Classification: Supported design concern.  
Confidence: Very high.

Evidence: Threads have one cause and optional suspect/item/location/time fields, not stages (src/services/world-sim.ts:70-78, 632-689). Harvested thread briefs commonly reveal suspicious behavior and its innocent cause in the same sentence (src/services/fact-harvest.ts:629-658). The scheduler has no thread-stage or spacing rule; threadId is not used anywhere in clue-scheduler.ts. Additional instrumentation found zero cases with two selected reveals from the same thread.

Counterargument: One-shot color avoids misleading players and saves scarce reveals. A featured arc should remain bounded and partly non-mechanical; it need not consume every case.

Risk if changed badly: Red herrings may become false evidence, drown deduction, or uniquely exonerate every non-answer suspect. Excluding the answer suspect from every thread can itself become a signature.

Dependency: ThreadStage records, an answer-safety validator, and scheduler arc objectives.

Expected player impact: A small tension can be noticed, complicated, and reinterpreted across play, making the day feel causal and memorable.

Falsifiable acceptance: At least 70% of pilot cases schedule one featured thread in two or three stages separated by at least two reveal positions, with payoff after setup. No stage may kill the answer; no payoff may claim innocence beyond the modeled incident; and the answer suspect must be eligible for unrelated benign threads without gaining an alibi.

### F7. The scheduler reports experience quality but does not optimize it

Classification: Supported design concern.  
Confidence: Very high.

Evidence: Selection is axis-coverage greedy in a fixed time, suspect, item, location order (src/services/clue-scheduler.ts:461-583). Ordering prefers gentle early and heavy late facts (src/services/clue-scheduler.ts:624-710). softPenalty measures repeated axes and suspect mention balance, but scheduleMystery returns the first valid schedule and only reports the penalty (src/services/clue-scheduler.ts:380-430, 730-758). The baseline converged pair is item plus time in 477/500 cases (docs/research/GAMEPLAY_RESEARCH_BRIEF.md:89-100).

Counterargument: Hard diversity quotas can make generation fragile. Use lexicographic selection and best-of-N scoring after feasibility, not hard quotas everywhere.

Risk if changed badly: Aesthetic scoring could override fairness, overfit arbitrary variety, or increase retries.

Dependency: Portfolio/source/thread metadata and a candidate-schedule search that retains the best feasible result.

Expected player impact: Cases alternate observation mechanisms and converge on different questions while retaining the same fair-play curve.

Falsifiable acceptance: Fairness is the first comparison key and can never be traded away. Among feasible schedules, choose minimum experience penalty from at least 20 deterministic candidates. In 500 seeds, adjacent repeated-axis pairs must fall by at least 50%, the dominant converged pair below 80% as an initial gate, and scheduling latency remain below 100 ms median on the reference machine.

### F8. Notes have no distinct jobs or validated knowledge partitions

Classification: Supported design concern.  
Confidence: Very high.

Evidence: Any noteSuitable fact can occupy either note slot (src/services/clue-scheduler.ts:648-699). No rule distinguishes Note 1 from Note 2. Room undisturbed plus item intact make up 69.9% of notes (docs/research/GAMEPLAY_RESEARCH_BRIEF.md:128-138). The client correctly keeps notes private per reader, unlocks them by clue progress, charges the first read a turn, and permits revisit (src/client/hooks/useGameStore.ts:512-555; src/client/pages/GamePage.tsx:1408-1463). The scheduler nevertheless validates one combined trajectory containing both private notes. The additional pass found 116/500 same-axis note pairs and 32/1,000 notes with zero incremental live-cell effect at reveal.

Counterargument: Players can verbally share notes, making the combined state practical. They may, but privacy should create a meaningful choice rather than being assumed away.

Risk if changed badly: Notes can become secret answer keys, create unfair seat advantage, or become mandatory tax actions.

Dependency: KnowledgeView simulation and NoteRole metadata.

Expected player impact: Note 1 changes what a player watches; Note 2 discriminates among late theories. Holders gain useful private leverage without receiving the answer.

Falsifiable acceptance: Every note must reduce live joint cells at its reveal, neither can violate its checkpoint, and at least 90% of cases must use different role/mechanism pairs. Validate public-only, public-plus-N1, public-plus-N2, and combined views. Blind playtests must show a measurable theory change after a note in at least half of reads without increasing correct accusations before the second window beyond the anti-obviousness target.

### F9. The host/phone loop only partially implements the official physical game

Classification: Verified defect or mismatch.  
Confidence: Very high, incorporating the OCR-checked official-rulebook evidence now recorded in docs/research/GAMEPLAY_RESEARCH_BRIEF.md:189-215.

Evidence:

- LocalGame has turn index/count but no move phase, pawn location, pantry count, facedown placement, challenge, or item-card payment state (src/client/hooks/useGameStore.ts:34-103).
- Reveal Clue advances the turn and exposes a testimony, but performs no Butler Pantry ritual (src/client/hooks/useGameStore.ts:396-437). The UI labels it Reveal Clue rather than Summon the Butler (src/client/pages/GamePage.tsx:1061-1070; src/client/phone/PhonePlayerPage.tsx:2144-2155).
- Suggestion merely opens a confirmation and ends the turn; it records none of the required three-of-four categories (src/client/pages/GamePage.tsx:1469-1487; src/client/phone/PhonePlayerPage.tsx:763-772).
- There is no Look at an Item Card or Inspector Challenge action in the host/phone action sets (src/client/pages/GamePage.tsx:1061-1103; src/client/phone/PhonePlayerPage.tsx:2144-2197).
- Secret passage is a 20/60/20 random reward/neutral/penalty roll rather than a move edge (src/client/hooks/useGameStore.ts:757-782).
- Wrong accusation handling is partial, not absent. The host already says to turn in wrongCount cards face-up (src/client/components/AccusationPanel.tsx:254-265), but says generic cards rather than item cards. Phone feedback exposes only the authentic correct count (src/client/phone/PhonePlayerPage.tsx:1067-1085). Neither path acknowledges payment, tracks ability to pay, or eliminates a player unable to pay; makeAccusation simply increments wrong accusations and advances (src/client/hooks/useGameStore.ts:641-685).
- V3 deliberately clears dramatic events and locked rooms (src/routes/scenarios.ts:237-253; src/services/ai-mystery-setup.ts:57-79), leaving dormant event/lock UI disconnected from generated cases.
- Timed interruptions begin at 60 minutes and instruct face-up card turns independently of a generated event plan (src/client/hooks/useGameStore.ts:171-192; src/client/pages/GamePage.tsx:413-433).

Counterargument: The shell is intentionally a digital variant and some rituals can be handled verbally. If so, each deviation should be an explicit named variant. At present the app presents them as ordinary turn actions.

Risk if fixed badly: Full hand digitization would replace the physical game and expose identities. Mid-turn events would violate the authentic sequence. Event placement can exhaust the pantry and invalidate a fixed testimony count.

Dependency: A TurnPhase state machine, rulebook event/Challenge transcription, and count-only physical state.

Expected player impact: Moving pawns, drawing and revealing item cards, using rooms/passages, and paying accusation penalties become consequential again; the app remains game master rather than the game board.

Falsifiable acceptance: Integration tests must enforce Move then exactly one Action then optional PostTurnEvent. Summon must be blocked in the Evidence Room, decrement/acknowledge one pantry card without recording identity, and deliver one public testimony. Suggestion must contain exactly three distinct categories. Secret passages must only move between configured endpoints when unlocked. Wrong accusation must request wrongCount item cards on host and phone, record paid/unable-to-pay acknowledgement, and remove a player who cannot pay. No event may interrupt ActionResolution.

### F10. The 0–4 accusation count is authentic

Classification: Rejected/non-issue.  
Confidence: Very high given the corrected official-rulebook evidence.

Evidence: makeAccusation computes the number of matching WHO/WHAT/WHERE/WHEN categories (src/client/hooks/useGameStore.ts:615-627), host and phone show it (src/client/components/AccusationPanel.tsx:254-262; src/client/phone/PhonePlayerPage.tsx:1067-1085), and the corrected brief explicitly records it as authentic (docs/research/GAMEPLAY_RESEARCH_BRIEF.md:199-215).

Counterargument: The count is powerful information. It is, but that is part of this edition's rules and is balanced by the item-card penalty.

Risk if removed: Reduced authenticity and loss of the intended risk/reward loop.

Dependency: Complete F9's payment handling.

Expected player impact: Players retain authentic feedback while paying the authentic cost.

Falsifiable acceptance: The count remains private to the accusing player, and every incorrect accusation pairs it with exactly 4 minus correctCount item-card payment. No UI identifies which categories were correct.

### F11. Board adjacency should govern player turns, not necessarily the narrated day

Classification: Verified defect or mismatch for documentation; Rejected/non-issue as a mandatory world-simulation change.  
Confidence: High.

Evidence: AI_ENGINE_V3_PLAN.md claims movement uses adjacency/passages (AI_ENGINE_V3_PLAN.md:68-76), and location data contains those edges (src/data/game-elements.ts:237-356). buildMovementGrid chooses rooms from broad pools without consulting them (src/services/world-sim.ts:399-563). The measured 73.6% non-edge transition rate confirms the mismatch. However each world slot is a broad time period, not a single board move.

Counterargument: Teleporting between adjacent time periods may sound implausible. It matters only if prose says the transition was immediate or impossible; current facts generally report occupancy within coarse slots.

Risk if forced: Adjacency constraints could reduce schedule feasibility and conflate historical reconstruction with live pawn movement.

Dependency: Correct the documentation and add duration/transition assertions only for prose that narrates immediate movement.

Expected player impact: No direct loss; live turns regain authentic movement under F9.

Falsifiable acceptance: Remove the unsupported world-sim claim. If a fact narrates continuous or immediate movement, validate its route; otherwise no adjacency requirement. Live TurnPhase movement must always validate adjacency, unlocked secret passage, or an explicit event move.

### F12. Fixed ten-plus-two cadence is a product choice, not an authenticity requirement

Classification: Optional experiment.  
Confidence: Very high.

Evidence: V3's schema requires exactly ten clues and two notes (src/services/ai-mystery-schemas.ts:25-30), and the shell creates ten slots (src/services/ai-mystery-setup.ts:45-55). Direct corpus inspection found eight Butler clues in each of ten cases while note counts are 3, 1, 3, 1, 3, 4, 6, 3, 3, and 5; the source file identifies these as ten transcribed originals (src/data/original-mysteries.ts:1-19; representative arrays at src/data/original-mysteries.ts:22-36, 41-53, 58-72).

Counterargument: Ten clues map neatly to the ten non-solution item cards. That is a coherent current design, especially before event placements.

Risk if changed early: Variable cadence multiplies scheduling checkpoints and pantry/event paths and can strand essential evidence.

Dependency: PhysicalCardBudget, KnowledgeView validation, and a fully transcribed event economy.

Expected player impact: Later experiments may create cases with different rhythms and more private texture.

Falsifiable acceptance: Keep 10+2 as control. Only ship a variable arm if every feasible pantry/event path is solver-validated, median duration does not increase, physical-card touches rise, and blind ratings improve without more early solves or rules confusion.

### F13. The pre-generated closing overclaims the evidence path

Classification: Verified defect or mismatch.  
Confidence: Very high.

Evidence: Closing generation passes every story seed—including note1 and note2—and schedule.finalCandidates into the answer-aware prompt before play begins (src/services/ai-mystery-engine.ts:252-276). The repair path repeats the same inputs (src/services/ai-mystery-engine.ts:315-323). The prompt labels the entire recap “evidence that was revealed during play” and describes the post-all-evidence candidate field as what remained (src/data/ai-v3-prompts.ts:176-205). Notes are optional and private per reader at runtime, with access recorded only when read (src/client/hooks/useGameStore.ts:512-555). A correct accusation can also end the game without checking that all ten Butler clues were summoned (src/client/hooks/useGameStore.ts:641-685). The independent 500-case measurement found that ten public Butler facts alone leave mean marginal fields of 7.83 suspects, 4.16 items, 7.75 locations, and 3.72 times—materially broader than the post-note schedule field. The Schedule comment calling finalCandidates the state after “all public evidence” is itself inaccurate because the trajectory includes both private notes (src/services/clue-scheduler.ts:53-59, 73-101).

Counterargument: Most tables may eventually read both notes and hear all clues. That may make the defect intermittent, but optional private actions and early accusations are supported paths; generation cannot assume either. Merely changing “revealed” to “available” would still overstate the field the table actually saw.

Risk if fixed badly: Runtime answer-aware LLM generation could add end-game latency or fail after a correct solve. Including read-note content could publicly expose which private evidence a player used. Removing all evidentiary explanation would make the payoff feel arbitrary.

Dependency: A public-only KnowledgeView and a closing-input contract that distinguishes public case record, runtime-observed evidence, optional Inspector-file confirmation, and physical-card resolution.

Expected player impact: The final explanation will accurately match the information contract, avoiding the disorienting experience of Ashe citing an unread file or claiming a narrowing the table never witnessed.

Falsifiable acceptance: The default pre-generated closing must be byte-identical and truthful under all four note-access states: neither, N1 only, N2 only, and both. It must exclude private-note claims and the post-note candidate field, never call unrevealed material “revealed during play,” and attribute the final distinction to physical cards and deduction. If optional notes appear in a post-case coda, they must be introduced as later Inspector-file confirmation, never as player-seen evidence. Tests over reveal counts 0–10 and all note-access permutations must find zero false witnessed-evidence claims. A future path-specific runtime closing is acceptable only if it is generated from persisted access/reveal state, has a deterministic no-network fallback, and never identifies a private reader.

### F14. Two truth-boundary comments/checks are narrower than they claim

Classification: Verified defect or mismatch, minor.  
Confidence: Very high.

Evidence: verifyClosing uses lowercase substring inclusion, so the required answer time `Night` can be spuriously satisfied by `Midnight` or “tonight” (src/services/clue-verifier.ts:103-120). The scheduler header advertises final maxima of 4/3/3/3, while FINAL_TARGET actually permits 6/5/6/4 (src/services/clue-scheduler.ts:9-24, 84-101). Its finalCandidates comment also says “all public evidence,” although N1/N2 are included (src/services/clue-scheduler.ts:53-59, 73-83).

Counterargument: Generated closings normally name the full answer and runtime uses the constants rather than comments. Therefore these are not genericity root causes or present solver failures.

Risk if ignored: A malformed closing can pass audit, and future work may be designed against stale guarantees.

Dependency: Phase 0 documentation cleanup and Phase 1 closing verification.

Expected player impact: Low direct impact, but tighter release checks and fewer misleading engineering assumptions.

Falsifiable acceptance: Exact card-name token matching rejects `Night` when only `Midnight` or “tonight” appears; header/comments match executable targets and correctly label combined versus public-only knowledge.

## Answers to the twelve required-review questions

### 1. Important concerns, minor concerns, and false alarms

Critical now:

- F2 semantic truth boundary.
- F13 closing path independence.
- F9 physical turn/action/card/event mismatches.
- F3 occasion/world disconnect.

High-value next:

- F5 fact/item portfolio.
- F7 scheduler experience objectives and convergence monoculture.
- F8 note roles and knowledge partitions.
- F6 staged threads.
- F4 answer-shaped structural leakage.

Minor or documentation-only:

- F11 world adjacency. Correct the claim; do not force board-step movement into coarse historical slots.
- F14 exact closing token matching and scheduler comment drift.
- relatedClues fallback metadata. The scheduler returns [1] when no overlap exists (src/services/clue-scheduler.ts:760-782), but current UI does not consume relatedClues. Fix when note roles are implemented.
- stale V2 diagrams and old route descriptions in README.md and CLAUDE.md.

False alarms or rejected remedies:

- Removing the authentic 0–4 accusation count.
- Replacing the joint-cell scheduler for variety.
- Assuming fixed 10+2 is official.
- Digitizing physical item identities or player hands.
- Making all color mechanically eliminative.
- Solving all four axes with public evidence.
- Adding ungrounded random events or answer-aware clue writing.
- Treating prompt tuning alone as a source of new world events.

### 2. Root causes of genericity by layer

World: Fourteen labels feed one occasion-independent simulator. Fixed tables and small catalogs select the same gathering/activity/thread grammar; answer entities receive global exemptions.

Fact: Most useful harvested facts are static item accounting, room checks, and group presence. Items do not have interval lifecycles, and observation source is prose embedded rather than typed.

Schedule: Feasibility is optimized in a fixed axis order. Portfolio, source, arc, note role, convergence pair, and soft penalty are not selection objectives.

Prose: The model can only decorate selected semantics. Few-shots improve register, but cannot invent truthful events absent from WorldState. Verification does not prove paraphrase semantics. The answer-aware closing is also generated from a combined-evidence path that runtime play may never traverse.

Round: Current play is a menu of actions without Move then one Action then PostTurnEvent. A clue reveal is detached from the Butler draw, and events/locks/challenges are absent.

Physical/digital loop: The app does not maintain even count-level pantry/placement/payment state, so the board and item cards cannot drive availability. Conversely, full digital hand tracking would be an overcorrection.

### 3. Dynamic arc across ten Butler opportunities and two note windows

Retain current checkpoints while giving each window a job:

| Window | Experience job | Evidence constraints |
| --- | --- | --- |
| C1–C2: orientation | Establish occasion-specific activity and one anomaly; introduce a featured thread | Gentle facts; at least four candidates everywhere; no constraining answer mention |
| C3–C4: pattern | Use two different mechanisms/sources; start an item lifecycle and a social/space pattern | No repeated mechanism family if feasible |
| C5: hinge | Public fact that makes Note 1 worth seeking without resolving it | Checkpoint still safe before/after N1 |
| N1: cross-reference | A private relational fact that changes what to watch or connects two earlier observations | Must reduce live joint cells; role cross_index; not a room-check clone by default |
| C6–C7: complication | Occasion consequence, staged-thread escalation, or item transition; preserve at least three candidates | Different primary family from N1 where feasible |
| N2: discriminator | A private late distinction or reconciliation, not merely a stronger N1 | Must reduce live cells; role discriminate or reconcile; different role/mechanism from N1 |
| C8–C9: payoffs | Resolve the featured benign thread and deliver heavier constraints from varied sources | Answer mentions permitted; payoff cannot falsely exonerate |
| C10: closure | Strong discovery/access/custody boundary that leaves physical cards necessary | Final current windows; no claim public clues uniquely solve all axes |

The post-case closing is not a thirteenth reveal. Its default pre-generated form reconstructs the solution from the public case record, labels any material not guaranteed to have been heard as record evidence rather than player-seen evidence, excludes optional note facts, and credits physical cards with the unresolved distinctions. An optional Inspector-file coda may confirm a fact honestly after the solve.

These are evidence positions, not automatic consecutive turns. Players may Suggest, Look, read notes, or Accuse between summons. Post-turn physical events occur only after an action resolves.

### 4. Occasion families as deterministic truth

Introduce WorldArchetype as data, selected before and independently of the answer:

- id and compatible occasion families
- beatGrammar: setup, main event, intermission, meal, cleanup, disruption
- roomRoles and weighted rooms, not fixed answer-dependent rooms
- required and optional gathering shapes
- itemPolicies: display, demonstration, prize, repair, loan, storage
- threadTemplates tied to the activity
- observationSourceMix
- optional physicalEventPolicy

Map fourteen families into approximately six reusable but materially different archetypes: performance/rehearsal, competition/tournament, exhibition/viewing, committee/benefit, house-weekend/reunion, and preparation/working-household. Modifiers provide season and social tone.

Generate the base day from archetype plus seed. Embed the fixed answer through constraint solving or rejection sampling, then add at least two structurally similar decoy opportunities. Deterministic code may see the answer; the dossier and renderer still receive only licensed selected facts and occasion truth. The answer never enters a prose prompt before closing.

### 5. Dynamic items without contradiction or physical-card damage

Replace static ItemState with a sequence of immutable ItemLifecycleEvent records:

- displayed_at(item, location, interval)
- handled_by(item, suspect/group, time)
- moved_intact(item, from, to, time, witness)
- loaned_offsite(item, interval)
- secured(item/set, interval)
- sent_for_repair and returned(item, interval)
- last_seen_intact(item, location, time)
- discovered_missing(item or generic collection, time)

Formal semantics must remain conservative. Seeing an item intact at time T can rule out theft at or before T under the existing slot convention, but a display at one time must not claim that room for the entire day. Continuous-custody and display-window facts may constrain joint item-location-time cells only for their certified interval. Handling without custody is mention-only.

Keep physical identity opaque. The app may track pantry count, facedown-card counts by board location, private-hand counts by player, and face-up Evidence Room count through acknowledgements. It must never ask which physical item card a player drew. Enforce the conservation equation:

initial non-solution item cards = pantry + facedown on board + private hands + face-up Evidence Room.

Do not enable event placement until every branch preserves this budget and the schedule is valid for the resulting number of Butler summons.

### 6. Staged innocent threads without misleading noise

Model:

Thread {
  id, kind, participants, subjectItem?, answerRelevance: unrelated,
  stages: [setup, escalation?, payoff],
  safetyClaims
}

Each ThreadStage has its own world event, source, time, evidence capsule, Fact semantics, and reveal bounds. Setup reports an anomaly without guilt language. Escalation adds a true second observation. Payoff explains only that anomaly. A payoff does not clear a suspect unless an independent formal alibi fact actually does so.

Permit the answer suspect in unrelated benign threads; prohibiting them from all threads is structurally revealing. Validate that their payoff does not explain the theft-time gap. Feature at most one arc initially, two or three reveals, so deduction remains primary. Other threads can remain one-shot color.

### 7. Scheduler diversity while preserving invariants

Use lexicographic optimization:

1. Hard truth: all facts entailed by WorldState; answer alive after each reveal.
2. Hard fairness: existing checkpoint and final windows; late answer mentions.
3. Hard physical budget: delivery is reachable under pantry/event state.
4. Hard knowledge-view safety: public, each note view, and combined.
5. Soft portfolio: mechanism families and observation sources.
6. Soft arc: stage order/spacing/payoff.
7. Soft note roles: distinct and impactful.
8. Soft convergence balance and answer-structure balance.
9. Existing repeated-axis and suspect-mention penalty.

Generate many feasible candidates using deterministic seed derivations, score all, and choose the lowest penalty. Never add aesthetic score to fairness score; use ordered tuples so a prettier invalid schedule cannot win.

Portfolio metadata should include mechanismFamily, sourceType, threadId/stage, lifecycleId, roleSuitability, and strength. Suggested pilot ranges across twelve current reveals are 2–4 item lifecycle, 2–4 presence/social, 1–3 space/access, 1–2 time boundary, and 1–3 thread/color, with at least four families and three source types. These are soft until feasibility data supports hardening.

### 8. Distinct Note 1 and Note 2 jobs

Note 1 is a cross-index or hypothesis generator: it connects an earlier public observation to another category and encourages a new question. It should be useful before convergence and usually avoid direct whole-category retirement.

Note 2 is a discriminator or reconciliation: it distinguishes late joint theories, resolves an apparent tension, or supplies a precise interval/access relation. It should not repeat Note 1's family or source.

Private play remains authentic:

- First read consumes the action; revisit is free as currently implemented.
- Content stays on that player's device or under look-away UI.
- The player decides whether to disclose, paraphrase, bargain, or stay silent.
- The app does not auto-mark the shared board.
- The pre-generated closing does not expose, assume, or infer whether any player read a note.

Validate four knowledge views. Combined evidence retains current final targets. Public-only evidence receives a broader playability window, not the same final maximum. Each single-note view must be materially different but cannot become an answer key.

### 9. Restore, retain, or remove turn-shell behavior

| Behavior | Ruling |
| --- | --- |
| Move to adjacent location, then one action | Restore |
| Suggest exactly three of four categories | Restore and log selections, without judging |
| Summon Butler for public clue plus private top pantry card | Restore; count/acknowledgement only |
| Summon from Evidence Room | Prohibit |
| Look at Item Card plus Inspector Challenge | Restore after exact challenge rules are transcribed |
| Private notes, first-read action, free revisit | Retain |
| 0–4 correct accusation count | Retain; authentic |
| Wrong-count face-up penalty | Complete: item cards, both UIs, acknowledge, eliminate if unable |
| Enter Evidence Room without accusing | Prohibit |
| Random secret-passage reward/penalty | Remove from authentic mode; passages are movement edges |
| Locked doors/passages | Restore through deterministic post-turn event state |
| Mid-turn events | Prohibit; queue for PostTurnEvent |
| 60-minute generic card-shedding interruptions | Feature-flag as a named house variant, then replace with rulebook-grounded event plans |
| Full digital physical-card identities | Reject |

### 10. Minimal experiments and telemetry

Experiment A — Evidence capsule, no world change:

- Add deterministic capsule generation and display behind a flag.
- Make the pre-generated closing public-path-independent and run it against all reveal-count/note-access permutations.
- Compare narration-only versus narration-plus-capsule comprehension in ten blind sessions.
- Falsifier: capsule causes lower comprehension, more reading time, or feels redundant without reducing disputes/errors; or any closing claims unseen evidence was revealed.

Experiment B — Multi-objective scheduler on existing facts:

- Best-of-20 feasible schedules using only current facts.
- No world rewrite.
- Falsifier: portfolio and convergence metrics do not improve, or retries/latency exceed gates.

Experiment C — One archetype and one staged thread:

- Implement performance/rehearsal only, with one two-stage benign thread and new lifecycle facts.
- Compare against generic control on identical answer distributions.
- Falsifier: blind players cannot identify a coherent event shape, or structural answer prediction improves.

Experiment D — Physical ritual shell:

- Setup checklist, MoveConfirm, Summon draw acknowledgement, structured Suggestion, and completed accusation payment. No item identities and no new events yet.
- Falsifier: median turn overhead rises more than 20 seconds, missed acknowledgements exceed 5%, or players report less physical engagement.

Experiment E — Cadence/event economy:

- Control 10+2.
- Pilot 8 Butler testimonies plus rulebook-grounded variable notes/events only after pantry path validation.
- Falsifier: more abandoned cases, lower clarity, or more unsatisfied schedules.

Production-safe telemetry, with no answer names or raw private note text:

- engine/version/flag cohort, hashed case ID, seed hash
- world attempts and schedule attempts/latency
- fact-kind, mechanism-family, source, axis sequence, thread-stage sequence
- candidate-count trajectory and converged-axis pair as counts only
- soft penalties and selected candidate rank
- verifier failures, capsule fallback, repair count, invented-name detection
- closing input mode and public reveal count; never raw note content or reader identity
- action counts, time in phases, summons, suggestions, note reads/revisits, challenges, accusations
- pantry/placement/payment acknowledgements as counts
- post-turn event type and completion
- duration, abandonment, winner turn
- post-case three-item survey: repetition, clarity, physical-card importance

Never send solution IDs, private hand identities, raw debug payloads, or note text in production telemetry. The existing last-ai debug contains the hidden answer and must remain local-development-only (AI_ENGINE.md:53-55).

### 11. New tests and validation

World/archetype:

- Same seed/archetype/answer deterministic.
- Occasion topology differentiation.
- All answer categories and times feasible.
- Shadow-opportunity counts and answer-structure leakage classifier.
- Item lifecycle interval consistency and custody non-overlap.
- Thread stage chronology, payoff scope, and answer safety.

Facts/capsules:

- Exhaustive truth-table/property tests for every FactKind.
- Boundary tests at every time interval edge.
- Capsule snapshots generated from structured data only.
- Required-entity, exact-quantity, polarity, and chronology mutations.
- Invented person/event rejection and safe fallback.
- Closing matrices for public reveal counts 0–10 crossed with neither/N1/N2/both note access; no private-note dependency in the default output.
- Exact closing-card token tests, including Night/Midnight/tonight collisions.

Scheduler:

- Preserve current 120-seed tests, expand nightly to 10,000.
- Best-of-N determinism and lexicographic priority tests.
- Portfolio/source/arc/note-role objectives.
- Convergence-pair distribution reports, not prematurely hard quotas.
- KnowledgeView public/N1/N2/combined invariants.
- PhysicalCardBudget across every event branch.

Turn shell:

- State-machine transition table; no action before move and no second action.
- Passage and lock graph tests.
- Summon restrictions and pantry conservation.
- Suggestion exactly three categories.
- Note first-read/revisit behavior.
- Wrong-accusation count privacy, item-card payment, and elimination.
- Events queued after action only.
- Host/phone parity tests for every instruction and acknowledgement.
- Persistence/migration tests for in-progress local games and D1 phone sessions.

Human acceptance:

- At least two blind tables per rollout cohort.
- No theory dominates by the first note window.
- Evidence capsule and narration never perceived as contradictory.
- Physical cards are consulted and materially settle at least one final distinction.
- Featured thread is remembered but not mistaken for proof of guilt.

### 12. Prioritized roadmap

#### Phase 0 — Baseline contracts and documentation

Priority: P0; dependency: none; risk: low; expected impact: prevents implementation against false rules.

- Update GAME_REFERENCE.md with the corrected official turn/action/accusation/event rules.
- Mark stale README.md and CLAUDE.md sections historical or replace with active paths.
- Check in the portfolio/note/thread/knowledge-view instrumentation.
- Define feature flags and telemetry privacy contract.
- Record 10+2 as a product format, not an authenticity claim.

Acceptance: One command emits all baseline distributions in this report; docs contain no claim that world movement uses adjacency; exact accusation count and partial penalty implementation are described correctly.

#### Phase 1 — Deterministic evidence capsule and fail-closed prose

Priority: P0; dependency: EvidenceCapsule schema; risk: medium; expected impact: highest truthfulness gain.

- Add evidenceCapsule, requiredMentions, polarity, interval, quantity, and source to Fact.
- Display the capsule as the official write-down summary.
- Keep narration answer-blind.
- Expand verifier checks and suppress/fallback unsafe narration rather than accepting residual errors.
- Keep closing as the only answer-aware prose, but generate its default form from answer plus a public-only record, not optional notes or post-note candidates.
- Phrase the closing as a reconstruction rather than asserting that every source was seen; credit physical cards for the final distinctions. Permit explicitly labeled Inspector-file confirmation only as a post-solve coda.
- Correct exact closing-name verification and scheduler comments while this boundary is open.

Acceptance: F2, F13, and F14 criteria; mutation suite; zero capsule errors over 10,000 scheduled facts; no answer data in render prompts; identical truthful default closing across all optional-note access states.

#### Phase 2 — Restore the minimal physical turn state machine

Priority: P0; dependencies: official action table and persistence schema; risk: medium; expected impact: highest table-play gain.

- Add MoveConfirm, ActionSelect, ActionResolution, PostTurnEvent, TurnEnd.
- Add structured Suggestion and Summon Butler draw acknowledgement.
- Correct host/phone wrong-accusation copy and complete payment/elimination.
- Convert secret passages to movement; feature-flag the random roll as a house variant until removed.
- Add setup checklist: solution cards to envelope, ten remaining item cards facedown in Pantry, other categories dealt with leftovers face-up in Evidence Room.
- Track counts/acknowledgements only.

Acceptance: F9 state-machine and parity tests; pantry conservation; no item identity entered into the app; median added turn overhead at or below 20 seconds.

#### Phase 3 — World archetype and lifecycle vertical slice

Priority: P1; dependencies: Phase 1 truth boundary; risk: medium-high; expected impact: strong replayability.

- Implement one archetype, typed beats/sources, interval item lifecycles, and shadow opportunities.
- Implement one staged benign thread.
- Do not yet add physical item-placement events.

Acceptance: F3–F6 experiment gates and all legacy invariants.

#### Phase 4 — Multi-objective scheduler and note portfolios

Priority: P1; dependencies: new fact metadata; risk: medium; expected impact: strong case-to-case and within-case variety.

- Best-of-N lexicographic schedule selection.
- Add portfolios, source alternation, arc spacing, note roles, knowledge views, and convergence diversity.
- Preserve current final/public-card relationship.

Acceptance: F7–F8 gates; 1,000/1,000 schedules; no latency regression over the stated budget.

#### Phase 5 — Authentic events, locks, placements, and variable cadence pilot

Priority: P2; dependencies: complete OCR-checked event/Challenge rule transcription, PhysicalCardBudget, Phase 2 state machine; risk: high; expected impact: potentially the largest round dynamism.

- Model deterministic post-turn event plans: lock/unlock doors/passages, place top facedown pantry cards, enable Look/Challenge.
- Validate every reachable pantry branch.
- Pilot 8-testimony/variable-note cadence against 10+2; do not assume the corpus cadence explains event consumption without direct rules evidence.

Acceptance: No mid-turn events, no negative pantry counts, every delivery path fair, lower perceived repetition and higher physical-card importance without more early solves.

#### Phase 6 — Progressive rollout and cleanup

Priority: P2; dependencies: prior gates; risk: operational; expected impact: safe adoption.

- Internal deterministic and mocked-prose soak.
- Two-table blind alpha.
- 5% local cohort, then 25%, then default.
- Automatic rollback flag if generation success, verifier fallback, abandonment, or early-solve thresholds regress.
- Retire dormant legacy event/lock code only after the authentic replacement is stable.

Acceptance: Two consecutive cohorts meet all machine and human gates; rollback tested; production telemetry contains no answer or private-card identity.

## Concrete target architecture

The smallest safe data evolution is:

WorldArchetype
- id, occasionFamilies, beatGrammar, roomRoles, gatheringRules
- lifecyclePolicies, threadTemplates, sourceTargets, physicalEventPolicy

WorldState
- archetypeId, beats, movement, itemLifecycles, threads, observationSources
- answer remains private deterministic state

Fact
- existing joint-cell semantics and mention license
- mechanismFamily, sourceType
- evidenceCapsule with exact structured claim
- requiredMentions, polarity, interval, quantity
- lifecycleId?
- threadId?, threadStage?
- noteRoles

Schedule
- existing reveals, trajectory, final candidates
- public/N1/N2/combined KnowledgeViews
- portfolio diagnostics, convergence pair, selected penalty tuple
- PhysicalCardBudget and delivery reachability

ClosingInput
- answer names; public-only evidence capsules; public-only KnowledgeView
- claim mode: post-solve reconstruction, never assumed witnessed history
- optional Inspector-file coda explicitly marked as later confirmation
- no private reader identity and no post-note candidate field in the default path

Gameplay
- TurnPhase state machine
- declared physical location or lightweight move acknowledgement
- count-only pantry/placement/payment state
- ActionResolution and queued PostTurnEvent
- no physical item identity

The architecture deliberately retains the most important boundary:

deterministic truth and scheduling -> immutable evidence capsule -> answer-blind expressive narration -> deterministic checks/fallback -> answer-aware, public-path-independent closing only

## Rejected attractive changes

- Do not let the renderer see the answer, survivor counts, elimination targets, convergence pair, or answer-aware repair feedback.
- Do not use an answer-aware LLM as a semantic gate.
- Do not remove physical card uncertainty by making the public schedule solve all axes.
- Do not identify drawn physical item cards in the app.
- Do not add random “drama” that changes state without a deterministic, visible, rulebook-grounded event.
- Do not spend pantry cards on physical events while still assuming ten Butler summons.
- Do not force board adjacency on historical time-slot transitions merely because it belongs in live pawn movement.
- Do not make every thread mechanically useful or every innocent payoff an alibi.
- Do not harden aspirational diversity quotas until feasibility and playtests support them.

## Final decision

Approve Phases 0–2 immediately as the safety/authenticity tranche. Prototype Phases 3–4 behind deterministic evaluation flags. Defer Phase 5 until the official event and Inspector Challenge rules are represented as executable state transitions and every pantry path is solver-validated.

This plan improves organic play by changing what truly happens, which facts are selected, when information changes hands, and how physical components constrain choices. It does not compromise answer blindness, mathematical fair play, or the requirement that physical cards finish the deduction.
