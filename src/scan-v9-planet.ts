import {
  planetAnchorPoint,
  planetFadingOpacities,
  planetGlyphSizes,
  satelliteDotRadii,
  satellitePoint
} from "./layout-v9.ts";
import type { V9CalibrationObservation } from "./scan-v9-calibration.ts";
import {
  foregroundEvidence,
  greyReference,
  patchEvidence,
  type GreyReference
} from "./scan-v9-evidence.ts";
import type {
  PlanetaryAlternative,
  PlanetaryObservation,
  SatelliteState
} from "./planet-code.ts";
import {
  planetAnchorCount,
  planetaryGlyphs,
  planetRotationLevelCount,
  planetSizeLevelCount,
  satellitePositionCount
} from "./planet.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface AnchorSample {
  readonly anchor: number;
  readonly point: Point;
  readonly score: number;
  readonly observed: Float32Array;
}

interface CoarseCandidate {
  readonly anchor: number;
  readonly rotation: number;
  readonly score: number;
  readonly observed: Float32Array;
}

interface SizedCandidate extends CoarseCandidate {
  readonly size: number;
  readonly sizeScore: number;
}

interface FadedCandidate extends SizedCandidate {
  readonly fading: number;
  readonly fadingScore: number;
}

interface SatelliteProfile {
  readonly presence: number;
  readonly diameter: number;
  readonly confidence: number;
}

interface SatelliteCandidate {
  readonly satellites: SatelliteState;
  readonly score: number;
}

interface VisualCalibration {
  readonly sizes: readonly number[];
  readonly fading: readonly number[];
}

const cropSize = 72;
const templateDimension = 36;
const nominalSizeLevel = 3;
const nominalFadingLevel = 5;
const retainedAnchors = 64;
const retainedCoarseStates = 14;
const retainedSizedStates = 8;
const retainedFadedStates = 8;
const retainedAlternatives = 8;
const symbolFont =
  "Noto Sans Symbols 2, Segoe UI Symbol, Apple Symbols, Arial Unicode MS, sans-serif";
const templateCache = new Map<string, Float32Array>();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function calibrationValues(
  calibration?: V9CalibrationObservation
): VisualCalibration {
  if (!calibration || calibration.confidence < 0.08) {
    return {
      sizes: planetGlyphSizes,
      fading: planetFadingOpacities
    };
  }

  return {
    sizes: calibration.planetSizeCentres,
    fading: calibration.fadingCentres
  };
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not access a v9 planetary template canvas");
  return context;
}

function templateMask(
  glyph: string,
  rotation: number,
  sizeLevel: number,
  fadingLevel: number,
  values: VisualCalibration
): Float32Array {
  const sizeValue = values.sizes[sizeLevel] ?? planetGlyphSizes[sizeLevel]!;
  const fadingValue = values.fading[fadingLevel] ?? planetFadingOpacities[fadingLevel]!;
  const key = [
    glyph,
    rotation,
    sizeLevel,
    fadingLevel,
    sizeValue.toFixed(3),
    fadingValue.toFixed(4)
  ].join(":");
  const cached = templateCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = templateDimension;
  canvas.height = templateDimension;
  const context = canvasContext(canvas);
  const scale = templateDimension / cropSize;
  const size = sizeValue * scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * 30 * Math.PI / 180);
  context.globalAlpha = fadingValue;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 ${size}px ${symbolFont}`;
  context.fillStyle = "#fff";
  context.fillText(glyph, 0, 0);

  const pixels = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  ).data;
  const result = new Float32Array(templateDimension * templateDimension);

  for (let index = 0; index < result.length; index += 1) {
    result[index] = pixels[index * 4 + 3]! / 255;
  }

  templateCache.set(key, result);
  return result;
}

function observedMask(
  image: ImageData,
  reference: GreyReference,
  point: Point
): Float32Array {
  const result = new Float32Array(templateDimension * templateDimension);
  const scaleX = image.width / 1024;
  const scaleY = image.height / 1024;
  const startX = point.x - cropSize / 2;
  const startY = point.y - cropSize / 2;

  for (let row = 0; row < templateDimension; row += 1) {
    for (let column = 0; column < templateDimension; column += 1) {
      const x = (startX + (column + 0.5) / templateDimension * cropSize) * scaleX;
      const y = (startY + (row + 0.5) / templateDimension * cropSize) * scaleY;
      result[row * templateDimension + column] = foregroundEvidence(
        image,
        reference,
        x,
        y
      );
    }
  }
  return result;
}

function correlation(
  observed: Float32Array,
  expected: Float32Array,
  shiftX: number,
  shiftY: number
): number {
  let dot = 0;
  let observedLength = 0;
  let expectedLength = 0;

  for (let row = 0; row < templateDimension; row += 1) {
    const expectedRow = row - shiftY;
    if (expectedRow < 0 || expectedRow >= templateDimension) continue;

    for (let column = 0; column < templateDimension; column += 1) {
      const expectedColumn = column - shiftX;
      if (expectedColumn < 0 || expectedColumn >= templateDimension) continue;
      const observedValue = observed[row * templateDimension + column]!;
      const expectedValue = expected[expectedRow * templateDimension + expectedColumn]!;
      dot += observedValue * expectedValue;
      observedLength += observedValue * observedValue;
      expectedLength += expectedValue * expectedValue;
    }
  }

  const energy = observedLength + expectedLength;
  if (energy === 0) return 0;
  return clamp(2 * dot / energy, 0, 1);
}

function bestCorrelation(
  observed: Float32Array,
  expected: Float32Array
): number {
  let best = 0;

  for (let shiftY = -1; shiftY <= 1; shiftY += 1) {
    for (let shiftX = -1; shiftX <= 1; shiftX += 1) {
      best = Math.max(best, correlation(observed, expected, shiftX, shiftY));
    }
  }
  return best;
}

function anchorSamples(
  image: ImageData,
  reference: GreyReference,
  values: VisualCalibration
): readonly AnchorSample[] {
  const scale = image.width / 1024;
  const maximum = Math.max(...values.sizes, planetGlyphSizes.at(-1)!);
  const radius = Math.max(3, maximum * scale * 0.52);

  return Array.from({ length: planetAnchorCount }, (_unused, anchor) => {
    const point = planetAnchorPoint(anchor);
    return {
      anchor,
      point,
      score: patchEvidence(
        image,
        reference,
        point.x * scale,
        point.y * scale,
        radius
      )
    };
  })
    .sort((left, right) => right.score - left.score)
    .slice(0, retainedAnchors)
    .map((sample) => ({
      ...sample,
      observed: observedMask(image, reference, sample.point)
    }));
}

function coarseCandidates(
  glyph: string,
  anchors: readonly AnchorSample[],
  values: VisualCalibration
): readonly CoarseCandidate[] {
  const result: CoarseCandidate[] = [];

  for (const anchor of anchors) {
    for (let rotation = 0; rotation < planetRotationLevelCount; rotation += 1) {
      const expected = templateMask(
        glyph,
        rotation,
        nominalSizeLevel,
        nominalFadingLevel,
        values
      );
      const templateScore = correlation(anchor.observed, expected, 0, 0);
      result.push({
        anchor: anchor.anchor,
        rotation,
        observed: anchor.observed,
        score: templateScore * 0.86 + anchor.score * 0.14
      });
    }
  }

  return result
    .sort((left, right) => right.score - left.score)
    .slice(0, retainedCoarseStates);
}

function sizedCandidates(
  glyph: string,
  coarse: readonly CoarseCandidate[],
  values: VisualCalibration
): readonly SizedCandidate[] {
  const result: SizedCandidate[] = [];

  for (const candidate of coarse) {
    for (let size = 0; size < planetSizeLevelCount; size += 1) {
      const expected = templateMask(
        glyph,
        candidate.rotation,
        size,
        nominalFadingLevel,
        values
      );
      const sizeScore = bestCorrelation(candidate.observed, expected);
      result.push({
        ...candidate,
        size,
        sizeScore,
        score: candidate.score * 0.3 + sizeScore * 0.7
      });
    }
  }

  return result
    .sort((left, right) => right.score - left.score)
    .slice(0, retainedSizedStates);
}

function fadedCandidates(
  glyph: string,
  sized: readonly SizedCandidate[],
  values: VisualCalibration
): readonly FadedCandidate[] {
  const result: FadedCandidate[] = [];

  for (const candidate of sized) {
    for (let fading = 0; fading < values.fading.length; fading += 1) {
      const expected = templateMask(
        glyph,
        candidate.rotation,
        candidate.size,
        fading,
        values
      );
      const fadingScore = bestCorrelation(candidate.observed, expected);
      result.push({
        ...candidate,
        fading,
        fadingScore,
        score: candidate.score * 0.35 + fadingScore * 0.65
      });
    }
  }

  return result
    .sort((left, right) => right.score - left.score)
    .slice(0, retainedFadedStates);
}

function satelliteProfile(
  image: ImageData,
  reference: GreyReference,
  point: Point
): SatelliteProfile {
  const scale = image.width / 1024;
  const centreX = point.x * scale;
  const centreY = point.y * scale;
  const radius = Math.max(3, Math.ceil((satelliteDotRadii.at(-1)! + 3) * scale));
  let mass = 0;
  let peak = 0;
  let weightedRadius = 0;
  let weight = 0;

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > radius) continue;
      const evidence = foregroundEvidence(
        image,
        reference,
        centreX + offsetX,
        centreY + offsetY
      );
      peak = Math.max(peak, evidence);
      if (evidence < 0.1) continue;
      mass += evidence;
      weightedRadius += distance * evidence;
      weight += evidence;
    }
  }

  if (weight === 0 || peak < 0.12) {
    return { presence: 0, diameter: 0, confidence: 0 };
  }

  const meanRadius = weightedRadius / weight;
  const diameter = meanRadius * 2.8 / scale;
  const presence = clamp(
    mass / Math.max(1, Math.PI * radius * radius * 0.45),
    0,
    1
  );
  const confidence = clamp(peak * 0.5 + presence * 0.5, 0, 1);
  return { presence, diameter, confidence };
}

function satelliteProfiles(
  image: ImageData,
  reference: GreyReference,
  parent: Point,
  glyphSize: number
): readonly SatelliteProfile[] {
  return Array.from({ length: satellitePositionCount }, (_unused, position) => {
    return satelliteProfile(
      image,
      reference,
      satellitePoint(parent, glyphSize, position)
    );
  });
}

function sizeLikelihood(profile: SatelliteProfile, size: number): number {
  const expected = satelliteDotRadii[size]! * 2;
  const tolerance = Math.max(2, expected * 0.9);
  return clamp(1 - Math.abs(profile.diameter - expected) / tolerance, 0, 1);
}

function satelliteCandidates(
  profiles: readonly SatelliteProfile[]
): readonly SatelliteCandidate[] {
  const result: SatelliteCandidate[] = [];

  for (let small = 0; small < satellitePositionCount; small += 1) {
    for (let medium = 0; medium < satellitePositionCount; medium += 1) {
      if (medium === small) continue;

      for (let large = 0; large < satellitePositionCount; large += 1) {
        if (large === small || large === medium) continue;
        const selected = new Set([small, medium, large]);
        const selectedScore = (
          profiles[small]!.presence * sizeLikelihood(profiles[small]!, 0) +
          profiles[medium]!.presence * sizeLikelihood(profiles[medium]!, 1) +
          profiles[large]!.presence * sizeLikelihood(profiles[large]!, 2)
        ) / 3;
        const unselected = profiles.reduce((maximum, profile, position) => {
          return selected.has(position)
            ? maximum
            : Math.max(maximum, profile.presence);
        }, 0);
        const confidence = Math.min(
          profiles[small]!.confidence,
          profiles[medium]!.confidence,
          profiles[large]!.confidence
        );

        result.push({
          satellites: { small, medium, large },
          score: selectedScore * 0.72 +
            Math.max(0, selectedScore - unselected) * 0.18 +
            confidence * 0.1
        });
      }
    }
  }

  return result
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function alternatives(
  image: ImageData,
  reference: GreyReference,
  glyph: string,
  anchors: readonly AnchorSample[],
  values: VisualCalibration
): readonly PlanetaryAlternative[] {
  const coarse = coarseCandidates(glyph, anchors, values);
  const sized = sizedCandidates(glyph, coarse, values);
  const faded = fadedCandidates(glyph, sized, values);
  const candidates: Array<{
    readonly value: PlanetaryAlternative;
    readonly score: number;
  }> = [];

  for (const candidate of faded) {
    const point = planetAnchorPoint(candidate.anchor);
    const profiles = satelliteProfiles(
      image,
      reference,
      point,
      values.sizes[candidate.size] ?? planetGlyphSizes[candidate.size]!
    );

    for (const satellite of satelliteCandidates(profiles)) {
      const score = candidate.score * 0.78 + satellite.score * 0.22;
      candidates.push({
        score,
        value: {
          anchor: candidate.anchor,
          rotation: candidate.rotation,
          size: candidate.size,
          density: candidate.fading,
          satellites: satellite.satellites,
          confidence: score
        }
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0]?.score ?? 0;
  const unique = new Map<string, PlanetaryAlternative>();

  for (const candidate of candidates) {
    const value = candidate.value;
    const key = [
      value.anchor,
      value.rotation,
      value.size,
      value.density,
      value.satellites.small,
      value.satellites.medium,
      value.satellites.large
    ].join(":");
    if (unique.has(key)) continue;

    unique.set(key, {
      ...value,
      confidence: best === 0
        ? 0.001
        : clamp(candidate.score / best, 0.001, 1)
    });
    if (unique.size >= retainedAlternatives) break;
  }

  return [...unique.values()];
}

export function observeV9Planets(
  image: ImageData,
  calibration?: V9CalibrationObservation
): readonly PlanetaryObservation[] {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v9 planetary recognition requires a square normalised image");
  }

  const reference = greyReference(image);
  const values = calibrationValues(calibration);
  const anchors = anchorSamples(image, reference, values);

  return planetaryGlyphs.map((definition) => ({
    key: definition.key,
    alternatives: alternatives(
      image,
      reference,
      definition.glyph,
      anchors,
      values
    )
  }));
}
