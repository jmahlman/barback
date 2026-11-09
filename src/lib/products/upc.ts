/**
 * Barcode arithmetic. No I/O, no imports, no surprises.
 *
 * Validating locally matters for more than tidiness: a misread barcode that
 * reaches the network spends one of the hundred lookups the free UPCitemdb
 * tier allows per day, and poisons the cache with a miss for a code that was
 * never real.
 */

/** Digits only. Scanners and humans both add spaces, dashes and stray text. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D+/gu, "");
}

/**
 * The GTIN mod-10 check digit, computed over every digit but the last.
 *
 * Weights alternate 3 and 1 from the right, which means where the alternation
 * starts depends on the length — hence indexing from the end rather than the
 * start.
 */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/** Lengths we accept: EAN-8/UPC-E, UPC-A, EAN-13. */
const VALID_LENGTHS = new Set([8, 12, 13]);

/**
 * Normalize a scanned or typed barcode to its canonical stored form.
 *
 * UPC-A is structurally an EAN-13 with a leading zero, and different decoders
 * disagree about whether to report the zero, so a 12-digit code is padded to
 * 13 to keep one bottle from occupying two cache rows.
 *
 * EAN-8 is **not** padded. It is a different code in its own right, not a
 * short EAN-13, and zero-padding it would claim a product it has nothing to
 * do with.
 *
 * Returns null when there are no usable digits or too many of them.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (!VALID_LENGTHS.has(digits.length)) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}

/**
 * Does this barcode's check digit agree with the rest of it?
 *
 * Takes a raw or normalized code. A code that fails here never reaches the
 * network.
 */
export function isValidBarcode(raw: string): boolean {
  const code = normalizeBarcode(raw);
  if (!code) return false;
  // All-zeros passes the checksum arithmetic but is never a real product.
  if (/^0+$/u.test(code)) return false;
  const body = code.slice(0, -1);
  const given = code.charCodeAt(code.length - 1) - 48;
  return checkDigit(body) === given;
}

/** Format for display: "0 83664 87231 2". Grouping makes misreads visible. */
export function formatBarcode(code: string): string {
  if (code.length === 13) {
    return `${code[0]} ${code.slice(1, 7)} ${code.slice(7, 12)} ${code[12]}`;
  }
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}
