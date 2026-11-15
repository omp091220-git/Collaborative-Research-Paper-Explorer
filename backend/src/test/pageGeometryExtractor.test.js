/**
 * pageGeometryExtractor.test.js
 *
 * Unit and integration tests for page-level geometry extraction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  getMatrixMaxSingularValue,
  multiplyAffine,
  applyAffine,
  clipPolygonAxis,
  polygonArea,
  calculateImagePageCoverage,
  GraphicsStateManager,
  extractPageGeometry,
  COVER_PAGE_THRESHOLD,
} from "../utils/pageGeometryExtractor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

describe("pageGeometryExtractor — Mathematical & Matrix Engine", () => {
  it("computes exact maximum singular value for identity matrix", () => {
    const sigma = getMatrixMaxSingularValue(1, 0, 0, 1);
    assert.equal(sigma, 1.0);
  });

  it("computes exact maximum singular value for uniform scaling", () => {
    const sigma = getMatrixMaxSingularValue(2.5, 0, 0, 2.5);
    assert.equal(sigma, 2.5);
  });

  it("computes exact maximum singular value for non-uniform scaling", () => {
    const sigma = getMatrixMaxSingularValue(3.0, 0, 0, 1.0);
    assert.equal(sigma, 3.0);
  });

  it("computes exact maximum singular value for pure rotation", () => {
    // 90-degree rotation scaled by 2: a=0, b=2, c=-2, d=0
    const sigma = getMatrixMaxSingularValue(0, 2, -2, 0);
    assert.equal(sigma, 2.0);
  });

  it("computes exact maximum singular value for shear matrix [(1,0), (1,1)]", () => {
    // a=1, b=0, c=1, d=1
    const sigma = getMatrixMaxSingularValue(1, 0, 1, 1);
    // Exact value: sqrt((3 + sqrt(5)) / 2) ≈ 1.6180339887
    assert.ok(Math.abs(sigma - 1.6180339887) < 1e-6);
  });

  it("multiplies 2D affine matrices correctly", () => {
    // Scale by 2, then translate by (10, 20)
    const mScale = [2, 0, 0, 2, 0, 0];
    const mTrans = [1, 0, 0, 1, 10, 20];
    const combined = multiplyAffine(mTrans, mScale);
    const pt = applyAffine(combined, [5, 5]);
    assert.deepEqual(pt, [20, 30]); // 5*2 + 10 = 20, 5*2 + 20 = 30
  });
});

describe("pageGeometryExtractor — Polygon Clipping & Coverage Ratio", () => {
  it("calculates exact polygon area via Shoelace formula", () => {
    const rect = [[0, 0], [10, 0], [10, 20], [0, 20]];
    assert.equal(polygonArea(rect), 200);
  });

  it("clips polygon against an axis boundary cleanly", () => {
    const rect = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const clipped = clipPolygonAxis(rect, 0, 5, false); // x <= 5
    assert.equal(polygonArea(clipped), 50);
  });

  it("calculates 100% coverage for full-page image on [0, 0, 600, 800]", () => {
    const quad = [[0, 0], [600, 0], [600, 800], [0, 800]];
    const coverage = calculateImagePageCoverage(quad, [0, 0, 600, 800]);
    assert.equal(coverage, 1.0);
  });

  it("calculates 50% coverage for half off-page image with same area as page", () => {
    // Quad shifted right by 300 pt
    const quad = [[300, 0], [900, 0], [900, 800], [300, 800]];
    const coverage = calculateImagePageCoverage(quad, [0, 0, 600, 800]);
    assert.equal(coverage, 0.5);
    assert.ok(coverage < COVER_PAGE_THRESHOLD); // Must NOT be suppressed as cover
  });

  it("handles nonzero MediaBox origin [36, 54, 648, 846] correctly", () => {
    const pageView = [36, 54, 648, 846]; // W=612, H=792
    const fullQuad = [[36, 54], [648, 54], [648, 846], [36, 846]];
    const coverage = calculateImagePageCoverage(fullQuad, pageView);
    assert.equal(coverage, 1.0);

    // Quad at [0, 0, 612, 792] on this nonzero page is shifted
    const shiftedQuad = [[0, 0], [612, 0], [612, 792], [0, 792]];
    const shiftedCoverage = calculateImagePageCoverage(shiftedQuad, pageView);
    assert.ok(shiftedCoverage < 0.90); // Rejected as cover
  });

  it("handles negative page origin [-50, -50, 550, 750] correctly", () => {
    const pageView = [-50, -50, 550, 750]; // W=600, H=800
    const quad = [[-50, -50], [550, -50], [550, 750], [-50, 750]];
    const coverage = calculateImagePageCoverage(quad, pageView);
    assert.equal(coverage, 1.0);
  });
});

describe("pageGeometryExtractor — GraphicsStateManager Lifecycle", () => {
  it("tracks state mutations and restores cleanly upon pop", () => {
    const gstate = new GraphicsStateManager();
    assert.equal(gstate.state.lineWidth, 1.0);
    assert.equal(gstate.state.lineCap, 0);

    gstate.save();
    gstate.setLineWidth(4.5);
    gstate.setLineCap(2);
    gstate.setLineJoin(1);
    gstate.setMiterLimit(5.0);
    gstate.applyTransform([2, 0, 0, 2, 10, 20]);

    assert.equal(gstate.state.lineWidth, 4.5);
    assert.equal(gstate.state.lineCap, 2);
    assert.equal(gstate.state.lineJoin, 1);
    assert.equal(gstate.state.miterLimit, 5.0);
    assert.deepEqual(gstate.state.ctm, [2, 0, 0, 2, 10, 20]);

    gstate.restore();
    assert.equal(gstate.state.lineWidth, 1.0);
    assert.equal(gstate.state.lineCap, 0);
    assert.equal(gstate.state.lineJoin, 0);
    assert.equal(gstate.state.miterLimit, 10.0);
    assert.deepEqual(gstate.state.ctm, [1, 0, 0, 1, 0, 0]);
  });

  it("updates stroke parameters via setGState dictionary", () => {
    const gstate = new GraphicsStateManager();
    gstate.applyGState([
      ["LW", 3.0],
      ["LC", 1],
      ["LJ", 2],
      ["ML", 4.0],
    ]);

    assert.equal(gstate.state.lineWidth, 3.0);
    assert.equal(gstate.state.lineCap, 1);
    assert.equal(gstate.state.lineJoin, 2);
    assert.equal(gstate.state.miterLimit, 4.0);
  });
});

describe("pageGeometryExtractor — Mock Operator Stream Traversal", () => {
  it("processes constructPath sub-operations and classifies horizontal rules", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.setLineWidth,
          pdfjs.OPS.constructPath,
          pdfjs.OPS.stroke,
        ],
        argsArray: [
          [1.5],
          [
            [pdfjs.OPS.moveTo, pdfjs.OPS.lineTo],
            [100, 500, 300, 500], // Straight horizontal line from x=100 to 300 at y=500 (length 200)
          ],
          [],
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    assert.equal(result.horizontalRules.length, 1);
    assert.equal(result.horizontalRules[0].length, 201.5); // 200 + 2*delta (delta = 0.75)
    assert.equal(result.horizontalRules[0].y, 500);
  });

  it("computes miter join residual correctly for multi-segment path", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.setLineWidth,
          pdfjs.OPS.setLineJoin,
          pdfjs.OPS.setMiterLimit,
          pdfjs.OPS.constructPath,
          pdfjs.OPS.stroke,
        ],
        argsArray: [
          [1.5],
          [0],   // miter join
          [10.0],// miter limit 10
          [
            [pdfjs.OPS.moveTo, pdfjs.OPS.lineTo, pdfjs.OPS.lineTo],
            [100, 100, 150, 200, 200, 100], // multi-segment acute corner
          ],
          [],
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    // residual = (10 - 1) * 1.5 * 1.0 = 13.5 pt
    assert.equal(result.maxRequiredMiterPadding, 13.5);
  });

  it("handles paintImageXObjectRepeat by expanding per-instance bounds", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [pdfjs.OPS.paintImageXObjectRepeat],
        argsArray: [
          [
            "img_tile_1",
            50, // scaleX
            50, // scaleY
            new Float32Array([10, 20, 70, 20, 130, 20]), // 3 positions
          ],
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    assert.equal(result.images.length, 3);
    assert.equal(result.images[0].isRepeated, true);
    assert.equal(result.images[0].bounds.minX, 10);
    assert.equal(result.images[1].bounds.minX, 70);
    assert.equal(result.images[2].bounds.minX, 130);
  });
});

describe("pageGeometryExtractor — Real Sample PDF Regression Tests", () => {
  it("extracts vector paths and rules on Page 6 of arxiv sample", async () => {
    const pdfPath = path.resolve(PROJECT_ROOT, "uploads/arxiv-2610.30421-1793047803831.pdf");
    const raw = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({ data: raw }).promise;
    const page = await doc.getPage(6);

    const geom = await extractPageGeometry(page);
    assert.equal(geom.pageNumber, 6);
    assert.ok(geom.vectorClusters.length > 50, "Should extract vector clusters on Page 6");
    assert.equal(geom.suppressedCoverImages.length, 0, "Page 6 has no cover image");
    page.cleanup();
  });

  it("suppresses full-page cover image on Page 1 of narbi sample", async () => {
    const pdfPath = path.resolve(PROJECT_ROOT, "uploads/1792858120105-narbi61ofg8.pdf");
    const raw = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({ data: raw }).promise;
    const page = await doc.getPage(1);

    const geom = await extractPageGeometry(page);
    assert.equal(geom.pageNumber, 1);
    assert.equal(geom.suppressedCoverImages.length, 1, "Page 1 cover image must be suppressed");
    assert.ok(geom.suppressedCoverImages[0].coverageRatio >= 0.95);
    page.cleanup();
  });

  it("extracts standalone raster chart on Page 11 of narbi sample", async () => {
    const pdfPath = path.resolve(PROJECT_ROOT, "uploads/1792858120105-narbi61ofg8.pdf");
    const raw = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({ data: raw }).promise;
    const page = await doc.getPage(11);

    const geom = await extractPageGeometry(page);
    assert.equal(geom.images.length, 1);
    const img = geom.images[0];
    assert.equal(img.objId, "img_p10_1");
    // Verified placement bounds: [91.56, 467.64, 511.56, 678.00]
    assert.ok(Math.abs(img.bounds.width - 420.0) < 1.0);
    assert.ok(Math.abs(img.bounds.height - 210.36) < 1.0);
    page.cleanup();
  });
});

describe("pageGeometryExtractor — Image Mask Object ID Extraction (SEC-04)", () => {
  it("resolves string object ID for paintImageMaskXObject", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageMaskXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [100, 0, 0, 100, 50, 50], // 100x100 mask >= 72 pt threshold
          ["mask_string_id_1"],
          [],
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    assert.equal(result.images.length, 1);
    const mask = result.images[0];
    assert.equal(mask.type, "mask");
    assert.equal(mask.isMask, true);
    assert.equal(mask.objId, "mask_string_id_1");
    assert.equal(mask.bounds.minX, 50);
    assert.equal(mask.bounds.width, 100);
    assert.equal(mask.bounds.height, 100);
  });

  it("resolves object with data property for paintImageMaskXObject", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageMaskXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [120, 0, 0, 80, 100, 200], // 120x80 mask >= 72 pt threshold
          [{ data: "mask_worker_id_2", count: 1 }],
          [],
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    assert.equal(result.images.length, 1);
    const mask = result.images[0];
    assert.equal(mask.type, "mask");
    assert.equal(mask.isMask, true);
    assert.equal(mask.objId, "mask_worker_id_2");
    assert.equal(mask.bounds.minX, 100);
    assert.equal(mask.bounds.minY, 200);
    assert.equal(mask.bounds.width, 120);
    assert.equal(mask.bounds.height, 80);
  });

  it("leaves objId undefined when data property is missing or non-string", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageMaskXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [90, 0, 0, 90, 10, 10],
          [{ count: 5 }], // Missing data
          [],
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    assert.equal(result.images.length, 1);
    const mask = result.images[0];
    assert.equal(mask.type, "mask");
    assert.equal(mask.objId, undefined);
    assert.equal(mask.bounds.width, 90);
  });

  it("safely handles null or empty arguments array without crashing", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.paintImageMaskXObject,
        ],
        argsArray: [
          null, // null args
        ],
      }),
    };

    const result = await extractPageGeometry(mockPage);
    assert.equal(result.images.length, 0);
  });
});
