/**
 * A standalone "2/3" or "1/4" on a task line is progress, not a date.
 * Small fractions (denominator 1–10, numerator not above the denominator)
 * are blanked out before date parsing so chrono never sees them.
 */

const FRACTION = /(^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?=$|[\s，,。；;)）])/g;

let enabled = true;

export function setProgressFractions(value: boolean): void {
  enabled = value;
}

export function isProgressFraction(numerator: number, denominator: number) {
  return denominator > 0 && denominator <= 10 && numerator <= denominator;
}

/**
 * Replace progress fractions with spaces of the same length, so match
 * indices into the masked text still line up with the original text.
 */
export function maskProgressFractions(text: string): string {
  if (!enabled) return text;
  return text.replace(
    FRACTION,
    (match: string, lead: string, num: string, den: string) =>
      isProgressFraction(Number(num), Number(den))
        ? lead + ' '.repeat(match.length - lead.length)
        : match,
  );
}
