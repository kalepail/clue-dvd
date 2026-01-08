import { Hono } from "hono";
import { generateDVDSetup, findSymbolForSolution } from "../services/setup-generator";
import { POSITION_NAMES } from "../data/card-symbols";

const setup = new Hono<{ Bindings: CloudflareBindings }>();

// Generate setup with symbol-based card selection (for physical game mirroring)
setup.get("/generate", (c) => {
  const seed = c.req.query("seed") ? parseInt(c.req.query("seed")!) : undefined;

  try {
    const setupResult = generateDVDSetup(seed);
    return c.json({
      success: true,
      description: "Use the red magnifying glass to find cards with the specified symbol at the specified position",
      ...setupResult,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate setup",
    }, 500);
  }
});

// Legacy endpoint - redirects to /generate
setup.get("/dvd", (c) => {
  const seed = c.req.query("seed") ? parseInt(c.req.query("seed")!) : undefined;

  try {
    const setupResult = generateDVDSetup(seed);
    return c.json({
      success: true,
      description: "Use the red magnifying glass to find cards with the specified symbol at the specified position",
      ...setupResult,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate setup",
    }, 500);
  }
});

// Verify symbol for a given solution
setup.post("/verify-symbol", async (c) => {
  try {
    const body = await c.req.json<{
      suspectId: string;
      itemId: string;
      locationId: string;
      timeId: string;
    }>();

    const result = findSymbolForSolution(
      body.suspectId,
      body.itemId,
      body.locationId,
      body.timeId
    );

    if (result) {
      return c.json({
        found: true,
        symbol: result.symbol,
        position: result.position,
        positionName: POSITION_NAMES[result.position],
        message: `All four cards have '${result.symbol}' at ${POSITION_NAMES[result.position]} position`,
      });
    } else {
      return c.json({
        found: false,
        message: "No single symbol/position combination matches all four cards",
      });
    }
  } catch (error) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});

export default setup;
