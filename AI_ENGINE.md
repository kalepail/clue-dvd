# AI Mystery Engine V3 — "world-first"

> The living doc for the active mystery engine (`engineVersion: 3.0-world`).
> Design rationale and iteration history: [AI_ENGINE_V3_PLAN.md](AI_ENGINE_V3_PLAN.md).
> Older docs (AI_MYSTERY_ENGINE_V2.md, AI_REDESIGN_COMPARISON.md, PROMPT_REDESIGN_NOTES.md, V2_*.md) describe deleted iterations and are historical only.

## The idea in one paragraph

Every earlier engine asked one system to be both the logician and the novelist, and each failed on one side or the other. V3 separates them. Deterministic code simulates a full ground-truth day at Tudor Mansion, harvests every tellable TRUE fact with precise joint-space semantics, and a solver picks WHICH 10 facts become butler clues and 2 become Inspector notes — proving the fair-play pacing against all 12,100 possible solutions before a single word of prose exists. Only then does the AI write: an answer-blind dossier and renderer dress the chosen facts in Ashe's voice (few-shot on the ten original DVD mysteries), and a final answer-aware call writes the closing reveal. The prose model can't telegraph the answer because it never sees the answer, candidate counts, or any elimination data.

## Pipeline

```
deterministic  0. occasion-catalog.ts authored occasion spine: named beats,
                                      activities, excuses, props, set dressing
               1. world-sim.ts        seeded day: movement grid (social circles,
                                      gatherings, quiet dawn/retired nights),
                                      item lifecycles, decoy items, innocent threads,
                                      theft embedded as one thread among many
               2. fact-harvest.ts     typed TRUE facts + mention licenses + writer briefs;
                                      factKillsCell() is the single semantics definition
               3. clue-scheduler.ts   joint-grid solver (12,100 cells) selects + orders
                                      reveals; retries cost microseconds
        AI     4. dossier             answer-blind: occasion, title, signature
               5. render              answer-blind: opening + 10 clues + 2 notes,
                                      few-shot on data/mysteries.json corpus
               6. closing             the ONLY answer-aware prose
deterministic  7. clue-verifier.ts    card-name discipline per mention license;
                                      failures re-render ONE clue (max 2×), never
                                      the whole mystery
```

Three Sonnet calls in the typical case; +1 small call per repaired line.

## Fair-play guarantees (machine-proven per generation)

- After clue 5 + Note 1: **≥ 4 candidates in every category**. After clue 7 + Note 2: **≥ 3**.
- After all 10 clues: suspects 3–7, items 4–7 (three-to-five decoy items keep the field broad — dealt cards close it), locations 3–5, times 1–3.
- The answer is **never** eliminated — true facts cannot rule out the world they came from, and the engine asserts it anyway.
- There are NO placement gates: the checkpoints are the fairness floor, and discretion lives in the wording — the theft hour is described by the day's rhythm ("the lull after lunch"), never named, with rhythm phrasing used for innocent hours too so it is house style, not a fingerprint.
- Statements are not evidence: claims and half-memories eliminate nothing. The thief's false alibi is dealt only alongside the true testimony that exposes it.

## Texture (why consecutive games read differently)

- Clue selection is people-first: company, absences, and comings-and-goings outrank item bookkeeping wherever either would do; redundant tallies are pruned; the Inspector's notes carry the lists.
- Even story reveal: each clue carries roughly its fair share of the day's information — no whisper-whisper-thunder pacing.
- Every game begins with an answer-blind authored occasion spine. Its beats, activity vocabulary, props, excuses, and gathering labels are world truth before movements or clues exist; the dossier elaborates that same day instead of inventing flavor afterward.
- Every game seeds motives for several suspects (the thief's is revealed in the closing), occasion-native social activities, dispersal hours where guests are ordinarily alone, and sometimes a catchable lie or a foggy memory.
- Few-shot lines are drawn across all ten original disc mysteries, plus a per-game narrative register for Ashe (fond, clipped, wry, flustered, confiding).
- Butler opening variety is machine-checked across the whole package: no first word repeats and at most two of ten clues may use the classic greeting openers. Violations repair only the offending clue.

## Main files

- `src/services/world-sim.ts` — seeded WorldState generator.
- `src/data/occasion-catalog.ts` — authored occasion families and deterministic spines.
- `src/services/fact-harvest.ts` — fact taxonomy, semantics, mention licenses.
- `src/services/clue-scheduler.ts` — joint-space solver, checkpoints, ordering.
- `src/services/ai-mystery-engine.ts` — orchestration, progress, diagnostics.
- `src/services/clue-verifier.ts` — deterministic prose checks + repair targets.
- `src/services/ai-mystery-provider.ts` — structured Sonnet calls (unchanged from V2).
- `src/data/ai-v3-prompts.ts` — dossier/render/repair/closing prompt builders.
- `src/data/original-mysteries.ts` — the ten original DVD mysteries (generated from `data/mysteries.json`), used as few-shot examples.

## API and diagnostics

Unchanged surface: `POST /api/scenarios/generate-stream` (NDJSON progress), `POST /api/scenarios/generate`, `GET /api/scenarios/last-ai.json`, `GET /api/scenarios/last-ai-stages.json`. The stages payload now contains the simulated world, harvested facts, the proven schedule with its full candidate-count trajectory, story seeds, each prompt/response, verification results, and per-line repairs. It contains the hidden answer — local development only.

## Testing

```bash
npm run typecheck
npm test -- --run        # engine mocks, 120-seed scheduler sweep, world invariants,
                         # golden corpus test (original mystery #1 in the fact language),
                         # verifier, setup, provider, campaign, route tests
npx tsx scripts/eval-mysteries.ts 500          # deterministic metrics, no API needed
npx tsx scripts/eval-mysteries.ts 200 --ai 3   # + real prose generations
```

Manual acceptance stays human: generate several seeds, compare signatures, play two cases blind, confirm no theory dominates by clue 5, confirm the closing feels earned.

## Tuning knobs (all data, no prompt surgery)

- `FINAL_TARGET` in clue-scheduler.ts — final candidate windows; `PEOPLE_BIAS` — the people-vs-bookkeeping lean.
- Checkpoint bounds (≥4 at position 6, ≥3 at position 9) in clue-scheduler.ts.
- Occasion beats, activity/prop vocabularies, excuses, anonymity devices, and thread causes in `occasion-catalog.ts`; motives and physical-world catalogs in world-sim.ts.
- `HOUR_STANDINS` in fact-harvest.ts plus each occasion's beat phrases. Innocent-hour vague-reference rate: 40%; the answer hour is always a beat/rhythm stand-in and never a printed card name.
- Few-shot rotation count in ai-v3-prompts.ts `pickFewshots`.
- Butler opener policy in `clue-verifier.ts` `verifyClueOpeningVariety` (unique first words, at most two greeting-style openings).
