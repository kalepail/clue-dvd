# Scene & Occasion Plan — the next engine phase

> Implementation plan for the next major iteration of the V3 engine. Written for
> a fresh agent. Read AI_ENGINE.md first (architecture + invariants), then this.
> Everything here EXTENDS V3 — nothing is a rewrite. Work on top of the current
> committed checkpoint; commit after each phase passes verification.

## Goal

The opening paragraph already sets a rich stage, but the clues never revolve
around it, and facts render as flat atoms. The target is clues like these two
north stars (owner-authored, costume-party theme):

> **N1 (fused continuing scene):** "Mr. Green and Mrs. Scarlet spent time
> admiring one another's elaborate costumes in the lounge where the snacks
> were for tea time. They must have enjoyed that time catching up because they
> stayed there through dinner, almost missing the big party."

> **N2 (anonymous witnessed departure — the owner's favorite):** "During the
> party's most exciting moments at night, one of the guests spilled something
> on themselves. Plum said he noticed someone leave rather quickly to, as they
> put it, 'change their costume,' though he wasn't sure who it was due to
> their mask."

Why they work (build THESE mechanics, not these sentences):

- **N1** fuses TWO truthful facts (Lounge at Tea Time + still there at Dinner)
  into one continuing scene, dressed in occasion activity (admiring costumes),
  occasion set-dressing (where the snacks were), and a reference to the day's
  main event ("almost missing the big party").
- **N2** is a *claim* (mention-only, eliminates nothing) wearing occasion
  clothing: an occasion-native excuse (spilled drink → change costume), an
  occasion-native anonymity device (masks), a BEAT time reference ("the
  night's most exciting moments" — spans dusk/night/midnight, never resolved),
  no statement about whether they returned, and a witness who *might be the
  thief inventing the whole thing*. It adds story and a possible theft moment
  while nailing down nothing.

## Root causes of the current flatness

1. **Occasion is decided after the facts.** `ai-mystery-engine.ts` picks an
   `occasionFamily` string; the dossier AI invents the occasion details AFTER
   world/harvest/schedule are locked. Briefs are written theme-blind with
   generic manor labels ("a turn about the gardens"), so the renderer can only
   sprinkle theme words on top. There is already a thin hook —
   `occasionTexture` in ai-v3-prompts.ts ("promoted to world truth after
   dossier design") with generic defaults — but it barely reaches the facts.
2. **Facts are atoms.** The harvest flattens the simulated day into independent
   facts; the scheduler scores them independently (except the late-theft
   basket and the LIE/MOTIVE/FOG threadIds — small existing steps toward arcs).
   Nothing links "the group at their activity" to "the one who stepped out" to
   "the excuse they gave."
3. **Openings repeat.** ~70% of rendered clues open with a greeting
   ("Hello," / "Coming," / "Good day"). That is a render-prompt + verifier
   problem, cheap to fix, independent of everything else.

## Non-negotiable invariants (hard-won; do not trade any of these away)

- **No answer-aware AI call ever touches clue material.** An earlier proposal
  (answer-aware "Story Architect") was rejected: code can check word leakage
  but not narrative gravity — an LLM building a story around a known theft
  makes the theft thread systematically the richest one, and the owner (who
  knows the generator's rules) will read the architecture. Scenes are built by
  DETERMINISTIC CODE from authored catalogs. The AI's imagination goes into
  the catalogs, offline, at design time — never into runtime truth.
- **Anti-meta-gaming symmetry:** no clue shape, wording style, or frequency may
  correlate with the answer. Every wrapper that can carry a false statement
  must regularly carry true ones. Nothing is anchored to the real theft hour
  (a 30%-anchored foggy-memory design was caught and removed for exactly
  this). Innocents must do everything the thief does.
- **Fair-play floors stay:** ≥4 candidates everywhere after position 6, ≥3
  after position 9; final windows (suspects 3–7, items 4–7, locations 3–6 or
  7, times 1–3 or 4 via `timesMaxFor`/`locationsMaxFor`). "More than one
  solution remains" is NOT a substitute — keep the checkpoints.
- **Lies stay unpaired.** No mandatory contradiction planted for each lie; the
  players' dealt cards are the truth baseline. (Explicit owner decision.)
- **True facts can never eliminate the answer** (`factKillsCell` is the single
  semantics definition; `assertFactsSpareAnswer` stays).
- **The theft hour is never named.** Every hour reference goes through
  `refName()` (fact-harvest.ts). Beat phrases (below) join HOUR_STANDINS as
  house style — used freely for innocent hours too, never only for the answer.
- **No arbitrary type caps.** Fix generation economics (like the gathering
  toll), never bolt on quotas.
- **List clues eliminate at most 2 things.** Notes carry bookkeeping.

## Phase 0 — Occasion spine (foundation; everything hangs off this)

New file `src/data/occasion-catalog.ts`. For each existing family in
`OCCASION_FAMILIES` (ai-mystery-engine.ts) author a catalog entry:

- **beats**: 4–7 named day events mapped to hour ranges over the 10 slots
  (e.g. costume ball: fittings → arrivals → the grand reveal → supper → the
  unmasking at midnight). Beats become gathering labels and a licensed vague
  time vocabulary: `beatPhrase(timeId)` returns things like "just before the
  unmasking", "during the night's most exciting moments" spanning 1–3 hours.
- **activities**: occasion-specific group/solo doings with props (fitting
  costumes, wrapping auction lots, practicing the quadrille) — replace the
  generic thread causes and gathering labels for that family.
- **excuses**: occasion-plausible reasons to step away (change a spilled
  costume, fetch sheet music, see to the fireworks). Used by BOTH innocent
  step-aways and lies.
- **anonymityDevices**: what makes a person hard to identify at this occasion
  (masks, identical domino cloaks, lantern-lit garden distance, the crush at
  the auction table). Some families have none — then anonymous claims simply
  do not occur there.
- **setDressing**: nouns for briefs ("where the snacks were", "beside the
  prize table").

Wire-up:

1. Engine chooses family (existing logic) → deterministically instantiates a
   spine (concrete beats on concrete hours, seeded) → passes the spine into
   `simulateWorld` (extend the current `occasionFamily: string` param).
2. World-sim draws gathering labels, thread causes, and step-away excuses from
   the spine instead of generic catalogs. Instantiation must not read the
   answer beyond existing validity rules (no gathering at the theft hour etc.).
3. The dossier prompt RECEIVES the spine (beat names, main event) and
   elaborates the opening around it — the opening and the clues now provably
   share nouns. This inverts today's flow where the dossier invents flavor the
   facts never heard of.
4. `refName()` gains beat phrases as a second stand-in layer: innocent hours
   sometimes described by beat (~same 40% house-style rate), answer hour
   always stand-in/beat, never named. Mention licenses: beat phrases license
   no time card.

## Phase 1 — Scene arcs (episodes) in the world-sim

Extend threads/groups into **episodes**: multi-hour arcs with roles.

- Shape: participants + activity (from spine) + room + hour span; optionally
  one **step-away**: a member leaves mid-arc with an excuse (from spine),
  return left ambiguous; the rest continue.
- **Symmetry (critical):** innocents get step-away episodes routinely (they
  really did the errand). The thief's slip-away before the theft is generated
  by the SAME machinery with no special richness. Target: 1–3 step-away
  episodes per world; thief involved in one only as often as any suspect.
- The existing consecutive-slot group merge in fact-harvest.ts (~line 275) is
  the seed of this — episodes formalize it with an `episodeId` + role tags.

Harvest emits LINKED fragments sharing `episodeId` (add field next to
`threadId`): `scene_setup` (group at activity), `scene_continuation` (the N1
"stayed through dinner" fused fact — kills (s,t) pairs across the span),
`scene_departure` / `excuse_given` / `witness_account` (below), each with
occasion-dressed briefs drawn through `pickPhrase` families.

## Phase 2 — New fact shapes + exact semantics

Add to `FactKind` with `factKillsCell` entries:

- **`scene_continuation`** — suspects S in room L across hours T1..Tn: kills
  (s∈S, t∈span) pairs. (Mostly exists via the merge; formalize + dress.)
- **`witness_account`** (claim subtype, MENTION-ONLY, eliminates nothing) —
  the N2 shape: witness W says an unnamed person left gathering/episode E
  around beat B with excuse X, identity obscured by the family's anonymity
  device. Never states whether they returned. License: W's name + beat phrase
  only; the departer is never nameable; no time card licensed.
  **Truth variants, all in the SAME wrapper** (tuning-knob starting points):
  - true, departer innocent (the errand was real) — most common;
  - true, departer is the thief (a real glimpse of the slip-away);
  - fabricated by an innocent (mistaken/self-important) — rare;
  - fabricated by the thief as witness (the owner's dream red herring).
  Thief-as-witness ~25–35% of dealt witness_accounts; fabricated ~30–40%
  overall. MEASURE the distribution (harness below); no variant may be
  identifiable from wording, beat choice, or frequency.
- **`excuse_given`** — attributed excuse tied to a real or claimed step-away;
  mention-only.

Generation site: world-sim step-away episodes + the existing lie machinery
(beside `falseAlibi`/`trueStatements`). Do NOT allocate these from leftover
pad slots — that is the current design's central flaw (texture fights for
scraps after eliminations feast; fog starved to zero this way once). Phase 3
inverts the priority.

## Phase 3 — Story-first scheduler (the "smart selector")

This is the inversion the whole plan exists for. Today the greedy satisfies
elimination windows first and story gets 2–3 leftover pad slots; a game can
come out as twelve tidy eliminations with no lie, no witness, no red herring.
Replace that allocation order with a two-pass scheduler:

- **Pass 1 — story skeleton first.** Before any elimination scoring, deal the
  narrative core: sample a per-game RECIPE from a tuned distribution — e.g.
  one game is witness-centric (witness_account + its episode's setup +
  excuse), another lie-driven (false alibi + motive), another motive-and-fog.
  Reserve 3–5 of the 10 butler slots for it: the episode arc fragments plus
  2–3 deception/texture facts. The recipe is sampled ANSWER-BLIND from world
  supply, so it cannot correlate with the solution — games differ from each
  other (variance is itself anti-meta-gaming), and `cluePatternSignature`
  (below) nudges consecutive games onto different recipes.
- **Pass 2 — feasibility fill around the skeleton.** The existing greedy
  completes the fair-play checkpoints and final windows with the remaining
  slots. Prefer elimination facts that ALSO carry story — episode-linked
  continuations (which retire 2–3 hours of pairs in one lived scene),
  beat-dressed gatherings, wing closures — over naked bookkeeping; notes still
  absorb the lists. The scene shapes exist precisely so elimination work per
  slot goes UP, which is what frees slots for deception in the first place.
- **Repair, don't surrender:** if Pass 2 cannot reach the windows around the
  skeleton, drop the skeleton's least-connected piece and refill; only then
  burn a world attempt (budget 120, attempts cost microseconds). The fairness
  floors always win a true conflict — but a floor on story slots is
  answer-independent, so this is composition, not a tell.
- **Coherence bonus:** within both passes, bonus per already-chosen fragment
  sharing `episodeId` (generalize the late-theft basket idea), capped so one
  episode cannot swallow the schedule (≤3 fragments per episode dealt).
  Ordering: `scene_setup` before its continuation/departure/witness fragments
  (extend the even-share ordering, don't replace it).
- **Renderer context:** when a clue's fragment shares an episode with an
  earlier reveal, the render prompt includes the earlier rendered text with
  "this continues that scene — connect naturally, do not recap". Still
  answer-blind.
- **Opening variety (do first, it's independent):** render rules — no two
  clues in one game open with the same first word; at most 2 greeting-style
  openers per game. Enforce in `clue-verifier.ts` with the existing
  single-clue repair path.
- **Structural memory:** alongside `mysterySignature`, save a
  `cluePatternSignature` (counts of kinds dealt + opening styles + which
  episode shapes appeared); `chooseOccasionFamily`-style avoidance nudges the
  next generation away from the last few skeletons.

## Phase 4 — Measurement + acceptance (before replacing the checkpoint)

Recreate the throwaway harness pattern (it lives in /tmp and dies with the
sandbox): copy `src/{services,data}` to /tmp, `sed` relative imports to add
`.ts`, run drivers with `node --experimental-strip-types`; seed→answer formula
must match clue-scheduler.test.ts (`seed * 7_919 + 13`, engine budget 120
attempts). Metrics to print per 80–120 seed sweep:

- **story-slot floor: every game deals ≥3 narrative reveals** (episode
  fragments + deception/texture), and ≥80% of games contain at least one
  statement-shaped fact (claim/witness_account) — no more all-elimination
  games;
- recipe distribution across the sweep (no single recipe >40% of games);
- % of games with ≥1 episode of ≥2 dealt fragments (target ≥60%);
- witness_account truth-variant distribution vs targets; thief-as-witness rate;
- every texture kind (claim/fog/motive/witness/excuse) still appears across
  the sweep (no starvation);
- spine-noun overlap: ≥3 clues per game contain a beat/activity/prop noun that
  also appears in the opening;
- opening-word diversity (no repeats per game; greeting openers ≤2);
- ALL existing checks stay green: 120-seed vitest sweep, checkpoints/windows,
  houraudit = zero answer-hour namings, engine driver 12/12, tsc clean.

Human acceptance (owner): clues read like excerpts from lived scenes; the day
retells as one connected story; N1/N2-quality lines appear naturally; no
theory dominates by clue 5; the closing feels earned.

## Traps already hit — do not repeat

1. Fixing a symptom with a cap (retired). Fix economics (cf. gathering toll).
2. Anchoring any texture to the real theft hour — statistical tell (removed).
3. A wrapper that only carries lies (or only truths) — the wrapper becomes
   the tell. Same template, mixed truth, always.
4. Adding a texture kind without rebalancing slots → starvation (fog hit 0).
5. Whole-house oversupply: gathering hours host no other social texture;
   worlds with wall-to-wall gatherings starve the harvest (regression fixed at
   3–5 + toll).
6. sed/python edits with stale anchors — re-read the file before replacing.
7. Never `git push` from the sandbox (blocked); commit locally, owner pushes.
8. Engine attempt budget and test budget must move together
   (`MAX_WORLD_ATTEMPTS` in ai-mystery-engine.ts AND clue-scheduler.test.ts).

## Explicitly rejected (do not build)

- Answer-aware Story Architect / runtime "case bible" prompt (V2's failure
  mode; unverifiable leakage).
- Mandatory lie↔contradiction pairing.
- Replacing checkpoints with "more than one solution remains".
- An AI "Evidence Director" selection call — parked until after this plan
  ships; selection taste is not the bottleneck, material is. Revisit only if
  episode-rich games still feel same-y, and keep it answer-blind choosing
  among code-validated slates.

## Suggested order of work

The opening-variety fix first (one sitting, independent) → Phase 0 →
Phase 1 → Phase 2 → Phase 3 (the story-first scheduler is the heart of this
plan — do not ship the round without it) → Phase 4. Typecheck + sweep + eyeball a
rendered sample + commit after every phase. Update AI_ENGINE.md and
CHANGELOG.md as you go; note new tuning knobs in the "Tuning knobs" section.
