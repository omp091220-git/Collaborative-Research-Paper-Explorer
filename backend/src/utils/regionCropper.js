/**
 * regionCropper.js
 *
 * FR-09 Phase 3.2: PDF Viewport Region Renderer and Image Cropper.
 *
 * Maps PDF user-space bounding boxes to canvas viewport pixel coordinates,
 * executes strict 2D rectangular intersection clamping against the viewport,
 * renders pages at high resolution (~144 DPI) via @napi-rs/canvas, crops
 * pixel-perfect sub-regions, and writes validated PNG buffers to staging.
 */

import { createCanvas } from "@napi-rs/canvas";
import { writeStagedAsset } from "./assetStagingManager.js";

/**
 * Default render scale (2.0 = ~144 DPI for crisp academic rendering).
 */
export const DEFAULT_RENDER_SCALE = 2.0;

/**
 * Baseline margin padding in PDF user points.
 */
export const BASELINE_PADDING_POINTS = 8.0;

/**
 * Maximum defensive padding ceiling in PDF user points.
 */
export const MAX_CROP_PADDING_POINTS = 48.0;

/**
 * Maximum allowable canvas dimension (width or height) in device pixels.
 * Matches MAX_IMAGE_DIMENSION from Phase 3.1 pixelDecoder.js.
 */
export const MAX_CANVAS_DIMENSION = 16384;

/**
 * Maximum allowable canvas surface area in total pixels.
 * Matches MAX_TOTAL_PIXELS from Phase 3.1 pixelDecoder.js.
 */
export const MAX_CANVAS_PIXELS = 40000000;

/**
 * Custom error class for region cropper and viewport rendering operations.
 */
export class RegionCropperError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "RegionCropperError";
    this.code = options.code || "REGION_CROPPER_ERROR";
    this.details = options.details || {};
  }
}

/**
 * Validates that requested canvas dimensions are positive finite integers within
 * resource security thresholds.
 *
 * @param {number} width - Integer width
 * @param {number} height - Integer height
 * @param {string} [context='canvas'] - Context description for error diagnostics
 */
export function assertSafeCanvasDimensions(width, height, context = "canvas") {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    Number.isNaN(width) ||
    Number.isNaN(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new RegionCropperError(
      `Invalid ${context} dimensions: width=${width}, height=${height}. Dimensions must be positive finite integers.`,
      { code: "INVALID_CANVAS_DIMENSIONS", details: { width, height, context } }
    );
  }

  if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION) {
    throw new RegionCropperError(
      `Canvas dimension limit exceeded in ${context}: width=${width}, height=${height}. Maximum allowed dimension is ${MAX_CANVAS_DIMENSION}px.`,
      { code: "CANVAS_DIMENSION_LIMIT_EXCEEDED", details: { width, height, maxDimension: MAX_CANVAS_DIMENSION, context } }
    );
  }

  const totalPixels = width * height;
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_CANVAS_PIXELS) {
    throw new RegionCropperError(
      `Canvas pixel limit exceeded in ${context}: ${totalPixels} pixels (width=${width}, height=${height}). Maximum allowed is ${MAX_CANVAS_PIXELS} pixels.`,
      { code: "CANVAS_PIXEL_LIMIT_EXCEEDED", details: { width, height, totalPixels, maxPixels: MAX_CANVAS_PIXELS, context } }
    );
  }
}

/**
 * Computes strict 2D rectangular intersection of a padded crop rectangle
 * against the canvas viewport boundaries.
 *
 * @param {object} paddedRect - { x, y, width, height } in viewport pixels
 * @param {number} viewportWidth - Total canvas width in pixels
 * @param {number} viewportHeight - Total canvas height in pixels
 * @returns {object|null} Intersected rectangle or null if disjoint/invalid
 */
export function clampCropBounds(paddedRect, viewportWidth, viewportHeight) {
  if (!paddedRect || typeof paddedRect.x !== "number" || typeof paddedRect.y !== "number") {
    return null;
  }

  const x0 = Math.max(0, Math.floor(paddedRect.x));
  const y0 = Math.max(0, Math.floor(paddedRect.y));
  const x1 = Math.min(viewportWidth, Math.ceil(paddedRect.x + paddedRect.width));
  const y1 = Math.min(viewportHeight, Math.ceil(paddedRect.y + paddedRect.height));

  const width = x1 - x0;
  const height = y1 - y0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: x0,
    y: y0,
    width,
    height,
  };
}

/**
 * Renders a full PDF page to a canvas and returns the canvas instance and dimensions.
 *
 * @param {object} page - PDF.js PageProxy
 * @param {object} viewport - PDF.js PageViewport
 * @returns {Promise<object>} Rendered canvas
 */
export async function renderPageToCanvas(page, viewport) {
  if (!viewport || typeof viewport.width !== "number" || typeof viewport.height !== "number") {
    throw new RegionCropperError("renderPageToCanvas: Invalid or missing viewport object", {
      code: "INVALID_VIEWPORT",
    });
  }

  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);

  assertSafeCanvasDimensions(width, height, "pageCanvas");

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Fill crisp white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return canvas;
}

/**
 * Calculates crop padding in PDF user points and determines if miter limit is capped.
 *
 * @param {number} requiredMiterPadding - Computed miter padding in PDF points
 * @param {number} [baselinePadding=BASELINE_PADDING_POINTS]
 * @param {number} [maxPadding=MAX_CROP_PADDING_POINTS]
 * @returns {{ appliedPadding: number, miterPaddingCapped: boolean, requiredPadding: number, warning?: string }}
 */
export function resolveCropPadding(requiredMiterPadding = 0, baselinePadding = BASELINE_PADDING_POINTS, maxPadding = MAX_CROP_PADDING_POINTS) {
  const computedPadding = Math.max(baselinePadding, Math.ceil(requiredMiterPadding));
  const isCapped = computedPadding > maxPadding;
  const appliedPadding = isCapped ? maxPadding : computedPadding;

  const result = {
    appliedPadding,
    miterPaddingCapped: isCapped,
    requiredPadding: computedPadding,
  };

  if (isCapped) {
    result.warning = "EXTREME_MITER_PADDING_CAPPED_AT_RESOURCE_LIMIT";
  }

  return result;
}

/**
 * Crops an asset region from a PDF page canvas and generates a validated PNG buffer.
 *
 * @param {object} page - PDF.js PageProxy
 * @param {object} pdfBounds - { minX, minY, maxX, maxY } in PDF user space
 * @param {object} [options]
 * @param {number} [options.scale=DEFAULT_RENDER_SCALE]
 * @param {number} [options.requiredMiterPadding=0]
 * @param {object} [options.renderedPageCanvas] - Optional pre-rendered canvas to avoid re-rendering
 * @param {string} [options.stagingDir] - Destination folder to write staged asset
 * @param {string} [options.filename] - Filename if writing to staging
 * @returns {Promise<{
 *   pngBuffer: Buffer,
 *   width: number,
 *   height: number,
 *   cropRect: { x: number, y: number, width: number, height: number },
 *   paddingApplied: number,
 *   miterDiagnostics: object,
 *   stagedAsset?: object
 * }|null>}
 */
export async function cropRegionFromPage(page, pdfBounds, options = {}) {
  if (!page || !pdfBounds) {
    throw new Error("cropRegionFromPage: Missing required page or pdfBounds");
  }

  const {
    scale = DEFAULT_RENDER_SCALE,
    requiredMiterPadding = 0,
    renderedPageCanvas = null,
    staging = null,
    stagingDir = null,
    jobId = null,
    attemptId = null,
    filename = null,
    rotation = undefined,
  } = options;

  // Resolve padding in PDF points
  const paddingInfo = resolveCropPadding(requiredMiterPadding);
  const paddingPoints = paddingInfo.appliedPadding;

  // Create viewport with native rotation handling
  const viewportOptions = { scale };
  if (rotation !== undefined) {
    viewportOptions.rotation = rotation;
  }
  const viewport = page.getViewport(viewportOptions);

  // Map diagonally opposite corners from PDF space into canvas viewport pixels
  const c0 = viewport.convertToViewportPoint(pdfBounds.minX, pdfBounds.minY);
  const c1 = viewport.convertToViewportPoint(pdfBounds.maxX, pdfBounds.minY);
  const c2 = viewport.convertToViewportPoint(pdfBounds.maxX, pdfBounds.maxY);
  const c3 = viewport.convertToViewportPoint(pdfBounds.minX, pdfBounds.maxY);

  const vxMin = Math.min(c0[0], c1[0], c2[0], c3[0]);
  const vxMax = Math.max(c0[0], c1[0], c2[0], c3[0]);
  const vyMin = Math.min(c0[1], c1[1], c2[1], c3[1]);
  const vyMax = Math.max(c0[1], c1[1], c2[1], c3[1]);

  // Convert PDF padding points to viewport pixels
  const paddingPixels = paddingPoints * scale;

  const paddedRect = {
    x: vxMin - paddingPixels,
    y: vyMin - paddingPixels,
    width: (vxMax - vxMin) + 2 * paddingPixels,
    height: (vyMax - vyMin) + 2 * paddingPixels,
  };

  // Perform strict 2D rectangular intersection against the canvas viewport
  const cropRect = clampCropBounds(paddedRect, viewport.width, viewport.height);
  if (!cropRect) {
    return null; // Entirely disjoint or invalid region
  }

  // Obtain or render page canvas
  const pageCanvas = renderedPageCanvas || (await renderPageToCanvas(page, viewport));

  // Render crop canvas
  assertSafeCanvasDimensions(cropRect.width, cropRect.height, "cropCanvas");
  const cropCanvas = createCanvas(cropRect.width, cropRect.height);
  const cropCtx = cropCanvas.getContext("2d");

  // Paint white background
  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, cropRect.width, cropRect.height);

  cropCtx.drawImage(
    pageCanvas,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height
  );

  const pngBuffer = cropCanvas.toBuffer("image/png");

  const result = {
    pngBuffer,
    width: cropRect.width,
    height: cropRect.height,
    cropRect,
    paddingApplied: paddingPoints,
    miterDiagnostics: paddingInfo,
  };

  // Stage asset if staging parameters provided
  if ((staging || filename) && (staging || stagingDir || (jobId && attemptId))) {
    const stageJobId = (staging && staging.jobId) || jobId || "default_job";
    const stageAttemptId = (staging && staging.attemptId) || attemptId || "attempt_1";
    const stageFilename = (staging && staging.filename) || filename;
    const stageBaseDir = (staging && staging.customBaseDir) || stagingDir || undefined;
    const stageMetadata = (staging && staging.metadata) || undefined;

    const staged = await writeStagedAsset({
      jobId: stageJobId,
      attemptId: stageAttemptId,
      filename: stageFilename,
      buffer: pngBuffer,
      customBaseDir: stageBaseDir,
      metadata: stageMetadata,
    });
    result.stagedAsset = staged;
  }

  return result;
}
