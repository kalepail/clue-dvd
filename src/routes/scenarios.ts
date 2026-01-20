import { Hono, type Context } from "hono";
import {
  generateScenarioWithPlan,
  generatePlanOnly,
  validateScenario,
} from "../services/scenario-generator";
import { generateButlerClues, getLastButlerAiDebug } from "../services/ai-butler-clues";
import type { GenerateCampaignRequest } from "../types/campaign";

const scenarios = new Hono<{ Bindings: CloudflareBindings }>();
const DEFAULT_THEME_ID = "AI01";
const AI_THEME_ID = "AI01";

const handleGenerateScenario = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  try {
    const body = await c.req.json<GenerateCampaignRequest & { theme?: string }>().catch(() => ({} as GenerateCampaignRequest & { theme?: string }));
    const rawThemeId = body.themeId || body.theme;
    const themeId = typeof rawThemeId === "string" && rawThemeId.trim().length > 0
      ? rawThemeId
      : DEFAULT_THEME_ID;

    // Map old 'theme' param to 'themeId'
    const request: GenerateCampaignRequest = {
      themeId,
      difficulty: "expert",
      seed: body.seed,
      excludeSuspects: body.excludeSuspects,
      excludeItems: body.excludeItems,
      excludeLocations: body.excludeLocations,
      excludeTimes: body.excludeTimes,
    };

    const { scenario: baseScenario, plan } = generateScenarioWithPlan(request);
    let scenario = baseScenario;
    if (plan.themeId === AI_THEME_ID) {
      const apiKey = c.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
      }
      const aiClues = await generateButlerClues(apiKey, {
        clueCount: 8,
        solution: plan.solution,
      });
      scenario = applyButlerClues(baseScenario, aiClues);
    }
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
};

// Generate a scenario
scenarios.post("/generate", handleGenerateScenario);

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

// AI-enhanced scenario endpoints removed

scenarios.get("/last-ai.json", (c) => {
  const output = getLastButlerAiDebug();
  if (!output) {
    return c.text("No AI scenario has been generated yet.", 404);
  }
  return new Response(JSON.stringify({
    systemPrompt: output.systemPrompt,
    userPrompt: output.userPrompt,
    rawResponse: output.rawResponse,
    parsed: output.parsed ?? null,
    answerKey: output.answerKey ?? null,
    formattedClues: output.formattedClues ?? null,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"ai-last.json\"",
    },
  });
});

scenarios.get("/last-ai-stages.json", (c) => {
  const output = getLastButlerAiDebug();
  if (!output) {
    return c.text("No AI scenario has been generated yet.", 404);
  }
  return new Response(JSON.stringify({
    stages: {
      system: output.systemPrompt,
      user: output.userPrompt,
      raw: output.rawResponse,
      parsed: output.parsed ?? null,
    },
    answerKey: output.answerKey ?? null,
    formattedClues: output.formattedClues ?? null,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"ai-last-stages.json\"",
    },
  });
});

function applyButlerClues(
  scenario: ReturnType<typeof generateScenarioWithPlan>["scenario"],
  aiClues: string[]
) {
  const butlerClues = scenario.clues.filter((clue) => clue.type === "butler");
  if (butlerClues.length !== aiClues.length) {
    throw new Error(`Expected ${butlerClues.length} butler clues, received ${aiClues.length}.`);
  }
  let index = 0;
  const clues = scenario.clues.map((clue) => {
    if (clue.type !== "butler") return clue;
    const text = aiClues[index++];
    return { ...clue, text };
  });
  return { ...scenario, clues };
}

export default scenarios;
