/**
 * imageDeduplicator.test.js
 *
 * Dedicated unit tests for FR-09 Stage 3 Image Deduplicator:
 * 1. computeImageKey: Priority of PDF object reference (ref) vs SHA-256 content hashing.
 * 2. Deduplication across multiple pages sharing the same XObject reference (Resolves Finding M-1).
 * 3. Deduplication of identical inline image payloads via full-buffer SHA-256 hashing.
 * 4. Job cache isolation, size tracking, deletion, and clear operations.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  ImageDeduplicator,
  computeImageKey,
  computeImageBufferHash,
} from "../utils/imageDeduplicator.js";

describe("FR-09 Stage 3: Image Deduplicator Utility (Resolves Finding M-1)", () => {
  let deduplicator;

  beforeEach(() => {
    deduplicator = new ImageDeduplicator();
  });

  describe("computeImageKey", () => {
    it("prioritizes ref object with num and gen", () => {
      const imgObj = {
        ref: { num: 42, gen: 0 },
        width: 100,
        height: 100,
        data: Buffer.from([1, 2, 3]),
      };

      const key = computeImageKey(imgObj);
      assert.strictEqual(key, "ref_42_0");
    });

    it("supports string and number ref identifiers", () => {
      const imgObjStr = { ref: "45_0R", width: 50, height: 50, data: Buffer.from([1]) };
      assert.strictEqual(computeImageKey(imgObjStr), "ref_45_0R");

      const imgObjNum = { ref: 108, width: 50, height: 50, data: Buffer.from([1]) };
      assert.strictEqual(computeImageKey(imgObjNum), "ref_108");
    });

    it("falls back to full SHA-256 hash when ref is not present", () => {
      const pixelBuffer = Buffer.from([10, 20, 30, 40]);
      const expectedHash = computeImageBufferHash(pixelBuffer);

      const inlineImg = {
        width: 2,
        height: 2,
        kind: 1,
        data: pixelBuffer,
      };

      const key = computeImageKey(inlineImg);
      assert.strictEqual(key, `hash_${expectedHash}_2x2_k1`);
    });

    it("produces different hash keys for different pixel data or dimensions", () => {
      const imgA = { width: 2, height: 2, kind: 1, data: Buffer.from([1, 2, 3, 4]) };
      const imgB = { width: 2, height: 2, kind: 1, data: Buffer.from([1, 2, 3, 5]) };
      const imgC = { width: 4, height: 1, kind: 1, data: Buffer.from([1, 2, 3, 4]) };

      const keyA = computeImageKey(imgA);
      const keyB = computeImageKey(imgB);
      const keyC = computeImageKey(imgC);

      assert.notStrictEqual(keyA, keyB);
      assert.notStrictEqual(keyA, keyC);
    });

    it("correctly hashes TypedArray views with non-zero byteOffset using only the view bytes", () => {
      // Create a backing ArrayBuffer with 64 bytes
      const backingBuffer = new ArrayBuffer(64);
      const backingView = new Uint8Array(backingBuffer);
      // Fill backingView with sentinel noise
      backingView.fill(0xee);

      // Write identical logical payload at two completely different offsets
      const payloadBytes = [10, 20, 30, 40, 50, 60, 70, 80];
      const offset1 = 8;
      const offset2 = 32;

      for (let i = 0; i < payloadBytes.length; i++) {
        backingView[offset1 + i] = payloadBytes[i];
        backingView[offset2 + i] = payloadBytes[i];
      }

      // Create two distinct views pointing to the two different offsets within the same ArrayBuffer
      const view1 = new Uint8Array(backingBuffer, offset1, payloadBytes.length);
      const view2 = new Uint8Array(backingBuffer, offset2, payloadBytes.length);

      // Create a standalone Buffer with the exact same payload (offset 0)
      const standaloneBuffer = Buffer.from(payloadBytes);

      const img1 = { width: 2, height: 4, kind: 2, data: view1 };
      const img2 = { width: 2, height: 4, kind: 2, data: view2 };
      const imgStandalone = { width: 2, height: 4, kind: 2, data: standaloneBuffer };

      const key1 = computeImageKey(img1);
      const key2 = computeImageKey(img2);
      const keyStandalone = computeImageKey(imgStandalone);

      // Verify both views produce identical deduplication keys regardless of backing-buffer offset
      assert.strictEqual(key1, key2);
      assert.strictEqual(key1, keyStandalone);

      // Verify that changing unrelated bytes in the backing buffer does NOT change the view's hash
      backingView[0] = 0x99;
      backingView[60] = 0x99;
      assert.strictEqual(computeImageKey(img1), keyStandalone);

      // Verify that modifying bytes within the view DOES change the key
      backingView[offset1] = 99;
      assert.notStrictEqual(computeImageKey(img1), keyStandalone);
    });

    it("throws if image object is invalid or data is missing", () => {
      assert.throws(() => computeImageKey(null), /Image object is required/);
      assert.throws(() => computeImageKey({}), /without pixel data/);
    });
  });

  describe("ImageDeduplicator Cache Operations", () => {
    it("returns false / null for unknown images", () => {
      const imgObj = { ref: { num: 1, gen: 0 } };
      assert.strictEqual(deduplicator.has(imgObj), false);
      assert.strictEqual(deduplicator.get(imgObj), null);
    });

    it("registers and detects shared XObjects across pages by reference", () => {
      const page1Img = {
        ref: { num: 15, gen: 0 },
        width: 600,
        height: 400,
        data: Buffer.from("page1_payload"),
      };

      const page2Img = {
        ref: { num: 15, gen: 0 },
        width: 600,
        height: 400,
        data: Buffer.from("page2_payload"), // Even if separate buffers, same ref
      };

      const assetRecord = {
        assetId: "ast_12345",
        pageNumber: 1,
        assetType: "figure",
      };

      const registeredKey = deduplicator.register(page1Img, assetRecord);
      assert.strictEqual(registeredKey, "ref_15_0");
      assert.strictEqual(deduplicator.size, 1);

      // Page 2 check
      assert.strictEqual(deduplicator.has(page2Img), true);
      const cached = deduplicator.get(page2Img);
      assert.deepStrictEqual(cached, assetRecord);
    });

    it("deduplicates identical inline images by content hash", () => {
      const payload = Buffer.from("identical_logo_bytes");
      const inlineImg1 = { width: 50, height: 50, kind: 2, data: payload };
      const inlineImg2 = { width: 50, height: 50, kind: 2, data: Buffer.from("identical_logo_bytes") };

      const record = { assetId: "ast_inline_1", pageNumber: 3 };
      deduplicator.register(inlineImg1, record);

      assert.strictEqual(deduplicator.has(inlineImg2), true);
      assert.deepStrictEqual(deduplicator.get(inlineImg2), record);
    });

    it("supports delete and clear operations", () => {
      const img1 = { ref: { num: 1, gen: 0 } };
      const img2 = { ref: { num: 2, gen: 0 } };

      deduplicator.register(img1, { id: 1 });
      deduplicator.register(img2, { id: 2 });
      assert.strictEqual(deduplicator.size, 2);

      const deleted = deduplicator.delete(img1);
      assert.strictEqual(deleted, true);
      assert.strictEqual(deduplicator.size, 1);
      assert.strictEqual(deduplicator.has(img1), false);
      assert.strictEqual(deduplicator.has(img2), true);

      deduplicator.clear();
      assert.strictEqual(deduplicator.size, 0);
      assert.strictEqual(deduplicator.has(img2), false);
    });

    it("provides iterators for entries, keys, and values", () => {
      const img = { ref: { num: 99, gen: 0 } };
      deduplicator.register(img, { tag: "test" });

      const keys = Array.from(deduplicator.keys());
      const values = Array.from(deduplicator.values());
      const entries = Array.from(deduplicator.entries());

      assert.deepStrictEqual(keys, ["ref_99_0"]);
      assert.deepStrictEqual(values, [{ tag: "test" }]);
      assert.deepStrictEqual(entries, [["ref_99_0", { tag: "test" }]]);
    });
  });
});

