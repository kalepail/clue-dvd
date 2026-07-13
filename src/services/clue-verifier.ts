/**
 * V3 Clue Verifier
 *
 * Deterministic checks on rendered prose. The logic of the mystery was proven
 * before any prose existed, so verification only needs to confirm the text
 * stays inside its lane:
 *
 *  - card-name discipline: a clue may say only the card names its fact
 *    licenses; the opening may name no cards at all;
 *  - vocabulary: any card name found must be a real card name (the 42-card
 *    scan is exact, so hallucinated cards simply don't match and invented
 *    PEOPLE are caught by the cast prompt + audit warnings);
 *  - the closing must name all four answer cards.
 *
 * Failures trigger a surgical single-clue re-render, never a whole-mystery
 * revision.
 */

import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import type { StorySeed } from "../data/ai-v3-prompts";
import type { Answer } from "./ai-mystery-schemas";
import { requireItem, requireLocation, requireSuspect, requireTime } from "./world-sim";

export type TextVerification = {
  target: string; // "opening" | "clue-3" | "note1" | "note2" | "closing"
  problems: string[];
  warnings: string[];
};

const ALL_CARD_NAMES: Array<{ name: string; category: string }> = [
  ...SUSPECTS.map((suspect) => ({ name: suspect.displayName, category: "suspect" })),
  ...ITEMS.map((item) => ({ name: item.nameUS, category: "item" })),
  ...LOCATIONS.map((location) => ({ name: location.name, category: "location" })),
  ...TIME_PERIODS.map((time) => ({ name: time.name, category: "time" })),
];

// Longest names first so "Rose Garden" wins over a hypothetical "Rose".
const CARD_MATCHERS = ALL_CARD_NAMES
  .slice()
  .sort((a, b) => b.name.length - a.name.length)
  .map((card) => ({
    ...card,
    regex: new RegExp(`(?<![A-Za-z])${escapeRegex(card.name)}(?![A-Za-z])`, "g"),
  }));

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns every real card name mentioned in a text. */
export function findCardMentions(text: string): string[] {
  const found = new Set<string>();
  let scrubbed = text;
  for (const matcher of CARD_MATCHERS) {
    if (matcher.regex.test(scrubbed)) {
      found.add(matcher.name);
      // Remove matched spans so "Rose Garden" doesn't later also match "Garden"-like fragments.
      scrubbed = scrubbed.replace(matcher.regex, "▮");
    }
    matcher.regex.lastIndex = 0;
  }
  return [...found];
}

/** The opening may name no card at all. */
export function verifyOpening(opening: string): TextVerification {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (opening.trim().length === 0) problems.push("The opening is empty.");
  const mentions = findCardMentions(opening);
  if (mentions.length > 0) {
    problems.push(`The opening must not name any card, but names: ${mentions.join(", ")}.`);
  }
  return { target: "opening", problems, warnings };
}

/** A clue/note may say only the card names its fact licenses. */
export function verifyClueText(text: string, seed: StorySeed): TextVerification {
  const target = seed.deliverAs === "butler" ? `clue-${seed.clueNumber}` : seed.deliverAs;
  const problems: string[] = [];
  const warnings: string[] = [];
  if (text.trim().length === 0) {
    problems.push("The text is empty.");
    return { target, problems, warnings };
  }
  const allowed = new Set(seed.allowedNames);
  for (const mention of findCardMentions(text)) {
    if (!allowed.has(mention)) {
      problems.push(`Names the card "${mention}", which this testimony is not allowed to mention. Allowed: ${seed.allowedNames.length > 0 ? seed.allowedNames.join(", ") : "no card names"}.`);
    }
  }
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;
  if (seed.deliverAs === "butler" && sentences > 4) {
    warnings.push(`Runs to ${sentences} sentences; the original testimonies stay within 1-3.`);
  }
  if (seed.deliverAs !== "butler" && sentences > 2) {
    warnings.push(`Inspector notes are single dry sentences in the original; this has ${sentences}.`);
  }
  return { target, problems, warnings };
}

/** The closing must name all four answer cards. */
export function verifyClosing(closing: string, answer: Answer): TextVerification {
  const problems: string[] = [];
  const names = [
    requireSuspect(answer.suspectId).displayName,
    requireItem(answer.itemId).nameUS,
    requireLocation(answer.locationId).name,
    requireTime(answer.timeId).name,
  ];
  const lower = closing.toLowerCase();
  for (const name of names) {
    if (!lower.includes(name.toLowerCase())) {
      problems.push(`The closing must explicitly name "${name}".`);
    }
  }
  if (closing.trim().length === 0) problems.push("The closing is empty.");
  return { target: "closing", problems, warnings: [] };
}
