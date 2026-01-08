/**
 * Clue DVD Game - Campaign Planner
 *
 * Phase 1: Strategic Planning
 *
 * Creates a complete campaign plan by:
 * 1. Selecting the solution (WHO/WHAT/WHERE/WHEN)
 * 2. Planning eliminations for all 38 non-solution elements
 * 3. Distributing elimination groups across narrative acts
 * 4. Creating narrative threads connecting related clues
 * 5. Planning red herrings for misdirection
 * 6. Sequencing clues with proper pacing and references
 * 7. Planning dramatic events at narrative beats
 * 8. Validating the plan for completeness and solvability
 */

import { SeededRandom } from "./seeded-random";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
  type Suspect,
  type Item,
  type Location,
  type TimePeriod,
  type MysteryTheme,
} from "../data/game-elements";
import {
  DIFFICULTY_SETTINGS,
  ACT_SETTINGS,
  ELIMINATION_TYPE_INFO,
  DRAMATIC_EVENT_TYPES,
  NARRATIVE_THREAD_TEMPLATES,
  NON_SOLUTION_COUNTS,
  getEliminationTypesForCategory,
  getToneForPosition,
  type DifficultySettings,
} from "../data/campaign-settings";
import type {
  CampaignPlan,
  GenerateCampaignRequest,
  Difficulty,
  NarrativeAct,
  EliminationType,
  EliminationCategory,
  EliminationGroup,
  CategoryEliminationPlan,
  PlannedClue,
  NarrativeThread,
  RedHerring,
  PlannedDramaticEvent,
  ActInfo,
  ValidationResult,
  ClueDeliveryType,
  ClueSpeaker,
} from "../types/campaign";

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Create a complete campaign plan
 */
export function planCampaign(request: GenerateCampaignRequest = {}): CampaignPlan {
  const seed = request.seed ?? Date.now();
  const rng = new SeededRandom(seed);
  const difficulty = request.difficulty ?? "intermediate";
  const settings = DIFFICULTY_SETTINGS[difficulty];

  // 1. Select theme
  const theme = selectTheme(rng, request.themeId);

  // 2. Select solution
  const solution = selectSolution(rng, {
    excludeSuspects: request.excludeSuspects,
    excludeItems: request.excludeItems,
    excludeLocations: request.excludeLocations,
    excludeTimes: request.excludeTimes,
  });

  // 3. Plan eliminations for each category
  const eliminationPlans = planAllEliminations(rng, solution, settings);

  // 4. Create narrative arc structure
  const narrativeArc = createNarrativeArc(settings);

  // 5. Sequence clues across acts
  const clues = sequenceClues(rng, eliminationPlans, narrativeArc, settings);

  // 6. Plan narrative threads
  const threads = planNarrativeThreads(rng, clues, solution);

  // 7. Plan red herrings
  const redHerrings = planRedHerrings(rng, clues, solution, settings);

  // 8. Plan dramatic events
  const dramaticEvents = planDramaticEvents(rng, clues, solution, settings);

  // 9. Validate the plan
  const validation = validatePlan(solution, eliminationPlans, clues, settings);

  // Generate unique campaign ID
  const campaignId = `CMP-${Date.now().toString(36)}-${rng.nextInt(1000, 9999)}`;

  return {
    id: campaignId,
    seed,
    solution: {
      suspectId: solution.suspect.id,
      itemId: solution.item.id,
      locationId: solution.location.id,
      timeId: solution.time.id,
    },
    themeId: theme.id,
    difficulty,
    eliminationPlans,
    narrativeArc,
    clues,
    threads,
    redHerrings,
    dramaticEvents,
    validation,
  };
}

// ============================================
// THEME SELECTION
// ============================================

function selectTheme(rng: SeededRandom, themeId?: string): MysteryTheme {
  if (themeId) {
    const theme = MYSTERY_THEMES.find(t => t.id === themeId);
    if (theme) return theme;
  }
  return rng.pick(MYSTERY_THEMES);
}

// ============================================
// SOLUTION SELECTION
// ============================================

interface SolutionSelection {
  suspect: Suspect;
  item: Item;
  location: Location;
  time: TimePeriod;
}

function selectSolution(
  rng: SeededRandom,
  excludes: {
    excludeSuspects?: string[];
    excludeItems?: string[];
    excludeLocations?: string[];
    excludeTimes?: string[];
  }
): SolutionSelection {
  const availableSuspects = SUSPECTS.filter(
    s => !excludes.excludeSuspects?.includes(s.id)
  );
  const availableItems = ITEMS.filter(
    i => !excludes.excludeItems?.includes(i.id)
  );
  const availableLocations = LOCATIONS.filter(
    l => !excludes.excludeLocations?.includes(l.id)
  );
  const availableTimes = TIME_PERIODS.filter(
    t => !excludes.excludeTimes?.includes(t.id)
  );

  return {
    suspect: rng.pick(availableSuspects),
    item: rng.pick(availableItems),
    location: rng.pick(availableLocations),
    time: rng.pick(availableTimes),
  };
}

// ============================================
// ELIMINATION PLANNING
// ============================================

function planAllEliminations(
  rng: SeededRandom,
  solution: SolutionSelection,
  settings: DifficultySettings
): CampaignPlan["eliminationPlans"] {
  return {
    suspects: planCategoryEliminations(
      rng,
      "suspect",
      SUSPECTS.filter(s => s.id !== solution.suspect.id).map(s => s.id),
      settings,
      solution
    ),
    items: planCategoryEliminations(
      rng,
      "item",
      ITEMS.filter(i => i.id !== solution.item.id).map(i => i.id),
      settings,
      solution
    ),
    locations: planCategoryEliminations(
      rng,
      "location",
      LOCATIONS.filter(l => l.id !== solution.location.id).map(l => l.id),
      settings,
      solution
    ),
    times: planCategoryEliminations(
      rng,
      "time",
      TIME_PERIODS.filter(t => t.id !== solution.time.id).map(t => t.id),
      settings,
      solution
    ),
  };
}

function planCategoryEliminations(
  rng: SeededRandom,
  category: EliminationCategory,
  elementIds: string[],
  settings: DifficultySettings,
  solution: SolutionSelection
): CategoryEliminationPlan {
  const maxGroupSize = settings.maxGroupSize[category === "suspect" ? "suspects" :
    category === "item" ? "items" :
    category === "location" ? "locations" : "times"];

  const groups: EliminationGroup[] = [];
  const remainingIds = [...elementIds];
  let groupIndex = 0;

  // Shuffle for randomness
  rng.shuffle(remainingIds);

  // Get valid elimination types for this category
  const validTypes = getEliminationTypesForCategory(category);

  while (remainingIds.length > 0) {
    // Determine group size based on what's left and settings
    const maxForThisGroup = Math.min(maxGroupSize, remainingIds.length);
    const minForThisGroup = settings.minGroupSize;

    // Bias towards larger groups early, smaller groups later
    const groupSize = remainingIds.length <= maxGroupSize
      ? remainingIds.length // Use all remaining if within max
      : rng.nextInt(minForThisGroup, maxForThisGroup);

    // Take elements for this group
    const groupElements = remainingIds.splice(0, groupSize);

    // Select elimination type based on group size
    const eliminationType = selectEliminationType(rng, category, groupSize, validTypes);

    // Determine target act based on group size
    const targetAct = determineTargetAct(groupSize, maxGroupSize);

    // Calculate priority within act
    const priority = calculatePriority(groupIndex, groupSize);

    // Build context for clue generation
    const context = buildEliminationContext(rng, category, eliminationType, solution);

    groups.push({
      index: groupIndex,
      elementIds: groupElements,
      eliminationType,
      targetAct,
      priority,
      context,
    });

    groupIndex++;
  }

  return {
    totalElements: elementIds.length,
    groups,
    clueCount: groups.length,
  };
}

function selectEliminationType(
  rng: SeededRandom,
  category: EliminationCategory,
  groupSize: number,
  validTypes: EliminationType[]
): EliminationType {
  // Filter types that match the group size
  const suitableTypes = validTypes.filter(type => {
    const info = ELIMINATION_TYPE_INFO[type];
    if (groupSize === 1) {
      return info.typicalGroupSize === "single" || info.typicalGroupSize === "small";
    } else if (groupSize === 2) {
      return info.typicalGroupSize === "small" || info.typicalGroupSize === "medium";
    } else if (groupSize <= 3) {
      return info.typicalGroupSize === "medium" || info.typicalGroupSize === "large";
    } else {
      return info.typicalGroupSize === "large";
    }
  });

  // Fall back to any valid type if no suitable ones found
  const typesToChooseFrom = suitableTypes.length > 0 ? suitableTypes : validTypes;
  return rng.pick(typesToChooseFrom);
}

function determineTargetAct(groupSize: number, maxGroupSize: number): NarrativeAct {
  // Large groups (3+) -> Act 1 (easy eliminations)
  // Medium groups (2) -> Act 2 (complications)
  // Small groups (1) -> Act 3 (decisive)
  if (groupSize >= 3 || groupSize >= maxGroupSize) {
    return "act1_setup";
  } else if (groupSize === 2) {
    return "act2_confrontation";
  } else {
    return "act3_resolution";
  }
}

function calculatePriority(groupIndex: number, groupSize: number): number {
  // Higher priority (lower number) for larger groups and earlier indices
  return groupIndex * 10 - groupSize * 5;
}

function buildEliminationContext(
  rng: SeededRandom,
  category: EliminationCategory,
  eliminationType: EliminationType,
  solution: SolutionSelection
): EliminationGroup["context"] {
  const context: EliminationGroup["context"] = {};

  // Build context based on elimination type
  switch (eliminationType) {
    case "group_alibi":
    case "individual_alibi":
    case "witness_testimony":
      // Need an alibi location (not the crime location)
      const alibiLocations = LOCATIONS.filter(l => l.id !== solution.location.id);
      context.alibiLocation = rng.pick(alibiLocations).id;
      context.alibiTime = solution.time.id;
      break;

    case "category_secured":
      // Get the item category
      const categories: Array<"antique" | "desk" | "jewelry"> = ["antique", "desk", "jewelry"];
      context.itemCategory = rng.pick(categories.filter(c => {
        // Don't secure the category containing the stolen item
        const stolenItem = ITEMS.find(i => i.id === solution.item.id);
        return stolenItem?.category !== c;
      }));
      break;

    case "location_occupied":
    case "location_visibility":
      context.alibiTime = solution.time.id;
      break;

    case "item_present":
    case "all_together":
    case "staff_activity":
      // Pick a time before the crime
      const earlierTimes = TIME_PERIODS.filter(
        t => t.order < (TIME_PERIODS.find(tp => tp.id === solution.time.id)?.order ?? 10)
      );
      if (earlierTimes.length > 0) {
        context.alibiTime = rng.pick(earlierTimes).id;
      }
      break;
  }

  return context;
}

// ============================================
// NARRATIVE ARC
// ============================================

function createNarrativeArc(settings: DifficultySettings): CampaignPlan["narrativeArc"] {
  const { act1, act2, act3 } = settings.actDistribution;

  return {
    act1: {
      act: "act1_setup",
      clueCount: act1,
      startPosition: 1,
      endPosition: act1,
      focus: ACT_SETTINGS.act1_setup.focus,
      tone: ACT_SETTINGS.act1_setup.dominantTone,
    },
    act2: {
      act: "act2_confrontation",
      clueCount: act2,
      startPosition: act1 + 1,
      endPosition: act1 + act2,
      focus: ACT_SETTINGS.act2_confrontation.focus,
      tone: ACT_SETTINGS.act2_confrontation.dominantTone,
    },
    act3: {
      act: "act3_resolution",
      clueCount: act3,
      startPosition: act1 + act2 + 1,
      endPosition: act1 + act2 + act3,
      focus: ACT_SETTINGS.act3_resolution.focus,
      tone: ACT_SETTINGS.act3_resolution.dominantTone,
    },
  };
}

// ============================================
// CLUE SEQUENCING
// ============================================

function sequenceClues(
  rng: SeededRandom,
  eliminationPlans: CampaignPlan["eliminationPlans"],
  narrativeArc: CampaignPlan["narrativeArc"],
  settings: DifficultySettings
): PlannedClue[] {
  // Map plural keys to singular EliminationCategory values
  const categoryMap: Record<string, EliminationCategory> = {
    suspects: "suspect",
    items: "item",
    locations: "location",
    times: "time",
  };

  // Collect all elimination groups
  const allGroups: Array<{ category: EliminationCategory; group: EliminationGroup }> = [];

  for (const [pluralCategory, plan] of Object.entries(eliminationPlans)) {
    const category = categoryMap[pluralCategory];
    for (const group of plan.groups) {
      allGroups.push({ category, group });
    }
  }

  // Sort groups by act, then by priority
  const actOrder: Record<NarrativeAct, number> = {
    act1_setup: 1,
    act2_confrontation: 2,
    act3_resolution: 3,
  };

  allGroups.sort((a, b) => {
    const actDiff = actOrder[a.group.targetAct] - actOrder[b.group.targetAct];
    if (actDiff !== 0) return actDiff;
    return a.group.priority - b.group.priority;
  });

  // Limit to total clue count
  const selectedGroups = allGroups.slice(0, settings.clueCount);

  // Redistribute to match act distribution
  const redistributed = redistributeAcrossActs(rng, selectedGroups, settings.actDistribution);

  // Create planned clues
  const clues: PlannedClue[] = redistributed.map((item, index) => {
    const position = index + 1;
    const { act, tone } = getToneForPosition(
      position,
      settings.clueCount,
      settings.actDistribution
    );

    // Select delivery method
    const delivery = selectDeliveryMethod(rng, item.group.eliminationType);

    // Build references to earlier clues (for narrative continuity)
    const references = position > 1 ? buildReferences(rng, position, redistributed.slice(0, index)) : undefined;

    return {
      position,
      act,
      elimination: {
        category: item.category,
        groupIndex: item.group.index,
        elementIds: item.group.elementIds,
        type: item.group.eliminationType,
        context: item.group.context,
      },
      delivery,
      narrative: {
        references,
        tone,
      },
    };
  });

  return clues;
}

function redistributeAcrossActs(
  rng: SeededRandom,
  groups: Array<{ category: EliminationCategory; group: EliminationGroup }>,
  actDistribution: DifficultySettings["actDistribution"]
): Array<{ category: EliminationCategory; group: EliminationGroup }> {
  const result: Array<{ category: EliminationCategory; group: EliminationGroup }> = [];

  // Separate by target act
  const act1Groups = groups.filter(g => g.group.targetAct === "act1_setup");
  const act2Groups = groups.filter(g => g.group.targetAct === "act2_confrontation");
  const act3Groups = groups.filter(g => g.group.targetAct === "act3_resolution");

  // Take required number from each act, redistributing overflow
  const take = (source: typeof groups, count: number): typeof groups => {
    const shuffled = rng.shuffle([...source]);
    return shuffled.slice(0, count);
  };

  // Start with target counts
  let act1Count = actDistribution.act1;
  let act2Count = actDistribution.act2;
  let act3Count = actDistribution.act3;

  // Handle shortages by borrowing from adjacent acts
  if (act1Groups.length < act1Count) {
    const shortage = act1Count - act1Groups.length;
    act1Count = act1Groups.length;
    act2Count += shortage;
  }
  if (act3Groups.length < act3Count) {
    const shortage = act3Count - act3Groups.length;
    act3Count = act3Groups.length;
    act2Count += shortage;
  }

  // Take from each pool
  result.push(...take(act1Groups, Math.min(act1Count, act1Groups.length)));
  result.push(...take(act2Groups, Math.min(act2Count, act2Groups.length)));
  result.push(...take(act3Groups, Math.min(act3Count, act3Groups.length)));

  // If we still need more, take from any remaining
  const totalNeeded = actDistribution.act1 + actDistribution.act2 + actDistribution.act3;
  if (result.length < totalNeeded) {
    const used = new Set(result.map(r => `${r.category}-${r.group.index}`));
    const remaining = groups.filter(g => !used.has(`${g.category}-${g.group.index}`));
    const additional = take(remaining, totalNeeded - result.length);
    result.push(...additional);
  }

  return result;
}

function selectDeliveryMethod(
  rng: SeededRandom,
  eliminationType: EliminationType
): PlannedClue["delivery"] {
  const info = ELIMINATION_TYPE_INFO[eliminationType];
  const deliveryTypes: ClueDeliveryType[] = ["butler", "inspector_note", "observation"];

  let type: ClueDeliveryType;
  let speaker: ClueSpeaker;

  if (info.preferredSpeaker === "Ashe") {
    type = rng.nextBool(0.7) ? "butler" : rng.pick(deliveryTypes);
    speaker = type === "butler" ? "Ashe" : rng.pick(["Ashe", "Inspector Brown"]);
  } else if (info.preferredSpeaker === "Inspector Brown") {
    type = rng.nextBool(0.7) ? "inspector_note" : rng.pick(deliveryTypes);
    speaker = type === "butler" ? "Ashe" : "Inspector Brown";
  } else {
    type = rng.pick(deliveryTypes);
    speaker = type === "butler" ? "Ashe" : rng.pick(["Ashe", "Inspector Brown"]);
  }

  return { type, speaker };
}

function buildReferences(
  rng: SeededRandom,
  currentPosition: number,
  earlierItems: Array<{ category: EliminationCategory; group: EliminationGroup }>
): number[] | undefined {
  // 30% chance to reference an earlier clue
  if (!rng.nextBool(0.3) || earlierItems.length === 0) {
    return undefined;
  }

  // Reference 1-2 earlier clues
  const refCount = rng.nextInt(1, Math.min(2, earlierItems.length));
  const positions: number[] = [];

  for (let i = 0; i < refCount; i++) {
    // Prefer referencing recent clues
    const recentWeight = earlierItems.map((_, idx) => idx + 1);
    const refIndex = rng.pickWeighted(
      earlierItems.map((_, idx) => idx),
      recentWeight
    );
    const refPosition = refIndex + 1;
    if (!positions.includes(refPosition)) {
      positions.push(refPosition);
    }
  }

  return positions.length > 0 ? positions : undefined;
}

// ============================================
// NARRATIVE THREADS
// ============================================

function planNarrativeThreads(
  rng: SeededRandom,
  clues: PlannedClue[],
  solution: SolutionSelection
): NarrativeThread[] {
  const threads: NarrativeThread[] = [];

  // Create "True Timeline" thread from time-related clues
  const timeClues = clues.filter(c => c.elimination.category === "time");
  if (timeClues.length >= 2) {
    threads.push({
      id: "true_timeline",
      name: "The True Timeline",
      involvedElements: {
        times: timeClues.flatMap(c => c.elimination.elementIds),
      },
      cluePositions: timeClues.map(c => c.position),
      isRedHerring: false,
    });
  }

  // Create "Alibi Network" from suspect alibis
  const alibiClues = clues.filter(
    c => c.elimination.category === "suspect" &&
    ["group_alibi", "individual_alibi", "witness_testimony"].includes(c.elimination.type)
  );
  if (alibiClues.length >= 2) {
    threads.push({
      id: "alibi_network",
      name: "The Alibi Network",
      involvedElements: {
        suspects: alibiClues.flatMap(c => c.elimination.elementIds),
      },
      cluePositions: alibiClues.map(c => c.position),
      isRedHerring: false,
    });
  }

  // Create "Item Trail" from item-related clues
  const itemClues = clues.filter(c => c.elimination.category === "item");
  if (itemClues.length >= 2) {
    threads.push({
      id: "item_trail",
      name: "The Item Trail",
      involvedElements: {
        items: itemClues.flatMap(c => c.elimination.elementIds),
      },
      cluePositions: itemClues.map(c => c.position),
      isRedHerring: false,
    });
  }

  return threads;
}

// ============================================
// RED HERRINGS
// ============================================

function planRedHerrings(
  rng: SeededRandom,
  clues: PlannedClue[],
  solution: SolutionSelection,
  settings: DifficultySettings
): RedHerring[] {
  const redHerrings: RedHerring[] = [];
  const { count, mustResolve } = settings.redHerrings;

  // Only add red herrings if we have enough clues
  if (count === 0 || clues.length < 4) {
    return redHerrings;
  }

  // Find Act 2 clues where we can introduce red herrings
  const act2Clues = clues.filter(c => c.act === "act2_confrontation");
  const act3Clues = clues.filter(c => c.act === "act3_resolution");

  // Categories we can create red herrings for
  const categories: EliminationCategory[] = ["suspect", "item", "location"];

  for (let i = 0; i < Math.min(count, act2Clues.length); i++) {
    const category = rng.pick(categories);

    // Pick a non-solution element that HAS been eliminated
    const eliminatedInCategory = clues
      .filter(c => c.elimination.category === category)
      .flatMap(c => c.elimination.elementIds);

    if (eliminatedInCategory.length === 0) continue;

    const targetElement = rng.pick(eliminatedInCategory);
    const introduceClue = act2Clues[Math.min(i, act2Clues.length - 1)];

    const redHerring: RedHerring = {
      type: rng.pick(["false_suspicion", "misleading_evidence", "suspicious_behavior"]),
      target: {
        category,
        elementId: targetElement,
      },
      introducedInClue: introduceClue.position,
      hint: `Something seems suspicious about ${targetElement}...`,
    };

    // If must resolve, pick an Act 3 clue to resolve it
    if (mustResolve && act3Clues.length > 0) {
      const resolveClue = rng.pick(act3Clues);
      redHerring.resolvedInClue = resolveClue.position;
    }

    redHerrings.push(redHerring);
  }

  return redHerrings;
}

// ============================================
// DRAMATIC EVENTS
// ============================================

function planDramaticEvents(
  rng: SeededRandom,
  clues: PlannedClue[],
  solution: SolutionSelection,
  settings: DifficultySettings
): PlannedDramaticEvent[] {
  const events: PlannedDramaticEvent[] = [];
  const { dramaticEventCount } = settings;

  if (dramaticEventCount === 0 || clues.length < 3) {
    return events;
  }

  // Space events across the game
  const totalClues = clues.length;
  const eventPositions: number[] = [];

  // Calculate event positions (e.g., after clue 3, 6, 9 for 3 events)
  for (let i = 0; i < dramaticEventCount; i++) {
    const position = Math.floor((totalClues / (dramaticEventCount + 1)) * (i + 1));
    eventPositions.push(Math.max(2, Math.min(position, totalClues - 1)));
  }

  // Get non-solution suspects for involvement
  const availableSuspects = SUSPECTS
    .filter(s => s.id !== solution.suspect.id)
    .map(s => s.id);

  // Create events
  for (const afterClue of eventPositions) {
    // Determine which act this event falls in
    const clueAtPosition = clues.find(c => c.position === afterClue);
    const act = clueAtPosition?.act || "act2_confrontation";

    // Pick suitable event types for this act
    const suitableTypes = DRAMATIC_EVENT_TYPES.filter(
      et => et.suitableActs.includes(act)
    );

    if (suitableTypes.length === 0) continue;

    const eventType = rng.pick(suitableTypes);

    // Select involved suspects
    const involvedCount = Math.min(eventType.requiresSuspects, availableSuspects.length);
    const involvedSuspects = involvedCount > 0
      ? rng.pickMultiple(availableSuspects, involvedCount)
      : [];

    events.push({
      afterClue,
      eventType: eventType.id,
      involvedSuspects,
      purpose: act === "act1_setup" ? "atmosphere" :
               act === "act2_confrontation" ? rng.pick(["tension", "misdirection"]) :
               "revelation",
    });
  }

  return events;
}

// ============================================
// VALIDATION
// ============================================

function validatePlan(
  solution: SolutionSelection,
  eliminationPlans: CampaignPlan["eliminationPlans"],
  clues: PlannedClue[],
  settings: DifficultySettings
): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  const warnings: ValidationResult["warnings"] = [];

  // Check: Solution is never eliminated
  for (const clue of clues) {
    if (clue.elimination.elementIds.includes(solution.suspect.id)) {
      errors.push({
        code: "SOLUTION_ELIMINATED",
        message: `Clue ${clue.position} eliminates the guilty suspect`,
        field: `clues[${clue.position}]`,
      });
    }
    if (clue.elimination.elementIds.includes(solution.item.id)) {
      errors.push({
        code: "SOLUTION_ELIMINATED",
        message: `Clue ${clue.position} eliminates the stolen item`,
        field: `clues[${clue.position}]`,
      });
    }
    if (clue.elimination.elementIds.includes(solution.location.id)) {
      errors.push({
        code: "SOLUTION_ELIMINATED",
        message: `Clue ${clue.position} eliminates the crime location`,
        field: `clues[${clue.position}]`,
      });
    }
    if (clue.elimination.elementIds.includes(solution.time.id)) {
      errors.push({
        code: "SOLUTION_ELIMINATED",
        message: `Clue ${clue.position} eliminates the crime time`,
        field: `clues[${clue.position}]`,
      });
    }
  }

  // Check: Coverage of non-solution elements
  const coverage = calculateCoverage(eliminationPlans, clues);

  if (coverage.suspects.missing.length > 0) {
    warnings.push({
      code: "INCOMPLETE_COVERAGE",
      message: `${coverage.suspects.missing.length} suspects not covered by clues`,
      suggestion: "Some suspects cannot be eliminated by clues",
    });
  }
  if (coverage.items.missing.length > 0) {
    warnings.push({
      code: "INCOMPLETE_COVERAGE",
      message: `${coverage.items.missing.length} items not covered by clues`,
      suggestion: "Some items cannot be eliminated by clues",
    });
  }
  if (coverage.locations.missing.length > 0) {
    warnings.push({
      code: "INCOMPLETE_COVERAGE",
      message: `${coverage.locations.missing.length} locations not covered by clues`,
      suggestion: "Some locations cannot be eliminated by clues",
    });
  }
  if (coverage.times.missing.length > 0) {
    warnings.push({
      code: "INCOMPLETE_COVERAGE",
      message: `${coverage.times.missing.length} times not covered by clues`,
      suggestion: "Some times cannot be eliminated by clues",
    });
  }

  // Check: Clue count matches settings
  if (clues.length !== settings.clueCount) {
    warnings.push({
      code: "CLUE_COUNT_MISMATCH",
      message: `Expected ${settings.clueCount} clues but generated ${clues.length}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage,
  };
}

function calculateCoverage(
  eliminationPlans: CampaignPlan["eliminationPlans"],
  clues: PlannedClue[]
): NonNullable<ValidationResult["coverage"]> {
  const coveredByClues = {
    suspects: new Set<string>(),
    items: new Set<string>(),
    locations: new Set<string>(),
    times: new Set<string>(),
  };

  for (const clue of clues) {
    const category = clue.elimination.category;
    const set = category === "suspect" ? coveredByClues.suspects :
                category === "item" ? coveredByClues.items :
                category === "location" ? coveredByClues.locations :
                coveredByClues.times;
    for (const id of clue.elimination.elementIds) {
      set.add(id);
    }
  }

  const planTotals = {
    suspects: eliminationPlans.suspects.totalElements,
    items: eliminationPlans.items.totalElements,
    locations: eliminationPlans.locations.totalElements,
    times: eliminationPlans.times.totalElements,
  };

  const planElements = {
    suspects: eliminationPlans.suspects.groups.flatMap(g => g.elementIds),
    items: eliminationPlans.items.groups.flatMap(g => g.elementIds),
    locations: eliminationPlans.locations.groups.flatMap(g => g.elementIds),
    times: eliminationPlans.times.groups.flatMap(g => g.elementIds),
  };

  return {
    suspects: {
      total: planTotals.suspects,
      covered: coveredByClues.suspects.size,
      missing: planElements.suspects.filter(id => !coveredByClues.suspects.has(id)),
    },
    items: {
      total: planTotals.items,
      covered: coveredByClues.items.size,
      missing: planElements.items.filter(id => !coveredByClues.items.has(id)),
    },
    locations: {
      total: planTotals.locations,
      covered: coveredByClues.locations.size,
      missing: planElements.locations.filter(id => !coveredByClues.locations.has(id)),
    },
    times: {
      total: planTotals.times,
      covered: coveredByClues.times.size,
      missing: planElements.times.filter(id => !coveredByClues.times.has(id)),
    },
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  selectSolution,
  planAllEliminations,
  sequenceClues,
  planNarrativeThreads,
  planRedHerrings,
  planDramaticEvents,
  validatePlan,
};
