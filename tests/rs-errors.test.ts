import { describe, expect, test } from "bun:test";
import { input } from "../src/input.ts";
import {
  recoverStarParity,
  starParityCodeword,
  type ByteObservation
} from "../src/star-parity.ts";

const sample = input({
  seed: "6270f2-example",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

describe("Reed-Solomon camera recovery", () => {
  test("corrects wrong symbols together with missing symbols", () => {
    const codeword = starParityCodeword(sample);
    const observations: ByteObservation[] = [...codeword].map((value, index) => {
      if (index % 5 === 0) return { value: null, confidence: 0 };
      if (index % 11 === 0) {
        return {
          value: value ^ 0x5a,
          confidence: 0.72
        };
      }
      return { value, confidence: 0.96 };
    });
    const missing = observations.filter((value) => value.value === null).length;
    const wrong = observations.filter((value, index) => {
      return value.value !== null && value.value !== codeword[index];
    }).length;

    expect(wrong * 2 + missing <= 88).toBe(true);

    const recovered = recoverStarParity(observations);
    expect(recovered.value).toEqual(sample);
    expect(recovered.discardedStars).toBe(wrong);
    expect(recovered.reconstructedStars).toBe(wrong + missing);
  });
});
