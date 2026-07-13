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

export type ClueSetProblem = {
  clueNumber: number;
  problem: string;
};

const GREETING_OPENING = /^(?:hello|coming|good\s+day)\s*--/i;
const EMPTY_INTERJECTION_OPENING = /^(?:indeed|quiet|well|yes)\s*(?:--|—|,)/i;
const WHOLE_HOUSEHOLD_SCOPE = /\b(?:everyone|every\s+(?:single\s+person|soul|guest)|all\s+(?:of\s+)?the\s+guests|entire\s+(?:company|household|party)|whole\s+(?:company|household|house|party))\b/i;

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

/**
 * Card names are evidence vocabulary, not prose style. Two clues can
 * legitimately need to repeat the same three-person group, so remove every
 * licensed card phrase before looking for recycled sentence fragments.
 */
function scrubCardNamesForStyle(text: string): string {
  let scrubbed = text;
  for (const matcher of CARD_MATCHERS) {
    scrubbed = scrubbed.replace(matcher.regex, " ");
    matcher.regex.lastIndex = 0;
  }
  return scrubbed;
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
  if (/\b(?:theft|stolen|missing|disappeared|crime|investigation|mystery|amiss)\b/i.test(opening)) {
    problems.push("The opening must only establish the occasion and mood; do not mention a theft, anything missing, or an investigation.");
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
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const complexScene = Boolean(seed.episodeId) || /^Render these as ONE connected lived recollection/i.test(seed.brief);
  const wordLimit = complexScene ? 60 : 48;
  if (seed.deliverAs === "butler" && wordCount > wordLimit) {
    problems.push(`Runs to ${wordCount} words. Keep this testimony within ${wordLimit} words without dropping any stated fact or scope.`);
  }
  if (seed.deliverAs === "butler" && EMPTY_INTERJECTION_OPENING.test(text.trim())) {
    problems.push("Begins with an empty filler interjection. Start directly with a person, action, object, place, or time from the event.");
  }
  if (seed.deliverAs === "butler" && GREETING_OPENING.test(text.trim())) {
    problems.push("Begins with a canned greeting. Start directly inside the remembered event.");
  }
  if (seed.deliverAs === "butler" && /\bthat same\s+[a-z]+ing\s+still\b/i.test(text)) {
    problems.push("Contains a malformed forced callback (for example, 'that same toasting still'). Make the person, question, or observation the grammatical subject.");
  }
  if (seed.deliverAs === "butler" && /\b(?:he|she|they)\s+[a-z]+ing\b/i.test(text)) {
    problems.push("Contains a bare pronoun-plus-participle fragment (for example, 'he drifting back'). Give the action a finite verb or attach the participle grammatically without changing the fact.");
  }
  if (seed.deliverAs === "butler" && /\b(?:forgive me|pardon me)\b/i.test(text)) {
    problems.push("Contains an apologetic aside that adds no evidence. Remove it and state the recollection directly.");
  }
  if (/\bstaff\b/i.test(text)) {
    problems.push("Uses the word 'staff'. Name Mrs. White and Rusty directly or say 'the household'.");
  }
  if (seed.deliverAs !== "butler" && /\b(?:(?:the|per\s+the)\s+butler|butler\s+(?:reports|records|notes|recalls))\b/i.test(text)) {
    problems.push("Uses a stilted generic Butler attribution. Name Ashe directly or state the case-file fact without an attribution.");
  }
  const claimsWholeHousehold = WHOLE_HOUSEHOLD_SCOPE.test(text);
  if (seed.scopeMode === "named_only" && claimsWholeHousehold) {
    problems.push("Broadens a named-person scene into the whole company. Preserve only the people covered by the deterministic event.");
  }
  if (seed.scopeMode === "whole_household" && !claimsWholeHousehold) {
    problems.push("Drops the event's whole-household scope. State explicitly that every guest, Mrs. White, and Rusty were covered.");
  }
  if (
    seed.mustRemainPresent &&
    /\b(?:slip(?:ped|ping)?\s+(?:off|away|out)|step(?:ped|ping)?\s+(?:out|away)|left\s+(?:the\s+)?(?:room|gathering|company)|broke\s+away|wandered\s+(?:off|away)|went\s+(?:off|away))\b/i.test(text)
  ) {
    problems.push("Contradicts a continuous-presence scene by implying that a covered person left. Keep every named person within the stated scene for the full span.");
  }
  if (seed.locationSetting === "outdoor" && /\b(?:the|that|this|same)\s+room\b|\bindoors?\b/i.test(text)) {
    problems.push("Calls an outdoor setting a room or indoors. Use garden, grounds, place, fountain, or scene language instead.");
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

/**
 * Cross-clue style checks need the complete Butler package. Keep the first
 * first two occurrences of an opening word; later collisions and every canned greeting are
 * repaired surgically through the same per-clue path as card
 * leakage. Inspector notes are intentionally excluded.
 */
export function verifyClueOpeningVariety(clues: string[]): ClueSetProblem[] {
  const problems: ClueSetProblem[] = [];
  const firstWordOwner = new Map<string, number>();
  clues.forEach((clue, index) => {
    const clueNumber = index + 1;
    const trimmed = clue.trim();
    const firstWord = trimmed.match(/[A-Za-z]+(?:'[A-Za-z]+)?/)?.[0]?.toLowerCase();
    if (firstWord) {
      const owners = firstWordOwner.get(firstWord);
      if (owners !== undefined && owners >= 2) {
        problems.push({
          clueNumber,
          problem: `Opens with "${firstWord}", already used twice in this case. Start with a different first word and sentence shape.`,
        });
      }
      firstWordOwner.set(firstWord, (owners ?? 0) + 1);
    }

    if (GREETING_OPENING.test(trimmed)) {
      problems.push({
        clueNumber,
        problem: "Uses a canned greeting-style opener. Begin directly with the remembered event.",
      });
    }
  });

  // Repeated five-word runs catch the subtler template problem seen in real
  // generations (the same bouquets, gift cards, or inventory preamble in
  // three different clues) without banning any clue kind or story fact.
  const phraseOwner = new Map<string, number>();
  clues.forEach((clue, index) => {
    const clueNumber = index + 1;
    const words = scrubCardNamesForStyle(clue).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
    const phrases = new Set<string>();
    for (let start = 0; start <= words.length - 5; start += 1) {
      phrases.add(words.slice(start, start + 5).join(" "));
    }
    for (const phrase of phrases) {
      const owner = phraseOwner.get(phrase);
      if (owner !== undefined) {
        problems.push({
          clueNumber,
          problem: `Repeats the five-word phrase "${phrase}" from clue ${owner}. Keep the fact, but rebuild the sentence and occasion detail from a different angle.`,
        });
        break;
      }
    }
    for (const phrase of phrases) if (!phraseOwner.has(phrase)) phraseOwner.set(phrase, clueNumber);
  });

  return problems;
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
  const inventedAccess = [
    /\bbehind\s+(?:a|the|that)\b[^.!?]{0,35}\bdoor\b/i,
    /\bthrough\s+(?:a|the)\s+(?:door|window|passage)\b/i,
    /\b(?:using|used)\s+(?:a|the)\s+(?:key|passage)\b/i,
    /\bslipped\s+(?:into|through|out\s+of)\b/i,
    /\bslipped\s+away\b/i,
    /\bmade\s+off\b/i,
    /\b(?:hid|hidden|concealed|tucked|pocketed|smuggled)\b/i,
  ].find((pattern) => pattern.test(closing));
  if (inventedAccess) {
    problems.push("The closing invents an access, route, or concealment detail that was not supplied. State only the supplied unwitnessed opportunity at the answer location and hour.");
  }
  if (closing.trim().length === 0) problems.push("The closing is empty.");
  return { target: "closing", problems, warnings: [] };
}
