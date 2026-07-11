import { describe, expect, it } from "vitest";
import { parseStoryJson, stripCodeFences } from "./ai-story-generator";
import { buildStoryUserPrompt } from "../data/ai-story-prompt";

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

describe("AI story prompt", () => {
  it("passes the answer and full world without a possibility field", () => {
    const prompt = buildStoryUserPrompt({
      suspectList: ["Miss Scarlet", "Mr. Green"],
      itemList: ["Revolver", "Rare Book"],
      locationList: ["Lounge", "Library"],
      timeList: ["Dusk", "Dinner"],
      answerKey: {
        suspect: "Mr. Green",
        item: "Revolver",
        location: "Lounge",
        time: "Dusk",
      },
    });

    expect(prompt).toContain("Hidden answer:");
    expect(prompt).toContain("Who: Mr. Green");
    expect(prompt).toContain("What: Revolver");
    expect(prompt).not.toContain("possibility field");
    expect(prompt).not.toContain("Story foundation");
  });
});
