/**
 * Clue DVD Game - Campaign Clue Generator
 *
 * Phase 2: Clue Text Generation
 *
 * Converts the strategic campaign plan into actual clue text.
 * Each clue is generated based on:
 * - Elimination type (17 different mechanisms)
 * - Speaker voice (Ashe vs Inspector Brown)
 * - Narrative tone (establishing/developing/escalating/revealing)
 * - References to earlier clues
 */

import { SeededRandom } from "./seeded-random";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
  type Suspect,
  type Item,
  type Location,
  type TimePeriod,
  type MysteryTheme,
} from "../data/game-elements";
import { SPECIAL_LOCATIONS } from "../data/game-constants";
import type {
  CampaignPlan,
  PlannedClue,
  GeneratedClue,
  GeneratedScenario,
  GeneratedDramaticEvent,
  EliminationType,
  ClueSpeaker,
  ClueTone,
} from "../types/campaign";

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Generate complete scenario from campaign plan
 */
export function generateScenarioFromPlan(plan: CampaignPlan): GeneratedScenario {
  const rng = new SeededRandom(plan.seed);
  const theme = MYSTERY_THEMES.find(t => t.id === plan.themeId) || MYSTERY_THEMES[0];
  const blockedNames = new Set(
    SPECIAL_LOCATIONS.filter((location) => !location.isPlayableLocation).map(
      (location) => location.name
    )
  );
  const lockedRooms = theme.typicalLockedRooms
    .filter((roomName) => !blockedNames.has(roomName))
    .map((roomName) => LOCATIONS.find((location) => location.name === roomName)?.id)
    .filter((id): id is string => Boolean(id));

  // Generate clue texts
  const clues = generateAllClues(rng, plan);

  // Generate dramatic event descriptions
  const dramaticEvents = generateDramaticEventDescriptions(rng, plan, theme);

  // Generate inspector notes (private, turn-based)
  const inspectorNotes = generateInspectorNotes(rng, plan);

  // Generate narrative elements
  const narrative = generateNarrativeElements(plan, theme);

  return {
    id: `SCN-${Date.now().toString(36)}-${rng.nextInt(1000, 9999)}`,
    campaignId: plan.id,
    theme: {
      id: theme.id,
      name: theme.name,
      description: theme.description,
    },
    solution: plan.solution,
    clues,
    dramaticEvents,
    lockedRooms,
    inspectorNotes,
    narrative,
    metadata: {
      difficulty: plan.difficulty,
      totalClues: clues.length,
      seed: plan.seed,
      createdAt: new Date().toISOString(),
      version: "2.0.0",
    },
  };
}

// ============================================
// CLUE TEXT GENERATION
// ============================================

function generateAllClues(rng: SeededRandom, plan: CampaignPlan): GeneratedClue[] {
  const generatedClues: GeneratedClue[] = [];

  for (const plannedClue of plan.clues) {
    const text = generateClueText(rng, plannedClue, plan, generatedClues);

    generatedClues.push({
      id: `C${String(plannedClue.position).padStart(3, "0")}`,
      position: plannedClue.position,
      type: plannedClue.delivery.type,
      speaker: plannedClue.delivery.speaker,
      text,
      act: plannedClue.act,
      eliminates: {
        category: plannedClue.elimination.category,
        ids: plannedClue.elimination.elementIds,
        reason: getEliminationReason(plannedClue.elimination.type, plannedClue.elimination.elementIds),
      },
    });
  }

  return generatedClues;
}

function generateClueText(
  rng: SeededRandom,
  clue: PlannedClue,
  plan: CampaignPlan,
  previousClues: GeneratedClue[]
): string {
  // Get element names
  const elementNames = getElementNames(clue.elimination.category, clue.elimination.elementIds);

  // Build reference prefix if this clue references earlier ones
  const referencePrefix = buildReferencePrefix(clue, previousClues);

  // Generate the core clue text based on elimination type
  const coreText = generateCoreClueText(
    rng,
    clue.elimination.type,
    elementNames,
    clue.elimination.context,
    plan
  );

  // Apply speaker voice
  const voicedText = applySpeakerVoice(rng, coreText, clue.delivery.speaker, clue.narrative.tone);

  // Combine reference prefix with voiced text
  return referencePrefix ? `${referencePrefix} ${voicedText}` : voicedText;
}

function getElementNames(category: string, ids: string[]): string[] {
  switch (category) {
    case "suspect":
      return ids.map(id => SUSPECTS.find(s => s.id === id)?.displayName || id);
    case "item":
      return ids.map(id => ITEMS.find(i => i.id === id)?.nameUS || id);
    case "location":
      return ids.map(id => LOCATIONS.find(l => l.id === id)?.name || id);
    case "time":
      return ids.map(id => TIME_PERIODS.find(t => t.id === id)?.name || id);
    default:
      return ids;
  }
}

function buildReferencePrefix(clue: PlannedClue, previousClues: GeneratedClue[]): string {
  if (!clue.narrative.references || clue.narrative.references.length === 0) {
    return "";
  }

  const refPrefixes = [
    "Building on what we've learned,",
    "As the investigation continues,",
    "Following up on earlier findings,",
    "In connection with previous evidence,",
    "Adding to our understanding,",
  ];

  // Simple reference - just use a transition phrase
  return refPrefixes[clue.position % refPrefixes.length];
}

// ============================================
// CORE CLUE TEXT BY ELIMINATION TYPE
// ============================================

function generateCoreClueText(
  rng: SeededRandom,
  eliminationType: EliminationType,
  elementNames: string[],
  context: PlannedClue["elimination"]["context"],
  plan: CampaignPlan
): string {
  // Get context elements
  const alibiLocation = context?.alibiLocation
    ? LOCATIONS.find(l => l.id === context.alibiLocation)?.name
    : rng.pick(LOCATIONS).name;
  const alibiTime = context?.alibiTime
    ? TIME_PERIODS.find(t => t.id === context.alibiTime)?.name
    : rng.pick(TIME_PERIODS).name;
  const itemCategory = context?.itemCategory || rng.pick(["antique", "desk", "jewelry"]);

  // Get solution item for reference
  const solutionItem = ITEMS.find(i => i.id === plan.solution.itemId);
  const solutionTime = TIME_PERIODS.find(t => t.id === plan.solution.timeId);

  switch (eliminationType) {
    // ========== SUSPECT ELIMINATION TYPES ==========
    case "group_alibi":
      if (elementNames.length === 1) {
        return `${elementNames[0]} was with several other guests in the ${alibiLocation} during ${alibiTime}. They couldn't have slipped away unnoticed.`;
      } else if (elementNames.length === 2) {
        return `${elementNames[0]} and ${elementNames[1]} were together in the ${alibiLocation} during ${alibiTime}, alibied by each other and the servants.`;
      } else {
        const last = elementNames.pop();
        return `${elementNames.join(", ")}, and ${last} were gathered in the ${alibiLocation} throughout ${alibiTime}. None could have acted alone.`;
      }

    case "individual_alibi":
      return `${elementNames[0]} never left the ${alibiLocation} between ${alibiTime} and the following hour. Multiple witnesses can confirm this.`;

    case "witness_testimony":
      if (elementNames.length === 1) {
        return `Several guests reported seeing ${elementNames[0]} in the ${alibiLocation} at the critical moment. The testimony is consistent.`;
      } else {
        return `Witnesses confirm that ${elementNames.join(" and ")} were both seen elsewhere during the theft. Their whereabouts are accounted for.`;
      }

    case "physical_impossibility":
      const injuries = ["injured their hand earlier", "had a twisted ankle", "was feeling unwell", "had been drinking heavily"];
      return `${elementNames[0]} had ${rng.pick(injuries)} that day. They physically couldn't have managed the theft.`;

    case "motive_cleared":
      return `${elementNames[0]} had no reason to steal the ${solutionItem?.nameUS || "item"}. In fact, Mr. Boddy had already promised it to them as a gift.`;

    // ========== ITEM ELIMINATION TYPES ==========
    case "category_secured":
      const categoryItems = ITEMS.filter(i => i.category === itemCategory)
        .map(i => i.nameUS)
        .filter(name => elementNames.includes(name));
      if (categoryItems.length > 0) {
        return `By the time the staff retired after ${alibiTime}, all ${itemCategory} items had been locked in the display case. This includes the ${categoryItems.slice(0, 3).join(", ")}.`;
      }
      return `All ${itemCategory} items were secured and accounted for by ${alibiTime}.`;

    case "item_sighting":
      const laterTime = TIME_PERIODS.find(t =>
        t.order > (solutionTime?.order || 5)
      )?.name || "later that evening";
      return `The ${elementNames[0]} was spotted in the ${alibiLocation} during ${laterTime}, well after the theft must have occurred.`;

    case "item_accounted":
      return `The ${elementNames[0]} has been located and verified as untouched. It remains exactly where it was placed.`;

    case "item_condition":
      return `The display case containing the ${elementNames[0]} shows no signs of tampering. The dust pattern is undisturbed.`;

    // ========== LOCATION ELIMINATION TYPES ==========
    case "location_inaccessible":
      const reasons = [
        "was being renovated",
        "had been sealed off for cleaning",
        "was locked due to water damage",
        "had the furniture being moved",
      ];
      return `The ${elementNames[0]} ${rng.pick(reasons)} and no one could enter it all weekend.`;

    case "location_undisturbed":
      return `Upon inspection, the ${elementNames[0]} appears completely undisturbed. Not a speck of dust was moved, no signs of any theft.`;

    case "location_occupied":
      return `The ${elementNames[0]} was continuously occupied throughout ${alibiTime}. Someone was always present.`;

    case "location_visibility":
      return `Staff were in and out of the ${elementNames[0]} all evening. Any suspicious activity would have been noticed immediately.`;

    // ========== TIME ELIMINATION TYPES ==========
    case "all_together":
      return `During ${elementNames[0]}, all guests were gathered in the ${alibiLocation}. No one left for even a moment—it would have been noticed.`;

    case "item_present":
      return `I personally verified the ${solutionItem?.nameUS || "item"} was still in its place during ${elementNames[0]}. The theft must have occurred later.`;

    case "staff_activity":
      return `During ${elementNames[0]}, the entire staff was about their duties throughout the mansion. Any suspicious activity would have been spotted.`;

    case "timeline_impossibility":
      return `The timeline rules out ${elementNames[0]} entirely. Based on when the item was last seen and when it was discovered missing, this period is impossible.`;

    default:
      return `Evidence suggests that ${elementNames.join(", ")} can be eliminated from suspicion.`;
  }
}

// ============================================
// SPEAKER VOICE APPLICATION
// ============================================

function applySpeakerVoice(
  rng: SeededRandom,
  text: string,
  speaker: ClueSpeaker,
  tone: ClueTone
): string {
  if (speaker === "Ashe") {
    return applyAsheVoice(rng, text, tone);
  } else {
    return applyInspectorVoice(rng, text, tone);
  }
}

function applyAsheVoice(rng: SeededRandom, text: string, tone: ClueTone): string {
  const prefixes: Record<ClueTone, string[]> = {
    establishing: [
      "If I may, sir...",
      "I should mention, sir...",
      "It may be of interest that",
    ],
    developing: [
      "I happened to observe that",
      "I couldn't help but notice that",
      "During my duties, I observed that",
    ],
    escalating: [
      "Most peculiar, sir, but",
      "I feel I must mention that",
      "This is rather important, sir—",
    ],
    revealing: [
      "I can confirm that",
      "I am certain that",
      "Without question, sir,",
    ],
  };

  const prefix = rng.pick(prefixes[tone]);
  return `${prefix} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function applyInspectorVoice(rng: SeededRandom, text: string, tone: ClueTone): string {
  const prefixes: Record<ClueTone, string[]> = {
    establishing: [
      "My preliminary investigation shows that",
      "Initial findings indicate that",
      "The evidence suggests that",
    ],
    developing: [
      "Upon further investigation,",
      "Examining the facts,",
      "The evidence reveals that",
    ],
    escalating: [
      "This is significant—",
      "Pay close attention to this:",
      "A crucial piece of evidence:",
    ],
    revealing: [
      "The facts are clear:",
      "I can definitively state that",
      "This is conclusive evidence that",
    ],
  };

  const prefix = rng.pick(prefixes[tone]);
  return `${prefix} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

// ============================================
// ELIMINATION REASON TEXT
// ============================================

function getEliminationReason(type: EliminationType, elementIds: string[]): string {
  const count = elementIds.length;
  const plural = count > 1;

  switch (type) {
    case "group_alibi":
      return `${plural ? "These suspects were" : "This suspect was"} together and alibi each other`;
    case "individual_alibi":
      return "Has a verified alibi for the time of the theft";
    case "witness_testimony":
      return "Witnessed elsewhere at the critical time";
    case "physical_impossibility":
      return "Physically unable to commit the theft";
    case "motive_cleared":
      return "Had no motive to steal";
    case "category_secured":
      return `${plural ? "These items were" : "This item was"} secured before the theft`;
    case "item_sighting":
      return "Seen after the theft occurred";
    case "item_accounted":
      return "Located and verified as untouched";
    case "item_condition":
      return "Display case was undisturbed";
    case "location_inaccessible":
      return `${plural ? "These locations were" : "This location was"} inaccessible`;
    case "location_undisturbed":
      return "Shows no signs of tampering";
    case "location_occupied":
      return "Was continuously occupied";
    case "location_visibility":
      return "Too much staff activity to go unnoticed";
    case "all_together":
      return "All suspects were together during this time";
    case "item_present":
      return "Item was verified present during this time";
    case "staff_activity":
      return "Too much staff activity for theft";
    case "timeline_impossibility":
      return "Timeline rules out this period";
    default:
      return "Eliminated based on evidence";
  }
}

// ============================================
// DRAMATIC EVENT DESCRIPTIONS
// ============================================

function generateDramaticEventDescriptions(
  rng: SeededRandom,
  plan: CampaignPlan,
  theme: MysteryTheme
): GeneratedDramaticEvent[] {
  return plan.dramaticEvents.map(event => {
    const involvedNames = event.involvedSuspects
      .map(id => SUSPECTS.find(s => s.id === id)?.displayName || id);

    const description = generateEventDescription(rng, event.eventType, involvedNames, theme);

    return {
      afterClue: event.afterClue,
      description,
      affectedSuspects: event.involvedSuspects,
    };
  });
}

function generateEventDescription(
  rng: SeededRandom,
  eventType: string,
  involvedNames: string[],
  theme: MysteryTheme
): string {
  switch (eventType) {
    case "power_outage":
      return "The lights flicker and go out momentarily, plunging the room into darkness. When they return, everyone looks around nervously.";

    case "argument":
      if (involvedNames.length >= 2) {
        return `${involvedNames[0]} and ${involvedNames[1]} exchange heated words. Their argument draws uncomfortable stares from the other guests.`;
      }
      return "Raised voices echo from another room—clearly a heated disagreement between guests.";

    case "scream":
      if (involvedNames.length > 0) {
        return `A scream echoes through the mansion! It came from near where ${involvedNames[0]} was last seen.`;
      }
      return "A scream echoes through the mansion corridors! Everyone freezes, uncertain of its source.";

    case "discovery":
      if (involvedNames.length > 0) {
        return `${involvedNames[0]} rushes in, pale-faced, claiming to have discovered something disturbing in another room.`;
      }
      return "A commotion breaks out as something unexpected is discovered elsewhere in the mansion.";

    case "arrival":
      if (involvedNames.length > 0) {
        return `The door opens unexpectedly. ${involvedNames[0]} enters, looking rather suspicious about their late arrival.`;
      }
      return "An unexpected arrival disrupts the evening—the butler announces a surprise guest.";

    case "crash":
      const rooms = ["the library", "the conservatory", "a distant corridor", "the gallery"];
      return `A loud crash echoes from ${rng.pick(rooms)}! Upon investigation, it appears to be a fallen vase—or was it deliberately knocked over?`;

    case "secret_passage":
      return "While examining the walls, a hidden panel clicks open, revealing a secret passage! How long has this been here, and who else knows about it?";

    case "confrontation":
      if (involvedNames.length > 0) {
        return `Inspector Brown turns to ${involvedNames[0]} with a piercing gaze. "I have some questions for you about your whereabouts this evening."`;
      }
      return "Inspector Brown surveys the room with narrowed eyes. \"Someone here knows more than they're telling me.\"";

    default:
      return `Something unexpected occurs, raising the tension in the room. ${theme.atmosphericElements.join(" and ")} add to the uneasy atmosphere.`;
  }
}

// ============================================
// NARRATIVE ELEMENTS
// ============================================

function generateNarrativeElements(
  plan: CampaignPlan,
  theme: MysteryTheme
): GeneratedScenario["narrative"] {
  const solutionSuspect = SUSPECTS.find(s => s.id === plan.solution.suspectId);
  const solutionItem = ITEMS.find(i => i.id === plan.solution.itemId);
  const solutionLocation = LOCATIONS.find(l => l.id === plan.solution.locationId);
  const solutionTime = TIME_PERIODS.find(t => t.id === plan.solution.timeId);

  return {
    opening: `Welcome to Tudor Mansion. It is ${theme.period}, and Mr. Boddy has invited his guests for "${theme.name}." ${theme.description} But something sinister lurks beneath the surface of this gathering... A valuable item has gone missing, and among these guests, a thief is hiding in plain sight.`,

    setting: `The atmosphere tonight is marked by ${theme.atmosphericElements.join(", ")}. The mansion's rooms are filled with Mr. Boddy's valuable collection, and the guests eye each other with barely concealed suspicion.`,

    atmosphere: theme.atmosphericElements.map(e => `The ${e} creates an air of mystery.`).join(" "),

    closing: `And so the truth is revealed! ${solutionSuspect?.displayName || "The thief"} stole the ${solutionItem?.nameUS || "item"} from the ${solutionLocation?.name || "location"} during ${solutionTime?.name || "the time"}. The evidence was there all along, hidden in plain sight. A motive, an opportunity, and the cunning to nearly escape detection. But justice prevails at Tudor Mansion, and Scotland Yard has closed another case!`,
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  generateAllClues,
  generateClueText,
  generateDramaticEventDescriptions,
  generateNarrativeElements,
  getElementNames,
  getEliminationReason,
};

// ============================================
// INSPECTOR NOTES
// ============================================

function generateInspectorNotes(
  rng: SeededRandom,
  plan: CampaignPlan
): GeneratedScenario["inspectorNotes"] {
  const notes: GeneratedScenario["inspectorNotes"] = [];

  const butlerClues = plan.clues.filter((clue) => clue.delivery.type === "butler");
  const fallbackClues = plan.clues;

  const pickCluePair = () => {
    const pool = butlerClues.length >= 2 ? butlerClues : fallbackClues;
    const first = rng.pick(pool);
    let second = rng.pick(pool);
    if (pool.length > 1) {
      while (second.position === first.position) {
        second = rng.pick(pool);
      }
    }
    return [first, second];
  };

  for (let i = 0; i < 2; i++) {
    const [clueA, clueB] = pickCluePair();
    const namesA = getElementNames(clueA.elimination.category, clueA.elimination.elementIds);
    const namesB = getElementNames(clueB.elimination.category, clueB.elimination.elementIds);
    const listA = namesA.slice(0, 3).join(", ");
    const listB = namesB.slice(0, 3).join(", ");

    const text = `Inspector's Note: Cross-check the testimony in clue #${clueA.position} with clue #${clueB.position}. ` +
      `Together they clear ${listA || "several leads"} and ${listB || "additional possibilities"}, ` +
      "which tightens the field more than it first appears.";

    notes.push({
      id: `N${i + 1}`,
      text,
      relatedClues: [clueA.position, clueB.position],
    });
  }

  return notes;
}
