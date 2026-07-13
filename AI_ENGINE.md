# AI Mystery Engine V3 — "world-first"

> The living doc for the active mystery engine (`engineVersion: 3.0-world`).
> Design rationale and iteration history: [AI_ENGINE_V3_PLAN.md](AI_ENGINE_V3_PLAN.md).
> Older docs (AI_MYSTERY_ENGINE_V2.md, AI_REDESIGN_COMPARISON.md, PROMPT_REDESIGN_NOTES.md, V2_*.md) describe deleted iterations and are historical only.

## The idea in one paragraph

Every earlier engine asked one system to be both the logician and the novelist, and each failed on one side or the other. V3 separates them. Deterministic code simulates a full ground-truth day at Tudor Mansion, harvests every tellable TRUE fact with precise joint-space semantics, and a solver picks WHICH 10 facts become butler clues and 2 become Inspector notes — proving the fair-play pacing against all 12,100 possible solutions before a single word of prose exists. The engine then derives a selected-facts-only chronology and safe earlier-public relationships. Only then does the AI write: an answer-blind dossier and renderer dress the chosen facts in Ashe's voice (few-shot on the ten original DVD mysteries). A final answer-aware call selects a safe salute and public citations; deterministic code assembles the exact solution. The clue writer can't telegraph the answer because it never sees the answer, candidate counts, or elimination data.

## Pipeline

```
deterministic  1. world-sim.ts        seeded day: movement grid (social circles,
                                      gatherings, quiet dawn/retired nights),
                                      item lifecycles, decoy items, innocent threads,
                                      theft embedded as one thread among many
               2. fact-harvest.ts     typed TRUE facts + mention licenses + writer briefs;
                                      factKillsCell() is the single semantics definition
               3. clue-scheduler.ts   joint-grid solver (12,100 cells) selects + orders
                                      reveals; retries cost microseconds
               4. scheduled-case-     selected-facts-only chronology and structural
                  continuity.ts       links; private notes are never callback sources
        AI     5. dossier             answer-blind: occasion, title, signature
               6. render              answer-blind: opening + 10 clues + 2 notes,
                                      few-shot on data/mysteries.json corpus
               7. closing             answer-aware salute + public citation IDs only
deterministic  8. clue-verifier.ts    card-name discipline per mention license;
                                      failures re-render ONE clue (max 2×), never
                                      the whole mystery
               9. closing assembly    capsule-backed citations + exact solution
```

Three provider calls in the typical case; +1 small call per repaired line. The continuity layer adds no model call.

## Narration and evidence boundary

- The renderer sees exactly the 12 scheduled facts, in reveal order and chronological order. It never receives raw `WorldState`, the answer, decoy metadata, candidate counts, kill effects, or unselected facts.
- Structural connections use only shared selected entities, times, or selected thread IDs. A callback source must be an earlier public Butler clue; an Inspector note is never a source.
- A connection licenses continuity of mood, ordinary props, or household activity. It does not widen the current clue's card-name allowlist or authorize another clue's factual claim.
- Occasion color may make a true event feel lived-in, but may not change who, what, where, when, quantity, duration, polarity, source, or certainty.
- The narration is context. The deterministic evidence capsule shown as “Write this down” is the canonical player-recordable claim.
- The verifier proves card-name discipline and output shape; it does not claim to prove arbitrary natural-language entailment. A line that remains invalid after two repairs falls back to its exact capsule.

## Fair-play guarantees (machine-proven per generation)

- After clue 5 + Note 1: **≥ 4 candidates in every category**.
- After clue 7 + Note 2: **≥ 3 candidates in every category**.
- After all 10 clues: suspects 3–6, items 2–5, locations 2–6, times 1–4, and **at least two of items/locations/times converged to ≤ 3** (which two varies by seed — early thefts pin times via discovery, evening thefts pin items via sweeps and lockups, exactly like the original mysteries).
- The answer is **never** eliminated — true facts cannot rule out the world they came from, and the engine asserts it anyway.
- Constraining facts that mention an answer card appear at position ≥ 7; the thief's unexplained absence appears only in the last two clues.
- Decoy items (1–2 pieces nobody accounts for) hold the item category honestly open; the physical dealt cards make the final distinctions, as in the real game.

## Main files

- `src/services/world-sim.ts` — seeded WorldState generator.
- `src/services/fact-harvest.ts` — fact taxonomy, semantics, mention licenses.
- `src/services/clue-scheduler.ts` — joint-space solver, checkpoints, ordering.
- `src/services/scheduled-case-continuity.ts` — selected-case chronology and safe public callback graph.
- `src/services/ai-mystery-engine.ts` — orchestration, progress, diagnostics.
- `src/services/clue-verifier.ts` — deterministic prose checks + repair targets.
- `src/services/ai-mystery-provider.ts` — structured Sonnet calls (unchanged from V2).
- `src/data/ai-v3-prompts.ts` — dossier/render/repair/closing prompt builders.
- `src/data/original-mysteries.ts` — the ten original DVD mysteries (generated from `data/mysteries.json`), used as few-shot examples.

## API and diagnostics

Unchanged surface: `POST /api/scenarios/generate-stream` (NDJSON progress), `POST /api/scenarios/generate`, `GET /api/scenarios/last-ai.json`, `GET /api/scenarios/last-ai-stages.json`. The stages payload now contains the simulated world, harvested facts, the proven schedule with its full candidate-count trajectory, story seeds, scheduled-case continuity, each prompt/response, verification results, and per-line repairs. It contains the hidden answer — local development only.

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

- `FINAL_TARGET` and `CONVERGED_AXES_REQUIRED` in clue-scheduler.ts — final candidate windows.
- Checkpoint bounds (≥4 at position 6, ≥3 at position 9) in clue-scheduler.ts.
- World texture catalogs (gathering options, activities, thread causes) in world-sim.ts.
- Few-shot rotation count in ai-v3-prompts.ts `pickFewshots`.
