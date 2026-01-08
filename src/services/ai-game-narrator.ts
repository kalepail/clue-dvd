/**
 * Clue DVD Game - AI Game Narrator
 *
 * Generates AI content during active gameplay with full awareness of:
 * - Game history and progression
 * - Previously revealed clues
 * - Eliminated possibilities
 * - Dramatic events that have occurred
 * - Failed accusations
 *
 * This ensures narrative continuity throughout the game.
 */

import type { GameSession, GameState, GameAction } from "../types/game-session";
import {
  buildGameProgressionContext,
  generateClueContext,
  generateDramaticEventContext,
  generateCommentaryContext,
  generateClosingContext,
  type GameProgressionContext,
} from "../data/game-state-context";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS } from "../data/game-elements";

// Valid AI model
const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8" as const;

// Helper to extract response
function extractResponse(response: unknown): string | null {
  if (
    response &&
    typeof response === "object" &&
    "response" in response &&
    typeof (response as { response?: string }).response === "string"
  ) {
    return (response as { response: string }).response;
  }
  return null;
}

// ============================================
// MAIN NARRATOR CLASS
// ============================================

export class AIGameNarrator {
  private ai: Ai;
  private game: GameSession;
  private state: GameState;
  private actions: GameAction[];
  private context: GameProgressionContext;

  constructor(
    ai: Ai,
    game: GameSession,
    state: GameState,
    actions: GameAction[]
  ) {
    this.ai = ai;
    this.game = game;
    this.state = state;
    this.actions = actions;
    this.context = buildGameProgressionContext(game, state, actions);
  }

  /**
   * Refresh context with latest state (call after state changes)
   */
  refresh(state: GameState, actions: GameAction[]): void {
    this.state = state;
    this.actions = actions;
    this.context = buildGameProgressionContext(this.game, state, actions);
  }

  /**
   * Generate enhanced clue text with game awareness
   */
  async enhanceClueWithContext(
    clueText: string,
    speaker: string,
    clueIndex: number
  ): Promise<string> {
    const clueContext = generateClueContext(this.context);

    const prompt = `${clueContext}

---

## TASK: Enhance this clue for dramatic delivery

Original clue text: "${clueText}"
Speaker: ${speaker}
Clue number: ${clueIndex + 1} of ${this.context.progression.totalClues}

${speaker === "Ashe" ? `
Ashe the butler should:
- Speak formally and deferentially
- Reference his observations of the household
- If this isn't the first clue, acknowledge "As the investigation continues..."
- Use phrases like "If I may add, sir...", "I happened to observe...", "Most peculiar..."
` : `
Inspector Brown should:
- Speak with authority and deduction
- Reference evidence and logical reasoning
- If this isn't the first clue, acknowledge previous findings: "Building on what we know..."
- Use phrases like "My investigation reveals...", "The evidence suggests...", "Most illuminating..."
`}

${clueIndex > 0 ? `
IMPORTANT: This is clue #${clueIndex + 1}. Reference that the investigation has been ongoing.
Previous clues have established: ${this.context.revealedClues.slice(0, clueIndex).map(c => c.speaker).join(", ")} have spoken.
` : `
IMPORTANT: This is the FIRST clue. Set the tone for the investigation.
`}

Write ONLY the enhanced clue text (1-3 sentences). Keep the same factual information but add atmosphere and character voice.`;

    try {
      const response = await this.ai.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });

      return extractResponse(response) || clueText;
    } catch {
      return clueText;
    }
  }

  /**
   * Generate a dramatic event based on current game state
   */
  async generateDramaticEvent(): Promise<{
    description: string;
    affectedSuspects: string[];
  } | null> {
    const eventContext = generateDramaticEventContext(this.context);

    const prompt = `${eventContext}

---

## TASK: Generate a dramatic event for this moment in the investigation

Current clue: ${this.context.progression.cluesRevealed} of ${this.context.progression.totalClues}
Tension level: ${this.context.progression.tensionLevel}
Remaining suspects: ${this.context.remaining.suspects.map(s => s.name).join(", ")}

Generate a dramatic event that:
1. Creates tension and suspense
2. Involves 1-2 of the REMAINING suspects (not eliminated ones)
3. Does NOT reveal the solution
4. Builds on previous events if any occurred
5. Fits the ${this.context.theme.name} theme

${this.context.dramaticEvents.length > 0 ? `
Previous dramatic events:
${this.context.dramaticEvents.map(e => `- ${e.description}`).join("\n")}
Do NOT repeat these. Build on them or create something new.
` : "This is the first dramatic event."}

Respond in JSON format:
{
  "description": "What happens (2-3 sentences, dramatic and atmospheric)",
  "affectedSuspects": ["SUSPECT_ID_1"] // Use actual suspect IDs from remaining suspects
}`;

    try {
      const response = await this.ai.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 250,
      });

      const text = extractResponse(response);
      if (text) {
        const parsed = JSON.parse(text) as {
          description?: string;
          affectedSuspects?: string[];
        };
        if (parsed.description) {
          return {
            description: parsed.description,
            affectedSuspects: parsed.affectedSuspects || [],
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate mid-game commentary (Inspector or Butler reflects on progress)
   */
  async generateProgressCommentary(speaker: "Ashe" | "Inspector Brown"): Promise<string> {
    const commentaryContext = generateCommentaryContext(this.context);

    const prompt = `${commentaryContext}

---

## TASK: Generate ${speaker}'s commentary on the investigation progress

${speaker} should reflect on:
1. How many clues have been revealed (${this.context.progression.cluesRevealed} of ${this.context.progression.totalClues})
2. What has been eliminated so far
3. The narrowing field of suspects/items/locations/times
4. The tension level (${this.context.progression.tensionLevel})
${this.context.failedAccusations.length > 0 ? `5. The ${this.context.failedAccusations.length} failed accusation(s)` : ""}

${speaker === "Ashe" ? `
Ashe should speak as a butler: formal, observant, slightly nervous about the goings-on in the household.
"If I may summarize what we've learned, sir..."
` : `
Inspector Brown should speak as a detective: analytical, confident, building toward the solution.
"Let me review the evidence we've gathered..."
`}

Write 2-3 sentences of ${speaker}'s commentary. Be specific about what's been learned.`;

    try {
      const response = await this.ai.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });

      return extractResponse(response) || getDefaultCommentary(speaker, this.context);
    } catch {
      return getDefaultCommentary(speaker, this.context);
    }
  }

  /**
   * Generate response to a wrong accusation
   */
  async generateWrongAccusationResponse(
    player: string,
    accusation: {
      suspectId: string;
      itemId: string;
      locationId: string;
      timeId: string;
    }
  ): Promise<string> {
    const suspect = SUSPECTS.find(s => s.id === accusation.suspectId);
    const item = ITEMS.find(i => i.id === accusation.itemId);
    const location = LOCATIONS.find(l => l.id === accusation.locationId);
    const time = TIME_PERIODS.find(t => t.id === accusation.timeId);

    const prompt = `${generateCommentaryContext(this.context)}

---

## TASK: Generate Inspector Brown's response to a WRONG accusation

${player} accused:
- Suspect: ${suspect?.displayName || accusation.suspectId}
- Item: ${item?.nameUS || accusation.itemId}
- Location: ${location?.name || accusation.locationId}
- Time: ${time?.name || accusation.timeId}

This accusation is WRONG. Inspector Brown must:
1. Dismiss this accusation firmly but not reveal which part is wrong
2. Encourage continued investigation
3. Raise the dramatic tension
4. Reference that this is wrong accusation #${this.context.progression.wrongAccusations + 1}

${this.context.failedAccusations.length > 0 ? `
Previous wrong accusations:
${this.context.failedAccusations.map(a => `- ${a.player}: ${a.accusation}`).join("\n")}
Reference that accusations keep failing if appropriate.
` : ""}

Write Inspector Brown's response (2-3 sentences). Dramatic and dismissive, but not revealing.`;

    try {
      const response = await this.ai.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      });

      return extractResponse(response) || getDefaultWrongAccusationResponse();
    } catch {
      return getDefaultWrongAccusationResponse();
    }
  }

  /**
   * Generate the closing narration with full game history awareness
   */
  async generateClosingNarration(): Promise<string> {
    const closingContext = generateClosingContext(this.context, this.game.solution);

    const prompt = `${closingContext}

---

## TASK: Generate Inspector Brown's dramatic closing narration

The mystery has been SOLVED. Write Inspector Brown's revelation that:

1. Opens dramatically: "Ladies and gentlemen, the truth is revealed..."
2. References the journey: ${this.context.progression.cluesRevealed} clues revealed, key moments
3. Explains HOW the clues led to this conclusion (reference specific clues)
4. Reveals the thief's MOTIVE based on their character
5. Explains why this time and place were chosen
${this.context.failedAccusations.length > 0 ? `6. Acknowledges the ${this.context.failedAccusations.length} wrong accusation(s) and how they misled` : ""}
7. Closes with satisfaction that justice is served

Write 3-4 paragraphs. Dramatic, revelatory, conclusive. Use 1920s British detective language.`;

    try {
      const response = await this.ai.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      });

      return extractResponse(response) || getDefaultClosingNarration(this.game.solution);
    } catch {
      return getDefaultClosingNarration(this.game.solution);
    }
  }

  /**
   * Get the current context (for debugging/display)
   */
  getContext(): GameProgressionContext {
    return this.context;
  }
}

// ============================================
// FALLBACK GENERATORS
// ============================================

function getDefaultCommentary(
  speaker: string,
  context: GameProgressionContext
): string {
  if (speaker === "Ashe") {
    return `If I may say, sir, we have reviewed ${context.progression.cluesRevealed} pieces of evidence thus far. ` +
      `${context.eliminated.suspects.length} guests have been cleared of suspicion, ` +
      `yet ${context.remaining.suspects.length} remain under scrutiny. The tension in the household is palpable.`;
  } else {
    return `We have gathered ${context.progression.cluesRevealed} clues in our investigation. ` +
      `The evidence has eliminated ${context.eliminated.suspects.length} suspects, ` +
      `leaving ${context.remaining.suspects.length} persons of interest. We are making progress.`;
  }
}

function getDefaultWrongAccusationResponse(): string {
  return "I'm afraid that accusation does not match the evidence, my friend. " +
    "The truth remains hidden, but not for long. Continue your investigation with renewed focus.";
}

function getDefaultClosingNarration(solution: GameSession["solution"]): string {
  const suspect = SUSPECTS.find(s => s.id === solution.suspectId);
  const item = ITEMS.find(i => i.id === solution.itemId);
  const location = LOCATIONS.find(l => l.id === solution.locationId);
  const time = TIME_PERIODS.find(t => t.id === solution.timeId);

  return `And so the truth is revealed! ${suspect?.displayName || "The thief"} stole the ` +
    `${item?.nameUS || "item"} from the ${location?.name || "location"} during ${time?.name || "the time"}.\n\n` +
    `The evidence was there all along, hidden in plain sight. A motive, an opportunity, and the cunning ` +
    `to nearly escape detection. But justice prevails at Tudor Mansion, and Scotland Yard has closed another case!`;
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create an AI narrator for an active game
 */
export async function createGameNarrator(
  ai: Ai,
  db: D1Database,
  gameId: string
): Promise<AIGameNarrator | null> {
  // Import dynamically to avoid circular dependencies
  const { getGame, getGameState, getGameActions } = await import("./game-session");

  const game = await getGame(db, gameId);
  const state = await getGameState(db, gameId);
  const actions = await getGameActions(db, gameId);

  if (!game || !state) return null;

  return new AIGameNarrator(ai, game, state, actions);
}
