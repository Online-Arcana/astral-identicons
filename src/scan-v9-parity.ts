import {
  parityAnchorPoint,
  parityStarSizes
} from "./layout-v9.ts";
import {
  v9ParityByte,
  v9ParityDensityLevelCount,
  v9ParityPositionCount,
  v9ParitySizeLevelCount,
  v9ParityStarCount
} from "./parity-v9.ts";
import {
  foregroundEvidence,
  greyReference,
  patchEvidence,
  type GreyReference
} from "./scan-v9-evidence.ts";
import type { V9ByteObservation } from "./record-v9.ts";

export interface V9ParityObservation extends V9ByteObservation {
  readonly position: number | null;
  readonly size: number | null;
  readonly density: number | null;
  readonly positionConfidence: number;
  readonly sizeConfidence: number;
  readonly densityConfidence: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PositionReading {
  readonly value: number | null;
  readonly confidence: number;
  readonly point?: Point;
}

interface Profile {
  readonly extent: number | null;
  readonly density: number | null;
  readonly confidence: number;
}

interface RawObservation {
  readonly position: PositionReading;
  readonly profile: Profile;
}

interface LevelReading {
  readonly value: number | null;
  readonly confidence: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function positionReading(
  image: ImageData,
  reference: GreyReference,
  group: number
): PositionReading {
  const scale = image.width / 1024;
  const radius = Math.max(4, parityStarSizes.at(-1)! * scale * 0.72);
  const ranked = Array.from({ length: v9ParityPositionCount }, (_unused, value) => {
    const point = parityAnchorPoint(group, value);
    return {
      value,
      point,
      score: patchEvidence(
        image,
        reference,
        point.x * scale,
        point.y * scale,
        radius
      )
    };
  }).sort((left, right) => right.score - left.score);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const margin = best.score === 0
    ? 0
    : (best.score - second.score) / best.score;
  const confidence = clamp(margin * 0.65 + best.score * 0.35, 0, 1);

  if (best.score < 0.08 || margin < 0.08) {
    return { value: null, confidence };
  }

  return {
    value: best.value,
    confidence,
    point: best.point
  };
}

function profile(
  image: ImageData,
  reference: GreyReference,
  point: Point
): Profile {
  const scale = image.width / 1024;
  const radius = Math.max(5, Math.ceil(12 * scale));
  const centreX = point.x * scale;
  const centreY = point.y * scale;
  const side = radius * 2 + 1;
  const evidence = new Float32Array(side * side);
  let peak = 0;
  let seed = radius * side + radius;

  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const x = centreX + column - radius;
      const y = centreY + row - radius;
      const value = foregroundEvidence(image, reference, x, y);
      const index = row * side + column;
      evidence[index] = value;

      if (Math.abs(column - radius) > 2 || Math.abs(row - radius) > 2) continue;
      if (value <= peak) continue;
      peak = value;
      seed = index;
    }
  }

  if (peak < 0.12) {
    return { extent: null, density: null, confidence: 0 };
  }

  const threshold = Math.max(0.12, peak * 0.28);
  const visited = new Uint8Array(side * side);
  const queue: number[] = [seed];
  visited[seed] = 1;
  let mass = 0;
  let samples = 0;
  let extent = 0;

  while (queue.length > 0) {
    const index = queue.shift()!;
    const value = evidence[index] ?? 0;
    if (value < threshold) continue;

    const row = Math.floor(index / side);
    const column = index % side;
    const distance = Math.hypot(column - radius, row - radius);
    extent = Math.max(extent, distance);
    mass += value;
    samples += 1;

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextRow = row + offsetY;
        const nextColumn = column + offsetX;
        if (
          nextRow < 0 ||
          nextColumn < 0 ||
          nextRow >= side ||
          nextColumn >= side
        ) {
          continue;
        }

        const next = nextRow * side + nextColumn;
        if (visited[next] !== 0) continue;
        visited[next] = 1;
        if ((evidence[next] ?? 0) >= threshold) queue.push(next);
      }
    }
  }

  if (samples < 3 || extent === 0) {
    return { extent: null, density: null, confidence: 0 };
  }

  const diameter = extent * 2 / scale;
  const occupiedArea = Math.PI * extent * extent;
  const density = mass / Math.max(1, occupiedArea);
  const confidence = clamp(samples / Math.max(8, occupiedArea * 0.35), 0, 1);

  return {
    extent: diameter,
    density,
    confidence
  };
}

function populationCentres(
  values: readonly (number | null)[],
  levels: number,
  fallback: readonly number[]
): readonly number[] {
  const samples = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (samples.length < levels * 3) return fallback;

  let centres = Array.from({ length: levels }, (_unused, index) => {
    const position = ((index + 0.5) / levels) * (samples.length - 1);
    return samples[Math.round(position)]!;
  });

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const groups = Array.from({ length: levels }, () => [] as number[]);

    for (const sample of samples) {
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;

      for (let level = 0; level < centres.length; level += 1) {
        const candidate = Math.abs(sample - centres[level]!);
        if (candidate >= distance) continue;
        nearest = level;
        distance = candidate;
      }
      groups[nearest]!.push(sample);
    }

    centres = centres.map((centre, level) => {
      const group = groups[level]!;
      return group.length === 0
        ? centre
        : group.reduce((sum, value) => sum + value, 0) / group.length;
    }).sort((left, right) => left - right);
  }

  return centres;
}

function levelReading(
  measured: number | null,
  centres: readonly number[]
): LevelReading {
  if (measured === null || !Number.isFinite(measured)) {
    return { value: null, confidence: 0 };
  }

  const ranked = centres.map((centre, value) => ({
    value,
    distance: Math.abs(measured - centre)
  })).sort((left, right) => left.distance - right.distance);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const span = Math.max(
    0.001,
    centres.at(-1)! - centres[0]!
  );
  const confidence = clamp(
    (second.distance - best.distance) / (span / centres.length),
    0,
    1
  );

  return {
    value: best.value,
    confidence
  };
}

function densityFallback(raw: readonly RawObservation[]): readonly number[] {
  const values = raw
    .map((observation) => observation.profile.density)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const minimum = values[0] ?? 0.08;
  const maximum = values.at(-1) ?? 0.55;

  return Array.from({ length: v9ParityDensityLevelCount }, (_unused, index) => {
    return minimum + (maximum - minimum) * index /
      (v9ParityDensityLevelCount - 1);
  });
}

export function observeV9Parity(
  image: ImageData
): readonly V9ParityObservation[] {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v9 parity observation requires a square normalised image");
  }

  const reference = greyReference(image);
  const raw = Array.from({ length: v9ParityStarCount }, (_unused, group) => {
    const position = positionReading(image, reference, group);
    return {
      position,
      profile: position.point
        ? profile(image, reference, position.point)
        : { extent: null, density: null, confidence: 0 }
    };
  });
  const sizeCentres = populationCentres(
    raw.map((observation) => observation.profile.extent),
    v9ParitySizeLevelCount,
    parityStarSizes
  );
  const densityCentres = populationCentres(
    raw.map((observation) => observation.profile.density),
    v9ParityDensityLevelCount,
    densityFallback(raw)
  );

  return raw.map((observation) => {
    const size = levelReading(observation.profile.extent, sizeCentres);
    const density = levelReading(observation.profile.density, densityCentres);
    const position = observation.position;
    const confidence = Math.min(
      position.confidence,
      size.confidence,
      density.confidence,
      observation.profile.confidence
    );

    if (
      position.value === null ||
      size.value === null ||
      density.value === null
    ) {
      return {
        value: null,
        confidence,
        position: position.value,
        size: size.value,
        density: density.value,
        positionConfidence: position.confidence,
        sizeConfidence: size.confidence,
        densityConfidence: density.confidence
      };
    }

    try {
      return {
        value: v9ParityByte(position.value, size.value, density.value),
        confidence,
        position: position.value,
        size: size.value,
        density: density.value,
        positionConfidence: position.confidence,
        sizeConfidence: size.confidence,
        densityConfidence: density.confidence
      };
    } catch {
      return {
        value: null,
        confidence,
        position: position.value,
        size: size.value,
        density: density.value,
        positionConfidence: position.confidence,
        sizeConfidence: size.confidence,
        densityConfidence: density.confidence
      };
    }
  });
}
