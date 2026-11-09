/**
 * regionCropper.test.js
 *
 * FR-09 Phase 3.2: Comprehensive Test Suite for Region Cropper and Viewport Projection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  clampCropBounds,
  resolveCropPadding,
  cropRegionFromPage,
  renderPageToCanvas,
  assertSafeCanvasDimensions,
  RegionCropperError,
  MAX_CANVAS_DIMENSION,
  MAX_CANVAS_PIXELS,
  BASELINE_PADDING_POINTS,
  MAX_CROP_PADDING_POINTS,
} from "../utils/regionCropper.js";

const ARXIV_SAMPLE_PATH = path.resolve("..", "uploads", "arxiv-2610.30421-1793047803831.pdf");
const NARBI_SAMPLE_PATH = path.resolve("..", "uploads", "1792858120105-narbi61ofg8.pdf");

describe("regionCropper — Viewport Bounding Box Clamping", () => {
  it("clamps rectangles that lie completely inside viewport", () => {
    const rect = { x: 50.2, y: 100.8, width: 200.4, height: 150.1 };
    const clamped = clampCropBounds(rect, 800, 1000);

    assert.ok(clamped);
    assert.equal(clamped.x, 50);
    assert.equal(clamped.y, 100);
    assert.equal(clamped.width, 201); // ceil(50.2 + 200.4) - 50 = 251 - 50 = 201
    assert.equal(clamped.height, 151); // ceil(100.8 + 150.1) - 100 = 251 - 100 = 151
  });

  it("clamps rectangles that overflow viewport boundaries (left, top, right, bottom)", () => {
    // Overflows left & top
    const overLeftTop = { x: -30, y: -40, width: 200, height: 150 };
    const clampLeftTop = clampCropBounds(overLeftTop, 500, 500);
    assert.ok(clampLeftTop);
    assert.equal(clampLeftTop.x, 0);
    assert.equal(clampLeftTop.y, 0);
    assert.equal(clampLeftTop.width, 170); // min(500, 170) - 0 = 170
    assert.equal(clampLeftTop.height, 110); // min(500, 110) - 0 = 110

    // Overflows right & bottom
    const overRightBottom = { x: 450, y: 460, width: 100, height: 80 };
    const clampRightBottom = clampCropBounds(overRightBottom, 500, 500);
    assert.ok(clampRightBottom);
    assert.equal(clampRightBottom.x, 450);
    assert.equal(clampRightBottom.y, 460);
    assert.equal(clampRightBottom.width, 50); // 500 - 450
    assert.equal(clampRightBottom.height, 40); // 500 - 460
  });

  it("returns null for completely disjoint or invalid rectangles", () => {
    // Entirely to the right
    assert.equal(clampCropBounds({ x: 600, y: 100, width: 50, height: 50 }, 500, 500), null);
    // Entirely below
    assert.equal(clampCropBounds({ x: 100, y: 700, width: 50, height: 50 }, 500, 500), null);
    // Entirely to the left
    assert.equal(clampCropBounds({ x: -100, y: 100, width: 50, height: 50 }, 500, 500), null);
    // Invalid inputs
    assert.equal(clampCropBounds(null, 500, 500), null);
    assert.equal(clampCropBounds({}, 500, 500), null);
    assert.equal(clampCropBounds({ x: 10, y: 10, width: 0, height: 50 }, 500, 500), null);
  });
});

describe("regionCropper — Dynamic Miter Padding Resolution", () => {
  it("applies baseline padding when required miter is smaller than baseline", () => {
    const pad = resolveCropPadding(3.5);
    assert.equal(pad.appliedPadding, BASELINE_PADDING_POINTS); // 8.0
    assert.equal(pad.miterPaddingCapped, false);
    assert.equal(pad.warning, undefined);
  });

  it("applies exact required padding when between baseline and maximum cap", () => {
    const pad = resolveCropPadding(17.2);
    assert.equal(pad.appliedPadding, 18); // ceil(17.2)
    assert.equal(pad.miterPaddingCapped, false);
    assert.equal(pad.warning, undefined);
  });

  it("caps extreme padding at MAX_CROP_PADDING_POINTS and emits warning diagnostic", () => {
    const pad = resolveCropPadding(75.0);
    assert.equal(pad.appliedPadding, MAX_CROP_PADDING_POINTS); // 48.0
    assert.equal(pad.miterPaddingCapped, true);
    assert.equal(pad.requiredPadding, 75);
    assert.equal(pad.warning, "EXTREME_MITER_PADDING_CAPPED_AT_RESOURCE_LIMIT");
  });
});

describe("regionCropper — Multi-Rotation & Rendering Tests", () => {
  it("crops regions cleanly across 0, 90, 180, and 270 degree rotations", async () => {
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page6 = await doc.getPage(6);
    const bounds = { minX: 72, minY: 103, maxX: 541, maxY: 306 };

    // Test 0 degrees
    const crop0 = await cropRegionFromPage(page6, bounds, { scale: 1.0, rotation: 0 });
    assert.ok(crop0);
    assert.ok(crop0.pngBuffer.length > 1000);
    assert.equal(crop0.width, 485);
    assert.equal(crop0.height, 219);

    // Test 90 degrees (width and height swap)
    const crop90 = await cropRegionFromPage(page6, bounds, { scale: 1.0, rotation: 90 });
    assert.ok(crop90);
    assert.ok(crop90.pngBuffer.length > 1000);
    assert.equal(crop90.width, 219);
    assert.equal(crop90.height, 485);

    // Test 180 degrees
    const crop180 = await cropRegionFromPage(page6, bounds, { scale: 1.0, rotation: 180 });
    assert.ok(crop180);
    assert.equal(crop180.width, 485);
    assert.equal(crop180.height, 219);

    // Test 270 degrees
    const crop270 = await cropRegionFromPage(page6, bounds, { scale: 1.0, rotation: 270 });
    assert.ok(crop270);
    assert.equal(crop270.width, 219);
    assert.equal(crop270.height, 485);
  });

  it("scales output dimensions linearly with scale option", async () => {
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page6 = await doc.getPage(6);
    const bounds = { minX: 100, minY: 100, maxX: 200, maxY: 200 };

    const crop1x = await cropRegionFromPage(page6, bounds, { scale: 1.0 });
    const crop2x = await cropRegionFromPage(page6, bounds, { scale: 2.0 });

    assert.ok(crop1x);
    assert.ok(crop2x);
    // At scale 2x, dimensions should be approximately double (within 2px due to integer ceil/floor)
    assert.ok(Math.abs(crop2x.width - 2 * crop1x.width) <= 2);
    assert.ok(Math.abs(crop2x.height - 2 * crop1x.height) <= 2);
  });
});

describe("regionCropper — Asset Staging Integration", () => {
  it("writes cropped asset buffer to staging directory via writeStagedAsset", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-test-"));
    try {
      const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
      const page6 = await doc.getPage(6);
      const bounds = { minX: 100, minY: 200, maxX: 250, maxY: 300 };

      const filename = "crop_p6_test.png";
      const result = await cropRegionFromPage(page6, bounds, {
        scale: 1.0,
        stagingDir: tempDir,
        filename,
      });

      assert.ok(result);
      assert.ok(result.stagedAsset);
      assert.equal(result.stagedAsset.filename, filename);
      assert.equal(result.stagedAsset.size, result.pngBuffer.length);
      assert.ok(fs.existsSync(result.stagedAsset.filePath));

      const fileData = fs.readFileSync(result.stagedAsset.filePath);
      assert.deepEqual(fileData, result.pngBuffer);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws when page or bounds are missing", async () => {
    await assert.rejects(async () => {
      await cropRegionFromPage(null, {});
    }, /Missing required page or pdfBounds/);

    await assert.rejects(async () => {
      await cropRegionFromPage({}, null);
    }, /Missing required page or pdfBounds/);
  });
});

describe("regionCropper — Real Sample PDF Regression Tests", () => {
  it("crops Table 2 from Page 11 of arxiv sample with high visual fidelity", async () => {
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page11 = await doc.getPage(11);
    // Table 2 bounds on page 11
    const bounds = { minX: 352, minY: 580, maxX: 543, maxY: 715 };

    const result = await cropRegionFromPage(page11, bounds, { scale: 1.5 });
    assert.ok(result);
    assert.ok(result.width > 280);
    assert.ok(result.height > 200);
    assert.ok(result.pngBuffer.length > 5000);
  });

  it("crops Standalone Raster Chart from Page 11 of narbi sample", async () => {
    const doc = await pdfjs.getDocument(NARBI_SAMPLE_PATH).promise;
    const page11 = await doc.getPage(11);
    // Chart bounds on page 11
    const bounds = { minX: 91, minY: 467, maxX: 512, maxY: 678 };

    const result = await cropRegionFromPage(page11, bounds, { scale: 1.5 });
    assert.ok(result);
    assert.ok(result.width > 600);
    assert.ok(result.height > 300);
    assert.ok(result.pngBuffer.length > 10000);
  });
});

describe("regionCropper — Canvas Resource Limits & Safety (SEC-03)", () => {
  it("allows valid canvas dimensions within safe thresholds", () => {
    assert.doesNotThrow(() => {
      assertSafeCanvasDimensions(800, 600);
    });
  });

  it("allows canvas dimension at the exact boundary of MAX_CANVAS_DIMENSION (16384)", () => {
    assert.doesNotThrow(() => {
      assertSafeCanvasDimensions(MAX_CANVAS_DIMENSION, 100);
    });
  });

  it("throws RegionCropperError when dimension exceeds MAX_CANVAS_DIMENSION (16384)", () => {
    assert.throws(
      () => {
        assertSafeCanvasDimensions(MAX_CANVAS_DIMENSION + 1, 100);
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "CANVAS_DIMENSION_LIMIT_EXCEEDED");
        return true;
      }
    );
  });

  it("allows exact boundary of MAX_CANVAS_PIXELS (40000000)", () => {
    assert.doesNotThrow(() => {
      assertSafeCanvasDimensions(8000, 5000); // 8000 * 5000 = 40,000,000
    });
  });

  it("throws RegionCropperError when pixel count exceeds MAX_CANVAS_PIXELS (40000000)", () => {
    assert.throws(
      () => {
        assertSafeCanvasDimensions(10000, 4001); // 40,010,000 pixels
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "CANVAS_PIXEL_LIMIT_EXCEEDED");
        return true;
      }
    );
  });

  it("throws RegionCropperError for zero or negative dimensions", () => {
    assert.throws(
      () => {
        assertSafeCanvasDimensions(0, 500);
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "INVALID_CANVAS_DIMENSIONS");
        return true;
      }
    );

    assert.throws(
      () => {
        assertSafeCanvasDimensions(500, -10);
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "INVALID_CANVAS_DIMENSIONS");
        return true;
      }
    );
  });

  it("throws RegionCropperError for NaN and Infinity dimensions", () => {
    assert.throws(
      () => {
        assertSafeCanvasDimensions(NaN, 500);
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "INVALID_CANVAS_DIMENSIONS");
        return true;
      }
    );

    assert.throws(
      () => {
        assertSafeCanvasDimensions(500, Infinity);
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "INVALID_CANVAS_DIMENSIONS");
        return true;
      }
    );
  });

  it("rejects pathological viewport in renderPageToCanvas before calling createCanvas", async () => {
    const mockPage = {
      render: () => {
        throw new Error("page.render should never be reached for pathological viewports!");
      },
    };
    const hugeViewport = { width: 50000, height: 50000 };

    await assert.rejects(
      async () => {
        await renderPageToCanvas(mockPage, hugeViewport);
      },
      err => {
        assert.ok(err instanceof RegionCropperError);
        assert.equal(err.code, "CANVAS_DIMENSION_LIMIT_EXCEEDED");
        return true;
      }
    );
  });

  it("ensures no staging file is written when canvas allocation safety fails", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-sec-test-"));
    try {
      const mockPage = {
        getViewport: () => ({
          width: 50000, // Exceeds limit
          height: 50000,
          convertToViewportPoint: (x, y) => [x, y],
        }),
        render: () => {
          throw new Error("Should not render");
        },
      };

      const filename = "should_never_exist.png";
      await assert.rejects(
        async () => {
          await cropRegionFromPage(mockPage, { minX: 10, minY: 10, maxX: 100, maxY: 100 }, {
            stagingDir: tempDir,
            filename,
          });
        },
        err => {
          assert.ok(err instanceof RegionCropperError);
          return true;
        }
      );

      // Verify no file was written to disk
      const files = fs.readdirSync(tempDir);
      assert.equal(files.length, 0, "No file should be written to staging on allocation failure");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

