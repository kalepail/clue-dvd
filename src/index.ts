import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  generateScenario,
  validateScenario,
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
} from "./services/scenario-generator";
import { enhanceNarrativeWithAI } from "./services/ai-narrative";
import { generateDVDSetup, generateDirectSetup, findSymbolForSolution } from "./services/setup-generator";
import type { GenerateScenarioRequest } from "./types/scenario";

// Import game constants and symbols
import {
  CARD_COUNTS,
  SOLUTION_SPACE,
  PLAYER_CONFIG,
  GAME_SETTING,
  NPCS,
  SPECIAL_LOCATIONS,
  CARD_CATEGORIES,
  ITEM_CATEGORIES,
  LIGHT_CONDITIONS,
  SECRET_PASSAGES,
  DIFFICULTY_LEVELS,
} from "./data/game-constants";

import {
  ALL_CARD_SYMBOLS,
  SUSPECT_SYMBOLS,
  ITEM_SYMBOLS,
  LOCATION_SYMBOLS,
  TIME_SYMBOLS,
  POSITION_NAMES,
  getCardsWithSymbolAtPosition,
  getSymbolAtPosition,
  getSymbolDistribution,
  type SymbolType,
  type PositionIndex,
} from "./data/card-symbols";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Enable CORS for all routes
app.use("/*", cors());

// ============================================
// HEALTH CHECK
// ============================================

app.get("/", (c) => {
  return c.json({
    name: "Clue DVD Game Scenario Generator",
    version: "1.1.0",
    status: "healthy",
    game: {
      title: "Clue DVD Game (2006)",
      crime: "Theft (not murder)",
      categories: 4,
      totalCards: CARD_COUNTS.total,
      possibleSolutions: SOLUTION_SPACE.totalPossibilities,
    },
    endpoints: {
      gameElements: {
        suspects: "GET /api/suspects",
        items: "GET /api/items",
        locations: "GET /api/locations",
        times: "GET /api/times",
        themes: "GET /api/themes",
        npcs: "GET /api/npcs",
        symbols: "GET /api/symbols",
      },
      setup: {
        dvdStyle: "GET /api/setup/dvd",
        direct: "GET /api/setup/direct",
      },
      scenarios: {
        generate: "POST /api/scenarios/generate",
        generateEnhanced: "POST /api/scenarios/generate-enhanced",
        validate: "POST /api/scenarios/validate",
      },
      info: {
        stats: "GET /api/stats",
        constants: "GET /api/constants",
        randomSolution: "GET /api/random-solution",
      },
    },
  });
});

// ============================================
// GAME ELEMENTS ENDPOINTS
// ============================================

app.get("/api/suspects", (c) => {
  return c.json({
    count: SUSPECTS.length,
    suspects: SUSPECTS,
  });
});

app.get("/api/suspects/:id", (c) => {
  const id = c.req.param("id");
  const suspect = SUSPECTS.find((s) => s.id === id);
  if (!suspect) {
    return c.json({ error: "Suspect not found" }, 404);
  }
  return c.json(suspect);
});

app.get("/api/items", (c) => {
  const category = c.req.query("category");
  let items = ITEMS;
  if (category) {
    items = ITEMS.filter((i) => i.category === category);
  }
  return c.json({
    count: items.length,
    items,
  });
});

app.get("/api/items/:id", (c) => {
  const id = c.req.param("id");
  const item = ITEMS.find((i) => i.id === id);
  if (!item) {
    return c.json({ error: "Item not found" }, 404);
  }
  return c.json(item);
});

app.get("/api/locations", (c) => {
  const type = c.req.query("type");
  let locations = LOCATIONS;
  if (type) {
    locations = LOCATIONS.filter((l) => l.type === type);
  }
  return c.json({
    count: locations.length,
    locations,
  });
});

app.get("/api/locations/:id", (c) => {
  const id = c.req.param("id");
  const location = LOCATIONS.find((l) => l.id === id);
  if (!location) {
    return c.json({ error: "Location not found" }, 404);
  }
  return c.json(location);
});

app.get("/api/times", (c) => {
  const lightCondition = c.req.query("light");
  let times = TIME_PERIODS;
  if (lightCondition) {
    times = TIME_PERIODS.filter((t) => t.lightCondition === lightCondition);
  }
  return c.json({
    count: times.length,
    times,
  });
});

app.get("/api/times/:id", (c) => {
  const id = c.req.param("id");
  const time = TIME_PERIODS.find((t) => t.id === id);
  if (!time) {
    return c.json({ error: "Time period not found" }, 404);
  }
  return c.json(time);
});

app.get("/api/themes", (c) => {
  return c.json({
    count: MYSTERY_THEMES.length,
    themes: MYSTERY_THEMES,
  });
});

app.get("/api/themes/:id", (c) => {
  const id = c.req.param("id");
  const theme = MYSTERY_THEMES.find((t) => t.id === id);
  if (!theme) {
    return c.json({ error: "Theme not found" }, 404);
  }
  return c.json(theme);
});

// ============================================
// SCENARIO GENERATION ENDPOINTS
// ============================================

app.post("/api/scenarios/generate", async (c) => {
  try {
    const body = await c.req.json<GenerateScenarioRequest>().catch(() => ({}));

    const scenario = generateScenario(body);
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

app.post("/api/scenarios/validate", async (c) => {
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

// AI-Enhanced scenario generation
app.post("/api/scenarios/generate-enhanced", async (c) => {
  try {
    const body = await c.req.json<GenerateScenarioRequest>().catch(() => ({}));

    // Generate base scenario
    const scenario = generateScenario(body);
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
    try {
      const enhancedNarrative = await enhanceNarrativeWithAI(c.env.AI, scenario);
      scenario.narrative = enhancedNarrative;
    } catch (aiError) {
      // Continue with base narrative if AI enhancement fails
      console.error("AI enhancement failed, using base narrative:", aiError);
    }

    return c.json({
      success: true,
      scenario,
      validation,
      aiEnhanced: true,
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

// ============================================
// GAME STATISTICS
// ============================================

app.get("/api/stats", (c) => {
  const totalCombinations = SUSPECTS.length * ITEMS.length * LOCATIONS.length * TIME_PERIODS.length;

  return c.json({
    gameElements: {
      suspects: SUSPECTS.length,
      items: ITEMS.length,
      locations: LOCATIONS.length,
      times: TIME_PERIODS.length,
      themes: MYSTERY_THEMES.length,
    },
    totalPossibleSolutions: totalCombinations,
    itemCategories: {
      antique: ITEMS.filter((i) => i.category === "antique").length,
      desk: ITEMS.filter((i) => i.category === "desk").length,
      jewelry: ITEMS.filter((i) => i.category === "jewelry").length,
    },
    locationTypes: {
      indoor: LOCATIONS.filter((l) => l.type === "indoor").length,
      outdoor: LOCATIONS.filter((l) => l.type === "outdoor").length,
    },
    timeConditions: {
      light: TIME_PERIODS.filter((t) => t.lightCondition === "light").length,
      dark: TIME_PERIODS.filter((t) => t.lightCondition === "dark").length,
      transitional: TIME_PERIODS.filter((t) => t.lightCondition === "transitional").length,
    },
  });
});

// ============================================
// RANDOM SOLUTION (QUICK ENDPOINT)
// ============================================

app.get("/api/random-solution", (c) => {
  const seed = c.req.query("seed") ? parseInt(c.req.query("seed")!) : undefined;
  const scenario = generateScenario({ seed });

  return c.json({
    solution: {
      who: scenario.solution.suspect.displayName,
      what: scenario.solution.item.nameUS,
      where: scenario.solution.location.name,
      when: scenario.solution.time.name,
    },
    ids: {
      suspectId: scenario.solution.suspect.id,
      itemId: scenario.solution.item.id,
      locationId: scenario.solution.location.id,
      timeId: scenario.solution.time.id,
    },
  });
});

// ============================================
// NPC ENDPOINTS
// ============================================

app.get("/api/npcs", (c) => {
  return c.json({
    count: NPCS.length,
    npcs: NPCS,
  });
});

app.get("/api/npcs/:id", (c) => {
  const id = c.req.param("id");
  const npc = NPCS.find((n) => n.id === id);
  if (!npc) {
    return c.json({ error: "NPC not found" }, 404);
  }
  return c.json(npc);
});

// ============================================
// SYMBOL ENDPOINTS
// ============================================

app.get("/api/symbols", (c) => {
  return c.json({
    totalCards: ALL_CARD_SYMBOLS.length,
    symbolTypes: ["spyglass", "fingerprint", "whistle", "notepad", "clock"],
    positions: POSITION_NAMES,
    distribution: getSymbolDistribution(),
    cardsByType: {
      suspects: SUSPECT_SYMBOLS.length,
      items: ITEM_SYMBOLS.length,
      locations: LOCATION_SYMBOLS.length,
      times: TIME_SYMBOLS.length,
    },
  });
});

app.get("/api/symbols/cards", (c) => {
  const cardType = c.req.query("type") as "suspect" | "item" | "location" | "time" | undefined;
  let cards = ALL_CARD_SYMBOLS;

  if (cardType) {
    cards = cards.filter((card) => card.cardType === cardType);
  }

  return c.json({
    count: cards.length,
    cards,
  });
});

app.get("/api/symbols/cards/:cardId", (c) => {
  const cardId = c.req.param("cardId");
  const card = ALL_CARD_SYMBOLS.find((c) => c.cardId === cardId);

  if (!card) {
    return c.json({ error: "Card not found" }, 404);
  }

  return c.json({
    ...card,
    symbolDetails: card.symbols.map((symbol, index) => ({
      position: (index + 1) as PositionIndex,
      positionName: POSITION_NAMES[(index + 1) as PositionIndex],
      symbol,
    })),
  });
});

app.get("/api/symbols/search", (c) => {
  const symbol = c.req.query("symbol") as SymbolType | undefined;
  const position = c.req.query("position") ? parseInt(c.req.query("position")!) as PositionIndex : undefined;
  const cardType = c.req.query("type") as "suspect" | "item" | "location" | "time" | undefined;

  if (!symbol || !position) {
    return c.json({
      error: "Both 'symbol' and 'position' query parameters are required",
      validSymbols: ["spyglass", "fingerprint", "whistle", "notepad", "clock"],
      validPositions: [1, 2, 3, 4, 5, 6],
    }, 400);
  }

  const cards = getCardsWithSymbolAtPosition(symbol, position, cardType);

  return c.json({
    query: { symbol, position, positionName: POSITION_NAMES[position], cardType },
    count: cards.length,
    cards,
  });
});

// ============================================
// SETUP ENDPOINTS
// ============================================

app.get("/api/setup/dvd", (c) => {
  const seed = c.req.query("seed") ? parseInt(c.req.query("seed")!) : undefined;

  try {
    const setup = generateDVDSetup(seed);
    return c.json({
      success: true,
      setupType: "dvd-style",
      description: "Use the red magnifying glass to find cards with the specified symbol at the specified position",
      ...setup,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate DVD setup",
    }, 500);
  }
});

app.get("/api/setup/direct", (c) => {
  const seed = c.req.query("seed") ? parseInt(c.req.query("seed")!) : undefined;

  try {
    const setup = generateDirectSetup(seed);
    return c.json({
      success: true,
      setupType: "direct",
      description: "Place the specified cards directly into the Case File Envelope",
      ...setup,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate direct setup",
    }, 500);
  }
});

app.post("/api/setup/verify-symbol", async (c) => {
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

// ============================================
// GAME CONSTANTS ENDPOINT
// ============================================

app.get("/api/constants", (c) => {
  return c.json({
    cardCounts: CARD_COUNTS,
    solutionSpace: SOLUTION_SPACE,
    playerConfig: PLAYER_CONFIG,
    gameSetting: GAME_SETTING,
    cardCategories: CARD_CATEGORIES,
    itemCategories: ITEM_CATEGORIES,
    lightConditions: LIGHT_CONDITIONS,
    secretPassages: SECRET_PASSAGES,
    difficultyLevels: DIFFICULTY_LEVELS,
    specialLocations: SPECIAL_LOCATIONS,
  });
});

// ============================================
// SPECIAL LOCATIONS ENDPOINT
// ============================================

app.get("/api/special-locations", (c) => {
  return c.json({
    count: SPECIAL_LOCATIONS.length,
    locations: SPECIAL_LOCATIONS,
  });
});

export default app;
