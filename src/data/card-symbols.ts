/**
 * Clue DVD Game (2006) - Card Symbol Data
 *
 * Each card has 6 symbol positions on the back, visible only through the red magnifying glass.
 * The DVD tells players which position to check during setup to select solution cards.
 *
 * Positions:
 *   1 = Top Left (TL)
 *   2 = Top Right (TR)
 *   3 = Middle Left (ML)
 *   4 = Middle Right (MR)
 *   5 = Lower Left (LL)
 *   6 = Lower Right (LR)
 *
 * Symbols:
 *   - spyglass
 *   - fingerprint
 *   - whistle
 *   - notepad
 *   - clock
 */

export type SymbolType = "spyglass" | "fingerprint" | "whistle" | "notepad" | "clock";

export type PositionIndex = 1 | 2 | 3 | 4 | 5 | 6;

export const POSITION_NAMES: Record<PositionIndex, string> = {
  1: "Top Left",
  2: "Top Right",
  3: "Middle Left",
  4: "Middle Right",
  5: "Lower Left",
  6: "Lower Right",
};

export interface CardSymbols {
  cardId: string;
  cardName: string;
  cardType: "suspect" | "item" | "location" | "time";
  symbols: [SymbolType, SymbolType, SymbolType, SymbolType, SymbolType, SymbolType];
}

// ============================================
// ITEM CARDS (11)
// ============================================

export const ITEM_SYMBOLS: CardSymbols[] = [
  {
    cardId: "I01",
    cardName: "Spyglass",
    cardType: "item",
    symbols: ["notepad", "spyglass", "spyglass", "whistle", "notepad", "clock"],
  },
  {
    cardId: "I02",
    cardName: "Revolver",
    cardType: "item",
    symbols: ["spyglass", "spyglass", "notepad", "spyglass", "fingerprint", "fingerprint"],
  },
  {
    cardId: "I03",
    cardName: "Rare Book",
    cardType: "item",
    symbols: ["spyglass", "spyglass", "whistle", "notepad", "clock", "whistle"],
  },
  {
    cardId: "I04",
    cardName: "Medal",
    cardType: "item",
    symbols: ["whistle", "notepad", "spyglass", "whistle", "notepad", "clock"],
  },
  {
    cardId: "I05",
    cardName: "Billfold",
    cardType: "item",
    symbols: ["fingerprint", "clock", "whistle", "notepad", "clock", "spyglass"],
  },
  {
    cardId: "I06",
    cardName: "Gold Pen",
    cardType: "item",
    symbols: ["spyglass", "spyglass", "spyglass", "fingerprint", "whistle", "clock"],
  },
  {
    cardId: "I07",
    cardName: "Letter Opener",
    cardType: "item",
    symbols: ["clock", "clock", "fingerprint", "clock", "notepad", "spyglass"],
  },
  {
    cardId: "I08",
    cardName: "Crystal Paperweight",
    cardType: "item",
    symbols: ["fingerprint", "clock", "whistle", "notepad", "clock", "notepad"],
  },
  {
    cardId: "I09",
    cardName: "Pocket Watch",
    cardType: "item",
    symbols: ["whistle", "fingerprint", "spyglass", "whistle", "clock", "spyglass"],
  },
  {
    cardId: "I10",
    cardName: "Jade Hairpin",
    cardType: "item",
    symbols: ["spyglass", "whistle", "whistle", "whistle", "notepad", "clock"],
  },
  {
    cardId: "I11",
    cardName: "Scarab Brooch",
    cardType: "item",
    symbols: ["fingerprint", "spyglass", "clock", "notepad", "spyglass", "fingerprint"],
  },
];

// ============================================
// LOCATION CARDS (11)
// ============================================

export const LOCATION_SYMBOLS: CardSymbols[] = [
  {
    cardId: "L01",
    cardName: "Hall",
    cardType: "location",
    symbols: ["notepad", "spyglass", "spyglass", "whistle", "clock", "notepad"],
  },
  {
    cardId: "L02",
    cardName: "Lounge",
    cardType: "location",
    symbols: ["fingerprint", "whistle", "spyglass", "whistle", "clock", "spyglass"],
  },
  {
    cardId: "L03",
    cardName: "Dining Room",
    cardType: "location",
    symbols: ["whistle", "clock", "clock", "clock", "notepad", "spyglass"],
  },
  {
    cardId: "L04",
    cardName: "Kitchen",
    cardType: "location",
    symbols: ["whistle", "spyglass", "spyglass", "whistle", "fingerprint", "spyglass"],
  },
  {
    cardId: "L05",
    cardName: "Ballroom",
    cardType: "location",
    symbols: ["spyglass", "clock", "notepad", "whistle", "notepad", "clock"],
  },
  {
    cardId: "L06",
    cardName: "Conservatory",
    cardType: "location",
    symbols: ["whistle", "fingerprint", "spyglass", "notepad", "notepad", "whistle"],
  },
  {
    cardId: "L07",
    cardName: "Billiard Room",
    cardType: "location",
    symbols: ["clock", "clock", "spyglass", "notepad", "notepad", "fingerprint"],
  },
  {
    cardId: "L08",
    cardName: "Library",
    cardType: "location",
    symbols: ["fingerprint", "notepad", "fingerprint", "fingerprint", "whistle", "fingerprint"],
  },
  {
    cardId: "L09",
    cardName: "Study",
    cardType: "location",
    symbols: ["fingerprint", "clock", "whistle", "spyglass", "clock", "fingerprint"],
  },
  {
    cardId: "L10",
    cardName: "Rose Garden",
    cardType: "location",
    symbols: ["whistle", "clock", "whistle", "notepad", "whistle", "clock"],
  },
  {
    cardId: "L11",
    cardName: "Fountain",
    cardType: "location",
    symbols: ["spyglass", "clock", "spyglass", "whistle", "notepad", "clock"],
  },
];

// ============================================
// TIME CARDS (10)
// ============================================

export const TIME_SYMBOLS: CardSymbols[] = [
  {
    cardId: "T01",
    cardName: "Dawn",
    cardType: "time",
    symbols: ["fingerprint", "whistle", "spyglass", "notepad", "clock", "spyglass"],
  },
  {
    cardId: "T02",
    cardName: "Breakfast",
    cardType: "time",
    symbols: ["fingerprint", "spyglass", "notepad", "spyglass", "clock", "spyglass"],
  },
  {
    cardId: "T03",
    cardName: "Late Morning",
    cardType: "time",
    symbols: ["notepad", "clock", "whistle", "whistle", "whistle", "spyglass"],
  },
  {
    cardId: "T04",
    cardName: "Lunch",
    cardType: "time",
    symbols: ["fingerprint", "clock", "whistle", "whistle", "clock", "notepad"],
  },
  {
    cardId: "T05",
    cardName: "Early Afternoon",
    cardType: "time",
    symbols: ["whistle", "spyglass", "fingerprint", "clock", "notepad", "whistle"],
  },
  {
    cardId: "T06",
    cardName: "Tea Time",
    cardType: "time",
    symbols: ["clock", "notepad", "spyglass", "whistle", "notepad", "clock"],
  },
  {
    cardId: "T07",
    cardName: "Dusk",
    cardType: "time",
    symbols: ["spyglass", "spyglass", "spyglass", "fingerprint", "notepad", "clock"],
  },
  {
    cardId: "T08",
    cardName: "Dinner",
    cardType: "time",
    symbols: ["spyglass", "clock", "whistle", "notepad", "fingerprint", "fingerprint"],
  },
  {
    cardId: "T09",
    cardName: "Night",
    cardType: "time",
    symbols: ["whistle", "fingerprint", "clock", "notepad", "clock", "fingerprint"],
  },
  {
    cardId: "T10",
    cardName: "Midnight",
    cardType: "time",
    symbols: ["whistle", "spyglass", "whistle", "notepad", "spyglass", "fingerprint"],
  },
];

// ============================================
// SUSPECT CARDS (10)
// ============================================

export const SUSPECT_SYMBOLS: CardSymbols[] = [
  {
    cardId: "S01",
    cardName: "Miss Scarlet",
    cardType: "suspect",
    symbols: ["notepad", "spyglass", "notepad", "fingerprint", "notepad", "clock"],
  },
  {
    cardId: "S02",
    cardName: "Colonel Mustard",
    cardType: "suspect",
    symbols: ["fingerprint", "clock", "clock", "whistle", "spyglass", "clock"],
  },
  {
    cardId: "S03",
    cardName: "Mrs. White",
    cardType: "suspect",
    symbols: ["fingerprint", "spyglass", "spyglass", "notepad", "fingerprint", "fingerprint"],
  },
  {
    cardId: "S04",
    cardName: "Mr. Green",
    cardType: "suspect",
    symbols: ["whistle", "clock", "whistle", "whistle", "clock", "fingerprint"],
  },
  {
    cardId: "S05",
    cardName: "Mrs. Peacock",
    cardType: "suspect",
    symbols: ["fingerprint", "clock", "spyglass", "notepad", "notepad", "clock"],
  },
  {
    cardId: "S06",
    cardName: "Professor Plum",
    cardType: "suspect",
    symbols: ["clock", "spyglass", "spyglass", "clock", "whistle", "whistle"],
  },
  {
    cardId: "S07",
    cardName: "Mrs. Meadow-Brook",
    cardType: "suspect",
    symbols: ["spyglass", "spyglass", "whistle", "spyglass", "clock", "fingerprint"],
  },
  {
    cardId: "S08",
    cardName: "Prince Azure",
    cardType: "suspect",
    symbols: ["whistle", "notepad", "fingerprint", "whistle", "notepad", "spyglass"],
  },
  {
    cardId: "S09",
    cardName: "Lady Lavender",
    cardType: "suspect",
    symbols: ["fingerprint", "fingerprint", "spyglass", "notepad", "clock", "notepad"],
  },
  {
    cardId: "S10",
    cardName: "Rusty",
    cardType: "suspect",
    symbols: ["spyglass", "whistle", "whistle", "whistle", "clock", "spyglass"],
  },
];

// ============================================
// ALL CARDS COMBINED
// ============================================

export const ALL_CARD_SYMBOLS: CardSymbols[] = [
  ...SUSPECT_SYMBOLS,
  ...ITEM_SYMBOLS,
  ...LOCATION_SYMBOLS,
  ...TIME_SYMBOLS,
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all cards that have a specific symbol at a specific position
 */
export function getCardsWithSymbolAtPosition(
  symbol: SymbolType,
  position: PositionIndex,
  cardType?: "suspect" | "item" | "location" | "time"
): CardSymbols[] {
  let cards = ALL_CARD_SYMBOLS;

  if (cardType) {
    cards = cards.filter((c) => c.cardType === cardType);
  }

  return cards.filter((card) => card.symbols[position - 1] === symbol);
}

/**
 * Get the symbol at a specific position for a card
 */
export function getSymbolAtPosition(cardId: string, position: PositionIndex): SymbolType | null {
  const card = ALL_CARD_SYMBOLS.find((c) => c.cardId === cardId);
  if (!card) return null;
  return card.symbols[position - 1];
}

/**
 * Find a card by its symbol pattern
 */
export function findCardBySymbols(
  cardType: "suspect" | "item" | "location" | "time",
  symbol: SymbolType,
  position: PositionIndex
): CardSymbols | undefined {
  const typeCards = ALL_CARD_SYMBOLS.filter((c) => c.cardType === cardType);
  return typeCards.find((card) => card.symbols[position - 1] === symbol);
}

/**
 * Get symbol statistics - how many cards have each symbol at each position
 */
export function getSymbolDistribution(): Record<PositionIndex, Record<SymbolType, number>> {
  const distribution: Record<PositionIndex, Record<SymbolType, number>> = {
    1: { spyglass: 0, fingerprint: 0, whistle: 0, notepad: 0, clock: 0 },
    2: { spyglass: 0, fingerprint: 0, whistle: 0, notepad: 0, clock: 0 },
    3: { spyglass: 0, fingerprint: 0, whistle: 0, notepad: 0, clock: 0 },
    4: { spyglass: 0, fingerprint: 0, whistle: 0, notepad: 0, clock: 0 },
    5: { spyglass: 0, fingerprint: 0, whistle: 0, notepad: 0, clock: 0 },
    6: { spyglass: 0, fingerprint: 0, whistle: 0, notepad: 0, clock: 0 },
  };

  for (const card of ALL_CARD_SYMBOLS) {
    for (let i = 0; i < 6; i++) {
      const position = (i + 1) as PositionIndex;
      const symbol = card.symbols[i];
      distribution[position][symbol]++;
    }
  }

  return distribution;
}
