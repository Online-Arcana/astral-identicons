import {
  calc,
  webPorts,
  type Calculation,
} from "../vendor/astral-chart-wheel/dist/web.js";
import {
  wheelData,
  type PublicWheelMeta,
} from "../vendor/astral-chart-wheel/dist/wheel.js";
import { astralSource, type AstralIdenticonSource } from "./astral.ts";
import { signs, type Sign } from "./sign.ts";

const previewPlaceId = "csc:GB:ENG:1";
const testMagic = new TextEncoder().encode("ASTRTEST1");
const astralMagic = new TextEncoder().encode("ASTRPKG");
const encoder = new TextEncoder();
const pointSigns = {
  solar: "sun",
  lunar: "moon",
  ascendant: "ascendant",
  midheaven: "midheaven",
  descendant: "descendant",
  imumCoeli: "imum_coeli",
} as const;

const hasPrefix = (bytes: Uint8Array, prefix: Uint8Array): boolean => {
  if (bytes.byteLength < prefix.byteLength) return false;
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
};

export const normaliseAstralTransport = (bytes: Uint8Array): Uint8Array => {
  if (!hasPrefix(bytes, testMagic)) return bytes;
  const inner = bytes.slice(testMagic.byteLength);
  if (!hasPrefix(inner, astralMagic)) {
    throw new Error("TEST-ONLY astral wrapper does not contain an ASTRPKG payload");
  }
  return inner;
};

const randomIndex = (length: number): number => {
  if (!Number.isInteger(length) || length < 1) throw new Error("Random range must be positive");
  const limit = Math.floor(0x100000000 / length) * length;
  const value = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(value);
    if (value[0]! < limit) return value[0]! % length;
  }
};

const pad = (value: number): string => String(value).padStart(2, "0");

const randomDate = (): string => {
  const first = Date.UTC(1950, 0, 1);
  const last = Date.UTC(2049, 11, 31);
  const day = 86_400_000;
  const days = Math.floor((last - first) / day);
  return new Date(first + randomIndex(days + 1) * day).toISOString().slice(0, 10);
};

const randomTime = (): string => `${pad(randomIndex(24))}:${pad(randomIndex(60))}`;

const longitude = (value: number | null, label: string): number => {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Random preview chart has no ${label} longitude`);
  }
  return value;
};

const signAt = (value: number): Sign => signs[Math.floor(((value % 360) + 360) % 360 / 30)]!;

export const publicWheelFromCalculation = (calculation: Calculation): PublicWheelMeta => {
  const data = wheelData(calculation);
  const selected = data.houses[data.primaryHouseSystem];
  return {
    schema: "astral-public-wheel/1.0.0",
    calculationFingerprint: data.fingerprint,
    primaryHouseSystem: data.primaryHouseSystem,
    points: Object.fromEntries(Object.entries(data.points).map(([id, point]) => [
      id,
      point.position.value?.longitudeDegrees ?? null,
    ])) as PublicWheelMeta["points"],
    houses: {
      status: selected.status,
      houses: Object.fromEntries(Object.entries(selected.houses).map(([number, house]) => [
        number,
        {
          number: house.number,
          cuspLongitudeDegrees: house.cusp.value?.longitudeDegrees ?? null,
          endLongitudeDegrees: house.end.value?.longitudeDegrees ?? null,
        },
      ])) as PublicWheelMeta["houses"]["houses"],
    },
    aspects: data.aspects.map((aspect) => ({ ...aspect })),
  };
};

const previewContainer = (wheel: PublicWheelMeta): Uint8Array => {
  const values = Object.fromEntries(Object.entries(pointSigns).map(([name, point]) => [
    name,
    signAt(longitude(wheel.points[point], point)),
  ])) as Record<keyof typeof pointSigns, Sign>;
  const publicMeta = encoder.encode(JSON.stringify({
    schema: "astral-public-meta/1.0.0",
    signs: {
      solar: values.solar,
      lunar: values.lunar,
      ascending: values.ascendant,
      midheaven: values.midheaven,
      descending: values.descendant,
      imumCoeli: values.imumCoeli,
    },
    wheel,
  }));
  const headSize = 92 + publicMeta.byteLength;
  const cipherSize = 16;
  const output = new Uint8Array(headSize + cipherSize);
  output.set(encoder.encode("ASTRPKG5"), 0);
  output[8] = 5;
  output[9] = 0;
  output[10] = 1;
  output[11] = 1;
  output[12] = 0;
  output[13] = 2;
  output[14] = 0;
  output[15] = 0;
  const view = new DataView(output.buffer);
  view.setUint32(16, 1_200_000, false);
  view.setUint32(20, 1, false);
  view.setUint32(24, cipherSize, false);
  view.setUint32(28, headSize, false);
  crypto.getRandomValues(output.subarray(32, 60));
  crypto.getRandomValues(output.subarray(60, 92));
  output.set(publicMeta, 92);
  crypto.getRandomValues(output.subarray(headSize));
  return output;
};

let portsBase = "";
let portsPromise: ReturnType<typeof webPorts> | null = null;
const previewPorts = (base: URL): ReturnType<typeof webPorts> => {
  const href = base.href;
  if (portsPromise === null || portsBase !== href) {
    portsBase = href;
    portsPromise = webPorts(base, "astral-identicons-preview/1.0.0");
  }
  return portsPromise;
};

export interface RandomAstralPreview {
  readonly bytes: Uint8Array;
  readonly source: AstralIdenticonSource;
  readonly calculation: Calculation;
}

export const randomAstralPreview = async (pageBase: string | URL): Promise<RandomAstralPreview> => {
  const places = new URL("assets/preview-places/", pageBase);
  const ports = await previewPorts(places);
  let last: unknown = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const calculation = await calc({
        date: randomDate(),
        time: randomTime(),
        timeAccuracy: "exact",
        placeId: previewPlaceId,
      }, {
        zodiac: "tropical",
        ayanamsha: "lahiri",
      }, ports);
      const wheel = publicWheelFromCalculation(calculation);
      longitude(wheel.points.sun, "Sun");
      longitude(wheel.points.moon, "Moon");
      longitude(wheel.points.ascendant, "Ascendant");
      longitude(wheel.points.descendant, "Descendant");
      longitude(wheel.points.midheaven, "Midheaven");
      longitude(wheel.points.imum_coeli, "Imum Coeli");
      if (wheel.houses.status === "unavailable") {
        throw new Error("Random preview chart has no calculated houses");
      }
      const bytes = previewContainer(wheel);
      return { bytes, source: astralSource(bytes), calculation };
    } catch (cause: unknown) {
      last = cause;
    }
  }

  throw last instanceof Error ? last : new Error("Could not calculate a complete random preview chart");
};
