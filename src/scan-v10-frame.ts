import { v9ParityStarCount } from "./parity-v9.ts";
import type { RecoveredV9Record } from "./record-v9.ts";
import { tryRecoverV10Parity } from "./scan-v10-core.ts";
import { observeV10Orientation } from "./scan-v10-orientation.ts";
import { observeV10Parity } from "./scan-v10-parity.ts";
import type { V9ParityObservation } from "./scan-v9-parity.ts";

export interface V10FrameObservation {
  readonly orientation: number;
  readonly orientationConfidence: number;
  readonly canvas: HTMLCanvasElement;
  readonly parity: readonly V9ParityObservation[];
  readonly recovered: RecoveredV9Record | undefined;
}

export interface V10MergedObservation {
  readonly parity: readonly V9ParityObservation[];
  readonly recovered: RecoveredV9Record | undefined;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = canvas.getContext("2d", { willReadFrequently: true });
  if (!value) throw new Error("Could not access a v10 scanner canvas");
  return value;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function uprightCanvas(source: HTMLCanvasElement, angle: number): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;
  const targetContext = context(target);
  targetContext.translate(target.width / 2, target.height / 2);
  targetContext.rotate(-angle * Math.PI / 180);
  targetContext.drawImage(source, -source.width / 2, -source.height / 2);
  return target;
}

export async function observeV10Frame(
  source: HTMLCanvasElement
): Promise<V10FrameObservation> {
  const orientation = observeV10Orientation(imageData(source));
  const canvas = uprightCanvas(source, orientation.angle);
  const parity = observeV10Parity(imageData(canvas));
  return {
    orientation: orientation.angle,
    orientationConfidence: orientation.confidence,
    canvas,
    parity,
    recovered: tryRecoverV10Parity(parity)
  };
}

function mergeParity(
  frames: readonly V10FrameObservation[]
): readonly V9ParityObservation[] {
  const slots = frames[0]?.parity.length ?? v9ParityStarCount;

  return Array.from({ length: slots }, (_unused, slot) => {
    const scores = new Float32Array(256);
    const support = new Uint8Array(256);
    let strongestNull = 0;

    for (const frame of frames) {
      const observation = frame.parity[slot];
      if (!observation) continue;
      const frameWeight = 0.4 + frame.orientationConfidence * 0.6;

      if (observation.value === null) {
        strongestNull = Math.max(strongestNull, observation.confidence * frameWeight);
        continue;
      }

      scores[observation.value] += observation.confidence * frameWeight;
      support[observation.value] = Math.min(255, support[observation.value]! + 1);
    }

    const ranked = [...scores]
      .map((score, value) => ({
        value,
        score: score + Math.min(0.4, support[value]! * 0.06)
      }))
      .filter((value) => value.score > 0)
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const second = ranked[1];

    if (!best) {
      return {
        value: null,
        confidence: strongestNull,
        position: null,
        size: null,
        density: null,
        positionConfidence: 0,
        sizeConfidence: 0,
        densityConfidence: 0
      };
    }

    const margin = (best.score - (second?.score ?? 0)) / Math.max(best.score, 0.001);
    const confidence = Math.max(0, Math.min(1, margin));
    if (margin < 0.16 || best.score <= strongestNull * 0.9) {
      return {
        value: null,
        confidence,
        position: null,
        size: null,
        density: null,
        positionConfidence: confidence,
        sizeConfidence: confidence,
        densityConfidence: confidence
      };
    }

    const source = frames
      .map((frame) => frame.parity[slot])
      .find((observation) => observation?.value === best.value);

    return {
      value: best.value,
      confidence,
      position: source?.position ?? null,
      size: source?.size ?? null,
      density: source?.density ?? null,
      positionConfidence: source?.positionConfidence ?? confidence,
      sizeConfidence: source?.sizeConfidence ?? confidence,
      densityConfidence: source?.densityConfidence ?? confidence
    };
  });
}

export function mergeV10Frames(
  frames: readonly V10FrameObservation[]
): V10MergedObservation {
  if (frames.length === 0) {
    return { parity: [], recovered: undefined };
  }
  const parity = mergeParity(frames);
  return {
    parity,
    recovered: tryRecoverV10Parity(parity)
  };
}
