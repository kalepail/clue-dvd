# Clue DVD Game Scenario Generator

## Project Overview

This is an AI-powered scenario generator for the **Clue DVD Game (2006)** by Parker Brothers/Hasbro. The goal is to create new playable mystery scenarios that work with the physical game components.

**CRITICAL**: This is specifically the **2006 DVD Game**, NOT classic Clue. Key differences:
- About **THEFT** not murder
- **4 categories**: WHO stole WHAT from WHERE at WHEN
- Uses **DVD** with interactive elements (Inspector Brown, Ashe the Butler)
- **Stolen items** (valuables) not weapons
- **10 time periods** as the fourth deduction category

---

## Game Components (VERIFIED FROM PHYSICAL CARDS - January 2026)

### Cards (42 total)

| Category | Count | All Cards |
|----------|-------|-----------|
| Suspects | 10 | Miss Scarlet, Colonel Mustard, Mrs. White, Mr. Green, Mrs. Peacock, Professor Plum, Mrs. Meadow-Brook, Prince Azure, Lady Lavender, Rusty |
| Items | 11 | Spyglass, Revolver, Rare Book, Medal, Billfold (Wallet UK), Gold Pen, Letter Opener, Crystal Paperweight, Pocket Watch, Jade Hairpin, Scarab Brooch |
| Locations | 11 | Hall, Lounge, Dining Room, Kitchen, Ballroom, Conservatory, Billiard Room, Library, Study, Rose Garden, Fountain |
| Times | 10 | Dawn, Breakfast, Late Morning, Lunch, Early Afternoon, Tea Time, Dusk, Dinner, Night, Midnight |

### Solution Space
10 × 11 × 11 × 10 = **12,100 possible solutions**

### Key Characters (Non-Playable)
- **Inspector Brown** - Scotland Yard detective, provides Inspector's Notes
- **Ashe the Butler** - Provides testimonies when summoned, gives item cards
- **Mr. Boddy** - Victim of theft (Dr. Black in UK version)

---

## Gameplay Mechanics

### How It Differs from Classic Clue

| Classic Clue | DVD Game |
|--------------|----------|
| Murder mystery | Theft mystery |
| 3 categories (who/weapon/where) | 4 categories (who/what/where/when) |
| Dice movement | Room-to-room movement |
| All cards dealt at start | Item cards dealt during game |
| Wrong accusation = elimination | Wrong accusation = reveal cards |
| Static game | DVD interruptions with clues |

### Clue Types
1. **Inspector's Notes** - Written clues in rulebook, read privately
2. **Butler Testimonies** - Ashe speaks to ALL players (public)
3. **Item Cards** - Found in rooms, examined through observation tests

### Clue Logic (How Elimination Works)
- "All jewelry was secured by midnight" → Eliminates jewelry items + midnight time
- "Suspects X, Y, Z were together" → Eliminates those 3 suspects
- "The Study was locked all weekend" → Eliminates Study as location
- "Item was seen after Dinner" → Eliminates pre-Dinner times

---

## Project Structure

```
src/
├── index.ts                    # Hono API endpoints
├── data/
│   ├── game-elements.ts        # All 42 cards + themes (VERIFIED DATA)
│   └── card-symbols.ts         # Symbol positions for all 42 cards (COMPLETE)
├── services/
│   ├── scenario-generator.ts   # Core generation logic
│   └── ai-narrative.ts         # Cloudflare AI narrative enhancement
└── types/
    └── scenario.ts             # TypeScript interfaces
```

### Reference Documents
- `GAME_REFERENCE.md` - Complete game component reference (verified from physical cards)
- `CARD_SYMBOLS.md` - Red magnifying glass symbol system documentation

### Symbol System
The physical cards have hidden symbols visible only through the red magnifying glass. The DVD uses these to select solution cards during setup. **Complete symbol data for all 42 cards is now available in `src/data/card-symbols.ts`.**

- **5 symbol types**: spyglass, fingerprint, whistle, notepad, clock
- **6 positions per card**: Top Left, Top Right, Middle Left, Middle Right, Lower Left, Lower Right
- **252 total symbol assignments** (42 cards × 6 positions)

---

## What's Built

### Working Endpoints
- `GET /api/suspects` - List all 10 suspects
- `GET /api/items` - List all 11 items
- `GET /api/locations` - List all 11 locations
- `GET /api/times` - List all 10 times
- `POST /api/scenarios/generate` - Generate a scenario
- `POST /api/scenarios/generate-enhanced` - AI-enhanced narrative

### Core Generation Logic
- Random solution selection (WHO/WHAT/WHERE/WHEN)
- Clue generation that eliminates non-solution elements
- Validation to ensure clues don't eliminate the solution
- Seeded randomization for reproducible scenarios

---

## What's Needed

### Phase 1: Game Sessions
- Create/manage game sessions with Durable Objects
- Track revealed clues, player turns, accusations

### Phase 2: Clue Delivery
- Serve Inspector's Notes on demand
- Serve Butler testimonies in sequence
- Track which clues have been revealed

### Phase 3: Physical Game Integration
- Setup instructions (which cards go where)
- Accusation verification
- No card tracking (players manage physical cards)

---

## Important Notes for AI Assistants

1. **DO NOT** confuse with classic Clue - this is the 2006 DVD Game
2. **DO NOT** use weapons - the items are stolen valuables
3. **DO NOT** forget the time category - it's essential to this version
4. **ALWAYS** reference `src/data/game-elements.ts` for card names
5. **NEVER** make up card names - use only verified data
6. Generated clues must **NEVER** eliminate the solution

---

## Source References

- [Cluepedia - Clue DVD Game](https://cluepedia.fandom.com/wiki/Clue_DVD_Game)
- [Cluepedia - Rules](https://cluepedia.fandom.com/wiki/Clue_DVD_Game/Rules)
- [Hasbro Instructions](https://instructions.hasbro.com/en-us/instruction/clue-dvd-game)
- YouTube gameplay videos for testimony examples
