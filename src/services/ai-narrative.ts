/**
 * Clue DVD Game - AI Narrative Enhancement
 * Uses Cloudflare Workers AI to generate rich narrative content
 *
 * IMPORTANT: All AI prompts are grounded with verified game data from ai-context.ts
 * to prevent hallucination and ensure accuracy to the physical game.
 */

import type { Scenario, ScenarioNarrative, SuspectContext, DramaticEvent } from "../types/scenario";
import type { GeneratedScenario } from "../types/campaign";
import type { Suspect, Item, Location, TimePeriod, MysteryTheme } from "../data/game-elements";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS, MYSTERY_THEMES } from "../data/game-elements";
import {
  buildAIContext,
  getCompactContext,
  getSolutionContext,
  getSuspectContext,
  getNPCContext,
  getLocationContext,
  CORE_GAME_CONTEXT,
} from "../data/ai-context";

// Valid AI model for text generation (must match Cloudflare Workers types)
const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8" as const;

// Type for the text generation response
interface AiTextResponse {
  response?: string;
}

// Helper to safely extract response text from AI response
function extractResponseText(response: unknown): string | null {
  if (
    response &&
    typeof response === "object" &&
    "response" in response &&
    typeof (response as AiTextResponse).response === "string"
  ) {
    return (response as AiTextResponse).response!;
  }
  return null;
}

// ============================================
// AI NARRATIVE GENERATOR
// ============================================

export async function enhanceNarrativeWithAI(
  ai: Ai,
  scenario: Scenario
): Promise<ScenarioNarrative> {
  const { solution, theme } = scenario;

  // Generate opening narration
  const openingNarration = await generateOpeningNarration(ai, theme, solution);

  // Generate atmospheric description
  const atmosphericDescription = await generateAtmosphericDescription(ai, theme, solution.location);

  // Generate suspect backstories with AI
  const suspectBackstories = await generateSuspectBackstories(ai, scenario);

  // Generate dramatic events
  const dramaticEvents = await generateDramaticEvents(ai, scenario);

  // Generate closing narration
  const closingNarration = await generateClosingNarration(ai, scenario);

  return {
    openingNarration,
    setting: scenario.narrative.setting,
    atmosphericDescription,
    suspectBackstories,
    dramaticEvents,
    closingNarration,
  };
}

// ============================================
// GENERATED SCENARIO AI ENHANCEMENT
// ============================================

/**
 * Enhance a GeneratedScenario with AI-generated narrative elements.
 * This function works with the new campaign-based scenario format.
 */
export async function enhanceScenarioWithAI(
  ai: Ai,
  scenario: GeneratedScenario
): Promise<GeneratedScenario> {
  // Look up full game elements from IDs
  const suspect = SUSPECTS.find((s) => s.id === scenario.solution.suspectId);
  const item = ITEMS.find((i) => i.id === scenario.solution.itemId);
  const location = LOCATIONS.find((l) => l.id === scenario.solution.locationId);
  const time = TIME_PERIODS.find((t) => t.id === scenario.solution.timeId);
  const theme = MYSTERY_THEMES.find((t) => t.id === scenario.theme.id);

  if (!suspect || !item || !location || !time || !theme) {
    // Return unchanged if we can't find elements
    return scenario;
  }

  // Generate enhanced narrative elements
  const [opening, atmosphere, closing] = await Promise.all([
    generateEnhancedOpening(ai, theme, { suspect, item, location, time }),
    generateEnhancedAtmosphere(ai, theme, location),
    generateEnhancedClosing(ai, scenario, { suspect, item, location, time }, theme),
  ]);

  return {
    ...scenario,
    narrative: {
      ...scenario.narrative,
      opening,
      atmosphere,
      closing,
    },
  };
}

/**
 * Generate enhanced opening narration for GeneratedScenario
 */
async function generateEnhancedOpening(
  ai: Ai,
  theme: MysteryTheme,
  _solution: { suspect: Suspect; item: Item; location: Location; time: TimePeriod }
): Promise<string> {
  const gameContext = getCompactContext();

  const prompt = `${gameContext}

---

You are Inspector Brown from Scotland Yard, narrating the opening of a Clue mystery game set in 1920s England at Tudor Mansion.

Theme: "${theme.name}" - ${theme.description}
Period: ${theme.period}
Atmosphere: ${theme.atmosphericElements.join(", ")}

Write a dramatic, engaging opening narration (2-3 paragraphs) that:
1. Sets the scene at Tudor Mansion during this event
2. Introduces the mystery of a stolen valuable item (THEFT, not murder)
3. Creates suspense and intrigue
4. Speaks in the voice of a British detective from the 1920s
5. You may mention that Mr. Boddy (the host) has called Scotland Yard
6. You may reference Ashe the butler if appropriate

CRITICAL: Do NOT reveal any details about WHO committed the crime, WHAT was stolen, WHERE, or WHEN. Keep the mystery intact.
CRITICAL: Only reference suspects, items, locations, and times from the QUICK REFERENCE above.

Write only the narration, no meta commentary.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return generateFallbackOpening(theme);
  } catch {
    return generateFallbackOpening(theme);
  }
}

/**
 * Generate enhanced atmospheric description for GeneratedScenario
 */
async function generateEnhancedAtmosphere(
  ai: Ai,
  theme: MysteryTheme,
  _location: Location
): Promise<string> {
  const locationContext = getLocationContext();

  const prompt = `${CORE_GAME_CONTEXT}
${locationContext}

---

Describe the atmosphere of Tudor Mansion during "${theme.name}" in the 1920s.

The atmospheric elements are: ${theme.atmosphericElements.join(", ")}

Write a vivid, sensory description (1 paragraph) that captures:
- The mood and ambiance
- Sounds, sights, and perhaps scents
- The tension beneath the surface

You may reference specific rooms from the LOCATIONS list above (e.g., "shadows in the Library", "candlelight in the Dining Room").
Remember: This is a THEFT mystery, not murder. The setting is England, 1920s.

Write in third person, present tense. Be evocative but concise.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return generateFallbackAtmosphere(theme);
  } catch {
    return generateFallbackAtmosphere(theme);
  }
}

/**
 * Generate enhanced closing narration for GeneratedScenario
 */
async function generateEnhancedClosing(
  ai: Ai,
  _scenario: GeneratedScenario,
  solution: { suspect: Suspect; item: Item; location: Location; time: TimePeriod },
  theme: MysteryTheme
): Promise<string> {
  const solutionContext = getSolutionContext(
    solution.suspect.id,
    solution.item.id,
    solution.location.id,
    solution.time.id
  );

  const prompt = `${CORE_GAME_CONTEXT}
${getNPCContext()}
${solutionContext}

---

You are Inspector Brown from Scotland Yard, delivering the dramatic conclusion to a Clue mystery.

The solution has been revealed:
- The thief: ${solution.suspect.displayName} (${solution.suspect.role})
- Their traits: ${solution.suspect.traits.join(", ")}
- The stolen item: ${solution.item.nameUS} (${solution.item.category})
- The location of the theft: ${solution.location.name}
- The time: ${solution.time.name} (${solution.time.lightCondition} conditions)
- Event theme: "${theme.name}"

Write a dramatic closing narration (2 paragraphs) that:
1. Dramatically reveals how you (Inspector Brown) pieced together the clues
2. Explains the thief's motive based on their CHARACTER TRAITS above
3. Explains why this location and time presented the opportunity
4. Concludes with a satisfying resolution
5. Uses authentic 1920s British detective language
6. Remember: This is THEFT, not murder - the item is recovered, the thief is caught

The thief's personality (${solution.suspect.traits.join(", ")}) should inform their motive.

Write only the narration.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return generateEnhancedFallbackClosing(solution, theme);
  } catch {
    return generateEnhancedFallbackClosing(solution, theme);
  }
}

/**
 * Fallback closing for GeneratedScenario
 */
function generateEnhancedFallbackClosing(
  solution: { suspect: Suspect; item: Item; location: Location; time: TimePeriod },
  _theme: MysteryTheme
): string {
  return `And so the truth is revealed! ${solution.suspect.displayName} stole the ${solution.item.nameUS} from the ${solution.location.name} during ${solution.time.name}.

The evidence was there all along, hidden in plain sight. A motive, an opportunity, and the cunning to nearly escape detection. But justice prevails at Tudor Mansion, and Scotland Yard has closed another case!`;
}

// ============================================
// INDIVIDUAL GENERATORS
// ============================================

async function generateOpeningNarration(
  ai: Ai,
  theme: MysteryTheme,
  _solution: { suspect: Suspect; item: Item; location: Location; time: TimePeriod }
): Promise<string> {
  // Build grounding context to prevent hallucination
  const gameContext = getCompactContext();

  const prompt = `${gameContext}

---

You are Inspector Brown from Scotland Yard, narrating the opening of a Clue mystery game set in 1920s England at Tudor Mansion.

Theme: "${theme.name}" - ${theme.description}
Period: ${theme.period}
Atmosphere: ${theme.atmosphericElements.join(", ")}

Write a dramatic, engaging opening narration (2-3 paragraphs) that:
1. Sets the scene at Tudor Mansion during this event
2. Introduces the mystery of a stolen valuable item (THEFT, not murder)
3. Creates suspense and intrigue
4. Speaks in the voice of a British detective from the 1920s
5. You may mention that Mr. Boddy (the host) has called Scotland Yard
6. You may reference Ashe the butler if appropriate

CRITICAL: Do NOT reveal any details about WHO committed the crime, WHAT was stolen, WHERE, or WHEN. Keep the mystery intact.
CRITICAL: Only reference suspects, items, locations, and times from the QUICK REFERENCE above.

Write only the narration, no meta commentary.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return generateFallbackOpening(theme);
  } catch {
    return generateFallbackOpening(theme);
  }
}

async function generateAtmosphericDescription(
  ai: Ai,
  theme: MysteryTheme,
  _location: Location
): Promise<string> {
  // Include location context for accurate room descriptions
  const locationContext = getLocationContext();

  const prompt = `${CORE_GAME_CONTEXT}
${locationContext}

---

Describe the atmosphere of Tudor Mansion during "${theme.name}" in the 1920s.

The atmospheric elements are: ${theme.atmosphericElements.join(", ")}

Write a vivid, sensory description (1 paragraph) that captures:
- The mood and ambiance
- Sounds, sights, and perhaps scents
- The tension beneath the surface

You may reference specific rooms from the LOCATIONS list above (e.g., "shadows in the Library", "candlelight in the Dining Room").
Remember: This is a THEFT mystery, not murder. The setting is England, 1920s.

Write in third person, present tense. Be evocative but concise.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return generateFallbackAtmosphere(theme);
  } catch {
    return generateFallbackAtmosphere(theme);
  }
}

async function generateSuspectBackstories(
  ai: Ai,
  scenario: Scenario
): Promise<SuspectContext[]> {
  const { solution, theme } = scenario;
  const contexts: SuspectContext[] = [];

  // Build full suspect context for grounding
  const suspectContext = getSuspectContext();

  // Get list of suspects from the scenario's clues to include
  const allSuspectIds = new Set(
    scenario.narrative.suspectBackstories.map((s) => s.suspectId)
  );

  for (const suspectId of allSuspectIds) {
    const existingContext = scenario.narrative.suspectBackstories.find(
      (s) => s.suspectId === suspectId
    );

    if (!existingContext) continue;

    // Look up the actual suspect data for accurate info
    const suspectData = SUSPECTS.find((s) => s.id === suspectId);
    if (!suspectData) continue;

    // For the guilty suspect, generate subtle hints; for others, generate alibis
    const isGuilty = suspectId === solution.suspect.id;

    const prompt = `${CORE_GAME_CONTEXT}
${suspectContext}

---

For a 1920s Clue mystery game, write brief details for this specific suspect:

Suspect: ${suspectData.displayName}
Role: ${suspectData.role}
Description: ${suspectData.description}
Known Traits: ${suspectData.traits.join(", ")}
Theme of the gathering: "${theme.name}"
${isGuilty ? "This suspect IS the guilty party (but don't make it too obvious)" : "This suspect is innocent"}

Based on their actual character traits above, provide (one sentence each):
1. A subtle motive hint that fits their personality and role
2. Their claimed alibi for the evening (must reference a REAL location from the game)
3. One suspicious behavior noticed by others

CRITICAL: Stay true to the character's description and traits. Reference only locations and times from the game data.

Format as JSON:
{
  "motiveHint": "...",
  "alibiClaim": "...",
  "suspiciousBehavior": "..."
}`;

    try {
      const response = await ai.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });

      const text = extractResponseText(response);
      if (text) {
        const parsed = JSON.parse(text) as {
          motiveHint?: string;
          alibiClaim?: string;
          suspiciousBehavior?: string;
        };
        contexts.push({
          suspectId,
          motiveHint: parsed.motiveHint || existingContext.motiveHint,
          alibiClaim: parsed.alibiClaim || existingContext.alibiClaim,
          suspiciousBehavior: parsed.suspiciousBehavior || existingContext.suspiciousBehavior,
        });
      } else {
        contexts.push(existingContext);
      }
    } catch {
      contexts.push(existingContext);
    }
  }

  return contexts.length > 0 ? contexts : scenario.narrative.suspectBackstories;
}

async function generateDramaticEvents(
  ai: Ai,
  scenario: Scenario
): Promise<DramaticEvent[]> {
  const { theme, clues } = scenario;
  const clueCount = clues.length;

  // Include full context for grounded event generation
  const gameContext = buildAIContext({
    includeSuspects: true,
    includeLocations: true,
    includeTimes: true,
    includeNPCs: true,
    includeItems: false, // Events shouldn't hint at the item
  });

  const prompt = `${gameContext}

---

For a 1920s Clue mystery game with theme "${theme.name}", generate 3 dramatic events that occur during gameplay.

These events add tension but don't reveal the solution. They should:
- Happen at different points in the game
- Create atmosphere and suspense
- Reference ONLY suspects from the list above (use their exact names)
- Reference ONLY locations from the list above
- Reference ONLY times from the list above
- Be appropriate for 1920s Tudor Mansion setting
- Remember: This is about THEFT, not murder or violence

IMPORTANT: In the "affectedSuspects" array, use the exact suspect IDs (e.g., "SUSPECT01", "SUSPECT02").

Format as JSON array:
[
  { "triggerAfterClue": 2, "description": "...", "affectedSuspects": [] },
  { "triggerAfterClue": 5, "description": "...", "affectedSuspects": [] },
  { "triggerAfterClue": 8, "description": "...", "affectedSuspects": [] }
]`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    const text = extractResponseText(response);
    if (text) {
      const parsed = JSON.parse(text) as Array<{
        triggerAfterClue?: number;
        description?: string;
        affectedSuspects?: string[];
      }>;
      if (Array.isArray(parsed)) {
        return parsed.map((event, i) => ({
          triggerAfterClue: event.triggerAfterClue ?? Math.floor((i + 1) * (clueCount / 4)),
          description: event.description ?? "An unexpected sound echoes through the mansion.",
          affectedSuspects: event.affectedSuspects ?? [],
        }));
      }
    }
    return scenario.narrative.dramaticEvents;
  } catch {
    return scenario.narrative.dramaticEvents;
  }
}

async function generateClosingNarration(
  ai: Ai,
  scenario: Scenario
): Promise<string> {
  const { solution, theme } = scenario;

  // Include solution-specific context for accurate character portrayal
  const solutionContext = getSolutionContext(
    solution.suspect.id,
    solution.item.id,
    solution.location.id,
    solution.time.id
  );

  const prompt = `${CORE_GAME_CONTEXT}
${getNPCContext()}
${solutionContext}

---

You are Inspector Brown from Scotland Yard, delivering the dramatic conclusion to a Clue mystery.

The solution has been revealed:
- The thief: ${solution.suspect.displayName} (${solution.suspect.role})
- Their traits: ${solution.suspect.traits.join(", ")}
- The stolen item: ${solution.item.nameUS} (${solution.item.category})
- The location of the theft: ${solution.location.name}
- The time: ${solution.time.name} (${solution.time.lightCondition} conditions)
- Event theme: "${theme.name}"

Write a dramatic closing narration (2 paragraphs) that:
1. Dramatically reveals how you (Inspector Brown) pieced together the clues
2. Explains the thief's motive based on their CHARACTER TRAITS above
3. Explains why this location and time presented the opportunity
4. Concludes with a satisfying resolution
5. Uses authentic 1920s British detective language
6. Remember: This is THEFT, not murder - the item is recovered, the thief is caught

The thief's personality (${solution.suspect.traits.join(", ")}) should inform their motive.

Write only the narration.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return generateFallbackClosing(scenario);
  } catch {
    return generateFallbackClosing(scenario);
  }
}

// ============================================
// FALLBACK GENERATORS
// ============================================

function generateFallbackOpening(theme: MysteryTheme): string {
  return `Welcome to Tudor Mansion. It is ${theme.period}, and Mr. Boddy has invited his guests for "${theme.name}". ${theme.description}

The evening began pleasantly enough, with guests mingling in the grand halls. The ${theme.atmosphericElements.join(" and ")} created an atmosphere of refined elegance. But beneath the surface, tensions simmered.

Then, a discovery was made that would change everything. Something precious has vanished from Mr. Boddy's collection. Scotland Yard has been called in, and I, Inspector Brown, shall not rest until the culprit is brought to justice.`;
}

function generateFallbackAtmosphere(theme: MysteryTheme): string {
  return `The ${theme.atmosphericElements.join(", ")} creates an air of mystery. Shadows dance in the corners of the mansion's grand rooms, and every creak of the floorboards seems significant.`;
}

function generateFallbackClosing(scenario: Scenario): string {
  const { solution } = scenario;
  return `And so the truth is revealed! ${solution.suspect.displayName} stole the ${solution.item.nameUS} from the ${solution.location.name} during ${solution.time.name}.

The evidence was there all along, hidden in plain sight. A motive, an opportunity, and the cunning to nearly escape detection. But justice prevails at Tudor Mansion, and Scotland Yard has closed another case!`;
}

// ============================================
// SINGLE CLUE ENHANCEMENT
// ============================================

export async function enhanceClueText(
  ai: Ai,
  clueText: string,
  speaker: string,
  theme: MysteryTheme
): Promise<string> {
  // Include NPC context for accurate speaking styles
  const npcContext = getNPCContext();

  const prompt = `${CORE_GAME_CONTEXT}
${npcContext}

---

Enhance this clue for a 1920s Clue mystery game. Keep the same information but make it more atmospheric.

Original: "${clueText}"
Theme: "${theme.name}"
Speaker: ${speaker}

${speaker === "Ashe"
    ? "Ashe is the butler: deferential, proper, uses phrases like 'If I may say, sir...', 'I happened to notice...', 'The master's collection...'"
    : "Inspector Brown is the detective: formal, uses 'I observed...', 'The evidence suggests...', 'Most curious...'"
  }

CRITICAL: Keep ALL factual information from the original clue intact - names, locations, times, items. Only enhance the delivery style.
CRITICAL: Do not add new information or change any names/places mentioned.

Rewrite in one or two sentences, maintaining the clue's logic but adding period-appropriate flavor for the speaker.`;

  try {
    const response = await ai.run(AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
    });

    const text = extractResponseText(response);
    if (text) {
      return text;
    }
    return clueText;
  } catch {
    return clueText;
  }
}
