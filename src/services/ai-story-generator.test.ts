import { describe, expect, it } from "vitest";
import { buildPossibilityField, parseStoryJson, stripCodeFences } from "./ai-story-generator";
import type { CampaignPlan } from "../types/campaign";

describe("AI story response parsing", () => {
  it("unwraps JSON fences with or without a newline", () => {
    expect(stripCodeFences('```json\n{"opening":"A"}\n```')).toBe('{"opening":"A"}');
    expect(stripCodeFences('```json {"opening":"A"} ```')).toBe('{"opening":"A"}');
  });

  it("extracts an object after a short prose preface", () => {
    expect(stripCodeFences('Here is the result:\n{"opening":"A"}')).toBe('{"opening":"A"}');
  });

  it("repairs literal line breaks inside a JSON string", () => {
    const parsed = parseStoryJson(`{
      "opening": "A quiet evening
continued unexpectedly",
      "butler_clues": [],
      "inspector_notes": [],
      "closing": "The end"
    }`);

    expect(parsed.opening).toBe("A quiet evening\ncontinued unexpectedly");
  });

  it("does not mask unrelated malformed JSON", () => {
    expect(() => parseStoryJson('{"opening": "unfinished}')).toThrow(/unterminated/i);
  });
});

describe("story possibility field", () => {
  it("surrounds every answer with coherent alternatives", () => {
    const field = buildPossibilityField({
      seed: 2201,
      solution: {
        suspectId: "S10",
        itemId: "I01",
        locationId: "L09",
        timeId: "T04",
      },
    } as CampaignPlan);

    expect(field.suspects).toHaveLength(3);
    expect(field.suspects).toContain("Rusty");
    expect(field.items).toHaveLength(3);
    expect(field.items).toContain("Spyglass");
    expect(field.locations).toEqual(expect.arrayContaining(["Study", "Library", "Hall"]));
    expect(field.times).toEqual(expect.arrayContaining(["Late Morning", "Lunch", "Early Afternoon"]));
  });
});
