export interface V9ParityVisualState {
  readonly byte: number;
  readonly state: number;
  readonly position: number;
  readonly size: number;
  readonly density: number;
}

export const v9ParityStarCount = 32;
export const v9ParityPositionCount = 8;
export const v9ParitySizeLevelCount = 6;
export const v9ParityDensityLevelCount = 6;
export const v9ParityVisualStateCount =
  v9ParityPositionCount *
  v9ParitySizeLevelCount *
  v9ParityDensityLevelCount;
export const v9ParityReservedStateCount = v9ParityVisualStateCount - 256;

const stateMultiplier = 37;
const stateOffset = 17;
const inverseMultiplier = 109;

if (v9ParityVisualStateCount !== 288) {
  throw new Error("v9 parity-star visual capacity must be 288 states");
}
if ((stateMultiplier * inverseMultiplier) % v9ParityVisualStateCount !== 1) {
  throw new Error("v9 parity-star state permutation is not invertible");
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function visualState(byte: number): number {
  return modulo(
    byte * stateMultiplier + stateOffset,
    v9ParityVisualStateCount
  );
}

export function v9ParityVisualState(byte: number): V9ParityVisualState {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new Error("v9 parity symbol must be one byte");
  }

  const state = visualState(byte);
  const position = state % v9ParityPositionCount;
  const quotient = Math.floor(state / v9ParityPositionCount);
  const size = quotient % v9ParitySizeLevelCount;
  const density = Math.floor(quotient / v9ParitySizeLevelCount);

  return { byte, state, position, size, density };
}

export function v9ParityByte(
  position: number,
  size: number,
  density: number
): number {
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= v9ParityPositionCount
  ) {
    throw new Error("v9 parity-star position is invalid");
  }
  if (!Number.isInteger(size) || size < 0 || size >= v9ParitySizeLevelCount) {
    throw new Error("v9 parity-star size is invalid");
  }
  if (
    !Number.isInteger(density) ||
    density < 0 ||
    density >= v9ParityDensityLevelCount
  ) {
    throw new Error("v9 parity-star density is invalid");
  }

  const state =
    ((density * v9ParitySizeLevelCount) + size) *
      v9ParityPositionCount +
    position;
  const byte = modulo(
    (state - stateOffset) * inverseMultiplier,
    v9ParityVisualStateCount
  );

  if (byte > 255 || visualState(byte) !== state) {
    throw new Error("v9 parity-star configuration is a reserved state");
  }
  return byte;
}
