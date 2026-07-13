# Sol Reconciliation: Architecture Adjudication

Date: 2026-07-13  
Authority: final `GAMEPLAY_RESEARCH_BRIEF.md`, OCR-checked official-rule corrections, active code, then external design evidence. Historical documents and panel reports are advisory.  
Scope: architecture adjudication only; no product-code changes.

## Decisive ruling

The panel agrees on the foundation and is right to do so: preserve deterministic world/fact truth, the 12,100-cell proof, answer-blind clue narration, and a finish that still requires physical cards. The implementation should evolve through four separate contracts—truth, schedule selection, physical play, and post-turn events—rather than one “dynamic mystery” rewrite.

The panel is less reliable on sequencing and claimed safety. Several proposals treat plausible targets as proven requirements, conflate the narrated historical day with live board state, or call physical events truth-neutral even though they change information and the finite Pantry. Those claims are modified or rejected below.

## Binding facts

- The existing solver is reliable: 500/500 schedules, with hard checkpoints, final windows, and answer survival (`docs/research/GAMEPLAY_RESEARCH_BRIEF.md:44-55,82-100`; `src/services/clue-scheduler.ts:362-451`). Replacing it is unauthorized.
- Exact 0–4 accusation feedback is authentic. The defect is partial payment handling: generic host copy, no phone ritual, no acknowledgement, and no inability-to-pay elimination (`GAMEPLAY_RESEARCH_BRIEF.md:195-221`; `src/client/components/AccusationPanel.tsx:254-265`; `src/client/hooks/useGameStore.ts:622-685`).
- A turn is move, then one action, then any queued event. Passages are movement; Butler summons draw a Pantry item; events can place Pantry cards; Challenge/Look is a real action (`GAMEPLAY_RESEARCH_BRIEF.md:197-208`; `EXTERNAL_DESIGN_EVIDENCE.md:9-25`).
- Every transcribed original has eight Butler testimonies; notes vary 1–6. That makes 10+2 a project format, not a rules requirement (`GAMEPLAY_RESEARCH_BRIEF.md:140-142`).
- The prose verifier proves card-name discipline, not entailment, scope, polarity, chronology, quantity, or invented-person absence (`GAMEPLAY_RESEARCH_BRIEF.md:185-187`; `src/services/clue-verifier.ts:65-120`).
- The closing is generated from all twelve facts and the post-note field before optional note reads occur (`GAMEPLAY_RESEARCH_BRIEF.md:189-193`; `src/services/ai-mystery-engine.ts:252-323`; `src/data/ai-v3-prompts.ts:176-205`).

## Adjudication register

### A1 — Preserve the V3 proof spine: ACCEPT

Keep `Answer -> WorldState -> Fact -> joint-grid schedule`. Reliability does not prove experience quality, but it does prove that replacement is the wrong variety intervention. This is the strongest consensus across all four reports (`CODEX54_IMPLEMENTATION_REVIEW.md:31-49`; `FABLE_PRIMARY_REVIEW.md:28-39`; `SOL_PRIMARY_PLAN.md:57-72`; `TERRA_OPUS_ADVERSARIAL_REVIEW.md:31-56`).

Acceptance: every candidate schedule, not merely the selected one, preserves answer survival, both checkpoints, final windows, and late-answer rules over a fixed regression corpus plus a nightly large-seed sweep. No aesthetic score may compensate for a failed invariant.

### A2 — Deterministic evidence capsule: ACCEPT WITH MODIFICATION

Adopt a canonical `FactClaim`/evidence capsule shown when narration plays and retained in the log. It must be formatted from structured Fact fields, not copied from `writerBrief`; writer briefs currently mix truth with author instructions and fused innocent explanations (`src/services/fact-harvest.ts:629-658`). Narration stays answer-blind and expressive.

Do not claim heuristic prose checks prove entailment. They may trigger warnings or obvious-conflict fallback, but the capsule is the authoritative deduction channel. This is stronger and simpler than the panel's occasional “fail-closed semantic verifier” language (`SOL_PRIMARY_PLAN.md:592-604`; `TERRA_OPUS_ADVERSARIAL_REVIEW.md:547-568`).

Acceptance: mutation tests covering entity omission, subset/all scope, negation, before/after, quantity, and invented witnesses cannot alter the capsule. The render prompt and repair feedback contain no answer, survivor counts, kill lists, or convergence target. In usability tests, players can identify the capsule—not narration—as the fact to record.

### A3 — Closing honesty: ACCEPT WITH MODIFICATION

Exclude N1/N2 and the post-note candidate field from the default pre-generated closing. However, “Butler facts only” is not automatically “seen evidence”: a correct accusation can end play before all ten summons (`src/client/hooks/useGameStore.ts:641-685`). Therefore the closing must be a post-solve reconstruction from the **complete public case record**, never a claim that every cited fact was heard.

If a candidate field is stated, it must be replayed from Butler facts only and labeled as what the complete Butler record leaves open. Otherwise omit the field and credit physical cards and deductions. An optional note coda may say the Inspector file later confirmed a fact; it must not imply that a player read or shared it.

Acceptance: identical default closing contract across reveal counts 0–10 and note states none/N1/N2/both; zero phrases asserting unseen evidence was “revealed during play”; zero private-reader identity; deterministic no-network fallback for any future runtime-specific closing.

### A4 — Occasion-aware world architecture: MODIFY

Accept an answer-independent deterministic case frame, but do not authorize the full six-archetype taxonomy or `beatGrammar` platform yet (`SOL_PRIMARY_PLAN.md:374-389`). First add one typed catalog profile that changes gatherings, room roles, item-use opportunities, and thread eligibility. The dossier must describe only events the frame actually generated.

The observed disconnect is verified (`world-sim.ts` stores but does not use `occasionFamily`: `src/services/world-sim.ts:82-108,204-392`); the number and shape of future archetypes are not.

Acceptance: paired seeds with the same answer/profile are deterministic; changing profile materially changes at least two predeclared topology measures without worsening fairness success outside the baseline confidence interval. Blind topology identification is supporting evidence, not a hard correctness gate.

### A5 — Narrative item lifecycles: MODIFY

Separate named narrative items from opaque physical item-card circulation. Add interval-scoped display, handling, move, loan, secure, last-seen, and discovery events one FactKind at a time. The answer item need not remain immobile all day: truthful pre-theft handling or movement is safe if the theft location/time remains consistent. Terra's “cannot move and must stay” rule is manufactured (`TERRA_OPUS_ADVERSARIAL_REVIEW.md:360-380`).

Likewise, decoys need not be immortal individually; the invariant is adequate remaining item ambiguity, not “no lifecycle fact ever kills a decoy.” Current decoys are an implementation device (`src/services/world-sim.ts:315-338`; `src/services/fact-harvest.ts:331-337`).

Acceptance: exhaustive interval-boundary truth tables; answer cell alive; final item window preserved; no lifecycle prose claims unmodeled continuity; each new kind ships independently behind an evaluation flag.

### A6 — Staged innocent threads: MODIFY

Allow one optional, atomically scheduled setup/payoff bundle before considering escalation. A zero-kill Fact is not harmless to humans: players infer from narrative relevance. Terra's claim that mention-only staging costs “no deductive ground” confuses solver semantics with player cognition (`TERRA_OPUS_ADVERSARIAL_REVIEW.md:397-403`).

The payoff explains only the local anomaly; it is not an alibi unless a separate formal fact proves one. Reject Fable's suggestion to clear a thread suspect merely because current generation excludes the thief (`FABLE_PRIMARY_REVIEW.md:180-181`). Permit the answer suspect in unrelated benign threads when safety checks show the payoff does not cover the theft gap; universal exclusion is a learnable negative-space tell (`src/services/world-sim.ts:632-689`).

Acceptance: setup and payoff are selected or omitted together, correctly ordered and spaced; capsule wording contains no guilt claim; payoff does not kill cells unless backed by an independent Fact; blind players remember the arc without treating it as proof.

### A7 — Best-of-K schedule selection: ACCEPT AS A PROTOTYPE, MODIFY FOR SHIPMENT

Selecting among already valid schedules is the right low-risk experiment (`src/services/clue-scheduler.ts:380-430,730-758`). Do not hard-code K=20, a 100 ms ceiling, or panel percentages before measuring candidate variance. The reported ~26 ms is a full measured generation path, not proof that production cost is exactly K×26.

Selection must remain seed-deterministic. Reject session-history penalties unless recent-case context is explicit, versioned input; hidden mutable history would break reproducibility. Use a seed-derived target cell if convergence-pair steering is later justified.

Acceptance: K=1 versus several K values on identical seeds; all candidates independently valid; deterministic repeat result; measured gain in preregistered portfolio metrics; bounded p95 latency and memory set from the reference deployment, not a laptop median.

### A8 — Hard diversity quotas and converged-axis weights: REJECT FOR NOW

Targets such as no kind >25/30/35%, item+time <70/80%, 55/25/20 pair weights, or 70–80% staged arcs are panel hypotheses, not evidence-backed player requirements (`CODEX54_IMPLEMENTATION_REVIEW.md:128-132`; `FABLE_PRIMARY_REVIEW.md:183-184,229-243`; `SOL_PRIMARY_PLAN.md:140,174`; `TERRA_OPUS_ADVERSARIAL_REVIEW.md:427-430`). Current supply may make them infeasible or encourage cosmetic entropy.

Measure mechanism/source/run-length and physical-card usefulness, then use soft objectives. Harden only a rule whose violation predicts worse blind play and whose feasibility is demonstrated across answer strata.

Acceptance: a proposed hard quota needs a documented player-facing harm, seed-sweep feasibility, and an ablation showing the quota—not unrelated new facts—causes improvement.

### A9 — Note roles and evidence views: MODIFY

Accept N1 as a lens/cross-index and N2 as a late discriminator/reconciliation. Replace `KnowledgeView` with `EvidenceView`: public, public+N1, public+N2, combined. The app cannot know actual knowledge because physical hands, suggestions, voluntary sharing, and missed clues remain outside the solver.

Evaluate each note against the public prefix available at its unlock, not only the all-twelve combined trajectory. A note may reduce joint cells without killing a marginal category; that can still be useful. Do not impose Fable's speculative public-only maxima (≤8/5/8/4) until note-read paths and endgame friction are measured (`FABLE_PRIMARY_REVIEW.md:186-190,229-231`). Broad public evidence is not itself unfair because physical hands and suggestions are intentionally load-bearing.

Acceptance: N1/N2 have distinct declared roles in the chosen schedule; each has positive joint-cell effect at its unlock prefix; neither breaches early minima; no single-note view becomes an answer key; actual note-read timing and solve outcomes are measured without recording note text.

### A10 — Move/one-action state machine: ACCEPT WITH A PUBLIC-STATE DECISION

Implement `Move -> Action -> ActionResolution -> PostTurnEvent -> TurnEnd`. A mere “moved” checkbox cannot enforce Evidence Room restrictions, secret-passage endpoints, or location-bound Challenges. Either track public pawn locations (safe: they are visible on the board) or require location confirmation at the affected action. Do not track card identities.

Entering the Evidence Room forces Accuse; Summon is unavailable there; passage movement uses configured unlocked edges; Suggest records exactly three distinct categories without adjudicating physical responses (`GAMEPLAY_RESEARCH_BRIEF.md:199-208`; current missing state at `src/client/hooks/useGameStore.ts:34-103`).

Acceptance: transition-table tests reject action-before-move, second action, illegal passage, Summon in Evidence Room, Challenge in the wrong location, and mid-resolution events. Host and phone must agree after reconnect.

### A11 — Minimal authentic rituals: ACCEPT

Rename Reveal Clue to Summon the Butler; prompt and acknowledge the private top-Pantry draw; structure Suggest; retain private notes and authentic 0–4; complete wrong-accusation copy/payment/elimination; remove the 20/60/20 passage roll from canonical mode (`src/client/hooks/useGameStore.ts:396-462,622-685,757-782`).

Fable also found a real host/phone note-revisit divergence: the phone-mediated host path ends the turn unconditionally after `readInspectorNote`, even when the store returned an already-read note (`src/client/pages/GamePage.tsx:296-308`), while local host revisit is free (`src/client/pages/GamePage.tsx:693-720`). Accept that parity fix.

Acceptance: end-to-end scripted play covers summon/draw, three-category suggestion, free revisit, wrong-count item payment, unable-to-pay removal from turn rotation, and correct passage movement, all without entering a physical card identity.

### A12 — Count-only physical ledger: ACCEPT WITH LIMITS

Track acknowledged counts and public locations, not identities: Pantry, facedown board placements, per-player held-item count if needed for payment, and face-up Evidence Room count. Label this a synchronization aid, not authoritative knowledge of physical reality.

Use a reachability state graph, not one static `PhysicalCardBudget`: player choices change summons, placements, payments, eliminations, and inspections. The conservation equation is necessary but insufficient.

Acceptance: every modeled transition conserves the ten non-solution item cards; impossible or missed acknowledgements produce a recoverable reconciliation flow; no API, telemetry, or persisted state names a held/placed physical item.

### A13 — Authentic event economy: MODIFY AND DEFER

Events are not “truth-neutral by construction,” contrary to Fable (`FABLE_PRIMARY_REVIEW.md:245-247`). Even without asserting historical facts, placements change access, information, Pantry supply, and future Butler availability. Full event work requires the exact event/Challenge transcription, the turn state machine, the count ledger, and reachability validation.

Do not wire `world.roomClosure` directly to live locked-room UI. It is a historical room condition with time-slot evidence semantics (`src/services/world-sim.ts:64-68,340-352`; `src/services/fact-harvest.ts:470-488`), not a post-turn board event. Fable and Terra conflate these domains (`FABLE_PRIMARY_REVIEW.md:53-58,133-137`; `TERRA_OPUS_ADVERSARIAL_REVIEW.md:486-498,628-640`). Author a separate `ScenarioEventPlan`; it may share a room-role tag only if no answer/trajectory signal leaks.

Acceptance: every event occurs after a completed action; every branch is reachable and conserves cards; placement never strands a required Summon; Challenge changes inspection only as the rulebook specifies; event timing and content do not depend on hidden answer categories.

### A14 — Event economy and cadence: COUPLE THE DECISIONS

Ten non-solution item cards support ten summons only if none are removed from the Pantry first. Authentic placements consume that same Pantry. Therefore full events cannot be added independently while promising ten available Butler opportunities. Fable and Terra schedule event restoration without resolving this budget conflict; Sol identifies it but defers the consequence (`SOL_PRIMARY_PLAN.md:406-410,639-647`).

Keep 10+2 for the no-placement control. Evaluate 8/variable or another reachable delivery plan only with the event state graph. Original 8/variable cadence is supporting precedent, not an automatic target.

Acceptance: enumerate all authorized action/event paths; every scheduled public fact has a reachable delivery opportunity; no negative Pantry; every cadence variant re-proves checkpoints/final windows and beats the control on physical relevance without more early solves or abandonment.

### A15 — Historical-day adjacency: REJECT; live adjacency: ACCEPT

Correct the stale plan claim, but do not constrain coarse historical slots to board edges (`AI_ENGINE_V3_PLAN.md:68-77`; `src/services/world-sim.ts:399-564`). Apply adjacency, locks, and passages to live pawn movement only. Immediate-transit prose, if later introduced, needs its own duration validation.

Acceptance: docs distinguish the two clocks; live movement tests use the board graph; world-sim reliability and diversity are not reduced by an irrelevant adjacency rule.

### A16 — Answer-shaped negative space: ACCEPT AS AN AUDIT, NOT A FIX

The global answer-room/thread exclusions are real (`src/services/world-sim.ts:399-410,632-689`), but player exploitation is unmeasured. Reject classifier “chance + 5 points” and mandatory two-shadow targets as overconfident (`SOL_PRIMARY_PLAN.md:108-123`). First measure answer-room mentions, answer-entity lifecycle participation, and a preregistered adversarial heuristic against shuffled labels.

Acceptance: change exclusions only if held-out structural features predict answer categories above the preregistered null; the proposed relaxation must reduce that signal without weakening answer survival or prose truth.

### A17 — Telemetry and rollout: MODIFY

Collect aggregate mechanism, view, action, card-count, latency, fallback, abandonment, and physical-relevance measures. Do not send solution IDs, private text, card identities, raw debug, or a plain/reversible seed hash. A seed deterministically reconstructs the answer; use no per-case seed identifier in production unless a keyed, access-controlled scheme has a documented retention need (`SOL_PRIMARY_PLAN.md:511-526`).

Reject arbitrary 5%/25% rollout and two-table success as proof. Use feature flags, branch-complete scripted tests, repeated-game crossover playtests, preregistered stop conditions, and rollback.

Acceptance: privacy review demonstrates no answer reconstruction from telemetry; each rollout cohort exercises every altered rule branch; rollback works; reported experience gains include uncertainty, not only means.

## Factual and reasoning corrections to the panel

- `CODEX54_IMPLEMENTATION_REVIEW.md` contains two “Finding 14” headings (`:301-338`); editorial only, but evidence of assembly rather than taxonomy.
- Fable's “spam-accusing is a dominant strategy” is plausible but unproven (`FABLE_PRIMARY_REVIEW.md:53-56`). Classify it as an exploit risk until simulated/mastermind and table data establish dominance.
- Fable/Terra's direct historical-closure-to-live-lock wiring is rejected; the objects live on different clocks and carry different semantics.
- Fable's “events manipulate cards/access, never facts, so truthfulness is untouched” is incomplete: narrative truth may be untouched, but fair delivery and physical information are not.
- Terra's “answer item cannot move” and “lifecycle facts never kill a decoy” are implementation habits, not invariants.
- Terra's mention-only safety argument ignores human inference; zero joint-grid kills does not make narrative suspicion free.
- The public-only 7.83/4.16/7.75/3.72 means prove a closing mismatch, not that the endgame is “flabby”: actual players also hold cards, suggest, share, and receive 0–4 feedback.
- Semantic drift is a verified verification gap, but no report measured its production incidence. Urgency comes from the project's truth guarantee and cheap authentic capsule, not an asserted failure rate.
- Best-of-K is low logical risk, not zero product risk: scores can manufacture repetitive “diversity,” raise latency, or amplify answer-shaped selection.
- Current wall-clock interruptions are not proven authentic merely because official post-turn events exist. Keep them off the canonical path until exact rule/event evidence maps them.

## Consensus architecture

```text
Seed + hidden Answer + deterministic CaseFrame
    -> WorldState (historical truth only)
    -> typed FactClaim[] (formal semantics + capsule payload)
    -> feasible Schedule candidates (all hard-valid)
    -> deterministic lexicographic selector (soft experience only)
    -> EvidencePlan {public, N1, N2, combined EvidenceViews}

FactClaim capsule -------------------------------> canonical player record
answer-blind dossier/narration -----------------> expressive presentation
hidden Answer + complete public record --------> honest reconstruction closing

ScenarioEventPlan (live board, separate clock)
    -> TurnState {move, action, resolution, post-event}
    -> PhysicalLedger {counts/public locations, never identities}
    -> physical cards remain the final discriminator
```

Contract boundaries:

1. `CaseFrame` may condition deterministic catalogs but never bypass Fact truth or expose the answer to prose.
2. `FactClaim` owns exact scope/polarity/time/quantity and the capsule; narration owns voice only.
3. `EvidenceView` means modeled app evidence, not total player knowledge.
4. The selector sees valid candidates and typed metadata; invalid schedules are incomparable, not merely expensive.
5. `ScenarioEventPlan` is not `WorldState.roomClosure`; historical evidence and live board events use separate clocks and validators.
6. `PhysicalLedger` proves reachability/conservation by counts while the physical deck retains identities and final authority.

## Ordered authorization gates

### Gate 0 — Evidence and baseline contract

Authorize docs/rule corrections, one reproducible evaluation command, exact metric definitions, telemetry privacy contract, and feature flags. No gameplay change.

Pass when the active route, authentic rules, 10+2 status, current distributions, and public/private terminology are unambiguous.

### Gate 1 — Truth and closing boundary

Authorize structured `FactClaim`, deterministic capsule UI/log, exact closing-name matching, and public-record reconstruction closing. Do not authorize answer-aware clue prose or LLM semantic judging.

Pass when adversarial mutations cannot alter canonical evidence and all reveal/note paths produce an honest closing.

### Gate 2 — Minimal authentic turn shell

Authorize public location confirmation, move/one-action phases, Summon draw ritual, structured Suggest, note parity, accusation payment/elimination, and passages as movement. No placement events yet.

Pass when host/phone state-machine, reconnect, migration, and full scripted physical-ritual tests pass without card identities.

### Gate 3 — Scheduler laboratory

Authorize offline/flagged best-of-K on current facts and `EvidenceView` instrumentation. Do not ship hard quotas or a public-only convergence floor.

Pass when candidate variance exists, experience metrics improve, all candidates remain valid, deployment p95 is acceptable, and answer-shaped signals do not rise.

### Gate 4 — Case-frame vertical slice

Authorize one occasion profile, one interval item kind, and one optional two-stage thread bundle, independently switchable. No full archetype library.

Pass when truth/property suites, paired-seed topology checks, schedule reliability, and repeated blind play all favor the slice.

### Gate 5 — Production selector and note roles

Authorize soft portfolio/source/arc scoring and distinct N1/N2 roles using the validated new supply. Convergence steering remains soft and seed-deterministic.

Pass when ablations attribute the gain to selection, private views remain safe, physical cards still settle at least one live distinction, and no metric quota substitutes for player evidence.

### Gate 6 — Event/cadence co-design

Authorize only after exact event/Challenge transcription. Build the separate event plan, count-ledger reachability graph, locks/passages, placements, Look/Challenge, and a cadence control/variant together.

Pass when every branch conserves cards, every fact is deliverable, all events are post-action, all cadence variants re-prove fairness, and the physical finish is stronger—not digitized away.

### Gate 7 — Progressive release

Authorize cohort rollout only after branch-complete automation, repeated-game crossover playtests, privacy review, and tested rollback. Retire legacy random passages/timers only after the canonical replacement is stable; otherwise label them explicit off-default house variants.

This is the consensus architecture: protect the truth spine first, restore the authentic low-risk rituals second, prove selection value third, expand world supply fourth, and treat event economy plus cadence as one coupled resource problem last.
