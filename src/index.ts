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

// Import game session service for persistent games
import {
  createGame,
  getGame,
  getGameState,
  getGameActions,
  getGameHistory,
  startGame,
  revealClue,
  makeAccusation,
  addPlayerNote,
  abandonGame,
  listGames,
} from "./services/game-session";
import type { CreateGameRequest, MakeAccusationRequest, GameStatus } from "./types/game-session";

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

// ============================================
// GAME SESSION ENDPOINTS (Persistent Games)
// ============================================

// Create a new game
app.post("/api/games", async (c) => {
  try {
    const body = await c.req.json<CreateGameRequest>().catch(() => ({}));
    const { game, setupInstructions } = await createGame(c.env.DB, body);

    const theme = MYSTERY_THEMES.find(t => t.id === game.themeId);

    return c.json({
      success: true,
      gameId: game.id,
      status: game.status,
      setupType: game.setupType,
      setupInstructions,
      playerCount: game.playerCount,
      difficulty: game.difficulty,
      theme: theme ? {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        period: theme.period,
      } : null,
      totalClues: game.clues.length,
      message: "Game created. Follow setup instructions, then call /api/games/:id/start to begin.",
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create game",
    }, 500);
  }
});

// List all games
app.get("/api/games", async (c) => {
  try {
    const status = c.req.query("status") as GameStatus | undefined;
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");

    const { games, total } = await listGames(c.env.DB, { status, limit, offset });

    return c.json({
      success: true,
      count: games.length,
      total,
      games: games.map(g => ({
        id: g.id,
        status: g.status,
        createdAt: g.createdAt,
        difficulty: g.difficulty,
        playerCount: g.playerCount,
        themeId: g.themeId,
        cluesRevealed: g.clues.filter(c => c.revealed).length,
        totalClues: g.clues.length,
      })),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list games",
    }, 500);
  }
});

// Get game details
app.get("/api/games/:id", async (c) => {
  try {
    const gameId = c.req.param("id");
    const game = await getGame(c.env.DB, gameId);
    const state = await getGameState(c.env.DB, gameId);

    if (!game || !state) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    const theme = MYSTERY_THEMES.find(t => t.id === game.themeId);

    // Only show solution if game is finished
    const showSolution = game.status === "solved" || game.status === "abandoned";

    return c.json({
      success: true,
      game: {
        id: game.id,
        status: game.status,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        difficulty: game.difficulty,
        playerCount: game.playerCount,
        setupType: game.setupType,
        theme: theme ? {
          id: theme.id,
          name: theme.name,
          description: theme.description,
        } : null,
      },
      state: {
        phase: state.phase,
        currentClueIndex: state.currentClueIndex,
        totalClues: game.clues.length,
        cluesRemaining: game.clues.length - state.currentClueIndex,
        wrongAccusations: state.wrongAccusations,
        currentPlayer: state.currentPlayer,
      },
      eliminated: {
        suspects: state.eliminatedSuspects,
        items: state.eliminatedItems,
        locations: state.eliminatedLocations,
        times: state.eliminatedTimes,
      },
      remaining: {
        suspects: SUSPECTS.length - state.eliminatedSuspects.length,
        items: ITEMS.length - state.eliminatedItems.length,
        locations: LOCATIONS.length - state.eliminatedLocations.length,
        times: TIME_PERIODS.length - state.eliminatedTimes.length,
      },
      revealedClues: game.clues.filter(c => c.revealed),
      solution: showSolution ? {
        suspectId: game.solution.suspectId,
        suspectName: SUSPECTS.find(s => s.id === game.solution.suspectId)?.displayName,
        itemId: game.solution.itemId,
        itemName: ITEMS.find(i => i.id === game.solution.itemId)?.nameUS,
        locationId: game.solution.locationId,
        locationName: LOCATIONS.find(l => l.id === game.solution.locationId)?.name,
        timeId: game.solution.timeId,
        timeName: TIME_PERIODS.find(t => t.id === game.solution.timeId)?.name,
      } : null,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get game",
    }, 500);
  }
});

// Start a game (after setup is complete)
app.post("/api/games/:id/start", async (c) => {
  try {
    const gameId = c.req.param("id");
    const body = await c.req.json<{ playerNames?: string[] }>().catch(() => ({ playerNames: undefined }));
    const playerNames = body.playerNames || ["Player 1", "Player 2", "Player 3"];

    const game = await getGame(c.env.DB, gameId);
    if (!game) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    if (game.status !== "setup") {
      return c.json({ success: false, error: "Game already started" }, 400);
    }

    await startGame(c.env.DB, gameId, playerNames);

    // Parse narrative for opening
    let opening = "";
    if (game.narrative) {
      try {
        const narrative = JSON.parse(game.narrative);
        opening = narrative.openingNarration || "";
      } catch {
        // Ignore parse errors
      }
    }

    return c.json({
      success: true,
      message: "Game started! The investigation begins.",
      gameId,
      status: "in_progress",
      phase: "investigation",
      opening,
      nextAction: "Call /api/games/:id/clues/next to reveal the first clue",
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start game",
    }, 500);
  }
});

// Reveal the next clue
app.post("/api/games/:id/clues/next", async (c) => {
  try {
    const gameId = c.req.param("id");

    const game = await getGame(c.env.DB, gameId);
    if (!game) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    if (game.status !== "in_progress") {
      return c.json({ success: false, error: "Game is not in progress" }, 400);
    }

    const result = await revealClue(c.env.DB, gameId);

    if (!result) {
      return c.json({
        success: false,
        error: "No more clues to reveal",
        message: "All clues have been revealed. Make your accusation!",
      }, 400);
    }

    const state = await getGameState(c.env.DB, gameId);

    return c.json({
      success: true,
      clue: {
        number: result.clue.index + 1,
        totalClues: game.clues.length,
        type: result.clue.type,
        speaker: result.clue.speaker,
        text: result.clue.text,
        eliminates: result.clue.eliminates,
      },
      dramaticEvent: result.dramaticEvent || null,
      cluesRemaining: game.clues.length - (state?.currentClueIndex || 0),
      canMakeAccusation: true,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to reveal clue",
    }, 500);
  }
});

// Make an accusation
app.post("/api/games/:id/accuse", async (c) => {
  try {
    const gameId = c.req.param("id");
    const body = await c.req.json<MakeAccusationRequest>();

    if (!body.suspectId || !body.itemId || !body.locationId || !body.timeId) {
      return c.json({
        success: false,
        error: "Must provide suspectId, itemId, locationId, and timeId",
      }, 400);
    }

    const game = await getGame(c.env.DB, gameId);
    if (!game) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    if (game.status !== "in_progress") {
      return c.json({ success: false, error: "Game is not in progress" }, 400);
    }

    const result = await makeAccusation(c.env.DB, gameId, body.player || "Player", {
      suspectId: body.suspectId,
      itemId: body.itemId,
      locationId: body.locationId,
      timeId: body.timeId,
    });

    if (result.correct) {
      // Get closing narration
      let closingNarration = "";
      if (game.narrative) {
        try {
          const narrative = JSON.parse(game.narrative);
          closingNarration = narrative.closingNarration || "";
        } catch {
          // Ignore parse errors
        }
      }

      return c.json({
        success: true,
        correct: true,
        message: "Congratulations! You solved the mystery!",
        solution: {
          suspect: {
            id: result.solution!.suspectId,
            name: SUSPECTS.find(s => s.id === result.solution!.suspectId)?.displayName,
          },
          item: {
            id: result.solution!.itemId,
            name: ITEMS.find(i => i.id === result.solution!.itemId)?.nameUS,
          },
          location: {
            id: result.solution!.locationId,
            name: LOCATIONS.find(l => l.id === result.solution!.locationId)?.name,
          },
          time: {
            id: result.solution!.timeId,
            name: TIME_PERIODS.find(t => t.id === result.solution!.timeId)?.name,
          },
        },
        closingNarration,
      });
    } else {
      const state = await getGameState(c.env.DB, gameId);

      return c.json({
        success: true,
        correct: false,
        message: "Incorrect accusation. The investigation continues...",
        wrongAccusations: state?.wrongAccusations || 1,
        hint: "Review the clues more carefully. Something doesn't add up.",
      });
    }
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to make accusation",
    }, 500);
  }
});

// Get game action history
app.get("/api/games/:id/history", async (c) => {
  try {
    const gameId = c.req.param("id");
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : undefined;

    const history = await getGameHistory(c.env.DB, gameId);

    if (!history) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    // Only show solution if game is finished
    const showSolution = history.game.status === "solved" || history.game.status === "abandoned";

    return c.json({
      success: true,
      gameId,
      status: history.game.status,
      createdAt: history.game.createdAt,
      phase: history.state.phase,
      cluesRevealed: history.state.currentClueIndex,
      totalClues: history.game.clues.length,
      wrongAccusations: history.state.wrongAccusations,
      solution: showSolution ? history.solutionDetails : null,
      actions: limit ? history.actions.slice(-limit) : history.actions,
      totalActions: history.actions.length,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get history",
    }, 500);
  }
});

// Add a player note
app.post("/api/games/:id/notes", async (c) => {
  try {
    const gameId = c.req.param("id");
    const body = await c.req.json<{ player: string; note: string }>();

    if (!body.player || !body.note) {
      return c.json({ success: false, error: "Must provide player and note" }, 400);
    }

    await addPlayerNote(c.env.DB, gameId, body.player, body.note);

    return c.json({
      success: true,
      message: "Note recorded",
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to add note",
    }, 500);
  }
});

// Abandon a game
app.post("/api/games/:id/abandon", async (c) => {
  try {
    const gameId = c.req.param("id");

    const game = await getGame(c.env.DB, gameId);
    if (!game) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    await abandonGame(c.env.DB, gameId);

    return c.json({
      success: true,
      message: "Game abandoned",
      solution: {
        suspect: SUSPECTS.find(s => s.id === game.solution.suspectId)?.displayName,
        item: ITEMS.find(i => i.id === game.solution.itemId)?.nameUS,
        location: LOCATIONS.find(l => l.id === game.solution.locationId)?.name,
        time: TIME_PERIODS.find(t => t.id === game.solution.timeId)?.name,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to abandon game",
    }, 500);
  }
});

// ============================================
// AI-ENHANCED GAME ENDPOINTS
// ============================================

// Get AI-generated progress commentary
app.get("/api/games/:id/ai/commentary", async (c) => {
  try {
    const gameId = c.req.param("id");
    const speaker = (c.req.query("speaker") || "Inspector Brown") as "Ashe" | "Inspector Brown";

    const { createGameNarrator } = await import("./services/ai-game-narrator");
    const narrator = await createGameNarrator(c.env.AI, c.env.DB, gameId);

    if (!narrator) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    const commentary = await narrator.generateProgressCommentary(speaker);
    const context = narrator.getContext();

    return c.json({
      success: true,
      speaker,
      commentary,
      gameProgress: {
        cluesRevealed: context.progression.cluesRevealed,
        totalClues: context.progression.totalClues,
        tensionLevel: context.progression.tensionLevel,
        eliminatedCount: {
          suspects: context.eliminated.suspects.length,
          items: context.eliminated.items.length,
          locations: context.eliminated.locations.length,
          times: context.eliminated.times.length,
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate commentary",
    }, 500);
  }
});

// Get game state context (for debugging/display)
app.get("/api/games/:id/ai/context", async (c) => {
  try {
    const gameId = c.req.param("id");

    const { createGameNarrator } = await import("./services/ai-game-narrator");
    const narrator = await createGameNarrator(c.env.AI, c.env.DB, gameId);

    if (!narrator) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    const context = narrator.getContext();

    return c.json({
      success: true,
      context: {
        gameId: context.gameId,
        theme: context.theme,
        progression: context.progression,
        eliminated: context.eliminated,
        remaining: {
          suspectsCount: context.remaining.suspects.length,
          itemsCount: context.remaining.items.length,
          locationsCount: context.remaining.locations.length,
          timesCount: context.remaining.times.length,
        },
        revealedCluesCount: context.revealedClues.length,
        dramaticEventsCount: context.dramaticEvents.length,
        failedAccusationsCount: context.failedAccusations.length,
        narrativeMoments: context.narrativeMoments,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get context",
    }, 500);
  }
});

// Generate a dramatic event based on current state
app.post("/api/games/:id/ai/dramatic-event", async (c) => {
  try {
    const gameId = c.req.param("id");

    const { createGameNarrator } = await import("./services/ai-game-narrator");
    const narrator = await createGameNarrator(c.env.AI, c.env.DB, gameId);

    if (!narrator) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    const event = await narrator.generateDramaticEvent();

    if (!event) {
      return c.json({
        success: false,
        error: "Failed to generate dramatic event",
      }, 500);
    }

    // Record the event
    const { recordAction } = await import("./services/game-session");
    await recordAction(c.env.DB, gameId, "system", "dramatic_event", {
      description: event.description,
      affectedSuspects: event.affectedSuspects,
      triggerAfterClue: narrator.getContext().progression.cluesRevealed,
    });

    return c.json({
      success: true,
      event,
      context: {
        afterClue: narrator.getContext().progression.cluesRevealed,
        tensionLevel: narrator.getContext().progression.tensionLevel,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate event",
    }, 500);
  }
});

// Reveal next clue with AI enhancement
app.post("/api/games/:id/ai/clues/next", async (c) => {
  try {
    const gameId = c.req.param("id");

    // Get the basic clue first
    const game = await getGame(c.env.DB, gameId);
    if (!game) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    if (game.status !== "in_progress") {
      return c.json({ success: false, error: "Game is not in progress" }, 400);
    }

    const state = await getGameState(c.env.DB, gameId);
    if (!state) {
      return c.json({ success: false, error: "Game state not found" }, 404);
    }

    const clueIndex = state.currentClueIndex;
    if (clueIndex >= game.clues.length) {
      return c.json({
        success: false,
        error: "No more clues to reveal",
        message: "All clues have been revealed. Make your accusation!",
      }, 400);
    }

    // Create narrator for AI enhancement
    const { createGameNarrator } = await import("./services/ai-game-narrator");
    const narrator = await createGameNarrator(c.env.AI, c.env.DB, gameId);

    if (!narrator) {
      // Fallback to basic reveal
      const result = await revealClue(c.env.DB, gameId);
      return c.json({
        success: true,
        clue: result?.clue,
        aiEnhanced: false,
      });
    }

    // Get the original clue
    const originalClue = game.clues[clueIndex];

    // Enhance the clue with AI
    const enhancedText = await narrator.enhanceClueWithContext(
      originalClue.text,
      originalClue.speaker,
      clueIndex
    );

    // Now reveal the clue (updates state)
    const result = await revealClue(c.env.DB, gameId);

    if (!result) {
      return c.json({ success: false, error: "Failed to reveal clue" }, 500);
    }

    // Refresh narrator with new state
    const newState = await getGameState(c.env.DB, gameId);
    const { getGameActions } = await import("./services/game-session");
    const actions = await getGameActions(c.env.DB, gameId);
    if (newState) {
      narrator.refresh(newState, actions);
    }

    // Check if we should generate a dramatic event (every 3rd clue after the 2nd)
    let dramaticEvent = result.dramaticEvent;
    if (!dramaticEvent && clueIndex > 1 && (clueIndex + 1) % 3 === 0) {
      const aiEvent = await narrator.generateDramaticEvent();
      if (aiEvent) {
        dramaticEvent = {
          description: aiEvent.description,
          affectedSuspects: aiEvent.affectedSuspects,
          triggerAfterClue: clueIndex + 1,
        };
        const { recordAction } = await import("./services/game-session");
        await recordAction(c.env.DB, gameId, "system", "dramatic_event", dramaticEvent);
      }
    }

    const context = narrator.getContext();

    return c.json({
      success: true,
      aiEnhanced: true,
      clue: {
        number: clueIndex + 1,
        totalClues: game.clues.length,
        type: result.clue.type,
        speaker: result.clue.speaker,
        originalText: originalClue.text,
        enhancedText,
        eliminates: result.clue.eliminates,
      },
      dramaticEvent: dramaticEvent || null,
      gameProgress: {
        cluesRemaining: game.clues.length - (clueIndex + 1),
        tensionLevel: context.progression.tensionLevel,
        eliminatedCount: {
          suspects: context.eliminated.suspects.length,
          items: context.eliminated.items.length,
          locations: context.eliminated.locations.length,
          times: context.eliminated.times.length,
        },
        remainingCount: {
          suspects: context.remaining.suspects.length,
          items: context.remaining.items.length,
          locations: context.remaining.locations.length,
          times: context.remaining.times.length,
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to reveal clue",
    }, 500);
  }
});

// Make accusation with AI-enhanced response
app.post("/api/games/:id/ai/accuse", async (c) => {
  try {
    const gameId = c.req.param("id");
    const body = await c.req.json<MakeAccusationRequest>();

    if (!body.suspectId || !body.itemId || !body.locationId || !body.timeId) {
      return c.json({
        success: false,
        error: "Must provide suspectId, itemId, locationId, and timeId",
      }, 400);
    }

    const game = await getGame(c.env.DB, gameId);
    if (!game) {
      return c.json({ success: false, error: "Game not found" }, 404);
    }

    if (game.status !== "in_progress") {
      return c.json({ success: false, error: "Game is not in progress" }, 400);
    }

    // Create narrator
    const { createGameNarrator } = await import("./services/ai-game-narrator");
    const narrator = await createGameNarrator(c.env.AI, c.env.DB, gameId);

    // Make the accusation
    const result = await makeAccusation(c.env.DB, gameId, body.player || "Player", {
      suspectId: body.suspectId,
      itemId: body.itemId,
      locationId: body.locationId,
      timeId: body.timeId,
    });

    if (result.correct) {
      // Generate AI closing narration
      let closingNarration = "";
      if (narrator) {
        // Refresh with final state
        const newState = await getGameState(c.env.DB, gameId);
        const { getGameActions } = await import("./services/game-session");
        const actions = await getGameActions(c.env.DB, gameId);
        if (newState) {
          narrator.refresh(newState, actions);
        }
        closingNarration = await narrator.generateClosingNarration();
      }

      return c.json({
        success: true,
        correct: true,
        aiEnhanced: !!narrator,
        message: "Congratulations! You solved the mystery!",
        solution: {
          suspect: {
            id: result.solution!.suspectId,
            name: SUSPECTS.find(s => s.id === result.solution!.suspectId)?.displayName,
            role: SUSPECTS.find(s => s.id === result.solution!.suspectId)?.role,
          },
          item: {
            id: result.solution!.itemId,
            name: ITEMS.find(i => i.id === result.solution!.itemId)?.nameUS,
            category: ITEMS.find(i => i.id === result.solution!.itemId)?.category,
          },
          location: {
            id: result.solution!.locationId,
            name: LOCATIONS.find(l => l.id === result.solution!.locationId)?.name,
          },
          time: {
            id: result.solution!.timeId,
            name: TIME_PERIODS.find(t => t.id === result.solution!.timeId)?.name,
          },
        },
        closingNarration,
      });
    } else {
      // Generate AI response to wrong accusation
      let response = "Incorrect accusation. The investigation continues...";
      if (narrator) {
        response = await narrator.generateWrongAccusationResponse(body.player || "Player", {
          suspectId: body.suspectId,
          itemId: body.itemId,
          locationId: body.locationId,
          timeId: body.timeId,
        });
      }

      const state = await getGameState(c.env.DB, gameId);

      return c.json({
        success: true,
        correct: false,
        aiEnhanced: !!narrator,
        message: response,
        wrongAccusations: state?.wrongAccusations || 1,
        gameProgress: narrator ? {
          tensionLevel: narrator.getContext().progression.tensionLevel,
          cluesRevealed: narrator.getContext().progression.cluesRevealed,
          totalClues: narrator.getContext().progression.totalClues,
        } : null,
      });
    }
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to make accusation",
    }, 500);
  }
});

export default app;
