import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatBarcode, isValidBarcode, normaliseBarcode } from "@/lib/products/upc";

/**
 * Barcode arithmetic. These are the rules that decide whether a scan reaches
 * the network at all, so getting them wrong costs a lookup from a daily
 * allowance of a hundred — and silently accepts codes that were misread.
 */

describe("normaliseBarcode", () => {
  test("keeps a 13-digit EAN-13 as it is", () => {
    assert.equal(normaliseBarcode("0619947000020"), "0619947000020");
  });

  test("pads a 12-digit UPC-A to 13, since the two are the same code", () => {
    assert.equal(normaliseBarcode("619947000020"), "0619947000020");
  });

  test("leaves EAN-8 at eight digits rather than padding it", () => {
    // Padding would claim a completely different product.
    assert.equal(normaliseBarcode("12345670"), "12345670");
  });

  test("ignores the spaces a person types", () => {
    assert.equal(normaliseBarcode("0 619947 00002 0"), "0619947000020");
  });

  test("ignores dashes", () => {
    assert.equal(normaliseBarcode("0-619947-000020"), "0619947000020");
  });

  test("rejects a length that is not a barcode", () => {
    assert.equal(normaliseBarcode("12345"), null);
    assert.equal(normaliseBarcode("12345678901234"), null);
  });

  test("rejects text with no digits", () => {
    assert.equal(normaliseBarcode("not a barcode"), null);
    assert.equal(normaliseBarcode(""), null);
  });
});

describe("isValidBarcode", () => {
  test("accepts real codes", () => {
    assert.equal(isValidBarcode("0619947000020"), true); // Tito's
    assert.equal(isValidBarcode("0885909950805"), true);
  });

  test("accepts an unpadded UPC-A", () => {
    assert.equal(isValidBarcode("619947000020"), true);
  });

  test("rejects a single wrong digit", () => {
    // The whole point of a check digit: one misread and it does not add up.
    assert.equal(isValidBarcode("0619947000021"), false);
    assert.equal(isValidBarcode("0885909950806"), false);
  });

  test("rejects all zeros, which pass the arithmetic but are not a product", () => {
    assert.equal(isValidBarcode("0000000000000"), false);
    assert.equal(isValidBarcode("00000000"), false);
  });

  test("rejects anything that does not normalise", () => {
    assert.equal(isValidBarcode("12345"), false);
    assert.equal(isValidBarcode(""), false);
  });

  test("validates EAN-8 on its own eight digits", () => {
    assert.equal(isValidBarcode("12345670"), true);
    assert.equal(isValidBarcode("12345671"), false);
  });
});

describe("formatBarcode", () => {
  test("groups a 13-digit code the way it is printed", () => {
    assert.equal(formatBarcode("0083664872312"), "0 083664 87231 2");
  });

  test("splits an 8-digit code in half", () => {
    assert.equal(formatBarcode("12345670"), "1234 5670");
  });

  test("leaves an unexpected length alone rather than mangling it", () => {
    assert.equal(formatBarcode("123"), "123");
  });
});
