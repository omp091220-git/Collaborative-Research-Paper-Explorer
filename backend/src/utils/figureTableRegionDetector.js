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
import { BASELINE_PADDING_POINTS } from "./regionCropper.js";

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

const MAX_REGION_PAGE_AREA_RATIO = 0.85;

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

function boxGaps(a, b) {
  return {
    x: Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
    y: Math.max(0, a.minY - b.maxY, b.minY - a.maxY),
  };
}

function adaptiveSpatialGap(a, b, referenceFontSize, pageWidth, pageHeight, maximumGapRatio = 0.075) {
  const largestPrimitiveSpan = Math.max(a.width, a.height, b.width, b.height);
  const pageScaleLimit = Math.min(pageWidth, pageHeight) * maximumGapRatio;
  return Math.min(pageScaleLimit, Math.max(referenceFontSize * 2.5, largestPrimitiveSpan * 0.055));
}

/** Groups visual primitives using a page- and content-scale-aware neighborhood. */
function groupSpatialCandidates(candidates, referenceFontSize = 9, pageWidth = 612, pageHeight = 792, maximumGapRatio = 0.075) {
  const groups = [];
  const visited = new Set();

  for (let start = 0; start < candidates.length; start++) {
    if (visited.has(start)) continue;
    const stack = [start];
    const members = [];
    visited.add(start);

    while (stack.length) {
      const current = stack.pop();
      members.push(candidates[current]);
      for (let next = 0; next < candidates.length; next++) {
        if (visited.has(next)) continue;
        const gaps = boxGaps(candidates[current].box, candidates[next].box);
        const gap = adaptiveSpatialGap(
          candidates[current].box,
          candidates[next].box,
          referenceFontSize,
          pageWidth,
          pageHeight,
          maximumGapRatio
        );
        if (Math.hypot(gaps.x, gaps.y) <= gap) {
          visited.add(next);
          stack.push(next);
        }
      }
    }

    groups.push({
      members,
      bounds: unionBoxes(members.map((member) => member.box)),
    });
  }

  return groups;
}

function horizontalAssociationMatch(a, b, pageWidth) {
  if (a.width >= pageWidth * 0.55 || b.width >= pageWidth * 0.55) return true;
  const overlap = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const overlapRatio = overlap / Math.max(1, Math.min(a.width, b.width));
  const centerDelta = Math.abs((a.minX + a.maxX - b.minX - b.maxX) / 2);
  return overlapRatio >= 0.25 || centerDelta <= pageWidth * 0.12;
}

function getAdaptiveCaptionSearchDistance(caption, pageWidth, pageHeight) {
  const fontSize = Math.max(6, caption.fontSize || 9);
  const pageScale = Math.min(pageWidth, pageHeight);
  return Math.min(pageScale * 0.34, Math.max(fontSize * 10, pageScale * 0.18));
}

function textInsideCaption(itemBounds, caption) {
  const captionBounds = caption.bounds;
  const padding = Math.max(2, caption.fontSize || 9);
  const overlapWidth = Math.max(0, Math.min(itemBounds.maxX, captionBounds.maxX + padding) - Math.max(itemBounds.minX, captionBounds.minX - padding));
  const overlapHeight = Math.max(0, Math.min(itemBounds.maxY, captionBounds.maxY + padding) - Math.max(itemBounds.minY, captionBounds.minY - padding));
  const itemArea = Math.max(1, itemBounds.width * itemBounds.height);
  if (itemBounds.width === 0) {
    const centerX = (itemBounds.minX + itemBounds.maxX) / 2;
    return centerX >= captionBounds.minX - padding && centerX <= captionBounds.maxX + padding && overlapHeight > 0;
  }
  return (overlapWidth * overlapHeight) / itemArea >= 0.5;
}

function isLikelyFigureLabel(text) {
  const value = (text || "").trim();
  if (!value || /^(?:figure|fig\.?|table)\s/i.test(value)) return false;
  const words = value.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length === 0) return false;
  if (words.length > 6 || value.length > 72) return false;
  if (words.length >= 5 && /[.!?;:]\s*$/.test(value)) return false;
  return words.length <= 3 || /[\p{N}\p{S}]/u.test(value);
}

function isInlineSingleLetter(textItem, textItems) {
  const value = (textItem?.text || "").trim();
  if (!/^\p{L}$/u.test(value)) return false;
  const bounds = textItem.bounds;
  const fontSize = Math.max(6, textItem.fontSize || 9);
  const baselineTolerance = Math.max(2, fontSize * 0.3);
  const inlineGap = Math.max(2, fontSize * 0.6);
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return (textItems || []).some((other) => {
    if (other === textItem || !other.bounds) return false;
    const otherText = (other.text || "").trim();
    if (!otherText) return false;
    const otherCenterY = (other.bounds.minY + other.bounds.maxY) / 2;
    if (Math.abs(centerY - otherCenterY) > baselineTolerance) return false;
    const gap = Math.max(0, bounds.minX - other.bounds.maxX, other.bounds.minX - bounds.maxX);
    return gap <= inlineGap;
  });
}

function includeFigureLabelBounds(bounds, textItems, captions, pageView) {
  const labels = [];
  const pageMinY = Math.min(pageView[1], pageView[3]);
  const pageMaxY = Math.max(pageView[1], pageView[3]);
  const pageHeight = pageMaxY - pageMinY;
  for (const textItem of textItems || []) {
    const itemBounds = textItem.bounds;
    if (!itemBounds || !isLikelyFigureLabel(textItem.text)) continue;
    // PDF text extraction often splits a prose line into words, spaces, and a
    // separate one-letter math glyph (for example, an inline variable). Treat
    // that glyph as body text when it continues a same-baseline text run.
    if (isInlineSingleLetter(textItem, textItems)) continue;
    if (captions.some((caption) => textInsideCaption(itemBounds, caption))) continue;
    const fontSize = Math.max(6, textItem.fontSize || 9);
    const isPageFolio = /^\d{1,3}$/.test(textItem.text.trim()) &&
      (itemBounds.maxY >= pageMaxY - pageHeight * 0.07 || itemBounds.minY <= pageMinY + pageHeight * 0.07);
    const intersectsVisual = itemBounds.minX < bounds.maxX && itemBounds.maxX > bounds.minX &&
      itemBounds.minY < bounds.maxY && itemBounds.maxY > bounds.minY;
    if (isPageFolio && !intersectsVisual) continue;
    const horizontalMargin = Math.max(fontSize * 3, bounds.width * 0.13);
    const verticalMargin = Math.max(fontSize * 3, bounds.height * 0.18);
    if (itemBounds.minX < bounds.minX - horizontalMargin || itemBounds.maxX > bounds.maxX + horizontalMargin ||
        itemBounds.minY < bounds.minY - verticalMargin || itemBounds.maxY > bounds.maxY + verticalMargin) continue;
    labels.push(itemBounds);
  }
  return labels.length ? unionBoxes([bounds, ...labels]) : bounds;
}

function hasAdjacentBodyText(bounds, textItems, captions) {
  for (const item of textItems || []) {
    const box = item.bounds;
    const text = (item.text || "").trim();
    const wordCount = text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
    if (!box || isLikelyFigureLabel(text) || captions.some((caption) => textInsideCaption(box, caption))) continue;
    if (wordCount < 7 && text.length <= 56) continue;

    const gapX = Math.max(0, bounds.minX - box.maxX, box.minX - bounds.maxX);
    const gapY = Math.max(0, bounds.minY - box.maxY, box.minY - bounds.maxY);
    if (Math.hypot(gapX, gapY) <= BASELINE_PADDING_POINTS) return true;
  }
  return false;
}

function isPlausibleRegion(box, pageWidth, pageHeight, { minWidth = 50, minHeight = 30 } = {}) {
  if (box.width < minWidth || box.height < minHeight) return false;
  if (box.width >= pageWidth * 0.98 || box.height >= pageHeight * 0.95) return false;
  return (box.width * box.height) / (pageWidth * pageHeight) <= MAX_REGION_PAGE_AREA_RATIO;
}

function distanceToCaption(box, captionBounds, direction) {
  return direction === "above"
    ? Math.max(0, box.minY - captionBounds.maxY)
    : Math.max(0, captionBounds.minY - box.maxY);
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
    onFontDiagnostics,
  } = options;

  const pageView = page.view || [0, 0, 612, 792];
  const pageWidth = Math.abs(pageView[2] - pageView[0]);
  const pageHeight = Math.abs(pageView[3] - pageView[1]);

  // Extract both geometry and captions
  const [geometry, captionResult] = await Promise.all([
    extractPageGeometry(page),
    detectCaptions(page),
  ]);
  if (typeof onFontDiagnostics === "function") {
    onFontDiagnostics(captionResult.fontDiagnostics);
  }

  const detectedRegions = [];
  const claimedImageIndices = new Set();
  const claimedClusterIndices = new Set();

  const captionFontSize = Math.max(6, ...captionResult.captions.map((item) => item.fontSize || 9));

  // 1. Anchor-Driven Association (Figures and Tables with Captions)
  for (const caption of captionResult.captions) {
    const capBounds = caption.bounds;
    const isTable = caption.targetType === "table";

    // Caption text is retained as metadata, but never contributes to visual bounds.
    const associatedBoxes = [];
    let captionPosition = "below"; // Default for figures
    let matchedRules = 0;
    let matchedImages = 0;
    let matchedClusters = 0;

    if (isTable) {
      // Tables are bounded by a nearby spatial group of horizontal rules.
      // The caption remains metadata and is excluded from the rendered crop.
      const ruleCandidates = [];
      for (let r = 0; r < geometry.horizontalRules.length; r++) {
        const rule = geometry.horizontalRules[r];
        const ruleBox = { minX: rule.x1, maxX: rule.x2, minY: rule.y - rule.thickness / 2, maxY: rule.y + rule.thickness / 2, width: rule.length, height: rule.thickness };
        const colMatch = horizontalAssociationMatch(capBounds, ruleBox, pageWidth);
        const tableDistance = getAdaptiveCaptionSearchDistance(caption, pageWidth, pageHeight) * 1.5;
        if (!colMatch || Math.abs(rule.y - capBounds.minY) > tableDistance) continue;
        ruleCandidates.push({ type: "rule", index: r, box: ruleBox });
      }

      const tableGroupingFontScale = Math.max(captionFontSize, Math.min(pageHeight * 0.12, pageWidth * 0.15) / 3);
      const ruleGroups = groupSpatialCandidates(ruleCandidates, tableGroupingFontScale, pageWidth, pageHeight, 0.14)
        .filter((group) => group.members.length >= 2)
        .map((group) => ({
          ...group,
          distance: distanceToCaption(group.bounds, capBounds, group.bounds.minY >= capBounds.maxY ? "above" : "below"),
        }))
        .sort((a, b) => a.distance - b.distance);

      if (ruleGroups.length) {
        const selected = ruleGroups[0];
        associatedBoxes.push(selected.bounds);
        matchedRules = selected.members.length;
        captionPosition = selected.bounds.minY >= capBounds.maxY ? "below" : "above";
      }
    } else {
      // Collect nearby raster and vector primitives, then associate one coherent
      // spatial component rather than unioning every candidate in a wide column.
      const candidatesAbove = [];
      const candidatesBelow = [];

      const addCandidate = (candidate) => {
        const { box } = candidate;
        if (!horizontalAssociationMatch(capBounds, box, pageWidth)) return;

        const directions = [
          { name: "above", qualifies: box.minY >= capBounds.maxY - 15, distance: Math.max(0, box.minY - capBounds.maxY) },
          { name: "below", qualifies: box.maxY <= capBounds.minY + 15, distance: Math.max(0, capBounds.minY - box.maxY) },
        ];
        for (const direction of directions) {
          const maxDistance = getAdaptiveCaptionSearchDistance(caption, pageWidth, pageHeight);
          if (!direction.qualifies || direction.distance > maxDistance) continue;
          if (captionResult.captions.some((other) => {
            if (other === caption || !horizontalAssociationMatch(capBounds, other.bounds, pageWidth)) return false;
            return direction.name === "above"
              ? other.bounds.minY > capBounds.maxY && other.bounds.minY < box.minY
              : other.bounds.maxY < capBounds.minY && other.bounds.maxY > box.maxY;
          })) continue;
          (direction.name === "above" ? candidatesAbove : candidatesBelow).push(candidate);
          break;
        }
      };

      // Check unclaimed raster images
      for (let m = 0; m < geometry.images.length; m++) {
        if (claimedImageIndices.has(m) || geometry.images[m].isCoverPage) continue;
        addCandidate({ type: "image", index: m, box: geometry.images[m].bounds });
      }

      // Check unclaimed vector clusters
      for (let c = 0; c < geometry.vectorClusters.length; c++) {
        if (claimedClusterIndices.has(c)) continue;
        const cluster = geometry.vectorClusters[c];
        const cBox = cluster.bounds;
        if (cBox.width < 40 && cBox.height < 40) continue;

        addCandidate({ type: "cluster", index: c, box: cBox });
      }

      const groupsAbove = groupSpatialCandidates(candidatesAbove, caption.fontSize, pageWidth, pageHeight).filter((group) =>
        isPlausibleRegion(group.bounds, pageWidth, pageHeight)
      );
      const groupsBelow = groupSpatialCandidates(candidatesBelow, caption.fontSize, pageWidth, pageHeight).filter((group) =>
        isPlausibleRegion(group.bounds, pageWidth, pageHeight)
      );
      // Prefer the conventional figure-above-caption arrangement. This keeps
      // immediately following body text from winning solely because it is close.
      // Captions above figures remain supported when no plausible group is above.
      const directionGroups = groupsAbove.length ? groupsAbove : groupsBelow;
      const direction = groupsAbove.length ? "above" : "below";
      const rankedGroups = directionGroups.map((group) => ({
        ...group,
        direction,
        distance: distanceToCaption(group.bounds, capBounds, direction),
      })).sort((a, b) => a.distance - b.distance);

      const selected = rankedGroups[0];
      const panelGapLimit = Math.max(caption.fontSize * 4, pageWidth * 0.08);
      const panelBandLimit = Math.max(caption.fontSize * 4, pageHeight * 0.05);
      const selectedPanelPeers = selected && capBounds.width >= pageWidth * 0.55
        ? rankedGroups.slice(1).filter((candidateGroup) => {
          const gaps = boxGaps(selected.bounds, candidateGroup.bounds);
          return gaps.x <= panelGapLimit && gaps.y <= panelBandLimit &&
            Math.abs(candidateGroup.distance - selected.distance) <= panelBandLimit;
        })
        : [];
      const ambiguous = selected && rankedGroups[1] &&
        Math.abs(rankedGroups[1].distance - selected.distance) < 12 && selectedPanelPeers.length === 0;
      if (selected && !ambiguous) {
        const selectedGroups = [selected, ...selectedPanelPeers];
        associatedBoxes.push(...selectedGroups.map((group) => group.bounds));
        captionPosition = selected.direction === "above" ? "below" : "above";
        for (const group of selectedGroups) {
          for (const member of group.members) {
            if (member.type === "image") {
              claimedImageIndices.add(member.index);
              matchedImages++;
            } else {
              claimedClusterIndices.add(member.index);
              matchedClusters++;
            }
          }
        }
      }
    }

    if (associatedBoxes.length === 0) continue;
    let clampedBounds = clampToPageView(unionBoxes(associatedBoxes), pageView);
    let cropPaddingPoints;
    if (!isTable) {
      clampedBounds = clampToPageView(
        includeFigureLabelBounds(clampedBounds, captionResult.textItems, captionResult.captions, pageView),
        pageView
      );
      if (hasAdjacentBodyText(clampedBounds, captionResult.textItems, captionResult.captions)) {
        cropPaddingPoints = 0;
      }
    }

    if (isPlausibleRegion(clampedBounds, pageWidth, pageHeight)) {
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
        cropPaddingPoints,
        metadata: {
          matchedRules,
          matchedImages,
          matchedClusters,
          columnPlacement: caption.bounds.width >= pageWidth * 0.55 ? "span" : "local",
        },
      });
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

