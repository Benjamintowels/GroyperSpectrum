/**
 * SeededRandom - Deterministic RNG from a seed string.
 * Same seed string always produces the same sequence of numbers.
 * Uses string hash + Linear Congruential Generator (LCG).
 */
class SeededRandom {
  /**
   * @param {string} seed - Seed string (e.g. "2025-03-05"). Same string => same sequence.
   */
  constructor(seed) {
    this._state = SeededRandom._hashString(seed);
    if (this._state === 0) this._state = 1;
  }

  /**
   * Deterministic 32-bit hash of a string.
   * @param {string} str
   * @returns {number} 32-bit integer
   */
  static _hashString(str) {
    let h = 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0) || 1;
  }

  /** LCG parameters (standard values for 32-bit) */
  static _A = 1664525;
  static _C = 1013904223;
  static _M = 0x100000000; // 2^32

  /**
   * Advance LCG state and return next value in [0, 1).
   * @returns {number} Float in [0, 1)
   */
  next() {
    this._state = (SeededRandom._A * this._state + SeededRandom._C) >>> 0;
    return (this._state >>> 0) / SeededRandom._M;
  }

  /**
   * Random integer in [min, max] (inclusive).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    const lo = Math.floor(min);
    const hi = Math.floor(max);
    const range = hi - lo + 1;
    if (range <= 0) return lo;
    return lo + Math.floor(this.next() * range);
  }

  /**
   * Random element from array.
   * @param {Array} array
   * @returns {*} One element from the array
   */
  pick(array) {
    if (!array || array.length === 0) return undefined;
    return array[this.nextInt(0, array.length - 1)];
  }
}
