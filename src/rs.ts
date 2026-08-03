type ByteSource = readonly number[] | Uint8Array;

const primitive = 0x11d;
const fieldSize = 256;
const order = fieldSize - 1;

const exponent = new Uint8Array(order * 2);
const logarithm = new Int16Array(fieldSize).fill(-1);

let fieldValue = 1;
for (let index = 0; index < order; index += 1) {
  exponent[index] = fieldValue;
  logarithm[fieldValue] = index;
  fieldValue <<= 1;
  if ((fieldValue & fieldSize) !== 0) fieldValue ^= primitive;
}
for (let index = order; index < exponent.length; index += 1) {
  exponent[index] = exponent[index - order]!;
}

function multiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return exponent[logarithm[left]! + logarithm[right]!]!;
}

function divide(left: number, right: number): number {
  if (right === 0) throw new Error("cannot divide by zero in GF(256)");
  if (left === 0) return 0;
  let index = logarithm[left]! - logarithm[right]!;
  if (index < 0) index += order;
  return exponent[index]!;
}

function power(value: number, degree: number): number {
  if (degree === 0) return 1;
  if (value === 0) return 0;
  let index = (logarithm[value]! * degree) % order;
  if (index < 0) index += order;
  return exponent[index]!;
}

function polynomialMultiply(left: readonly number[], right: readonly number[]): number[] {
  const result = Array<number>(left.length + right.length - 1).fill(0);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      result[leftIndex + rightIndex] ^= multiply(left[leftIndex]!, right[rightIndex]!);
    }
  }

  return result;
}

function generator(parityBytes: number): readonly number[] {
  let result: number[] = [1];

  for (let index = 0; index < parityBytes; index += 1) {
    result = polynomialMultiply(result, [1, exponent[index]!]);
  }

  return result;
}

function evaluate(codeword: ByteSource, value: number): number {
  let result = 0;
  for (const symbol of codeword) result = multiply(result, value) ^ symbol;
  return result;
}

export function rsSyndromes(codeword: ByteSource, parityBytes: number): Uint8Array {
  const result = new Uint8Array(parityBytes);
  for (let index = 0; index < parityBytes; index += 1) {
    result[index] = evaluate(codeword, exponent[index]!);
  }
  return result;
}

export function rsEncode(data: ByteSource, parityBytes: number): Uint8Array {
  if (!Number.isInteger(parityBytes) || parityBytes <= 0 || data.length + parityBytes > order) {
    throw new Error("invalid Reed-Solomon code dimensions");
  }

  const polynomial = generator(parityBytes);
  const work = new Uint8Array(data.length + parityBytes);
  work.set(data);

  for (let index = 0; index < data.length; index += 1) {
    const coefficient = work[index]!;
    if (coefficient === 0) continue;

    for (let offset = 0; offset < polynomial.length; offset += 1) {
      work[index + offset] ^= multiply(polynomial[offset]!, coefficient);
    }
  }

  const result = new Uint8Array(data.length + parityBytes);
  result.set(data);
  result.set(work.slice(data.length), data.length);
  return result;
}

export function rsValid(codeword: ByteSource, parityBytes: number): boolean {
  return rsSyndromes(codeword, parityBytes).every((value) => value === 0);
}

function solve(matrix: number[][], values: number[]): number[] {
  const size = values.length;

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    while (pivot < size && matrix[pivot]![column] === 0) pivot += 1;
    if (pivot === size) throw new Error("erasure equations are singular");

    [matrix[column], matrix[pivot]] = [matrix[pivot]!, matrix[column]!];
    [values[column], values[pivot]] = [values[pivot]!, values[column]!];

    const pivotValue = matrix[column]![column]!;
    for (let index = column; index < size; index += 1) {
      matrix[column]![index] = divide(matrix[column]![index]!, pivotValue);
    }
    values[column] = divide(values[column]!, pivotValue);

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row]![column]!;
      if (factor === 0) continue;

      for (let index = column; index < size; index += 1) {
        matrix[row]![index] ^= multiply(factor, matrix[column]![index]!);
      }
      values[row] ^= multiply(factor, values[column]!);
    }
  }

  return values;
}

export function rsRecoverErasures(
  damaged: ByteSource,
  parityBytes: number,
  erasures: readonly number[]
): Uint8Array {
  if (erasures.length === 0) return Uint8Array.from(damaged);
  if (erasures.length > parityBytes) {
    throw new Error(`cannot recover more than ${parityBytes} erased bytes`);
  }

  const unique = [...new Set(erasures)].sort((left, right) => left - right);
  if (unique.length !== erasures.length) throw new Error("erasure indexes must be unique");

  const result = Uint8Array.from(damaged);
  for (const index of unique) {
    if (!Number.isInteger(index) || index < 0 || index >= result.length) {
      throw new Error("erasure index is outside the codeword");
    }
    result[index] = 0;
  }

  const size = unique.length;
  const syndromes = rsSyndromes(result, size);
  const matrix: number[][] = [];

  for (let equation = 0; equation < size; equation += 1) {
    const root = exponent[equation]!;
    matrix.push(unique.map((position) => {
      return power(root, result.length - position - 1);
    }));
  }

  const recovered = solve(matrix, [...syndromes]);
  for (let index = 0; index < unique.length; index += 1) {
    result[unique[index]!] = recovered[index]!;
  }

  if (!rsValid(result, parityBytes)) {
    throw new Error("Reed-Solomon erasure recovery failed");
  }

  return result;
}
