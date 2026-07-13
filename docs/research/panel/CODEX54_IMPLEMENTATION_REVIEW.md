# CODEX54 Implementation Review

Status: adversarial engineering review grounded in repository code, repository documents, local test/eval runs, and the updated evidence packet in `docs/research/GAMEPLAY_RESEARCH_BRIEF.md`.

## Scope And Method

- Read `docs/research/GAMEPLAY_RESEARCH_BRIEF.md` fully, including the updated turn-shell, cadence, and verifier sections (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:140-230`).
- Read active and historical design docs called out by the brief: `AI_ENGINE.md`, `AI_ENGINE_V3_PLAN.md`, `AI_REDESIGN_COMPARISON.md`, `PROMPT_REDESIGN_NOTES.md`, `TOPROMPT.md`, `GAME_REFERENCE.md`, `README.md`, plus legacy V2 docs (`AI_MYSTERY_ENGINE_V2.md`, `V2_ELIMINATION_SYSTEM.md`, `V2_INTEGRATION_GUIDE.md`).
- Traced the active AI route from `src/routes/scenarios.ts:25-68` into `src/services/ai-mystery-engine.ts:141-403`, `src/services/world-sim.ts`, `src/services/fact-harvest.ts`, `src/services/clue-scheduler.ts`, and `src/services/clue-verifier.ts`.
- Traced the active host/phone shell through `src/client/hooks/useGameStore.ts`, `src/client/pages/GamePage.tsx`, `src/client/components/AccusationPanel.tsx`, `src/client/phone/PhonePlayerPage.tsx`, and `src/phone/routes.ts`.
- Local verification:
  - `npm run typecheck` passed.
  - `npm test -- --run` passed: 8 files, 69 tests.
  - `npx -y tsx scripts/eval-mysteries.ts 200` passed: 200/200 schedules.
  - A local 500-seed direct instrumentation pass against `simulateWorld`, `harvestFacts`, and `scheduleMystery` reproduced the brief's published distributions exactly, including 500/500 success, world-attempt histogram, fact-kind mix, note-kind mix, and converged-axis pair dominance.
  - A local count over `src/data/original-mysteries.ts` confirmed every transcribed original case has 8 butler clues and note counts of 3, 1, 3, 1, 3, 4, 6, 3, 3, 5.

## Executive Judgment

The brief is directionally right about where genericity comes from, but the highest-leverage fixes are not "rewrite the mystery engine" fixes. The solver is reliable and already proves the hard fairness constraints. The largest active gaps are:

1. The simulated truth is still too generic upstream of prose.
2. The scheduler optimizes deduction coverage but not per-case experiential shape.
3. The host/phone shell has collapsed most of the authentic item-card, movement, and event economy into a simpler clue-turn loop.
4. The deterministic proof stops at the harvested `Fact`, not at the final narration the player hears.
5. The pre-generated closing is path-dependent on optional private notes and can overstate what the table actually saw.
6. Several docs and legacy files still describe deleted or fallback architecture and will mislead reviewers if treated as current runtime behavior.

## Findings

### Finding 1: Replacing the solver is the wrong intervention

- Classification: `Rejected/non-issue`
- Confidence: `High`
- Evidence:
  - The active engine retries deterministic world generation until a schedule exists, then only proceeds to AI once the schedule is proven (`src/services/ai-mystery-engine.ts:164-195`).
  - The scheduler test sweep asserts both checkpoints, final windows, note placement, and late answer-mentioning over 120 seeds (`src/services/clue-scheduler.test.ts:35-99`).
  - The evaluation harness exists specifically to measure solver behavior (`scripts/eval-mysteries.ts:1-80`).
  - Local runs matched the brief's 500-seed reliability numbers exactly.
- Counterargument:
  - The current schedules are mathematically safe but experientially repetitive.
- Risks / dependencies:
  - Solver replacement would re-open the project's hardest solved problem: falsifiable fairness.
- Expected player impact:
  - Replacing the solver would mainly add regression risk, not guaranteed variety.
- Falsifiable acceptance criteria:
  - Keep the existing proof boundary: `>= 99%` deterministic schedule success in a 500-seed sweep, zero answer-cell eliminations, existing checkpoint windows unchanged.
- What would change my mind:
  - Repeated measured schedule failures under current invariants, or proof that diversity goals cannot be met by changing world/fact catalogs and scheduler selection targets around the current solver.

### Finding 2: `occasionFamily` is still mostly cosmetic

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - `occasionFamily` is chosen up front (`src/services/ai-mystery-engine.ts:149-156`, `src/services/ai-mystery-engine.ts:431-439`).
  - In `simulateWorld`, it is accepted and stored, but no branch uses it to alter gatherings, movement, item states, or threads (`src/services/world-sim.ts:82-108`, `src/services/world-sim.ts:204-210`, `src/services/world-sim.ts:374-392`).
  - The dossier prompt uses the family directly, after scheduling is already fixed (`src/data/ai-v3-prompts.ts:60-84`).
- Counterargument:
  - Dossier variation plus few-shots can still create surface novelty.
- Risks / dependencies:
  - Occasion-aware truth must not become answer-aware truth; the family should bias catalogs, not inject eliminations ad hoc.
- Expected player impact:
  - Cases with different titles/occasion summaries can still feel structurally identical over repeated play.
- Falsifiable acceptance criteria:
  - In a 200-seed sweep, at least 4 occasion families should produce measurably different fact-kind distributions or item/room behavior profiles while preserving current solver success and checkpoints.
- What would change my mind:
  - Code evidence that occasion family already changes world simulation inputs materially, or measured playtests showing players reliably perceive distinct evidence topology despite identical world rules.

### Finding 3: The world model is safe but still narrow, especially for items

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - Gatherings, room activities, solo activities, errand causes, quarrel causes, surprise causes, and object notes are all small fixed catalogs (`src/services/world-sim.ts:114-199`).
  - Item state is limited to home location, offsite whole-day absence, intact sightings, one secured set, and one room closure (`src/services/world-sim.ts:49-68`, `src/services/world-sim.ts:313-372`, `src/services/world-sim.ts:566-629`).
  - Harvested item facts mostly stay in the "item in place / item offsite / items secured / item home" family (`src/services/fact-harvest.ts:331-463`, `src/services/fact-harvest.ts:531-591`).
  - The local 500-seed pass reproduced `item_intact` at 2,035 / 6,000 scheduled reveals and `room_undisturbed` at 1,114 / 6,000.
- Counterargument:
  - Narrow catalogs are part of current reliability; broader event taxonomies can easily destabilize schedule feasibility.
- Risks / dependencies:
  - More dynamic item behavior must not contradict the fixed answer item, the physical item-card economy, or the solver's item-time chains.
- Expected player impact:
  - Repeated cases over-index on "still there / locked up / nothing missing in room X" instead of item circulation, handling, challenge, or discovery dynamics.
- Falsifiable acceptance criteria:
  - After a narrow catalog expansion, the top scheduled fact kind should be `<= 30%` of all reveals in a 500-seed sweep, with schedule success still `>= 99%`.
- What would change my mind:
  - Evidence from repeated blind play that players do not perceive this concentration as repetitive, or proof that richer item states materially hurt schedule feasibility.

### Finding 4: Innocent threads exist, but not as arcs

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - Threads are created as 2-3 standalone events excluding the answer suspect (`src/services/world-sim.ts:632-689`).
  - Harvest often resolves the innocent explanation inside the same brief: "In truth..." appears directly in the writer brief (`src/services/fact-harvest.ts:637-645`).
  - Scheduler selection and ordering do not use `threadId` at all (`src/services/clue-scheduler.ts:471-618`, `src/services/clue-scheduler.ts:630-783`; only `src/services/fact-harvest.ts` stores `threadId`).
- Counterargument:
  - Immediate explanation avoids misleading noise.
- Risks / dependencies:
  - Multi-step thread arcs can become fake drama unless each stage is still true and still useful.
- Expected player impact:
  - Threads add flavor, but not sustained suspicion, reinterpretation, or payoff.
- Falsifiable acceptance criteria:
  - In a 200-seed sweep, at least 60% of cases should schedule 2 reveals from the same innocent thread with minimum spacing of 2 reveal positions and no answer elimination.
- What would change my mind:
  - Measured player feedback that single-shot thread color already feels sufficient once the broader turn/event loop is restored.

### Finding 5: The scheduler proves coverage, but not case shape

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - Selection is axis-greedy and coverage-first (`src/services/clue-scheduler.ts:461-618`).
  - Ordering enforces checkpoints and late answer facts, but not note identity or thread recurrence (`src/services/clue-scheduler.ts:630-724`).
  - `softPenalty` exists but is only reported after a successful schedule; it is not used to pick the best schedule among alternatives (`src/services/clue-scheduler.ts:417-430`, `src/services/clue-scheduler.ts:730-758`).
  - Local 500-seed reproduction:
    - `item+time` converged in 477 / 500 cases.
    - 69.9% of notes were `room_undisturbed` or `item_intact`.
    - `solo_presence` appeared only once in 6,000 reveals.
- Counterargument:
  - Stronger diversity constraints may lower solver yield or create overfit quotas that feel artificial.
- Risks / dependencies:
  - The first step should be lightweight selection constraints and metrics, not a new search architecture.
- Expected player impact:
  - Even when prose varies, players repeatedly solve the same underlying two-axis pattern with similar note semantics.
- Falsifiable acceptance criteria:
  - 500-seed sweep targets:
    - dominant converged-axis pair `<= 70%` of cases,
    - dominant note kind `<= 35%`,
    - dominant reveal fact kind `<= 30%`,
    - schedule success still `>= 99%`.
- What would change my mind:
  - Player testing showing these macro-patterns are not perceptible at the table.

### Finding 6: Fixed `10+2` cadence is a project decision, not a proven authenticity requirement

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - V3 hardcodes 10 public clues in the shell (`src/services/ai-mystery-setup.ts:7`, `src/services/ai-mystery-setup.ts:45-55`).
  - The active reveal sequence is fixed to 10 clues plus 2 reserved note slots (`src/services/clue-scheduler.ts:8-18`, `src/services/clue-scheduler.ts:74-78`).
  - The prompt builder assumes exactly two notes (`src/data/ai-v3-prompts.ts:96-137`).
  - Local count over `src/data/original-mysteries.ts` confirmed every original transcribed case has 8 butler clues and variable note counts; the brief now records that explicitly (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:140-142`).
- Counterargument:
  - Standardizing to `10+2` may be a deliberate replayability / difficulty decision, not a bug.
- Risks / dependencies:
  - The current host/phone shell, note unlock thresholds, and scheduler checkpoints are all tuned to this cadence.
- Expected player impact:
  - Authenticity arguments that assume the cadence is canonical are overstated; however, changing cadence now would be a higher-risk migration than fixing the shell and event loop.
- Falsifiable acceptance criteria:
  - Treat cadence variation as a later experiment only after current shell fidelity is restored; any alternate cadence must re-prove schedule windows and host/phone pacing in seed sweeps.
- What would change my mind:
  - Evidence that fixed `10+2` materially improves play and variety enough to outweigh source-authentic cadence differences.

### Finding 7: The movement-authenticity claim is a documentation mismatch, not yet a proven gameplay defect

- Classification: `Verified defect or mismatch`
- Confidence: `High` on the mismatch, `Medium` on gameplay impact
- Evidence:
  - `AI_ENGINE_V3_PLAN.md` explicitly claims the movement grid obeys adjacency and secret passages (`AI_ENGINE_V3_PLAN.md:68-77`).
  - `src/data/game-elements.ts` does define adjacency and secret passages (`src/data/game-elements.ts:237-245`, `src/data/game-elements.ts:196-201`, plus location adjacency rows beginning at `src/data/game-elements.ts:248`).
  - `buildMovementGrid` never consults adjacency or passage data; it picks legal rooms from broad room pools (`src/services/world-sim.ts:399-564`).
- Counterargument:
  - Ten coarse time slots may cover enough elapsed time that adjacency is narratively irrelevant.
- Risks / dependencies:
  - Forcing adjacency into world-sim too early could reduce available schedules with little player-visible payoff.
- Expected player impact:
  - Mostly reviewer and design-doc confusion today, not necessarily a direct table defect.
- Falsifiable acceptance criteria:
  - Either remove the adjacency claim from the design doc, or add adjacency-aware movement and demonstrate no measurable hit to 500-seed schedule success.
- What would change my mind:
  - Playtest evidence that coarse-slot non-adjacent movement makes narrated cases feel visibly false.

### Finding 8: The active turn shell is a simplified clue-turn loop, not the authenticated move-then-one-action physical loop

- Classification: `Verified defect or mismatch`
- Confidence: `High`
- Evidence:
  - The updated brief records the authenticated rulebook loop: move to adjacent room, then exactly one action, with item-card and event economy (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:191-207`).
  - `LocalGame` carries no board position, room occupancy, or item-hand state (`src/client/hooks/useGameStore.ts:34-103`).
  - The active actions presented are `Reveal Clue`, `Accusation`, `Secret Passage`, `Inspector Note`, `Suggestion` (`src/client/pages/GamePage.tsx:1051-1123`; phone equivalent `src/client/phone/PhonePlayerPage.tsx:2144-2195`).
  - `revealNextClue` simply reveals the next text clue and advances the turn (`src/client/hooks/useGameStore.ts:396-437`).
  - Suggestion is only "announce it, then end turn"; no structured three-of-four capture exists (`src/client/pages/GamePage.tsx:1477-1487`, `src/client/phone/PhonePlayerPage.tsx:763-772`).
- Counterargument:
  - The simplification lowers admin burden and may be intentional for mixed physical/digital play.
- Risks / dependencies:
  - Full hand-state digitization is unnecessary and risky; a ritualized lightweight shell may be the right compromise.
- Expected player impact:
  - A large share of the original round-level dynamism is absent even if the mystery text improves.
- Falsifiable acceptance criteria:
  - Restore a move-then-one-action host/phone flow with explicit action identity, without requiring the app to know hidden player hands.
- What would change my mind:
  - Strong playtest evidence that players prefer the current simplified loop even after experiencing a lightweight authentic loop.

### Finding 9: The exact `0-4` accusation feedback is authentic and should be retained

- Classification: `Rejected/non-issue`
- Confidence: `High`
- Evidence:
  - The updated brief and user correction explicitly supersede the earlier repo summary (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:191-203`).
  - The store computes exact `correctCount` and `wrongCount` (`src/client/hooks/useGameStore.ts:615-685`).
  - The phone flow surfaces that exact count to the accuser (`src/phone/routes.ts:129-153`, `src/phone/types.ts:33-37`, `src/client/phone/PhonePlayerPage.tsx:429-497`, `src/client/phone/PhonePlayerPage.tsx:1067-1085`).
- Counterargument:
  - Exact counts materially accelerate deduction.
- Risks / dependencies:
  - Removing an authentic rule would make the shell less canonical, not more.
- Expected player impact:
  - Retaining this rule preserves authentic accusation drama.
- Falsifiable acceptance criteria:
  - Keep exact `0-4` feedback in any shell rewrite; do not frame it as leakage.
- What would change my mind:
  - Repository-contained evidence contradicting the updated rulebook reading. Current evidence goes the other way.

### Finding 10: The wrong-accusation penalty is only partially implemented

- Classification: `Verified defect or mismatch`
- Confidence: `High`
- Evidence:
  - The updated brief says each wrong category costs one item card turned face-up to the Evidence Room (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:191-207`).
  - The UI does instruct a penalty, but only generically: "Turn in N cards face up" (`src/client/components/AccusationPanel.tsx:254-265`).
  - `makeAccusation` tracks counts but not item-card-specific payment or any acknowledgment of Butler's Pantry / Evidence Room item inventory (`src/client/hooks/useGameStore.ts:615-685`).
  - The phone result path stores only `correct` and `correctCount`, so the ritual is not mirrored there (`src/phone/routes.ts:129-153`, `src/phone/types.ts:33-37`, `src/client/phone/PhonePlayerPage.tsx:1067-1085`).
  - A wrong accusation only increments `wrongAccusations` and advances the turn; there is no inability-to-pay elimination/removal path (`src/client/hooks/useGameStore.ts:651-665`, `src/client/hooks/useGameStore.ts:740-755`).
- Counterargument:
  - The app may intentionally avoid pretending to know physical hands.
- Risks / dependencies:
  - Over-tracking hidden hands would be a worse design error than under-tracking them.
- Expected player impact:
  - Players get the deduction consequence and a host-side generic discard instruction, but not a faithful item-card-specific penalty ritual, synchronized phone feedback, or elimination when the physical penalty cannot be paid.
- Falsifiable acceptance criteria:
  - Host and phone must explicitly instruct "turn in one item card per wrong category," capture at least a lightweight acknowledgment event, and provide a host-side way to record inability-to-pay elimination without digitizing hidden hands.
- What would change my mind:
  - Existing code showing item-card-specific penalty capture or rulebook evidence that any face-up card is acceptable. I found neither.

### Finding 11: Secret passages, locked rooms, and event economy are disconnected from the mystery

- Classification: `Verified defect or mismatch`
- Confidence: `High`
- Evidence:
  - Secret passages are modeled as random good/neutral/bad outcomes and do not advance the turn (`src/client/hooks/useGameStore.ts:439-462`, `src/client/hooks/useGameStore.ts:757-783`, `src/client/pages/GamePage.tsx:1297-1323`).
  - Generated AI scenarios always zero out dramatic events and locked rooms in the shell (`src/services/ai-mystery-setup.ts:57-80`, `src/routes/scenarios.ts:236-242`).
  - The host shell can still unlock rooms and trigger interruptions off timers/thresholds independent of the scheduled mystery (`src/client/hooks/useGameStore.ts:171-203`, `src/client/hooks/useGameStore.ts:464-510`, `src/client/pages/GamePage.tsx:413-518`).
- Counterargument:
  - These may be deliberate house variants until the core AI engine stabilizes.
- Risks / dependencies:
  - Reconnecting event economy to the mystery should be done after shell action identity is restored, or the migration surface gets too wide.
- Expected player impact:
  - The app currently preserves UI for dramatic event systems while generating cases that never exercise them.
- Falsifiable acceptance criteria:
  - Secret passages must become movement affordances, not random loot/penalty rolls; any locked-room or post-turn event surfaced by the shell must come from scenario state or an explicit variant setting.
- What would change my mind:
  - Evidence that these are intentionally marketed and labeled as non-canonical variants in the current UX.

### Finding 12: The deterministic proof stops before final narration

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - `clue-verifier.ts` checks only non-empty text, licensed real card-name mentions, sentence-count warnings, and closing answer naming (`src/services/clue-verifier.ts:1-119`).
  - The verifier comment itself says invented people are caught by prompt plus audit warnings, but no deterministic invented-person audit exists there (`src/services/clue-verifier.ts:8-16`).
  - The render prompt asks the model to preserve exact scope and event truth (`src/data/ai-v3-prompts.ts:119-137`), but nothing deterministically verifies retained scope, chronology, polarity, or coverage.
  - This matches the updated brief's warning (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:185-187`).
- Counterargument:
  - The answer-blind prompt plus repair loop may already be sufficient in practice.
- Risks / dependencies:
  - Strong semantic verification is hard; an evidence capsule may be cheaper and more robust than trying to prove free-form prose entailment.
- Expected player impact:
  - The logical puzzle is proven for the internal `Fact`, not necessarily for the exact sentence the player hears.
- Falsifiable acceptance criteria:
  - Add either:
    - a deterministic evidence capsule rendered alongside narration, or
    - deterministic scope/polarity/chronology checks over a structured narration payload.
- What would change my mind:
  - A substantial audited corpus showing the current prose never drifts in scope or semantics under live generation.

### Finding 13: The pre-generated closing is path-dependent on unread private notes

- Classification: `Verified defect or mismatch`
- Confidence: `High`
- Evidence:
  - `storySeeds` is built from the full 12-reveal schedule, including `note1` and `note2` (`src/services/ai-mystery-engine.ts:198-213`).
  - The closing prompt is built from `storySeeds.map((seed) => seed.brief)` and `schedule.finalCandidates` (`src/services/ai-mystery-engine.ts:259-264`).
  - The prompt labels that full recap as "The evidence that was revealed during play" (`src/data/ai-v3-prompts.ts:195-205`).
  - Runtime note reads are optional, private, and tracked only during play in the shell (`src/client/hooks/useGameStore.ts:512-556`, `src/client/pages/GamePage.tsx:693-723`, `src/client/phone/PhonePlayerPage.tsx:1160-1185`).
  - The closing is generated before play starts, so it cannot know whether either note was ever read (`src/services/ai-mystery-engine.ts:215-276`).
  - The updated brief adds a 500-case public-only measurement showing the ten butler clues leave much broader fields than the all-evidence schedule finals (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:189-191`).
- Counterargument:
  - A player can replay or share notes aloud, so the distinction may not always matter socially at the table.
- Risks / dependencies:
  - If left unchanged, the closing can remain logically correct about the answer while still misstating what was actually player-visible.
- Expected player impact:
  - The closing can cite unread private evidence as if the table definitely saw it, or imply a tighter seen field than the public clue stream actually established.
- Falsifiable acceptance criteria:
  - The generated closing must be path-independent by default: grounded only in public butler facts plus physical-card reasoning.
  - If private notes are referenced, the wording must mark them honestly as Inspector-file confirmation rather than universally revealed table evidence.
  - A test should fail if the closing prompt includes `note1`/`note2` briefs in the public-evidence recap.
- What would change my mind:
  - Evidence that the product intentionally guarantees both notes are always read before reveal. The live shell does not guarantee that.

### Finding 14: Stale docs and legacy code will mislead reviewers unless explicitly quarantined

- Classification: `Verified defect or mismatch`
- Confidence: `High`
- Evidence:
  - `README.md` still documents a story-first V2 pipeline, V2 diagnostics, 8-clue expert difficulty, and polling/no real-time sync (`README.md:82-105`, `README.md:164-229`, `README.md:289-299`, `README.md:570-607`, `README.md:692-719`), while the code uses world-first V3 and WebSockets (`src/services/ai-mystery-engine.ts:1-24`, `src/phone/session-hub.ts:17-111`).
  - `AI_MYSTERY_ENGINE_V2.md` still describes Case Architect / Renderer / Inspector pass / blind audit and references deleted files like `src/services/ai-mystery-validator.ts` (`AI_MYSTERY_ENGINE_V2.md:1-45`).
  - `V2_ELIMINATION_SYSTEM.md` and `V2_INTEGRATION_GUIDE.md` still prescribe V2 behavior and deleted service names (`V2_ELIMINATION_SYSTEM.md:1-240`, `V2_INTEGRATION_GUIDE.md:1-240`).
  - `GAME_REFERENCE.md` still gives the older incomplete wrong-accusation summary (`GAME_REFERENCE.md:155-177`).
  - The active AI route bypasses `campaign-*` for `AI01` and forces expert difficulty (`src/routes/scenarios.ts:30-60`, `src/services/ai-mystery-setup.ts:9-38`).
- Counterargument:
  - Historical docs are useful for design rationale.
- Risks / dependencies:
  - Historical docs are only useful if unmistakably labeled historical and not mixed into the live README/API story.
- Expected player impact:
  - Mostly reviewer / maintainer confusion, but it will contaminate design debate and regressions.
- Falsifiable acceptance criteria:
  - Current runtime docs must describe the actual active route and shell. Historical docs must be clearly fenced as archive/rationale only.
- What would change my mind:
  - Evidence that these docs are already clearly archived and not linked as current guidance. They are still linked and phrased as current in multiple places.

### Finding 14: Test coverage is strong on solver invariants and weak on shell fidelity and macro-shape

- Classification: `Supported design concern`
- Confidence: `High`
- Evidence:
  - Current tests focus on solver invariants, engine blindness/repair, provider behavior, and route compatibility (`src/services/clue-scheduler.test.ts:35-136`, `src/services/ai-mystery-engine.test.ts:90-188`, `src/routes/scenarios.test.ts:7-52`).
  - There are no tests for turn-shell physical fidelity, secret passage semantics, note-job distinctness, cadence authenticity choices, or semantic narration fidelity.
- Counterargument:
  - Those gaps reflect unfinished product decisions rather than missing unit tests.
- Risks / dependencies:
  - Any shell or scheduler diversification work without measurement will regress silently.
- Expected player impact:
  - Future gameplay refactors are more likely to drift from both fairness and physical authenticity.
- Falsifiable acceptance criteria:
  - Add failing tests or instrumentation before major shell/world/scheduler changes.
- What would change my mind:
  - Existing hidden test suites or telemetry not present in the repo.

## Answers To The Required Review Questions

### 1. Which concerns are genuinely important, minor, or false alarms?

- Genuinely important:
  - Occasion family not affecting truth generation.
  - Narrow item/room mechanism mix.
  - Threads not staging across reveals.
  - Scheduler diversity and note-role under-specification.
  - Turn-shell drift from movement/item/event economy.
  - Secret passage and locked-room/event decoupling.
  - Semantic truth boundary ending before final narration.
  - Stale docs / legacy-code confusion.
- Minor or later-stage:
  - Adjacency realism inside coarse time-slot world simulation.
  - Variable clue/note cadence. It is authentic-source evidence, but not phase-one priority.
- False alarms / rejected:
  - Replacing the solver to get variety.
  - Removing exact `0-4` accusation feedback as an information leak.

### 2. What are the root causes of genericity at each layer?

- World layer:
  - Small static catalogs and occasion-agnostic simulation (`src/services/world-sim.ts:114-199`, `src/services/world-sim.ts:204-392`).
- Fact layer:
  - Harvest overwhelmingly emits room-check and item-accounting semantics (`src/services/fact-harvest.ts:331-591` plus local 500-seed counts).
- Schedule layer:
  - Coverage-first greedy optimizes candidate death, not dramatic variety (`src/services/clue-scheduler.ts:461-618`).
- Prose layer:
  - The prompt inherits generic seeds; prose cannot invent mechanism diversity upstream.
- Round layer:
  - The host/phone loop centers "reveal next clue" rather than move-then-one authenticated action.
- Physical/digital loop layer:
  - Missing item-card/event economy means fewer state changes outside clue text.

### 3. What should a single case's dynamic arc look like across ten Butler opportunities and two private-note windows?

- If `10+2` is retained for now:
  - C1-C3: orient the mansion day, establish occasion texture, spread broad time/suspect coverage without localizing the answer.
  - C4-C5: introduce one item-state chain and one innocent thread or room-state tension.
  - N1: give a private cross-category or whole-group clarification that re-weights, but does not collapse, one public interpretation.
  - C6-C7: escalate with a second mechanism family, preferably not just more room/accounting facts.
  - N2: give a sharper private discriminator, ideally resolving or reframing an earlier public thread.
  - C8-C10: converge two axes hard, leave physical cards to settle the rest, and let one late clue retrospectively explain earlier ambiguity.
- If cadence is revisited later:
  - Prefer variable note count over variable butler count; the shell is already tuned around butler progression more than note density.

### 4. How can occasion families alter deterministic truth safely rather than merely reskin prose?

- Use family-specific catalog overlays, not family-specific eliminations.
- Safe hooks:
  - gathering tables,
  - room activity pools,
  - eligible offsite reasons,
  - item display/loan/movement patterns,
  - which thread kinds are favored,
  - which rooms are naturally busy or closed.
- Unsafe hook:
  - any direct "occasion implies suspect X/time Y" rule outside normal world simulation.

### 5. How can items become dynamic without contradicting the fixed answer or physical card economy?

- Add event-driven item states:
  - displayed,
  - loaned with permission,
  - moved for setup,
  - placed at board location for challenge,
  - locked away after event,
  - temporarily handled by staff.
- Keep the answer constraints:
  - the answer item still has one true theft place/time,
  - decoy items must still hold open the item axis,
  - no digital hidden-hand simulation required.
- Shell implication:
  - prefer explicit reminders/acknowledgments for physical item-card actions over fake digital inventory.

### 6. How can innocent threads stage setup, escalation, and payoff without becoming misleading noise?

- Setup:
  - public clue introduces suspicious but incomplete behavior.
- Escalation:
  - later clue or note confirms recurrence, a second witness, or a related object/room.
- Payoff:
  - later public or private clue explains the innocent cause or proves its irrelevance.
- Constraint:
  - every stage must remain true and must not imply false eliminations.

### 7. How should the scheduler diversify mechanisms and converged axes while preserving invariants?

- Short term:
  - add pool caps/floors during selection, not a new solver.
- Good first constraints:
  - max one note kind dominance threshold,
  - require at least one non-item/non-room mechanism before N1,
  - require one of `group_presence`, `gathering`, `departure`, or `discovery` in every case unless impossible,
  - soft target alternative converged-axis pairs.
- Keep hard invariants unchanged:
  - checkpoints,
  - final windows,
  - answer survival,
  - late answer-constraining mentions.

### 8. What distinct jobs should Note 1 and Note 2 perform, and how should private information affect table play?

- Note 1 job:
  - stabilize an early ambiguous public pattern, usually with a social/time cross-category clarification.
- Note 2 job:
  - either resolve an innocent thread, or sharply narrow the second converging axis.
- Private information principle:
  - the reader should gain leverage, not private certainty.
- Closing implication:
  - private-note effects should not be silently promoted into universally seen closing evidence.
- Code gap today:
  - notes are just two generic `noteSuitable` slots with identical rendering instructions (`src/services/clue-scheduler.ts:615-616`, `src/services/clue-scheduler.ts:649-656`, `src/data/ai-v3-prompts.ts:125-131`).

### 9. Which turn-shell behaviors should be restored, retained as variants, or removed?

- Restore to core rules:
  - move-then-one-action loop,
  - explicit action identity,
  - secret passages as movement,
  - wrong-accusation item-card penalty ritual, including inability-to-pay elimination,
  - post-turn event timing,
  - "Look at Item Card / Inspector Challenge" equivalent affordance if the project intends to emulate that part of the official loop.
- Retain as explicit optional variants only if labeled:
  - simplified no-position play,
  - extra timed interruptions,
  - any random secret-passage reward/penalty system.
- Remove from canonical path:
  - random secret passage outcome in place of movement,
  - mystery-independent room unlock timers,
  - mystery-independent forced interruptions mid-loop.

### 10. What minimal experiments and telemetry would falsify the recommendations before a large rewrite?

- Experiment A: scheduler diversity only
  - Change only selection caps/targets.
  - Measure 500-seed fact mix, note mix, converged-axis pair mix, and schedule success.
- Experiment B: occasion overlays only
  - Add family-specific catalogs without changing solver constraints.
  - Measure whether family identity changes fact mix.
- Experiment C: shell ritual restoration only
  - Add move/action/item-card prompts and explicit passage movement without hidden-hand tracking.
  - Blind playtest two groups against current shell.
- Experiment D: deterministic evidence capsule
  - Show a concise write-down summary alongside expressive narration for one internal test branch.
  - Audit whether player note-taking and clue disputes improve.

### 11. What needs new tests or validation?

- Deterministic tests:
  - shell action/state tests for move/action/passage/note/accusation rituals,
  - accusation penalty wording and acknowledgment tests,
  - note-role selection tests,
  - cadence assumptions isolated in one place.
- Instrumentation:
  - 500-seed diversity dashboard committed or scripted,
  - converged-axis distribution assertions,
  - note-kind distribution assertions.
- Validation:
  - deterministic evidence capsule, or
  - structured narration payload with scope/polarity/chronology checks.
  - closing-prompt tests that distinguish public evidence from optional private notes.

### 12. Prioritized roadmap with dependencies, expected player impact, risk, and acceptance criteria

#### Phase 0: Stop reviewer confusion

- Scope:
  - Quarantine stale docs, mark live path clearly, annotate legacy fallback code.
- Dependencies:
  - None.
- Expected player impact:
  - None directly; large review quality gain.
- Risk:
  - Low.
- Acceptance criteria:
  - Current docs describe world-first V3 and the actual host/phone shell, while V2 docs are explicitly historical.

#### Phase 1: Restore physical-loop rituals without digitizing hidden hands

- Scope:
  - Move-then-one-action shell, explicit action names, secret passages as movement, item-card penalty wording/acknowledgment, post-turn event timing.
- Dependencies:
  - Phase 0 terminology cleanup.
- Expected player impact:
  - High. This is the fastest path to more organic rounds.
- Risk:
  - Medium, because host/phone UX changes.
- Acceptance criteria:
  - No random secret-passage roll in canonical mode.
  - Wrong accusation flow explicitly says "one item card per wrong category."
  - Suggest / note / accuse / summon / inspect are distinct actions in the shell.

#### Phase 2: Diversify scheduler outputs without changing solver proof

- Scope:
  - Add lightweight diversity caps/floors and note-role heuristics.
- Dependencies:
  - Instrumentation committed.
- Expected player impact:
  - Medium-high across repeated games.
- Risk:
  - Medium; could reduce schedule yield if over-tightened.
- Acceptance criteria:
  - 500-seed sweep meets current fairness invariants and improved diversity thresholds.

#### Phase 3: Occasion-aware world overlays and richer item states

- Scope:
  - Family-specific catalog overlays, event-driven item states, controlled room/event hooks.
- Dependencies:
  - Phase 2 telemetry.
- Expected player impact:
  - High narrative/mechanism variety.
- Risk:
  - Medium-high; this is where world complexity grows.
- Acceptance criteria:
  - Occasion families measurably alter fact topology without degrading schedule success.

#### Phase 4: Thread arcs and evidence-truth boundary

- Scope:
  - Multi-reveal innocent threads, deterministic evidence capsule or structured semantic verification, and a path-independent closing.
- Dependencies:
  - Stable world overlays and scheduler diversity metrics.
- Expected player impact:
  - Medium-high; improves perceived coherence and trust in clues.
- Risk:
  - Medium.
- Acceptance criteria:
  - Audited cases show thread payoff across reveals, no narration/fact disputes in playtests, and closings that never cite optional unread notes as universally revealed evidence.

#### Phase 5: Revisit cadence only after the above

- Scope:
  - Evaluate whether `10+2` remains the right project choice versus a more source-authentic variable note count.
- Dependencies:
  - Stable shell and diversity metrics.
- Expected player impact:
  - Unclear; this is lower-priority tuning, not a proven root cause fix.
- Risk:
  - Medium-high because cadence touches scheduler, prompts, shell unlocks, and pacing assumptions.
- Acceptance criteria:
  - Any cadence change must beat the current branch in blind playtests and re-prove fairness metrics.

## Stale Docs And Legacy Code Most Likely To Mislead Reviewers

- `README.md:82-105`, `README.md:164-229`, `README.md:570-607`, `README.md:692-719`
  - Mixes current V3 statements with stale V2 pipeline, stale difficulty assumptions, and stale sync status.
- `AI_MYSTERY_ENGINE_V2.md:1-45`
  - Describes deleted/stale architecture and deleted files as active.
- `V2_ELIMINATION_SYSTEM.md:1-240`
  - Encourages structured elimination attachment that the live AI path intentionally strips from public clues.
- `V2_INTEGRATION_GUIDE.md:1-240`
  - References nonexistent service names and OpenAI-based V2 flow.
- `GAME_REFERENCE.md:153-177`
  - Still incomplete on the authenticated accusation rule and broader physical loop.
- `src/services/scenario-generator.ts:1-97` and the `campaign-*` stack
  - Real code, but not the active AI route for `AI01`; it is a fallback/legacy path and should not be mistaken for current mystery-engine behavior.

## Final Recommendation

Do not spend the next cycle rewriting the V3 logic core. Spend it restoring the authentic round/event/item loop in a lightweight way, adding diversity metrics around the existing scheduler, and tightening the truth boundary between harvested facts and player-facing narration. That path is incremental, falsifiable, and much less likely to destroy the one part of the system that is already demonstrably working: deterministic fair-play proof over the full 12,100-cell space.
