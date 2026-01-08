/**
 * Clue DVD Game (2006) - AI Context System
 *
 * This file provides grounding context for AI generation.
 * The AI can be CREATIVE with dialog and atmosphere, but must be ACCURATE with:
 * - Character names and roles
 * - Item names and categories
 * - Location names and features
 * - Time periods
 * - Game mechanics
 *
 * This context is injected into AI prompts to prevent hallucination.
 */

import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS, MYSTERY_THEMES } from "./game-elements";
import { NPCS, GAME_SETTING, SECRET_PASSAGES, SPECIAL_LOCATIONS } from "./game-constants";

// ============================================
// CORE CONTEXT (Always included in prompts)
// ============================================

export const CORE_GAME_CONTEXT = `
## CLUE DVD GAME (2006) - FACTUAL CONTEXT

This is the 2006 Clue DVD Game, NOT classic Clue. Critical differences:
- Crime: THEFT of valuable items (NOT murder)
- 4 categories: WHO stole WHAT from WHERE at WHEN
- Setting: Tudor Mansion, England, 1920s (September 1925 - May 1926)
- Host: Mr. Boddy (victim of theft, owns the mansion)
- Key NPCs: Inspector Brown (Scotland Yard), Ashe (the butler)

### RULES FOR AI GENERATION:
1. ONLY use the exact names listed below - never invent characters, items, or locations
2. All 10 suspects are GUESTS at Mr. Boddy's gatherings (except Mrs. White and Rusty who work there)
3. Items are VALUABLE COLLECTIBLES, not weapons
4. The crime is always THEFT, never murder or violence
5. Maintain 1920s British atmosphere and language
`;

// ============================================
// CHARACTER CONTEXT
// ============================================

export function getSuspectContext(): string {
  const suspectDetails = SUSPECTS.map((s) =>
    `- **${s.displayName}** (${s.role}): ${s.description}. Traits: ${s.traits.join(", ")}.`
  ).join("\n");

  return `
## THE 10 SUSPECTS (Use ONLY these names)

${suspectDetails}

### CHARACTER NOTES:
- Mrs. White is the housekeeper - she has access to all rooms
- Rusty (full name: Rusty Nayler) is the gardener - knows outdoor areas intimately
- Mrs. Meadow-Brook's late husband was Mr. Boddy's solicitor - she knows his secrets
- Prince Azure deals in art and arms - has international connections
- Lady Lavender is rumored to have poisoned her husband Sir Laurence
- The classic 6 (Scarlet, Mustard, White, Green, Peacock, Plum) are long-time acquaintances
- The new 4 (Meadow-Brook, Azure, Lavender, Rusty) are more recent additions to Mr. Boddy's circle
`;
}

export function getNPCContext(): string {
  return `
## NON-PLAYABLE CHARACTERS (NPCs)

- **Inspector Brown**: Scotland Yard detective called in to investigate. Methodical, observant, speaks with authority. Delivers "Inspector's Notes" clues.
- **Ashe**: Mr. Boddy's trusted butler for decades. Knows all the mansion's secrets and the guests' habits. Delivers "Butler Testimony" clues. Speaks formally, respectfully.
- **Mr. Boddy**: The wealthy host and victim of the theft. Owns Tudor Mansion and an extensive collection of valuables. (Called "Dr. Black" in UK version)

### SPEAKING STYLES:
- Inspector Brown: Formal, detective vocabulary, "I observed...", "The evidence suggests...", "Most curious..."
- Ashe: Deferential, proper butler speech, "If I may say, sir...", "I happened to notice...", "The master's collection..."
`;
}

// ============================================
// ITEM CONTEXT
// ============================================

export function getItemContext(): string {
  const itemDetails = ITEMS.map((i) =>
    `- **${i.nameUS}** (${i.category}): ${i.description}`
  ).join("\n");

  return `
## THE 11 STOLEN ITEMS (Use ONLY these names)

${itemDetails}

### ITEM CATEGORIES:
- **Antiques** (4): Spyglass, Revolver, Rare Book, Medal - historical/collectible items
- **Desk Items** (4): Billfold, Gold Pen, Letter Opener, Crystal Paperweight - office accessories
- **Jewelry** (3): Pocket Watch, Jade Hairpin, Scarab Brooch - wearable valuables

### IMPORTANT:
- These are VALUABLES from Mr. Boddy's collection, NOT weapons
- The Revolver is an antique collectible, not used for violence
- Items may have sentimental value (Medal was a gift from Dr. Black, Mr. Boddy's uncle)
`;
}

// ============================================
// LOCATION CONTEXT
// ============================================

export function getLocationContext(): string {
  const indoorRooms = LOCATIONS.filter(l => l.type === "indoor").map((l) => {
    const passage = l.secretPassageTo ? ` (secret passage to ${l.secretPassageTo})` : "";
    return `- **${l.name}**: ${l.description}${passage}`;
  }).join("\n");

  const outdoorLocations = LOCATIONS.filter(l => l.type === "outdoor").map((l) =>
    `- **${l.name}**: ${l.description}`
  ).join("\n");

  return `
## THE 11 LOCATIONS (Use ONLY these names)

### Indoor Rooms (9):
${indoorRooms}

### Outdoor Locations (2):
${outdoorLocations}

### Special Location:
- **Evidence Room**: Center of the mansion, where players gather. NOT a theft location.

### SECRET PASSAGES:
- Lounge ↔ Conservatory
- Kitchen ↔ Study

### LOCATION NOTES:
- The Hall is the grand entrance, central to the mansion
- The Study is Mr. Boddy's private office where he keeps valuables
- The Library houses his rare book collection
- Outdoor locations (Rose Garden, Fountain) require good weather/lighting
`;
}

// ============================================
// TIME CONTEXT
// ============================================

export function getTimeContext(): string {
  const timeDetails = TIME_PERIODS.map((t) =>
    `- **${t.name}** (${t.hourRange}): ${t.typicalActivities.join(", ")}. Light: ${t.lightCondition}`
  ).join("\n");

  return `
## THE 10 TIME PERIODS (Use ONLY these names)

${timeDetails}

### TIME NOTES:
- Dawn and Dusk are transitional (changing light)
- Night and Midnight are dark (requires candles/lamps)
- Breakfast through Tea Time are daylight hours
- Staff (Mrs. White, Rusty, Ashe) are most active at Dawn and Breakfast
- Formal gatherings happen at Dinner
- Late activities (cards, drinks) occur at Night
`;
}

// ============================================
// THEME CONTEXT
// ============================================

export function getThemeContext(): string {
  const themeDetails = MYSTERY_THEMES.map((t) =>
    `- **${t.name}** (${t.period}): ${t.description}. Atmosphere: ${t.atmosphericElements.join(", ")}`
  ).join("\n");

  return `
## THE 12 MYSTERY THEMES

${themeDetails}

### THEME NOTES:
- Each theme suggests a reason for the gathering
- Themes affect which rooms might be locked (outdoor areas locked in winter themes)
- The theme sets the mood but doesn't change the core mystery mechanics
`;
}

// ============================================
// CLUE GENERATION CONTEXT
// ============================================

export function getClueContext(): string {
  return `
## CLUE GENERATION RULES

Clues work by ELIMINATION - they rule OUT possibilities, narrowing down the solution.

### CLUE TYPES:
1. **Butler Testimony** (Ashe): Public clues spoken to all players
   - "I overheard [suspects] arguing in the [location]..." → Eliminates those suspects
   - "By [time], all [category] items were secured..." → Eliminates those items

2. **Inspector's Notes** (Inspector Brown): Private clues read individually
   - "[Suspect] never left the [location] during [time]..." → Gives alibi, eliminates suspect
   - "The [location] was locked all weekend..." → Eliminates that location

3. **Observations**: Things noticed during investigation
   - "The display case in [location] was undisturbed..." → Eliminates that location
   - "The [item] was seen after [time]..." → Eliminates that item

### CRITICAL RULES:
1. Clues must NEVER eliminate the actual solution
2. Clues should be solvable - give players enough to deduce the answer
3. Clues must reference ONLY the exact names from the game data
4. Clues should fit the speaker's voice (Ashe: formal butler, Brown: detective)
`;
}

// ============================================
// FULL CONTEXT BUILDER
// ============================================

export interface AIContextOptions {
  includeSuspects?: boolean;
  includeItems?: boolean;
  includeLocations?: boolean;
  includeTimes?: boolean;
  includeThemes?: boolean;
  includeNPCs?: boolean;
  includeClueRules?: boolean;
}

export function buildAIContext(options: AIContextOptions = {}): string {
  const {
    includeSuspects = true,
    includeItems = true,
    includeLocations = true,
    includeTimes = true,
    includeThemes = false,
    includeNPCs = true,
    includeClueRules = false,
  } = options;

  let context = CORE_GAME_CONTEXT;

  if (includeNPCs) context += getNPCContext();
  if (includeSuspects) context += getSuspectContext();
  if (includeItems) context += getItemContext();
  if (includeLocations) context += getLocationContext();
  if (includeTimes) context += getTimeContext();
  if (includeThemes) context += getThemeContext();
  if (includeClueRules) context += getClueContext();

  return context;
}

// ============================================
// COMPACT CONTEXT (For token-limited prompts)
// ============================================

export function getCompactContext(): string {
  const suspectNames = SUSPECTS.map(s => s.displayName).join(", ");
  const itemNames = ITEMS.map(i => i.nameUS).join(", ");
  const locationNames = LOCATIONS.map(l => l.name).join(", ");
  const timeNames = TIME_PERIODS.map(t => t.name).join(", ");

  return `
## CLUE DVD GAME (2006) - QUICK REFERENCE

Setting: Tudor Mansion, England, 1920s. Crime: THEFT (not murder).

SUSPECTS (10): ${suspectNames}
ITEMS (11): ${itemNames}
LOCATIONS (11): ${locationNames}
TIMES (10): ${timeNames}
NPCs: Inspector Brown (detective), Ashe (butler), Mr. Boddy (victim)

RULES: Use ONLY these exact names. Crime is always theft of valuables.
`;
}

// ============================================
// SOLUTION-SPECIFIC CONTEXT
// ============================================

export function getSolutionContext(
  suspectId: string,
  itemId: string,
  locationId: string,
  timeId: string
): string {
  const suspect = SUSPECTS.find(s => s.id === suspectId);
  const item = ITEMS.find(i => i.id === itemId);
  const location = LOCATIONS.find(l => l.id === locationId);
  const time = TIME_PERIODS.find(t => t.id === timeId);

  if (!suspect || !item || !location || !time) {
    return "ERROR: Invalid solution IDs provided.";
  }

  return `
## THE SOLUTION (CONFIDENTIAL - For AI generation only)

- **WHO**: ${suspect.displayName} (${suspect.role}) - ${suspect.description}
- **WHAT**: ${item.nameUS} (${item.category}) - ${item.description}
- **WHERE**: ${location.name} - ${location.description}
- **WHEN**: ${time.name} (${time.hourRange}) - Light: ${time.lightCondition}

### MOTIVE CONSIDERATIONS:
- ${suspect.displayName}'s traits: ${suspect.traits.join(", ")}
- The ${item.nameUS} is a ${item.category} item
- The ${location.name} would provide ${location.type === "indoor" ? "privacy" : "outdoor access"}
- ${time.name} has ${time.lightCondition} lighting - ${time.typicalActivities.join(", ")}
`;
}

// ============================================
// BUTLER TESTIMONY TEMPLATES
// ============================================

export const BUTLER_TESTIMONY_TEMPLATES = [
  // Eliminates suspects (group alibi)
  {
    template: "I happened to notice {suspect1}, {suspect2}, and {suspect3} engaged in a rather animated discussion in the {location}. They were together the entire time, I assure you.",
    eliminates: "suspects",
    placeholders: ["suspect1", "suspect2", "suspect3", "location"],
  },
  // Eliminates item category
  {
    template: "The master had me secure all the {category} items before retiring. I personally verified each piece was in its proper place by {time}.",
    eliminates: "items_by_category",
    placeholders: ["category", "time"],
  },
  // Eliminates specific suspect
  {
    template: "I served {suspect} tea in the {location} at {time}. They remained there for quite some time, absorbed in conversation.",
    eliminates: "suspect",
    placeholders: ["suspect", "location", "time"],
  },
  // Eliminates location (weather)
  {
    template: "The outdoor areas were quite inaccessible during {time}, I'm afraid. The weather was simply dreadful.",
    eliminates: "outdoor_locations",
    placeholders: ["time"],
  },
];

// ============================================
// INSPECTOR NOTE TEMPLATES
// ============================================

export const INSPECTOR_NOTE_TEMPLATES = [
  // Eliminates suspect (alibi)
  {
    template: "{suspect} could not have committed the theft. Multiple witnesses place them in the {location} during the critical time.",
    eliminates: "suspect",
    placeholders: ["suspect", "location"],
  },
  // Eliminates location
  {
    template: "My investigation of the {location} revealed no signs of disturbance. The crime did not occur there.",
    eliminates: "location",
    placeholders: ["location"],
  },
  // Eliminates time
  {
    template: "The item was confirmed present during {time}. The theft occurred afterward.",
    eliminates: "time_before",
    placeholders: ["time"],
  },
  // Eliminates item
  {
    template: "The {item} has been accounted for. It was not the stolen object.",
    eliminates: "item",
    placeholders: ["item"],
  },
];
