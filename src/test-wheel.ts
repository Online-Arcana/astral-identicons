import type {
  PublicWheelHouse,
  PublicWheelMeta
} from "../vendor/astral-chart-wheel/dist/index.js";
import { input } from "./input.ts";
import { DeterministicRandom } from "./prng.ts";
import { signs, type Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";

export interface TestChartPreview {
  readonly input: IdenticonInput;
  readonly wheel: PublicWheelMeta;
}

const normalise = (degrees: number): number => ((degrees % 360) + 360) % 360;
const opposite = (degrees: number): number => normalise(degrees + 180);

function longitude(random: DeterministicRandom): number {
  return random.integer(360_000) / 1000;
}

function signedOffset(random: DeterministicRandom, maximum: number): number {
  return (random.integer(maximum * 2_000 + 1) - maximum * 1000) / 1000;
}

function signAt(longitudeDegrees: number): Sign {
  return signs[Math.floor(normalise(longitudeDegrees) / 30)]!;
}

function houseMap(ascendant: number): PublicWheelMeta["houses"]["houses"] {
  return Object.fromEntries(Array.from({ length: 12 }, (_unused, index) => {
    const number = index + 1;
    const cusp = normalise(ascendant + index * 30);
    return [String(number), {
      number: number as PublicWheelHouse["number"],
      cuspLongitudeDegrees: cusp,
      endLongitudeDegrees: normalise(cusp + 30)
    } satisfies PublicWheelHouse];
  })) as PublicWheelMeta["houses"]["houses"];
}

/**
 * Build deterministic TEST-ONLY wheel metadata for the browser preview.
 *
 * This is not an astronomical calculation and is never used for imported
 * .astral files. It exists so the standalone identicon test front end always
 * exercises the real chart-wheel geometry instead of a positionless shell.
 */
export function testChartPreview(seed: string): TestChartPreview {
  const random = new DeterministicRandom(
    "astral-identicon/test-public-wheel/v1",
    seed,
    "TEST-ONLY"
  );

  const sun = longitude(random);
  const moon = longitude(random);
  const mercury = longitude(random);
  const venus = longitude(random);
  const mars = longitude(random);
  const jupiter = longitude(random);
  const saturn = longitude(random);
  const uranus = longitude(random);
  const neptune = longitude(random);
  const pluto = longitude(random);

  const ascendant = longitude(random);
  const descendant = opposite(ascendant);
  const midheaven = longitude(random);
  const imumCoeli = opposite(midheaven);

  const northNodeTrue = longitude(random);
  const southNodeTrue = opposite(northNodeTrue);
  const northNodeMean = normalise(northNodeTrue + signedOffset(random, 2.5));
  const southNodeMean = opposite(northNodeMean);

  const vertex = longitude(random);
  const antivertex = opposite(vertex);
  const eastPoint = normalise(ascendant + signedOffset(random, 12));
  const partOfFortune = longitude(random);
  const partOfSpirit = longitude(random);
  const lilithMean = longitude(random);
  const lilithTrue = normalise(lilithMean + signedOffset(random, 4));

  const value = input({
    seed,
    solar: signAt(sun),
    lunar: signAt(moon),
    ascendant: signAt(ascendant),
    midheaven: signAt(midheaven),
    descendant: signAt(descendant),
    imumCoeli: signAt(imumCoeli)
  });

  const wheel: PublicWheelMeta = {
    schema: "astral-public-wheel/1.0.0",
    calculationFingerprint: `TEST-ONLY:identicon-preview:${seed.slice(0, 16)}`,
    primaryHouseSystem: "equal",
    points: {
      sun,
      moon,
      mercury,
      venus,
      mars,
      jupiter,
      saturn,
      uranus,
      neptune,
      pluto,
      north_node_true: northNodeTrue,
      south_node_true: southNodeTrue,
      north_node_mean: northNodeMean,
      south_node_mean: southNodeMean,
      ascendant,
      descendant,
      midheaven,
      imum_coeli: imumCoeli,
      vertex,
      antivertex,
      east_point: eastPoint,
      part_of_fortune: partOfFortune,
      part_of_spirit: partOfSpirit,
      lilith_mean: lilithMean,
      lilith_true: lilithTrue
    },
    houses: {
      status: "calculated",
      houses: houseMap(ascendant)
    },
    aspects: []
  };

  return { input: value, wheel };
}
