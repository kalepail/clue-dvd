# Clue DVD Gameplay Research Index

Date: 2026-07-13  
Scope: repository-grounded research, implementation, and measured follow-up

## Start here

- [`GAMEPLAY_IMPROVEMENT_PLAN.md`](GAMEPLAY_IMPROVEMENT_PLAN.md) — reconciled concern ledger, target experience, architecture, roadmap, gates, and first tickets.
- [`GAMEPLAY_RESEARCH_BRIEF.md`](GAMEPLAY_RESEARCH_BRIEF.md) — verified project map, rule corrections, measurements, and questions given to the panel.
- [`EXTERNAL_DESIGN_EVIDENCE.md`](EXTERNAL_DESIGN_EVIDENCE.md) — official-rule and primary-research evidence, with project-specific inferences clearly separated.
- [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) — the first gameplay implementation slice and live provider qualification.
- [`NARRATIVE_CONTINUITY_REPORT.md`](NARRATIVE_CONTINUITY_REPORT.md) — recording/artifact analysis, second Solo panel, truthful continuity implementation, and fixed-seed unified-billing results.

## Independent high-reasoning panel

- [`panel/FABLE_PRIMARY_REVIEW.md`](panel/FABLE_PRIMARY_REVIEW.md) — Claude Fable, systems/game-design investigation.
- [`panel/SOL_PRIMARY_PLAN.md`](panel/SOL_PRIMARY_PLAN.md) — Codex GPT-5.6 Sol, primary architecture and implementation plan.
- [`panel/TERRA_OPUS_ADVERSARIAL_REVIEW.md`](panel/TERRA_OPUS_ADVERSARIAL_REVIEW.md) — Claude Terra Opus, skeptical/adversarial review.
- [`panel/CODEX54_IMPLEMENTATION_REVIEW.md`](panel/CODEX54_IMPLEMENTATION_REVIEW.md) — Codex GPT-5.4, implementation and testability review.

All four agents ran through Solo against the same repository packet. Fable, Sol, and Terra Opus used their named model setting at high reasoning/effort; Codex GPT-5.4 was added as a second independent Codex adversary. Reports were written before the authors saw one another's conclusions.

## Adversarial cross-review

- [`cross/FABLE_CROSS_REVIEW.md`](cross/FABLE_CROSS_REVIEW.md) — Goodhart effects, fake diversity, prose flattening, and table-perceptibility.
- [`cross/SOL_RECONCILIATION.md`](cross/SOL_RECONCILIATION.md) — final architecture/dependency adjudication.
- [`cross/TERRA_KILL_LIST.md`](cross/TERRA_KILL_LIST.md) — manufactured-concern, hidden-information, and overconfidence kill list.
- [`cross/CODEX54_FEASIBILITY_CHECK.md`](cross/CODEX54_FEASIBILITY_CHECK.md) — smallest safe vertical slices and corrected phase ordering.

Each cross-review read the final evidence packet and all four independent reports. The reconciled plan follows evidence and executable code where reviewers disagree; it does not decide by vote.

## Consensus ledger

### Accepted

- Preserve the deterministic world/fact/joint-grid proof and answer-blind clue renderer.
- Fix the path-dependent closing immediately.
- Add a deterministic evidence capsule as the canonical deduction record while retaining expressive narration.
- Restore lightweight official rituals and action identity without digitizing hidden cards.
- Prototype best-of-K selection only after measuring candidate variance.
- Condition deterministic world supply on occasion, starting with a small catalog profile.
- Treat full event economy and cadence as one Pantry-constrained design decision.

### Modified after challenge

- Use soft diversity diagnostics; no playtest-free quotas.
- Keep pawn position on the physical board unless a location-bound action needs confirmation.
- Treat mention-only threads as solver-neutral but not cognitively neutral.
- Compute evidence partitions for evaluation; do not make every view a hard scheduler gate.
- Use a separate live `ScenarioEventPlan`; never wire historical `world.roomClosure` directly into live board locks.
- Ship occasion, item-lifecycle, and thread supply as independently gated slices rather than one world rewrite.
- Use manual host reporting for inability to pay; the app must not infer hidden-hand state.

### Rejected

- Solver replacement for variety.
- Answer-aware clue writing or answer-aware semantic judging.
- Random narrative “drama” without deterministic state.
- Removing authentic 0–4 accusation feedback.
- Hard diversity, arc, or convergence percentages not tied to player evidence.
- Treating statistical answer-shaped patterns as proven player exploits.
- Mandatory app-side movement confirmation that validates no public state.
- Direct historical-room-closure to live-lock mapping.
- Any app knowledge of drawn, placed, challenged, paid, or held item-card identity.
- Treating eight testimonies or ten-plus-two as the uniquely authentic cadence.

## Verification performed

- `npm run typecheck` — passed.
- `npm test` — 8 files, 69 tests passed.
- `npx -y tsx scripts/eval-mysteries.ts 500` — 500/500 schedules succeeded.
- Additional 500-case instrumentation measured fact portfolio, note portfolio, converged axes, thread selection, and public-only candidate fields.
- Original-corpus counts and the active AI01 route were checked directly.

No `.dev.vars` was present, so no fresh live AI prose batch was generated. The plan makes a live-output audit an explicit gate before adding semantic narration suppression.

## Temporary external-research records

The URL research/extraction skill wrote its raw result records to:

- `/tmp/clue-dvd-external-research.json`
- `/tmp/game-design-primary-research.json`
- `/tmp/hasbro-clue-dvd-rules.json`
- `/tmp/hasbro-clue-dvd-rulebook-pdf.json`
- `/tmp/pcg-game-design-papers.json`
- `/tmp/experience-driven-pcg.json`

The official rulebook PDF was also downloaded to `/tmp/clue-dvd-rulebook.pdf` and OCR-checked locally because direct PDF text extraction returned no usable body.
