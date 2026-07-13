# AI Mystery Engine V2

The active AI path builds a causal theft mystery before it writes any player-facing prose. Commit `ef4c972` is the pre-V2 rollback checkpoint; the implementation lives on `codex/ai-mystery-engine-v2`.

## Runtime flow

1. Application code fixes the seed, immutable WHO/WHAT/WHERE/WHEN answer, occasion family, verified 42-card world, and up to five recent novelty signatures.
2. The Case Architect returns a private, schema-validated case bible: cast goals, relationships, timeline, movements, item histories, theft, discovery, deceptions, innocent suspicious threads, evidence atoms, inferences, clue blueprints, and Inspector evidence.
3. The Renderer turns those blueprints into an occasion-only opening, ten linked Ashe fragments, and an evidence-provenanced closing.
4. The Inspector pass renders the two reserved factual evidence records for the clue-5 and clue-7 reveal points.
5. A blind auditor receives only the public package and reconstructs candidates and story state after clues 5, 7, and 10.
6. If either deterministic checks or the blind audit fail, one public-only revision is followed by one final blind audit. A second failure rejects the generation.

Normal generation uses four Sonnet calls. A revision path uses six. There is no fallback to the former prompt system.

## Fair-play target

- After clue 5 and Note 1: at least four plausible cards remain in every category.
- After clue 7 and both notes: three or four remain in every category.
- After all public evidence: two or three remain in every category.
- The correct card remains plausible and supported throughout.
- Physical cards still make the final distinction.

Private `rulesOut` effects exist only for validation. AI scenario clues omit `eliminates`, so the host UI neither displays an answer badge nor automatically marks a card.

## Main files

- `src/services/ai-mystery-engine.ts` — multi-call orchestration, progress, and diagnostics.
- `src/services/ai-mystery-setup.ts` — seed/answer selection and the elimination-free scenario shell.
- `src/services/ai-mystery-provider.ts` — forced structured Sonnet calls and bounded transient retries.
- `src/services/ai-mystery-schemas.ts` — Zod runtime contracts and generated Anthropic tool schemas.
- `src/services/ai-mystery-validator.ts` — lore, timeline, movement, provenance, pacing, leakage, and audit checks.
- `src/data/ai-mystery-prompts.ts` — five compact stage prompts.
- `src/data/original-mystery-style.ts` — principles distilled from the original cases without copied clue text.
- `data/mysteries.json` — original-game reference/test material only; it is not injected into generation.
- `src/routes/scenarios.ts` — synchronous and streamed endpoints plus V2 scenario mapping.

## API and diagnostics

- `POST /api/scenarios/generate-stream` returns newline-delimited JSON progress events and one final scenario or stage-specific error. It has no application-level overall timeout.
- `POST /api/scenarios/generate` remains available for compatibility.
- `GET /api/scenarios/last-ai.json` downloads the complete most-recent diagnostic record.
- `GET /api/scenarios/last-ai-stages.json` exposes setup, case bible, rendered draft, Inspector evidence, blind audit, optional revision, final audit, and final package as distinct sections.

The debug payload contains the hidden answer and case bible. It is for local development only and must not be shown to players.

## Local testing

Set `ANTHROPIC_API_KEY` in `.dev.vars`, then run:

```bash
npm run dev
```

Open `http://localhost:5173`, create an AI Mystery, and watch the live stage and elapsed-time display. Do not inspect `last-ai.json` until after a blind playthrough.

Automated checks:

```bash
npm run typecheck
npm test -- --run
npm run build
```

Manual acceptance remains intentionally human:

1. Generate at least five seeds and compare occasion, motive, relationship, and deception signatures.
2. Play at least two cases without debug data.
3. Confirm the shared timeline and motivated lies can be reconstructed.
4. Confirm no complete theory dominates by clue 5 or Note 2.
5. Confirm the final answer feels supported while the physical cards remain necessary.

## Deferred scope

Digitizing the board, cards, and physical pieces for fully remote play is deliberately deferred until this mystery engine passes repeated manual acceptance.
