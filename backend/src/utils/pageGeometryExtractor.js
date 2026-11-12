/**
 * pageGeometryExtractor.js
 *
 * FR-09 Phase 3.2: PDF Page Geometry and Vector/Raster Path Extractor.
 *
 * Traverses PDF.js operator streams, maintains graphics state stack across
 * save/restore, calculates exact maximum singular values for affine stroke
 * scaling, performs Sutherland-Hodgman polygon clipping against actual
 * page.view bounds, and classifies lines, vector clusters, and raster images.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Default render scale used for hairline point calculations.
 */
export const DEFAULT_RENDER_SCALE = 2.0;

/**
 * Coverage threshold for full-page cover image suppression.
 */
export const COVER_PAGE_THRESHOLD = 0.90;

/**
 * Multiplies two 2D affine transformation matrices [a, b, c, d, e, f].
 * Represents matrix [ [a, c, e], [b, d, f], [0, 0, 1] ].
 *
 * @param {number[]} m1 - First affine matrix
 * @param {number[]} m2 - Second affine matrix
 * @returns {number[]} Resulting affine matrix (m1 * m2)
 */
export function multiplyAffine(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Transforms a 2D point [x, y] using an affine matrix.
 *
 * @param {number[]} m - Affine matrix [a, b, c, d, e, f]
 * @param {[number, number]} p - Point [x, y]
 * @returns {[number, number]} Transformed point [x', y']
 */
export function applyAffine(m, p) {
  return [
    m[0] * p[0] + m[2] * p[1] + m[4],
    m[1] * p[0] + m[3] * p[1] + m[5],
  ];
}

/**
 * Computes the exact largest singular value (operator norm) of the
 * linear submatrix [ [a, c], [b, d] ] of an affine transformation.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {number} Exact maximum singular value sigmaMax
 */
export function getMatrixMaxSingularValue(a, b, c, d) {
  const s1 = a * a + b * b;
  const s2 = c * c + d * d;
  const p = a * c + b * d;
  const trace = s1 + s2;
  const disc = Math.hypot(s1 - s2, 2 * p);
  return Math.sqrt((trace + disc) / 2);
}

/**
 * Clips a polygon against an axis-aligned boundary line (Sutherland-Hodgman).
 *
 * @param {Array<[number, number]>} poly - Input polygon vertices
 * @param {number} coordIdx - 0 for X axis, 1 for Y axis
 * @param {number} boundaryVal - Coordinate boundary value
 * @param {boolean} isGreater - True if inside is >= boundaryVal, false if <= boundaryVal
 * @returns {Array<[number, number]>} Clipped polygon vertices
 */
export function clipPolygonAxis(poly, coordIdx, boundaryVal, isGreater) {
  if (!poly || poly.length === 0) return [];
  const out = [];

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curInside = isGreater ? cur[coordIdx] >= boundaryVal : cur[coordIdx] <= boundaryVal;
    const prevInside = isGreater ? prev[coordIdx] >= boundaryVal : prev[coordIdx] <= boundaryVal;

    if (curInside) {
      if (!prevInside) {
        const delta = cur[coordIdx] - prev[coordIdx];
        const t = Math.abs(delta) < 1e-12 ? 0 : (boundaryVal - prev[coordIdx]) / delta;
        out.push([
          prev[0] + t * (cur[0] - prev[0]),
          prev[1] + t * (cur[1] - prev[1]),
        ]);
      }
      out.push(cur);
    } else if (prevInside) {
      const delta = cur[coordIdx] - prev[coordIdx];
      const t = Math.abs(delta) < 1e-12 ? 0 : (boundaryVal - prev[coordIdx]) / delta;
      out.push([
        prev[0] + t * (cur[0] - prev[0]),
        prev[1] + t * (cur[1] - prev[1]),
      ]);
    }
  }

  return out;
}

/**
 * Calculates polygon area using the Shoelace formula (surveyor's formula).
 *
 * @param {Array<[number, number]>} poly - Polygon vertices
 * @returns {number} Non-negative area
 */
export function polygonArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculates page coverage ratio of an image quad against the actual page.view bounds.
 *
 * @param {Array<[number, number]>} quad - 4 corners of transformed image in PDF user points
 * @param {[number, number, number, number]} pageView - [x0, y0, x1, y1] from page.view
 * @returns {number} Coverage ratio between 0.0 and 1.0
 */
export function calculateImagePageCoverage(quad, pageView) {
  if (!pageView || pageView.length < 4) return 0;
  const [x0, y0, x1, y1] = pageView;
  const pageArea = Math.abs((x1 - x0) * (y1 - y0));
  if (pageArea <= 0) return 0;

  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  let poly = quad;
  poly = clipPolygonAxis(poly, 0, minX, true);  // x >= minX
  poly = clipPolygonAxis(poly, 0, maxX, false); // x <= maxX
  poly = clipPolygonAxis(poly, 1, minY, true);  // y >= minY
  poly = clipPolygonAxis(poly, 1, maxY, false); // y <= maxY

  const intersectionArea = polygonArea(poly);
  return intersectionArea / pageArea;
}

/**
 * Manages the PDF graphics state stack across save/restore.
 */
export class GraphicsStateManager {
  constructor() {
    this.state = {
      ctm: [1, 0, 0, 1, 0, 0],
      lineWidth: 1.0,
      lineCap: 0,       // 0=butt, 1=round, 2=square
      lineJoin: 0,      // 0=miter, 1=round, 2=bevel
      miterLimit: 10.0,
    };
    this.stack = [];
  }

  save() {
    this.stack.push({
      ctm: [...this.state.ctm],
      lineWidth: this.state.lineWidth,
      lineCap: this.state.lineCap,
      lineJoin: this.state.lineJoin,
      miterLimit: this.state.miterLimit,
    });
  }

  restore() {
    if (this.stack.length > 0) {
      this.state = this.stack.pop();
    }
  }

  applyTransform(matrix) {
    if (Array.isArray(matrix) && matrix.length === 6) {
      this.state.ctm = multiplyAffine(this.state.ctm, matrix);
    }
  }

  setLineWidth(w) {
    if (typeof w === "number" && !Number.isNaN(w)) {
      this.state.lineWidth = Math.max(0, w);
    }
  }

  setLineCap(cap) {
    if (Number.isInteger(cap)) {
      this.state.lineCap = cap;
    }
  }

  setLineJoin(join) {
    if (Number.isInteger(join)) {
      this.state.lineJoin = join;
    }
  }

  setMiterLimit(limit) {
    if (typeof limit === "number" && !Number.isNaN(limit)) {
      this.state.miterLimit = Math.max(1.0, limit);
    }
  }

  applyGState(dict) {
    if (Array.isArray(dict)) {
      for (const [k, v] of dict) {
        if (k === "LW") this.setLineWidth(v);
        else if (k === "LC") this.setLineCap(v);
        else if (k === "LJ") this.setLineJoin(v);
        else if (k === "ML") this.setMiterLimit(v);
      }
    }
  }
}

/**
 * Internal helper to track active path geometry before painting.
 */
class ActivePathBuilder {
  constructor() {
    this.points = [];
    this.segments = []; // Subpaths / segments for miter join analysis
    this.currentPoint = [0, 0];
    this.subpathStart = [0, 0];
  }

  moveTo(pt) {
    this.currentPoint = pt;
    this.subpathStart = pt;
    this.points.push(pt);
  }

  lineTo(pt) {
    this.segments.push([this.currentPoint, pt]);
    this.currentPoint = pt;
    this.points.push(pt);
  }

  curveTo(cp1, cp2, endPt) {
    // Collect control points and endpoint
    this.segments.push([this.currentPoint, endPt]);
    this.points.push(cp1, cp2, endPt);
    this.currentPoint = endPt;
  }

  rectangle(pt0, pt1, pt2, pt3) {
    this.points.push(pt0, pt1, pt2, pt3);
    this.segments.push([pt0, pt1], [pt1, pt2], [pt2, pt3], [pt3, pt0]);
    this.currentPoint = pt0;
  }

  closePath() {
    if (this.currentPoint[0] !== this.subpathStart[0] || this.currentPoint[1] !== this.subpathStart[1]) {
      this.segments.push([this.currentPoint, this.subpathStart]);
      this.currentPoint = this.subpathStart;
    }
  }

  isEmpty() {
    return this.points.length === 0;
  }

  getBounds() {
    if (this.points.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of this.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  clear() {
    this.points = [];
    this.segments = [];
  }
}

/**
 * Traverses a PDF.js page's operator list, tracks graphics state, and extracts
 * page-space geometries (images, horizontal/vertical rules, and vector clusters).
 *
 * @param {object} page - PDF.js PageProxy
 * @param {object} [options]
 * @param {number} [options.renderScale=2.0] - Scale used for hairline minimum
 * @returns {Promise<object>} Page geometry metadata
 */
export async function extractPageGeometry(page, { renderScale = DEFAULT_RENDER_SCALE } = {}) {
  if (!page || typeof page.getOperatorList !== "function") {
    throw new Error("extractPageGeometry: Invalid PDF page instance");
  }

  const pageView = page.view || [0, 0, 612, 792];
  const ops = await page.getOperatorList();
  const gstate = new GraphicsStateManager();
  const activePath = new ActivePathBuilder();

  const extracted = {
    pageNumber: page.pageNumber || 1,
    pageView: [...pageView],
    pageWidth: Math.abs(pageView[2] - pageView[0]),
    pageHeight: Math.abs(pageView[3] - pageView[1]),
    images: [],
    horizontalRules: [],
    verticalRules: [],
    vectorClusters: [],
    suppressedCoverImages: [],
    maxRequiredMiterPadding: 0,
    statistics: {
      totalOps: ops.fnArray.length,
      pathOps: 0,
      imageOps: 0,
      ruleCount: 0,
    },
  };

  const fnArray = ops.fnArray;
  const argsArray = ops.argsArray;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    switch (fn) {
      // 1. Graphics State Stack
      case pdfjs.OPS.save:
        gstate.save();
        break;

      case pdfjs.OPS.restore:
        gstate.restore();
        break;

      case pdfjs.OPS.transform:
        gstate.applyTransform(args);
        break;

      // 2. Stroke & Join Parameter Operators
      case pdfjs.OPS.setLineWidth:
        if (args && args.length > 0) gstate.setLineWidth(args[0]);
        break;

      case pdfjs.OPS.setLineCap:
        if (args && args.length > 0) gstate.setLineCap(args[0]);
        break;

      case pdfjs.OPS.setLineJoin:
        if (args && args.length > 0) gstate.setLineJoin(args[0]);
        break;

      case pdfjs.OPS.setMiterLimit:
        if (args && args.length > 0) gstate.setMiterLimit(args[0]);
        break;

      case pdfjs.OPS.setGState:
        if (args && args.length > 0) gstate.applyGState(args[0]);
        break;

      // 3. Vector Path Construction
      case pdfjs.OPS.constructPath: {
        extracted.statistics.pathOps++;
        if (!Array.isArray(args) || args.length < 2) break;
        const subOps = args[0];
        const coords = args[1];
        if (!Array.isArray(subOps) || !coords) break;

        const ctm = gstate.state.ctm;
        let coordIdx = 0;

        for (let s = 0; s < subOps.length; s++) {
          const subOp = subOps[s];
          switch (subOp) {
            case pdfjs.OPS.rectangle: { // 19: consumes 4 floats
              if (coordIdx + 3 < coords.length) {
                const rx = coords[coordIdx++];
                const ry = coords[coordIdx++];
                const rw = coords[coordIdx++];
                const rh = coords[coordIdx++];
                const p0 = applyAffine(ctm, [rx, ry]);
                const p1 = applyAffine(ctm, [rx + rw, ry]);
                const p2 = applyAffine(ctm, [rx + rw, ry + rh]);
                const p3 = applyAffine(ctm, [rx, ry + rh]);
                activePath.rectangle(p0, p1, p2, p3);
              }
              break;
            }

            case pdfjs.OPS.moveTo: { // 13: consumes 2 floats
              if (coordIdx + 1 < coords.length) {
                const mx = coords[coordIdx++];
                const my = coords[coordIdx++];
                activePath.moveTo(applyAffine(ctm, [mx, my]));
              }
              break;
            }

            case pdfjs.OPS.lineTo: { // 14: consumes 2 floats
              if (coordIdx + 1 < coords.length) {
                const lx = coords[coordIdx++];
                const ly = coords[coordIdx++];
                activePath.lineTo(applyAffine(ctm, [lx, ly]));
              }
              break;
            }

            case pdfjs.OPS.curveTo: { // 15: consumes 6 floats
              if (coordIdx + 5 < coords.length) {
                const cp1 = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                const cp2 = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                const ep  = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                activePath.curveTo(cp1, cp2, ep);
              }
              break;
            }

            case pdfjs.OPS.curveTo2: { // 16: consumes 4 floats
              if (coordIdx + 3 < coords.length) {
                const cp2 = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                const ep  = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                activePath.curveTo(activePath.currentPoint, cp2, ep);
              }
              break;
            }

            case pdfjs.OPS.curveTo3: { // 17: consumes 4 floats
              if (coordIdx + 3 < coords.length) {
                const cp1 = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                const ep  = applyAffine(ctm, [coords[coordIdx++], coords[coordIdx++]]);
                activePath.curveTo(cp1, ep, ep);
              }
              break;
            }

            case pdfjs.OPS.closePath: // 18: consumes 0 floats
              activePath.closePath();
              break;

            default:
              break;
          }
        }
        break;
      }

      // 4. Path Painting Operators
      case pdfjs.OPS.stroke:
      case pdfjs.OPS.closeStroke:
      case pdfjs.OPS.fill:
      case pdfjs.OPS.eoFill:
      case pdfjs.OPS.fillStroke:
      case pdfjs.OPS.eoFillStroke:
      case pdfjs.OPS.endPath: {
        const isStroked = (
          fn === pdfjs.OPS.stroke ||
          fn === pdfjs.OPS.closeStroke ||
          fn === pdfjs.OPS.fillStroke ||
          fn === pdfjs.OPS.eoFillStroke
        );

        if (!activePath.isEmpty()) {
          const rawBounds = activePath.getBounds();
          if (rawBounds) {
            const ctm = gstate.state.ctm;
            const sigmaMax = getMatrixMaxSingularValue(ctm[0], ctm[1], ctm[2], ctm[3]);
            const lineWidth = gstate.state.lineWidth;
            const lineCap = gstate.state.lineCap;
            const lineJoin = gstate.state.lineJoin;
            const miterLimit = gstate.state.miterLimit;

            let deltaPath = 0;
            let miterResidual = 0;

            if (isStroked) {
              const isMultiSegment = activePath.segments.length > 1;
              const capFactor = lineCap === 2 ? Math.SQRT2 : 1.0;
              const joinFactor = (isMultiSegment && lineJoin === 0) ? 2.0 : 1.0;
              const effectiveFactor = Math.max(capFactor, joinFactor);

              // Hairline minimum floor in points: 1 / (2 * renderScale)
              const hairlineFloor = 1.0 / (2.0 * renderScale);
              deltaPath = Math.max(effectiveFactor * (lineWidth * sigmaMax / 2.0), hairlineFloor);

              // Calculate required residual miter padding for multi-segment miter joins
              if (isMultiSegment && lineJoin === 0) {
                miterResidual = Math.max(0, (miterLimit - 1.0) * lineWidth * sigmaMax);
                if (miterResidual > extracted.maxRequiredMiterPadding) {
                  extracted.maxRequiredMiterPadding = miterResidual;
                }
              }

              // Check for horizontal or vertical rules
              const spanX = rawBounds.maxX - rawBounds.minX;
              const spanY = rawBounds.maxY - rawBounds.minY;

              if (spanY <= 2.0 && spanX >= 60.0) {
                extracted.horizontalRules.push({
                  x1: rawBounds.minX - deltaPath,
                  x2: rawBounds.maxX + deltaPath,
                  y: (rawBounds.minY + rawBounds.maxY) / 2.0,
                  length: spanX + 2 * deltaPath,
                  thickness: Math.max(lineWidth * sigmaMax, 0.5),
                });
                extracted.statistics.ruleCount++;
              } else if (spanX <= 2.0 && spanY >= 60.0) {
                extracted.verticalRules.push({
                  y1: rawBounds.minY - deltaPath,
                  y2: rawBounds.maxY + deltaPath,
                  x: (rawBounds.minX + rawBounds.maxX) / 2.0,
                  length: spanY + 2 * deltaPath,
                  thickness: Math.max(lineWidth * sigmaMax, 0.5),
                });
                extracted.statistics.ruleCount++;
              }
            }

            extracted.vectorClusters.push({
              bounds: {
                minX: rawBounds.minX - deltaPath,
                minY: rawBounds.minY - deltaPath,
                maxX: rawBounds.maxX + deltaPath,
                maxY: rawBounds.maxY + deltaPath,
                width: rawBounds.width + 2 * deltaPath,
                height: rawBounds.height + 2 * deltaPath,
              },
              isStroked,
              pathCount: activePath.segments.length || 1,
            });
          }
        }

        activePath.clear();
        break;
      }

      // 5. Image Painting Operators
      case pdfjs.OPS.paintImageXObject:
      case pdfjs.OPS.paintInlineImageXObject: {
        extracted.statistics.imageOps++;
        if (!args || args.length === 0) break;

        const isInline = fn === pdfjs.OPS.paintInlineImageXObject;
        const objId = isInline ? undefined : (typeof args[0] === "string" ? args[0] : undefined);
        const ctm = gstate.state.ctm;

        // Transform 4 corners of unit square [0, 1] x [0, 1] through active CTM
        const p0 = applyAffine(ctm, [0, 0]);
        const p1 = applyAffine(ctm, [1, 0]);
        const p2 = applyAffine(ctm, [1, 1]);
        const p3 = applyAffine(ctm, [0, 1]);
        const quad = [p0, p1, p2, p3];

        const minX = Math.min(p0[0], p1[0], p2[0], p3[0]);
        const maxX = Math.max(p0[0], p1[0], p2[0], p3[0]);
        const minY = Math.min(p0[1], p1[1], p2[1], p3[1]);
        const maxY = Math.max(p0[1], p1[1], p2[1], p3[1]);

        // Evaluate actual page coverage via Sutherland-Hodgman clipping against pageView
        const coverageRatio = calculateImagePageCoverage(quad, pageView);

        const imgEntry = {
          type: isInline ? "inline" : "xobject",
          objId,
          bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
          quad,
          coverageRatio,
          isCoverPage: coverageRatio >= COVER_PAGE_THRESHOLD,
          intrinsicWidth: typeof args[1] === "number" ? args[1] : undefined,
          intrinsicHeight: typeof args[2] === "number" ? args[2] : undefined,
        };

        if (coverageRatio >= COVER_PAGE_THRESHOLD) {
          extracted.suppressedCoverImages.push(imgEntry);
        } else {
          extracted.images.push(imgEntry);
        }
        break;
      }

      case pdfjs.OPS.paintImageXObjectRepeat: {
        extracted.statistics.imageOps++;
        if (!args || args.length < 4) break;
        const [objId, scaleX, scaleY, positions] = args;
        if (!positions || positions.length < 2) break;

        const baseCtm = gstate.state.ctm;
        const repeatCount = Math.floor(positions.length / 2);

        for (let q = 0; q < repeatCount; q++) {
          const posX = positions[q << 1];
          const posY = positions[(q << 1) + 1];
          // Per-instance transform: baseCtm * [scaleX, 0, 0, scaleY, posX, posY]
          const instMatrix = [scaleX, 0, 0, scaleY, posX, posY];
          const effectiveCtm = multiplyAffine(baseCtm, instMatrix);

          const p0 = applyAffine(effectiveCtm, [0, 0]);
          const p1 = applyAffine(effectiveCtm, [1, 0]);
          const p2 = applyAffine(effectiveCtm, [1, 1]);
          const p3 = applyAffine(effectiveCtm, [0, 1]);
          const quad = [p0, p1, p2, p3];

          const minX = Math.min(p0[0], p1[0], p2[0], p3[0]);
          const maxX = Math.max(p0[0], p1[0], p2[0], p3[0]);
          const minY = Math.min(p0[1], p1[1], p2[1], p3[1]);
          const maxY = Math.max(p0[1], p1[1], p2[1], p3[1]);

          extracted.images.push({
            type: "repeat",
            objId: typeof objId === "string" ? objId : undefined,
            bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
            quad,
            coverageRatio: 0,
            isRepeated: true,
            repeatIndex: q,
          });
        }
        break;
      }

      case pdfjs.OPS.paintImageMaskXObject: {
        extracted.statistics.imageOps++;
        if (!args || args.length === 0) break;
        const ctm = gstate.state.ctm;
        const p0 = applyAffine(ctm, [0, 0]);
        const p1 = applyAffine(ctm, [1, 0]);
        const p2 = applyAffine(ctm, [1, 1]);
        const p3 = applyAffine(ctm, [0, 1]);
        const minX = Math.min(p0[0], p1[0], p2[0], p3[0]);
        const maxX = Math.max(p0[0], p1[0], p2[0], p3[0]);
        const minY = Math.min(p0[1], p1[1], p2[1], p3[1]);
        const maxY = Math.max(p0[1], p1[1], p2[1], p3[1]);
        const w = maxX - minX;
        const h = maxY - minY;

        // Retain mask only if dimension >= 72 pt (skip Type 3 font glyphs/icons)
        if (w >= 72.0 || h >= 72.0) {
          let objId;
          if (typeof args[0] === "string" && args[0].trim().length > 0) {
            objId = args[0].trim();
          } else if (
            args[0] &&
            typeof args[0] === "object" &&
            typeof args[0].data === "string" &&
            args[0].data.trim().length > 0
          ) {
            objId = args[0].data.trim();
          }

          extracted.images.push({
            type: "mask",
            objId,
            bounds: { minX, minY, maxX, maxY, width: w, height: h },
            isMask: true,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  return extracted;
}

