# Clue DVD Gameplay Research Brief

Status: evidence packet for independent and adversarial review. This is not a conclusion document.

## Mission

Find real, project-specific ways to make repeated games, individual rounds, turn choices, clues, and Inspector-note cycles feel more organic and dynamic without weakening:

- fidelity to the physical 2006 Clue DVD Game components;
- truthfulness of every player-facing fact;
- answer safety and non-telegraphing;
- deterministic fair-play guarantees;
- the role of physical cards in completing the deduction;
- playability at the table.

Do not invent defects. Distinguish verified behavior, a supported inference, and a speculative design option. Prefer small reversible experiments over wholesale replacement.

## What the project is

The app replaces the DVD game master. Players still use the physical board, 42 cards, pawns, red magnifying glass, Case File envelope, Butler's Pantry, and Evidence Room. A case asks WHO stole WHAT, from WHERE, and WHEN: 10 suspects x 11 items x 11 locations x 10 times = 12,100 answer cells.

The verified physical loop in `GAME_REFERENCE.md` is:

- set aside one solution card from each category;
- keep item cards in the Butler's Pantry and deal them during play;
- deal other non-solution cards to players, with leftovers public in the Evidence Room;
- on a turn, make a three-of-four-category suggestion, summon Ashe for a public clue plus a private item card, read a private Inspector note, or accuse from the Evidence Room with all four categories;
- Inspector Brown reports how many of the four accusation choices are correct; for every wrong choice, the accuser turns one item card face-up into the Evidence Room and continues if they can pay the penalty.

## Current V3 mystery engine

The active engine is world-first and intentionally separates logic from prose:

1. `world-sim.ts` deterministically simulates a day.
2. `fact-harvest.ts` turns the world into true facts with formal joint-cell semantics.
3. `clue-scheduler.ts` picks and orders ten Butler clues and two private notes over the 12,100-cell joint grid.
4. An answer-blind AI creates the occasion dossier.
5. An answer-blind AI renders the opening, testimonies, and notes from licensed facts, with original-case few-shots.
6. Only the closing sees the answer.
7. Deterministic verification and targeted repairs enforce card-name discipline.

This architecture was adopted after multiple documented failures: template prose felt mechanical; letting the model be both novelist and logician caused contradictions; showing the writer the solution caused telegraphing; and large LLM-authored world schemas were brittle. Preserve the separation unless evidence demonstrates a safe alternative.

### Fair-play invariants

The scheduler guarantees:

- after Butler clue 5 plus Note 1, every projected category has at least four live candidates;
- after Butler clue 7 plus Note 2, every projected category has at least three;
- at the end: suspects 3-6, items 2-5, locations 2-6, times 1-4, with at least two of item/location/time at three or fewer;
- the answer cell remains alive;
- constraining answer mentions appear only from reveal position 7;
- the prose renderer never sees the answer, survivor counts, or elimination targets.

Candidate counts are marginal projections from a joint grid. They do not say that every cross-product combination of the projected candidates remains possible.

## Prior improvement intent already in the repository

The active and historical explainers consistently identify these lessons:

- clues should be concrete anecdotes, not deduction instructions;
- ordinary arrivals, repairs, meals, gifts, shared activities, object histories, and remarks should carry evidence;
- mechanism mix matters: movement, objects, social incidents, and time anchors should not collapse into one template;
- a clue may be useful without mentioning the answer;
- the household should feel like a coherent day, while the player performs the deduction;
- answer-aware wording was a primary cause of telegraphing in V1/V2;
- Inspector notes previously lacked variety;
- Butler summons are tied to the finite physical item-card supply.

Read `AI_ENGINE.md`, `AI_ENGINE_V3_PLAN.md`, `AI_REDESIGN_COMPARISON.md`, `PROMPT_REDESIGN_NOTES.md`, `TOPROMPT.md`, `GAME_REFERENCE.md`, and `README.md`, but treat documents explicitly marked historical as lessons rather than current behavior.

## Measured deterministic behavior

Commands used:

```text
npx -y tsx scripts/eval-mysteries.ts 500
```

and a read-only 500-case instrumentation pass over the selected fact kinds and final axes.

### Reliability

- 500/500 seeds produced a valid schedule.
- 402 succeeded on the first simulated world; 71 on the second; the worst observed required 16 worlds.

This is strong evidence that the formal scheduler is reliable. Do not recommend replacing it merely to add narrative variety.

### End-state distribution

Across 500 cases:

| Axis | Final-count distribution |
| --- | --- |
| suspects | 3: 30; 4: 58; 5: 160; 6: 252 |
| items | 2: 177; 3: 302; 5: 21 |
| locations | 2: 6; 3: 17; 4: 31; 5: 161; 6: 285 |
| times | 1: 289; 2: 139; 3: 70; 4: 2 |

The converged-axis pair was item + time in 477/500 cases, location + time in 21, and item + location in 2. This is a verified macro-pattern: cases almost always ask public evidence to resolve the same two dimensions, with time fully solved in 57.8% of cases, while suspects and locations usually remain broad for physical cards.

### Scheduled mechanism mix

There were 6,000 scheduled reveals:

| Fact kind | Count | Share |
| --- | ---: | ---: |
| item intact/accounted for | 2,035 | 33.9% |
| room undisturbed | 1,114 | 18.6% |
| group presence | 918 | 15.3% |
| discovery time | 428 | 7.1% |
| gathering | 385 | 6.4% |
| object history | 326 | 5.4% |
| innocent-thread color | 291 | 4.9% |
| item offsite | 179 | 3.0% |
| personal remark | 95 | 1.6% |
| departure | 51 | 0.9% |
| guests arrived | 49 | 0.8% |
| items secured | 45 | 0.8% |
| item home | 43 | 0.7% |
| room closed | 40 | 0.7% |
| solo presence | 1 | <0.1% |

Item-accounting plus room-undisturbed facts are 52.5% of all scheduled reveals. Primary axes were item 38.4%, location 19.2%, suspect 16.2%, time 14.4%, and pure color 11.9%.

Per case, pure-color facts occurred zero times in 74 cases, once in 227, twice in 125, three times in 61, and four times in 13.

### Inspector-note mix

Among 1,000 scheduled notes:

- room undisturbed: 457 (45.7%);
- item intact: 242 (24.2%);
- group presence: 132 (13.2%);
- gathering: 82 (8.2%);
- all other kinds combined: 87 (8.7%).

Thus 69.9% of private notes use only room-check or item-accounting semantics. This supports the user's concern about generic notes.

### The original corpus has a different cadence

`src/data/original-mysteries.ts` contains eight Butler testimonies in every one of the ten transcribed cases, while Inspector-note counts vary by case: 3, 1, 3, 1, 3, 4, 6, 3, 3, and 5. V3 standardized this to ten testimonies plus two notes. That does not make V3 mathematically wrong, but it is evidence that fixed 10+2 cadence is a project decision rather than an authenticity requirement, and that variable private-note texture existed in the source cases.

## Verified structural observations

### Occasion and simulated day are mostly disconnected

`occasionFamily` is selected from fourteen families and stored in `WorldState`, but the world simulator does not use it to choose gatherings, room activities, threads, item interactions, or movements. It reaches the AI dossier prompt after the schedule is already fixed. Consequently, a recital, tournament, horticultural exhibition, engagement celebration, and scholarly demonstration can share the same underlying day and evidence topology, with only prose dressing changing.

### Small generic catalogs drive the world

The simulator draws from:

- a fixed per-time gathering table;
- three activities per room;
- five solo activities;
- four errand causes;
- three quarrel causes;
- two surprise causes;
- six generic object histories.

Those are coherent and safe but narrow for an unlimited-case promise. The answer location is also reserved for the thief at the theft time, and the answer item is fixed to that location as its home/display location. Items are otherwise largely passive inventory states rather than actors in a lifecycle of display, handling, loan, movement, storage, disappearance, and discovery.

### Innocent threads do not form multi-reveal arcs

Two or three innocent threads are simulated and explicitly exclude the answer suspect. Harvested `thread_color` facts are mention-only and their briefs often disclose the innocent explanation in the same reveal. The scheduler has no thread-stage, setup/payoff, unresolved-tension, or spacing constraint. This creates color, but not an evolving subplot across rounds.

### Movement authenticity claim exceeds implementation

`AI_ENGINE_V3_PLAN.md` says movements obey board adjacency and secret passages. `buildMovementGrid` assigns social groups among rooms without checking adjacency or passage edges. This is a documentation/implementation mismatch. Determine whether adjacency is actually needed for a narrated day (where time slots may cover long intervals) before labeling it a gameplay defect.

### Scheduler optimizes deduction coverage, not experiential shape

Selection is coverage-first and reliably hits mathematical windows. Ordering enforces checkpoints and prefers gentle facts early/heavy facts late. The soft score penalizes adjacent repeated primary axes and uneven suspect mentions, but it is reported rather than used to select the best of multiple schedules. There are no hard or optimized targets for:

- fact-kind diversity;
- Inspector-note semantic identity;
- recurrence and payoff of a thread;
- occasion relevance;
- alternation among observation sources;
- reveal-level surprise or reinterpretation;
- which two dimensions converge in a case;
- a per-case dramatic/evidentiary shape.

### Prose verification does not prove semantic faithfulness

The renderer prompt requires exact scope, but `clue-verifier.ts` deterministically checks only non-empty text, licensed real card-name mentions, and loose sentence-count warnings. It does not verify that the narration retained every required person/item/time, preserved polarity and chronology, or avoided inventing a non-card person or event. The code comment says invented people are caught by prompt plus audit warnings, but no such deterministic audit exists in that verifier. Therefore the formal puzzle is proven only for the scheduled `Fact`, not necessarily for the final paraphrase a player hears. The official rulebook says the DVD displayed what players should write down while Ashe spoke; a separate deterministic evidence capsule could restore that truth boundary while allowing freer narration.

### The pre-generated closing assumes optional private notes were revealed

`ai-mystery-engine.ts` builds the closing from every `storySeed` (including N1/N2) and from `schedule.finalCandidates` after both note facts have been applied. The closing prompt calls these “evidence that was revealed during play.” Runtime note reads are optional and private, and the closing is generated before the game knows whether anyone read either note. A 500-case measurement applying only the ten public Butler facts left mean projected counts of 7.83 suspects, 4.16 items, 7.75 locations, and 3.72 times—much broader than the schedule's all-evidence final field. This does not break the answer, but the closing can cite an unread note or overstate how far the table's actually seen evidence narrowed the field. A path-independent closing should rely on public facts plus the physical cards, or clearly describe unread material as Inspector-file confirmation rather than player-used evidence.

Two smaller check/document gaps were also verified: `verifyClosing` uses a plain lowercase substring test, so an answer time of `Night` can be falsely satisfied by `Midnight` or “tonight”; and the header comment in `clue-scheduler.ts` still advertises tighter final windows than the implemented `FINAL_TARGET`. These are not genericity root causes, but they should be fixed during truth-boundary/document cleanup.

### Current host/phone turn shell has drifted from the official physical loop

The official Hasbro rulebook was located after the initial repository pass: [CLUE DVD Game instructions](https://instructions.hasbro.com/en-us/instruction/clue-dvd-game) (the page links Hasbro's scanned 10-page PDF). It corrects an incomplete summary in `GAME_REFERENCE.md` and adds important context:

- every turn is movement to an adjacent location, then exactly one action;
- actions are Suggest, Summon the Butler, Look at an Item Card, Read an Inspector's Note, or Accuse;
- summons are prohibited in the Evidence Room and add the top Butler's Pantry item card privately to the summoner's hand;
- DVD events can move facedown item cards from the Pantry to board locations, where a player may attempt an Inspector's Challenge to inspect one without taking it;
- notes become available over time, remain private, and can be revisited;
- entering the Evidence Room requires an accusation;
- the exact 0-4 correct count after an accusation is authentic;
- each wrong accusation category costs one item card turned face-up into the Evidence Room; inability to pay eliminates the player;
- secret passages are board movement edges, sometimes locked; they do not produce random reward/penalty outcomes;
- DVD events are handled after the current turn, never in its middle.

Verified current behavior:

- the turn action is called `Reveal Clue`; it reveals the next Butler clue and advances the turn;
- it does not track or instruct the private draw of an item card from the Butler's Pantry;
- `Suggestion` only asks the table to resolve it and ends the turn; the app does not structure or log the required three-of-four categories;
- Inspector notes unlock from Butler-clue progress (Note 1 at 50%, Note 2 at 65%), are private per player, and cost a turn the first time each player reads one;
- secret passage outcomes are random 20% good / 60% neutral / 20% bad and are not tied to the simulated mystery; this is an invented variant rather than the rulebook's movement behavior, and using one does not itself advance the turn;
- a wrong accusation returns the authentic exact number of correct answer categories (0-4) and advances the turn. The host accusation dialog does instruct “Turn in N cards ... to the Evidence Room,” but it says generic cards rather than item cards, the phone feedback omits that ritual, and game state does not record the payment or eliminate a player who cannot pay;
- generated AI scenarios currently have no locked rooms or dramatic events, although the host shell retains UI and state for both;
- timed Inspector interruptions begin at 60 minutes and make players turn physical cards face-up, independent of the mystery's clue schedule.

The exact-correct-category count should not be removed as a supposed leak: it is authentic. The penalty is partially represented but underspecified and unenforced. Likewise, do not add item-card tracking that assumes the app knows physical hands; a corrected item-card ritual/reminder, explicit acknowledgement, and “could not pay” control may be safer. The largest lost source of round dynamism may be the original event economy—option unlocks, doors/passages, facedown item placement, challenges, and post-turn interruptions—not simply the prose.

## Important cautions for reviewers

- The renderer being generic may be a downstream symptom of generic selected semantics. Prompt-only fixes cannot create event diversity absent from the world/facts.
- More randomness is not automatically more organic. Random events must remain legible, truthful, fair, and compatible with physical state.
- More clues are not automatically better. The Butler's Pantry has a finite item-card economy.
- Do not reintroduce answer-aware clue writing.
- Do not turn all color into mechanical elimination; some texture is valuable precisely because it is not a solver instruction.
- Do not make the public clues solve all four axes; physical cards must matter.
- Avoid forcing adjacency if time slots represent enough elapsed time for plausible movement.
- Do not assume older V1/V2 types and services are active. Trace the current route before drawing conclusions.

## Questions each independent reviewer must answer

1. Which concerns above are genuinely important, which are minor, and which are false alarms?
2. What are the root causes of genericity at the world, fact, schedule, prose, round, and physical/digital-loop layers?
3. What should a single case's dynamic arc look like across ten Butler opportunities and two private-note windows?
4. How can occasion families alter deterministic truth safely rather than merely reskin prose?
5. How can items become dynamic without contradicting the fixed answer or physical card economy?
6. How can innocent threads stage setup, escalation, and payoff across reveals without becoming misleading noise?
7. How should the scheduler diversify mechanisms and converged axes while preserving all current invariants?
8. What distinct jobs should Note 1 and Note 2 perform, and how should private information affect table play?
9. Which turn-shell behaviors should be restored to physical rules, retained as explicit variants, or removed?
10. What minimal experiments and telemetry would falsify the recommendations before a large rewrite?
11. What needs new tests or validation to preserve truthfulness?
12. Give a prioritized roadmap with dependencies, expected player impact, risk, and acceptance criteria.

## Required report discipline

For every finding, cite repository paths and, when practical, line numbers. Label it:

- Verified defect or mismatch
- Supported design concern
- Optional experiment
- Rejected/non-issue

Also assign confidence and explain what evidence would change the conclusion. Do not edit product code.
