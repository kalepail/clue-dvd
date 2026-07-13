# Gameplay Research Implementation Report

This branch implements the research plan in a stacked PR. It preserves the
world-first architecture and the physical cards as the final source of truth.
It does not digitize hidden card identities.

## Implemented

### Truth boundary

- Every scheduled fact now produces a deterministic `EvidenceCapsule`.
- AI narration remains the period-voice layer; the capsule is the exact
  player-facing proposition shown as “Write this down.”
- Butler clues, private notes, history, API types, and the generated scenario
  all carry the same capsule.
- Residual card-license violations fall back one line at a time to the exact
  capsule after two repair attempts. An opening falls back to fixed card-free
  copy. The rest of a successful rendering is preserved.
- Closings no longer accept free-form model reasoning. A model selects a safe
  salute and two real public fact IDs; deterministic code quotes those capsule
  statements, credits physical cards/suggestions/deduction, and states the
  exact solution. Invalid IDs and factual salutes fall back safely.
- The closing uses the complete public Butler record only. It never cites a
  private note or claims every clue was heard before an early solution.

### Case variety

- Occasion families now alter gathering options, room activities, innocent
  thread causes, display behavior, and witnessed item handling. They no longer
  affect only the dossier prompt.
- Items can be truthfully handled before the theft. Answer-item handling is
  restricted to witnessed events before the answer time in its home room.
- Innocent red-herring threads have a suspicious setup and a later verified
  explanation. The scheduler never reveals the resolution first.
- Note 1 is labeled and prompted as a cross-index; Note 2 is a late
  discriminator/reconciliation.

### Schedule selection

- The engine compares up to eight hard-valid schedules instead of accepting
  the first one.
- Selection is lexicographic: physical-card usefulness, prose-rhythm penalty,
  then a deterministic signature.
- Hard checkpoints, answer survival, final windows, and late answer-mention
  rules are unchanged.
- A soft finish objective prefers converged public axes to leave two or three
  candidates rather than collapse to one. Search attempts explore different
  convergence shapes; no mutable recent-history target enters truth or
  fairness.

### Physical turn shell

- “Reveal Clue” is now “Summon the Butler.”
- A summon is explicitly barred from the Evidence Room, publicly reveals
  testimony, and waits for acknowledgement of the private top-Pantry item-card
  draw before advancing the turn.
- Suggestions select exactly three of WHO/WHAT/WHERE/WHEN. Only category names
  are logged; physical card identities and table responses stay off-device.
- Wrong accusations wait for acknowledgement that the exact number of item
  cards was turned face-up into the Evidence Room. “Cannot pay” removes the
  pawn from turn rotation. Counts are recorded; identities are not.
- Secret passages are physical board movement again, not an unseeded
  reward/penalty minigame. Passage movement does not consume the turn action.
- Pantry draws and accusation payments survive refresh/reconnect as recoverable
  pending physical steps.

### Provider and evaluation support

- The provider supports Cloudflare AI bindings and REST fallback.
- Native request/response shapes are normalized for Anthropic Messages,
  OpenAI Responses, xAI-compatible chat tools, and Workers AI.
- The evaluation harness runs identical seeds across selected models and
  reports repairs, unresolved violations, latency, repeated openers, generic
  phrase flags, staged threads, capsules, and the number of schedules compared.
- `.dev.vars.example` documents configuration. Real `.dev.vars` remains
  ignored and mode-restricted. A post-build cleanup removes the Cloudflare
  plugin’s generated `dist/clue_dvd/.dev.vars` copy.

## Measured gates

The final deterministic sweep passed 500/500 seeds. Mean architecture time was
66.6 ms per mystery. World attempts were: 426 first-try, 64 second-try, 8
third-try, 1 fourth-try, and 1 sixth-try.

The soft finish change improved axis variety without weakening a hard gate:

| Projection after all 12 scheduled facts | Before soft finish | After soft finish |
| --- | ---: | ---: |
| Location at 2–3 candidates | 18/500 | 99/500 |
| Item still at 4–5 candidates | 18/500 | 94/500 |
| Schedule success | 500/500 | 500/500 |

Time is still the dominant converged axis (495/500 cases at 1–3 candidates,
277/500 fully collapsed to one). This remains a measured limitation. It should
not be “fixed” with a hard quota until additional truthful, time-flexible fact
mechanisms exist and blind play shows the collapse harms the physical finish.

In the 120-case invariant sweep, 45 schedules included a complete staged
innocent thread. All 45 revealed setup before resolution. Occasion-specific
topology differed in at least 20/24 paired same-seed comparisons, while the
answer stayed identical.

## Live model qualification

The final paired real-gateway pass used seed `900000` for every model. These
numbers are qualification evidence, not a model leaderboard; one seed is too
small for a quality ranking.

| Model | Result | End-to-end | Repairs | Notes |
| --- | ---: | ---: | ---: | --- |
| `anthropic/claude-opus-4.8` | 1/1 | 22.3 s | 0 | Qualified |
| `anthropic/claude-sonnet-5` | 1/1 | 22.5 s | 1 | Qualified |
| `openai/gpt-5.6-luna` | 1/1 | 8.0 s | 0 | Qualified on final fallback build; no unresolved violations |
| `openai/gpt-5.6-terra` | 1/1 | 11.5 s | 0 | Qualified |
| `openai/gpt-5.6-sol` | 1/1 | 18.4 s | 0 | Qualified |
| `openai/gpt-5.4` | 1/1 | 9.9 s | 0 | Qualified |
| `xai/grok-4.3` | 1/1 | 57.9 s | 2 | Functional, but latency and intermittent tool compliance need more sampling |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 1/1 | 135.0 s | 0 | Functional but too slow for the default path |
| `@cf/openai/gpt-oss-120b` | 0/1 | — | — | Did not call the forced dossier tool |
| `@cf/moonshotai/kimi-k2.6` | 0/1 | — | — | Exhausted 3,200 output tokens before dossier completion |
| `@cf/qwen/qwen3-30b-a3b-fp8` | 0/1 | — | — | Returned 11 clues despite the ten-clue schema |

The earlier two-seed pass also completed 2/2 for Opus, Sonnet, Luna, Terra,
and GPT-5.4. Sol completed both independent real-gateway passes. The live runs
directly exposed and led to fixes for malformed deterministic item grammar,
free-form closing hallucinations, OpenAI incomplete-response detection, and
residual per-line license fallback.

## Deliberately gated, not half-shipped

The full facedown-item event economy is not implemented in this branch. Ten
non-solution item cards currently fund ten Butler summons. Placing cards from
the same Pantry onto board locations without changing cadence would strand
scheduled clues on reachable play paths.

Before placement events, Inspector Challenges, and live door/passages events
ship, choose and conservation-test one delivery model:

1. eight summons plus two Pantry-to-board placements;
2. ten testimonies where specified later summons do not draw a card, clearly
   labeled as a house variant; or
3. relocation events that move already-circulating cards without consuming an
   additional Pantry draw.

The entry gate is a count-only reachable-state graph proving, for every action
and event path, that Pantry + facedown board + player hands + face-up Evidence
Room always equals ten and every scheduled public fact remains deliverable.
No implementation may store a hidden card identity.
