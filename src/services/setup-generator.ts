/**
 * Clue DVD Game - Setup Generator
 *
 * Generates DVD-style setup instructions using the card symbol system.
 * This replicates how the original DVD selected solution cards.
 */

import {
  SUSPECT_SYMBOLS,
  ITEM_SYMBOLS,
  LOCATION_SYMBOLS,
  TIME_SYMBOLS,
  getCardsWithSymbolAtPosition,
  type SymbolType,
  type PositionIndex,
  type CardSymbols,
  POSITION_NAMES,
} from "../data/card-symbols";

// ============================================
// TYPES
// ============================================

export interface DVDSetupInstruction {
  step: number;
  category: "suspect" | "item" | "location" | "time";
  instruction: string;
  symbol: SymbolType;
  position: PositionIndex;
  positionName: string;
  matchingCard: CardSymbols;
}

export interface DVDSetup {
  instructions: DVDSetupInstruction[];
  solution: {
    suspectId: string;
    suspectName: string;
    itemId: string;
    itemName: string;
    locationId: string;
    locationName: string;
    timeId: string;
    timeName: string;
  };
  narrativeIntro: string;
}

// ============================================
// DVD-STYLE SETUP GENERATOR
// ============================================

/**
 * Generate DVD-style setup using the symbol system.
 * This finds a position and symbol combination that yields exactly one card per category.
 */
export function generateDVDSetup(seed?: number): DVDSetup {
  const rng = seed !== undefined ? seededRandom(seed) : Math.random;

  // Try to find a valid symbol/position combination
  const symbols: SymbolType[] = ["spyglass", "fingerprint", "whistle", "notepad", "clock"];
  const positions: PositionIndex[] = [1, 2, 3, 4, 5, 6];

  // Shuffle for randomness
  const shuffledSymbols = shuffle(symbols, rng);
  const shuffledPositions = shuffle(positions, rng);

  // For each category, we need to find ONE card with that symbol at that position
  // The DVD typically uses the same position for all categories

  const position = shuffledPositions[0];
  const positionName = POSITION_NAMES[position];

  // Find symbols that yield exactly one card per category at this position
  const validCombinations: {
    symbol: SymbolType;
    suspect: CardSymbols;
    item: CardSymbols;
    location: CardSymbols;
    time: CardSymbols;
  }[] = [];

  for (const symbol of shuffledSymbols) {
    const suspects = getCardsWithSymbolAtPosition(symbol, position, "suspect");
    const items = getCardsWithSymbolAtPosition(symbol, position, "item");
    const locations = getCardsWithSymbolAtPosition(symbol, position, "location");
    const times = getCardsWithSymbolAtPosition(symbol, position, "time");

    // We need at least one card in each category
    if (suspects.length >= 1 && items.length >= 1 && locations.length >= 1 && times.length >= 1) {
      validCombinations.push({
        symbol,
        suspect: suspects[Math.floor(rng() * suspects.length)],
        item: items[Math.floor(rng() * items.length)],
        location: locations[Math.floor(rng() * locations.length)],
        time: times[Math.floor(rng() * times.length)],
      });
    }
  }

  // If no valid combination at this position, try each position
  if (validCombinations.length === 0) {
    for (const pos of shuffledPositions) {
      for (const symbol of shuffledSymbols) {
        const suspects = getCardsWithSymbolAtPosition(symbol, pos, "suspect");
        const items = getCardsWithSymbolAtPosition(symbol, pos, "item");
        const locations = getCardsWithSymbolAtPosition(symbol, pos, "location");
        const times = getCardsWithSymbolAtPosition(symbol, pos, "time");

        if (suspects.length >= 1 && items.length >= 1 && locations.length >= 1 && times.length >= 1) {
          validCombinations.push({
            symbol,
            suspect: suspects[Math.floor(rng() * suspects.length)],
            item: items[Math.floor(rng() * items.length)],
            location: locations[Math.floor(rng() * locations.length)],
            time: times[Math.floor(rng() * times.length)],
          });
        }
      }
      if (validCombinations.length > 0) break;
    }
  }

  // Pick a random valid combination
  const chosen = validCombinations[Math.floor(rng() * validCombinations.length)] || validCombinations[0];

  if (!chosen) {
    // Fallback to random selection without symbols
    return generateFallbackDVDSetup(rng);
  }

  const instructions: DVDSetupInstruction[] = [
    {
      step: 1,
      category: "item",
      instruction: `Separate the ITEM cards. Using the red magnifying glass, find the card with a ${chosen.symbol} in the ${positionName} position. Place it in the Case File Envelope.`,
      symbol: chosen.symbol,
      position,
      positionName,
      matchingCard: chosen.item,
    },
    {
      step: 2,
      category: "suspect",
      instruction: `Now take the SUSPECT cards. Find the card with a ${chosen.symbol} in the ${positionName} position. Place it in the Case File Envelope.`,
      symbol: chosen.symbol,
      position,
      positionName,
      matchingCard: chosen.suspect,
    },
    {
      step: 3,
      category: "location",
      instruction: `Take the LOCATION cards. Find the card with a ${chosen.symbol} in the ${positionName} position. Place it in the Case File Envelope.`,
      symbol: chosen.symbol,
      position,
      positionName,
      matchingCard: chosen.location,
    },
    {
      step: 4,
      category: "time",
      instruction: `Finally, take the TIME cards. Find the card with a ${chosen.symbol} in the ${positionName} position. Place it in the Case File Envelope.`,
      symbol: chosen.symbol,
      position,
      positionName,
      matchingCard: chosen.time,
    },
  ];

  return {
    instructions,
    solution: {
      suspectId: chosen.suspect.cardId,
      suspectName: chosen.suspect.cardName,
      itemId: chosen.item.cardId,
      itemName: chosen.item.cardName,
      locationId: chosen.location.cardId,
      locationName: chosen.location.cardName,
      timeId: chosen.time.cardId,
      timeName: chosen.time.cardName,
    },
    narrativeIntro: generateNarrativeIntro(chosen.symbol, positionName),
  };
}

/**
 * Fallback when no valid symbol combination exists
 */
function generateFallbackDVDSetup(rng: () => number): DVDSetup {
  const suspect = SUSPECT_SYMBOLS[Math.floor(rng() * SUSPECT_SYMBOLS.length)];
  const item = ITEM_SYMBOLS[Math.floor(rng() * ITEM_SYMBOLS.length)];
  const location = LOCATION_SYMBOLS[Math.floor(rng() * LOCATION_SYMBOLS.length)];
  const time = TIME_SYMBOLS[Math.floor(rng() * TIME_SYMBOLS.length)];

  const symbols: SymbolType[] = ["spyglass", "fingerprint", "whistle", "notepad", "clock"];
  const symbol = symbols[Math.floor(rng() * symbols.length)];
  const position: PositionIndex = (Math.floor(rng() * 6) + 1) as PositionIndex;
  const positionName = POSITION_NAMES[position];

  return {
    instructions: [
      {
        step: 1,
        category: "item",
        instruction: `Place the "${item.cardName}" card in the Case File Envelope.`,
        symbol,
        position,
        positionName,
        matchingCard: item,
      },
      {
        step: 2,
        category: "suspect",
        instruction: `Place the "${suspect.cardName}" card in the Case File Envelope.`,
        symbol,
        position,
        positionName,
        matchingCard: suspect,
      },
      {
        step: 3,
        category: "location",
        instruction: `Place the "${location.cardName}" card in the Case File Envelope.`,
        symbol,
        position,
        positionName,
        matchingCard: location,
      },
      {
        step: 4,
        category: "time",
        instruction: `Place the "${time.cardName}" card in the Case File Envelope.`,
        symbol,
        position,
        positionName,
        matchingCard: time,
      },
    ],
    solution: {
      suspectId: suspect.cardId,
      suspectName: suspect.cardName,
      itemId: item.cardId,
      itemName: item.cardName,
      locationId: location.cardId,
      locationName: location.cardName,
      timeId: time.cardId,
      timeName: time.cardName,
    },
    narrativeIntro: "Inspector Brown has prepared the Case File for this mystery.",
  };
}

// ============================================
// SYMBOL LOOKUP
// ============================================

/**
 * Given a solution, find what symbol/position would select those cards
 * (useful for verifying or reverse-engineering setups)
 */
export function findSymbolForSolution(
  suspectId: string,
  itemId: string,
  locationId: string,
  timeId: string
): { symbol: SymbolType; position: PositionIndex } | null {
  const symbols: SymbolType[] = ["spyglass", "fingerprint", "whistle", "notepad", "clock"];
  const positions: PositionIndex[] = [1, 2, 3, 4, 5, 6];

  const suspectCard = SUSPECT_SYMBOLS.find((c) => c.cardId === suspectId);
  const itemCard = ITEM_SYMBOLS.find((c) => c.cardId === itemId);
  const locationCard = LOCATION_SYMBOLS.find((c) => c.cardId === locationId);
  const timeCard = TIME_SYMBOLS.find((c) => c.cardId === timeId);

  if (!suspectCard || !itemCard || !locationCard || !timeCard) return null;

  // Check each position
  for (const position of positions) {
    const idx = position - 1;
    const suspectSymbol = suspectCard.symbols[idx];
    const itemSymbol = itemCard.symbols[idx];
    const locationSymbol = locationCard.symbols[idx];
    const timeSymbol = timeCard.symbols[idx];

    // All four cards have the same symbol at this position
    if (
      suspectSymbol === itemSymbol &&
      itemSymbol === locationSymbol &&
      locationSymbol === timeSymbol
    ) {
      return { symbol: suspectSymbol, position };
    }
  }

  return null;
}

// ============================================
// HELPERS
// ============================================

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function shuffle<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateNarrativeIntro(symbol: SymbolType, position: string): string {
  const symbolDescriptions: Record<SymbolType, string> = {
    spyglass: "the keen eye of investigation",
    fingerprint: "the mark of the guilty",
    whistle: "the call of duty",
    notepad: "the records of truth",
    clock: "the passage of time",
  };

  return `Inspector Brown instructs you to look for ${symbolDescriptions[symbol]} - find the ${symbol} symbol in the ${position} position on each card type. These cards hold the secret to tonight's mystery.`;
}
