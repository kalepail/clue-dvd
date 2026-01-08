import { Hono } from "hono";
import {
  generateScenario,
  generateScenarioWithPlan,
  generatePlanOnly,
  validateScenario,
  MYSTERY_THEMES,
} from "../services/scenario-generator";
import { enhanceScenarioWithAI } from "../services/ai-narrative";
import type { GenerateCampaignRequest, Difficulty } from "../types/campaign";

const scenarios = new Hono<{ Bindings: CloudflareBindings }>();

// Generate a scenario
scenarios.post("/generate", async (c) => {
  try {
    const body = await c.req.json<GenerateCampaignRequest & { theme?: string }>().catch(() => ({} as GenerateCampaignRequest & { theme?: string }));

    // Map old 'theme' param to 'themeId'
    const request: GenerateCampaignRequest = {
      themeId: body.themeId || body.theme,
      difficulty: body.difficulty,
      seed: body.seed,
      excludeSuspects: body.excludeSuspects,
      excludeItems: body.excludeItems,
      excludeLocations: body.excludeLocations,
      excludeTimes: body.excludeTimes,
    };

    const scenario = generateScenario(request);
    const validation = validateScenario(scenario);

    if (!validation.valid) {
      return c.json(
        {
          success: false,
          error: "Generated scenario failed validation",
          validationErrors: validation.errors,
        },
        500
      );
    }

    return c.json({
      success: true,
      scenario,
      validation,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Generate scenario with full plan (for debugging)
scenarios.post("/generate-with-plan", async (c) => {
  try {
    const body = await c.req.json<GenerateCampaignRequest>().catch(() => ({}));
    const result = generateScenarioWithPlan(body);

    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Generate only the campaign plan (for debugging)
scenarios.post("/generate-plan", async (c) => {
  try {
    const body = await c.req.json<GenerateCampaignRequest>().catch(() => ({}));
    const plan = generatePlanOnly(body);

    return c.json({
      success: true,
      plan,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Validate a scenario
scenarios.post("/validate", async (c) => {
  try {
    const scenario = await c.req.json();
    const validation = validateScenario(scenario);
    return c.json(validation);
  } catch (error) {
    return c.json(
      {
        valid: false,
        errors: [{ code: "PARSE_ERROR", message: "Invalid scenario JSON" }],
        warnings: [],
      },
      400
    );
  }
});

// AI-enhanced scenario generation
scenarios.post("/generate-enhanced", async (c) => {
  try {
    const body = await c.req.json<GenerateCampaignRequest & { theme?: string }>().catch(() => ({} as GenerateCampaignRequest & { theme?: string }));

    const request: GenerateCampaignRequest = {
      themeId: body.themeId || body.theme,
      difficulty: body.difficulty,
      seed: body.seed,
      excludeSuspects: body.excludeSuspects,
      excludeItems: body.excludeItems,
      excludeLocations: body.excludeLocations,
      excludeTimes: body.excludeTimes,
    };

    // Generate base scenario
    const scenario = generateScenario(request);
    const validation = validateScenario(scenario);

    if (!validation.valid) {
      return c.json(
        {
          success: false,
          error: "Generated scenario failed validation",
          validationErrors: validation.errors,
        },
        500
      );
    }

    // Enhance narrative with AI
    let aiEnhanced = false;
    try {
      const enhancedScenario = await enhanceScenarioWithAI(c.env.AI, scenario);
      aiEnhanced = true;
      return c.json({
        success: true,
        scenario: enhancedScenario,
        validation,
        aiEnhanced,
      });
    } catch (aiError) {
      // Continue with base scenario if AI enhancement fails
      console.error("AI enhancement failed, using base scenario:", aiError);
      return c.json({
        success: true,
        scenario,
        validation,
        aiEnhanced: false,
        aiError: aiError instanceof Error ? aiError.message : "AI enhancement failed",
      });
    }
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default scenarios;
