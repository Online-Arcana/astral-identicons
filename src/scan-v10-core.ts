import {
  recoverV9Record,
  v9DataByteCount,
  v9ParityByteCount,
  type RecoveredV9Record,
  type V9ByteObservation
} from "./record-v9.ts";

const missingData: readonly V9ByteObservation[] = Array.from(
  { length: v9DataByteCount },
  () => ({ value: null, confidence: 0 })
);

export function recoverV10Parity(
  parity: readonly V9ByteObservation[]
): RecoveredV9Record {
  if (parity.length !== v9ParityByteCount) {
    throw new Error(`v10 parity observation must contain ${v9ParityByteCount} stars`);
  }
  return recoverV9Record({ data: missingData, parity });
}

export function tryRecoverV10Parity(
  parity: readonly V9ByteObservation[]
): RecoveredV9Record | undefined {
  try {
    return recoverV10Parity(parity);
  } catch {
    return undefined;
  }
}
