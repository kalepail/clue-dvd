/**
 * Clue DVD Game - Scenario Generator
 * Generates valid mystery scenarios with logically consistent clues
 */

import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
  getRandomElement,
  getRandomElements,
  type Suspect,
  type Item,
  type Location,
  type TimePeriod,
  type MysteryTheme,
} from "../data/game-elements";

import type {
  Scenario,
  Solution,
  Clue,
  ClueLogic,
  EliminationInfo,
  GameSetup,
  LockedRoom,
  CardDistribution,
  ItemPlacement,
  ScenarioNarrative,
  SuspectContext,
  DramaticEvent,
  ScenarioMetadata,
  GenerateScenarioRequest,
  ClueType,
  ValidationResult,
} from "../types/scenario";

// ============================================
// RANDOM SEEDING
// ============================================

class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Date.now();
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  pickMultiple<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => this.next() - 0.5);
    return shuffled.slice(0, count);
  }

  shuffle<T>(array: T[]): T[] {
    return [...array].sort(() => this.next() - 0.5);
  }
}

// ============================================
// DIFFICULTY SETTINGS
// ============================================

interface DifficultySettings {
  clueCount: number;
  directClues: number; // Clues that directly eliminate solution elements
  redHerrings: number;
  lockedRoomCount: number;
}

const DIFFICULTY_SETTINGS: Record<string, DifficultySettings> = {
  beginner: { clueCount: 12, directClues: 8, redHerrings: 1, lockedRoomCount: 1 },
  intermediate: { clueCount: 10, directClues: 6, redHerrings: 2, lockedRoomCount: 2 },
  expert: { clueCount: 8, directClues: 4, redHerrings: 3, lockedRoomCount: 3 },
};

// ============================================
// SOLUTION GENERATOR
// ============================================

function generateSolution(
  rng: SeededRandom,
  excludes: {
    suspects?: string[];
    items?: string[];
    locations?: string[];
    times?: string[];
  }
): Solution {
  const availableSuspects = SUSPECTS.filter((s) => !excludes.suspects?.includes(s.id));
  const availableItems = ITEMS.filter((i) => !excludes.items?.includes(i.id));
  const availableLocations = LOCATIONS.filter((l) => !excludes.locations?.includes(l.id));
  const availableTimes = TIME_PERIODS.filter((t) => !excludes.times?.includes(t.id));

  return {
    suspect: rng.pick(availableSuspects),
    item: rng.pick(availableItems),
    location: rng.pick(availableLocations),
    time: rng.pick(availableTimes),
  };
}

// ============================================
// CLUE GENERATOR
// ============================================

function generateClues(
  rng: SeededRandom,
  solution: Solution,
  settings: DifficultySettings
): Clue[] {
  const clues: Clue[] = [];
  let clueId = 1;

  // Get non-solution elements for elimination clues
  const otherSuspects = SUSPECTS.filter((s) => s.id !== solution.suspect.id);
  const otherItems = ITEMS.filter((i) => i.id !== solution.item.id);
  const otherLocations = LOCATIONS.filter((l) => l.id !== solution.location.id);
  const otherTimes = TIME_PERIODS.filter((t) => t.id !== solution.time.id);

  // Generate suspect elimination clues
  const suspectClues = generateSuspectClues(rng, otherSuspects, solution, clueId);
  clues.push(...suspectClues);
  clueId += suspectClues.length;

  // Generate item elimination clues
  const itemClues = generateItemClues(rng, otherItems, solution, clueId);
  clues.push(...itemClues);
  clueId += itemClues.length;

  // Generate location elimination clues
  const locationClues = generateLocationClues(rng, otherLocations, solution, clueId);
  clues.push(...locationClues);
  clueId += locationClues.length;

  // Generate time elimination clues
  const timeClues = generateTimeClues(rng, otherTimes, solution, clueId);
  clues.push(...timeClues);
  clueId += timeClues.length;

  // Shuffle and limit to clue count
  const shuffledClues = rng.shuffle(clues);
  const selectedClues = shuffledClues.slice(0, settings.clueCount);

  // Assign reveal order
  return selectedClues.map((clue, index) => ({
    ...clue,
    revealOrder: index + 1,
  }));
}

function generateSuspectClues(
  rng: SeededRandom,
  otherSuspects: Suspect[],
  solution: Solution,
  startId: number
): Clue[] {
  const clues: Clue[] = [];
  const clueTypes: ClueType[] = ["butler", "inspector_note", "observation"];

  // Group elimination: 3 suspects were together
  if (otherSuspects.length >= 3) {
    const group = rng.pickMultiple(otherSuspects, 3);
    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: rng.pick(clueTypes),
      speaker: rng.pick(["Ashe", "Inspector Brown"]),
      text: `I overheard ${group[0].displayName}, ${group[1].displayName}, and ${group[2].displayName} arguing over who had the best collection of antiques. They were together in the ${solution.location.name} the entire time.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "suspect",
            ids: group.map((s) => s.id),
            reason: "These suspects were together and could not have acted alone",
          },
        ],
        reasoning: "A group of suspects together cannot have committed the theft individually",
      },
    });
  }

  // Alibi clues
  const alibiedSuspects = rng.pickMultiple(otherSuspects, 2);
  for (const suspect of alibiedSuspects) {
    const alibiLocation = rng.pick(LOCATIONS.filter((l) => l.id !== solution.location.id));
    const alibiTime = solution.time;

    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: "inspector_note",
      speaker: "Inspector Brown",
      text: `${suspect.displayName} never left the ${alibiLocation.name} between ${alibiTime.name} and the following hour. Multiple witnesses confirm this.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "suspect",
            ids: [suspect.id],
            reason: `${suspect.displayName} has a verified alibi for the time of the theft`,
          },
        ],
        reasoning: "A suspect with a confirmed alibi cannot have committed the theft",
      },
    });
  }

  // Behavioral clue
  const behaviorSuspect = rng.pick(otherSuspects.filter((s) => !alibiedSuspects.includes(s)));
  if (behaviorSuspect) {
    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: "butler",
      speaker: "Ashe",
      text: `I had complimented ${behaviorSuspect.displayName} on the ${solution.item.category} piece she was admiring when she arrived. She mentioned Mr. Boddy had already given it to her as a gift.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "suspect",
            ids: [behaviorSuspect.id],
            reason: `${behaviorSuspect.displayName} already possessed the item legitimately`,
          },
        ],
        reasoning: "No motive to steal what one already owns",
      },
    });
  }

  return clues;
}

function generateItemClues(
  rng: SeededRandom,
  otherItems: Item[],
  solution: Solution,
  startId: number
): Clue[] {
  const clues: Clue[] = [];

  // Category elimination
  const categories = ["antique", "desk", "jewelry"] as const;
  for (const category of categories) {
    if (solution.item.category !== category) {
      const categoryItems = otherItems.filter((i) => i.category === category);
      if (categoryItems.length > 0) {
        clues.push({
          id: `C${String(startId++).padStart(3, "0")}`,
          type: "butler",
          speaker: "Ashe",
          text: `By the time I went to bed after ${solution.time.name}, all of the ${category} items had been locked up and accounted for.`,
          revealOrder: 0,
          logic: {
            eliminates: [
              {
                category: "item",
                ids: categoryItems.map((i) => i.id),
                reason: `All ${category} items were secured`,
              },
            ],
            reasoning: `Items that were confirmed secure cannot be the stolen item`,
          },
        });
        break; // Only one category clue
      }
    }
  }

  // Specific item sighting
  const seenItem = rng.pick(otherItems);
  const sightingLocation = rng.pick(LOCATIONS);
  const laterTime = TIME_PERIODS.find((t) => t.order > solution.time.order) || solution.time;

  clues.push({
    id: `C${String(startId++).padStart(3, "0")}`,
    type: "observation",
    speaker: "Inspector Brown",
    text: `The ${seenItem.nameUS} was spotted in the ${sightingLocation.name} during ${laterTime.name}, after the theft occurred.`,
    revealOrder: 0,
    logic: {
      eliminates: [
        {
          category: "item",
          ids: [seenItem.id],
          reason: `${seenItem.nameUS} was seen after the theft time`,
        },
      ],
      reasoning: "An item seen after the theft cannot be the stolen item",
    },
  });

  return clues;
}

function generateLocationClues(
  rng: SeededRandom,
  otherLocations: Location[],
  solution: Solution,
  startId: number
): Clue[] {
  const clues: Clue[] = [];

  // Renovation/inaccessible clue
  const inaccessible = rng.pick(otherLocations);
  clues.push({
    id: `C${String(startId++).padStart(3, "0")}`,
    type: "inspector_note",
    speaker: "Inspector Brown",
    text: `The ${inaccessible.name} was being renovated and no one could enter it all weekend.`,
    revealOrder: 0,
    logic: {
      eliminates: [
        {
          category: "location",
          ids: [inaccessible.id],
          reason: `${inaccessible.name} was inaccessible`,
        },
      ],
      reasoning: "An inaccessible location cannot be the crime scene",
    },
  });

  // Undisturbed location clue
  const undisturbed = rng.pick(otherLocations.filter((l) => l.id !== inaccessible.id));
  if (undisturbed) {
    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: "observation",
      speaker: "Inspector Brown",
      text: `The display case in the ${undisturbed.name} appears completely undisturbed. Not a speck of dust was moved.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "location",
            ids: [undisturbed.id],
            reason: `${undisturbed.name} shows no signs of disturbance`,
          },
        ],
        reasoning: "A theft would leave some evidence of tampering",
      },
    });
  }

  // Outdoor location weather clue (if applicable)
  const outdoorLocations = otherLocations.filter((l) => l.type === "outdoor");
  if (outdoorLocations.length > 0 && solution.time.lightCondition === "dark") {
    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: "butler",
      speaker: "Ashe",
      text: `The outdoor areas were completely dark during ${solution.time.name}. No one could have found their way without a lantern, and none were missing.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "location",
            ids: outdoorLocations.map((l) => l.id),
            reason: "Outdoor locations were too dark to navigate",
          },
        ],
        reasoning: "Cannot commit theft in complete darkness without light",
      },
    });
  }

  return clues;
}

function generateTimeClues(
  rng: SeededRandom,
  otherTimes: TimePeriod[],
  solution: Solution,
  startId: number
): Clue[] {
  const clues: Clue[] = [];

  // All suspects together clue
  const togetherTime = rng.pick(otherTimes);
  const togetherLocation = rng.pick(LOCATIONS);
  clues.push({
    id: `C${String(startId++).padStart(3, "0")}`,
    type: "inspector_note",
    speaker: "Inspector Brown",
    text: `During ${togetherTime.name} all guests were gathered in the ${togetherLocation.name}. No one left for even a moment.`,
    revealOrder: 0,
    logic: {
      eliminates: [
        {
          category: "time",
          ids: [togetherTime.id],
          reason: `All suspects were together during ${togetherTime.name}`,
        },
      ],
      reasoning: "If everyone was together, no one could sneak away to commit the theft",
    },
  });

  // Item still present clue
  const stillPresentTime = rng.pick(otherTimes.filter((t) => t.order < solution.time.order));
  if (stillPresentTime) {
    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: "butler",
      speaker: "Ashe",
      text: `I personally verified the ${solution.item.nameUS} was still in its place during ${stillPresentTime.name}.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "time",
            ids: [stillPresentTime.id],
            reason: `Item was confirmed present during ${stillPresentTime.name}`,
          },
        ],
        reasoning: "Theft could not have occurred before the item was confirmed missing",
      },
    });
  }

  // Staff activity clue
  const staffActiveTime = rng.pick(otherTimes.filter((t) => t.name === "Dawn" || t.name === "Breakfast"));
  if (staffActiveTime) {
    clues.push({
      id: `C${String(startId++).padStart(3, "0")}`,
      type: "butler",
      speaker: "Ashe",
      text: `During ${staffActiveTime.name}, the entire staff was about their duties throughout the mansion. Any suspicious activity would have been noticed.`,
      revealOrder: 0,
      logic: {
        eliminates: [
          {
            category: "time",
            ids: [staffActiveTime.id],
            reason: `Too much staff activity during ${staffActiveTime.name}`,
          },
        ],
        reasoning: "High staff presence would deter theft attempts",
      },
    });
  }

  return clues;
}

// ============================================
// GAME SETUP GENERATOR
// ============================================

function generateGameSetup(
  rng: SeededRandom,
  solution: Solution,
  theme: MysteryTheme,
  settings: DifficultySettings,
  clueCount: number
): GameSetup {
  // Locked rooms
  const lockedRooms: LockedRoom[] = [];
  const lockableLocations = LOCATIONS.filter(
    (l) => l.canBeLocked && l.id !== solution.location.id
  );

  // Use theme's typical locked rooms or random
  const roomsToLock = theme.typicalLockedRooms.length > 0
    ? theme.typicalLockedRooms.slice(0, settings.lockedRoomCount)
    : rng.pickMultiple(lockableLocations, settings.lockedRoomCount).map((l) => l.name);

  roomsToLock.forEach((roomName, index) => {
    const location = LOCATIONS.find((l) => l.name === roomName);
    if (location) {
      lockedRooms.push({
        locationId: location.id,
        unlocksAfterClue: Math.floor((index + 1) * (clueCount / (settings.lockedRoomCount + 1))),
      });
    }
  });

  // Card distribution
  const itemIds = ITEMS.map((i) => i.id);
  const butlersPantryItems = itemIds.filter((id) => id !== solution.item.id);

  const suspectIds = SUSPECTS.map((s) => s.id).filter((id) => id !== solution.suspect.id);
  const locationIds = LOCATIONS.map((l) => l.id).filter((id) => id !== solution.location.id);
  const timeIds = TIME_PERIODS.map((t) => t.id).filter((id) => id !== solution.time.id);

  const cardDistribution: CardDistribution = {
    caseFileEnvelope: {
      suspectId: solution.suspect.id,
      itemId: solution.item.id,
      locationId: solution.location.id,
      timeId: solution.time.id,
    },
    butlersPantry: rng.shuffle(butlersPantryItems),
    availableForDealing: rng.shuffle([...suspectIds, ...locationIds, ...timeIds]),
  };

  // Item placements during game
  const itemPlacements: ItemPlacement[] = [];
  const placementItems = rng.pickMultiple(butlersPantryItems, 4);
  const placementLocations = rng.pickMultiple(
    LOCATIONS.filter((l) => l.id !== solution.location.id),
    4
  );

  placementItems.forEach((itemId, index) => {
    itemPlacements.push({
      itemId,
      locationId: placementLocations[index]?.id || "L01",
      revealedAfterClue: Math.floor((index + 1) * (clueCount / 5)),
    });
  });

  return {
    lockedRooms,
    cardDistribution,
    initialItemPlacements: itemPlacements,
  };
}

// ============================================
// NARRATIVE GENERATOR (PLACEHOLDER FOR AI)
// ============================================

function generateNarrative(
  solution: Solution,
  theme: MysteryTheme,
  clues: Clue[]
): ScenarioNarrative {
  // Basic narrative generation - will be enhanced with AI
  const suspectContexts: SuspectContext[] = SUSPECTS.map((suspect) => ({
    suspectId: suspect.id,
    motiveHint: suspect.id === solution.suspect.id
      ? `${suspect.displayName} has been seen admiring the ${solution.item.nameUS} with great interest.`
      : `${suspect.displayName} seems preoccupied with other matters.`,
    alibiClaim: `${suspect.displayName} claims to have been in the ${getRandomElement(LOCATIONS).name} during the evening.`,
    suspiciousBehavior: `${suspect.displayName} was observed ${getRandomElement([
      "looking nervous",
      "whispering to another guest",
      "examining the display cases",
      "wandering the halls alone",
    ])}.`,
  }));

  const dramaticEvents: DramaticEvent[] = [
    {
      triggerAfterClue: 3,
      description: `A loud crash echoes through the mansion! Upon investigation, it appears to be nothing but a fallen vase in the ${getRandomElement(LOCATIONS).name}.`,
      affectedSuspects: [getRandomElement(SUSPECTS).id],
    },
    {
      triggerAfterClue: 6,
      description: "The lights flicker momentarily, casting the room in shadow.",
      affectedSuspects: [],
    },
  ];

  return {
    openingNarration: `Welcome to Tudor Mansion. It is ${theme.period}, and Mr. Boddy has invited his guests for "${theme.name}". ${theme.description} But something sinister lurks beneath the surface of this gathering...`,
    setting: `The atmosphere is ${theme.atmosphericElements.join(", ")}. The mansion's rooms are filled with Mr. Boddy's valuable collection, including the prized ${solution.item.nameUS}.`,
    atmosphericDescription: `${theme.atmosphericElements.map((e) => `The ${e} creates an air of mystery.`).join(" ")}`,
    suspectBackstories: suspectContexts,
    dramaticEvents,
    closingNarration: `And so the truth is revealed! ${solution.suspect.displayName} stole the ${solution.item.nameUS} from the ${solution.location.name} during ${solution.time.name}. Justice prevails at Tudor Mansion!`,
  };
}

// ============================================
// MAIN GENERATOR
// ============================================

export function generateScenario(request: GenerateScenarioRequest = {}): Scenario {
  const rng = new SeededRandom(request.seed);
  const difficulty = request.difficulty || "intermediate";
  const settings = DIFFICULTY_SETTINGS[difficulty];

  // Select theme
  const theme = request.theme
    ? MYSTERY_THEMES.find((t) => t.id === request.theme) || rng.pick(MYSTERY_THEMES)
    : rng.pick(MYSTERY_THEMES);

  // Generate solution
  const solution = generateSolution(rng, {
    suspects: request.excludeSuspects,
    items: request.excludeItems,
    locations: request.excludeLocations,
    times: request.excludeTimes,
  });

  // Generate clues
  const clues = generateClues(rng, solution, settings);

  // Generate game setup
  const gameSetup = generateGameSetup(rng, solution, theme, settings, clues.length);

  // Generate narrative
  const narrative = generateNarrative(solution, theme, clues);

  // Create scenario
  const scenario: Scenario = {
    id: `SCN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name: `${theme.name} - Custom Mystery`,
    theme,
    narrative,
    solution,
    clues,
    gameSetup,
    metadata: {
      difficulty,
      estimatedDuration: difficulty === "beginner" ? 45 : difficulty === "intermediate" ? 60 : 75,
      totalClues: clues.length,
      createdAt: new Date().toISOString(),
      version: "1.0.0",
    },
  };

  return scenario;
}

// ============================================
// VALIDATION
// ============================================

export function validateScenario(scenario: Scenario): ValidationResult {
  const errors: { code: string; message: string; field?: string }[] = [];
  const warnings: { code: string; message: string; suggestion?: string }[] = [];

  // Check solution validity
  if (!scenario.solution.suspect) {
    errors.push({ code: "MISSING_SUSPECT", message: "Solution missing suspect", field: "solution.suspect" });
  }
  if (!scenario.solution.item) {
    errors.push({ code: "MISSING_ITEM", message: "Solution missing item", field: "solution.item" });
  }
  if (!scenario.solution.location) {
    errors.push({ code: "MISSING_LOCATION", message: "Solution missing location", field: "solution.location" });
  }
  if (!scenario.solution.time) {
    errors.push({ code: "MISSING_TIME", message: "Solution missing time", field: "solution.time" });
  }

  // Check clues don't eliminate solution
  for (const clue of scenario.clues) {
    for (const elim of clue.logic.eliminates) {
      if (elim.category === "suspect" && elim.ids.includes(scenario.solution.suspect.id)) {
        errors.push({
          code: "CLUE_ELIMINATES_SOLUTION",
          message: `Clue ${clue.id} eliminates the guilty suspect`,
          field: `clues.${clue.id}`,
        });
      }
      if (elim.category === "item" && elim.ids.includes(scenario.solution.item.id)) {
        errors.push({
          code: "CLUE_ELIMINATES_SOLUTION",
          message: `Clue ${clue.id} eliminates the stolen item`,
          field: `clues.${clue.id}`,
        });
      }
      if (elim.category === "location" && elim.ids.includes(scenario.solution.location.id)) {
        errors.push({
          code: "CLUE_ELIMINATES_SOLUTION",
          message: `Clue ${clue.id} eliminates the crime location`,
          field: `clues.${clue.id}`,
        });
      }
      if (elim.category === "time" && elim.ids.includes(scenario.solution.time.id)) {
        errors.push({
          code: "CLUE_ELIMINATES_SOLUTION",
          message: `Clue ${clue.id} eliminates the crime time`,
          field: `clues.${clue.id}`,
        });
      }
    }
  }

  // Check clue count
  if (scenario.clues.length < 5) {
    warnings.push({
      code: "LOW_CLUE_COUNT",
      message: "Fewer than 5 clues may make the mystery too difficult",
      suggestion: "Consider adding more clues for better gameplay",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// UTILITY EXPORTS
// ============================================

export { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS, MYSTERY_THEMES };
