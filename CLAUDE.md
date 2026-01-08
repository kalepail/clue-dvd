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
├── index.ts                    # Hono API endpoints (30+ routes)
├── data/
│   ├── game-elements.ts        # All 42 cards + 12 themes (VERIFIED)
│   ├── card-symbols.ts         # Symbol positions for all 42 cards (COMPLETE)
│   └── game-constants.ts       # Game constants, NPCs, special locations
├── services/
│   ├── scenario-generator.ts   # Core scenario generation logic
│   ├── setup-generator.ts      # DVD-style and direct setup generators
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

### API Endpoints

#### Game Elements
- `GET /api/suspects` - List all 10 suspects
- `GET /api/items` - List all 11 items (filter by category)
- `GET /api/locations` - List all 11 locations (filter by type)
- `GET /api/times` - List all 10 times (filter by light condition)
- `GET /api/themes` - List all 12 mystery themes
- `GET /api/npcs` - List NPCs (Inspector Brown, Ashe, Mr. Boddy)
- `GET /api/special-locations` - Evidence Room, Case File, Butler's Pantry

#### Symbol System
- `GET /api/symbols` - Symbol overview and distribution
- `GET /api/symbols/cards` - All cards with symbols
- `GET /api/symbols/cards/:cardId` - Specific card symbols
- `GET /api/symbols/search?symbol=X&position=Y` - Find cards by symbol/position

#### Setup Generators
- `GET /api/setup/dvd` - DVD-style setup (uses magnifying glass)
- `GET /api/setup/direct` - Direct setup (by card name)
- `POST /api/setup/verify-symbol` - Find symbol for a given solution

#### Scenarios
- `POST /api/scenarios/generate` - Generate a scenario
- `POST /api/scenarios/generate-enhanced` - AI-enhanced narrative
- `POST /api/scenarios/validate` - Validate scenario

#### Info
- `GET /api/stats` - Game statistics
- `GET /api/constants` - All game constants
- `GET /api/random-solution` - Quick random solution

### Core Data Files
- **game-elements.ts**: 10 suspects, 11 items, 11 locations, 10 times, 12 themes
- **card-symbols.ts**: 252 symbol assignments with helper functions
- **game-constants.ts**: NPCs, special locations, difficulty levels, secret passages

### Core Generation Logic
- Random solution selection (WHO/WHAT/WHERE/WHEN)
- Clue generation that eliminates non-solution elements
- Validation to ensure clues don't eliminate the solution
- Seeded randomization for reproducible scenarios
- DVD-style setup using symbol system

---

## What's Needed (For Frontend)

### Phase 1: Basic Frontend
- Display available scenarios
- Show setup instructions
- Present clues in sequence

### Phase 2: Game Sessions
- Create/manage game sessions with Durable Objects
- Track revealed clues, player turns, accusations

### Phase 3: Clue Delivery
- Serve Inspector's Notes on demand
- Serve Butler testimonies in sequence
- Track which clues have been revealed

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
