/**
 * pixelDecoder.js
 *
 * FR-09 Stage 3: Core Pixel Decoders and Normalization Utilities.
 *
 * Provides:
 * 1. PixelDecoderError custom error class.
 * 2. decodeGrayscale1Bpp: Unpacks 1-bit-per-pixel (8 pixels/byte) with row pitch and row padding handling (resolves Finding H-1).
 * 3. decodeRgb24: Expands 24-bit RGB (3 bytes/pixel) to 32-bit RGBA.
 * 4. decodeRgba32: Validates and normalizes 32-bit RGBA.
 * 5. decodeImagePixels: Unified dispatcher for PDF.js image objects.
 * 6. resolveImageObject: Resolves paintImageXObject and paintInlineImageXObject without assuming all images are XObjects (resolves Finding M-2).
 * 7. createPngBufferFromRgba: Encodes normalized RGBA pixel buffers into valid PNGs via @napi-rs/canvas.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

/**
 * Standard PNG magic bytes signature: \x89PNG\r\n\x1a\n
 */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * PDF.js ImageKind enum values.
 */
export const ImageKind = Object.freeze({
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3,
});

/**
 * Maximum allowed dimension for any single side (width or height) in pixels.
 * Default: 16,384 pixels (standard 2D Graphics/Canvas texture dimension ceiling).
 */
export const MAX_IMAGE_DIMENSION = 16384;

/**
 * Maximum allowed total pixel count (width * height).
 * Default: 40,000,000 pixels (40 megapixels, allowing up to ~6324 x ~6324).
 * Enforces an upper heap allocation bound of ~160 MB for RGBA buffers to protect
 * worker processes from heap exhaustion caused by malicious or corrupt PDFs.
 */
export const MAX_TOTAL_PIXELS = 40_000_000;

/**
 * Validates image dimensions against positive integer constraints and resource bounds.
 *
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {number} [options.maxDimension] - Optional override for max single dimension
 * @param {number} [options.maxPixels] - Optional override for max total pixels
 * @returns {number} Total pixel count (width * height)
 */
export function validateImageDimensions(width, height, options = {}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new PixelDecoderError(
      `Invalid dimensions: width=${width}, height=${height}. Must be positive integers.`,
      { code: "INVALID_DIMENSIONS" }
    );
  }

  const maxDim = options.maxDimension ?? MAX_IMAGE_DIMENSION;
  const maxPixels = options.maxPixels ?? MAX_TOTAL_PIXELS;

  if (width > maxDim || height > maxDim) {
    throw new PixelDecoderError(
      `Image dimensions exceed maximum allowed side length (${Math.max(width, height)} > ${maxDim})`,
      { code: "DIMENSION_LIMIT_EXCEEDED" }
    );
  }

  const totalPixels = width * height;
  if (totalPixels > maxPixels) {
    throw new PixelDecoderError(
      `Image pixel count exceeds maximum allowed limit (${totalPixels} > ${maxPixels})`,
      { code: "PIXEL_LIMIT_EXCEEDED" }
    );
  }

  return totalPixels;
}

/**
 * Custom error class for pixel decoding and format conversion errors.
 */
export class PixelDecoderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "PixelDecoderError";
    this.code = options.code || "PIXEL_DECODER_ERROR";
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Decodes 1BPP (1 bit per pixel) grayscale bitmap data into an RGBA Uint8ClampedArray.
 *
 * In PDF.js / PDF standard:
 * - 8 pixels are packed per byte.
 * - MSB (most significant bit, bit 7) corresponds to the leftmost pixel (pixel 0).
 * - Row pitch is Math.ceil(width / 8) bytes.
 * - Widths not divisible by 8 leave trailing unused padding bits in the last byte of each row
 *   which MUST be skipped when stepping to the next row.
 * - Standard DeviceGray polarity: 0 = black (#000000), 1 = white (#FFFFFF).
 * - Options.inverseDecode / options.invert: inverts polarity (0 = white, 1 = black).
 *
 * @param {Uint8Array|Buffer} data - Packed 1BPP pixel buffer
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {object} [options] - Decoding options (e.g. { inverseDecode: boolean })
 * @returns {Uint8ClampedArray} 32-bit RGBA pixel array (width * height * 4)
 */
export function decodeGrayscale1Bpp(data, width, height, options = {}) {
  const totalPixels = validateImageDimensions(width, height, options);

  if (!data || !(data instanceof Uint8Array || Buffer.isBuffer(data))) {
    throw new PixelDecoderError("Invalid pixel data: expected Uint8Array or Buffer.", {
      code: "INVALID_BUFFER",
    });
  }

  const rowPitch = Math.ceil(width / 8);
  const minExpectedLength = rowPitch * height;

  if (data.length < minExpectedLength) {
    throw new PixelDecoderError(
      `Truncated 1BPP pixel buffer: expected at least ${minExpectedLength} bytes (${rowPitch} bytes/row * ${height} rows), received ${data.length}`,
      { code: "TRUNCATED_BUFFER" }
    );
  }

  const invert = Boolean(options.inverseDecode || options.invert);
  const zeroVal = invert ? 255 : 0;
  const oneVal = invert ? 0 : 255;

  const dst = new Uint8ClampedArray(totalPixels * 4);

  for (let y = 0; y < height; y++) {
    const rowStartByte = y * rowPitch;
    const rowDstOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const byteVal = data[rowStartByte + (x >> 3)];
      const bitOffset = 7 - (x & 7);
      const bit = (byteVal >> bitOffset) & 1;
      const pixelVal = bit === 1 ? oneVal : zeroVal;

      const dstIdx = rowDstOffset + (x * 4);
      dst[dstIdx] = pixelVal;         // R
      dst[dstIdx + 1] = pixelVal;     // G
      dst[dstIdx + 2] = pixelVal;     // B
      dst[dstIdx + 3] = 255;         // A (opaque)
    }
  }

  return dst;
}

/**
 * Decodes 24-bit RGB (3 bytes per pixel) into a 32-bit RGBA Uint8ClampedArray with alpha = 255.
 *
 * @param {Uint8Array|Buffer} data - 24BPP RGB buffer
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Uint8ClampedArray} 32-bit RGBA pixel array (width * height * 4)
 */
export function decodeRgb24(data, width, height, options = {}) {
  const totalPixels = validateImageDimensions(width, height, options);

  if (!data || !(data instanceof Uint8Array || Buffer.isBuffer(data))) {
    throw new PixelDecoderError("Invalid pixel data: expected Uint8Array or Buffer.", {
      code: "INVALID_BUFFER",
    });
  }

  const minExpectedLength = totalPixels * 3;
  if (data.length < minExpectedLength) {
    throw new PixelDecoderError(
      `Truncated RGB_24BPP pixel buffer: expected at least ${minExpectedLength} bytes (${totalPixels} pixels * 3 bytes), received ${data.length}`,
      { code: "TRUNCATED_BUFFER" }
    );
  }

  const dst = new Uint8ClampedArray(totalPixels * 4);

  for (let s = 0, d = 0; s < minExpectedLength; s += 3, d += 4) {
    dst[d] = data[s];         // R
    dst[d + 1] = data[s + 1]; // G
    dst[d + 2] = data[s + 2]; // B
    dst[d + 3] = 255;         // A
  }

  return dst;
}

/**
 * Decodes and validates 32-bit RGBA (4 bytes per pixel) into a 32-bit RGBA Uint8ClampedArray.
 *
 * @param {Uint8Array|Buffer} data - 32BPP RGBA buffer
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {object} [options] - Decoding and limit options
 * @returns {Uint8ClampedArray} 32-bit RGBA pixel array (width * height * 4)
 */
export function decodeRgba32(data, width, height, options = {}) {
  const totalPixels = validateImageDimensions(width, height, options);

  if (!data || !(data instanceof Uint8Array || Buffer.isBuffer(data))) {
    throw new PixelDecoderError("Invalid pixel data: expected Uint8Array or Buffer.", {
      code: "INVALID_BUFFER",
    });
  }

  const minExpectedLength = totalPixels * 4;
  if (data.length < minExpectedLength) {
    throw new PixelDecoderError(
      `Truncated RGBA_32BPP pixel buffer: expected at least ${minExpectedLength} bytes, received ${data.length}`,
      { code: "TRUNCATED_BUFFER" }
    );
  }

  const dst = new Uint8ClampedArray(minExpectedLength);
  const slice = data.subarray ? data.subarray(0, minExpectedLength) : data.slice(0, minExpectedLength);
  dst.set(slice);

  return dst;
}

/**
 * Unified pixel decoder for PDF.js image objects.
 * Dispatches to decodeGrayscale1Bpp, decodeRgb24, or decodeRgba32 based on imageObj.kind.
 *
 * @param {object} imageObj - Decoded image object containing { width, height, kind, data }
 * @param {object} [options] - Decoding options (e.g. { inverseDecode: boolean, maxDimension, maxPixels })
 * @returns {Uint8ClampedArray} Decoded 32-bit RGBA pixel array
 */
export function decodeImagePixels(imageObj, options = {}) {
  if (!imageObj || typeof imageObj !== "object") {
    throw new PixelDecoderError("Invalid image object: expected non-null object", {
      code: "INVALID_OBJECT",
    });
  }

  const { width, height, kind, data } = imageObj;

  if (!width || !height || !data) {
    throw new PixelDecoderError(
      `Incomplete image object: width=${width}, height=${height}, hasData=${Boolean(data)}`,
      { code: "INCOMPLETE_OBJECT" }
    );
  }

  if (kind === ImageKind.GRAYSCALE_1BPP || kind === pdfjs.ImageKind.GRAYSCALE_1BPP) {
    return decodeGrayscale1Bpp(data, width, height, options);
  }

  if (kind === ImageKind.RGB_24BPP || kind === pdfjs.ImageKind.RGB_24BPP) {
    return decodeRgb24(data, width, height, options);
  }

  if (kind === ImageKind.RGBA_32BPP || kind === pdfjs.ImageKind.RGBA_32BPP) {
    return decodeRgba32(data, width, height, options);
  }

  throw new PixelDecoderError(`Unsupported image kind: ${kind}`, {
    code: "UNSUPPORTED_IMAGE_KIND",
  });
}

/**
 * Resolves an image object from PDF.js page operator stream.
 *
 * Correctly distinguishes between:
 * - paintImageXObject: args[0] is an object ID string, resolved asynchronously via page.objs.get(objId, callback).
 * - paintInlineImageXObject: args[0] is already the direct inline image dictionary (resolves Finding M-2).
 *
 * @param {object} page - PDF.js page proxy
 * @param {number} fn - Operator function code (e.g. pdfjs.OPS.paintImageXObject)
 * @param {Array} args - Operator argument list
 * @returns {Promise<object|null>} Resolved image object dictionary
 */
export function resolveImageObject(page, fn, args) {
  if (!args || !Array.isArray(args) || args.length === 0) {
    return Promise.reject(
      new PixelDecoderError("Invalid operator arguments: expected non-empty array", {
        code: "INVALID_ARGS",
      })
    );
  }

  // Handle paintInlineImageXObject: args[0] is the inline image dictionary itself
  if (fn === pdfjs.OPS.paintInlineImageXObject) {
    const inlineImg = args[0];
    if (!inlineImg || typeof inlineImg !== "object") {
      return Promise.reject(
        new PixelDecoderError("paintInlineImageXObject argument is not a valid image dictionary", {
          code: "INVALID_INLINE_OBJECT",
        })
      );
    }
    return Promise.resolve(inlineImg);
  }

  // Handle paintImageXObject: args[0] is the string object ID
  if (fn === pdfjs.OPS.paintImageXObject) {
    const objId = args[0];
    if (typeof objId !== "string") {
      return Promise.reject(
        new PixelDecoderError(`paintImageXObject expects string object ID, got ${typeof objId}`, {
          code: "INVALID_OBJECT_ID",
        })
      );
    }

    if (!page || !page.objs || typeof page.objs.get !== "function") {
      return Promise.reject(
        new PixelDecoderError("Invalid PDF page instance: missing objs.get method", {
          code: "INVALID_PAGE_INSTANCE",
        })
      );
    }

    return new Promise((resolve, reject) => {
      try {
        page.objs.get(objId, (resolvedObj) => {
          if (!resolvedObj) {
            resolve(null);
          } else {
            resolve(resolvedObj);
          }
        });
      } catch (err) {
        reject(
          new PixelDecoderError(`Failed to retrieve image object '${objId}' from page.objs`, {
            code: "PAGE_OBJS_ERROR",
            cause: err,
          })
        );
      }
    });
  }

  return Promise.reject(
    new PixelDecoderError(`Unsupported image operator function code: ${fn}`, {
      code: "UNSUPPORTED_OPERATOR",
    })
  );
}

/**
 * Encodes a normalized 32-bit RGBA pixel array into a valid PNG buffer using @napi-rs/canvas.
 *
 * @param {Uint8ClampedArray|Buffer} rgbaData - Normalized RGBA pixel array (width * height * 4)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Buffer} Encoded PNG buffer
 */
export function createPngBufferFromRgba(rgbaData, width, height, options = {}) {
  const totalPixels = validateImageDimensions(width, height, options);

  const expectedLength = totalPixels * 4;
  if (!rgbaData || rgbaData.length < expectedLength) {
    throw new PixelDecoderError(
      `RGBA buffer length mismatch: expected at least ${expectedLength} bytes, received ${rgbaData?.length ?? 0}`,
      { code: "BUFFER_LENGTH_MISMATCH" }
    );
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(width, height);

  const slice = rgbaData.subarray ? rgbaData.subarray(0, expectedLength) : rgbaData.slice(0, expectedLength);
  imgData.data.set(slice);
  ctx.putImageData(imgData, 0, 0);

  const pngBuffer = canvas.toBuffer("image/png");

  if (!pngBuffer || pngBuffer.length < 8 || !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PixelDecoderError("Canvas failed to produce a valid PNG buffer with standard signature", {
      code: "INVALID_PNG_OUTPUT",
    });
  }

  return pngBuffer;
}

