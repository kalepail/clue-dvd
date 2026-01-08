/**
 * Clue DVD Game - Game State Context for AI
 *
 * Builds comprehensive context from game history and state to feed into AI prompts.
 * This ensures AI-generated content maintains continuity and awareness of:
 * - What has happened in the game so far
 * - What clues have been revealed
 * - What possibilities have been eliminated
 * - What dramatic events have occurred
 * - The overall progression and tension level
 */

import type { GameSession, GameState, GameAction, GameClue } from "../types/game-session";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS, MYSTERY_THEMES } from "./game-elements";
import { CORE_GAME_CONTEXT, getNPCContext } from "./ai-context";

// ============================================
// TYPES
// ============================================

export interface GameProgressionContext {
  // Core game info
  gameId: string;
  theme: {
    id: string;
    name: string;
    description: string;
    period: string;
    atmosphere: string[];
  };
  difficulty: string;

  // Progression metrics
  progression: {
    phase: string;
    cluesRevealed: number;
    totalClues: number;
    percentComplete: number;
    wrongAccusations: number;
    tensionLevel: "low" | "medium" | "high" | "critical";
  };

  // What's been eliminated
  eliminated: {
    suspects: { id: string; name: string; role: string }[];
    items: { id: string; name: string; category: string }[];
    locations: { id: string; name: string; type: string }[];
    times: { id: string; name: string; lightCondition: string }[];
  };

  // What's still possible
  remaining: {
    suspects: { id: string; name: string; role: string }[];
    items: { id: string; name: string; category: string }[];
    locations: { id: string; name: string; type: string }[];
    times: { id: string; name: string; lightCondition: string }[];
  };

  // History of what's happened
  revealedClues: {
    index: number;
    speaker: string;
    type: string;
    text: string;
    eliminatedWhat?: string[];
  }[];

  // Dramatic events that occurred
  dramaticEvents: {
    description: string;
    afterClue: number;
  }[];

  // Failed accusations
  failedAccusations: {
    player: string;
    accusation: string;
  }[];

  // Key moments for narrative reference
  narrativeMoments: string[];
}

// ============================================
// CONTEXT BUILDER
// ============================================

export function buildGameProgressionContext(
  game: GameSession,
  state: GameState,
  actions: GameAction[]
): GameProgressionContext {
  const theme = MYSTERY_THEMES.find(t => t.id === game.themeId);

  // Calculate tension level based on game state
  const percentComplete = (state.currentClueIndex / game.clues.length) * 100;
  const tensionLevel = calculateTensionLevel(
    percentComplete,
    state.wrongAccusations,
    state.eliminatedSuspects.length,
    SUSPECTS.length
  );

  // Build eliminated lists with full details
  const eliminatedSuspects = state.eliminatedSuspects
    .map(id => SUSPECTS.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, name: s!.displayName, role: s!.role }));

  const eliminatedItems = state.eliminatedItems
    .map(id => ITEMS.find(i => i.id === id))
    .filter(Boolean)
    .map(i => ({ id: i!.id, name: i!.nameUS, category: i!.category }));

  const eliminatedLocations = state.eliminatedLocations
    .map(id => LOCATIONS.find(l => l.id === id))
    .filter(Boolean)
    .map(l => ({ id: l!.id, name: l!.name, type: l!.type }));

  const eliminatedTimes = state.eliminatedTimes
    .map(id => TIME_PERIODS.find(t => t.id === id))
    .filter(Boolean)
    .map(t => ({ id: t!.id, name: t!.name, lightCondition: t!.lightCondition }));

  // Build remaining lists
  const remainingSuspects = SUSPECTS
    .filter(s => !state.eliminatedSuspects.includes(s.id))
    .map(s => ({ id: s.id, name: s.displayName, role: s.role }));

  const remainingItems = ITEMS
    .filter(i => !state.eliminatedItems.includes(i.id))
    .map(i => ({ id: i.id, name: i.nameUS, category: i.category }));

  const remainingLocations = LOCATIONS
    .filter(l => !state.eliminatedLocations.includes(l.id))
    .map(l => ({ id: l.id, name: l.name, type: l.type }));

  const remainingTimes = TIME_PERIODS
    .filter(t => !state.eliminatedTimes.includes(t.id))
    .map(t => ({ id: t.id, name: t.name, lightCondition: t.lightCondition }));

  // Extract revealed clues with details
  const revealedClues = game.clues
    .filter(c => c.revealed)
    .map(c => ({
      index: c.index,
      speaker: c.speaker,
      type: c.type,
      text: c.text,
      eliminatedWhat: buildEliminationSummary(c.eliminates),
    }));

  // Extract dramatic events from actions
  const dramaticEvents = actions
    .filter(a => a.actionType === "dramatic_event")
    .map(a => ({
      description: (a.details as { description?: string }).description || "",
      afterClue: a.clueIndex || 0,
    }));

  // Extract failed accusations
  const failedAccusations = actions
    .filter(a => a.actionType === "accusation_wrong")
    .map(a => {
      const details = a.details as {
        suspectName?: string;
        itemName?: string;
        locationName?: string;
        timeName?: string;
      };
      return {
        player: a.actor,
        accusation: `${details.suspectName} with ${details.itemName} in ${details.locationName} at ${details.timeName}`,
      };
    });

  // Build narrative moments (key events for reference)
  const narrativeMoments = buildNarrativeMoments(actions, game.clues, state);

  return {
    gameId: game.id,
    theme: {
      id: theme?.id || "",
      name: theme?.name || "",
      description: theme?.description || "",
      period: theme?.period || "",
      atmosphere: theme?.atmosphericElements || [],
    },
    difficulty: game.difficulty,
    progression: {
      phase: state.phase,
      cluesRevealed: state.currentClueIndex,
      totalClues: game.clues.length,
      percentComplete: Math.round(percentComplete),
      wrongAccusations: state.wrongAccusations,
      tensionLevel,
    },
    eliminated: {
      suspects: eliminatedSuspects,
      items: eliminatedItems,
      locations: eliminatedLocations,
      times: eliminatedTimes,
    },
    remaining: {
      suspects: remainingSuspects,
      items: remainingItems,
      locations: remainingLocations,
      times: remainingTimes,
    },
    revealedClues,
    dramaticEvents,
    failedAccusations,
    narrativeMoments,
  };
}

// ============================================
// TENSION CALCULATION
// ============================================

function calculateTensionLevel(
  percentComplete: number,
  wrongAccusations: number,
  eliminatedSuspects: number,
  totalSuspects: number
): "low" | "medium" | "high" | "critical" {
  // Base tension on progression
  let tension = 0;

  if (percentComplete < 25) tension = 1;
  else if (percentComplete < 50) tension = 2;
  else if (percentComplete < 75) tension = 3;
  else tension = 4;

  // Wrong accusations increase tension
  tension += wrongAccusations;

  // Fewer remaining suspects = higher tension
  const remainingSuspects = totalSuspects - eliminatedSuspects;
  if (remainingSuspects <= 3) tension += 2;
  else if (remainingSuspects <= 5) tension += 1;

  // Map to levels
  if (tension <= 2) return "low";
  if (tension <= 4) return "medium";
  if (tension <= 6) return "high";
  return "critical";
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function buildEliminationSummary(eliminates?: {
  suspects?: string[];
  items?: string[];
  locations?: string[];
  times?: string[];
}): string[] {
  if (!eliminates) return [];

  const summary: string[] = [];

  if (eliminates.suspects?.length) {
    const names = eliminates.suspects
      .map(id => SUSPECTS.find(s => s.id === id)?.displayName)
      .filter(Boolean);
    if (names.length) summary.push(`Suspects: ${names.join(", ")}`);
  }

  if (eliminates.items?.length) {
    const names = eliminates.items
      .map(id => ITEMS.find(i => i.id === id)?.nameUS)
      .filter(Boolean);
    if (names.length) summary.push(`Items: ${names.join(", ")}`);
  }

  if (eliminates.locations?.length) {
    const names = eliminates.locations
      .map(id => LOCATIONS.find(l => l.id === id)?.name)
      .filter(Boolean);
    if (names.length) summary.push(`Locations: ${names.join(", ")}`);
  }

  if (eliminates.times?.length) {
    const names = eliminates.times
      .map(id => TIME_PERIODS.find(t => t.id === id)?.name)
      .filter(Boolean);
    if (names.length) summary.push(`Times: ${names.join(", ")}`);
  }

  return summary;
}

function buildNarrativeMoments(
  actions: GameAction[],
  clues: GameClue[],
  state: GameState
): string[] {
  const moments: string[] = [];

  // Game started
  const startAction = actions.find(a => a.actionType === "game_started");
  if (startAction) {
    const details = startAction.details as { playerNames?: string[] };
    moments.push(`The investigation began with ${details.playerNames?.join(", ") || "the players"}.`);
  }

  // Key clue revelations (first, midpoint, dramatic)
  const revealedClues = clues.filter(c => c.revealed);
  if (revealedClues.length > 0) {
    const first = revealedClues[0];
    moments.push(`${first.speaker} provided the first clue: "${first.text.substring(0, 50)}..."`);
  }

  // Dramatic events
  const dramaticEvents = actions.filter(a => a.actionType === "dramatic_event");
  for (const event of dramaticEvents) {
    const details = event.details as { description?: string };
    if (details.description) {
      moments.push(`A dramatic moment: ${details.description.substring(0, 60)}...`);
    }
  }

  // Wrong accusations add tension
  const wrongAccusations = actions.filter(a => a.actionType === "accusation_wrong");
  for (const acc of wrongAccusations) {
    moments.push(`${acc.actor} made an incorrect accusation, raising the stakes.`);
  }

  return moments;
}

// ============================================
// AI PROMPT CONTEXT GENERATOR
// ============================================

/**
 * Generate a complete AI prompt context that includes game state and history.
 * This should be prepended to any AI prompt during an active game.
 */
export function generateAIPromptContext(
  context: GameProgressionContext,
  options: {
    includeRevealedClues?: boolean;
    includeEliminatedDetails?: boolean;
    includeRemainingDetails?: boolean;
    includeNarrativeMoments?: boolean;
    includeTensionGuidance?: boolean;
  } = {}
): string {
  const {
    includeRevealedClues = true,
    includeEliminatedDetails = true,
    includeRemainingDetails = true,
    includeNarrativeMoments = true,
    includeTensionGuidance = true,
  } = options;

  let prompt = `${CORE_GAME_CONTEXT}
${getNPCContext()}

---

## CURRENT GAME STATE

**Theme**: "${context.theme.name}" - ${context.theme.description}
**Period**: ${context.theme.period}
**Atmosphere**: ${context.theme.atmosphere.join(", ")}
**Difficulty**: ${context.difficulty}

### PROGRESSION
- Phase: ${context.progression.phase}
- Clues Revealed: ${context.progression.cluesRevealed} of ${context.progression.totalClues} (${context.progression.percentComplete}% complete)
- Wrong Accusations: ${context.progression.wrongAccusations}
- Tension Level: ${context.progression.tensionLevel.toUpperCase()}
`;

  if (includeEliminatedDetails) {
    prompt += `
### ELIMINATED (These are NOT the answer)
- Suspects Cleared: ${context.eliminated.suspects.map(s => s.name).join(", ") || "None yet"}
- Items Ruled Out: ${context.eliminated.items.map(i => i.name).join(", ") || "None yet"}
- Locations Excluded: ${context.eliminated.locations.map(l => l.name).join(", ") || "None yet"}
- Times Eliminated: ${context.eliminated.times.map(t => t.name).join(", ") || "None yet"}
`;
  }

  if (includeRemainingDetails) {
    prompt += `
### STILL POSSIBLE (One of these IS the answer)
- Possible Suspects (${context.remaining.suspects.length}): ${context.remaining.suspects.map(s => `${s.name} (${s.role})`).join(", ")}
- Possible Items (${context.remaining.items.length}): ${context.remaining.items.map(i => i.name).join(", ")}
- Possible Locations (${context.remaining.locations.length}): ${context.remaining.locations.map(l => l.name).join(", ")}
- Possible Times (${context.remaining.times.length}): ${context.remaining.times.map(t => t.name).join(", ")}
`;
  }

  if (includeRevealedClues && context.revealedClues.length > 0) {
    prompt += `
### CLUES REVEALED SO FAR
${context.revealedClues.map((c, i) => `${i + 1}. [${c.speaker}] "${c.text}"${c.eliminatedWhat?.length ? ` → Eliminated: ${c.eliminatedWhat.join("; ")}` : ""}`).join("\n")}
`;
  }

  if (context.dramaticEvents.length > 0) {
    prompt += `
### DRAMATIC EVENTS THAT OCCURRED
${context.dramaticEvents.map(e => `- After clue ${e.afterClue + 1}: ${e.description}`).join("\n")}
`;
  }

  if (context.failedAccusations.length > 0) {
    prompt += `
### FAILED ACCUSATIONS
${context.failedAccusations.map(a => `- ${a.player} wrongly accused: ${a.accusation}`).join("\n")}
`;
  }

  if (includeNarrativeMoments && context.narrativeMoments.length > 0) {
    prompt += `
### KEY NARRATIVE MOMENTS
${context.narrativeMoments.map(m => `- ${m}`).join("\n")}
`;
  }

  if (includeTensionGuidance) {
    prompt += `
### NARRATIVE GUIDANCE
${getTensionGuidance(context.progression.tensionLevel, context.progression.percentComplete, context.progression.wrongAccusations)}
`;
  }

  return prompt;
}

function getTensionGuidance(
  tensionLevel: "low" | "medium" | "high" | "critical",
  percentComplete: number,
  wrongAccusations: number
): string {
  const guidance: string[] = [];

  switch (tensionLevel) {
    case "low":
      guidance.push("The investigation is just beginning. Set the scene, introduce intrigue, hint at secrets.");
      guidance.push("Tone: Mysterious but not urgent. Guests are nervous but composed.");
      break;
    case "medium":
      guidance.push("The investigation is underway. Tensions are rising, suspicions forming.");
      guidance.push("Tone: Increasing unease. Suspects are becoming defensive.");
      break;
    case "high":
      guidance.push("The net is closing. Few possibilities remain. Someone is about to be caught.");
      guidance.push("Tone: Urgent, accusatory. Guests are turning on each other.");
      break;
    case "critical":
      guidance.push("The climax approaches. The truth is almost revealed. Maximum tension.");
      guidance.push("Tone: Dramatic, revelatory. The thief knows they're cornered.");
      break;
  }

  if (wrongAccusations > 0) {
    guidance.push(`Note: ${wrongAccusations} wrong accusation(s) have been made. The stakes are higher.`);
  }

  if (percentComplete > 80) {
    guidance.push("Most clues are revealed. Build toward the dramatic conclusion.");
  }

  return guidance.join("\n");
}

// ============================================
// SPECIALIZED CONTEXT GENERATORS
// ============================================

/**
 * Context for generating the next clue - needs awareness of what's been said
 */
export function generateClueContext(context: GameProgressionContext): string {
  return `${generateAIPromptContext(context, {
    includeRevealedClues: true,
    includeEliminatedDetails: true,
    includeRemainingDetails: true,
    includeNarrativeMoments: false,
    includeTensionGuidance: true,
  })}

---

## CLUE GENERATION RULES
- This clue is #${context.progression.cluesRevealed + 1} of ${context.progression.totalClues}
- DO NOT repeat information from previous clues
- DO NOT contradict previous clues
- Reference events/clues that came before when appropriate ("As I mentioned earlier...")
- Build on the established narrative
- Match the current tension level (${context.progression.tensionLevel})
`;
}

/**
 * Context for generating dramatic events
 */
export function generateDramaticEventContext(context: GameProgressionContext): string {
  return `${generateAIPromptContext(context, {
    includeRevealedClues: true,
    includeEliminatedDetails: false,
    includeRemainingDetails: true,
    includeNarrativeMoments: true,
    includeTensionGuidance: true,
  })}

---

## DRAMATIC EVENT RULES
- Build on what has happened so far
- Reference previous clues or events if appropriate
- Involve suspects who are STILL POSSIBLE (from the remaining list)
- Match the tension level: ${context.progression.tensionLevel}
- Do NOT reveal the solution
- Create suspense and misdirection
`;
}

/**
 * Context for generating mid-game commentary (Inspector/Butler observations)
 */
export function generateCommentaryContext(context: GameProgressionContext): string {
  return `${generateAIPromptContext(context, {
    includeRevealedClues: true,
    includeEliminatedDetails: true,
    includeRemainingDetails: true,
    includeNarrativeMoments: true,
    includeTensionGuidance: true,
  })}

---

## COMMENTARY RULES
- Summarize progress so far
- Reference specific clues and what they revealed
- Hint at the narrowing possibilities without giving away the answer
- Match the speaker's voice (Ashe: butler, Inspector Brown: detective)
- Acknowledge failed accusations if any occurred
`;
}

/**
 * Context for generating the closing narration
 */
export function generateClosingContext(
  context: GameProgressionContext,
  solution: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  }
): string {
  const suspect = SUSPECTS.find(s => s.id === solution.suspectId);
  const item = ITEMS.find(i => i.id === solution.itemId);
  const location = LOCATIONS.find(l => l.id === solution.locationId);
  const time = TIME_PERIODS.find(t => t.id === solution.timeId);

  return `${generateAIPromptContext(context, {
    includeRevealedClues: true,
    includeEliminatedDetails: true,
    includeRemainingDetails: false,
    includeNarrativeMoments: true,
    includeTensionGuidance: false,
  })}

---

## THE SOLUTION (Now Revealed)
- **WHO**: ${suspect?.displayName} (${suspect?.role}) - Traits: ${suspect?.traits.join(", ")}
- **WHAT**: ${item?.nameUS} (${item?.category}) - ${item?.description}
- **WHERE**: ${location?.name} (${location?.type}) - ${location?.description}
- **WHEN**: ${time?.name} (${time?.hourRange}) - ${time?.lightCondition} conditions

## CLOSING NARRATION RULES
- Reference the journey: the clues revealed, the wrong turns, the key moments
- Explain HOW the clues pointed to this solution
- Explain the thief's MOTIVE based on their character traits
- Explain why this LOCATION and TIME made sense
- Acknowledge any wrong accusations and how they misled
- Provide a satisfying conclusion that ties everything together
- Use Inspector Brown's voice: formal, dramatic, revelatory
`;
}
