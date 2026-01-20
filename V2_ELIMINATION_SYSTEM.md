# V2 AI Generation - Elimination System

## The Key Fix: Structured Elimination Data

### The Problem You Identified

> "it has to use the answers that are generated in the story generation to make the gameplay line up with the story"

You were absolutely right! The V2 I originally built was missing the critical connection between:
1. **The strategic plan** (what each clue SHOULD eliminate)
2. **The AI-generated text** (the actual testimony/note)
3. **The game logic** (which cards to mark as eliminated)

### How It Works Now

## Step 1: Campaign Planner Creates the Strategy

The `CampaignPlan` already has the strategic elimination plan:

```typescript
{
  clues: [
    {
      position: 1,
      elimination: {
        category: "suspect",
        elementIds: ["SUSPECT01", "SUSPECT02", "SUSPECT03"],  // Miss Scarlet, Colonel Mustard, Mrs. White
        type: "group_alibi",  // They were together
        context: {
          alibiLocation: "Library",
          alibiTime: "Dinner"
        }
      },
      delivery: { type: "butler", speaker: "Ashe" }
    },
    {
      position: 2,
      elimination: {
        category: "location",
        elementIds: ["LOC03", "LOC04"],  // Kitchen, Dining Room
        type: "location_inaccessible",  // Rooms were locked
      },
      delivery: { type: "inspector_note", speaker: "Inspector Brown" }
    }
    // ... more clues
  ]
}
```

This plan says:
- **Clue 1**: Eliminate Miss Scarlet, Colonel Mustard, Mrs. White using a group alibi
- **Clue 2**: Eliminate Kitchen and Dining Room (they were inaccessible)

## Step 2: AI Generates Text That Implements the Plan

V2 now tells the AI:

```
Clue 1: Eliminate these suspects: Miss Scarlet, Colonel Mustard, Mrs. White
Using technique: group_alibi
(Example: They were all together playing cards)

Write a Butler testimony that naturally eliminates these three suspects.
```

The AI might generate:

```
"I must say, during the afternoon card games in the Library, Miss Scarlet,
Colonel Mustard, and Mrs. White were quite engrossed in their bridge tournament.
They never left the table until well after dinner was served."
```

This testimony naturally eliminates those three suspects because they were together.

## Step 3: V2 Attaches Structured Data to the Generated Text

The output includes BOTH the text AND the elimination data:

```typescript
{
  testimony: "I must say, during the afternoon card games...",
  eliminates: {
    category: "suspect",
    ids: ["SUSPECT01", "SUSPECT02", "SUSPECT03"],
    type: "group_alibi"
  }
}
```

## Step 4: Game Logic Uses the Structured Data

When the player sees this clue, the game logic can:
1. Display the testimony text to the player
2. Automatically eliminate suspects SUSPECT01, SUSPECT02, SUSPECT03 from the solution
3. Mark those cards on the deduction sheet

**The gameplay now perfectly matches the story!**

---

## Example: Full Flow

### Input (Campaign Plan)
```typescript
{
  solution: {
    suspectId: "SUSPECT05",  // Mrs. Peacock
    itemId: "ITEM04",        // Medal
    locationId: "LOC08",     // Library
    timeId: "TIME08"         // Dinner
  },
  clues: [
    // Clue 1: Eliminate 3 suspects
    {
      elimination: {
        category: "suspect",
        elementIds: ["SUSPECT01", "SUSPECT02", "SUSPECT03"],
        type: "group_alibi"
      }
    },
    // Clue 2: Eliminate 2 locations
    {
      elimination: {
        category: "location",
        elementIds: ["LOC03", "LOC04"],
        type: "location_inaccessible"
      }
    },
    // Clue 3: Eliminate 3 time periods
    {
      elimination: {
        category: "time",
        elementIds: ["TIME01", "TIME02", "TIME03"],
        type: "item_present"
      }
    }
  ]
}
```

### Stage 4: AI Generates Butler Clues

**AI Prompt:**
```
Generate 3 testimonies:

Clue 1: Eliminate Miss Scarlet, Colonel Mustard, Mrs. White
Using: group_alibi (they were together)

Clue 2: Eliminate Kitchen, Dining Room
Using: location_inaccessible (rooms locked/unavailable)

Clue 3: Eliminate Dawn, Breakfast, Late Morning
Using: item_present (item was seen during these times)
```

**AI Output:**
```json
{
  "clues": [
    {
      "testimony": "I recall Miss Scarlet, Colonel Mustard, and Mrs. White spent the entire afternoon in the Conservatory arranging flowers for the evening's decorations. They were there from lunch until just before dinner."
    },
    {
      "testimony": "The Kitchen and Dining Room were both closed all day yesterday - Mrs. White was having the floors refinished. No one could enter either room."
    },
    {
      "testimony": "During the morning hours, I was dusting the displays in the Study. All of Mr. Boddy's prized possessions were exactly where they should be - I checked each one personally."
    }
  ]
}
```

### V2 Attaches Elimination Data

```typescript
{
  clues: [
    {
      testimony: "I recall Miss Scarlet, Colonel Mustard, and Mrs. White...",
      eliminates: {
        category: "suspect",
        ids: ["SUSPECT01", "SUSPECT02", "SUSPECT03"],
        type: "group_alibi"
      }
    },
    {
      testimony: "The Kitchen and Dining Room were both closed...",
      eliminates: {
        category: "location",
        ids: ["LOC03", "LOC04"],
        type: "location_inaccessible"
      }
    },
    {
      testimony: "During the morning hours, I was dusting...",
      eliminates: {
        category: "time",
        ids: ["TIME01", "TIME02", "TIME03"],
        type: "item_present"
      }
    }
  ]
}
```

### Output (GeneratedScenario)

```typescript
{
  solution: {
    suspectId: "SUSPECT05",  // Mrs. Peacock (NOT eliminated)
    itemId: "ITEM04",
    locationId: "LOC08",     // Library (NOT eliminated)
    timeId: "TIME08"         // Dinner (NOT eliminated)
  },
  clues: [
    {
      id: "clue-1",
      position: 1,
      type: "butler",
      speaker: "Ashe",
      text: "I recall Miss Scarlet, Colonel Mustard, and Mrs. White...",
      eliminates: {
        category: "suspect",
        ids: ["SUSPECT01", "SUSPECT02", "SUSPECT03"],  // ← Game logic uses this!
        reason: "group_alibi"
      }
    },
    // ... more clues
  ]
}
```

### Game Logic Can Now:

1. **Display clue text**: Show Ashe's testimony to players
2. **Process elimination**: Mark Miss Scarlet, Colonel Mustard, Mrs. White as eliminated
3. **Verify logic**: Check that the solution suspect (Mrs. Peacock) is NOT in the eliminated list
4. **Track deduction**: Update the deduction sheet automatically

**Everything is connected!**

---

## Key Differences from V1

### V1 (Old)
```typescript
// V1 just had a hint string
{
  testimony: "Butler says something...",
  eliminatesHint: "Eliminates some suspects"  // ← Useless for game logic!
}
```

The game couldn't process this! It didn't know WHICH suspects.

### V2 (New)
```typescript
// V2 has structured elimination data
{
  testimony: "Butler says something...",
  eliminates: {
    category: "suspect",
    ids: ["SUSPECT01", "SUSPECT02"],  // ← Game can use this!
    type: "group_alibi"
  }
}
```

The game knows EXACTLY which suspects to eliminate.

---

## Validation Benefits

### Automatic Solution Protection

V2 can now validate that the AI never accidentally eliminates the solution:

```typescript
function validateClue(clue, solution) {
  if (clue.eliminates.category === "suspect") {
    if (clue.eliminates.ids.includes(solution.suspectId)) {
      throw new Error("AI eliminated the solution suspect!");
    }
  }
  // Same for items, locations, times...
}
```

### Verification

After generation, V2 can verify:
- ✅ All non-solution elements are eventually eliminated
- ✅ The solution is never eliminated
- ✅ Each clue eliminates what it's supposed to
- ✅ No contradictions in the elimination logic

---

## How to Use This Data in Your Frontend

### Display the Clue
```typescript
function showClue(clue) {
  // Show the text to players
  displayText(clue.text);
  displaySpeaker(clue.speaker);

  // Let players deduce OR auto-eliminate (depending on game mode)
  if (autoEliminateMode) {
    eliminateElements(clue.eliminates.ids);
  }
}
```

### Process Elimination
```typescript
function eliminateElements(ids: string[]) {
  ids.forEach(id => {
    // Mark card as eliminated in deduction tracker
    deductionSheet.mark(id, "eliminated");

    // Update UI
    updateDeductionUI();
  });
}
```

### Check Solution
```typescript
function checkAccusation(playerGuess) {
  // Compare against the structured solution data
  return (
    playerGuess.suspectId === scenario.solution.suspectId &&
    playerGuess.itemId === scenario.solution.itemId &&
    playerGuess.locationId === scenario.solution.locationId &&
    playerGuess.timeId === scenario.solution.timeId
  );
}
```

---

## Summary

The V2 fix ensures:

1. ✅ **Campaign Planner** decides WHAT to eliminate
2. ✅ **AI** writes HOW to eliminate it (the story)
3. ✅ **V2** attaches WHICH IDs are eliminated (structured data)
4. ✅ **Game Logic** processes the eliminations correctly
5. ✅ **Story and gameplay are perfectly aligned**

This is the critical fix you identified! The elimination data now flows from strategy → narrative → gameplay seamlessly.
