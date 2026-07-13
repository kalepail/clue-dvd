# External Design Evidence

This note records outside evidence used to interpret the repository findings. Project-specific code and playtests remain the deciding evidence.

## Official 2006 rules

Primary source: [Hasbro — CLUE DVD Game Official Rules & Instructions](https://instructions.hasbro.com/en-us/instruction/clue-dvd-game). Hasbro's page links the scanned ten-page US rulebook PDF.

The rulebook establishes a richer physical loop than `GAME_REFERENCE.md` currently summarizes:

- a turn always starts by moving to an adjacent location and then taking one action;
- the action choices are Make a Suggestion, Summon the Butler, Look at an Item Card, Read an Inspector's Note, or Make an Accusation;
- suggestions name any three of the four answer dimensions and are used to discover other players' held cards;
- summoning Ashe is disallowed in the Evidence Room, gives everyone a public testimony, and gives the summoner the top Butler's Pantry item card privately;
- DVD events move some facedown item cards from the Pantry onto named board locations;
- a player at such a location may take an Inspector's Challenge; success permits a private look at that card, after which it stays facedown in the location;
- Inspector notes become available during play and remain privately revisitable;
- entering the Evidence Room requires an accusation;
- Inspector Brown authentically reports how many of the four accusation choices are correct;
- every wrong category costs the accuser one item card, placed face-up into the Evidence Room; inability to pay removes the player;
- some doors and secret passages begin locked and unlock during the case;
- secret passages are movement connections, not random reward/penalty rolls;
- DVD events wait until the current turn ends.

Implication: the original game's dynamism came from interactions among movement, gated choices, the dwindling/moving item-card economy, private observations, doors, and post-turn events. Replacing that system with arbitrary random bonuses would be less authentic than restoring a lightweight version of these interactions.

## Mechanics, dynamics, and player experience

Primary paper: Robin Hunicke, Marc LeBlanc, and Robert Zubek, [“MDA: A Formal Approach to Game Design and Game Research”](http://www.cs.northwestern.edu/~hunicke/MDA.pdf) (2004).

The framework distinguishes authored mechanics/data from the run-time dynamics that emerge when players interact with them, and from the resulting player experience. It explicitly warns that small mechanical changes can cascade through interdependent behavior and advocates iterative qualitative and quantitative evaluation.

Application to this project (inference): richer occasion prose is a media-layer change. It will not by itself create richer round dynamics while the action economy, event cadence, and fact-selection portfolio remain fixed. Recommendations should state the desired player experience first—e.g. investigation, discovery, social deduction, tension, and fellowship—then identify which mechanics actually produce it.

## Quality and diversity must both be explicit

Primary paper: Daniele Gravina et al., [“Procedural Content Generation through Quality Diversity”](https://arxiv.org/abs/1907.04053) (IEEE Conference on Games, 2019).

Quality-diversity methods seek a set of high-quality solutions that cover an explicitly described behavior space, rather than optimizing one scalar objective and hoping diverse outputs emerge. The important transferable idea is explicit behavioral dimensions, not a requirement to adopt evolutionary algorithms.

Application to this project (inference): the scheduler already optimizes a strong quality boundary—answer survival and candidate windows—but does not describe a diversity space. A practical multi-start/beam search can retain only valid schedules, then archive or score them by dimensions such as:

- converged-axis pair;
- fact-family portfolio;
- note roles;
- thread count and setup/payoff spacing;
- occasion-linked evidence share;
- public/private information weight;
- late-reveal intensity;
- item-card/event topology.

This is safer than adding unconstrained randomness and more targeted than prompt-only “vary the clues” instructions.

## Generated facets need orchestration

Primary paper: Antonios Liapis et al., [“Orchestrating Game Generation”](https://antoniosliapis.com/papers/orchestrating_game_generation.pdf) (IEEE Transactions on Games).

The paper argues that generating one game facet in isolation can ignore its alignment with rules, progression, narrative, visuals, and play. It frames orchestration as the coordination needed to keep multiple generated facets coherent, and identifies automated playtesting, simulation, and human evaluation as important but difficult parts of judging playability, fairness, memorability, and uniqueness.

Application to this project (inference): occasion, world simulation, clue portfolio, private notes, board events, item-card economy, and narration should share a small deterministic case frame. Today the occasion is selected but does not alter the simulated evidence topology. A case frame can coordinate the facets without asking the LLM to author formal truth.

## Logical validation is not experience validation

Primary paper: Georgios N. Yannakakis and Julian Togelius, [“Experience-Driven Procedural Content Generation”](https://doi.org/10.1109/T-AFFC.2011.6) (IEEE Transactions on Affective Computing, 2011).

The paper's framework distinguishes content representation/generation from models and evaluation functions for player experience. It discusses direct, simulation-based, and data-driven evaluation and notes that some qualities only become observable when content is played.

Application to this project (inference): the 500-seed sweep validates schedule feasibility and distribution, not whether a case feels organic, memorable, clear, tense, or fair at the table. Those require instrumented blind playtests and subjective comparisons. The right response is not to weaken deterministic proof; it is to add a second evaluation layer.

## Evidence-backed design rules for this project

1. Preserve the current formal validity gate.
2. Add explicit diversity dimensions after validity, not undirected randomness before it.
3. Coordinate generated facets through deterministic semantic tags and constraints.
4. Separate the canonical evidence a player records from expressive voiceover prose.
5. Restore dynamism through meaningful physical decisions and state changes.
6. Evaluate both machine properties and player experience.
7. Roll out changes as reversible variants until blind playtests show improvement.
