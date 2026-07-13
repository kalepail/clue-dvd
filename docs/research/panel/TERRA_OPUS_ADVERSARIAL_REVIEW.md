# Terra-Opus Adversarial Review — Clue DVD Gameplay Research Brief

Reviewer stance: conservative adversarial. Goal is to **disprove** the brief's concerns
where possible, separate documented physical-rule restoration from optional house-rule
variants, and flag where proposed dynamism would become noise, unfairness, telegraphing,
or cognitive overload. Only improvements that survive that scrutiny are recommended.

Method: read the brief in full, then read the engine source directly
(`world-sim.ts`, `fact-harvest.ts`, `clue-scheduler.ts`, `ai-mystery-engine.ts`,
`ai-mystery-setup.ts`), the turn shell (`src/client/pages/GamePage.tsx`,
`src/client/hooks/useGameStore.ts`, `src/client/phone/PhonePlayerPage.tsx`,
`src/phone/routes.ts`), and the docs (`AI_ENGINE*.md`, `GAME_REFERENCE.md`,
`README.md`, `CHANGELOG.md`, `TOPROMPT.md`). Where the brief cites measurements, I
re-ran `scripts/eval-mysteries.ts 500` myself rather than trusting the numbers.
Product code was **not** edited.

This report incorporates the mid-review evidence updates supplied by the owner/evidence
track (the OCR-checked official Hasbro rulebook and direct UI/code inspection): the 0–4
accusation count is authentic; the accusation card-forfeit is *partially* implemented
(`AccusationPanel.tsx:260-262`); secret passages are authentic movement, not random rolls;
all ten original cases have exactly 8 testimonies with 1–6 notes; `clue-verifier.ts` guards
card names but not semantic truth (§1.8); and the pre-generated closing is path-dependent on
possibly-unread private notes (§1.10). Each was re-verified against code before adoption, and
two of my earlier rulings were explicitly retracted (see §9 and Appendix A).

Classification legend: **[VD]** Verified defect/mismatch · **[DC]** Supported design
concern · **[OE]** Optional experiment · **[RN]** Rejected / non-issue.

---

## 0. Independent replication of the brief's empirical claims

I ran the exact command the brief cites (`npx tsx scripts/eval-mysteries.ts 500`).
My output reproduces the brief's tables **to the case**:

```
success: 500/500 (100.0%)   25.7 ms/mystery
world attempts: 1:402 2:71 3:14 4:6 5:5 6:1 16:1
final suspects: 3:30 4:58 5:160 6:252
final items:    2:177 3:302 5:21
final locations:2:6 3:17 4:31 5:161 6:285
final times:    1:289 2:139 3:70 4:2
```

Conclusion: the brief's reliability numbers, world-attempt histogram (worst = 16), and
end-state marginal distributions are **verified reproducible**, not asserted. This
materially raises my confidence in the rest of the brief's instrumentation (mechanism
mix, note mix), which I could not independently re-derive but which is consistent with
the harvest/scheduler code I read. `scripts/eval-mysteries.ts:44-70`; determinism confirmed
because the engine (`ai-mystery-engine.ts:172-178`) and the eval use the same seed
derivation (`seed`, `seed*31+attempt`).

**Load-bearing consequence:** because the scheduler is provably reliable and fast, every
recommendation below is framed as *additive within the existing pipeline*, never as a
reason to replace the world→facts→schedule spine. I reject any framing that treats the
solver as the problem.

---

## 1. Which concerns are important, minor, or false alarms (Q1)

### 1.1 Occasion family is disconnected from the simulated day — **[DC], high confidence**

- Evidence: `simulateWorld` destructures `occasionFamily` at `world-sim.ts:210` and
  returns it at `world-sim.ts:378`, but **no simulation branch references it** — not
  gatherings (`world-sim.ts:114-123`, a fixed per-time table), not room activities
  (`ROOM_ACTIVITIES` `125-137`), not threads, not item lifecycles, not movement. Grep
  confirms the identifier appears only at lines 86, 208, 210, 378 (all type/plumbing).
- It reaches the AI only as prose dressing: `ai-mystery-engine.ts:220-235` feeds
  `occasionFamily` to the answer-blind dossier prompt **after** the schedule is already
  fixed (`ai-mystery-engine.ts:170-193`).
- Verdict: **the brief's claim is exactly correct.** A tournament, a recital, and a
  horticultural exhibition share identical evidence topology; only the dossier's words
  change. This is a genuine driver of "same game, different paint."
- Counterargument I tested and rejected: "Maybe the occasion leaks in through gathering
  labels." It does not — gathering labels are seeded from a fixed table independent of
  occasion (`world-sim.ts:271-282`). The disconnect is real.
- **Severity: important but not a defect.** The output is still truthful and fair; the
  cost is replay texture, not correctness. This is the single highest-leverage genericity
  root cause because it is upstream of facts, schedule, and prose.

### 1.2 Small generic catalogs — **[DC], high confidence, but partly by design**

- Evidence: gathering table (8 slots × 1–3 options `world-sim.ts:114-123`), three
  activities/room (`125-137`), five solo activities (`139-145`), four errand causes
  (`165-170`), three quarrel causes (`172-176`), two surprise causes (`178-181`), six
  object notes (`188-195`). All confirmed as the brief states.
- Counterargument that partly survives: several of these are *deliberately* generic for
  safety. `OBJECT_NOTES` carries an explicit comment that the canonical Medal/Dr. Black
  lore must never migrate to other items (`world-sim.ts:183-198`). Widening catalogs
  naively is exactly the kind of change that could reintroduce card-lore bleed. So this
  is a design concern, not a defect, and any fix must respect the mention-license spine.
- **Severity: moderate.** Catalog size chiefly bounds prose variety, which the AI layer
  can partially mask. Lower priority than 1.1.

### 1.3 Innocent threads don't form arcs, and self-disclose — **[DC]/[VD-adjacent], high confidence**

- The brief says thread briefs "often" disclose the innocent explanation in the same
  reveal. The code is **stronger than the brief**: *every* thread brief self-resolves in
  one line — `fact-harvest.ts:637-645` ("...over ${cause}, as it turned out",
  "In truth: ${cause}", "In truth they were ${cause}"). There is no unresolved-tension
  state, no setup/payoff, no cross-reveal spacing constraint anywhere in the scheduler.
- Threads exclude the answer suspect (`world-sim.ts:641`) and are mention-only
  (`fact-harvest.ts:646-658`, kinds `thread_color`/`personal_remark`), so they carry zero
  deduction weight (`fact-harvest.ts:118-121` → `factKillsCell` returns false; kill list
  is empty `clue-scheduler.ts:120-123`).
- Verdict: brief correct, and understated. A "red herring" that answers its own question
  in the same breath is not a subplot; it is a footnote. This is the second-strongest
  genericity source and the one most often *felt* as "the clues don't build to anything."
- **Severity: important for experiential shape; harmless for correctness.**

### 1.4 Movement authenticity mismatch (adjacency/passages) — **[VD], but a documentation defect, NOT a gameplay defect**

- `AI_ENGINE_V3_PLAN.md:72` states the movement grid obeys "board adjacency/secret
  passages (already in `game-elements.ts`)". `buildMovementGrid` (`world-sim.ts:399-564`)
  assigns circles to rooms with **no adjacency or passage edge check** — rooms are picked
  from `legalRooms`/`socialRooms` filtered only by "not the answer room this slot"
  (`world-sim.ts:410, 517-519, 527-530`).
- Verdict: the plan over-claims. This is a **doc/implementation mismatch (VD)**.
- **But I reject elevating it to a gameplay defect.** Time slots span long intervals
  (Dawn → Breakfast → Late Morning …). A guest can plausibly be in the Library at Tea
  and the Ballroom at Dinner regardless of board adjacency; the physical board's adjacency
  governs *pawn movement per turn*, not where a person was over a multi-hour block.
  Forcing slot-to-slot adjacency would fabricate false constraints and is explicitly warned
  against by the brief. **Fix the plan doc, not the simulator.** (The living doc
  `AI_ENGINE.md` already omits the adjacency claim, per cross-check.)
- Reconciliation with the rulebook evidence: the Hasbro rulebook *does* make adjacency and
  locked doors/passages real — but for **physical pawn movement during a turn**
  (`brief:185,193`), a layer the app does not implement at all (§9), not for the narrative
  day-simulation. So there are two separate truths: (a) the *narrative* sim rightly ignores
  adjacency and the plan doc overstates it — a doc fix; (b) the *turn shell* omits authentic
  board movement entirely — a §9 restoration item. They must not be conflated.

### 1.5 Scheduler optimizes coverage, not experiential shape — **[DC], high confidence**

- Confirmed: `scheduleMystery` returns the **first** attempt that clears the windows
  (`clue-scheduler.ts:380-431`); `softScore` is computed (`428`, `softPenalty` `730-758`)
  and returned but **never used to compare or rank attempts**. So the soft penalties
  (adjacent-axis repetition, uneven suspect mentions) are diagnostic only, exactly as the
  brief says.
- None of the brief's listed shape targets (fact-kind diversity, note semantic identity,
  thread payoff, occasion relevance, source alternation, surprise, which two axes
  converge, per-case dramatic shape) are hard or optimized constraints. Verified by
  absence across `clue-scheduler.ts`.
- **Severity: this is the correct lever for controlled dynamism** — the scheduler already
  does best-of-N-style work internally (attempts loop), so adding a soft *selector* over a
  handful of candidate schedules is low-risk and preserves every invariant. See §7.

### 1.6 Converged-axis macro-pattern (item+time) — **[DC], verified, mild**

- My run confirms items ≤3 in 479/500 and times ≤3 in 498/500; locations ≤3 in only
  23/500. So public evidence almost always resolves item+time and leaves suspect+location
  for the physical cards. This flows structurally from: the decoy mechanism holding items
  at 2–3 (`world-sim.ts:96-101, 316-324`; `fact-harvest.ts:336-337`), the time chain
  being the scheduler's first and gating phase (`clue-scheduler.ts:565`), and the
  convergence top-up preferring the two most tractable of item/location/time
  (`clue-scheduler.ts:571-583`) — which is almost always item and time because locations
  are hard to collapse (whole-location kills can never complete a time; noted in code at
  `clue-scheduler.ts:337-340`).
- Verdict: real and verified, but **this is closer to a feature than a bug**. The original
  disc also pins two/three axes and leaves the rest to cards (`FINAL_TARGET` rationale
  `clue-scheduler.ts:79-97`). The concern is only that it's *always the same two*.
- **Severity: minor.** Worth an experiment (§7), not a fix.

### 1.7 Turn-shell drift from documented physical loop — mixed; see §9 for the itemized ruling.

### False alarms / things I actively reject

- **[RN] "The renderer is generic, so improve prompts."** The brief's own caution is
  right and I reinforce it: the renderer is answer-blind and fact-licensed
  (`ai-mystery-engine.ts:238-250`, seeds carry only `writerBrief` + `allowedNames`
  `196-212`). Prose cannot manufacture event diversity absent from the world. Prompt-only
  work is the *wrong* first move; it would polish sentences over a static skeleton.
- **[RN] "Add more clues / more Butler summons."** Rejected. The Butler summon is tied to
  the finite physical item-card supply (`TOPROMPT.md:13` "Only 7 times (dependant on item
  cards)"; `GAME_REFERENCE.md:159,165`). More public clues also erode the physical cards'
  role. The 10+2 structure is correct.
- **[RN] "Replace the solver to get variety."** Rejected outright — 500/500 reliability,
  25.7 ms/case. Never trade a proven invariant engine for narrative flavor.

### 1.8 The verifier guards card *names*, not semantic *truth* — **[DC], high confidence, important**

This is the most consequential item the brief surfaces about truthfulness, and I confirm it
against code. `clue-verifier.ts` performs exactly four deterministic checks:
non-empty text (`clue-verifier.ts:69,82,117`), **card-name license** — every card name in
the prose must be in the fact's allowed set (`clue-verifier.ts:86-91`), a sentence-count
**warning** only (`92-98`), and the closing naming all four answer cards (`103-118`).

It does **not** check: semantic entailment (does the sentence actually assert the fact?),
scope (`several guests` vs `everyone`), **polarity** (a `room_undisturbed` fact rendered as
"something was amiss" would pass — every card-name rule is satisfied), chronology
(`as late as Tea` vs `until Tea`), or **invented non-card people**. The file's own comment
claims invented people are "caught by the cast prompt + audit warnings"
(`clue-verifier.ts:10-12`) — but that is a *prompt-level* mitigation in the renderer, not a
deterministic guard; there is no code that flags a non-card proper noun.

Why this matters adversarially: the architecture's headline safety claim — "the prose can
never break fairness" (`ai-mystery-engine.ts:21-24`) — is **true for card-name telegraphing
and only for card-name telegraphing**. A polarity/scope/chronology error, or an invented
witness ("the gardener saw…"), passes verification yet feeds the player a *false premise
they will deduce from*. Because players reason from the clue text, a semantic falsehood is,
in effect, a fair-play violation even though the underlying joint-cell logic is sound. The
gap between "logic is provably fair" and "the sentence the player reads is true" is real and
currently unguarded.

Counterargument I weighed: the renderer is heavily constrained (writerBrief + allowedNames,
few-shot on the corpus) and empirically rarely inverts a fact. Fair — this is a *latent*
risk, not an observed epidemic, so it is a **[DC], not a [VD]**. But it is the one place
where the truthfulness guarantee is weaker than the marketing, and it deserves a real
backstop (§11).

The brief's proposed truth boundary is sound and I endorse it: the original DVD showed a
**written summary on-screen while Ashe spoke**. Mirroring that — render a *deterministic
evidence capsule* from the fact (structured, machine-generated, guaranteed-true) shown
alongside the expressive AI narration — moves all truth-bearing content into deterministic
territory and demotes the prose to flavor that cannot mislead deduction. This is a strong,
low-risk direction (see §11, §12 Phase 1.5).

### 1.9 Fixed 10+2 is a project decision, not an authenticity requirement — **[RN]/[OE], verified**

I counted the transcribed corpus directly: **all ten original cases have exactly 8 Butler
testimonies**; inspector-note counts **vary 1–6** (observed: 3,1,3,1,3,4,6,3,3,5)
(`src/data/original-mysteries.ts`, verified by script). V3 fixes **10 clues + 2 notes**
(`clue-scheduler.ts:74` `REVEAL_COUNT = 12`, 10 butler + `NOTE1_POSITION`/`NOTE2_POSITION`).

Ruling: the 10+2 structure is a defensible **project decision**, not a fidelity defect
(**[RN]** as a defect). But two facts follow: (a) V3 uses *more* testimonies than the
originals (10 vs 8) and a *fixed, smaller* note count (2 vs a variable 1–6 mean ≈ 3.2), so
claims of corpus fidelity should be scoped to voice/shape, not count; (b) the fixed note
count is *why* note variety is structurally thin (§8) — the originals bought variety partly
through **variable note quantity**. Making note count seed-variable (say 1–3) is a valid
**[OE]** that would recover some of that, but it interacts with the fair-play checkpoints
(N1/N2 sit at fixed positions 6 and 9, `clue-scheduler.ts:76-78`) and must be tested
against the invariants before adoption. Lower priority than note *content* differentiation.

### 1.10 The pre-generated closing is path-dependent on evidence that may never have been seen — **[DC], high confidence, borders [VD]**

Verified against code, and I confirm the brief's mechanism exactly:

- The closing is produced at **mystery-creation time** inside `generateMysteryV2`
  (`ai-mystery-engine.ts:259-276`), baked into the returned package. It therefore
  **cannot** be conditioned on what any player actually read during play — it is
  path-independent by construction.
- It is fed `caseRecap: storySeeds.map(seed => seed.brief)` where `storySeeds` is **all
  twelve reveals**, both private notes included (`ai-mystery-engine.ts:198-212, 260-262`),
  and `finalCandidates` = the field standing after **all twelve** reveals are applied
  (`clue-scheduler.ts:417-426`).
- The closing prompt presents both as fait accompli: "The evidence that was revealed during
  play, in order:" (`ai-v3-prompts.ts:195-196`) and "After all of that evidence, the field
  still standing was:" (`ai-v3-prompts.ts:197-203`), then instructs the model to "cite two
  or three of its strongest threads" (`ai-v3-prompts.ts:205`) — and the strongest,
  heaviest-cutting threads can be the note facts.

Consequence: the two Inspector notes are **private per player and cost a turn**
(`useGameStore.ts:527-556`); a table may read one, both, or neither. Yet the closing (a) can
**cite a note's evidence as if it were shown to everyone**, and (b) **overstates how much the
publicly-seen field converged**. The brief's instrumentation quantifies the gap: the ten
**public** Butler facts alone leave mean marginals **7.83 suspects / 4.16 items / 7.75
locations / 3.72 times** — far broader than the all-evidence finals the closing narrates
(my §0 run: modally 5–6 suspects, 2–3 items, 5–6 locations, 1–2 times). So a closing can
honestly-sounding-ly claim "the evidence had narrowed it to two rooms" when the *seen* public
field held seven or eight.

Classification: **[DC]** with high confidence on the mechanism; it **borders [VD]** for the
"cite unread private evidence" case, because the narration then asserts a counterfactual
("revealed during play"). It is *not* a fair-play defect — the closing runs after the solve,
so it never aids or misleads deduction. The harm is **epistemic honesty**: the reveal
narration misrepresents what the players collectively saw.

Fix (I endorse the brief's first option): **make the closing path-independent on public
evidence + the physical cards.**
- Feed `caseRecap` only the **ten Butler briefs**, excluding both note briefs
  (`ai-mystery-engine.ts:260` → filter `deliverAs === "butler"`).
- Replace `finalCandidates` with a **public-only field** — the marginal candidates standing
  after the 10 Butler reveals (a small deterministic addition; the scheduler already tracks
  per-position counts in `trajectory`, `clue-scheduler.ts:391-408`, and can expose the
  post-Butler survivor names the same way it builds `finalCandidates`).
- This is *more* honest AND reinforces a core project value: it makes the closing say "the
  public testimony narrowed it this far; your dealt cards and deductions closed it," which
  elevates the physical cards rather than pretending the app solved it.
- Secondary option if notes are kept in the recap: phrase them conditionally ("the
  Inspector's file, if consulted, also noted…") rather than as shown evidence — weaker,
  since it still leaks the note field's convergence.

Risk of the fix: the public-only field is broad, so the closing cannot boast much
convergence — but that broadness is the truth, and narrating it honestly is the point.
Low implementation risk (prompt inputs only; no logic/invariant change).

---

## 2. Root causes of genericity, by layer (Q2)

| Layer | Root cause | Evidence | Fixable without touching invariants? |
|---|---|---|---|
| World | Occasion never perturbs simulation; fixed catalogs; answer location/item are static anchors (`world-sim.ts:580-589`) with items otherwise passive inventory | `world-sim.ts:210,378`; `114-195` | Yes — occasion→catalog gating (§4), item lifecycle (§5) |
| Fact | Threads self-resolve; item/room facts dominate the tellable set; no arc metadata | `fact-harvest.ts:637-645`; item/room bundles `493-592` | Yes — thread staging (§6), arc tags |
| Schedule | First-valid selection; soft score unused; no diversity/identity/shape constraints | `clue-scheduler.ts:380-431,428` | Yes — soft *selector* over candidates (§7) |
| Prose | Downstream of the above; cannot add events | `ai-mystery-engine.ts:196-250` | Only cosmetically |
| Round / physical loop | **The authentic event economy is absent**: no facedown item placement, Look-at-Item-Card, Inspector's Challenge, or move-then-action structure; notes lack distinct jobs | `ai-mystery-setup.ts:63-64`; `useGameStore.ts:527-530`; `GamePage.tsx:192-193`; `brief:207` | Yes (§8, §9) |
| Truth boundary | Verifier guards card names, not semantic entailment/polarity/scope/chronology/invented people | `clue-verifier.ts:66-118` | Yes — deterministic evidence capsule (§11) |

The single dominant cause of *genericity* is **1.1 (occasion disconnect)** — upstream of all
downstream layers; if exactly one thing changes, change that. But per the evidence update
(`brief:207`), the largest lost source of *round dynamism* is not prose at all — it is the
**authentic event economy** (option unlocks, doors/passages, facedown placements,
challenges, post-turn interruptions) that the turn shell never implements. Genericity and
dynamism are two distinct problems with two distinct dominant causes.

---

## 3. What a single case's dynamic arc should look like (Q3) — **[OE]**

Constraints that must hold (non-negotiable, from `clue-scheduler.ts:44-97`): checkpoint A
≥4 after pos 6, checkpoint B ≥3 after pos 9, final windows + ≥2 converged axes, answer
cell always alive, answer mentions only at pos ≥7, answer-solo only in last two clues.

A desirable arc *within* those rails (all achievable by re-ordering/selecting among
already-valid schedules, so no invariant is at risk):

1. **Opening (pos 1–3):** establish the household and one unresolved thread tension. Gentle
   facts only (already preferred early, `clue-scheduler.ts:687`).
2. **Middle (pos 4–7, incl. N1):** two distinct evidence *sources* alternate (staff rounds
   vs. guest testimony vs. room checks). N1 does a job the Butler clues cannot (§8).
3. **Turn (pos 8–9, incl. N2):** the converging axes tighten; one earlier thread *pays off*
   or is explicitly left open as a decoy.
4. **Close (pos 10):** the heaviest surviving cut; answer-solo lands here if selected.

Acceptance criterion (falsifiable): across 200 seeds, no two adjacent reveals share a
primary axis in >15% of cases (softScore's adjacent-axis penalty already measures this —
just make it a *selector*), and ≥1 thread appears in ≥2 reveals in ≥60% of cases. Both are
measurable with the existing eval harness plus small instrumentation.

---

## 4. Can occasion families alter deterministic truth safely? (Q4) — **[OE], medium confidence**

Yes, but only via **bounded, license-safe gating**, never free-form generation (large
LLM-authored world schemas already failed per the brief; preserve that lesson).

Safe design: make `occasionFamily` an input to catalog *selection*, not new content.
- A "horticultural prize gathering" biases gatherings toward L06/L10/L11 and adds a
  garden-specific room activity set; a "scholarly demonstration" biases toward L08/L09.
- The occasion may designate *which* item is displayed-for-occasion and *where* (already a
  world concept, `world-sim.ts:578-589`), altering the intact-sighting anchor location.
- Hard guardrails: occasion may **never** touch the answer cell, the mention licenses, the
  decoy/secured/closure logic, or the fair-play windows. It only reweights seeded picks
  among already-safe options.

Risk: occasion-conditioned gatherings could reduce room diversity (everyone in the garden)
and make locations *even harder* to converge, worsening 1.6. Mitigation: keep a minimum
room-spread floor in `buildMovementGrid`.

Acceptance: with occasion gating on, (a) 500/500 reliability preserved, (b) location final
distribution not shifted >10% toward the max bucket, (c) a blind reader can name the
occasion from the evidence topology (not just the dossier) in a spot check. **Falsified if**
reliability drops below ~99% or the eval's final windows leave range.

---

## 5. Dynamic items without breaking the fixed answer or card economy (Q5) — **[OE], medium confidence**

The answer item is pinned to the answer location as home/display and cannot move
(`world-sim.ts:580-583`) — correct and must stay. But **non-answer** items are currently
passive (`buildItemStates` only sets home + intact sightings + one offsite,
`world-sim.ts:566-630`). Safe dynamism:

- Give 1–2 non-answer, non-decoy items a **mid-day lifecycle**: displayed → handled →
  returned, generating a short chain of `item_intact`/`item_home` facts at different hours
  that still only ever *clear* those items (kills stay truthful by construction,
  `fact-harvest.ts:103-114`).
- The existing `borrowed_item` thread (`world-sim.ts:663-665`) is the seed of this; extend
  it into a 2–3-reveal object journey rather than a one-line disclosure.

Hard constraints: never move the answer item; never let a lifecycle fact kill a decoy
(decoys must stay unaccounted, `fact-harvest.ts:336-337`); the item-card economy is
untouched because these are Butler *clue* facts, not new physical item-card draws.

Risk: more item facts could over-converge the item axis (push to 2 always) and telegraph.
Mitigation: cap lifecycle items and keep them off the answer item's category. **Falsified
if** item final distribution collapses to a single bucket or convergence exceeds windows.

---

## 6. Staging innocent-thread setup/escalation/payoff (Q6) — **[OE], medium confidence, highest genericity payoff**

This is where I most agree with the brief. Concrete, safe shape:

- Add optional `threadStage: "setup" | "escalation" | "payoff"` metadata to thread facts
  in `fact-harvest.ts` (they are already mention-only, so no kill-semantics risk).
- **Do not self-resolve on setup/escalation.** Move the "In truth: ${cause}" disclosure
  (`fact-harvest.ts:637-645`) to the payoff reveal only. Setup/escalation state the
  observable behavior without the innocent explanation.
- Add a scheduler **spacing preference** (soft, not hard): a thread's stages should appear
  in order and non-adjacent. Implement as a term in the soft selector (§7), so it can never
  break a checkpoint.

The critical adversarial guardrail: **an unresolved thread must never become misleading.**
It must stay strictly mention-only (zero kill weight) so a player who over-invests in it
loses no *deductive* ground, only attention. The payoff must always land within the same
case (never a dangling thread), or a careful player is cheated. Falsifiable acceptance: in
every generated case, each thread that reaches "setup" also reaches "payoff" before pos 12
(assertable in a test), and thread facts contribute 0 to the kill lists (already true;
lock it with a test).

Risk if done wrong: this is the change most likely to produce "noise" and cognitive
overload. Keep to **one** staged thread per case; leave others as single-line color.

---

## 7. Diversifying mechanism + converged axes while preserving invariants (Q7) — **[OE], high confidence, lowest risk / highest ROI**

The scheduler already runs an attempts loop and already *computes* a soft score. The
minimal, safe intervention: **generate K valid schedules, keep the best-scoring**, instead
of returning the first (`clue-scheduler.ts:380-431`). Add to `softPenalty`:

- fact-**kind** diversity (penalize >N of the same `FactKind`, since item-accounting +
  room-undisturbed are 52.5% of reveals per the brief);
- **note semantic identity** (penalize N1 and N2 sharing a kind — today 69.9% are
  room/item-accounting);
- **converged-axis variety** across a session (penalize always item+time), if session
  history is available.

Why this is safe: the candidates are *already individually valid* (every one passes
checkpoints + windows). Selecting among them cannot violate an invariant; it only reweights
*which* valid schedule ships. Cost: K× the scheduler's ~26 ms — negligible.

Falsifiable acceptance: over 500 seeds, single-kind share of reveals drops (target: no kind
>25%), and N1/N2 share a kind in <30% of cases (down from ~70%). Both measurable by
extending `eval-mysteries.ts`. **Falsified if** reliability or wall-clock regresses
materially, or windows leave range.

---

## 8. Distinct jobs for Note 1 and Note 2 (Q8) — **[DC] on the problem, [OE] on the fix**

Verified problem: notes are drawn from the same `noteSuitable` pool as Butler clues
(`clue-scheduler.ts:616,653-724`), with **no semantic distinction** between N1 and N2. The
brief's 69.9%-generic figure follows structurally.

Distinct jobs I'd assign (and can be enforced as soft selector terms, §7):
- **N1 (private, after clue 5):** a *cross-category* anchor the public clues won't give —
  the `AI_ENGINE_V3_PLAN.md:110` intent ("preferring cross_category facts") that the code
  does not currently enforce. Its job: give the note-reader a genuine private edge worth a
  turn.
- **N2 (private, after clue 7):** a *convergence accelerant* on the axis the public clues
  are leaving open (usually suspect or location, per §1.6) — so private info nudges the
  reader toward the physical-card phase rather than duplicating public evidence.

How private info should affect table play: today reading a note costs a turn the first time
(`useGameStore.ts:527-556`), which is faithful to the physical rule (`CHANGELOG.md:24`).
Keep that. The improvement is content differentiation, not mechanic change.

Guardrail: N1/N2 must remain answer-blind and license-bound (they route through the same
renderer). No answer-aware wording. Falsifiable: N1 and N2 differ in `FactKind` in ≥70% of
cases and N2's primary axis is a currently-open axis in ≥60%.

---

## 9. Turn-shell: restore, retain-as-variant, or remove (Q9)

**Authority correction (evidence update).** The official Hasbro rulebook (the scanned
10-page PDF linked from instructions.hasbro.com, OCR-checked by the evidence track and
folded into `GAMEPLAY_RESEARCH_BRIEF.md:181-207`) supersedes the incomplete
`GAME_REFERENCE.md` summary on two points I ruled on in an earlier draft. I withdraw those
rulings and correct them here:

- **The 0–4 correct-category count after an accusation is AUTHENTIC** (`brief:191`). My
  earlier "information leak / retain as variant" framing was a **false alarm** and is
  retracted. The count is a rulebook feature, not a digital liberty. And per direct UI
  inspection, the host already instructs the authentic card forfeit
  (`AccusationPanel.tsx:260-262`) — so the accusation gap is *partial* (wording, phone
  parity, acknowledgement/recording, and elimination-on-nonpayment), not a total omission.
- **Secret passages are authentic board-movement edges, sometimes locked; they do NOT
  produce random reward/penalty outcomes** (`brief:193`). The app's 20/60/20 roll is
  therefore an *invented* mechanic, not a faithful flourish — the opposite of my earlier
  "harmless variant" read.

The rulebook also establishes structure the app does not implement at all: every turn is
**move to an adjacent location, then exactly one action** (`brief:185`); actions are
**Suggest, Summon the Butler, Look at an Item Card, Read an Inspector's Note, or Accuse**
(`brief:186`); DVD events place **facedown item cards onto board locations** where a player
may attempt an **Inspector's Challenge** to inspect one without taking it (`brief:188`);
events are resolved **after** the current turn, never mid-turn (`brief:194`); entering the
Evidence Room **requires** an accusation and summons are barred there (`brief:187,190`).

Itemized ruling against the rulebook (authoritative) with `GAME_REFERENCE.md` as secondary:

| Behavior | Code | Authentic rulebook rule | Ruling |
|---|---|---|---|
| Wrong accusation reports count 0–4 and **instructs the card forfeit, but incompletely** | count `useGameStore.ts:622-627,682`; host UI **does** instruct forfeit `AccusationPanel.tsx:260-262` ("Turn in N cards face up to the Evidence Room"); phone feedback omits it `PhonePlayerPage.tsx:439-477,1084` | Count is authentic; **each wrong category costs one item card face-up; inability to pay eliminates the player** (`brief:191-192,203`) | **[DC] partial gap, not a total miss (correction to earlier draft).** The count is authentic and the host already prompts the forfeit. Four concrete deltas remain: (1) it says generic "card" not **"item card"** (`AccusationPanel.tsx:261`); (2) the **phone** player feedback omits the forfeit ritual entirely (`PhonePlayerPage.tsx:439-477`); (3) no payment is **acknowledged or recorded** — it is a text instruction only; (4) **inability-to-pay does not eliminate the player** — the authentic terminal consequence is absent. Fix: word it "item card," mirror the ritual to phone feedback, add an acknowledgement toggle, and support an optional elimination path. Do not auto-adjudicate hands. |
| Secret passage 20% good / 60% neutral / 20% bad, not tied to mystery, doesn't consume the turn | `useGameStore.ts:757-761` (roll<0.2 good, <0.8 neutral, else bad); `GamePage.tsx:113-114` | Secret passages are **movement edges, sometimes locked; no random outcomes** (`brief:193`) | **[VD] invented-mechanic mismatch.** The random roll is not the rulebook behavior. Authentic restoration: treat a passage as a board move to its paired room (subject to locked state), then the player takes their one action. The 20/60/20 roll may survive **only** as an explicitly labeled house-rule toggle, off by default. |
| No move-then-one-action turn structure; "Reveal Clue" conflates the Butler summon | Butler action = "Reveal Clue" (`PhonePlayerPage.tsx:540-541,2149-2156`; `GamePage.tsx:397-436`) | Move to adjacent room, then exactly one of {Suggest, Summon, Look at Item Card, Read Note, Accuse} (`brief:185-186`) | **[DC] restore the turn skeleton as a light guide/log.** Rename "Reveal Clue" to "Summon the Butler" (that is what it is), and present the five actions. The app need not enforce board movement, but structuring the single action per turn is faithful and cheap. |
| No "Look at an Item Card" action; no Inspector's Challenge; no event-driven item placement | absent | Look at an Item Card; DVD events place facedown item cards on the board; Inspector's Challenge inspects one without taking it (`brief:186,188`) | **[VD] missing authentic mechanics — and the brief's flagged largest lost dynamism source.** These are the *event economy*: option unlocks, facedown placements on the board, challenges. Restoring even a lightweight version is higher-leverage for round dynamism than any prose change (`brief:207`). See §12 Phase 4. |
| Suggestion not structured/logged (3-of-4) | `PhonePlayerPage.tsx:543-544,763-771`; route records an event `phone/routes.ts:326-392` | Name 3 of 4 categories (`GAME_REFERENCE.md:164`; `brief:186`) | **[DC] restore lightly.** Add a 3-of-4 prompt/log; do not adjudicate (app doesn't hold physical hands). Reminder ritual only. |
| No item-card draw on Butler summon | as above | Summon adds the **top Butler's Pantry item card privately** to the summoner's hand; barred in the Evidence Room (`brief:187`) | **[DC] add a ritual/reminder + the Evidence-Room restriction, not tracking.** "Take the top Pantry card" prompt is safe; auto-tracking hands is not. |
| Notes unlock at clue 5 / clue 7; private; cost a turn first read; revisitable | `GamePage.tsx:192-193,484-485`; `useGameStore.ts:527-556` | Notes become available over time, remain private, can be revisited (`brief:189`) | **[RN] keep.** Faithful; revisit is supported (`useGameStore.ts:523-525` returns text without re-charging a turn on repeat). |
| Timed Inspector interruptions from 60 min, independent of clue schedule; resolved via UI | `useGameStore.ts:171-175`; `GamePage.tsx:413-433` | DVD events (incl. interruptions) are **post-turn, never mid-turn** (`brief:194`); interruptions make players turn cards face-up | **[DC] retain but fix timing discipline.** The mechanic is authentic (post-turn events exist); the concern is it can currently fire mid-deduction. Gate interruptions to fire between turns, and optionally align to reveal positions so pacing matches the proven curve. |
| AI scenarios emit no locked rooms / dramatic events; shell keeps UI+state | `ai-mystery-setup.ts:63-64` (`dramaticEvents: []`, `lockedRooms: []`); consumed `GamePage.tsx:445-478,420-436` | Locked doors/passages and event-driven placements are **authentic** (`brief:188,193`) | **[VD] dead authentic-path.** The V3 setup always emits empty arrays, so room-unlock and dramatic-event branches never fire — yet these encode *authentic* rulebook mechanics. This is not "cut a digital gimmick"; it is "wire up a real rule." The world already simulates a `roomClosure` (`world-sim.ts:340-352`) the shell never surfaces — a safe, authentic connection waiting to be made. |

Note-gating consistency check (adversarial): `GamePage.tsx` gates availability on
`currentClueIndex >= 5 / >= 7` while `useGameStore.readInspectorNote` gates on
`progress >= 0.5 / >= 0.65` (`useGameStore.ts:530`). For the standard 10-clue case these
coincide at integer clue boundaries (N2: 0.65×10 = 6.5 → clue 7), so **no live defect** —
but it is a latent inconsistency if `clues.length` ever ≠ 10. **[DC-low]** unify on one
source of truth. The brief's "65%" cite is accurate to the store constant.

---

## 10. Minimal experiments + telemetry to falsify before any rewrite (Q10)

All of these extend the existing, trusted `scripts/eval-mysteries.ts` and cost nothing at
runtime:

1. **Soft-selector A/B (§7):** ship best-of-K schedules; measure kind-share and N1/N2
   identity over 500 seeds. Falsifies "diversity needs a rewrite" if a pure selector
   already moves the numbers.
2. **Occasion-gating dry run (§4):** apply occasion→catalog gating in `world-sim` behind a
   flag; re-run the 500-sweep and confirm reliability ≥99% and windows hold. Falsifies
   "occasion can't alter truth safely" — or proves it can't.
3. **Thread-staging invariant test (§6):** unit test asserting every setup thread reaches
   payoff and thread facts have empty kill lists. Falsifies "staging introduces misleading
   noise."
4. **Turn-shell intent probe (§9):** confirm with the owner whether the correct-count
   accusation and 60-min interruptions are intended variants before touching them.

Telemetry to add (read-only): per-case fact-kind histogram, N1/N2 kinds, converged-axis
pair, thread-arc length, occasion-inferability. These make every §3–§8 claim measurable.

---

## 11. New tests/validation to preserve truthfulness (Q11)

Existing guards to keep: `assertFactsSpareAnswer` (`fact-harvest.ts:147-154`), the
in-scheduler answer-cell assertion (`clue-scheduler.ts:392-396`), verifier/repair loop
(`ai-mystery-engine.ts:295-379`), `clue-verifier.test.ts`, `clue-scheduler.test.ts`,
`golden-corpus.test.ts`.

Add before any dynamism lands:
- **Thread-color kill-list emptiness** test (locks §6 guardrail).
- **Occasion-invariance** test: occasion changes must not change the answer cell, mention
  licenses, or final windows for a fixed seed.
- **Item-lifecycle safety** test: no lifecycle fact kills a decoy or moves the answer item.
- **Soft-selector never violates invariants** test: for K candidates, each independently
  passes checkpoints (property test over seeds).
- **Note-gating single-source** test to close §9's latent inconsistency.

**The semantic truth gap (§1.8) — the most important truthfulness work.** Card-name
discipline (`clue-verifier.ts:86-91`) is necessary but not sufficient. Two complementary
backstops, in priority order:

1. **Deterministic evidence capsule (recommended, mirrors the original DVD's on-screen
   write-down).** Ship each Butler reveal as `{ structured fact summary (deterministic,
   generated from the Fact — guaranteed true) + AI narration (flavor) }`. The capsule is
   the truth-bearing artifact the player deduces from; the prose can no longer mislead
   deduction because it is not the source of record. This is the cleanest truth boundary
   and it is *authentic* (the disc did exactly this). It also makes §1.8's polarity/scope/
   chronology risks moot for deduction, since the capsule carries scope/polarity/time
   verbatim from the fact.
2. **Lightweight semantic guards in `clue-verifier.ts` (cheaper interim).** Add checks that
   the licensed *time* names in the prose respect the fact's cutoff direction (chronology),
   that a `room_undisturbed`/`item_intact` clue does not contain negation/loss vocabulary
   near the licensed card (polarity heuristic), and a **non-card proper-noun detector** to
   flag invented people (the comment at `clue-verifier.ts:10-12` claims this is covered; it
   is not). These are heuristics, not proofs — the capsule is the real fix — but they close
   the worst inversions deterministically.

Both are testable: property tests that inject a deliberately inverted rendering and assert
the guard/capsule catches or overrides it.

**Closing path-independence (§1.10).** Add a test asserting the `caseRecap` fed to
`buildClosingPrompt` contains **no** note briefs (equals the Butler-only seed set), and that
the "field still standing" block uses the **public-only** survivor set, not the all-12
`finalCandidates`. This deterministically prevents the closing from citing unread private
evidence or overstating the seen field. Falsifiable: diff the closing's recap against the
`deliverAs === "butler"` seeds; assert equality.

---

## 12. Prioritized roadmap (Q12)

Ordering principle: highest genericity ROI at lowest invariant risk first; anything that
touches truth semantics gets a test *before* the change.

**Phase 0 — Documentation + intent (days, no code risk)**
- Fix `AI_ENGINE_V3_PLAN.md:72` adjacency over-claim (§1.4). *[VD]*
- Decide, with owner, the fate of the correct-count accusation and 60-min interruptions
  (§9). *Dependency for Phase 3.*
- Add read-only telemetry to `eval-mysteries.ts` (§10). *Prereq for measuring everything.*
- Impact: none for players; unblocks measurement. Risk: none.

**Phase 1 — Soft scheduler selector (§7)**  *[OE] — do this first among code changes*
- Best-of-K over already-valid schedules; extend `softPenalty` with kind-diversity + note
  identity. Dependency: telemetry. Acceptance: no kind >25% of reveals; N1/N2 share a kind
  <30%; reliability + windows unchanged; wall-clock still <100 ms/case.
- Player impact: immediately less repetitive clue streams and differentiated notes.
  Risk: **low** (selection among valid candidates cannot break invariants).

**Phase 1.5 — Truthfulness/honesty backstops (§1.8, §1.10, §11)**  *[OE]/[DC] — highest truthfulness ROI*
- **Deterministic evidence capsule (§1.8):** emit a machine-generated, guaranteed-true fact
  summary alongside each Butler reveal and note (mirrors the disc's on-screen write-down);
  demote AI prose to flavor. Add the interim semantic guards (chronology/polarity/
  invented-people) to `clue-verifier.ts` if the capsule is deferred.
- **Path-independent closing (§1.10):** feed the closing only the ten Butler briefs and a
  public-only survivor field; stop presenting private-note evidence as "revealed during
  play." Prompt-input change only (`ai-mystery-engine.ts:260-265`; `ai-v3-prompts.ts:195-205`)
  plus a small scheduler helper for the post-Butler survivor names.
- Dependency: none (both read existing `Fact`/`trajectory` data). Acceptance: an injected
  inverted rendering no longer changes what the player can deduce; non-card proper nouns are
  flagged; the closing's recap provably excludes note briefs and its field matches the
  public-only marginals. Player impact: closes the two real holes in the truthfulness/honesty
  guarantee and reinforces the physical cards' role. Risk: **low** — additive; no
  logic/invariant change.

**Phase 2 — Thread staging (§6) + item lifecycle (§5)**  *[OE]*
- Move thread self-disclosure to payoff; add one staged thread/case; add 1–2 non-answer
  item journeys. Dependency: Phase-1 selector for spacing; the new truthfulness tests
  (§11) must land first. Acceptance: thread arc length ≥2 in ≥60% of cases; all
  self-resolution moved to payoff; zero decoy kills; reliability preserved.
- Player impact: cases finally "build"; red herrings feel like subplots. Risk: **medium**
  — this is the change most able to create noise; keep it to one thread/case.

**Phase 3 — Occasion → truth gating (§4)**  *[OE]*
- Occasion reweights catalogs, gatherings, and displayed-item placement behind guardrails.
  Dependency: occasion-invariance test (§11); room-spread floor to protect §1.6.
  Acceptance: occasion inferable from topology; reliability ≥99%; location distribution
  not worsened >10%. Risk: **medium-high** — most surface area in the simulator.

**Phase 4 — Turn-shell reconciliation + authentic event economy (§9)**  *[VD]/[DC] — largest round-dynamism gain*
- **4a (cheap fidelity fixes):** reword accusation forfeit to "item card" and mirror it to
  phone feedback (`AccusationPanel.tsx:261`; `PhonePlayerPage.tsx:439-477`); add
  acknowledgement/record of payment and an optional elimination-on-nonpayment path; restore
  3-of-4 suggestion reminder + Butler-summon item-card ritual with the Evidence-Room
  restriction; rename "Reveal Clue" → "Summon the Butler"; unify note-gating; make
  interruptions strictly post-turn.
- **4b (the event economy — the brief's largest lost dynamism, `brief:207`):** wire the
  world's existing `roomClosure` (`world-sim.ts:340-352`) into the dead room-unlock/locked-
  door UI; add facedown item placement + "Look at an Item Card" + Inspector's Challenge as a
  light ritual layer; convert secret passages from the invented 20/60/20 roll
  (`useGameStore.ts:757-761`) to authentic movement edges (roll survives only as a labeled
  house-rule toggle).
- Dependency: Phase-0 intent decision. Acceptance: shell matches the **rulebook** defaults
  with any liberties explicitly labeled as variants; no dead authentic path; a playtest
  reports the round loop feels more varied turn-to-turn. Risk: **medium** for 4b (most new
  surface), **low** for 4a.

Explicitly **not** on the roadmap: replacing the solver, adding clues/summons beyond the
authentic economy, adjacency enforcement in the *narrative* simulator (distinct from board
movement), answer-aware clue writing, prompt-only "fixes" as a first move. Each is rejected
above.

---

## Appendix A — Confidence and what would change my mind

| Finding | Class | Confidence | Would flip if… |
|---|---|---|---|
| Occasion disconnect (§1.1) | DC | Very high | a code path used `occasionFamily` in simulation (grep shows none) |
| Threads self-resolve (§1.3) | DC | Very high | a payoff/spacing mechanism existed (none in scheduler) |
| Adjacency over-claim (§1.4) | VD (doc) | High | living `AI_ENGINE.md` made the same claim (it doesn't) |
| Soft score unused (§1.5) | DC | Very high | `scheduleMystery` ranked attempts (it returns first) |
| Dead locked-rooms/dramatic-events path (§9) | VD | High | a non-V3 active route populated them (V3 setup emits `[]`) |
| Correct-count accusation is authentic; count itself is fine (§9) | RN | High (rulebook) | superseded — earlier "leak" read retracted per `brief:191` |
| Accusation forfeit incomplete: phone parity / "item card" wording / record / elimination (§9) | DC | High | host already instructs forfeit (`AccusationPanel.tsx:260-262`); gaps confirmed by UI inspection |
| Secret-passage 20/60/20 is invented, not authentic movement (§9) | VD | High (rulebook) | `brief:193` — passages are movement edges, no random outcomes |
| Verifier guards names, not semantic truth (§1.8) | DC | High | a semantic/polarity/chronology/invented-people check existed (none in `clue-verifier.ts`) |
| Closing is path-dependent; can cite unread notes / overstate seen field (§1.10) | DC (borders VD) | High | the closing filtered notes from its recap and used a public-only field (it uses all 12 + all-evidence finals) |
| Originals: 8 testimonies, notes vary 1–6; 10+2 is a project choice (§1.9) | Verified | Very high | already counted directly from `original-mysteries.ts` |
| Empirical tables (§0) | Verified | Very high | already reproduced to the case |

## Appendix B — Things the brief got *more* right than it claimed
- Thread self-disclosure is universal, not merely "often" (`fact-harvest.ts:637-645`).
- The world already simulates a `roomClosure` (`world-sim.ts:340-352`) that the turn shell
  never surfaces — a safe dynamism source hiding in plain sight (§9 Phase 4).

## Appendix C — Files inspected
`docs/research/GAMEPLAY_RESEARCH_BRIEF.md`; `src/services/world-sim.ts`,
`fact-harvest.ts`, `clue-scheduler.ts`, `ai-mystery-engine.ts`, `ai-mystery-setup.ts`,
`clue-verifier.ts`; `src/client/pages/GamePage.tsx`, `src/client/hooks/useGameStore.ts`,
`src/client/phone/PhonePlayerPage.tsx`, `src/client/components/AccusationPanel.tsx`,
`src/phone/routes.ts`; `src/data/ai-v3-prompts.ts` (dossier/render/closing prompts);
`src/data/original-mysteries.ts` (testimony/note counts, verified by
script); `scripts/eval-mysteries.ts` (re-run, 500 seeds); docs `AI_ENGINE.md`,
`AI_ENGINE_V3_PLAN.md`, `AI_REDESIGN_COMPARISON.md`, `PROMPT_REDESIGN_NOTES.md`,
`TOPROMPT.md`, `GAME_REFERENCE.md`, `README.md`, `CHANGELOG.md`.
