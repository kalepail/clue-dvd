/**
 * Clue DVD Game - AI Narrative Enhancement
 * Uses Cloudflare Workers AI to generate rich narrative content
 */

import type { Scenario, ScenarioNarrative, SuspectContext, DramaticEvent } from "../types/scenario";
import type { Suspect, Item, Location, TimePeriod, MysteryTheme } from "../data/game-elements";

// ============================================
// AI NARRATIVE GENERATOR
// ============================================

export async function enhanceNarrativeWithAI(
  ai: Ai,
  scenario: Scenario
): Promise<ScenarioNarrative> {
  const { solution, theme, clues } = scenario;

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
// INDIVIDUAL GENERATORS
// ============================================

async function generateOpeningNarration(
  ai: Ai,
  theme: MysteryTheme,
  solution: { suspect: Suspect; item: Item; location: Location; time: TimePeriod }
): Promise<string> {
  const prompt = `You are Inspector Brown from Scotland Yard, narrating the opening of a Clue mystery game set in 1920s England at Tudor Mansion.

Theme: "${theme.name}" - ${theme.description}
Period: ${theme.period}
Atmosphere: ${theme.atmosphericElements.join(", ")}

Write a dramatic, engaging opening narration (2-3 paragraphs) that:
1. Sets the scene at Tudor Mansion during this event
2. Introduces the mystery of a stolen valuable item
3. Creates suspense and intrigue
4. Speaks in the voice of a British detective from the 1920s

Do NOT reveal any details about WHO committed the crime, WHAT was stolen, WHERE, or WHEN. Keep the mystery intact.

Write only the narration, no meta commentary.`;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    if ("response" in response && typeof response.response === "string") {
      return response.response;
    }
    return scenario.narrative?.openingNarration || generateFallbackOpening(theme);
  } catch {
    return generateFallbackOpening(theme);
  }
}

async function generateAtmosphericDescription(
  ai: Ai,
  theme: MysteryTheme,
  location: Location
): Promise<string> {
  const prompt = `Describe the atmosphere of Tudor Mansion during "${theme.name}" in the 1920s.

The atmospheric elements are: ${theme.atmosphericElements.join(", ")}

Write a vivid, sensory description (1 paragraph) that captures:
- The mood and ambiance
- Sounds, sights, and perhaps scents
- The tension beneath the surface

Write in third person, present tense. Be evocative but concise.`;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    if ("response" in response && typeof response.response === "string") {
      return response.response;
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

  // Get list of suspects from the scenario's clues to include
  const allSuspectIds = new Set(
    scenario.narrative.suspectBackstories.map((s) => s.suspectId)
  );

  for (const suspectId of allSuspectIds) {
    const suspect = scenario.narrative.suspectBackstories.find(
      (s) => s.suspectId === suspectId
    );

    if (!suspect) continue;

    // For the guilty suspect, generate subtle hints; for others, generate alibis
    const isGuilty = suspectId === solution.suspect.id;

    const prompt = `For a 1920s Clue mystery game, write brief details for a suspect.

Suspect: Based on ID ${suspectId}
Theme: "${theme.name}"
${isGuilty ? "This suspect IS the guilty party (but don't make it obvious)" : "This suspect is innocent"}

Provide (one sentence each):
1. A subtle motive hint (without being too obvious)
2. Their claimed alibi for the evening
3. One suspicious behavior noticed by others

Format as JSON:
{
  "motiveHint": "...",
  "alibiClaim": "...",
  "suspiciousBehavior": "..."
}`;

    try {
      const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });

      if ("response" in response && typeof response.response === "string") {
        const parsed = JSON.parse(response.response);
        contexts.push({
          suspectId,
          motiveHint: parsed.motiveHint || suspect.motiveHint,
          alibiClaim: parsed.alibiClaim || suspect.alibiClaim,
          suspiciousBehavior: parsed.suspiciousBehavior || suspect.suspiciousBehavior,
        });
      } else {
        contexts.push(suspect);
      }
    } catch {
      contexts.push(suspect);
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

  const prompt = `For a 1920s Clue mystery game with theme "${theme.name}", generate 3 dramatic events that occur during gameplay.

These events add tension but don't reveal the solution. They should:
- Happen at different points in the game
- Create atmosphere and suspense
- Involve some of the suspects
- Be appropriate for 1920s Tudor Mansion setting

Format as JSON array:
[
  { "triggerAfterClue": 2, "description": "...", "affectedSuspects": [] },
  { "triggerAfterClue": 5, "description": "...", "affectedSuspects": [] },
  { "triggerAfterClue": 8, "description": "...", "affectedSuspects": [] }
]`;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    if ("response" in response && typeof response.response === "string") {
      const parsed = JSON.parse(response.response);
      if (Array.isArray(parsed)) {
        return parsed.map((event: { triggerAfterClue?: number; description?: string; affectedSuspects?: string[] }, i: number) => ({
          triggerAfterClue: event.triggerAfterClue || Math.floor((i + 1) * (clueCount / 4)),
          description: event.description || "An unexpected sound echoes through the mansion.",
          affectedSuspects: event.affectedSuspects || [],
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

  const prompt = `You are Inspector Brown from Scotland Yard, delivering the dramatic conclusion to a Clue mystery.

The solution has been revealed:
- The thief: ${solution.suspect.displayName} (${solution.suspect.role})
- The stolen item: ${solution.item.nameUS}
- The location of the theft: ${solution.location.name}
- The time: ${solution.time.name}
- Event theme: "${theme.name}"

Write a dramatic closing narration (2 paragraphs) that:
1. Dramatically reveals how you pieced together the clues
2. Explains the thief's motive and opportunity
3. Concludes with a satisfying resolution
4. Uses authentic 1920s British detective language

Write only the narration.`;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    if ("response" in response && typeof response.response === "string") {
      return response.response;
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
  const prompt = `Enhance this clue for a 1920s Clue mystery game. Keep the same information but make it more atmospheric and fitting for a ${speaker === "Ashe" ? "butler" : "detective"} character.

Original: "${clueText}"
Theme: "${theme.name}"
Speaker: ${speaker}

Rewrite in one or two sentences, maintaining the clue's logic but adding period-appropriate flavor.`;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
    });

    if ("response" in response && typeof response.response === "string") {
      return response.response;
    }
    return clueText;
  } catch {
    return clueText;
  }
}
