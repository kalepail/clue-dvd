import { Hono } from "hono";
import {
  ALL_CARD_SYMBOLS,
  SUSPECT_SYMBOLS,
  ITEM_SYMBOLS,
  LOCATION_SYMBOLS,
  TIME_SYMBOLS,
  POSITION_NAMES,
  getCardsWithSymbolAtPosition,
  getSymbolDistribution,
  type SymbolType,
  type PositionIndex,
} from "../data/card-symbols";

const symbols = new Hono<{ Bindings: CloudflareBindings }>();

// Symbol overview
symbols.get("/", (c) => {
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

// All cards with symbols
symbols.get("/cards", (c) => {
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

// Specific card symbols
symbols.get("/cards/:cardId", (c) => {
  const cardId = c.req.param("cardId");
  const card = ALL_CARD_SYMBOLS.find((card) => card.cardId === cardId);

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

// Search cards by symbol and position
symbols.get("/search", (c) => {
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

export default symbols;
