/**
 * Clue DVD Game - Campaign System Tests
 *
 * Comprehensive tests for the 3-phase campaign generation system.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { planCampaign } from "./campaign-planner";
import { generateScenarioFromPlan } from "./campaign-clue-generator";
import { validateCampaignPlan, validateGeneratedScenario } from "./campaign-validator";
import { generateScenario, generateScenarioWithPlan, validateScenario } from "./scenario-generator";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS, MYSTERY_THEMES } from "../data/game-elements";
import type { Difficulty, CampaignPlan, GeneratedScenario } from "../types/campaign";

// Constants for validation
const TOTAL_SUSPECTS = 10;
const TOTAL_ITEMS = 11;
const TOTAL_LOCATIONS = 11;
const TOTAL_TIMES = 10;
const NON_SOLUTION_ELEMENTS = (TOTAL_SUSPECTS - 1) + (TOTAL_ITEMS - 1) + (TOTAL_LOCATIONS - 1) + (TOTAL_TIMES - 1); // 38

// Helper to verify IDs exist in game data
function isValidSuspectId(id: string): boolean {
  return SUSPECTS.some((s) => s.id === id);
}

function isValidItemId(id: string): boolean {
  return ITEMS.some((i) => i.id === id);
}

function isValidLocationId(id: string): boolean {
  return LOCATIONS.some((l) => l.id === id);
}

function isValidTimeId(id: string): boolean {
  return TIME_PERIODS.some((t) => t.id === id);
}

function isValidThemeId(id: string): boolean {
  return MYSTERY_THEMES.some((t) => t.id === id);
}

// ============================================
// PHASE 1: CAMPAIGN PLANNER TESTS
// ============================================

describe("Campaign Planner (Phase 1)", () => {
  describe("planCampaign()", () => {
    it("should generate a valid plan with default settings", () => {
      const plan = planCampaign({});

      expect(plan).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.seed).toBeDefined();
      expect(plan.solution).toBeDefined();
      expect(plan.themeId).toBeDefined();
      expect(plan.difficulty).toBeDefined();
    });

    it("should use provided seed for reproducibility", () => {
      const seed = 12345;
      const plan1 = planCampaign({ seed });
      const plan2 = planCampaign({ seed });

      expect(plan1.seed).toBe(seed);
      expect(plan2.seed).toBe(seed);
      expect(plan1.solution).toEqual(plan2.solution);
      expect(plan1.themeId).toEqual(plan2.themeId);
    });

    it("should lock difficulty to expert", () => {
      const difficulties: Difficulty[] = ["beginner", "intermediate", "expert"];

      for (const difficulty of difficulties) {
        const plan = planCampaign({ difficulty });
        expect(plan.difficulty).toBe("expert");
      }
    });

    it("should select a valid solution", () => {
      const plan = planCampaign({});

      expect(isValidSuspectId(plan.solution.suspectId)).toBe(true);
      expect(isValidItemId(plan.solution.itemId)).toBe(true);
      expect(isValidLocationId(plan.solution.locationId)).toBe(true);
      expect(isValidTimeId(plan.solution.timeId)).toBe(true);
    });

    it("should select a valid theme", () => {
      const plan = planCampaign({});
      expect(isValidThemeId(plan.themeId)).toBe(true);
    });

    it("should respect theme selection", () => {
      const themeId = "DEV01";
      const plan = planCampaign({ themeId });
      expect(plan.themeId).toBe(themeId);
    });

    it("should respect exclusion lists", () => {
      const excludeSuspects = ["S01", "S02"];
      const excludeItems = ["I01"];
      const excludeLocations = ["L01", "L02"];
      const excludeTimes = ["T01"];

      const plan = planCampaign({
        excludeSuspects,
        excludeItems,
        excludeLocations,
        excludeTimes,
      });

      expect(excludeSuspects).not.toContain(plan.solution.suspectId);
      expect(excludeItems).not.toContain(plan.solution.itemId);
      expect(excludeLocations).not.toContain(plan.solution.locationId);
      expect(excludeTimes).not.toContain(plan.solution.timeId);
    });

    it("should NEVER include solution in elimination groups", () => {
      // Test multiple times to ensure randomness doesn't cause issues
      for (let i = 0; i < 10; i++) {
        const plan = planCampaign({ seed: i * 1000 });
        const { solution, eliminationPlans } = plan;

        // Check suspects
        const allSuspectEliminations = eliminationPlans.suspects.groups.flatMap(
          (g) => g.elementIds
        );
        expect(allSuspectEliminations).not.toContain(solution.suspectId);

        // Check items
        const allItemEliminations = eliminationPlans.items.groups.flatMap(
          (g) => g.elementIds
        );
        expect(allItemEliminations).not.toContain(solution.itemId);

        // Check locations
        const allLocationEliminations = eliminationPlans.locations.groups.flatMap(
          (g) => g.elementIds
        );
        expect(allLocationEliminations).not.toContain(solution.locationId);

        // Check times
        const allTimeEliminations = eliminationPlans.times.groups.flatMap(
          (g) => g.elementIds
        );
        expect(allTimeEliminations).not.toContain(solution.timeId);
      }
    });

    it("should cover all non-solution elements in elimination groups", () => {
      const plan = planCampaign({});
      const { solution, eliminationPlans } = plan;

      // Get all non-solution IDs
      const nonSolutionSuspects = SUSPECTS.filter(
        (s) => s.id !== solution.suspectId
      ).map((s) => s.id);
      const nonSolutionItems = ITEMS.filter(
        (i) => i.id !== solution.itemId
      ).map((i) => i.id);
      const nonSolutionLocations = LOCATIONS.filter(
        (l) => l.id !== solution.locationId
      ).map((l) => l.id);
      const nonSolutionTimes = TIME_PERIODS.filter(
        (t) => t.id !== solution.timeId
      ).map((t) => t.id);

      // Get all eliminated IDs
      const eliminatedSuspects = eliminationPlans.suspects.groups.flatMap(
        (g) => g.elementIds
      );
      const eliminatedItems = eliminationPlans.items.groups.flatMap(
        (g) => g.elementIds
      );
      const eliminatedLocations = eliminationPlans.locations.groups.flatMap(
        (g) => g.elementIds
      );
      const eliminatedTimes = eliminationPlans.times.groups.flatMap(
        (g) => g.elementIds
      );

      // Verify all non-solution elements are covered
      for (const id of nonSolutionSuspects) {
        expect(eliminatedSuspects).toContain(id);
      }
      for (const id of nonSolutionItems) {
        expect(eliminatedItems).toContain(id);
      }
      for (const id of nonSolutionLocations) {
        expect(eliminatedLocations).toContain(id);
      }
      for (const id of nonSolutionTimes) {
        expect(eliminatedTimes).toContain(id);
      }
    });

    it("should have correct act distribution", () => {
      const plan = planCampaign({});

      expect(plan.narrativeArc.act1).toBeDefined();
      expect(plan.narrativeArc.act2).toBeDefined();
      expect(plan.narrativeArc.act3).toBeDefined();

      const totalClues =
        plan.narrativeArc.act1.clueCount +
        plan.narrativeArc.act2.clueCount +
        plan.narrativeArc.act3.clueCount;

      expect(totalClues).toBe(plan.clues.length);
    });

    it("should sequence clues correctly", () => {
      const plan = planCampaign({});

      for (let i = 0; i < plan.clues.length; i++) {
        expect(plan.clues[i].position).toBe(i + 1);
      }
    });

    it("should validate successfully", () => {
      const plan = planCampaign({});
      expect(plan.validation.valid).toBe(true);
      expect(plan.validation.errors).toHaveLength(0);
    });
  });

  describe("Difficulty settings", () => {
    it("expert should have 7 clues", () => {
      const plan = planCampaign({});
      expect(plan.clues.length).toBe(7);
    });
  });
});

// ============================================
// PHASE 2: CLUE GENERATOR TESTS
// ============================================

describe("Clue Generator (Phase 2)", () => {
  describe("generateScenarioFromPlan()", () => {
    let plan: CampaignPlan;
    let scenario: GeneratedScenario;

    beforeAll(() => {
      plan = planCampaign({ seed: 42 });
      scenario = generateScenarioFromPlan(plan);
    });

    it("should generate a valid scenario from plan", () => {
      expect(scenario).toBeDefined();
      expect(scenario.id).toBeDefined();
      expect(scenario.campaignId).toBe(plan.id);
    });

    it("should preserve solution from plan", () => {
      expect(scenario.solution.suspectId).toBe(plan.solution.suspectId);
      expect(scenario.solution.itemId).toBe(plan.solution.itemId);
      expect(scenario.solution.locationId).toBe(plan.solution.locationId);
      expect(scenario.solution.timeId).toBe(plan.solution.timeId);
    });

    it("should generate clue text for all planned clues", () => {
      expect(scenario.clues.length).toBe(plan.clues.length);

      for (const clue of scenario.clues) {
        expect(clue.text).toBeDefined();
        expect(clue.text.length).toBeGreaterThan(10);
      }
    });

    it("should assign speakers to all clues", () => {
      for (const clue of scenario.clues) {
        expect(["Ashe", "Inspector Brown"]).toContain(clue.speaker);
      }
    });

    it("should assign delivery types to all clues", () => {
      for (const clue of scenario.clues) {
        expect(["butler", "inspector_note", "observation"]).toContain(clue.type);
      }
    });

    it("should include elimination info in all clues", () => {
      for (const clue of scenario.clues) {
        expect(clue.eliminates).toBeDefined();
        expect(["suspect", "item", "location", "time"]).toContain(
          clue.eliminates.category
        );
        expect(clue.eliminates.ids.length).toBeGreaterThan(0);
        expect(clue.eliminates.reason).toBeDefined();
      }
    });

    it("should generate narrative elements", () => {
      expect(scenario.narrative.opening).toBeDefined();
      expect(scenario.narrative.setting).toBeDefined();
      expect(scenario.narrative.atmosphere).toBeDefined();
      expect(scenario.narrative.closing).toBeDefined();
    });

    it("should generate dramatic events", () => {
      expect(scenario.dramaticEvents).toBeDefined();
      expect(scenario.dramaticEvents.length).toBeGreaterThan(0);

      for (const event of scenario.dramaticEvents) {
        expect(event.afterClue).toBeDefined();
        expect(event.description).toBeDefined();
      }
    });

    it("should include metadata", () => {
      expect(scenario.metadata.difficulty).toBe(plan.difficulty);
      expect(scenario.metadata.totalClues).toBe(scenario.clues.length);
      expect(scenario.metadata.seed).toBe(plan.seed);
      expect(scenario.metadata.createdAt).toBeDefined();
      expect(scenario.metadata.version).toBeDefined();
    });
  });
});

// ============================================
// PHASE 3: VALIDATION TESTS
// ============================================

describe("Validation (Phase 3)", () => {
  describe("validateCampaignPlan()", () => {
    it("should pass for a valid plan", () => {
      const plan = planCampaign({});
      const result = validateCampaignPlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should include coverage statistics", () => {
      const plan = planCampaign({});
      const result = validateCampaignPlan(plan);

      expect(result.coverage).toBeDefined();
      expect(result.coverage?.suspects.total).toBe(TOTAL_SUSPECTS - 1);
      expect(result.coverage?.items.total).toBe(TOTAL_ITEMS - 1);
      expect(result.coverage?.locations.total).toBe(TOTAL_LOCATIONS - 1);
      expect(result.coverage?.times.total).toBe(TOTAL_TIMES - 1);
    });
  });

  describe("validateGeneratedScenario()", () => {
    it("should pass for a valid scenario", () => {
      const scenario = generateScenario({});
      const result = validateGeneratedScenario(scenario);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect if solution is eliminated", () => {
      const scenario = generateScenario({});

      // Manually corrupt the scenario to eliminate solution
      const corruptedScenario = {
        ...scenario,
        clues: [
          ...scenario.clues,
          {
            id: "corrupt",
            position: 99,
            type: "inspector_note" as const,
            speaker: "Inspector Brown" as const,
            text: "Test",
            act: "act1_setup" as const,
            eliminates: {
              category: "suspect" as const,
              ids: [scenario.solution.suspectId], // Eliminate the solution!
              reason: "Test",
            },
          },
        ],
      };

      const result = validateGeneratedScenario(corruptedScenario);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "CLUE_ELIMINATES_SOLUTION")).toBe(true);
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe("Integration Tests", () => {
  describe("generateScenario()", () => {
    it("should generate valid scenarios with expert difficulty", () => {
      const difficulties: Difficulty[] = ["beginner", "intermediate", "expert"];

      for (const difficulty of difficulties) {
        const scenario = generateScenario({ difficulty });
        const validation = validateScenario(scenario);

        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
        expect(scenario.metadata.difficulty).toBe("expert");
      }
    });

    it("should be reproducible with same seed", () => {
      const seed = 99999;
      const scenario1 = generateScenario({ seed });
      const scenario2 = generateScenario({ seed });

      expect(scenario1.solution).toEqual(scenario2.solution);
      expect(scenario1.clues.length).toBe(scenario2.clues.length);
      expect(scenario1.theme.id).toBe(scenario2.theme.id);
    });

    it("should produce different results with different seeds", () => {
      const scenario1 = generateScenario({ seed: 1 });
      const scenario2 = generateScenario({ seed: 2 });

      // It's theoretically possible for these to be equal, but very unlikely
      const sameScenario =
        scenario1.solution.suspectId === scenario2.solution.suspectId &&
        scenario1.solution.itemId === scenario2.solution.itemId &&
        scenario1.solution.locationId === scenario2.solution.locationId &&
        scenario1.solution.timeId === scenario2.solution.timeId;

      // This could fail very rarely by chance, but should almost always pass
      expect(sameScenario).toBe(false);
    });
  });

  describe("generateScenarioWithPlan()", () => {
    it("should return both scenario and plan", () => {
      const result = generateScenarioWithPlan({});

      expect(result.scenario).toBeDefined();
      expect(result.plan).toBeDefined();
      expect(result.validation).toBeDefined();
    });

    it("should have matching IDs between plan and scenario", () => {
      const result = generateScenarioWithPlan({});

      expect(result.scenario.campaignId).toBe(result.plan.id);
    });
  });

  describe("Stress tests", () => {
    it("should generate 50 valid scenarios without errors", () => {
      for (let i = 0; i < 50; i++) {
        const scenario = generateScenario({ seed: i });
        const validation = validateScenario(scenario);

        if (!validation.valid) {
          console.error(`Scenario ${i} failed validation:`, validation.errors);
        }

        expect(validation.valid).toBe(true);
      }
    });

    it("should default to the AI theme when none is requested", () => {
      const usedThemes = new Set<string>();

      for (let i = 0; i < 20; i++) {
        const scenario = generateScenario({ seed: i });
        usedThemes.add(scenario.theme.id);
      }

      expect(usedThemes.size).toBe(1);
      expect(usedThemes.has("AI01")).toBe(true);
    });
  });
});

// ============================================
// NARRATIVE COHERENCE TESTS
// ============================================

describe("Narrative Coherence", () => {
  it("should have act 1 clues before act 2 clues", () => {
    const scenario = generateScenario({});
    const cluesByAct = scenario.clues.reduce((acc, clue) => {
      acc[clue.act] = acc[clue.act] || [];
      acc[clue.act].push(clue.position);
      return acc;
    }, {} as Record<string, number[]>);

    if (cluesByAct.act1_setup && cluesByAct.act2_confrontation) {
      const maxAct1Position = Math.max(...cluesByAct.act1_setup);
      const minAct2Position = Math.min(...cluesByAct.act2_confrontation);
      expect(maxAct1Position).toBeLessThan(minAct2Position);
    }
  });

  it("should have act 2 clues before act 3 clues", () => {
    const scenario = generateScenario({});
    const cluesByAct = scenario.clues.reduce((acc, clue) => {
      acc[clue.act] = acc[clue.act] || [];
      acc[clue.act].push(clue.position);
      return acc;
    }, {} as Record<string, number[]>);

    if (cluesByAct.act2_confrontation && cluesByAct.act3_resolution) {
      const maxAct2Position = Math.max(...cluesByAct.act2_confrontation);
      const minAct3Position = Math.min(...cluesByAct.act3_resolution);
      expect(maxAct2Position).toBeLessThan(minAct3Position);
    }
  });

  it("dramatic events should be spaced throughout the game", () => {
    const scenario = generateScenario({});
    const eventPositions = scenario.dramaticEvents.map((e) => e.afterClue);

    // Events should not all be at the beginning or end
    const avgPosition =
      eventPositions.reduce((a, b) => a + b, 0) / eventPositions.length;
    const midpoint = scenario.clues.length / 2;

    // Average event position should be near the middle (within 30%)
    expect(Math.abs(avgPosition - midpoint)).toBeLessThan(
      midpoint * 0.5
    );
  });
});
