import { describe, expect, it } from "vitest";
import { stripCodeFences } from "./ai-story-generator";

describe("AI story response parsing", () => {
  it("unwraps JSON fences with or without a newline", () => {
    expect(stripCodeFences('```json\n{"opening":"A"}\n```')).toBe('{"opening":"A"}');
    expect(stripCodeFences('```json {"opening":"A"} ```')).toBe('{"opening":"A"}');
  });

  it("extracts an object after a short prose preface", () => {
    expect(stripCodeFences('Here is the result:\n{"opening":"A"}')).toBe('{"opening":"A"}');
  });
});
