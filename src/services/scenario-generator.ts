/**
 * Clue DVD Game - Scenario Generator
 *
 * Orchestrates the 3-phase campaign system to generate valid mystery scenarios.
 *
 * Phase 1: Strategic Planning (campaign-planner.ts)
 * - Select solution
 * - Plan eliminations
 * - Sequence clues across acts
 *
 * Phase 2: Clue Generation (campaign-clue-generator.ts)
 * - Generate clue text from the plan
 * - Apply speaker voices
 * - Create narrative elements
 *
 * Phase 3: Validation (campaign-validator.ts)
 * - Ensure solution is never eliminated
 * - Verify coverage
 * - Check narrative coherence
 */

import { planCampaign } from "./campaign-planner";
import { generateScenarioFromPlan } from "./campaign-clue-generator";
import { validateGeneratedScenario, validateCampaignPlan } from "./campaign-validator";
import type { GenerateCampaignRequest, GeneratedScenario, CampaignPlan, ValidationResult } from "../types/campaign";

// Re-export game elements for backward compatibility with routes
export {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
} from "../data/game-elements";

// ============================================
// MAIN GENERATOR
// ============================================

/**
 * Generate a complete scenario using the 3-phase campaign system
 */
export function generateScenario(request: GenerateCampaignRequest = {}): GeneratedScenario {
  // Phase 1: Strategic Planning
  const plan = planCampaign(request);

  // Phase 2: Generate clue text and scenario
  const scenario = generateScenarioFromPlan(plan);

  return scenario;
}

/**
 * Generate a scenario with the full campaign plan included
 * Useful for debugging and understanding the generation process
 */
export function generateScenarioWithPlan(request: GenerateCampaignRequest = {}): {
  scenario: GeneratedScenario;
  plan: CampaignPlan;
  validation: ValidationResult;
} {
  // Phase 1: Strategic Planning
  const plan = planCampaign(request);

  // Phase 2: Generate scenario
  const scenario = generateScenarioFromPlan(plan);

  // Phase 3: Validate
  const validation = validateGeneratedScenario(scenario);

  return { scenario, plan, validation };
}

/**
 * Generate only the campaign plan (for debugging/inspection)
 */
export function generatePlanOnly(request: GenerateCampaignRequest = {}): CampaignPlan {
  return planCampaign(request);
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a generated scenario
 */
export function validateScenario(scenario: GeneratedScenario): ValidationResult {
  return validateGeneratedScenario(scenario);
}

/**
 * Validate a campaign plan
 */
export function validatePlan(plan: CampaignPlan): ValidationResult {
  return validateCampaignPlan(plan);
}

// ============================================
// LEGACY COMPATIBILITY
// ============================================

/**
 * Convert GeneratedScenario to the old Scenario format
 * For backward compatibility with existing routes
 */
export function toLegacyFormat(scenario: GeneratedScenario): LegacyScenario {
  const theme = {
    id: scenario.theme.id,
    name: scenario.theme.name,
    description: scenario.theme.description,
    period: "",
    typicalLockedRooms: [],
    atmosphericElements: [],
  };

  return {
    id: scenario.id,
    name: `${scenario.theme.name} - Custom Mystery`,
    theme,
    narrative: {
      openingNarration: scenario.narrative.opening,
      setting: scenario.narrative.setting,
      atmosphericDescription: scenario.narrative.atmosphere,
      suspectBackstories: [],
      dramaticEvents: scenario.dramaticEvents.map(e => ({
        triggerAfterClue: e.afterClue,
        description: e.description,
        affectedSuspects: e.affectedSuspects,
      })),
      closingNarration: scenario.narrative.closing,
    },
    solution: {
      suspect: { id: scenario.solution.suspectId } as any,
      item: { id: scenario.solution.itemId } as any,
      location: { id: scenario.solution.locationId } as any,
      time: { id: scenario.solution.timeId } as any,
    },
    clues: scenario.clues.map(clue => ({
      id: clue.id,
      type: clue.type === "inspector_note" ? "inspector_note" : clue.type,
      speaker: clue.speaker,
      text: clue.text,
      revealOrder: clue.position,
      logic: {
        eliminates: [{
          category: clue.eliminates.category,
          ids: clue.eliminates.ids,
          reason: clue.eliminates.reason,
        }],
        reasoning: clue.eliminates.reason,
      },
    })),
    gameSetup: {
      lockedRooms: [],
      cardDistribution: {
        caseFileEnvelope: scenario.solution,
        butlersPantry: [],
        availableForDealing: [],
      },
      initialItemPlacements: [],
    },
    metadata: {
      difficulty: scenario.metadata.difficulty,
      estimatedDuration: scenario.metadata.difficulty === "beginner" ? 45 :
                          scenario.metadata.difficulty === "intermediate" ? 60 : 75,
      totalClues: scenario.metadata.totalClues,
      createdAt: scenario.metadata.createdAt,
      version: scenario.metadata.version,
    },
  };
}

// Legacy type for backward compatibility
interface LegacyScenario {
  id: string;
  name: string;
  theme: any;
  narrative: any;
  solution: any;
  clues: any[];
  gameSetup: any;
  metadata: any;
}

// ============================================
// EXPORTS FOR ROUTES
// ============================================

export type { GenerateCampaignRequest, GeneratedScenario, CampaignPlan, ValidationResult };
