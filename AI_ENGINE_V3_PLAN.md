# AI Mystery Engine V3 — Definitive Fix Plan

> **Goal**: DVD-authentic clues that are never obvious early, always solvable, and never fail generation — by separating *what the clues say* (chosen by a deterministic solver) from *how they say it* (written by an answer-blind AI).

---

## 1. Why every previous iteration failed

Seven engine iterations live in git history. Each swung between two poles and inherited the failure of whichever pole it sat on.

| # | Iteration (evidence) | Approach | Why it failed |
|---|---|---|---|
| 1 | Template campaign system (`campaign-planner.ts`, `campaign-clue-generator.ts` — still the non-AI path) | Deterministic plan → fill-in templates | Robotic, repetitive wording. Alibi-speak ("were together in the X, alibied by each other") telegraphs eliminations. TOPROMPT: "Clues clearly single out the answers by their wording." Inspector notes one-note. |
| 2 | `ai-scenario.ts` V1 4-stage (deleted `50d5560`) | AI writes text implementing plan eliminations | 40–60% failure rate. Rigid prefix formats, 50+ banned words, 59 validation error conditions "fighting the AI" (PROMPT_REDESIGN_NOTES). Stage 4 generated 20+ fields in one call. |
| 3 | 5-stage split + few-shot redesign (AI_REDESIGN_COMPARISON, V2_ELIMINATION_SYSTEM) | Smaller focused stages, DVD examples, structured `eliminates` attached to each clue | Better, but the writer *knew* each clue's elimination targets — prose skewed toward "this is an alibi for X, Y, Z." Your observation: knowing the targets skews the clues. |
| 4 | Story pool / corpus / AI 3.1 (`790da9d`, `a9e73a3`, `0dfec80`) | Story-first with corpus templates | Variety improved; logic guarantees weakened. Clues still converged too early (TOPROMPT: "too obvious too early"). |
| 5 | Sonnet story baseline (`609a756`…`ef4c972`) | Rebuilt prompts, separate opening/Inspector passes | Same structural problem; prompt tuning can't fix an architecture problem. |
| 6 | CaseBible engine (`100a126`…`bec7b13`, deleted `73e1be2`) | Case Architect emits full causal bible (timeline, movements, evidence atoms, inferences) under strict schemas + deterministic validator | Died fighting Anthropic strict-schema grammar limits ("compiled grammar is too large"), enum drift, repair passes. Six commits of schema surgery. Asking an LLM to emit a *correct formal world model* is the hard part done in the worst place. |
| 7 | Creative engine 2.1 (current: `ai-mystery-engine.ts`) | One creative call → blind LLM audit → one revision | Great prose, zero guarantees. Solvability is one LLM's opinion (`solvable: true`). Leakage caught by string heuristics after the fact. One failed revision = user-facing generation failure. No machine-readable logic, so `validateGeneratedScenario` is a near no-op for AI scenarios (only checks IDs exist + text non-empty). |

### Root causes, distilled

1. **One system asked to be both logician and novelist.** Mechanical iterations guarantee the puzzle but write like a robot; creative iterations write beautifully but can't guarantee a puzzle exists.
2. **The writer knows too much.** Whenever the text generator sees the answer or per-clue elimination targets, the wording telegraphs them. (Your diagnosis — confirmed by iterations 1–3.)
3. **LLM-as-validator.** An audit call saying "solvable: true" is a guess. Only constraint propagation over the actual 10×11×11×10 space can prove solvability and pacing.
4. **Monolithic retry.** When one clue is bad, every iteration regenerates or revises the *whole mystery* — expensive, unstable, and the revision can break what worked.
5. **Formal correctness demanded from the LLM.** CaseBible required the model to emit a consistent world model under strict schemas. Deterministic code should own the world model; the LLM should only decorate it.
6. **The gold corpus is benched.** `data/mysteries.json` (10 real DVD mysteries) is deliberately *not* shown to the model (`original-mystery-style.ts` gives 6 abstract bullets instead). The single best style resource is unused.

### The decisive insight

Study the original corpus: DVD clues are short, concrete, single-fact anecdotes — and they are *not* obvious early. Obviousness was never caused by the DVD style. It's caused by **which facts are revealed in which order**. The original designers hand-scheduled facts so early clues eliminate broadly (whole categories, group gatherings, absent items) while convergent facts arrive late. That scheduling job is a *search problem over candidate counts* — a job for a solver, not a prompt.

Note also: original clues freely *mention* answer cards ("Mr. Boddy was given the medal by his uncle" — the Medal is the stolen item). Banned-word lists were the wrong tool. Mentions are fine; *constraints against the answer* are not.

---

## 2. V3 architecture: World → Facts → Schedule → Blind Render → Verify

```
┌─────────────────────────────── deterministic (no AI) ───────────────────────────────┐
│ S0 Setup        seed, immutable answer, occasion family, recent signatures           │
│ S1 World sim    full ground-truth day: 10 suspects × 10 time slots movement grid,    │
│                 item lifecycle, household events, theft embedded, 2–3 innocent       │
│                 suspicious threads (red herrings with real causes)                   │
│ S2 Fact harvest derive every true, tellable fact from the world                      │
│ S3 Scheduler    solver picks 10 clue-facts + 2 note-facts + reveal order so the      │
│                 candidate-count curve hits fair-play targets; retry is free          │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────── AI (Sonnet) ─────────────────────────────────────┐
│ S4 Dossier      1 call, answer-blind: occasion color, relationships, motives for the │
│                 innocent threads, title (creative freedom lives here)                │
│ S5 Render       1 call, answer-blind: opening + 10 clues + 2 notes in Ashe/Inspector │
│                 voice, few-shot from data/mysteries.json, per-fact mention license   │
│ S6 Closing      1 small call, the ONLY answer-aware text pass: reveal + explanation  │
│                 grounded in the scheduled facts                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────── deterministic (no AI) ───────────────────────────────┐
│ S7 Verify       vocabulary whitelist, per-clue mention-license check, leakage        │
│                 heuristics (keep existing), opening/closing checks                   │
│ S8 Repair       re-render ONLY the failing clue (max 2×); puzzle validity never      │
│                 depends on the LLM, so generation effectively cannot hard-fail       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Typical cost: **3 Sonnet calls** (dossier, render, closing) — same or cheaper than today's 2–3 large calls, with far smaller outputs per call.

### S1 — World simulation (the piece no iteration ever had)

Pure seeded TypeScript (reuse `seeded-random.ts`). Produces a `WorldState`:

- **Movement grid**: for each of 10 time slots, each suspect's location + activity, obeying board adjacency/secret passages (already in `game-elements.ts`) and occasion structure (meals gather everyone, etc.).
- **Item lifecycle**: where each of the 11 valuables is displayed/kept; events like "sent for repair until Late Morning," "locked in display case after Tea Time."
- **Household events**: spills, deliveries, repairs, locked rooms — the mundane texture DVD clues are made of, each with a cause.
- **The theft**: embedded so the answer suspect is at the answer location at the answer time with access to the item — as *one thread among many*, not the spine of the world.
- **Innocent suspicious threads (2–3)**: e.g., a suspect who slipped away for an innocent reason, a borrowed item, a private argument. These are *true world events* — red herrings with real causes, so later clues can resolve them without inserting false evidence (fixing the never-implemented `redHerrings` from the campaign plan).

Key property: the world is *answer-consistent* but not *answer-shaped*. Suspicion emerges evenly because everyone genuinely did things — your "throw suspicion evenly" requirement, made rigorous.

### S2 — Fact taxonomy

Each fact type carries (a) logical semantics over the four categories, (b) a mention license, (c) 2–3 exemplars from the original corpus. Initial set (~12 types, all attested in `mysteries.json`):

| Fact type | Example semantics | Corpus exemplar |
|---|---|---|
| `gathering` | all suspects in L during T ⇒ eliminates T (and L if undisturbed) | "During tea time all guests were sitting around the rose garden" |
| `presence` | S (or group) in L during T ⇒ eliminates those S for that T | "Mr. Green and Mrs. Peacock left during dinner" |
| `item_absent` | item I not in mansion until T ⇒ eliminates I (or times) | "The pocket watch… was never in the mansion yesterday" |
| `item_seen_intact` | I seen in place at T ⇒ eliminates times ≤ T for I | (Note) "The Item displayed in the Hall…" |
| `category_secured` | all jewelry locked after T ⇒ eliminates category × later times | "all of the Jewelry had been locked up" |
| `access_closed` | L locked/being cleaned during [T1,T2] ⇒ eliminates L | "no one was allowed in there until today" |
| `key_event` | display-case key missing by T ⇒ bounds theft time | "the key… was missing from its hook by breakfast" |
| `discovery_bound` | theft noticed by T ⇒ eliminates later times | "The theft was discovered before sundown" |
| `arrival` | guests arrived at T ⇒ eliminates earlier times for guests | "guests did make it easier by arriving right on time" |
| `object_history` | provenance/ownership color; mention-only, no constraint | "given the medal by his uncle, the late Dr. Black" |
| `personal_remark` | relationship/behavior color; mention-only | "Lady Lavender left her jacket at the mansion" |
| `cross_category` (Inspector) | joint constraint, e.g. "the men were in the Kitchen at Dawn" | Original Inspector notes |

Mention-only facts are how flavor and red-herring threads enter clues without logic weight — this replaces both the banned-word lists (iter. 2) and the unconstrained prose (iter. 7).

### S3 — Scheduler (the fairness engine)

A constraint-propagation solver maintains candidate sets per category and searches fact subsets/orderings until all targets hold (retries cost microseconds, unlike LLM retries):

- **Fair-play curve** (from AI_MYSTERY_ENGINE_V2.md, now enforced not hoped): after clue 5 + Note 1 ≥ 4 candidates in every category; after clue 7 + Note 2: 3–4; after clue 10: 2–3. Answer always in every candidate set.
- **Anti-obviousness constraints** (the "too obvious too early" fix):
  - Convergent facts (any fact reducing a category to ≤ 3) may occupy only positions 8–10.
  - Answer-card names may appear early only via mention-only facts (object_history, personal_remark) — never in a constraining role before position 6.
  - No two consecutive clues may constrain the same category; suspicion-spread score requires every non-answer suspect to appear in ≥ 1 suspicious/notable context and the answer suspect in ≤ 2, never uniquely.
- **Note placement**: N1 and N2 facts reserved for the existing reveal points (after clues 5 and 7), preferring `cross_category` facts like the originals.
- Output: 10 clue-facts + 2 note-facts, ordered, each with derived (hidden) elimination consequences — computed, never told to the writer, used only for validation and the debug payload.

### S4/S5 — Answer-blind rendering (your key requirement)

The renderer receives: the occasion dossier, the world excerpts relevant to each fact, the fact list in order, per-fact mention licenses, and 3 seeded few-shot mysteries drawn from `data/mysteries.json`. It does **not** receive: the answer, candidate counts, elimination consequences, or any "this clue eliminates…" language. It cannot telegraph what it doesn't know. One clue per fact, 1–3 sentences, Ashe's register (the corpus shows it better than any style rules).

### S6/S7/S8 — Closing, verification, surgical repair

Closing is the only answer-aware prose (like the DVD's "A good detective…" recap), required to cite only scheduled facts. Verification is deterministic: every proper noun must be in the 42-card vocabulary + cast list; each clue may name only cards its fact licenses; keep the existing opening-leak and early-convergence heuristics; keep the blind-audit LLM call **as an advisory metric only** (logged, never a gate). A clue failing verification is re-rendered alone with targeted feedback. The puzzle can't be broken by the LLM because the LLM never controls the logic.

---

## 3. How V3 kills each historical failure

| Past failure | V3 answer |
|---|---|
| Robotic template wording (1) | LLM writes all prose, few-shot on the real corpus |
| Writer telegraphs eliminations (1–3) | Writer never sees answer or elimination data |
| Too obvious too early (4–7) | Solver-enforced candidate curve + convergence-position + answer-mention constraints |
| 40–60% generation failures (2) | Logic can't fail (deterministic); prose failures repaired per-clue |
| Validation fighting the AI (2) | Validation checks mentions & vocabulary only; logic pre-proven |
| Strict-schema grammar wars (6) | LLM outputs are small flat objects (strings + one small array) |
| Solvability unproven (7) | Constraint propagation proves it before any prose exists |
| Red herrings defined but unused (1) | Innocent threads are real world events, scheduled like any fact |
| Repetition across games | World-sim seeds × occasion families × rotating few-shots × signature avoidance |
| Hallucinated cards/people | Vocabulary whitelist over 42 cards + fixed cast (TOPROMPT accuracy concern) |

---

## 4. Implementation plan

Expert-only at launch (10 clues + 2 notes + opening + closing + signature — the existing `MysteryEngineResult` contract survives untouched, so routes, streaming progress events, host/phone UI need no changes).

### Phase 0 — Measurement harness first (~1 session)
- `scripts/eval-mysteries.ts`: batch-generate N seeds, output per-seed metrics: candidate-count trajectory, answer-mention positions, convergence position, vocabulary violations, style stats (sentence length, clue length vs corpus), signature diversity.
- Run it against the **current 2.1 engine** to freeze a baseline. Every later phase must beat it. (Fixes "we keep rewriting without measuring" — the meta-failure behind seven iterations.)
- Note: `node_modules` was installed on macOS; tests must run on the host, not a Linux sandbox.

### Phase 1 — World sim + facts + scheduler, no AI (~2–3 sessions)
- `src/services/world-sim.ts` — seeded WorldState generator (uses `game-elements.ts` geometry, `game-constants.ts`).
- `src/services/fact-harvest.ts` — WorldState → typed facts with semantics + mention licenses.
- `src/services/clue-scheduler.ts` — propagation solver + search with the constraint set above.
- **Golden tests**: hand-encode 2–3 original mysteries from `data/mysteries.json` as fact sets; assert the solver reproduces sane candidate trajectories. This proves the fact language is expressive enough for real DVD mysteries before any AI work.
- Unit tests: 1,000 seeds → 100% scheduled, 0 answer eliminations, all curve targets hit.

### Phase 2 — Rendering + verification (~2 sessions)
- `src/data/corpus-fewshots.ts` — load/rotate exemplars from `data/mysteries.json` (finally on the field).
- `src/data/ai-v3-prompts.ts` — dossier, render, closing prompts (each < 200 lines; positive examples, no banned-word lists).
- `src/services/clue-verifier.ts` — vocabulary + mention-license + existing leakage heuristics; per-clue repair loop.
- Reuse `ai-mystery-provider.ts` unchanged (small schemas ⇒ no strict-schema fallback needed).

### Phase 3 — Integration (~1 session)
- `ai-mystery-engine.ts` v3 orchestration behind the same `generateMysteryV2` surface and progress stages; `last-ai.json` gains worldState, facts, schedule, per-clue verification results.
- Keep 2.1 on a branch as rollback, as you did with `ef4c972`.

### Phase 4 — Evaluate, tune, clean up (~1–2 sessions)
- 20-seed eval vs Phase 0 baseline; tune scheduler constraints (they're data, not prompts).
- Manual acceptance per AI_MYSTERY_ENGINE_V2.md: 5-seed novelty comparison, 2 blind playthroughs.
- Delete/rewrite stale docs (AI_REDESIGN_COMPARISON, V2_* guides, PROMPT_REDESIGN_NOTES describe deleted code; AI_MYSTERY_ENGINE_V2.md references deleted `ai-mystery-validator.ts`); update README + CLAUDE.md; single `AI_ENGINE.md` as the living doc.

### Acceptance criteria (all machine-checked except the last)
1. 100/100 seeds generate successfully (per-clue repairs allowed, ≤ 2 per mystery).
2. 0 seeds where the answer is ever excluded from a candidate set.
3. 100% hit the candidate curve (≥4 / 3–4 / 2–3).
4. 0 vocabulary violations; 0 unlicensed answer-card mentions before clue 6.
5. Clue length/register within corpus bounds (e.g., 1–3 sentences, concrete anecdote).
6. Blind human playthrough: not solvable by clue 5, defensible theory by clue 10, closing feels earned.

---

## 5. Risks

- **World sim scope creep** → keep slot-based (10 slots, coarse locations); the corpus proves coarse facts suffice.
- **Renderer drifts from fact semantics** (says more than the fact) → mention license catches names; add a cheap per-clue entailment spot-check only if eval shows drift.
- **Facts feel samey across seeds** → variety lives in world events + dossier + few-shot rotation; eval's signature-diversity metric watches this.
- **Scheduler can't satisfy all constraints for some answers** → constraints are tunable data; golden tests establish feasible bounds early (12,100 solutions × thousands of retries/sec gives huge slack).

## 6. What deliberately does NOT change

Physical components and symbol system; the 42-card data files; routes/API shapes and NDJSON progress; host/phone UI and manual player deduction (no auto-marking — elimination data stays hidden, used only for validation/debug); the template path for DEV/legacy themes until V3 passes acceptance, then retire it.
