# Clue DVD Game - AI Game Master

## Project Overview

This is an **AI-powered web app that replaces the DVD** for the **Clue DVD Game (2006)** by Parker Brothers/Hasbro. The web app acts as the game master, generating new mystery scenarios while players use the **original physical game components** (board, cards, pawns, magnifying glass).

**CRITICAL**: This is specifically the **2006 DVD Game**, NOT classic Clue. Key differences:
- About **THEFT** not murder
- **4 categories**: WHO stole WHAT from WHERE at WHEN
- **AI replaces DVD** - generates Inspector Brown clues, Butler testimonies, commentary
- **Stolen items** (valuables) not weapons
- **10 time periods** as the fourth deduction category

### How It Works

1. **Web app generates mystery** - Random solution (WHO/WHAT/WHERE/WHEN) with AI-enhanced narrative
2. **App shows card symbols** - Players use red magnifying glass to find matching physical cards
3. **Players set up physical game** - Place solution cards in envelope, deal remaining cards
4. **App delivers clues** - Inspector's Notes, Butler testimonies served through the app
5. **Physical gameplay** - Move pawns, make suggestions, use physical cards to deduce

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
├── index.ts                    # Hono app entry - mounts route modules
├── routes/
│   ├── info.ts                 # Health, stats, constants
│   ├── game-elements.ts        # Suspects, items, locations, times, themes, NPCs
│   ├── symbols.ts              # Card symbol system endpoints
│   ├── setup.ts                # Setup endpoints (symbol lookup)
│   ├── scenarios.ts            # Scenario generation
│   ├── games.ts                # Game session CRUD
│   └── games-ai.ts             # AI-enhanced game features
├── data/
│   ├── game-elements.ts        # All 42 cards + 12 themes (VERIFIED)
│   ├── card-symbols.ts         # Symbol positions for all 42 cards (COMPLETE)
│   └── game-constants.ts       # Game constants, NPCs, special locations
├── services/
│   ├── scenario-generator.ts   # Core scenario generation logic
│   ├── setup-generator.ts      # Symbol lookup utilities
│   ├── game-session.ts         # Game session management
│   └── ai-narrative.ts         # Cloudflare AI narrative enhancement
├── shared/
│   ├── api-types.ts            # API request/response types (shared with frontend)
│   └── game-elements.ts        # Card data shared with frontend
├── client/                     # React frontend
└── types/
    └── scenario.ts             # TypeScript interfaces
```

### Reference Documents
- `GAME_REFERENCE.md` - Complete game component reference (verified from physical cards)
- `CARD_SYMBOLS.md` - Red magnifying glass symbol system documentation

### Symbol System
The physical cards have hidden symbols visible only through the red magnifying glass. **The web app displays these symbols so players can find the matching physical cards** using the magnifying glass. Complete symbol data for all 42 cards is in `src/data/card-symbols.ts`.

- **5 symbol types**: spyglass, fingerprint, whistle, notepad, clock
- **6 positions per card**: Top Left, Top Right, Middle Left, Middle Right, Lower Left, Lower Right
- **252 total symbol assignments** (42 cards × 6 positions)

### DVD Content as AI Context
The original DVD content (Inspector Brown's voice, Ashe's testimonies, theme narratives, character personalities) is used to **inform the AI-generated content**. The AI mimics the style and tone of the original DVD characters when generating clues and commentary.

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

#### Symbol Lookup
- `POST /api/setup/verify-symbol` - Find symbols for a given solution (for physical card mirroring)

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

## What's Built (Frontend)

The React frontend provides:
- **Game creation** - Select theme, difficulty, player count
- **Solution card display** - Shows symbol grids for physical card mirroring
- **Clue reveal** - AI-generated clues served one at a time
- **Elimination tracker** - Track eliminated suspects/items/locations/times
- **Accusation system** - Make accusations with AI-judged responses
- **Game history** - Timeline of all clues and events

---

## Important Notes for AI Assistants

1. **DO NOT** confuse with classic Clue - this is the 2006 DVD Game
2. **DO NOT** use weapons - the items are stolen valuables
3. **DO NOT** forget the time category - it's essential to this version
4. **ALWAYS** reference `src/data/game-elements.ts` for card names
5. **NEVER** make up card names - use only verified data
6. Generated clues must **NEVER** eliminate the solution
7. **WEB APP REPLACES DVD** - The app is the game master, not a companion to the DVD
8. **PHYSICAL COMPONENTS STILL USED** - Players use the real board, cards, and magnifying glass
9. **DVD CONTENT INFORMS AI** - Original DVD themes, character voices, and narrative style guide AI generation

---

## Source References

- [Cluepedia - Clue DVD Game](https://cluepedia.fandom.com/wiki/Clue_DVD_Game)
- [Cluepedia - Rules](https://cluepedia.fandom.com/wiki/Clue_DVD_Game/Rules)
- [Hasbro Instructions](https://instructions.hasbro.com/en-us/instruction/clue-dvd-game)
- YouTube gameplay videos for testimony examples
