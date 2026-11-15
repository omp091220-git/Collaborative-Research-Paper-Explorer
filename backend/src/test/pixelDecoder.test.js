/**
 * pixelDecoder.test.js
 *
 * Dedicated unit tests for FR-09 Stage 3 pixel decoder utilities:
 * 1. decodeGrayscale1Bpp: 1BPP bit-unpacking, MSB ordering, row padding, polarity inversion, truncation check (Resolves Finding H-1).
 * 2. decodeRgb24: 24-bit RGB expansion to 32-bit RGBA with full alpha.
 * 3. decodeRgba32: 32-bit RGBA validation and normalization.
 * 4. decodeImagePixels: Unified dispatcher based on PDF.js ImageKind.
 * 5. resolveImageObject: Inline image vs XObject resolution (Resolves Finding M-2).
 * 6. createPngBufferFromRgba: Valid PNG generation via @napi-rs/canvas.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  decodeGrayscale1Bpp,
  decodeRgb24,
  decodeRgba32,
  decodeImagePixels,
  resolveImageObject,
  createPngBufferFromRgba,
  validateImageDimensions,
  PixelDecoderError,
  ImageKind,
  PNG_SIGNATURE,
  MAX_IMAGE_DIMENSION,
  MAX_TOTAL_PIXELS,
} from "../utils/pixelDecoder.js";

describe("FR-09 Stage 3: Pixel Decoder Utilities", () => {
  describe("decodeGrayscale1Bpp (Resolves Finding H-1)", () => {
    it("correctly unpacks an all-black (0x00) 8x1 image", () => {
      const data = Buffer.from([0x00]);
      const rgba = decodeGrayscale1Bpp(data, 8, 1);

      assert.strictEqual(rgba.length, 8 * 1 * 4);
      for (let i = 0; i < 8; i++) {
        const offset = i * 4;
        assert.strictEqual(rgba[offset], 0, `Pixel ${i} R should be 0`);
        assert.strictEqual(rgba[offset + 1], 0, `Pixel ${i} G should be 0`);
        assert.strictEqual(rgba[offset + 2], 0, `Pixel ${i} B should be 0`);
        assert.strictEqual(rgba[offset + 3], 255, `Pixel ${i} A should be 255`);
      }
    });

    it("correctly unpacks an all-white (0xFF) 8x1 image", () => {
      const data = Buffer.from([0xff]);
      const rgba = decodeGrayscale1Bpp(data, 8, 1);

      assert.strictEqual(rgba.length, 8 * 1 * 4);
      for (let i = 0; i < 8; i++) {
        const offset = i * 4;
        assert.strictEqual(rgba[offset], 255, `Pixel ${i} R should be 255`);
        assert.strictEqual(rgba[offset + 1], 255, `Pixel ${i} G should be 255`);
        assert.strictEqual(rgba[offset + 2], 255, `Pixel ${i} B should be 255`);
        assert.strictEqual(rgba[offset + 3], 255, `Pixel ${i} A should be 255`);
      }
    });

    it("correctly unpacks alternating bits with MSB-first ordering (0b10100101 = 0xA5)", () => {
      // 0xA5: bits = [1, 0, 1, 0, 0, 1, 0, 1]
      const data = Buffer.from([0xa5]);
      const rgba = decodeGrayscale1Bpp(data, 8, 1);

      const expected = [255, 0, 255, 0, 0, 255, 0, 255];
      for (let i = 0; i < 8; i++) {
        const offset = i * 4;
        assert.strictEqual(rgba[offset], expected[i], `Pixel ${i} mismatch`);
        assert.strictEqual(rgba[offset + 1], expected[i]);
        assert.strictEqual(rgba[offset + 2], expected[i]);
        assert.strictEqual(rgba[offset + 3], 255);
      }
    });

    it("correctly inverts polarity when inverseDecode is true", () => {
      // With inverseDecode: 0 = white (255), 1 = black (0)
      const data = Buffer.from([0xa5]); // [1, 0, 1, 0, 0, 1, 0, 1]
      const rgba = decodeGrayscale1Bpp(data, 8, 1, { inverseDecode: true });

      const expected = [0, 255, 0, 255, 255, 0, 255, 0];
      for (let i = 0; i < 8; i++) {
        const offset = i * 4;
        assert.strictEqual(rgba[offset], expected[i], `Inverted pixel ${i} mismatch`);
      }
    });

    it("correctly skips row padding bits when image width is not a multiple of 8", () => {
      // Dimensions: width = 11, height = 2
      // Row pitch: Math.ceil(11 / 8) = 2 bytes per row. Total: 4 bytes.
      // Row 0: 11 pixels all-white (1).
      //   Byte 0: 8 bits of 1 = 0xFF (pixels 0-7)
      //   Byte 1: bits 7,6 are 1 (pixels 8-9), bit 5 is 1 (pixel 10), bits 4-0 are padding (set to 0) -> 0b11100000 = 0xE0
      // Row 1: 11 pixels all-black (0).
      //   Byte 2: 0x00
      //   Byte 3: 0x00 (even if padding bits in byte 1 were dirty, row 1 starts strictly at byte 2)
      // Test with dirty padding bits in Byte 1: 0b11111111 = 0xFF (padding bits are 1s, must be ignored!)
      const data = Buffer.from([0xff, 0xff, 0x00, 0x00]);
      const rgba = decodeGrayscale1Bpp(data, 11, 2);

      assert.strictEqual(rgba.length, 11 * 2 * 4);

      // Verify Row 0: all 11 pixels must be white (255)
      for (let x = 0; x < 11; x++) {
        const offset = x * 4;
        assert.strictEqual(rgba[offset], 255, `Row 0, Pixel ${x} should be white`);
        assert.strictEqual(rgba[offset + 3], 255);
      }

      // Verify Row 1: all 11 pixels must be black (0)
      for (let x = 0; x < 11; x++) {
        const offset = (11 + x) * 4;
        assert.strictEqual(rgba[offset], 0, `Row 1, Pixel ${x} should be black`);
        assert.strictEqual(rgba[offset + 3], 255);
      }
    });

    it("throws PixelDecoderError when 1BPP buffer is truncated", () => {
      // 10x2 requires 4 bytes. Provide only 3 bytes.
      const truncated = Buffer.from([0xff, 0xff, 0x00]);
      assert.throws(
        () => decodeGrayscale1Bpp(truncated, 10, 2),
        (err) => {
          assert.ok(err instanceof PixelDecoderError);
          assert.strictEqual(err.code, "TRUNCATED_BUFFER");
          assert.match(err.message, /Truncated 1BPP pixel buffer/);
          return true;
        }
      );
    });

    it("throws PixelDecoderError for invalid dimensions", () => {
      assert.throws(
        () => decodeGrayscale1Bpp(Buffer.from([0x00]), 0, 1),
        (err) => err instanceof PixelDecoderError && err.code === "INVALID_DIMENSIONS"
      );
      assert.throws(
        () => decodeGrayscale1Bpp(Buffer.from([0x00]), -5, 2),
        (err) => err instanceof PixelDecoderError && err.code === "INVALID_DIMENSIONS"
      );
    });
  });

  describe("decodeRgb24", () => {
    it("correctly expands 24BPP RGB to 32BPP RGBA with opaque alpha", () => {
      // 2x1 image: pixel 0 = Red (255, 0, 0), pixel 1 = Cyan (0, 255, 255)
      const data = Buffer.from([255, 0, 0, 0, 255, 255]);
      const rgba = decodeRgb24(data, 2, 1);

      assert.strictEqual(rgba.length, 8);
      // Pixel 0
      assert.deepStrictEqual(Array.from(rgba.subarray(0, 4)), [255, 0, 0, 255]);
      // Pixel 1
      assert.deepStrictEqual(Array.from(rgba.subarray(4, 8)), [0, 255, 255, 255]);
    });

    it("throws PixelDecoderError if RGB buffer is truncated", () => {
      const truncated = Buffer.from([255, 0, 0, 0]); // 4 bytes instead of 6 for 2x1
      assert.throws(
        () => decodeRgb24(truncated, 2, 1),
        (err) => err instanceof PixelDecoderError && err.code === "TRUNCATED_BUFFER"
      );
    });
  });

  describe("decodeRgba32", () => {
    it("normalizes a valid 32BPP RGBA buffer", () => {
      const data = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
      const rgba = decodeRgba32(data, 2, 1);

      assert.strictEqual(rgba.length, 8);
      assert.deepStrictEqual(Array.from(rgba), [10, 20, 30, 40, 50, 60, 70, 80]);
    });

    it("throws PixelDecoderError if RGBA buffer is truncated", () => {
      const truncated = Buffer.from([10, 20, 30]);
      assert.throws(
        () => decodeRgba32(truncated, 1, 1),
        (err) => err instanceof PixelDecoderError && err.code === "TRUNCATED_BUFFER"
      );
    });
  });

  describe("decodeImagePixels (Unified Dispatcher)", () => {
    it("dispatches kind: 1 (GRAYSCALE_1BPP) correctly", () => {
      const img = {
        width: 8,
        height: 1,
        kind: ImageKind.GRAYSCALE_1BPP,
        data: Buffer.from([0xff]),
      };
      const rgba = decodeImagePixels(img);
      assert.strictEqual(rgba.length, 32);
      assert.strictEqual(rgba[0], 255);
    });

    it("dispatches kind: 2 (RGB_24BPP) correctly", () => {
      const img = {
        width: 1,
        height: 1,
        kind: ImageKind.RGB_24BPP,
        data: Buffer.from([12, 34, 56]),
      };
      const rgba = decodeImagePixels(img);
      assert.deepStrictEqual(Array.from(rgba), [12, 34, 56, 255]);
    });

    it("dispatches kind: 3 (RGBA_32BPP) correctly", () => {
      const img = {
        width: 1,
        height: 1,
        kind: ImageKind.RGBA_32BPP,
        data: Buffer.from([1, 2, 3, 4]),
      };
      const rgba = decodeImagePixels(img);
      assert.deepStrictEqual(Array.from(rgba), [1, 2, 3, 4]);
    });

    it("throws PixelDecoderError on unsupported image kind", () => {
      const img = {
        width: 1,
        height: 1,
        kind: 99,
        data: Buffer.from([1, 2, 3, 4]),
      };
      assert.throws(
        () => decodeImagePixels(img),
        (err) => err instanceof PixelDecoderError && err.code === "UNSUPPORTED_IMAGE_KIND"
      );
    });
  });

  describe("resolveImageObject (Resolves Finding M-2)", () => {
    it("resolves paintInlineImageXObject synchronously from args[0]", async () => {
      const mockInlineImg = {
        width: 4,
        height: 4,
        kind: 2,
        data: Buffer.alloc(48),
      };

      const result = await resolveImageObject(null, pdfjs.OPS.paintInlineImageXObject, [mockInlineImg]);
      assert.strictEqual(result, mockInlineImg);
    });

    it("resolves paintImageXObject asynchronously from page.objs.get", async () => {
      const mockResolved = {
        width: 10,
        height: 10,
        kind: 3,
        data: Buffer.alloc(400),
      };

      const mockPage = {
        objs: {
          get(id, callback) {
            assert.strictEqual(id, "img_x1");
            callback(mockResolved);
          },
        },
      };

      const result = await resolveImageObject(mockPage, pdfjs.OPS.paintImageXObject, ["img_x1"]);
      assert.strictEqual(result, mockResolved);
    });

    it("resolves null when page.objs.get yields null for paintImageXObject", async () => {
      const mockPage = {
        objs: {
          get(id, callback) {
            callback(null);
          },
        },
      };

      const result = await resolveImageObject(mockPage, pdfjs.OPS.paintImageXObject, ["non_existent"]);
      assert.strictEqual(result, null);
    });

    it("rejects when passed unsupported operator function", async () => {
      await assert.rejects(
        () => resolveImageObject({}, 9999, ["test"]),
        (err) => err instanceof PixelDecoderError && err.code === "UNSUPPORTED_OPERATOR"
      );
    });
  });

  describe("createPngBufferFromRgba", () => {
    it("creates a valid PNG buffer with proper PNG signature and dimensions", () => {
      // 4x4 RGBA image (64 bytes)
      const rgba = new Uint8ClampedArray(4 * 4 * 4);
      rgba.fill(128); // Gray

      const png = createPngBufferFromRgba(rgba, 4, 4);

      assert.ok(Buffer.isBuffer(png));
      assert.ok(png.length > 8);
      assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE), "Must match PNG magic bytes");
    });

    it("throws PixelDecoderError if RGBA buffer length does not match dimensions", () => {
      const shortBuffer = new Uint8ClampedArray(10);
      assert.throws(
        () => createPngBufferFromRgba(shortBuffer, 4, 4),
        (err) => err instanceof PixelDecoderError && err.code === "BUFFER_LENGTH_MISMATCH"
      );
    });
  });

  describe("Dimension and Resource Limits", () => {
    it("validates normal dimensions within limits", () => {
      const totalPixels = validateImageDimensions(1920, 1080);
      assert.strictEqual(totalPixels, 1920 * 1080);
    });

    it("rejects non-integer, zero, or negative dimensions", () => {
      assert.throws(
        () => validateImageDimensions(0, 100),
        (err) => err instanceof PixelDecoderError && err.code === "INVALID_DIMENSIONS"
      );
      assert.throws(
        () => validateImageDimensions(100, -5),
        (err) => err instanceof PixelDecoderError && err.code === "INVALID_DIMENSIONS"
      );
      assert.throws(
        () => validateImageDimensions(100.5, 200),
        (err) => err instanceof PixelDecoderError && err.code === "INVALID_DIMENSIONS"
      );
    });

    it("rejects dimensions exceeding MAX_IMAGE_DIMENSION (16,384px)", () => {
      assert.throws(
        () => validateImageDimensions(MAX_IMAGE_DIMENSION + 1, 100),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
      assert.throws(
        () => validateImageDimensions(100, MAX_IMAGE_DIMENSION + 1),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
    });

    it("rejects total pixels exceeding MAX_TOTAL_PIXELS (40,000,000)", () => {
      // 10,000 x 5,000 = 50,000,000 pixels (> 40M)
      assert.throws(
        () => validateImageDimensions(10000, 5000),
        (err) => err instanceof PixelDecoderError && err.code === "PIXEL_LIMIT_EXCEEDED"
      );
    });

    it("supports customizable maxDimension and maxPixels options", () => {
      assert.throws(
        () => validateImageDimensions(500, 500, { maxDimension: 400 }),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
      assert.throws(
        () => validateImageDimensions(100, 100, { maxPixels: 5000 }),
        (err) => err instanceof PixelDecoderError && err.code === "PIXEL_LIMIT_EXCEEDED"
      );
    });

    it("enforces dimension limits across all decoder entrypoints before buffer allocation", () => {
      assert.throws(
        () => decodeGrayscale1Bpp(Buffer.alloc(10), 20000, 1),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
      assert.throws(
        () => decodeRgb24(Buffer.alloc(10), 20000, 1),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
      assert.throws(
        () => decodeRgba32(Buffer.alloc(10), 20000, 1),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
      assert.throws(
        () => createPngBufferFromRgba(Buffer.alloc(10), 20000, 1),
        (err) => err instanceof PixelDecoderError && err.code === "DIMENSION_LIMIT_EXCEEDED"
      );
    });
  });
});

