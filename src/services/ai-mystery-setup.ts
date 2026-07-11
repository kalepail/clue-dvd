import { ITEMS, LOCATIONS, MYSTERY_THEMES, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import type { GenerateCampaignRequest, GeneratedScenario } from "../types/campaign";
import type { Answer } from "./ai-mystery-schemas";
import { SeededRandom } from "./seeded-random";

const AI_THEME_ID = "AI01";
const EXPERT_CLUE_COUNT = 10;

export type MysterySetup = {
  seed: number;
  solution: Answer;
  themeId: typeof AI_THEME_ID;
  difficulty: "expert";
};

/** Select the immutable V2 answer without invoking the legacy clue planner. */
export function createMysterySetup(request: GenerateCampaignRequest = {}): MysterySetup {
  const requestedSeed = request.seed ?? Date.now();
  const seed = Number.isFinite(requestedSeed) ? Math.trunc(requestedSeed) : Date.now();
  const rng = new SeededRandom(seed);

  const suspects = availableCards(SUSPECTS, request.excludeSuspects, "suspects");
  const items = availableCards(ITEMS, request.excludeItems, "items");
  const locations = availableCards(LOCATIONS, request.excludeLocations, "locations");
  const times = availableCards(TIME_PERIODS, request.excludeTimes, "times");

  return {
    seed,
    themeId: AI_THEME_ID,
    difficulty: "expert",
    solution: {
      suspectId: rng.pick(suspects).id,
      itemId: rng.pick(items).id,
      locationId: rng.pick(locations).id,
      timeId: rng.pick(times).id,
    },
  };
}

/** Build the gameplay response envelope; V2 fills every narrative field later. */
export function createMysteryScenarioShell(setup: MysterySetup): GeneratedScenario {
  const theme = MYSTERY_THEMES.find((candidate) => candidate.id === setup.themeId) ?? MYSTERY_THEMES[0];
  const createdAt = new Date().toISOString();
  const answerKey = Object.values(setup.solution).join("-");
  const clues: GeneratedScenario["clues"] = Array.from({ length: EXPERT_CLUE_COUNT }, (_, index) => {
    const position = index + 1;
    return {
      id: `C${String(position).padStart(3, "0")}`,
      position,
      type: "butler",
      speaker: "Ashe",
      text: "Pending V2 evidence fragment.",
      act: position <= 4 ? "act1_setup" : position <= 8 ? "act2_confrontation" : "act3_resolution",
    };
  });

  return {
    id: `SCN-V2-${setup.seed}-${Date.now().toString(36)}`,
    campaignId: `CMP-V2-${setup.seed}-${answerKey}`,
    theme: { id: theme.id, name: theme.name, description: theme.description },
    solution: { ...setup.solution },
    clues,
    dramaticEvents: [],
    lockedRooms: [],
    inspectorNotes: [],
    narrative: {
      opening: "",
      setting: "A private gathering at Tudor Mansion.",
      atmosphere: "Polite ceremony gives way to careful observation.",
      closing: "",
    },
    metadata: {
      difficulty: setup.difficulty,
      totalClues: EXPERT_CLUE_COUNT,
      seed: setup.seed,
      createdAt,
      version: "2.1.0",
      engineVersion: "2.1-creative",
    },
  };
}

function availableCards<T extends { id: string }>(cards: T[], excluded: string[] | undefined, label: string): T[] {
  const excludedIds = new Set(excluded ?? []);
  const available = cards.filter((card) => !excludedIds.has(card.id));
  if (available.length === 0) throw new Error(`Cannot generate mystery: all ${label} were excluded.`);
  return available;
}
