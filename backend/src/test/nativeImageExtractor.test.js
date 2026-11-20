import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import {
  discoverNativeImagePlacements,
  extractNativeImageForRegion,
  isNativeImageExtractionEnabled,
} from "../utils/nativeImageExtractor.js";
import { executeExtraction, replaceStagedPng } from "../workers/extractionWorkerThread.js";
import { createFr09FixturePdf, createFr09NativeRasterFigurePdf } from "./fr09PdfFixture.js";

const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../workers/extractionWorkerThread.js");

function makeImage(width, height, rgb = [20, 40, 60]) {
  return {
    width,
    height,
    kind: pdfjs.ImageKind.RGB_24BPP,
    data: Buffer.from(Array.from({ length: width * height }, () => rgb).flat()),
  };
}

function makeRegion(bounds, { assetType = "figure", matchedImages = 1, matchedClusters = 0, matchedRules = 0, objId } = {}) {
  return {
    assetType,
    bounds: { ...bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
    metadata: { matchedImages, matchedClusters, matchedRules, ...(objId ? { objId } : {}) },
  };
}

function makeFakePage(entries) {
  const fnArray = [];
  const argsArray = [];
  const objects = new Map();
  for (const entry of entries) {
    objects.set(entry.id, entry.image);
    fnArray.push(pdfjs.OPS.save);
    argsArray.push(null);
    fnArray.push(pdfjs.OPS.transform);
    argsArray.push([
      entry.bounds.maxX - entry.bounds.minX, 0,
      0, entry.bounds.maxY - entry.bounds.minY,
      entry.bounds.minX, entry.bounds.minY,
    ]);
    fnArray.push(pdfjs.OPS.paintImageXObject);
    argsArray.push([entry.id, entry.image.width, entry.image.height]);
    fnArray.push(pdfjs.OPS.restore);
    argsArray.push(null);
  }
  return {
    async getOperatorList() { return { fnArray, argsArray }; },
    async getTextContent() { return { items: [], styles: {} }; },
    objs: { get(id) { return objects.get(id); } },
  };
}

const singleBounds = { minX: 100, minY: 200, maxX: 200, maxY: 250 };

describe("FR-09 native image extraction eligibility", () => {
  it("uses a complete, high-resolution image object and preserves its intrinsic aspect ratio", async () => {
    const page = makeFakePage([{ id: "image-one", bounds: singleBounds, image: makeImage(800, 400) }]);
    const region = makeRegion(singleBounds, { objId: "image-one" });
    const result = await extractNativeImageForRegion(page, region, [region], pdfjs, { renderScale: 2 });

    assert.equal(result.extractionMethod, "native_image");
    assert.equal(result.objectCount, 1);
    assert.equal(result.width, 800);
    assert.equal(result.height, 400);
    assert.equal(result.pngBuffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  });

  it("rejects empty or malformed decoded pixel data", async () => {
    const image = makeImage(800, 400);
    image.data = Buffer.alloc(0);
    const region = makeRegion(singleBounds, { objId: "bad" });
    const result = await extractNativeImageForRegion(makeFakePage([{ id: "bad", bounds: singleBounds, image }]), region, [region], pdfjs);
    assert.equal(result, null);
  });

  it("rejects unsupported image kinds and insufficient native resolution", async () => {
    const unsupported = makeImage(800, 400);
    unsupported.kind = pdfjs.ImageKind.GRAYSCALE_1BPP;
    unsupported.data = Buffer.alloc(800 * 400);
    const region = makeRegion(singleBounds, { objId: "unsupported" });
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "unsupported", bounds: singleBounds, image: unsupported }]), region, [region], pdfjs
    ), null);

    const lowResolution = makeRegion(singleBounds, { objId: "low-resolution" });
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "low-resolution", bounds: singleBounds, image: makeImage(100, 50) }]),
      lowResolution, [lowResolution], pdfjs, { renderScale: 2 }
    ), null);
  });

  it("rejects a partially overlapping object and an isolated nearby mathematical label", async () => {
    const partial = { minX: 150, minY: 200, maxX: 200, maxY: 250 };
    const partialRegion = makeRegion(singleBounds);
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "partial", bounds: partial, image: makeImage(400, 400) }]),
      partialRegion, [partialRegion], pdfjs
    ), null);

    const labelBounds = { minX: 100, minY: 220, maxX: 110, maxY: 230 };
    const labelRegion = makeRegion(singleBounds, { objId: "math-label" });
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "math-label", bounds: labelBounds, image: makeImage(100, 100) }]),
      labelRegion, [labelRegion], pdfjs
    ), null);
  });

  it("rejects objects that omit vector labels or additional image objects", async () => {
    const image = makeImage(800, 400);
    const vectorRegion = makeRegion(singleBounds, { matchedClusters: 1 });
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "complete-raster", bounds: singleBounds, image }]),
      vectorRegion, [vectorRegion], pdfjs
    ), null);

    const nearbyBounds = { minX: 190, minY: 245, maxX: 205, maxY: 260 };
    const ambiguousRegion = makeRegion(singleBounds, { matchedImages: 1 });
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([
        { id: "figure", bounds: singleBounds, image },
        { id: "nearby", bounds: nearbyBounds, image: makeImage(120, 120) },
      ]), ambiguousRegion, [ambiguousRegion], pdfjs
    ), null);
  });

  it("rejects native-only output when separately encoded PDF text overlays the image", async () => {
    const page = makeFakePage([{ id: "background", bounds: singleBounds, image: makeImage(800, 400) }]);
    page.getTextContent = async () => ({
      items: [{ str: "axis label", fontName: "F1", transform: [8, 0, 0, 8, 120, 220], width: 30 }],
      styles: { F1: { ascent: 0.8, descent: -0.2 } },
    });
    const region = makeRegion(singleBounds, { objId: "background" });
    assert.equal(await extractNativeImageForRegion(page, region, [region], pdfjs), null);
  });

  it("keeps page-rotated image regions on the viewport-aware crop path", async () => {
    const page = makeFakePage([{ id: "rotated", bounds: singleBounds, image: makeImage(800, 400) }]);
    page.rotate = 90;
    const region = makeRegion(singleBounds, { objId: "rotated" });
    assert.equal(await extractNativeImageForRegion(page, region, [region], pdfjs), null);
  });

  it("rejects image regions that overlap an adjacent aligned raster region", async () => {
    const region = makeRegion(singleBounds, { objId: "panel" });
    const adjacent = makeRegion({ minX: 100, minY: 251, maxX: 200, maxY: 301 }, { objId: "next-panel" });
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "panel", bounds: singleBounds, image: makeImage(800, 400) }]),
      region, [region, adjacent], pdfjs
    ), null);
  });

  it("composes complete panels at their page placements and rejects gaps, overlaps, duplicates, and unsafe dimensions", async () => {
    const combinedBounds = { minX: 0, minY: 0, maxX: 100, maxY: 30 };
    const region = makeRegion(combinedBounds, { matchedImages: 3 });
    const panels = [
      { id: "left", bounds: { minX: 0, minY: 0, maxX: 30, maxY: 30 }, image: makeImage(600, 600, [200, 20, 20]) },
      { id: "middle", bounds: { minX: 35, minY: 0, maxX: 65, maxY: 30 }, image: makeImage(600, 600, [20, 200, 20]) },
      { id: "right", bounds: { minX: 70, minY: 0, maxX: 100, maxY: 30 }, image: makeImage(600, 600, [20, 20, 200]) },
    ];
    const result = await extractNativeImageForRegion(makeFakePage(panels), region, [region], pdfjs);
    assert.equal(result.extractionMethod, "native_composite");
    const decoded = await loadImage(result.pngBuffer);
    assert.equal(decoded.width, 2000);
    assert.equal(decoded.height, 600);
    const inspect = createCanvas(decoded.width, decoded.height);
    const context = inspect.getContext("2d");
    context.drawImage(decoded, 0, 0);
    assert.ok(context.getImageData(100, 200, 1, 1).data[0] > 150);
    assert.ok(context.getImageData(700, 200, 1, 1).data[1] > 150);
    assert.ok(context.getImageData(650, 200, 1, 1).data[0] > 245, "Page-relative panel gap should remain white");
    assert.ok(context.getImageData(1800, 200, 1, 1).data[2] > 150);

    const sparseRegion = makeRegion(combinedBounds, { matchedImages: 3 });
    const sparse = [0, 45, 90].map((x, i) => ({
      id: `sparse-${i}`,
      bounds: { minX: x, minY: 0, maxX: x + 10, maxY: 30 },
      image: makeImage(200, 600),
    }));
    assert.equal(await extractNativeImageForRegion(makeFakePage(sparse), sparseRegion, [sparseRegion], pdfjs), null);

    const overlappingRegion = makeRegion(combinedBounds, { matchedImages: 2 });
    const overlapping = ["overlap-a", "overlap-b"].map((id) => ({
      id, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 30 }, image: makeImage(800, 240),
    }));
    assert.equal(await extractNativeImageForRegion(makeFakePage(overlapping), overlappingRegion, [overlappingRegion], pdfjs), null);

    const hugeRegion = makeRegion({ minX: 0, minY: 0, maxX: 5000, maxY: 50 }, { objId: "huge" });
    const huge = { width: 5000, height: 50, kind: pdfjs.ImageKind.RGB_24BPP, data: Buffer.alloc(3) };
    assert.equal(await extractNativeImageForRegion(
      makeFakePage([{ id: "huge", bounds: hugeRegion.bounds, image: huge }]), hugeRegion, [hugeRegion], pdfjs
    ), null);
  });

  it("does not upscale lower-resolution objects when composing a complete figure", async () => {
    const combinedBounds = { minX: 0, minY: 0, maxX: 80, maxY: 25 };
    const region = makeRegion(combinedBounds, { matchedImages: 3 });
    const panels = [
      { id: "high-left", bounds: { minX: 0, minY: 0, maxX: 25, maxY: 25 }, image: makeImage(500, 500) },
      { id: "low-middle", bounds: { minX: 27.5, minY: 0, maxX: 52.5, maxY: 25 }, image: makeImage(250, 250) },
      { id: "high-right", bounds: { minX: 55, minY: 0, maxX: 80, maxY: 25 }, image: makeImage(500, 500) },
    ];

    const result = await extractNativeImageForRegion(makeFakePage(panels), region, [region], pdfjs);
    assert.equal(result.extractionMethod, "native_composite");
    assert.equal(result.width, 800, "Composite uses the lowest source pixels-per-point ratio");
    assert.equal(result.height, 250);
  });

  it("does not select vector-only figures or tables", async () => {
    const page = makeFakePage([]);
    assert.equal(await extractNativeImageForRegion(page, makeRegion(singleBounds), [], pdfjs), null);
    assert.equal(await extractNativeImageForRegion(page, makeRegion(singleBounds, { assetType: "table" }), [], pdfjs), null);
  });

  it("keeps native extraction opt-in and fails closed for other flag values", () => {
    const previous = process.env.FR09_NATIVE_IMAGE_EXTRACTION;
    try {
      delete process.env.FR09_NATIVE_IMAGE_EXTRACTION;
      assert.equal(isNativeImageExtractionEnabled(), false);
      assert.equal(isNativeImageExtractionEnabled("true"), true);
      assert.equal(isNativeImageExtractionEnabled("false"), false);
      assert.equal(isNativeImageExtractionEnabled("yes"), false);
    } finally {
      if (previous === undefined) delete process.env.FR09_NATIVE_IMAGE_EXTRACTION;
      else process.env.FR09_NATIVE_IMAGE_EXTRACTION = previous;
    }
  });

  it("ignores a PDF.js image whose placement is clipped by a form bounding box", async () => {
    const fnArray = [pdfjs.OPS.paintFormXObjectBegin, pdfjs.OPS.transform, pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintFormXObjectEnd];
    const argsArray = [[null, [0, 0, 100, 50]], [100, 0, 0, 50, 100, 200], ["clipped", 800, 400], null];
    const page = {
      getOperatorList: async () => ({ fnArray, argsArray }),
      getTextContent: async () => ({ items: [], styles: {} }),
      objs: { get: () => makeImage(800, 400) },
    };
    const region = makeRegion(singleBounds, { objId: "clipped" });
    const result = await extractNativeImageForRegion(page, region, [region], pdfjs);
    assert.equal(result, null);
  });
});

describe("FR-09 native image extraction in the worker", () => {
  it("retains the staged crop and removes the temporary file when replacement PNG validation fails", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-replace-"));
    const stagedPath = path.join(directory, "figure.png");
    const fallback = createCanvas(3, 2).toBuffer("image/png");
    try {
      fs.writeFileSync(stagedPath, fallback);
      const result = await replaceStagedPng(stagedPath, {
        pngBuffer: Buffer.from("not a PNG"),
        width: 3,
        height: 2,
      });
      assert.equal(result, null);
      assert.deepEqual(fs.readFileSync(stagedPath), fallback, "A bad candidate must not overwrite the crop");
      assert.deepEqual(fs.readdirSync(directory), ["figure.png"], "Failed replacement temp files are cleaned");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps valid crop assets and completes when native extraction throws", async () => {
    const fixture = createFr09FixturePdf();
    const stagingBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-error-fallback-"));
    try {
      const result = await executeExtraction({
        jobId: "native-error-fallback-job",
        attemptId: "attempt-one",
        paperId: "native-error-fallback-paper",
        pdfPath: fixture.filePath,
        stagingBaseDir,
        nativeImageExtractionEnabled: true,
        nativeImageExtractor: async () => { throw new Error("Simulated native decode error"); },
      });
      assert.equal(result.statistics.pageFailureCount, 0);
      assert.ok(result.assets.length > 0);
      assert.ok(result.assets.every((asset) => asset.extractionMetadata.extractionMethod === "pdfjs_crop"));
      assert.ok(result.assets.every((asset) => fs.existsSync(asset.stagedFilePath) && fs.statSync(asset.stagedFilePath).size > 0));
    } finally {
      fs.rmSync(stagingBaseDir, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("uses the full-resolution native object in a real Worker thread and persists its method metadata", async () => {
    const fixture = createFr09NativeRasterFigurePdf();
    const stagingBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-worker-"));
    const jobId = "native-worker-job";
    let worker;
    try {
      worker = new Worker(workerPath, { execArgv: [] });
      const completion = new Promise((resolve, reject) => {
        worker.on("message", (message) => {
          if (message.type === "COMPLETE") resolve(message.payload);
          if (message.type === "ERROR") reject(new Error(message.error?.code || "worker failed"));
        });
        worker.on("error", reject);
      });
      worker.postMessage({
        type: "START",
        payload: {
          jobId,
          attemptId: "attempt-one",
          paperId: "native-test-paper",
          pdfPath: fixture.filePath,
          stagingBaseDir,
          renderScale: 1,
          nativeImageExtractionEnabled: true,
        },
      });
      const result = await completion;
      const asset = result.assets.find((entry) => entry.assetType === "figure");
      assert.ok(asset);
      assert.equal(asset.extractionMetadata.extractionMethod, "native_image");
      assert.equal(asset.width, 640);
      assert.equal(asset.height, 320);
      assert.ok(fs.existsSync(asset.stagedFilePath));
      const stagedStats = fs.statSync(asset.stagedFilePath);
      assert.ok(stagedStats.size > 0);
      assert.equal(asset.fileSizeBytes, stagedStats.size, "Worker metadata reflects the promoted native PNG");
      const image = await loadImage(asset.stagedFilePath);
      assert.equal(image.width, 640);
      assert.equal(image.height, 320);
      assert.ok(result.statistics.totalPages >= 1);
      assert.equal(result.statistics.pageFailureCount, 0);
    } finally {
      if (worker) await worker.terminate();
      fs.rmSync(stagingBaseDir, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("keeps vector/table output on the baseline crop path and completes if native candidates are invalid", async () => {
    const fixture = createFr09FixturePdf();
    const stagingBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-fallback-"));
    try {
      const result = await executeExtraction({
        jobId: "native-fallback-job",
        attemptId: "attempt-one",
        paperId: "native-fallback-paper",
        pdfPath: fixture.filePath,
        stagingBaseDir,
        renderScale: 1,
        nativeImageExtractionEnabled: true,
      });
      assert.equal(result.statistics.pageFailureCount, 0);
      assert.ok(result.assets.some((asset) => asset.assetType === "table" && asset.extractionMetadata.extractionMethod === "pdfjs_crop"));
      assert.ok(result.assets.some((asset) => asset.assetType === "figure" && asset.extractionMetadata.extractionMethod === "pdfjs_crop"));
      assert.ok(result.assets.every((asset) => fs.existsSync(asset.stagedFilePath) && fs.statSync(asset.stagedFilePath).size > 0));
    } finally {
      fs.rmSync(stagingBaseDir, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("leaves the disabled output pixels unchanged from the crop baseline", async () => {
    const fixture = createFr09NativeRasterFigurePdf();
    const stagingBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-disabled-"));
    const comparisonDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-disabled-compare-"));
    try {
      const runBaseline = (jobId, stagingDir) => executeExtraction({
        jobId,
        attemptId: "attempt-one",
        paperId: "native-disabled-paper",
        pdfPath: fixture.filePath,
        stagingBaseDir: stagingDir,
        renderScale: 1,
        nativeImageExtractionEnabled: false,
      });
      const first = await runBaseline("native-disabled-job-one", stagingBaseDir);
      const second = await runBaseline("native-disabled-job-two", comparisonDir);
      const firstAsset = first.assets[0];
      const secondAsset = second.assets[0];
      assert.equal(firstAsset.extractionMetadata.extractionMethod, "pdfjs_crop");
      assert.equal(secondAsset.extractionMetadata.extractionMethod, "pdfjs_crop");
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(firstAsset.stagedFilePath)).digest("hex"),
        crypto.createHash("sha256").update(fs.readFileSync(secondAsset.stagedFilePath)).digest("hex"),
      "Disabled native extraction must produce deterministic baseline crop bytes");
    } finally {
      fs.rmSync(stagingBaseDir, { recursive: true, force: true });
      fs.rmSync(comparisonDir, { recursive: true, force: true });
      fixture.cleanup();
    }
  });
});
