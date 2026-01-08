# Mystery Campaign Architecture Implementation Plan

> **Purpose**: Replace random clue generation with a narrative-driven, pre-planned campaign system for coherent, engaging mysteries.

> **Context**: The web app replaces the DVD as game master. Players still use physical components (board, cards, magnifying glass). The original DVD content (Inspector Brown's voice, Ashe's testimonies, theme narratives) informs the AI-generated content.

---

## Executive Summary

The current scenario generator creates clues mechanically and shuffles them randomly. This plan implements a **3-phase campaign system**:

1. **Phase 1: Strategic Planning** - Plan WHAT to eliminate, in WHAT order, with WHAT pacing
2. **Phase 2: Clue Generation** - Generate clue text FROM the strategic plan
3. **Phase 3: Validation** - Ensure solvability and narrative coherence

**Key Outcomes**:
- Clues tell a coherent story across 3 narrative acts
- Red herrings actually implemented (currently just defined but unused)
- Dramatic events tied to narrative beats
- Mathematical guarantee all 38 non-solution elements can be eliminated
- No database dependencies - stateless, simpler architecture

---

## Implementation Tasks

### Phase A: Core Campaign System

#### Task 1: Create `src/services/seeded-random.ts`
Extract and enhance the SeededRandom class:
```typescript
export class SeededRandom {
  constructor(seed?: number)
  next(): number           // 0-1 float
  nextInt(min: number, max: number): number  // NEW: integer range
  pick<T>(array: T[]): T
  pickMultiple<T>(array: T[], count: number): T[]
  shuffle<T>(array: T[]): T[]
}
```

#### Task 2: Create `src/types/campaign.ts`
Define all campaign types:
```typescript
// Core types
export type NarrativeAct = "act1_setup" | "act2_confrontation" | "act3_resolution"

export type EliminationType =
  // Suspect (5)
  | "group_alibi" | "individual_alibi" | "witness_testimony"
  | "physical_impossibility" | "motive_cleared"
  // Item (4)
  | "category_secured" | "item_sighting" | "item_accounted" | "item_condition"
  // Location (4)
  | "location_inaccessible" | "location_undisturbed"
  | "location_occupied" | "location_visibility"
  // Time (4)
  | "all_together" | "item_present" | "staff_activity" | "timeline_impossibility"

export interface EliminationGroup {
  index: number
  elementIds: string[]
  eliminationType: EliminationType
  targetAct: NarrativeAct
  priority: number
}

export interface PlannedClue {
  position: number
  act: NarrativeAct
  elimination: {
    category: "suspect" | "item" | "location" | "time"
    groupIndex: number
    elementIds: string[]
    type: EliminationType
  }
  delivery: {
    type: "butler" | "inspector_note" | "observation"
    speaker: "Ashe" | "Inspector Brown"
  }
  narrative: {
    references?: number[]
    threadId?: string
    tone: "establishing" | "developing" | "escalating" | "revealing"
  }
  text?: string
}

export interface NarrativeThread {
  id: string
  name: string
  involvedElements: { suspects?: string[]; items?: string[]; locations?: string[]; times?: string[] }
  clueIndices: number[]
  isRedHerring: boolean
}

export interface RedHerring {
  type: "false_suspicion" | "misleading_evidence" | "suspicious_behavior"
  target: { category: string; elementId: string }
  introducedInClue: number
  resolvedInClue?: number
}

export interface PlannedDramaticEvent {
  afterClue: number
  eventType: string
  involvedSuspects: string[]
  purpose: "tension" | "misdirection" | "revelation" | "atmosphere"
}

export interface CampaignPlan {
  id: string
  solution: { suspectId: string; itemId: string; locationId: string; timeId: string }
  themeId: string
  difficulty: "beginner" | "intermediate" | "expert"
  eliminationPlans: {
    suspects: CategoryEliminationPlan
    items: CategoryEliminationPlan
    locations: CategoryEliminationPlan
    times: CategoryEliminationPlan
  }
  narrativeArc: { act1: ActInfo; act2: ActInfo; act3: ActInfo }
  clues: PlannedClue[]
  threads: NarrativeThread[]
  redHerrings: RedHerring[]
  dramaticEvents: PlannedDramaticEvent[]
  validation: ValidationResult
}
```

#### Task 3: Create `src/data/campaign-settings.ts`
Define difficulty-specific settings:
```typescript
export const CAMPAIGN_SETTINGS = {
  beginner: {
    clueCount: 12,
    actDistribution: { act1: 4, act2: 5, act3: 3 },
    redHerrings: { count: 1, mustResolve: true },
    dramaticEventCount: 2,
    maxGroupSize: { suspects: 4, items: 4, locations: 3, times: 3 }
  },
  intermediate: {
    clueCount: 10,
    actDistribution: { act1: 3, act2: 4, act3: 3 },
    redHerrings: { count: 2, mustResolve: false },
    dramaticEventCount: 3,
    maxGroupSize: { suspects: 3, items: 3, locations: 3, times: 3 }
  },
  expert: {
    clueCount: 8,
    actDistribution: { act1: 2, act2: 4, act3: 2 },
    redHerrings: { count: 3, mustResolve: false },
    dramaticEventCount: 3,
    maxGroupSize: { suspects: 2, items: 2, locations: 2, times: 2 }
  }
}
```

#### Task 4: Create `src/services/campaign-planner.ts`
Implement Phase 1 strategic planning:
```typescript
export function planCampaign(request: GenerateCampaignRequest): CampaignPlan {
  // 1. Select solution (WHO/WHAT/WHERE/WHEN)
  // 2. Plan eliminations for each category (group non-solution elements)
  // 3. Distribute groups across acts (large→Act1, single→Act3)
  // 4. Plan narrative threads
  // 5. Plan red herrings (introduce Act2, optionally resolve Act3)
  // 6. Sequence clues with references and tone
  // 7. Plan dramatic events at narrative beats
  // 8. Validate the plan
}
```

Key algorithms:
- **Group sizing**: Vary 1 to maxGroupSize, ensuring all 38 elements covered
- **Act assignment**: Large groups (3+)→Act1, single→Act3, rest→Act2
- **Clue sequencing**: Order by act, then priority, assign tone based on position
- **Thread creation**: "True Timeline", "Alibi Network", "Item Trail"

#### Task 5: Create `src/services/campaign-clue-generator.ts`
Implement Phase 2 clue text generation:
```typescript
export function generateClueTexts(plan: CampaignPlan): Clue[] {
  // For each planned clue:
  // 1. Get element names from IDs
  // 2. Build reference prefix if referencing earlier clues
  // 3. Select template based on elimination type
  // 4. Fill template with speaker-appropriate voice
}
```

17 elimination type templates:
| Type | Template Pattern |
|------|------------------|
| `group_alibi` | "X, Y, and Z were together in the [location]..." |
| `individual_alibi` | "X never left the [location] during [time]..." |
| `category_secured` | "All [category] items were locked up by [time]..." |
| `item_sighting` | "The [item] was spotted in [location] after theft..." |
| `location_inaccessible` | "The [location] was being renovated..." |
| `all_together` | "During [time], all guests were gathered..." |
| ... | (see full list in types) |

#### Task 6: Create `src/services/campaign-validator.ts`
Implement Phase 3 validation:
```typescript
export function validateCampaign(plan: CampaignPlan): ValidationResult {
  // Check: Solution never eliminated
  // Check: All 38 non-solution elements appear exactly once
  // Check: Act distribution matches settings
  // Check: Red herrings don't block solution
}
```

---

### Phase B: Integration

#### Task 7: Rewrite `src/services/scenario-generator.ts`
Replace random generation with campaign pipeline:
```typescript
export function generateScenario(request): Scenario {
  const plan = planCampaign(request)
  const clues = generateClueTexts(plan)
  const narrative = generateNarrative(plan)
  return { ...plan, clues, narrative }
}
```

#### Task 8: Simplify `src/types/scenario.ts`
Remove redundant types, use campaign types where appropriate.

#### Task 9: Update `src/index.ts`
- Remove database-dependent game session endpoints
- Keep: `/api/scenarios/generate`, `/api/suspects`, `/api/items`, etc.
- Frontend handles game state locally

---

### Phase C: Cleanup & Refinement

#### Task 10-11: Consolidate AI services
| File | Action |
|------|--------|
| `src/services/ai-game-narrator.ts` | Keep - handles game-specific AI narration |
| `src/services/ai-narrative.ts` | Keep - handles scenario narrative generation |

#### Task 12: Simplify setup-generator.ts
- Keep symbol lookup functions (`getSymbolsForCard`, `findCardBySymbol`)
- Remove unnecessary abstractions (setupType distinction)

#### Task 13: Frontend integration
The React frontend is already built with:
- Game creation with theme/difficulty/player count selection
- Solution card symbol display for physical mirroring
- AI-enhanced clue reveal and accusation handling

---

## Act Structure Reference

| Act | Name | Focus | Clue Types | Tone |
|-----|------|-------|------------|------|
| 1 | Setup | Scene-setting, easy eliminations | category_secured, location_inaccessible, all_together | Establishing |
| 2 | Confrontation | Complications, red herrings, narrowing | group_alibi, item_sighting, witness_testimony | Developing → Escalating |
| 3 | Resolution | Decisive clues enabling solution | individual_alibi, timeline_impossibility | Revealing |

---

## Mathematical Coverage

**Non-solution elements**: 9 suspects + 10 items + 10 locations + 9 times = **38 total**

| Difficulty | Clues | Elements/Clue | Max Group |
|------------|-------|---------------|-----------|
| Beginner | 12 | ~3.2 | 4 |
| Intermediate | 10 | ~3.8 | 3 |
| Expert | 8 | ~4.75 | 2 |

---

## Verification Checklist

After implementation, verify:

- [ ] `planCampaign()` produces valid plans for all 3 difficulties
- [ ] Solution is NEVER in any elimination group
- [ ] All 38 non-solution elements appear in exactly one group
- [ ] Act distribution matches settings
- [ ] Clues read in order tell a coherent story
- [ ] Act 1 clues are scene-setting (large groups, easy eliminations)
- [ ] Act 3 clues are decisive (single elements, definitive)
- [ ] Red herrings introduce misdirection without blocking solution
- [ ] Dramatic events trigger at narrative beats
- [ ] API returns valid scenario JSON
- [ ] Frontend can consume new API

### Test Commands
```bash
# Start dev server
npm run dev

# Generate scenarios
curl -X POST http://localhost:8787/api/scenarios/generate \
  -H "Content-Type: application/json" \
  -d '{"difficulty": "beginner"}'

curl -X POST http://localhost:8787/api/scenarios/generate \
  -H "Content-Type: application/json" \
  -d '{"difficulty": "expert", "theme": "T04"}'
```

---

## Notes for Implementation

1. **Start with seeded-random.ts** - Other files depend on it
2. **Types before implementation** - Define campaign.ts fully before planner
3. **Test planner in isolation** - Verify plans before generating text
4. **Keep AI integration** - Campaign plan provides better context for AI enhancement
5. **Frontend last** - Backend should work standalone first
