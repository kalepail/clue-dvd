# Clue DVD Game - Card Symbol System

> The red magnifying glass reveals hidden symbols on card backs

---

## How the System Works

### Purpose
The symbol system allows the DVD to "know" the solution without electronic tracking. During setup, the DVD instructs players which symbol position to look for, and cards matching that criteria go into the Case File Envelope.

### Setup Process

1. **Separate cards by type** (suspects, items, locations, times)
2. **DVD announces a position and symbol** (e.g., "Look for the fingerprint in the upper right position")
3. **Using red magnifying glass**, find the card with that symbol at that position
4. **Place that card** in Case File Envelope (this is part of the solution)
5. **Repeat for each card type** using the same position
6. **Remaining cards** are shuffled and dealt to players

### Symbol Positions (6 total)

| Position # | Name | Abbreviation |
|------------|------|--------------|
| 1 | Top Left | TL |
| 2 | Top Right | TR |
| 3 | Middle Left | ML |
| 4 | Middle Right | MR |
| 5 | Lower Left | LL |
| 6 | Lower Right | LR |

### Symbol Types (5 total)

| Symbol | Icon |
|--------|------|
| Spyglass | 🔍 |
| Fingerprint | 👆 |
| Whistle | 📯 |
| Notepad | 📝 |
| Clock | 🕐 |

---

## Complete Symbol Data

Full symbol data for all 42 cards is implemented in `src/data/card-symbols.ts`.

### Data Format

Each card has exactly 6 symbols, one at each position:

```typescript
{
  cardId: "S01",
  cardName: "Miss Scarlet",
  cardType: "suspect",
  symbols: ["notepad", "spyglass", "notepad", "fingerprint", "notepad", "clock"]
  //         TL        TR          ML         MR            LL         LR
}
```

### Helper Functions Available

- `getCardsWithSymbolAtPosition(symbol, position, cardType?)` - Find cards matching criteria
- `getSymbolAtPosition(cardId, position)` - Get symbol at specific position
- `findCardBySymbols(cardType, symbol, position)` - Find card by type and symbol
- `getSymbolDistribution()` - Statistics on symbol usage

---

## Implementation Options

### Option 1: DVD-Style Setup (Full Symbol Support)
With complete symbol data, we can now replicate the DVD's setup exactly:
1. Generate random position (1-6) and symbol
2. Tell players: "Look for the [symbol] in the [position] position"
3. The card with that symbol at that position is the solution

### Option 2: Direct Setup (Bypass Symbols)
For simpler setup or digital-only play:
1. Generate a random solution
2. Tell players which 4 cards to put in the Case File by name
3. Skip the magnifying glass entirely

---

## Current Implementation Status

| Feature | Status |
|---------|--------|
| Generate random solutions | ✅ Done |
| Symbol position mapping | ✅ Complete (42 cards) |
| DVD-style setup support | ✅ Available |
| Alternative setup flow | ✅ Available |

---

## Data Source

Symbol data was catalogued from physical game cards using the red magnifying glass. All 42 cards have been documented with their 6 symbol positions each (252 total symbol assignments).
