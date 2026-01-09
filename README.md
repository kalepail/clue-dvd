# Clue DVD Game - AI Game Master

An AI-powered web app that **replaces the DVD** for the **Clue DVD Game (2006)** by Parker Brothers/Hasbro. The app generates mystery scenarios while players use the original physical game components.

## Quick Start

```bash
npm install
npm run dev      # Development server
```

```bash
npm run deploy   # Deploy to Cloudflare Workers
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```bash
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

---

## Project Overview

### What This Is

This web app acts as the **game master** for the 2006 Clue DVD Game, generating:
- New mystery scenarios (WHO stole WHAT from WHERE at WHEN)
- Inspector Brown's notes and Ashe the Butler's testimonies
- AI-enhanced narrative content

### Key Differences from Classic Clue

| Classic Clue | DVD Game (This App) |
|--------------|---------------------|
| Murder mystery | **Theft** mystery |
| 3 categories | **4 categories** (who/what/where/when) |
| Weapons | **Stolen valuables** (items) |
| Static game | **Dynamic clues** served by app |

### Solution Space

**10 suspects x 11 items x 11 locations x 10 times = 12,100 possible mysteries**

---

## Current Capabilities

### What's Working

| Feature | Status | Description |
|---------|--------|-------------|
| Scenario Generation | Complete | Random solutions with logical clues |
| AI Narrative Enhancement | Complete | Cloudflare AI generates atmospheric text |
| Symbol System | Complete | Red magnifying glass card mirroring |
| Elimination Tracking | Complete | Track deductions in UI |
| Clue Reveal System | Complete | Progressive clue revelation |
| Accusation System | Complete | Make accusations, win/lose |
| Game Persistence | Client-only | Games saved to localStorage |

### What's Not Built Yet

| Feature | Status | Notes |
|---------|--------|-------|
| Server-side Game Persistence | Not started | Games only in localStorage |
| Multiplayer/Sessions | Not started | No shared game state |
| Physical Card Verification | Not started | Manual honor system |
| Sound/Voice | Not started | Original DVD had Inspector Brown voice |

---

## Architecture Overview

```
+-------------------------------------------------------------+
|                        FRONTEND                              |
|                   (React + TypeScript)                       |
|                                                              |
|  +-----------+  +-----------+  +---------------------+       |
|  | HomePage  |  | GamePage  |  |   Components        |       |
|  | - Game list  | - Setup   |  |   - SolutionCards   |       |
|  | - New game|  | - Play    |  |   - EliminationTrack|       |
|  |           |  | - Solved  |  |   - AccusationPanel |       |
|  +-----+-----+  +-----+-----+  +---------------------+       |
|        |              |                                      |
|        +--------------+---------------+                      |
|                                       v                      |
|  +------------------------------------------------------+   |
|  |                   GameStore                           |   |
|  |   - localStorage persistence                          |   |
|  |   - Game state management                             |   |
|  |   - Calls backend for scenario generation             |   |
|  +------------------------------------------------------+   |
+---------------------------+----------------------------------+
                            | HTTP API
                            v
+-------------------------------------------------------------+
|                        BACKEND                               |
|               (Hono + Cloudflare Workers)                    |
|                                                              |
|  +------------------------------------------------------+   |
|  |                    Routes                             |   |
|  |  /api/scenarios  /api/symbols  /api/setup  /api/*    |   |
|  +------------------------------------------------------+   |
|                           |                                  |
|  +------------------------+----------------------------+    |
|  |                    Services                          |    |
|  |  +-----------+  +-----------+  +-----------+         |    |
|  |  | Campaign  |  |   Clue    |  |    AI     |         |    |
|  |  | Planner   |->| Generator |->| Narrative |         |    |
|  |  +-----------+  +-----------+  +-----------+         |    |
|  |       |                                              |    |
|  |       v                                              |    |
|  |  +-----------+                                       |    |
|  |  | Validator |  (ensures clues don't break game)     |    |
|  |  +-----------+                                       |    |
|  +------------------------------------------------------+   |
|                           |                                  |
|  +------------------------------------------------------+   |
|  |                    Data Layer                         |   |
|  |  game-elements.ts  card-symbols.ts  game-constants.ts |   |
|  +------------------------------------------------------+   |
+-------------------------------------------------------------+
```

---

## Frontend-Backend API Contract

### API Endpoints Used by Frontend

| Frontend Action | Endpoint | Method | Purpose |
|-----------------|----------|--------|---------|
| Create new game | `/api/scenarios/generate` | POST | Generate scenario |
| Create with AI | `/api/scenarios/generate-enhanced` | POST | AI-enhanced scenario |
| Get card symbols | `/api/symbols/cards/:cardId` | GET | Symbol positions for card |

### Scenario Generation Request

```typescript
// POST /api/scenarios/generate
// POST /api/scenarios/generate-enhanced
{
  themeId?: string;        // M01-M12 (optional)
  difficulty?: string;     // "beginner" | "intermediate" | "expert"
  playerCount?: number;    // 2-6
  seed?: number;           // For reproducible scenarios
}
```

### Scenario Generation Response

```typescript
{
  success: boolean;
  scenario: {
    id: string;
    theme: { id, name, description };
    solution: {
      suspectId, itemId, locationId, timeId  // The answer
    };
    clues: [{
      id: string;           // C001, C002, etc.
      position: number;     // 1-based order
      type: "butler" | "inspector_note" | "observation";
      speaker: "Ashe" | "Inspector Brown";
      text: string;         // The clue text
      act: string;          // act1_setup | act2_confrontation | act3_resolution
      eliminates: {
        category: "suspect" | "item" | "location" | "time";
        ids: string[];      // Elements eliminated
        reason: string;     // Elimination type
      };
    }];
    narrative: {
      opening: string;      // Inspector Brown's intro
      atmosphere: string;   // Sensory description
      closing: string;      // Resolution narrative
    };
    metadata: { difficulty, totalClues, seed, createdAt };
  };
  validation: {
    valid: boolean;
    errors: [];
    coverage: { suspects, items, locations, times };
  };
}
```

### Symbol Lookup Response

```typescript
// GET /api/symbols/cards/S01
{
  success: true;
  card: {
    cardId: "S01";
    cardName: "Miss Scarlet";
    cardType: "suspect";
    symbols: ["spyglass", "fingerprint", "whistle", "notepad", "clock", "spyglass"];
    // Positions: [Top Left, Top Right, Middle Left, Middle Right, Lower Left, Lower Right]
  };
}
```

### All Backend Endpoints

#### Info Routes (`/`)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /` | GET | Health check, API info |
| `GET /api/stats` | GET | Game statistics by category |
| `GET /api/constants` | GET | All game constants |
| `GET /api/random-solution` | GET | Quick random solution (?seed=N) |
| `GET /api/special-locations` | GET | Evidence Room, Case File, Butler's Pantry |

#### Game Elements Routes (`/api`)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /suspects` | GET | List all 10 suspects |
| `GET /suspects/:id` | GET | Get suspect by ID (S01-S10) |
| `GET /items` | GET | List items (?category=antique\|desk\|jewelry) |
| `GET /items/:id` | GET | Get item by ID (I01-I11) |
| `GET /locations` | GET | List locations (?type=indoor\|outdoor) |
| `GET /locations/:id` | GET | Get location by ID (L01-L11) |
| `GET /times` | GET | List times (?light=light\|dark\|transitional) |
| `GET /times/:id` | GET | Get time by ID (T01-T10) |
| `GET /themes` | GET | List all 12 themes |
| `GET /themes/:id` | GET | Get theme by ID (M01-M12) |
| `GET /npcs` | GET | List NPCs (Inspector Brown, Ashe, Mr. Boddy) |
| `GET /npcs/:id` | GET | Get NPC by ID |

#### Symbols Routes (`/api/symbols`)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /` | GET | Symbol overview and distribution |
| `GET /cards` | GET | All cards with symbols (?type=suspect\|item\|location\|time) |
| `GET /cards/:cardId` | GET | Specific card's 6 symbol positions |
| `GET /search` | GET | Find cards by symbol/position (?symbol=X&position=1-6) |

#### Setup Routes (`/api/setup`)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /generate` | GET | Generate DVD-style setup (?seed=N) |
| `GET /dvd` | GET | Alias for /generate |
| `POST /verify-symbol` | POST | Find symbol for given solution |

#### Scenario Routes (`/api/scenarios`)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /generate` | POST | Generate scenario |
| `POST /generate-with-plan` | POST | Generate with plan details |
| `POST /generate-plan` | POST | Generate plan only |
| `POST /validate` | POST | Validate existing scenario |
| `POST /generate-enhanced` | POST | AI-enhanced scenario |

---

## Data Flow

### Creating a New Game

```
User clicks "New Game"
        |
        v
NewGameModal collects: theme, difficulty, playerCount
        |
        v
GameStore.createGame() --------> POST /api/scenarios/generate
        |                              |
        |                              v
        |                      Backend generates:
        |                      1. Random solution
        |                      2. Elimination clues
        |                      3. AI narrative
        |                              |
        <------------------------------+
        |
        v
GameStore saves to localStorage:
  - Scenario (solution, clues, narrative)
  - Game state (phase, currentClueIndex)
        |
        v
Navigate to GamePage
```

### Playing the Game

```
GamePage loads game from GameStore
        |
        v
+---------------------------------------+
|  SETUP PHASE                          |
|  - Show opening narrative             |
|  - Display SolutionCards (symbols)    |
|  - Player uses magnifying glass       |
|    to find physical cards             |
|  - Click "Begin Investigation"        |
+-------------------+-------------------+
                    |
                    v
+---------------------------------------+
|  INVESTIGATION PHASE                  |
|  - Reveal clues one at a time         |
|  - Track eliminations (local state)   |
|  - Make accusations when ready        |
+-------------------+-------------------+
                    |
          +---------+---------+
          v                   v
    Accusation           Accusation
    Correct              Wrong
          |                   |
          v                   v
+-----------------+   +-----------------+
|  SOLVED PHASE   |   |  Continue or    |
|  - Show solution|   |  try again      |
|  - Closing text |   +-----------------+
+-----------------+
```

---

## File Structure

```
src/
├── index.ts                          # Hono app entry point
│
├── routes/                           # API endpoints
│   ├── info.ts                       # Health, stats, constants
│   ├── game-elements.ts              # Suspects, items, locations, times
│   ├── symbols.ts                    # Card symbol lookup
│   ├── setup.ts                      # DVD-style setup generation
│   └── scenarios.ts                  # Scenario generation
│
├── services/                         # Business logic
│   ├── scenario-generator.ts         # Main generation orchestrator
│   ├── campaign-planner.ts           # Phase 1: Strategic planning
│   ├── campaign-clue-generator.ts    # Phase 2: Clue text generation
│   ├── campaign-validator.ts         # Phase 3: Validation
│   ├── setup-generator.ts            # Symbol-based setup
│   ├── ai-narrative.ts               # Cloudflare AI integration
│   └── seeded-random.ts              # Reproducible randomization
│
├── data/                             # Static game data
│   ├── game-elements.ts              # 42 cards (verified from physical game)
│   ├── card-symbols.ts               # 252 symbol positions
│   ├── game-constants.ts             # NPCs, settings, config
│   ├── campaign-settings.ts          # Difficulty configurations
│   └── ai-context.ts                 # AI grounding context
│
├── types/                            # TypeScript definitions
│   ├── campaign.ts                   # Campaign/clue types
│   └── scenario.ts                   # Scenario types
│
├── shared/                           # Frontend + Backend shared
│   ├── api-types.ts                  # Request/response types
│   ├── game-elements.ts              # Simple display data
│   └── index.ts                      # Re-exports
│
└── client/                           # React frontend
    ├── App.tsx                       # Router + header
    ├── main.tsx                      # Entry point
    ├── styles.css                    # Tailwind + 1920s theme
    │
    ├── pages/
    │   ├── HomePage.tsx              # Game list, new game
    │   └── GamePage.tsx              # Main gameplay
    │
    ├── components/
    │   ├── NewGameModal.tsx          # Game creation form
    │   ├── SolutionCards.tsx         # Symbol grid display
    │   ├── ClueDisplay.tsx           # Single clue card
    │   ├── EliminationTracker.tsx    # Deduction board
    │   ├── AccusationPanel.tsx       # Make accusation
    │   ├── GameHistory.tsx           # Event timeline
    │   └── ui/                       # shadcn-style primitives
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── dialog.tsx
    │       ├── select.tsx
    │       ├── label.tsx
    │       ├── badge.tsx
    │       ├── progress.tsx
    │       └── icon-stat.tsx
    │
    ├── hooks/
    │   ├── useGameStore.ts           # Game state (localStorage)
    │   └── useApi.ts                 # API client
    │
    └── lib/
        └── utils.ts                  # Tailwind merge utility
```

---

## Game Elements (Verified from Physical Cards)

### Suspects (10)

| ID | Name | Color |
|----|------|-------|
| S01 | Miss Scarlet | Red |
| S02 | Colonel Mustard | Yellow |
| S03 | Mrs. White | White |
| S04 | Mr. Green | Green |
| S05 | Mrs. Peacock | Blue |
| S06 | Professor Plum | Purple |
| S07 | Mrs. Meadow-Brook | Teal |
| S08 | Prince Azure | Light Blue |
| S09 | Lady Lavender | Lavender |
| S10 | Rusty | Orange |

### Items (11)

| ID | Name | Category |
|----|------|----------|
| I01 | Spyglass | Antique |
| I02 | Revolver | Antique |
| I03 | Rare Book | Antique |
| I04 | Medal | Antique |
| I05 | Billfold | Desk |
| I06 | Gold Pen | Desk |
| I07 | Letter Opener | Desk |
| I08 | Crystal Paperweight | Desk |
| I09 | Pocket Watch | Jewelry |
| I10 | Jade Hairpin | Jewelry |
| I11 | Scarab Brooch | Jewelry |

### Locations (11)

| ID | Name | Type |
|----|------|------|
| L01 | Hall | Indoor |
| L02 | Lounge | Indoor |
| L03 | Dining Room | Indoor |
| L04 | Kitchen | Indoor |
| L05 | Ballroom | Indoor |
| L06 | Conservatory | Indoor |
| L07 | Billiard Room | Indoor |
| L08 | Library | Indoor |
| L09 | Study | Indoor |
| L10 | Rose Garden | Outdoor |
| L11 | Fountain | Outdoor |

### Times (10)

| ID | Name | Light |
|----|------|-------|
| T01 | Dawn | Transitional |
| T02 | Breakfast | Light |
| T03 | Late Morning | Light |
| T04 | Lunch | Light |
| T05 | Early Afternoon | Light |
| T06 | Tea Time | Light |
| T07 | Dusk | Transitional |
| T08 | Dinner | Transitional |
| T09 | Night | Dark |
| T10 | Midnight | Dark |

### Mystery Themes (12)

| ID | Name | Period |
|----|------|--------|
| M01 | The Monte Carlo Affair | September 1925 |
| M02 | The Garden Party | Fall 1925 |
| M03 | A Bad Sport | Fall 1925 |
| M04 | The Hunt | Fall 1925 |
| M05 | The Autumn Leaves | Late Fall 1925 |
| M06 | The Costume Party | Winter 1925 |
| M07 | Spring Cleaning | Spring 1926 |
| M08 | A Princess Is Born | Spring 1926 |
| M09 | A Grand Ball | Spring 1926 |
| M10 | The Last Straw | May 1926 |
| M11 | Christmas at the Mansion | December 1925 |
| M12 | A Dark and Stormy Night | Winter 1925-1926 |

---

## Clue Generation System

### Three-Phase Pipeline

```
Phase 1: PLANNING (campaign-planner.ts)
├── Select theme and solution
├── Plan elimination groups
├── Distribute across 3-act structure
└── Add red herrings and dramatic events

Phase 2: GENERATION (campaign-clue-generator.ts)
├── Convert plans to clue text
├── Apply speaker voice (Ashe vs Inspector Brown)
├── Generate narrative elements
└── Optionally enhance with AI

Phase 3: VALIDATION (campaign-validator.ts)
├── Verify solution not eliminated
├── Check coverage completeness
├── Validate narrative coherence
└── Report errors/warnings
```

### Elimination Types (17)

**Suspects:** group_alibi, individual_alibi, witness_testimony, physical_impossibility, motive_cleared

**Items:** category_secured, item_sighting, item_accounted, item_condition

**Locations:** location_inaccessible, location_undisturbed, location_occupied, location_visibility

**Times:** all_together, item_present, staff_activity, timeline_impossibility

### Difficulty Settings

| Level | Clues | Red Herrings | Events |
|-------|-------|--------------|--------|
| Beginner | 12 | 1 | 2 |
| Intermediate | 10 | 2 | 3 |
| Expert | 8 | 3 | 3 |

---

## State Management

### Client-Side Only Architecture

**All game state lives in localStorage.** The backend is stateless - it only generates scenarios on demand.

```typescript
// LocalGame structure (stored in localStorage)
{
  id: string;
  status: "setup" | "in_progress" | "solved" | "abandoned";
  theme: ThemeInfo;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;

  // The generated scenario
  scenario: GeneratedScenario;

  // Gameplay state
  currentClueIndex: number;
  phase: "setup" | "investigation";
  wrongAccusations: number;
  revealedClueIds: string[];
  actions: GameAction[];  // Event history
}
```

### Elimination Tracking

Two layers of elimination tracking:

1. **Server-calculated:** From revealed clues (read-only)
2. **Player marks:** Local UI state (not persisted)

---

## Shared Types (Frontend + Backend)

Located in `src/shared/`:

- **api-types.ts** - All request/response interfaces
- **game-elements.ts** - Display data for suspects, items, locations, times, themes

Key shared types:

```typescript
// Common enums
type GameStatus = "setup" | "in_progress" | "solved" | "abandoned";
type Difficulty = "beginner" | "intermediate" | "expert";
type ClueType = "butler" | "inspector" | "observation";

// Core interfaces
interface Solution { suspectId, itemId, locationId, timeId, names }
interface EliminationState { suspects[], items[], locations[], times[] }
interface GameAction { actor, actionType, details, timestamp }
```

---

## Development

### Tech Stack

- **Backend:** Hono, Cloudflare Workers, Workers AI (Llama 3.1 8B)
- **Frontend:** React 18, TypeScript, Tailwind CSS v4
- **Deployment:** Cloudflare Pages + Workers

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Local dev server
npm run build        # Build for production
npm run deploy       # Deploy to Cloudflare
npm run cf-typegen   # Generate Cloudflare types
```

### Testing

```bash
npm test             # Run tests (campaign-system.test.ts)
```

---

## Future Directions

### Potential Enhancements

1. **Server-side persistence** - Save games to D1/KV
2. **Multiplayer sessions** - Real-time shared game state
3. **Voice synthesis** - Inspector Brown TTS
4. **Mobile app** - PWA or native
5. **More themes** - Custom scenario creation
6. **Card scanning** - Camera-based verification

---

## Reference Documents

- `CLAUDE.md` - AI assistant instructions (comprehensive game reference)
- `CARD_SYMBOLS.md` - Symbol system documentation
- [Cluepedia - DVD Game](https://cluepedia.fandom.com/wiki/Clue_DVD_Game)
- [Hasbro Instructions](https://instructions.hasbro.com/en-us/instruction/clue-dvd-game)
