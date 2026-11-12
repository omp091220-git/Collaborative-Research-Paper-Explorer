/**
 * imageDeduplicator.js
 *
 * FR-09 Stage 3: Job-Scoped Image Deduplication Utility.
 *
 * Resolves Finding M-1: Duplicate extraction of shared image objects.
 *
 * Identifies shared PDF images across pages by:
 * 1. PDF object reference (ref.num + ref.gen) if available (primary key).
 * 2. Full cryptographic SHA-256 content hash of the raw pixel buffer combined
 *    with image dimensions and kind (deterministic fallback for inline or unreferenced images).
 */

import crypto from "node:crypto";

/**
 * Computes SHA-256 hexadecimal hash of a binary buffer or typed array.
 *
 * @param {Buffer|Uint8Array|Uint8ClampedArray} data
 * @returns {string} Hexadecimal hash string
 */
export function computeImageBufferHash(data) {
  if (!data) {
    throw new TypeError("Data buffer is required to compute image hash");
  }

  const hash = crypto.createHash("sha256");

  if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  } else {
    throw new TypeError(`Unsupported buffer type for hashing: ${typeof data}`);
  }

  return hash.digest("hex");
}

/**
 * Computes a deterministic identity key for an image object.
 *
 * Prioritizes PDF indirect object reference (ref), which guarantees that identical
 * XObjects reused on multiple pages share the same deduplication key.
 * Falls back to full SHA-256 hashing of pixel payload + dimensions + kind.
 *
 * @param {object} imageObj
 * @returns {string} Deduplication key
 */
export function computeImageKey(imageObj) {
  if (!imageObj || typeof imageObj !== "object") {
    throw new TypeError("Image object is required to compute deduplication key");
  }

  // Check for PDF indirect object reference (ref)
  if (imageObj.ref) {
    if (typeof imageObj.ref === "object" && imageObj.ref !== null && imageObj.ref.num !== undefined) {
      const gen = imageObj.ref.gen ?? 0;
      return `ref_${imageObj.ref.num}_${gen}`;
    }
    if (typeof imageObj.ref === "string" || typeof imageObj.ref === "number") {
      return `ref_${imageObj.ref}`;
    }
  }

  // Fallback: Full SHA-256 hash of entire pixel data buffer
  const { width, height, kind, data } = imageObj;
  if (!data) {
    throw new Error("Cannot compute fallback hash for image object without pixel data");
  }

  const contentHash = computeImageBufferHash(data);
  const dimKind = `${width ?? "w"}x${height ?? "h"}_k${kind ?? "k"}`;
  return `hash_${contentHash}_${dimKind}`;
}

/**
 * Job-scoped cache for deduplicating extracted images.
 */
export class ImageDeduplicator {
  constructor() {
    /** @type {Map<string, object>} */
    this.cache = new Map();
  }

  /**
   * Computes the deduplication key for an image object.
   *
   * @param {object} imageObj
   * @returns {string}
   */
  computeKey(imageObj) {
    return computeImageKey(imageObj);
  }

  /**
   * Checks whether the image has already been extracted/registered.
   *
   * @param {object} imageObj
   * @returns {boolean}
   */
  has(imageObj) {
    const key = this.computeKey(imageObj);
    return this.cache.has(key);
  }

  /**
   * Retrieves the previously registered asset record for an image.
   *
   * @param {object} imageObj
   * @returns {object|null}
   */
  get(imageObj) {
    const key = this.computeKey(imageObj);
    return this.cache.get(key) || null;
  }

  /**
   * Registers an extracted asset record under the image's identity key.
   *
   * @param {object} imageObj
   * @param {object} assetRecord
   * @returns {string} The identity key
   */
  register(imageObj, assetRecord) {
    if (!assetRecord || typeof assetRecord !== "object") {
      throw new TypeError("Asset record must be a non-null object");
    }
    const key = this.computeKey(imageObj);
    this.cache.set(key, assetRecord);
    return key;
  }

  /**
   * Removes an image from the deduplicator cache.
   *
   * @param {object} imageObj
   * @returns {boolean}
   */
  delete(imageObj) {
    const key = this.computeKey(imageObj);
    return this.cache.delete(key);
  }

  /**
   * Number of unique images registered.
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Clears the cache completely.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Returns iterator of [key, assetRecord] pairs.
   */
  entries() {
    return this.cache.entries();
  }

  /**
   * Returns iterator of registered keys.
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * Returns iterator of registered asset records.
   */
  values() {
    return this.cache.values();
  }
}

