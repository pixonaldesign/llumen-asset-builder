/** Parse NYC DEP `of_size` strings (pipe diameter or W×H) into square feet. */

function parseMixedNumber(raw: string): number | undefined {
  const mixed = raw.match(/^(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den) return whole + num / den;
  }
  const frac = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (den) return Number(frac[1]) / den;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Sum feet and inch tokens in one dimension, e.g. `12' 9' 5-3/4"` or `48"`. */
export function parseLengthInches(text: string): number | undefined {
  let inches = 0;
  let found = false;
  const feetRe = /(\d+(?:\.\d+)?)\s*'/g;
  let match: RegExpExecArray | null;
  while ((match = feetRe.exec(text))) {
    inches += Number(match[1]) * 12;
    found = true;
  }
  const inchRe =
    /(\d+\s*-\s*\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*"/g;
  while ((match = inchRe.exec(text))) {
    const value = parseMixedNumber(match[1]!.replace(/\s+/g, ""));
    if (value === undefined) continue;
    inches += value;
    found = true;
  }
  return found && inches > 0 ? inches : undefined;
}

export function parseOutfallSize(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim().toUpperCase();
  if (!text) return undefined;

  const copies = /\b(DBL|DOUBLE|DUAL)\b/.test(text) ? 2 : 1;
  const isCircle = /\b(DIA|DIAM|FLAP|CIRC)\b/.test(text);
  const isEgg = /\bEGG\b/.test(text);

  const areaFromInches = (areaSqIn: number) => (areaSqIn * copies) / 144;

  if (isCircle) {
    const diameter = parseLengthInches(text);
    if (!diameter) return undefined;
    const radius = diameter / 2;
    return areaFromInches(Math.PI * radius * radius);
  }

  const parts = text.split(/\s*X\s*/);
  if (parts.length >= 2) {
    const width = parseLengthInches(parts[0]!);
    const height = parseLengthInches(parts[1]!);
    if (!width || !height) return undefined;
    if (isEgg) {
      return areaFromInches(Math.PI * (width / 2) * (height / 2));
    }
    return areaFromInches(width * height);
  }

  return undefined;
}
