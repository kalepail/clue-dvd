/**
 * Clue DVD Game - Seeded Random Number Generator
 *
 * Provides deterministic random number generation for reproducible scenarios.
 * Uses a Linear Congruential Generator (LCG) algorithm.
 */

export class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Date.now();
  }

  /**
   * Get the current seed value
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Generate next random float between 0 and 1
   */
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Generate random integer in range [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random boolean with optional probability
   */
  nextBool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Pick multiple unique random elements from an array
   */
  pickMultiple<T>(array: readonly T[], count: number): T[] {
    if (count > array.length) {
      throw new Error(`Cannot pick ${count} elements from array of length ${array.length}`);
    }
    const shuffled = this.shuffle([...array]);
    return shuffled.slice(0, count);
  }

  /**
   * Pick a weighted random element from an array
   * @param array Array of items
   * @param weights Array of weights (must match array length)
   */
  pickWeighted<T>(array: readonly T[], weights: readonly number[]): T {
    if (array.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    if (array.length !== weights.length) {
      throw new Error("Weights array must match array length");
    }

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = this.next() * totalWeight;

    for (let i = 0; i < array.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return array[i];
      }
    }

    return array[array.length - 1];
  }

  /**
   * Shuffle an array using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Create a copy of this RNG at the current state
   */
  clone(): SeededRandom {
    const clone = new SeededRandom();
    clone.seed = this.seed;
    return clone;
  }
}

/**
 * Create a new SeededRandom instance
 */
export function createRng(seed?: number): SeededRandom {
  return new SeededRandom(seed);
}
