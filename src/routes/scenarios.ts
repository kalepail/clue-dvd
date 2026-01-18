import { Hono, type Context } from "hono";
import {
  generateScenarioWithPlan,
  generatePlanOnly,
  validateScenario,
} from "../services/scenario-generator";
import { applyAiScenarioText, generateAiScenarioText, getLastAiScenarioOutput } from "../services/ai-scenario";
import type { GenerateCampaignRequest } from "../types/campaign";

const scenarios = new Hono<{ Bindings: CloudflareBindings }>();
const DEFAULT_THEME_ID = "AI01";
const DEV_THEME_ID = "DEV01";

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
    if (plan.themeId !== DEV_THEME_ID) {
      const apiKey = c.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
      }
      const aiText = await generateAiScenarioText(apiKey, plan);
      scenario = applyAiScenarioText(baseScenario, aiText);
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

// AI-enhanced scenario generation
scenarios.post("/generate-enhanced", handleGenerateScenario);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

scenarios.get("/last-ai", (c) => {
  const output = getLastAiScenarioOutput();
  if (!output) {
    return c.text("No AI scenario has been generated yet.", 404);
  }

  const clueLines = output.clues
    .map((clue, index) => `<li><strong>${index + 1}.</strong> ${escapeHtml(clue)}</li>`)
    .join("");

  const noteLines = output.inspectorNotes
    .map((note, index) => `<li><strong>N${index + 1}.</strong> ${escapeHtml(note)}</li>`)
    .join("");

  const solutionHtml = `<ul>
      <li><strong>Suspect:</strong> ${escapeHtml(output.solution.suspect)}</li>
      <li><strong>Item:</strong> ${escapeHtml(output.solution.item)}</li>
      <li><strong>Location:</strong> ${escapeHtml(output.solution.location)}</li>
      <li><strong>Time:</strong> ${escapeHtml(output.solution.time)}</li>
    </ul>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Latest AI Clues</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; padding: 24px; color: #111; }
      h1 { font-size: 24px; margin-bottom: 12px; }
      h2 { font-size: 18px; margin-top: 20px; }
      ul { padding-left: 20px; }
      li { margin: 8px 0; line-height: 1.5; }
      .narrative p { margin: 8px 0; }
    </style>
  </head>
  <body>
    <h1>Latest AI Mystery Output</h1>
    <section>
      <h2>Event</h2>
      <p><strong>${escapeHtml(output.event.name)}</strong></p>
      <p>${escapeHtml(output.event.purpose)}</p>
    </section>
    <section class="narrative">
      <h2>Intro</h2>
      <p>${escapeHtml(output.intro)}</p>
      <h2>Opening</h2>
      ${output.narrative.opening.split("\n").filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      <h2>Setting</h2>
      <p>${escapeHtml(output.narrative.setting)}</p>
      <h2>Atmosphere</h2>
      <p>${escapeHtml(output.narrative.atmosphere)}</p>
      <h2>Closing</h2>
      ${output.narrative.closing.split("\n").filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </section>
    <h2>Solution (Debug)</h2>
    ${solutionHtml}
    <h2>Clues</h2>
    <ul>${clueLines}</ul>
    <h2>Inspector Notes</h2>
    <ul>${noteLines}</ul>
  </body>
</html>`;

  return c.html(html);
});

scenarios.get("/last-ai.json", (c) => {
  const output = getLastAiScenarioOutput();
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

export default scenarios;
