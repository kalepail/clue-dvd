# AI Mystery Engine V3.1 — Scene & Occasion

> The living doc for the active mystery engine (`engineVersion: 3.1-scene`).
> Design rationale and iteration history: [AI_ENGINE_V3_PLAN.md](AI_ENGINE_V3_PLAN.md).
> Older docs (AI_MYSTERY_ENGINE_V2.md, AI_REDESIGN_COMPARISON.md, PROMPT_REDESIGN_NOTES.md, V2_*.md) describe deleted iterations and are historical only.

## The idea in one paragraph

Every earlier engine asked one system to be both the logician and the novelist, and each failed on one side or the other. V3 separates them. Deterministic code simulates a full ground-truth day at Tudor Mansion and harvests every tellable TRUE fact with precise joint-space semantics. V3.1 then selects story first: an answer-blind recipe reserves a connected scene skeleton before the solver fills the remaining slots and proves the fair-play pacing against all 12,100 possible solutions. Only then does the AI write. An answer-blind dossier and renderer dress the chosen lived scenes in Ashe's voice (few-shot on the ten original DVD mysteries), and a final answer-aware call writes the closing reveal. The prose model cannot telegraph the answer because it never sees the answer, candidate counts, or elimination data.

## Pipeline

```
deterministic  0. occasion-catalog.ts authored occasion spine: named beats,
                                      activities, excuses, props, set dressing
               1. world-sim.ts        seeded day: movement grid (social circles,
                                      gatherings, quiet dawn/retired nights),
                                      featured cast, continuing scene episodes,
                                      item lifecycles, decoy items, answer-symmetric
                                      suspicious side threads,
                                      theft embedded as one thread among many
               2. fact-harvest.ts     typed TRUE facts + mention licenses + writer briefs;
                                      factKillsCell() is the single semantics definition
               3. clue-scheduler.ts   pass 1 reserves a 3-5 fragment story recipe;
                                      pass 2 proves/fills around it over 12,100 cells
        AI     4. dossier             answer-blind: occasion, title, signature,
                                      beat-bound cosmetic vocabulary
               5. render              answer-blind: opening + 10 clues + 2 notes,
                                      few-shot on data/mysteries.json corpus
               6. closing             the ONLY answer-aware prose
deterministic  7. clue-verifier.ts    card-name discipline per mention license;
                                      failures re-render ONE clue (max 4×), never
                                      the whole mystery
```

Three `claude-opus-4-8` calls in the typical case; +1 small call per repaired line.

## Fair-play guarantees (machine-proven per generation)

- After clue 5 + Note 1: **≥ 4 candidates in every category**. After clue 7 + Note 2: **≥ 3**.
- After all 10 clues: suspects 3–7, items 4–7, locations 3–6 (up to 7 for an edge-hour case), and times 1–3 (up to 4 for an edge-hour case). The dealt physical cards close the intentionally ambiguous field.
- The answer is **never** eliminated — true facts cannot rule out the world they came from, and the engine asserts it anyway.
- There are NO clue-kind placement gates. Inspector positions are delivery slots rather than a restricted fact caste. The only ordering dependency is narrative causality inside a linked episode: a setup/fused scene (or, when no setup is dealt, its continuous-presence recollection) precedes its excuse, witness, or attributed claim.
- The theft hour is described by the day's rhythm ("the lull after lunch"), never named. Rhythm phrasing is used for innocent hours too, and unnamed phrases are filtered against the hidden printed hour globally so an innocent phrase such as "before dinner" cannot leak Dinner when Dinner is the answer.
- Statements, excuses, motives, and half-memories are not elimination evidence. Lies remain deliberately unpaired; players' dealt cards are the truth baseline.

## Texture (why consecutive games read differently)

- Pass 1 samples one of four answer-blind story recipes: witness-centric, statement-driven, motive-and-fog, or continuing-scene. It reserves 3–5 Butler slots before deduction economics can consume the package.
- Pass 2 restores the hard checkpoints around that skeleton. Episode continuations are preferred when they can do deduction work and story work in the same slot; if a skeleton is infeasible, its least essential fragment is removed before a new world is attempted.
- Scene coherence is a soft selection bonus, never a quota. At most two separately dealt fragments from one episode can appear (a fused clue may itself contain setup, departure, and continuation), and no clue shape is reserved for an early or late position.
- Every game begins with an answer-blind authored occasion spine. Its beats, activity vocabulary, props, excuses, and gathering labels are world truth before movements or clues exist; the dossier elaborates that same day instead of inventing flavor afterward. Dossier output is now limited to the three cosmetic fields the renderer actually consumes: beat-indexed gathering details, aftermath inspection contexts, and stage-neutral item-observation contexts. Empty arrays fall back to that occasion's authored props—not generic manor language.
- Gathering texture is bound by index to a concrete spine beat and screened against other day parts. Item-observation texture rejects completion words such as "after," "returned," "last," and "finished," so decoration cannot move a sighting outside its factual hour.
- Three to five featured suspects are sampled uniformly on a dedicated answer-blind random stream. They supply recurring private preoccupations to whichever truthful scenes are selected, while the episode itself supplies occasion props; this keeps character continuity without repeating one decoration in every clue. Featured casting has **no influence on movement, motive supply, schedule feasibility, or clue scoring**. This prevents rejection sampling from making a richly drawn suspect more likely to be the thief.
- The movement grid is formalized into maximal multi-hour episodes. A scene survives guests joining or leaving while at least two people remain together in one location; shorter contained spans are removed. Two substantial answer-blind guest circles make genuine social departures available even when side threads occupy several people. Occasion activities cycle without replacement on an isolated cosmetic random stream, so richer vocabulary cannot perturb movements or fairness.
- Routine step-aways use occasion-native excuse machinery at innocent hours. The simulator's forced culprit placement at the exact answer cell is private truth: its entry/exit boundaries are deliberately excluded from transition remarks and fused departure facts. That prevents the required theft placement from making the culprit uniquely likely to receive the day's richest suspicious scene.
- Unrelated episodes receive distinct props and private preoccupations whenever the catalog permits; recurrence is reserved for a connected episode or the same featured person. This makes callbacks feel intentional instead of recycling the same decoration across unrelated scenes.
- Episodes harvest into linked fact shapes. `scene_continuation` is truthful alibi evidence with exact suspect/hour-pair semantics; `excuse_given` and `witness_account` are mention-only story pieces. `scene_evidence` fuses a compatible lived scene with a same-location check or same-hour object sighting and softly rotates among clearing, inspection, material-count, and object-in-scene codas. Witness accounts share one public wrapper across true innocent departures, true thief departures, innocent fabrications, and thief fabrications; their public episode scaffold is chosen before private truth status, the renderer never receives the private variant or unnamed departer, and two reports from the same speaker cannot both be dealt.
- A later recurrence of the same company/activity is harvested as a return payoff ("X had rejoined them and the rehearsal resumed") rather than a duplicate location atom. Attributed alibis retain the occasion activity they claim and link to a real room episode when one exists, while remaining mention-only whether true or false.
- A truthful statement about a whole-company gathering links to that gathering as a setup/payoff pair. Ordinary gatherings remain ordinary facts, so they cannot masquerade as empty story arcs or crowd testimony out of the skeleton.
- Linked story seeds tell the renderer which earlier testimony they continue. The model connects the scene naturally instead of restating its setup; a surgical repair receives the earlier rendered line as continuity context.
- Story seeds also carry deterministic scope, continuity, setting, questioned-actor, and continuing-witness locks. Render/repair calls know whether a fact covers named people or the whole household, exactly who stepped away, exactly who remained together afterward, and whether its locations are outdoors. The verifier rejects company expansion, ambiguous departures, dropped continuation evidence, invented departures, and indoor language for the Fountain or Rose Garden.
- Every game seeds a fixed five-person motive field—the thief plus four uniformly selected innocents—so the closing always has a why without coupling motive supply to featured casting. Suspicious errands, borrowed objects, private exchanges, and surprise tasks may involve the thief or an innocent at natural chance; fog chooses its speaker and hour without consulting the answer. The old culprit-excluding side-thread pool and 30%-theft-hour fog anchor are gone.
- Few-shot lines are drawn across all ten original disc mysteries, plus a per-game narrative register for Ashe (fond, clipped, wry, flustered, confiding).
- Butler opening variety is machine-checked across the whole package: canned greeting openers are forbidden, all ten substantive first words must differ, and empty filler openings are rejected. Repeated five-word prose is repaired while shared card names are ignored. When the repetition is an intentional recurring subplot, the repair sees the exact comparison clue so it preserves the motif from a different angle instead of oscillating between synonyms.
- Deterministic grammar checks cover malformed participial openings, impersonal "one found" testimony, articles before printed multiword times, ambiguous pronouns at departures, and false positives caused by explicit negative language such as "not one person broke away." Complex scene clues retain a 54-word ceiling; up to four bounded single-line repairs are allowed when one correction exposes a second package-level problem.
- `cluePatternSignature` records recipe, fact-kind mix, episode shapes, and rendered opening-style counts. The client supplies the last five signatures so consecutive games prefer a different structural recipe as well as a different occasion.

## Main files

- `src/services/world-sim.ts` — seeded WorldState generator.
- `src/data/occasion-catalog.ts` — authored occasion families and deterministic spines.
- `src/services/fact-harvest.ts` — fact taxonomy, semantics, mention licenses.
- `src/services/clue-scheduler.ts` — joint-space solver, checkpoints, ordering.
- `src/services/ai-mystery-engine.ts` — orchestration, progress, diagnostics.
- `src/services/clue-verifier.ts` — deterministic prose checks + repair targets.
- `src/services/ai-mystery-provider.ts` — structured Anthropic calls and active model selection.
- `src/data/ai-v3-prompts.ts` — dossier/render/repair/closing prompt builders.
- `src/data/original-mysteries.ts` — the ten original DVD mysteries (generated from `data/mysteries.json`), used as few-shot examples.

## API and diagnostics

Unchanged surface: `POST /api/scenarios/generate-stream` (NDJSON progress), `POST /api/scenarios/generate`, `GET /api/scenarios/last-ai.json`, `GET /api/scenarios/last-ai-stages.json`. Generation requests may include both `recentMysterySignatures` and `recentCluePatternSignatures`. Scenario metadata stores both signatures. The stages payload contains the simulated world, harvested facts, story recipe and skeleton, full candidate-count trajectory, linked story seeds, prompts/responses, verification, and per-line repairs. It contains the hidden answer — local development only.

## Testing

```bash
npm run typecheck
npm test -- --run        # engine mocks, 120-seed scheduler sweep, world invariants,
                         # golden corpus test (original mystery #1 in the fact language),
                         # verifier, setup, provider, campaign, route tests
npm run eval:mysteries -- 120          # deterministic release metrics, no API needed
npm run eval:mysteries -- 120 --world-only # fast attempt-one supply/symmetry audit
npm run eval:mysteries -- --inspect-seed 43 # save one deterministic slate as JSON
npm run eval:mysteries -- 120 --ai 3   # + three real prose generations
```

Manual acceptance stays human: generate several seeds, compare signatures, play two cases blind, confirm no theory dominates by clue 5, confirm the closing feels earned.

## Tuning knobs (all data, no prompt surgery)

- `FINAL_TARGET`, `timesMaxFor`, and `locationsMaxFor` in clue-scheduler.ts — final candidate windows.
- Checkpoint bounds (≥4 at position 6, ≥3 at position 9) in clue-scheduler.ts.
- Story recipe composition, 3–5 skeleton size, episode coherence bonus, two-fragment episode ceiling, soft composite-form diversity, and preferred-recipe retry share in clue-scheduler.ts. The final retry quarter cycles every supplied recipe so recent-pattern memory can never veto feasibility.
- Occasion beats, activity/prop vocabularies, excuses, anonymity devices, and thread causes in `occasion-catalog.ts`; motives and physical-world catalogs in world-sim.ts.
- Featured-cast size: 3–5; planned routine step-aways: 1–3; retained scene episodes: up to 6; deterministic simulated-day search budget: 240. These are world/scheduler composition knobs, never clue-position gates.
- Witness-account supply: 2–3 per anonymity-capable world; fabrication target 30–40%; thief-as-witness target 25–38% in both raw supply and dealt accounts; no duplicate dealt speaker.
- `HOUR_STANDINS` in fact-harvest.ts plus each occasion's beat phrases. Innocent-hour vague-reference rate: 40%; the answer hour is always a beat/rhythm stand-in and never a printed card name.
- Few-shot rotation count in ai-v3-prompts.ts `pickFewshots`.
- Butler opener policy in `clue-verifier.ts` `verifyClueOpeningVariety` (all ten first words distinct, no greeting-style openings, no empty interjection padding).
- Single-line repair budget and complex-scene length in `ai-mystery-engine.ts` / `clue-verifier.ts` (four bounded attempts; 54 words). Repairs never alter the scheduled fact or regenerate the mystery.

## Current deterministic release audit

The frozen 07/13/26 120-seed real-catalog sweep passes every gate: 120/120 schedules, 113/120 (94.2%) statement-shaped games, 120/120 with a multi-fragment episode, and a largest recipe share of 35%. Butler packages average 5.2 person-centered clues and name 8.6 distinct suspects. Eighty-eight games contained explicitly questioned conduct; 69 gave comparable attention to at least two different suspects. The answer appeared in that questioned field 16 times against an answer-blind expectation of 18.7, confirming that the forced theft placement no longer spotlights its culprit. All five texture families and all four witness variants appeared; featured-thief incidence was 47 against a 47.7 expectation, suspicious-thread culprit incidence was 31 against 35.0 expected, and fog matched the answer hour in 4/58 cases (6.9%, natural chance). Nine games supplied a cleared-with-motive red herring. There were zero story-floor, spine-overlap, answer-hour, wide-Butler-inventory, or deterministic-brief-language failures. The separate 120-world attempt-one audit found only five worlds without a natural step-away and retained healthy witness/suspicion symmetry.

## Current live acceptance audit

The latest targeted Opus regressions completed with no unresolved verifier defects across three more occasion families: costume seed `930000`, scholarly seed `931013`, and engagement seed `932026`. The costume case preserved both halves of a complex departure scene—Lady Lavender's named exit and the four guests who remained together—instead of rendering only the suspicious action. The scholarly case connected recurring lens and note-taking material without questioning the culprit, while the engagement case naturally produced the desired anonymous-witness shape: an occasion-native interruption, uncertain identity, and no forced theory. All ten Butler clues in each final package used different substantive opening words. Diagnostics are saved under `tmp/ai-evals/` locally.
