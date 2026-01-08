import { Hono } from "hono";
import {
  generateScenario,
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
} from "../services/scenario-generator";
import {
  CARD_COUNTS,
  SOLUTION_SPACE,
  PLAYER_CONFIG,
  GAME_SETTING,
  SPECIAL_LOCATIONS,
  CARD_CATEGORIES,
  ITEM_CATEGORIES,
  LIGHT_CONDITIONS,
  SECRET_PASSAGES,
  DIFFICULTY_LEVELS,
} from "../data/game-constants";

const info = new Hono<{ Bindings: CloudflareBindings }>();

// Health check
info.get("/", (c) => {
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

// Game statistics
info.get("/api/stats", (c) => {
  const totalCombinations = SUSPECTS.length * ITEMS.length * LOCATIONS.length * TIME_PERIODS.length;

  return c.json({
    gameElements: {
      suspects: SUSPECTS.length,
      items: ITEMS.length,
      locations: LOCATIONS.length,
      times: TIME_PERIODS.length,
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

// Game constants
info.get("/api/constants", (c) => {
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

// Random solution (quick endpoint)
info.get("/api/random-solution", (c) => {
  const seed = c.req.query("seed") ? parseInt(c.req.query("seed")!) : undefined;
  const scenario = generateScenario({ seed });

  // Look up full element details from IDs
  const suspect = SUSPECTS.find((s) => s.id === scenario.solution.suspectId);
  const item = ITEMS.find((i) => i.id === scenario.solution.itemId);
  const location = LOCATIONS.find((l) => l.id === scenario.solution.locationId);
  const time = TIME_PERIODS.find((t) => t.id === scenario.solution.timeId);

  return c.json({
    solution: {
      who: suspect?.displayName || scenario.solution.suspectId,
      what: item?.nameUS || scenario.solution.itemId,
      where: location?.name || scenario.solution.locationId,
      when: time?.name || scenario.solution.timeId,
    },
    ids: {
      suspectId: scenario.solution.suspectId,
      itemId: scenario.solution.itemId,
      locationId: scenario.solution.locationId,
      timeId: scenario.solution.timeId,
    },
  });
});

// Special locations
info.get("/api/special-locations", (c) => {
  return c.json({
    count: SPECIAL_LOCATIONS.length,
    locations: SPECIAL_LOCATIONS,
  });
});

export default info;
