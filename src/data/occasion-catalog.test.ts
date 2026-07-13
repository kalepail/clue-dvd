import { describe, expect, it } from "vitest";
import { LOCATIONS, TIME_PERIODS } from "./game-elements";
import {
  OCCASION_CATALOG,
  OCCASION_FAMILIES,
  beatPhrasesForTime,
  instantiateOccasionSpine,
} from "./occasion-catalog";

const timeIds = new Set(TIME_PERIODS.map((time) => time.id));
const locationIds = new Set(LOCATIONS.map((location) => location.id));

describe("occasion catalog", () => {
  it("fully authors every engine occasion family", () => {
    expect(Object.keys(OCCASION_CATALOG).sort()).toEqual([...OCCASION_FAMILIES].sort());
    for (const family of OCCASION_FAMILIES) {
      const entry = OCCASION_CATALOG[family];
      expect(entry.beats.length).toBeGreaterThanOrEqual(4);
      expect(entry.beats.length).toBeLessThanOrEqual(7);
      expect(entry.groupActivities.length).toBeGreaterThanOrEqual(5);
      expect(entry.soloActivities.length).toBeGreaterThanOrEqual(3);
      expect(entry.excuses.length).toBeGreaterThanOrEqual(3);
      expect(entry.setDressing.length).toBeGreaterThanOrEqual(4);
      expect(entry.threadCauses.length).toBeGreaterThanOrEqual(2);
      for (const beat of entry.beats) {
        expect(beat.timeOptions.length).toBeGreaterThan(0);
        expect(beat.timeOptions.every((range) => range.length >= 1 && range.length <= 3)).toBe(true);
        expect(beat.timeOptions.flat().every((timeId) => timeIds.has(timeId))).toBe(true);
        expect(beat.locationIds.every((locationId) => locationIds.has(locationId))).toBe(true);
        expect(beat.phrases.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("instantiates the same answer-blind spine for the same family and seed", () => {
    const first = instantiateOccasionSpine("costume fete", 867_5309);
    const second = instantiateOccasionSpine("costume fete", 867_5309);
    const different = instantiateOccasionSpine("costume fete", 867_5310);
    expect(second).toEqual(first);
    expect(different).not.toEqual(first);
    expect(first.mainEvent).toContain("unmasking");
    expect(first.groupActivities.some((activity) => /costume|mask|disguise/i.test(activity))).toBe(true);
  });

  it("licenses vague beat phrases across the whole day", () => {
    const spine = instantiateOccasionSpine("amateur theatrical rehearsal", 42);
    for (const time of TIME_PERIODS) {
      expect(beatPhrasesForTime(spine, time.id).length).toBeGreaterThan(0);
    }
  });
});
