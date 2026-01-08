/**
 * Clue DVD Game - Campaign Validator
 *
 * Phase 3: Validation
 *
 * Comprehensive validation of campaign plans and generated scenarios.
 * Ensures:
 * - Solution is never eliminated
 * - All non-solution elements can be eliminated
 * - Proper act distribution
 * - Red herrings don't block the solution
 * - Narrative coherence
 */

import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
} from "../data/game-elements";
import {
  DIFFICULTY_SETTINGS,
  NON_SOLUTION_COUNTS,
  type DifficultySettings,
} from "../data/campaign-settings";
import type {
  CampaignPlan,
  GeneratedScenario,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  Difficulty,
  PlannedClue,
} from "../types/campaign";

// ============================================
// MAIN VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a complete campaign plan
 */
export function validateCampaignPlan(plan: CampaignPlan): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Get difficulty settings
  const settings = DIFFICULTY_SETTINGS[plan.difficulty];

  // Run all validation checks
  validateSolutionNotEliminated(plan, errors);
  validateCoverage(plan, errors, warnings);
  validateActDistribution(plan, settings, warnings);
  validateRedHerrings(plan, errors, warnings);
  validateDramaticEvents(plan, warnings);
  validateClueSequencing(plan, warnings);
  validateNarrativeThreads(plan, warnings);

  // Calculate coverage statistics
  const coverage = calculateCoverageStats(plan);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage,
  };
}

/**
 * Validate a generated scenario
 */
export function validateGeneratedScenario(scenario: GeneratedScenario): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Get difficulty settings
  const settings = DIFFICULTY_SETTINGS[scenario.metadata.difficulty];

  // Validate solution exists
  validateSolutionElements(scenario, errors);

  // Validate clues don't eliminate solution
  validateCluesNotEliminateSolution(scenario, errors);

  // Validate clue count
  if (scenario.clues.length !== settings.clueCount) {
    warnings.push({
      code: "CLUE_COUNT_MISMATCH",
      message: `Expected ${settings.clueCount} clues but got ${scenario.clues.length}`,
    });
  }

  // Validate all clues have text
  for (const clue of scenario.clues) {
    if (!clue.text || clue.text.trim().length === 0) {
      errors.push({
        code: "EMPTY_CLUE_TEXT",
        message: `Clue ${clue.position} has no text`,
        field: `clues[${clue.position}].text`,
      });
    }
  }

  // Calculate coverage
  const coverage = calculateScenarioCoverage(scenario);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage,
  };
}

// ============================================
// SOLUTION VALIDATION
// ============================================

function validateSolutionNotEliminated(
  plan: CampaignPlan,
  errors: ValidationError[]
): void {
  const { solution, clues } = plan;

  for (const clue of clues) {
    const { category, elementIds } = clue.elimination;

    // Check if solution element is in this clue's eliminations
    let solutionId: string | undefined;
    switch (category) {
      case "suspect":
        solutionId = solution.suspectId;
        break;
      case "item":
        solutionId = solution.itemId;
        break;
      case "location":
        solutionId = solution.locationId;
        break;
      case "time":
        solutionId = solution.timeId;
        break;
    }

    if (solutionId && elementIds.includes(solutionId)) {
      errors.push({
        code: "SOLUTION_ELIMINATED",
        message: `Clue ${clue.position} eliminates solution ${category}: ${solutionId}`,
        field: `clues[${clue.position - 1}].elimination.elementIds`,
      });
    }
  }
}

function validateSolutionElements(
  scenario: GeneratedScenario,
  errors: ValidationError[]
): void {
  const { solution } = scenario;

  // Validate suspect exists
  if (!SUSPECTS.find(s => s.id === solution.suspectId)) {
    errors.push({
      code: "INVALID_SOLUTION_SUSPECT",
      message: `Solution suspect ${solution.suspectId} not found`,
      field: "solution.suspectId",
    });
  }

  // Validate item exists
  if (!ITEMS.find(i => i.id === solution.itemId)) {
    errors.push({
      code: "INVALID_SOLUTION_ITEM",
      message: `Solution item ${solution.itemId} not found`,
      field: "solution.itemId",
    });
  }

  // Validate location exists
  if (!LOCATIONS.find(l => l.id === solution.locationId)) {
    errors.push({
      code: "INVALID_SOLUTION_LOCATION",
      message: `Solution location ${solution.locationId} not found`,
      field: "solution.locationId",
    });
  }

  // Validate time exists
  if (!TIME_PERIODS.find(t => t.id === solution.timeId)) {
    errors.push({
      code: "INVALID_SOLUTION_TIME",
      message: `Solution time ${solution.timeId} not found`,
      field: "solution.timeId",
    });
  }
}

function validateCluesNotEliminateSolution(
  scenario: GeneratedScenario,
  errors: ValidationError[]
): void {
  const { solution, clues } = scenario;

  for (const clue of clues) {
    const { category, ids } = clue.eliminates;

    let solutionId: string | undefined;
    switch (category) {
      case "suspect":
        solutionId = solution.suspectId;
        break;
      case "item":
        solutionId = solution.itemId;
        break;
      case "location":
        solutionId = solution.locationId;
        break;
      case "time":
        solutionId = solution.timeId;
        break;
    }

    if (solutionId && ids.includes(solutionId)) {
      errors.push({
        code: "CLUE_ELIMINATES_SOLUTION",
        message: `Clue ${clue.position} eliminates the solution ${category}`,
        field: `clues[${clue.position - 1}]`,
      });
    }
  }
}

// ============================================
// COVERAGE VALIDATION
// ============================================

function validateCoverage(
  plan: CampaignPlan,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Get all elements that should be eliminated
  const nonSolutionElements = {
    suspects: SUSPECTS.filter(s => s.id !== plan.solution.suspectId).map(s => s.id),
    items: ITEMS.filter(i => i.id !== plan.solution.itemId).map(i => i.id),
    locations: LOCATIONS.filter(l => l.id !== plan.solution.locationId).map(l => l.id),
    times: TIME_PERIODS.filter(t => t.id !== plan.solution.timeId).map(t => t.id),
  };

  // Get elements covered by clues
  const coveredElements = {
    suspects: new Set<string>(),
    items: new Set<string>(),
    locations: new Set<string>(),
    times: new Set<string>(),
  };

  for (const clue of plan.clues) {
    const { category, elementIds } = clue.elimination;
    const set = category === "suspect" ? coveredElements.suspects :
                category === "item" ? coveredElements.items :
                category === "location" ? coveredElements.locations :
                coveredElements.times;
    for (const id of elementIds) {
      set.add(id);
    }
  }

  // Check each category
  for (const [category, elements] of Object.entries(nonSolutionElements)) {
    const covered = coveredElements[category as keyof typeof coveredElements];
    const missing = elements.filter(id => !covered.has(id));

    if (missing.length > 0) {
      // Not all elements are covered - this is a warning, not an error
      // The game is still playable; players just need to deduce the remaining
      warnings.push({
        code: "INCOMPLETE_COVERAGE",
        message: `${missing.length} ${category}(s) not explicitly eliminated by clues`,
        suggestion: `Consider adding more clues or larger elimination groups for ${category}s`,
      });
    }
  }
}

// ============================================
// ACT DISTRIBUTION VALIDATION
// ============================================

function validateActDistribution(
  plan: CampaignPlan,
  settings: DifficultySettings,
  warnings: ValidationWarning[]
): void {
  const actCounts = {
    act1_setup: 0,
    act2_confrontation: 0,
    act3_resolution: 0,
  };

  for (const clue of plan.clues) {
    actCounts[clue.act]++;
  }

  const expected = settings.actDistribution;

  if (actCounts.act1_setup !== expected.act1) {
    warnings.push({
      code: "ACT_DISTRIBUTION_MISMATCH",
      message: `Act 1 has ${actCounts.act1_setup} clues, expected ${expected.act1}`,
    });
  }

  if (actCounts.act2_confrontation !== expected.act2) {
    warnings.push({
      code: "ACT_DISTRIBUTION_MISMATCH",
      message: `Act 2 has ${actCounts.act2_confrontation} clues, expected ${expected.act2}`,
    });
  }

  if (actCounts.act3_resolution !== expected.act3) {
    warnings.push({
      code: "ACT_DISTRIBUTION_MISMATCH",
      message: `Act 3 has ${actCounts.act3_resolution} clues, expected ${expected.act3}`,
    });
  }
}

// ============================================
// RED HERRING VALIDATION
// ============================================

function validateRedHerrings(
  plan: CampaignPlan,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const settings = DIFFICULTY_SETTINGS[plan.difficulty];

  for (const redHerring of plan.redHerrings) {
    // Check that the red herring doesn't target the solution
    const { category, elementId } = redHerring.target;
    const solutionId = category === "suspect" ? plan.solution.suspectId :
                       category === "item" ? plan.solution.itemId :
                       category === "location" ? plan.solution.locationId :
                       plan.solution.timeId;

    if (elementId === solutionId) {
      errors.push({
        code: "RED_HERRING_TARGETS_SOLUTION",
        message: `Red herring targets the solution ${category}`,
        field: "redHerrings",
      });
    }

    // Check that introduction clue exists
    const introClue = plan.clues.find(c => c.position === redHerring.introducedInClue);
    if (!introClue) {
      warnings.push({
        code: "RED_HERRING_INVALID_INTRO",
        message: `Red herring introduction clue ${redHerring.introducedInClue} not found`,
      });
    }

    // If must resolve, check resolution clue exists
    if (settings.redHerrings.mustResolve && !redHerring.resolvedInClue) {
      warnings.push({
        code: "RED_HERRING_NOT_RESOLVED",
        message: "Red herring should be resolved for this difficulty but has no resolution clue",
      });
    }
  }
}

// ============================================
// DRAMATIC EVENT VALIDATION
// ============================================

function validateDramaticEvents(
  plan: CampaignPlan,
  warnings: ValidationWarning[]
): void {
  for (const event of plan.dramaticEvents) {
    // Check that trigger clue exists
    if (event.afterClue < 1 || event.afterClue > plan.clues.length) {
      warnings.push({
        code: "DRAMATIC_EVENT_INVALID_TRIGGER",
        message: `Dramatic event triggers after clue ${event.afterClue} which is out of range`,
      });
    }

    // Check that involved suspects are not the solution suspect
    if (event.involvedSuspects.includes(plan.solution.suspectId)) {
      // This is actually okay - it can add misdirection
      // But warn in case it's unintentional
      warnings.push({
        code: "DRAMATIC_EVENT_INVOLVES_GUILTY",
        message: "Dramatic event involves the guilty suspect",
        suggestion: "This may be intentional for misdirection",
      });
    }
  }
}

// ============================================
// CLUE SEQUENCING VALIDATION
// ============================================

function validateClueSequencing(
  plan: CampaignPlan,
  warnings: ValidationWarning[]
): void {
  // Check clues are in order
  for (let i = 0; i < plan.clues.length; i++) {
    const clue = plan.clues[i];
    if (clue.position !== i + 1) {
      warnings.push({
        code: "CLUE_SEQUENCE_ERROR",
        message: `Clue at index ${i} has position ${clue.position}, expected ${i + 1}`,
      });
    }
  }

  // Check references point to earlier clues
  for (const clue of plan.clues) {
    if (clue.narrative.references) {
      for (const refPosition of clue.narrative.references) {
        if (refPosition >= clue.position) {
          warnings.push({
            code: "INVALID_CLUE_REFERENCE",
            message: `Clue ${clue.position} references future clue ${refPosition}`,
          });
        }
      }
    }
  }
}

// ============================================
// NARRATIVE THREAD VALIDATION
// ============================================

function validateNarrativeThreads(
  plan: CampaignPlan,
  warnings: ValidationWarning[]
): void {
  for (const thread of plan.threads) {
    // Check that thread has clues
    if (thread.cluePositions.length === 0) {
      warnings.push({
        code: "EMPTY_NARRATIVE_THREAD",
        message: `Narrative thread "${thread.name}" has no clues`,
      });
    }

    // Check clue positions are valid
    for (const position of thread.cluePositions) {
      if (!plan.clues.find(c => c.position === position)) {
        warnings.push({
          code: "INVALID_THREAD_CLUE",
          message: `Thread "${thread.name}" references non-existent clue ${position}`,
        });
      }
    }
  }
}

// ============================================
// COVERAGE STATISTICS
// ============================================

function calculateCoverageStats(plan: CampaignPlan): NonNullable<ValidationResult["coverage"]> {
  const covered = {
    suspects: new Set<string>(),
    items: new Set<string>(),
    locations: new Set<string>(),
    times: new Set<string>(),
  };

  for (const clue of plan.clues) {
    const { category, elementIds } = clue.elimination;
    const set = category === "suspect" ? covered.suspects :
                category === "item" ? covered.items :
                category === "location" ? covered.locations :
                covered.times;
    for (const id of elementIds) {
      set.add(id);
    }
  }

  const nonSolution = {
    suspects: SUSPECTS.filter(s => s.id !== plan.solution.suspectId).map(s => s.id),
    items: ITEMS.filter(i => i.id !== plan.solution.itemId).map(i => i.id),
    locations: LOCATIONS.filter(l => l.id !== plan.solution.locationId).map(l => l.id),
    times: TIME_PERIODS.filter(t => t.id !== plan.solution.timeId).map(t => t.id),
  };

  return {
    suspects: {
      total: nonSolution.suspects.length,
      covered: covered.suspects.size,
      missing: nonSolution.suspects.filter(id => !covered.suspects.has(id)),
    },
    items: {
      total: nonSolution.items.length,
      covered: covered.items.size,
      missing: nonSolution.items.filter(id => !covered.items.has(id)),
    },
    locations: {
      total: nonSolution.locations.length,
      covered: covered.locations.size,
      missing: nonSolution.locations.filter(id => !covered.locations.has(id)),
    },
    times: {
      total: nonSolution.times.length,
      covered: covered.times.size,
      missing: nonSolution.times.filter(id => !covered.times.has(id)),
    },
  };
}

function calculateScenarioCoverage(scenario: GeneratedScenario): NonNullable<ValidationResult["coverage"]> {
  const covered = {
    suspects: new Set<string>(),
    items: new Set<string>(),
    locations: new Set<string>(),
    times: new Set<string>(),
  };

  for (const clue of scenario.clues) {
    const { category, ids } = clue.eliminates;
    const set = category === "suspect" ? covered.suspects :
                category === "item" ? covered.items :
                category === "location" ? covered.locations :
                covered.times;
    for (const id of ids) {
      set.add(id);
    }
  }

  const nonSolution = {
    suspects: SUSPECTS.filter(s => s.id !== scenario.solution.suspectId).map(s => s.id),
    items: ITEMS.filter(i => i.id !== scenario.solution.itemId).map(i => i.id),
    locations: LOCATIONS.filter(l => l.id !== scenario.solution.locationId).map(l => l.id),
    times: TIME_PERIODS.filter(t => t.id !== scenario.solution.timeId).map(t => t.id),
  };

  return {
    suspects: {
      total: nonSolution.suspects.length,
      covered: covered.suspects.size,
      missing: nonSolution.suspects.filter(id => !covered.suspects.has(id)),
    },
    items: {
      total: nonSolution.items.length,
      covered: covered.items.size,
      missing: nonSolution.items.filter(id => !covered.items.has(id)),
    },
    locations: {
      total: nonSolution.locations.length,
      covered: covered.locations.size,
      missing: nonSolution.locations.filter(id => !covered.locations.has(id)),
    },
    times: {
      total: nonSolution.times.length,
      covered: covered.times.size,
      missing: nonSolution.times.filter(id => !covered.times.has(id)),
    },
  };
}

// ============================================
// QUICK VALIDATION HELPER
// ============================================

/**
 * Quick check if a plan or scenario is valid
 */
export function isValid(planOrScenario: CampaignPlan | GeneratedScenario): boolean {
  if ("campaignId" in planOrScenario) {
    return validateGeneratedScenario(planOrScenario).valid;
  } else {
    return validateCampaignPlan(planOrScenario).valid;
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  calculateCoverageStats,
  calculateScenarioCoverage,
};
