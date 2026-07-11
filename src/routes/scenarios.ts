import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import {
  generateScenarioWithPlan,
  generatePlanOnly,
  validateScenario,
} from "../services/scenario-generator";
import {
  generateMysteryV2,
  getLastMysteryEngineDebug,
  type MysteryEngineResult,
  type MysteryProgressEvent,
} from "../services/ai-mystery-engine";
import type { GenerateCampaignRequest } from "../types/campaign";
import type { GeneratedScenario } from "../types/campaign";
import { createMysteryScenarioShell, createMysterySetup } from "../services/ai-mystery-setup";

const scenarios = new Hono<{ Bindings: CloudflareBindings }>();
const DEFAULT_THEME_ID = "AI01";
const AI_THEME_ID = "AI01";

type ScenarioRequestBody = GenerateCampaignRequest & { theme?: string };

async function generateForRequest(
  c: Context<{ Bindings: CloudflareBindings }>,
  body: ScenarioRequestBody,
  onProgress?: (event: MysteryProgressEvent) => void | Promise<void>
) {
  const rawThemeId = body.themeId || body.theme;
  const themeId = typeof rawThemeId === "string" && rawThemeId.trim().length > 0
    ? rawThemeId
    : DEFAULT_THEME_ID;

  const request: GenerateCampaignRequest = {
    themeId,
    difficulty: "expert",
    seed: body.seed,
    excludeSuspects: body.excludeSuspects,
    excludeItems: body.excludeItems,
    excludeLocations: body.excludeLocations,
    excludeTimes: body.excludeTimes,
    recentMysterySignatures: body.recentMysterySignatures?.slice(0, 5),
  };

  let scenario: GeneratedScenario;
  if (themeId === AI_THEME_ID) {
    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
    const setup = createMysterySetup(request);
    const baseScenario = createMysteryScenarioShell(setup);
    const mystery = await generateMysteryV2(apiKey, {
      setup,
      recentSignatures: request.recentMysterySignatures,
      onProgress,
    });
    scenario = applyMysteryPackage(baseScenario, mystery);
  } else {
    scenario = generateScenarioWithPlan(request).scenario;
    await onProgress?.({ stage: "complete", message: "Case ready.", progress: 100, elapsedMs: 0 });
  }

  const validation = validateScenario(scenario);
  if (!validation.valid) {
    const details = validation.errors.map((error) => error.message).join(" ");
    throw new Error(`Generated scenario failed validation. ${details}`.trim());
  }
  return { scenario, validation };
}

const handleGenerateScenario = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  try {
    const body = await c.req.json<ScenarioRequestBody>().catch(() => ({}));
    const { scenario, validation } = await generateForRequest(c, body);
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

// NDJSON stream used by the client for honest stage and elapsed-time updates.
// There is intentionally no application-level overall timeout.
scenarios.post("/generate-stream", async (c) => {
  const body = await c.req.json<ScenarioRequestBody>().catch(() => ({}));
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (writer) => {
    const writeEvent = async (event: unknown) => {
      await writer.write(`${JSON.stringify(event)}\n`);
    };
    try {
      const { scenario, validation } = await generateForRequest(c, body, async (progress) => {
        await writeEvent({ type: "progress", ...progress });
      });
      await writeEvent({ type: "complete", success: true, scenario, validation });
    } catch (error) {
      await writeEvent({
        type: "error",
        success: false,
        error: error instanceof Error ? error.message : "Unknown mystery generation error",
      });
    }
  });
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

scenarios.get("/last-ai.json", (c) => {
  const output = getLastMysteryEngineDebug();
  if (!output) {
    return c.text("No AI scenario has been generated yet.", 404);
  }
  return new Response(JSON.stringify(output, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"ai-last.json\"",
    },
  });
});

scenarios.get("/last-ai-stages.json", (c) => {
  const output = getLastMysteryEngineDebug();
  if (!output) {
    return c.text("No AI scenario has been generated yet.", 404);
  }
  return new Response(JSON.stringify({
    setup: output.setup,
    creativeDraft: output.creativeDraft ?? null,
    blindAudit: output.blindAudit ?? null,
    revision: output.revision ?? null,
    finalPackage: output.finalPackage ?? null,
    failure: output.failure ?? null,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"ai-last-stages.json\"",
    },
  });
});

export function applyMysteryPackage(
  scenario: GeneratedScenario,
  story: MysteryEngineResult
) {
  if (scenario.clues.length !== story.butlerClues.length) {
    throw new Error(`Expected ${scenario.clues.length} Butler clues, received ${story.butlerClues.length}.`);
  }
  const clues = scenario.clues.map((clue, index) => {
    const { eliminates: _privateLegacyElimination, ...publicClue } = clue;
    return {
      ...publicClue,
      type: "butler" as const,
      speaker: "Ashe" as const,
      text: story.butlerClues[index],
    };
  });
  const inspectorNotes = story.inspectorNotes.map((note) => ({ ...note }));
  return {
    ...scenario,
    clues,
    // Legacy dramatic events are unrelated to the generated mystery.
    dramaticEvents: [],
    inspectorNotes,
    narrative: {
      ...scenario.narrative,
      opening: story.opening,
      closing: story.closing,
    },
    metadata: {
      ...scenario.metadata,
      engineVersion: "2.1-creative",
      mysterySignature: story.mysterySignature,
    },
  };
}

export default scenarios;
