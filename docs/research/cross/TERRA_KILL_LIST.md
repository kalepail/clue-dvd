# Terra Kill-List — Adversarial Cross-Review

Role: skeptical kill-list reviewer. I challenge the four panel reports (TERRA_OPUS, FABLE,
SOL, CODEX54) and the brief rather than averaging them. Official-rule corrections in the
brief (`GAMEPLAY_RESEARCH_BRIEF.md:181-221`) and `EXTERNAL_DESIGN_EVIDENCE.md` are treated
as binding. I hunt specifically for: manufactured concerns, unjustified authenticity claims,
playtest-free numeric targets, and mechanics that would digitize hidden physical information.
Every panel agrees on the non-negotiable boundary — deterministic truth → answer-blind render
→ deterministic check → answer-aware **public-path-independent** closing; physical cards
finish deduction — and I affirm it. Nothing below weakens it.

Verdicts: **ACCEPT** (survives), **MODIFY** (real, but the proposal overreaches), **REJECT**
(manufactured, unjustified, or scope creep). Panel refs: F-=Fable, S=Sol, C=Codex, T=Terra-Opus.

---

## ACCEPT — survives every objection

**A1. Keep the solver; genericity is supply/choice, not architecture.** (S-F1, C-Finding1,
F-§1.2, T-§0). Unanimous and I re-verified 500/500 at 25.7 ms. The only hard, defensible
numeric gate in the entire panel: **schedule success ≥99% and answer-cell never dies on any
future change** (`clue-scheduler.ts:393-396`). Every other percentage below is suspect.

**A2. Path-independent closing.** (T-§1.10, F-P4, S-F13, C-Finding13). Verified in code: the
closing is generated pre-play (`ai-mystery-engine.ts:259-276`), fed all 12 briefs including
both private notes and the all-evidence `finalCandidates` (`:198-212`, `clue-scheduler.ts:417-426`),
and labels them "revealed during play" (`ai-v3-prompts.ts:195-203`). This is a genuine
epistemic-honesty defect, not manufactured. **Acceptance:** closing recap contains zero note
briefs; the "field still standing" is the public-Butler-only marginal set; a note-access
matrix (neither/N1/N2/both) yields a byte-identical truthful default. Contained prompt-input
change — no logic touched.

**A3. Truth boundary is name-deep, not meaning-deep.** (T-§1.8, F-P5, S-F2, C-Finding12).
Verified: `clue-verifier.ts:66-118` checks names/emptiness/closing only — no polarity, scope,
chronology, or invented-person check; `NON_CARD_NAME_WHITELIST` is exported and imported
nowhere (dead code, `ai-v3-prompts.ts:213`). Real latent hole. **Direction accepted: a
deterministic evidence capsule** (fact→structured summary shown alongside prose) — but see K7
on its authenticity framing.

**A4. Turn-shell fidelity fixes (verified, UI-scoped, count-only).** Rename "Reveal Clue" →
"Summon the Butler"; structured 3-of-4 suggestion log; accusation copy "item card" + phone
parity (`AccusationPanel.tsx:261`, `PhonePlayerPage.tsx:439-477`); secret passage → movement
edge (endpoints exist: `game-elements.ts:264,284,304,334`), random roll demoted to labeled
variant (`useGameStore.ts:757-761`); wire `world.roomClosure` (`world-sim.ts:340-352`) into
the dead `lockedRooms` path (`ai-mystery-setup.ts:64`); host/phone note re-read parity
(F-T4). All count-only, no hidden-hand tracking.

**A5. Cheap doc/verifier corrections.** Adjacency over-claim (`AI_ENGINE_V3_PLAN.md:72` vs
`world-sim.ts:399-564`); scheduler header windows "4/3/3/3" contradict `FINAL_TARGET` 6/5/6/4
(`clue-scheduler.ts:13` vs `:92-97`); `verifyClosing` substring hole — "Night" matches inside
"Midnight" (`clue-verifier.ts:111-115`, confirmed); quarantine stale V2 docs (C-Finding14).
Trivial, verified, zero risk. Severity is **low** — do not oversell the verifier substring as
a live fairness bug; the closing prompt names all four cards explicitly.

**A6. Best-of-K schedule selection — CONDITIONALLY.** (all four; cheapest lever). Selecting
among already-valid schedules cannot break an invariant — true. **But accept only with F-Fable's
own falsifier run first:** K=8 over 500 seeds, measure score variance. If variance is near-zero,
best-of-K is impotent and the money is entirely supply-side. Scoring terms stay **soft**; see K1.

---

## MODIFY — real concern, proposal overreaches

**M1. Occasion → deterministic truth.** Concern verified (all four; S's 50/50 byte-identical
paired run is convincing; `occasionFamily` used only at `world-sim.ts:210,378`). **Accept the
minimal catalog-overlay form (F-Q4, C-§4): the family biases which seeded catalog entries are
eligible, gated by the existing world-retry loop (`ai-mystery-engine.ts:170-184`).** **Reject
as premature** S's full `WorldArchetype` + `beatGrammar` + constraint-solving/rejection-sampling
+ generated "shadow opportunities" (S-§4, F4). That is a large build justified largely by the
leakage concern I kill in K2. Start with overlays; escalate only if overlays measurably fail to
differentiate fact-kind/room distributions.

**M2. Accusation penalty + inability-to-pay.** Partial gap is real (host instructs forfeit
`AccusationPanel.tsx:260-262`; phone omits it; wording says "cards" not "item cards"; no record).
**But "inability-to-pay eliminates the player" must be a manual host control, never an app
determination** — whether a player can pay is hidden-hand information. F-T2/S-F10/C-F10 mostly
say this; where any report frames the *absence of app-side elimination* as the defect, that is
inverted. The defects are: wording, phone parity, and a manual "eliminated — could not pay"
affordance. Severity **medium at most**, not the economic catastrophe some imply.

**M3. Note roles + knowledge partitions.** N1/N2 having no distinct job is real (69.9%
room/item; any `noteSuitable` fact fits either slot, `clue-scheduler.ts:648-663`). Accept
differentiating N1/N2 as **soft** selector terms. **Reject as a Phase-1 gate** S's full
four-view KnowledgeView validation and a **hard** public-only scheduler checkpoint (S-F8, F-Q8a).
The knowledge-partition insight is load-bearing for exactly one thing already accepted (A2, the
closing). A hard public-only checkpoint changes the fairness contract and may cut yield; keep it
a **monitored floor**, not a gate, until eval proves <1% yield cost.

**M4. Event economy / evidence capsule as target architecture.** Direction accepted (A3, A4,
and the post-turn event economy is authentic per `EXTERNAL_DESIGN_EVIDENCE.md:11-25`). **Modify:**
S's full `Fact`/`Schedule` metadata schema + 9-level lexicographic scorer + `PhysicalCardBudget`
(S-§"Concrete target architecture") is designing Phase 5 before Phase 1 variance (A6) is proven.
Adopt metadata incrementally. **One hard dependency all panels but Sol underweight:** event-driven
facedown placements draw from the **finite** Pantry, but the scheduler still assumes a fixed
Butler-summon count tied to that same item-card supply (`TOPROMPT.md:13`). Do not ship placement
events until the pantry conservation is validated against the summon budget. Keep event economy
last (correctly Phase 5 in F/S).

---

## REJECT — manufactured, unjustified, or hidden-info hazards

**K1. Playtest-free numeric diversity/arc targets as acceptance gates.** The reports assert
hard thresholds with no derivation and no playtest basis, and they **contradict each other**,
which proves they are guesses:
- converged-pair cap: C says ≤70%, S says <80% (S-F7), F implies steering to ~55/25/20.
- dominant note kind: C ≤35%, F <50%, S "≥90% different role/mechanism".
- staged-thread coverage: C ≥60% (Finding4), S ≥70% (F6), F ≥80% (Q6). Three numbers, one idea.
- fact-kind dominance: C ≤30%, S ≤35% (F5), F <45% then <35%.

**Ruling: REJECT these as gates.** Adopting arbitrary round numbers as pass/fail invites
overfitting the scheduler to metrics no player perceives. **Keep them only as monitored
telemetry.** The sole legitimate gates remain: success ≥99%, latency budget, all existing
invariant tests green, and a **measured** playtest delta ("players rate 3 successive cases as
more distinct than baseline"). Numbers become gates only *after* a playtest ties a threshold to
perception.

**K2. "Meta-telegraph" / answer-shaped world as a defect.** (F-§1.5 + F-W4, S-F4). Claims: a
repeat player learns "the 2–3 unvouched items include the stolen one; theft is just after the
anchor bundle," and the answer room is "less lived-in." **REJECT as a defect.** (a) These are
marginal statistical tendencies invisible to a human at a table without instrumentation; no
report offers any evidence a person has exploited them. (b) The "last-seen-intact before the
theft" anchor is a **genre convention of the original disc itself** (`world-sim.ts:606-613`
mirrors the corpus), so branding it a leak is an unjustified authenticity inversion. (c) S-F4's
acceptance bar — "a classifier predicts each answer category no better than chance+5pp" — is a
standard the **physical source game would fail**, and building a structural-leakage classifier
as a release gate is over-engineering. **Salvage:** F-W4's relaxation of the all-day answer-room
exclusion (`world-sim.ts:410` is stronger than the per-slot rule at `:517-519` requires;
verified) is a cheap, safe **[OE] for variety** — accept *that* as cosmetic, reject the
classifier gate and the "leakage" framing.

**K3. App determining ability-to-pay or auto-eliminating.** See M2 — restated as a hard kill:
**any proposal where the app computes whether a player can pay, or auto-removes them, is
REJECTED** as digitizing hidden hands. Manual host control only.

**K4. Inspector's Challenge / facedown placement routing card identity through the app.**
Future event-economy work (M4) must place only a **facedown marker** at a board location; the
Challenge is a physical look at a physical card. **REJECT any design where the app knows or
displays which item card was placed or inspected.** The evidence capsule (A3) is world-fact
truth, never pantry-card identity. Flag now so Phase 5 does not drift into it.

**K5. "8 testimonies is the authentic count."** All four correctly defer variable cadence as
[OE] — good. But note the authenticity claim is itself thin: "8 clues / 1–6 notes" is what **10
transcribed cases** show (`original-mysteries.ts`), and physical delivery is DVD-driven and
variable per playthrough. **REJECT** any future argument that 10+2 is *inauthentic* or that 8 is
*mandated*; the corpus is a small sample, not a spec. Cadence stays deferred on complexity
grounds, not authenticity.

**K6. Answer-aware semantic judge / LLM truth gate.** No panel proposes it as the fix (S
explicitly rejects it, S-§"Rejected"), but I record the kill for completeness: any semantic
verifier that sees the answer reintroduces telegraphing. The capsule (deterministic, answer-blind
by construction) is the only accepted truth backstop.

**K7. Evidence capsule justified by an unverified DVD-UI claim.** The "the DVD displayed a
write-down summary while Ashe spoke" premise (used by T/F/S/C to motivate the capsule) is **not
established in `EXTERNAL_DESIGN_EVIDENCE.md`** — it entered via mid-review assertion. **MODIFY,
bordering reject-the-framing:** ship the capsule on **truthfulness** grounds (A3 — it closes the
name-deep verifier hole), not on an unverified authenticity story. If the capsule ever clutters
the reveal moment, that trade is decided by playtest, not by an unproven "the disc did this."

---

## Hidden-information audit (explicit, per the kill-list mandate)

Every count-only proposal (pantry count, facedown-by-location count, face-up Evidence-Room
count, private-hand *counts*) is acceptable — these are public or aggregate. The three lines
that must never be crossed, and which some proposals brush against: (1) ability-to-pay
determination (K3); (2) placed/challenged item-card identity (K4); (3) which private note a
player read surfacing into the closing (already fixed by A2). All three are guardable; none is
currently violated by the app — the app's *omissions* here are largely correct caution, not
defects.

---

## Recommendations that survive my strongest objections

1. **Path-independent closing** (A2) — verified defect, contained, highest-trust ROI. Do first.
2. **Doc/verifier corrections + stale-doc quarantine** (A5) — verified, near-zero risk, unblocks
   honest review. Do first.
3. **Evidence capsule for truthfulness** (A3, framed per K7) — closes the only LLM-dependent link
   in the fair-play chain; ship behind a flag, judge clutter by playtest.
4. **Turn-shell fidelity: rename summon, structured suggestion, "item card" wording + phone
   parity, passage-as-movement, wire roomClosure→lockedRooms** (A4) — count-only, no hidden
   hands, authentic per the rulebook.
5. **Best-of-K selection, gated on a variance pre-check, soft terms only** (A6, K1) — real lever
   *if* variance exists; no hard diversity quotas.
6. **Occasion catalog overlays** (M1, minimal form) — not the WorldArchetype build; gated on the
   existing retry loop.

Deferred as monitored-not-gated: thread staging, note-role differentiation, converged-pair
steering, variable cadence, the full event economy. **Killed outright:** hard playtest-free
diversity/arc numeric gates, the meta-telegraph "leakage" defect and its classifier gate,
app-side ability-to-pay/elimination, and any card-identity digitization. The manual host controls
and count-only state are the correct compromise; the deterministic/answer-blind/physical-card
boundary is preserved throughout.
