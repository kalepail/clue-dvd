07/12/26 (5)
- Scene & Occasion Phase 0: deterministic occasion spine
        - Added authored beats, activities, excuses, anonymity devices, props, and thread causes for all 14 occasion families
        - Occasion truth now exists before world simulation; gatherings, social groups, solo activity, threads, and step-away remarks draw from the selected spine
        - The answer-blind dossier receives and elaborates the fixed spine instead of inventing an unrelated theme after clue scheduling
        - Beat phrases join rhythm stand-ins for time references; innocent hours use the same vague house style and the answer hour remains unnamed
        - Dossier texture is cosmetic only and can no longer rewrite movement truth

07/12/26 (4)
- Scene & Occasion phase: opening variety foundation
        - Renderer now budgets at most two classic greeting openings across ten Butler clues
        - Package-level verifier rejects repeated first words and excess greetings, then reuses the surgical single-clue repair path
        - Added verifier and engine regression coverage; no whole-mystery rewrite required

07/12/26 (3)
- Statements are truth-ambiguous (anti-meta-gaming):
        - Innocents make TRUE claims in the identical wrapper as the thief's lie; the thief sometimes truthfully accounts for an innocent hour
        - Measured mixture: a statement appears in ~98% of games, ~31% are the lie, ~63% come from innocents - "X says..." marks nothing
        - Foggy memories can come from anyone (thief included) and are anchored to the real theft hour ~30% of the time - fog that happens to be true
        - At most one claim per game; the closing reveals the lie only when it was actually dealt
07/12/26 (2)
- Polish from the best playtest yet:
        - The liar lies freely: removed the pairing rule that guaranteed a contradicting clue - uncertain wording marks statements, and the players' hands are the truth baseline (claims now appear in ~half of games)
        - Foggy memories read plain ("thinks they noticed") - the player decides the emphasis
        - List-shaped clues eliminate at most TWO things each (item sweeps, room checks, secured pairs); the answer-anchor may run wider since it eliminates no item outright
        - Answer-hour naming audit: 0 strays across 80 seeds; 110/110 scheduling; engine mocks 12/12

07/12/26
- Story-first texture round (from live playtest + design direction):
        - Decoys now 3-5 across all categories: the item field stays broad (4-7 by game's end) and the dealt cards close it, like every other card type
        - Motives for several suspects each game (thief's revealed in the closing); size-aware social reasons for pairs/groups; dispersal hours where being alone is ordinary
        - The thief can now LIE: an attributed false alibi that eliminates nothing, dealt only when the true testimony that exposes it is also in play; foggy half-memories add fog without breaking logic
        - Removed the spotlight and last-two-clues placement gates and the gentle-then-heavy pacing; replaced with even story reveal (checkpoints remain the fairness floor)
        - The theft hour is never NAMED: described by the day's rhythm, with the same rhythm phrasing used for innocent hours so it cannot be fingerprinted (2 stray namings per 80 games, was ~5 per game)
        - Few-shots drawn across all ten original mysteries + a per-game narrative register for Ashe
        - Verified: 110/110 scheduling at ~45ms; butler clues 53% people-facts; first-five mix 169 people : 23 items; engine mocks 12/12; typecheck clean

07/11/26 (3)
- People-first clue generation (from live playtest of ai-last):
        - Selection now weighs facts by what a mystery is about: company, absences, and comings-and-goings outrank item bookkeeping wherever both would do; redundant tallies are pruned and their slots refilled with people facts
        - Ashe opens with the day itself; item/room tallies drift to the back half and, 93% of the time, into the Inspector's dry notes where lists belong
        - Spotlight-vs-chorus rule: naming the culprit among 3+ others (or the theft hour mid-span) no longer banishes a clue to the late positions - that unlocked the C6-style company clues for the early game
        - First-five clue mix flipped from 169 people / 274 item to 240 people / 229 item across 110 seeds; 100% scheduling held
        - Removed the "After that hour, nobody can say" tell from the last-seen anchor
        - Group clues get four distinct sentence skeletons with a no-repeat cycler; same-company repeats nudged away; quarrel moments no longer leak their cause as a chummy "activity"
        - Suspicious threads report and stop (no more "in truth, they were..." self-resolution)

07/11/26
- Replaced the creative AI engine with the V3 "world-first" mystery engine (see AI_ENGINE.md)
        - Deterministic world simulation, fact harvest, and a fair-play solver prove pacing over all 12,100 solutions before any prose exists
        - Fair-play curve enforced: >=4 candidates everywhere after clue 5 + Note 1, >=3 after clue 7 + Note 2, two axes converged to <=3 at the end
        - Prose model is answer-blind (never sees the solution or eliminations); few-shot on the ten original DVD mysteries in data/mysteries.json
        - Verification failures re-render a single clue instead of revising the whole mystery
        - 500/500 seeds schedule successfully at ~45ms each; 12/12 engine mock runs pass; golden test reproduces original mystery #1 deduction
- Added scripts/eval-mysteries.ts metrics harness and new vitest suites (scheduler sweep, world invariants, golden corpus, verifier, engine)
- Docs: AI_ENGINE.md is the living engine doc; AI_MYSTERY_ENGINE_V2.md, AI_REDESIGN_COMPARISON.md, PROMPT_REDESIGN_NOTES.md, V2_*.md are historical

01/13/26 00:30.00
- Added looping menu music playback on host web app with fade in/out and pause during host modals
- Added host settings hamburger menu with a persistent music mute toggle
- Wired host clue reveal TTS to trigger from the click handler to avoid autoplay blocking
- Added audio asset path for menu music at /public/audio/menu.mp3
- Removed the experimental Observe Evidence turn option after review
01/08/26 10:51.42
- Added timer for timed events and timed interruptions
- Added Player name and character selection
- Added Random player selection and subsequent turn order
- Added turn indicator header
- Added secret passsage turn option as well 20% good 20% bad 60% neutral event rates
- Added Inspector Notes that become available at 50% and 65% clue reveal (will change timing of reveal)
        - Inspector notes require a turn to read the first time : free thereafter
- Added inspector Interruption system that operates on 3 types of interruptions 
        - End Game: turn a card in 
        - Inspector Notes
- Added the foundation to utilize room locks depending on story generated by AI to further immersion
- Added proper failed accusation functionality 
        - Now indicates number of right and wrong guesses and instructs to turn in cards
- Added a new Reveal animation on WIN screen
- Added Developer test case that can be used to check accusation success and winning screen 
        - ANSWERS FOR DEV TEST THEME/// Peacock - Letter Opener - Billiard Room - Night
01/10/26 00:52.10
- Added image-based character picker overlay with double-tap confirm and per-suspect color theming
- Added image-based accusation flow with step-by-step Who/What/Where/When selection and back/next navigation
- Added card back art for unflipped solution/reveal cards and tuned reveal card layout, sizing, and typography
- Added suspect, item, location, and time card scans to win reveal and accusation pickers
- Replaced symbol icons with gold card icon assets and added magnifying glass asset handling
- Added solved-screen winner header layout and refined reveal card presentation
- Added UI_REVEAL_CARD_NOTES.md with adjustment guidance for reveal cards
01/12/26 01:59.18
- Host gameplay layout refactor: top header grid, turn options panel refresh, removed large game header, and added exit/save controls
- Host timeline and accusation cleanup: removed wrong-accusation counters and hidden specific accusation details in history
- Latest clue display reworked into a full-screen reveal modal; added butler image art and rotation across multiple butler images
- Inspector interruption visuals: intro and instruction screens now show themed images with rotation on each interruption
- Added lead-detective phone confirmation for inspector interruptions and synced interruption state to phones
- Added phone inspector note system: per-player availability, read tracking, turn costs, and persistent note access
- Added phone session inspector-note availability sync from host as clues progress
- Added phone lobby fixes: fresh session behavior, reset lobby button visibility, and host-controlled setup symbol reveal
- Added phone rejoin flow using saved reconnect token with a Resume Detective card on the join screen
- Added phone action confirmations and gating so phone "continue" closes the correct host modal
- Added one-use-per-turn secret passage guard for phone and host with proper disable states
- Added host clue/interruption modal sizing and typography improvements for distance readability
- Added host lobby join URL builder using a dev IP override for local phone joins
- Added new D1 migrations for inspector notes, note availability, and interruption status
- Added phone-notepad elimination sheet redesign with dark paper theme, serif layout, grouping, and strike-through eliminations
- Added per-player deduction grid with selectable marks, sticky toolbar, and per-device persistence
- Eliminated items now filter out of phone accusation pickers for the current player
- Added a Deductions tab label for the notepad sheet
- Updated suspect accent colors (Lavender and Mr. Green adjustments) and supporting UI maps
