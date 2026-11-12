/**
 * figureTableRegionDetector.js
 *
 * FR-09 Phase 3.2: Heuristic Figure, Chart, and Table Region Detector.
 *
 * Combines page geometry (paths, rules, images) and caption anchors to identify
 * candidate visual assets, pairs captions with visual regions (above or below),
 * separates two-column layouts, suppresses duplicates, and produces structured
 * detected regions in PDF user space.
 */

import { extractPageGeometry } from "./pageGeometryExtractor.js";
import { detectCaptions } from "./captionDetector.js";

/**
 * Calculates 2D Intersection-over-Union (IoU) of two bounding boxes.
 *
 * @param {object} b1 - { minX, minY, maxX, maxY }
 * @param {object} b2 - { minX, minY, maxX, maxY }
 * @returns {number} IoU between 0.0 and 1.0
 */
export function calculateBoxIoU(b1, b2) {
  const interX1 = Math.max(b1.minX, b2.minX);
  const interY1 = Math.max(b1.minY, b2.minY);
  const interX2 = Math.min(b1.maxX, b2.maxX);
  const interY2 = Math.min(b1.maxY, b2.maxY);

  if (interX2 <= interX1 || interY2 <= interY1) {
    return 0.0;
  }

  const interArea = (interX2 - interX1) * (interY2 - interY1);
  const area1 = (b1.maxX - b1.minX) * (b1.maxY - b1.minY);
  const area2 = (b2.maxX - b2.minX) * (b2.maxY - b2.minY);
  const unionArea = area1 + area2 - interArea;

  return unionArea <= 0 ? 0.0 : interArea / unionArea;
}

/**
 * Unions multiple bounding boxes into a single enclosing bounding box.
 *
 * @param {Array<object>} boxes
 * @returns {object} { minX, minY, maxX, maxY, width, height }
 */
export function unionBoxes(boxes) {
  if (!boxes || boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Maximum vertical search distance in points for associating figures with captions.
 */
export const MAX_FIGURE_SEARCH_DISTANCE = 450.0;

/**
 * Checks whether an intervening caption exists vertically between a caption and a visual candidate
 * in the same column.
 *
 * @param {object} capBounds - Bounding box of the current caption
 * @param {object} candidateBox - Bounding box of the candidate element
 * @param {'above'|'below'} direction - Direction of the candidate relative to caption
 * @param {Array<object>} allCaptions - All detected captions on the page
 * @param {string} capCol - Column placement of current caption ('col1' | 'col2' | 'span' | 'center')
 * @param {function} getColumnPlacement - Column helper function
 * @returns {boolean} True if an intervening caption separates them
 */
function hasInterveningCaption(capBounds, candidateBox, direction, allCaptions, capCol, getColumnPlacement) {
  for (const other of allCaptions) {
    const ob = other.bounds;
    // Don't compare with self
    if (ob === capBounds) continue;

    const otherCol = getColumnPlacement(ob);
    const colMatch = (capCol === "span" || otherCol === "span" || capCol === otherCol);
    if (!colMatch) continue;

    if (direction === "above") {
      // Intervening caption sits strictly between caption top and candidate bottom
      if (ob.minY > capBounds.maxY && ob.maxY < candidateBox.minY) {
        return true;
      }
    } else {
      // Intervening caption sits strictly between candidate top and caption bottom
      if (ob.maxY < capBounds.minY && ob.minY > candidateBox.maxY) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Clamps bounding box within page boundaries.
 */
export function clampToPageView(box, pageView) {
  const pageMinX = Math.min(pageView[0], pageView[2]);
  const pageMaxX = Math.max(pageView[0], pageView[2]);
  const pageMinY = Math.min(pageView[1], pageView[3]);
  const pageMaxY = Math.max(pageView[1], pageView[3]);

  const minX = Math.max(pageMinX, box.minX);
  const maxX = Math.min(pageMaxX, box.maxX);
  const minY = Math.max(pageMinY, box.minY);
  const maxY = Math.min(pageMaxY, box.maxY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Detects candidate figure, chart, and table regions on a PDF page.
 *
 * @param {object} page - PDF.js PageProxy
 * @param {object} [options]
 * @param {boolean} [options.enableUnanchoredVector=false] - Experimental vector clustering without captions
 * @param {number} [options.minRasterDimension=72] - Minimum point dimension for standalone rasters
 * @returns {Promise<Array<object>>} List of DetectedRegion objects
 */
export async function detectRegions(page, options = {}) {
  const {
    enableUnanchoredVector = false,
    minRasterDimension = 72,
  } = options;

  const pageView = page.view || [0, 0, 612, 792];
  const pageWidth = Math.abs(pageView[2] - pageView[0]);
  const pageHeight = Math.abs(pageView[3] - pageView[1]);
  const pageMidX = (pageView[0] + pageView[2]) / 2.0;

  // Extract both geometry and captions
  const [geometry, captionResult] = await Promise.all([
    extractPageGeometry(page),
    detectCaptions(page),
  ]);

  const detectedRegions = [];
  const claimedImageIndices = new Set();
  const claimedRuleIndices = new Set();
  const claimedClusterIndices = new Set();

  // Helper to determine whether a box is in column 1, column 2, or spans both
  function getColumnPlacement(box) {
    const isSpan = box.width >= 0.60 * pageWidth;
    if (isSpan) return "span";
    return (box.maxX <= pageMidX + 25) ? "col1" : (box.minX >= pageMidX - 25) ? "col2" : "center";
  }

  // 1. Anchor-Driven Association (Figures and Tables with Captions)
  for (const caption of captionResult.captions) {
    const capBounds = caption.bounds;
    const isTable = caption.targetType === "table";
    const capCol = getColumnPlacement(capBounds);

    const associatedBoxes = [capBounds];
    let captionPosition = "below"; // Default for figures
    let matchedRules = 0;
    let matchedImages = 0;
    let matchedClusters = 0;

    if (isTable) {
      // Tables: Look for horizontal rules both ABOVE and BELOW the caption
      // (within vertical reach of 300 pt and matching column bounds)
      for (let r = 0; r < geometry.horizontalRules.length; r++) {
        const rule = geometry.horizontalRules[r];
        const ruleBox = { minX: rule.x1, maxX: rule.x2, minY: rule.y - rule.thickness / 2, maxY: rule.y + rule.thickness / 2, width: rule.length, height: rule.thickness };
        const ruleCol = getColumnPlacement(ruleBox);

        // Column match: either spans both, or both in same column
        const colMatch = (capCol === "span" || ruleCol === "span" || capCol === ruleCol);
        const distY = Math.abs(rule.y - capBounds.minY);

        if (colMatch && distY <= 300) {
          associatedBoxes.push(ruleBox);
          claimedRuleIndices.add(r);
          matchedRules++;
          if (rule.y > capBounds.maxY) {
            captionPosition = "below";
          } else if (rule.y < capBounds.minY) {
            captionPosition = "above";
          }
        }
      }
    } else {
      // Figures: Look for visual candidates bidirectionally (both ABOVE and BELOW caption)
      const candidatesAbove = [];
      const candidatesBelow = [];

      // Check unclaimed raster images
      for (let m = 0; m < geometry.images.length; m++) {
        if (claimedImageIndices.has(m) || geometry.images[m].isCoverPage) continue;
        const img = geometry.images[m];
        const imgBox = img.bounds;
        const imgCol = getColumnPlacement(imgBox);
        const colMatch = (capCol === "span" || imgCol === "span" || capCol === imgCol);
        if (!colMatch) continue;

        // Is candidate above caption? (y_elem > y_cap)
        const isAbove = imgBox.minY >= capBounds.maxY - 15 && imgBox.minY <= capBounds.maxY + MAX_FIGURE_SEARCH_DISTANCE;
        if (isAbove && !hasInterveningCaption(capBounds, imgBox, "above", captionResult.captions, capCol, getColumnPlacement)) {
          const dist = Math.max(0, imgBox.minY - capBounds.maxY);
          candidatesAbove.push({ type: "image", index: m, box: imgBox, dist });
        }

        // Is candidate below caption? (y_elem < y_cap)
        const isBelow = imgBox.maxY <= capBounds.minY + 15 && imgBox.maxY >= capBounds.minY - MAX_FIGURE_SEARCH_DISTANCE;
        if (isBelow && !hasInterveningCaption(capBounds, imgBox, "below", captionResult.captions, capCol, getColumnPlacement)) {
          const dist = Math.max(0, capBounds.minY - imgBox.maxY);
          candidatesBelow.push({ type: "image", index: m, box: imgBox, dist });
        }
      }

      // Check unclaimed vector clusters
      for (let c = 0; c < geometry.vectorClusters.length; c++) {
        if (claimedClusterIndices.has(c)) continue;
        const cluster = geometry.vectorClusters[c];
        const cBox = cluster.bounds;
        if (cBox.width < 40 && cBox.height < 40) continue;

        const cCol = getColumnPlacement(cBox);
        const colMatch = (capCol === "span" || cCol === "span" || capCol === cCol);
        if (!colMatch) continue;

        // Is candidate above caption?
        const isAbove = cBox.minY >= capBounds.maxY - 15 && cBox.minY <= capBounds.maxY + MAX_FIGURE_SEARCH_DISTANCE;
        if (isAbove && !hasInterveningCaption(capBounds, cBox, "above", captionResult.captions, capCol, getColumnPlacement)) {
          const dist = Math.max(0, cBox.minY - capBounds.maxY);
          candidatesAbove.push({ type: "cluster", index: c, box: cBox, dist });
        }

        // Is candidate below caption?
        const isBelow = cBox.maxY <= capBounds.minY + 15 && cBox.maxY >= capBounds.minY - MAX_FIGURE_SEARCH_DISTANCE;
        if (isBelow && !hasInterveningCaption(capBounds, cBox, "below", captionResult.captions, capCol, getColumnPlacement)) {
          const dist = Math.max(0, capBounds.minY - cBox.maxY);
          candidatesBelow.push({ type: "cluster", index: c, box: cBox, dist });
        }
      }

      // Direction Selection:
      // In academic typography, figures overwhelmingly sit above their caption (captionPosition = "below").
      // Prefer "above" if candidates exist above; if only below, or if below is strictly closer, choose "below".
      let chosenCandidates = [];
      if (candidatesAbove.length > 0 && candidatesBelow.length === 0) {
        chosenCandidates = candidatesAbove;
        captionPosition = "below";
      } else if (candidatesAbove.length === 0 && candidatesBelow.length > 0) {
        chosenCandidates = candidatesBelow;
        captionPosition = "above";
      } else if (candidatesAbove.length > 0 && candidatesBelow.length > 0) {
        const minDistAbove = Math.min(...candidatesAbove.map(c => c.dist));
        const minDistBelow = Math.min(...candidatesBelow.map(c => c.dist));
        if (minDistBelow < minDistAbove) {
          chosenCandidates = candidatesBelow;
          captionPosition = "above";
        } else {
          chosenCandidates = candidatesAbove;
          captionPosition = "below";
        }
      }

      // Associate selected elements and mark them claimed
      for (const cand of chosenCandidates) {
        associatedBoxes.push(cand.box);
        if (cand.type === "image") {
          claimedImageIndices.add(cand.index);
          matchedImages++;
        } else {
          claimedClusterIndices.add(cand.index);
          matchedClusters++;
        }
      }
    }

    // Build composite bounding box
    const unionRaw = unionBoxes(associatedBoxes);
    const clampedBounds = clampToPageView(unionRaw, pageView);

    // Filter out degenerate zero or whole-page regions
    if (clampedBounds.width >= 50 && clampedBounds.height >= 30) {
      const isFullPage = (clampedBounds.width >= 0.95 * pageWidth && clampedBounds.height >= 0.95 * pageHeight);
      if (!isFullPage) {
        let confidence = caption.confidence;
        if (isTable && matchedRules >= 2) confidence = Math.min(1.0, confidence + 0.05);
        if (!isTable && (matchedImages > 0 || matchedClusters > 0)) confidence = Math.min(1.0, confidence + 0.05);

        detectedRegions.push({
          assetType: isTable ? "table" : "figure",
          pageNumber: geometry.pageNumber,
          bounds: clampedBounds,
          caption: {
            identifier: caption.identifier,
            fullText: caption.captionText,
            position: captionPosition,
          },
          detectionMethod: isTable ? "caption_table_rules" : (matchedImages > 0 ? "caption_raster_association" : "caption_vector_association"),
          heuristicConfidence: confidence,
          metadata: {
            matchedRules,
            matchedImages,
            matchedClusters,
            columnPlacement: capCol,
          },
        });
      }
    }
  }

  // 2. Standalone Embedded Raster Fallback (Figures without Captions)
  for (let m = 0; m < geometry.images.length; m++) {
    if (claimedImageIndices.has(m)) continue;
    const img = geometry.images[m];
    if (img.isCoverPage || img.isRepeated) continue;

    const b = img.bounds;
    // Skip tiny decorative icons/bullets or zero-sized boxes
    if (b.width < minRasterDimension || b.height < minRasterDimension) {
      continue;
    }

    const clampedBounds = clampToPageView(b, pageView);
    if (clampedBounds.width >= minRasterDimension && clampedBounds.height >= minRasterDimension) {
      // Check if it was already enclosed by an existing detected region
      const alreadyEnclosed = detectedRegions.some(dr => calculateBoxIoU(dr.bounds, clampedBounds) >= 0.70);
      if (!alreadyEnclosed) {
        detectedRegions.push({
          assetType: "figure",
          pageNumber: geometry.pageNumber,
          bounds: clampedBounds,
          caption: null,
          detectionMethod: "embedded_raster",
          heuristicConfidence: 0.75,
          metadata: {
            objId: img.objId,
            isStandaloneRaster: true,
          },
        });
      }
    }
  }

  // 3. Experimental Unanchored Vector Clustering (Disabled by default)
  if (enableUnanchoredVector && captionResult.captions.length === 0) {
    // Only executed if explicitly requested on pages with no captions
    // Group dense unanchored vector clusters
    const candidateClusters = geometry.vectorClusters.filter(c => c.bounds.width >= 100 && c.bounds.height >= 100);
    if (candidateClusters.length > 0) {
      const uBox = clampToPageView(unionBoxes(candidateClusters.map(c => c.bounds)), pageView);
      if (uBox.width >= 100 && uBox.height >= 100) {
        detectedRegions.push({
          assetType: "figure",
          pageNumber: geometry.pageNumber,
          bounds: uBox,
          caption: null,
          detectionMethod: "vector_cluster_unanchored",
          heuristicConfidence: 0.50, // Low confidence
          metadata: { isUnanchoredExperimental: true },
        });
      }
    }
  }

  // 4. Stable Reading Order Sorting
  // Top-to-bottom, column 1 before column 2
  detectedRegions.sort((a, b) => {
    // In PDF y goes up, so top of page has LARGER maxY
    const yDiff = b.bounds.maxY - a.bounds.maxY;
    if (Math.abs(yDiff) > 50) {
      return yDiff;
    }
    return a.bounds.minX - b.bounds.minX;
  });

  // Assign stable readingOrderIndex
  for (let idx = 0; idx < detectedRegions.length; idx++) {
    detectedRegions[idx].readingOrderIndex = idx + 1;
  }

  return detectedRegions;
}

