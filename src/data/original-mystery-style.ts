/**
 * Structural lessons distilled from data/mysteries.json.
 *
 * The original clue text is deliberately not loaded into model prompts. This
 * compact guide preserves its useful construction habits without inviting the
 * model to copy phrases or recycle cases.
 */
export const ORIGINAL_MYSTERY_STYLE_GUIDE = [
  "Ashe recalls one concrete social fact at a time rather than explaining puzzle logic.",
  "Ordinary details such as arrivals, repairs, gifts, seating, and shared activities carry evidentiary weight.",
  "Object histories, group movements, and personal remarks are mixed instead of repeating one clue mechanism.",
  "A fragment can be useful without mentioning any answer candidate.",
  "Names and card details appear only when they belong naturally to the remembered event.",
  "The player performs the deduction; the speaker reports what happened.",
] as const;
