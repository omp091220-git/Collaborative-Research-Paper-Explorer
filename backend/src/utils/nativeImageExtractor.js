import { createCanvas } from "@napi-rs/canvas";
import { detectCaptions } from "./captionDetector.js";
import {
  assertSafeCanvasDimensions,
  MAX_CANVAS_DIMENSION,
  MAX_CANVAS_PIXELS,
} from "./regionCropper.js";

const BOX_MATCH_TOLERANCE = 0.985;
const ASPECT_RATIO_TOLERANCE = 0.02;
const ADJACENT_REGION_GAP_POINTS = 2;
const MIN_COMPOSITE_OCCUPANCY = 0.8;
// Match the Phase 11 native benchmark's stricter side cap to avoid allocating
// very large RGBA canvases. The existing PDF.js crop path keeps its own limits.
const MAX_NATIVE_OUTPUT_DIMENSION = Math.min(MAX_CANVAS_DIMENSION, 4096);
const pageTextGeometryCache = new WeakMap();

export function isNativeImageExtractionEnabled(value = process.env.FR09_NATIVE_IMAGE_EXTRACTION) {
  return value === true || value === "true";
}

function finiteBox(box) {
  return box && [box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite) &&
    box.maxX > box.minX && box.maxY > box.minY;
}

function boxArea(box) {
  return box.width * box.height;
}

function intersectionArea(a, b) {
  return Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
    Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
}

function boxIou(a, b) {
  const intersection = intersectionArea(a, b);
  const union = boxArea(a) + boxArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

async function getPageTextBounds(page) {
  if (!page || typeof page !== "object" || typeof page.getTextContent !== "function") return null;
  if (!pageTextGeometryCache.has(page)) {
    pageTextGeometryCache.set(page, detectCaptions(page).then((result) =>
      result.textItems.map((item) => item.bounds).filter(finiteBox)
    ));
  }
  return pageTextGeometryCache.get(page);
}

function unionBoxes(boxes) {
  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function affineBox(matrix) {
  const points = [
    [0, 0], [1, 0], [1, 1], [0, 1],
  ].map(([x, y]) => [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ]);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    axisAligned: Math.abs(matrix[1]) < 1e-7 && Math.abs(matrix[2]) < 1e-7 && matrix[0] > 0 && matrix[3] > 0,
  };
}

function restoreGraphicsState(stack, state) {
  const saved = stack.pop();
  if (!saved) return state;
  return saved.state;
}

/**
 * Collects ordinary image-XObject placements after PDF.js has rendered the
 * page and resolved page.objs. Inline images, repeated-image operators,
 * clipped images, and rotated/skewed placements are intentionally omitted.
 */
export async function discoverNativeImagePlacements(page, pdfjs) {
  if (!page?.getOperatorList || !pdfjs?.OPS || !pdfjs?.Util?.transform) return [];
  const operatorList = await page.getOperatorList();
  const stack = [];
  const placements = [];
  let state = { ctm: [1, 0, 0, 1, 0, 0], clipped: false };

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];

    if (fn === pdfjs.OPS.save || fn === pdfjs.OPS.paintFormXObjectBegin) {
      stack.push({ kind: fn === pdfjs.OPS.save ? "save" : "form", state: { ctm: [...state.ctm], clipped: state.clipped } });
      if (fn === pdfjs.OPS.paintFormXObjectBegin) {
        if (Array.isArray(args?.[0]) && args[0].length === 6) {
          state.ctm = pdfjs.Util.transform(state.ctm, args[0]);
        }
        // The form BBox is a clipping region; conservatively fall back for any
        // image whose completeness could depend on that clip.
        if (Array.isArray(args?.[1]) && args[1].length === 4) state.clipped = true;
      }
      continue;
    }

    if (fn === pdfjs.OPS.restore) {
      state = restoreGraphicsState(stack, state);
      continue;
    }
    if (fn === pdfjs.OPS.paintFormXObjectEnd) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const saved = stack.pop();
        if (saved?.kind === "form") {
          state = saved.state;
          break;
        }
      }
      continue;
    }
    if (fn === pdfjs.OPS.transform && Array.isArray(args) && args.length === 6) {
      state.ctm = pdfjs.Util.transform(state.ctm, args);
      continue;
    }
    if (fn === pdfjs.OPS.clip || fn === pdfjs.OPS.eoClip) {
      state.clipped = true;
      continue;
    }
    if (fn !== pdfjs.OPS.paintImageXObject || typeof args?.[0] !== "string") continue;

    const bounds = affineBox(state.ctm);
    let image = null;
    try {
      image = page.objs?.get(args[0]) || null;
    } catch {
      // PDF.js may not have resolved this object; the caller will use the crop.
    }
    placements.push({
      objectId: args[0],
      bounds,
      clipped: state.clipped,
      image,
    });
  }

  return placements;
}

function hasAdjacentRasterRegion(region, regions) {
  for (const other of regions || []) {
    if (other === region || other.assetType === "table" || !finiteBox(other.bounds)) continue;
    const xOverlap = Math.max(0, Math.min(region.bounds.maxX, other.bounds.maxX) - Math.max(region.bounds.minX, other.bounds.minX));
    const xRatio = xOverlap / Math.max(1, Math.min(region.bounds.width, other.bounds.width));
    const yGap = Math.max(0, region.bounds.minY - other.bounds.maxY, other.bounds.minY - region.bounds.maxY);
    const otherHasRaster = Boolean(other.metadata?.objId) || (other.metadata?.matchedImages || 0) > 0 ||
      other.detectionMethod === "embedded_raster";
    if (otherHasRaster && xRatio >= 0.9 && yGap <= ADJACENT_REGION_GAP_POINTS) return true;
  }
  return false;
}

function validateImageData(image, pdfjs) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      image.width <= 0 || image.height <= 0 || image.width > MAX_NATIVE_OUTPUT_DIMENSION || image.height > MAX_NATIVE_OUTPUT_DIMENSION) {
    return null;
  }
  const pixelCount = image.width * image.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_CANVAS_PIXELS) return null;
  const data = image.data;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
  const channels = image.kind === pdfjs.ImageKind?.RGB_24BPP ? 3
    : image.kind === pdfjs.ImageKind?.RGBA_32BPP ? 4
      : 0;
  if (!channels || data.byteLength !== pixelCount * channels) return null;
  return { data, channels, pixelCount };
}

function putImageOnWhiteCanvas(context, image, pixelData) {
  const imageData = context.createImageData(image.width, image.height);
  const { data, channels, pixelCount } = pixelData;
  if (channels === 3) {
    for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
      imageData.data[target] = data[source];
      imageData.data[target + 1] = data[source + 1];
      imageData.data[target + 2] = data[source + 2];
      imageData.data[target + 3] = 255;
    }
  } else {
    for (let source = 0, target = 0; source < pixelCount * 4; source += 4, target += 4) {
      const alpha = data[source + 3] / 255;
      imageData.data[target] = Math.round(data[source] * alpha + 255 * (1 - alpha));
      imageData.data[target + 1] = Math.round(data[source + 1] * alpha + 255 * (1 - alpha));
      imageData.data[target + 2] = Math.round(data[source + 2] * alpha + 255 * (1 - alpha));
      imageData.data[target + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
}

function imageAspectMatchesPlacement(image, bounds) {
  const imageRatio = image.width / image.height;
  const placementRatio = bounds.width / bounds.height;
  return Number.isFinite(imageRatio) && Number.isFinite(placementRatio) &&
    Math.abs(imageRatio / placementRatio - 1) <= ASPECT_RATIO_TOLERANCE;
}

function validateRegionAssociation(region, placements, regions) {
  if (!region || !["figure", "chart"].includes(region.assetType) || !finiteBox(region.bounds)) return false;
  const metadata = region.metadata || {};
  if ((metadata.matchedClusters || 0) > 0 || (metadata.matchedRules || 0) > 0) return false;
  if (hasAdjacentRasterRegion(region, regions)) return false;
  if (placements.length === 0 || placements.some((placement) => placement.clipped || !placement.bounds.axisAligned)) return false;

  const expectedImageCount = metadata.matchedImages;
  if (placements.length > 1 && expectedImageCount !== placements.length) return false;
  if (placements.length === 1 && expectedImageCount > 1) return false;
  if (metadata.objId && (placements.length !== 1 || placements[0].objectId !== metadata.objId)) return false;

  const placementBounds = placements.length === 1 ? placements[0].bounds : unionBoxes(placements.map((item) => item.bounds));
  const target = region.bounds;
  const targetArea = boxArea(target);
  if (boxIou(placementBounds, target) < BOX_MATCH_TOLERANCE ||
      intersectionArea(placementBounds, target) / targetArea < BOX_MATCH_TOLERANCE) return false;

  if (placements.length === 1) return true;
  const unionArea = boxArea(placementBounds);
  const componentArea = placements.reduce((sum, item) => sum + boxArea(item.bounds), 0);
  if (componentArea / unionArea < MIN_COMPOSITE_OCCUPANCY) return false;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const overlap = intersectionArea(placements[i].bounds, placements[j].bounds);
      if (overlap / Math.min(boxArea(placements[i].bounds), boxArea(placements[j].bounds)) > 0.01) return false;
    }
  }
  return true;
}

function validateNativeCandidate(region, placements, regions, pdfjs, renderScale) {
  if (!validateRegionAssociation(region, placements, regions)) return null;
  const validated = [];
  for (const placement of placements) {
    const pixels = validateImageData(placement.image, pdfjs);
    if (!pixels || !imageAspectMatchesPlacement(placement.image, placement.bounds)) return null;
    if (placement.image.width < placement.bounds.width * renderScale ||
        placement.image.height < placement.bounds.height * renderScale) return null;
    validated.push({ ...placement, pixels });
  }
  return validated;
}

/**
 * Returns a complete, validated PNG replacement only when the image object(s)
 * account for essentially the whole detected figure. Otherwise returns null
 * and the caller retains the already-staged PDF.js crop.
 */
export async function extractNativeImageForRegion(page, region, pageRegions, pdfjs, { renderScale = 2 } = {}) {
  // Page-level /Rotate is applied by PDF.js's viewport, not by the content
  // operator transforms tracked below. Preserve the crop renderer's orientation.
  if (Number.isFinite(page?.rotate) && page.rotate % 360 !== 0) return null;

  // Separate PDF text/labels can be overlaid inside an image's placement. A
  // native XObject would omit that text, so an overlap forces the full-page
  // renderer fallback. Failure to inspect text also fails closed.
  let pageTextBounds;
  try {
    pageTextBounds = await getPageTextBounds(page);
  } catch {
    return null;
  }
  if (!pageTextBounds || pageTextBounds.some((textBounds) => intersectionArea(textBounds, region?.bounds || {}) > 0)) {
    return null;
  }

  const placements = await discoverNativeImagePlacements(page, pdfjs);
  const intersecting = placements.filter((placement) => finiteBox(placement.bounds) &&
    intersectionArea(placement.bounds, region?.bounds || {}) > 0);
  const metadataObjectId = region?.metadata?.objId;
  const candidates = metadataObjectId
    ? intersecting.filter((placement) => placement.objectId === metadataObjectId)
    : intersecting;
  const validated = validateNativeCandidate(region, candidates, pageRegions, pdfjs, renderScale);
  if (!validated) return null;

  const targetBounds = validated.length === 1 ? validated[0].bounds : unionBoxes(validated.map((item) => item.bounds));
  let scale;
  if (validated.length === 1) {
    scale = 1;
  } else {
    const sourceScale = Math.min(...validated.map((item) => Math.min(
      item.image.width / item.bounds.width,
      item.image.height / item.bounds.height
    )));
    scale = Math.min(
      sourceScale,
      MAX_NATIVE_OUTPUT_DIMENSION / targetBounds.width,
      MAX_NATIVE_OUTPUT_DIMENSION / targetBounds.height,
      Math.sqrt(MAX_CANVAS_PIXELS / boxArea(targetBounds))
    );
  }

  const width = validated.length === 1 ? validated[0].image.width : Math.ceil(targetBounds.width * scale);
  const height = validated.length === 1 ? validated[0].image.height : Math.ceil(targetBounds.height * scale);
  assertSafeCanvasDimensions(width, height, "nativeAssetCanvas");
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  for (const item of validated) {
    const sourceCanvas = createCanvas(item.image.width, item.image.height);
    putImageOnWhiteCanvas(sourceCanvas.getContext("2d"), item.image, item.pixels);
    const dx = validated.length === 1 ? 0 : (item.bounds.minX - targetBounds.minX) * scale;
    const dy = validated.length === 1 ? 0 : (targetBounds.maxY - item.bounds.maxY) * scale;
    const drawWidth = validated.length === 1 ? width : item.bounds.width * scale;
    const drawHeight = validated.length === 1 ? height : item.bounds.height * scale;
    context.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
  }

  const pngBuffer = canvas.toBuffer("image/png");
  if (!pngBuffer.length || pngBuffer[0] !== 0x89 || pngBuffer[1] !== 0x50 || pngBuffer[2] !== 0x4e || pngBuffer[3] !== 0x47) {
    return null;
  }
  return {
    pngBuffer,
    width,
    height,
    extractionMethod: validated.length === 1 ? "native_image" : "native_composite",
    objectCount: validated.length,
  };
}
