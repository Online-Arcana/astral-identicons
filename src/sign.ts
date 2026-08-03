export const signs = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces"
] as const;

export type Sign = (typeof signs)[number];

const set = new Set<string>(signs);

export function sign(value: unknown, field = "sign"): Sign {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a zodiac sign`);
  }

  const valueNormalised = value.trim().toLowerCase();
  if (!set.has(valueNormalised)) {
    throw new Error(`${field} must be one of: ${signs.join(", ")}`);
  }

  return valueNormalised as Sign;
}

export function label(value: Sign): string {
  return value[0]!.toUpperCase() + value.slice(1);
}
