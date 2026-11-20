/**
 * figureTableRegionDetector.test.js
 *
 * FR-09 Phase 3.2: Comprehensive Test Suite for Region Detection & Association.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectCaptions } from "../utils/captionDetector.js";

import {
  calculateBoxIoU,
  unionBoxes,
  clampToPageView,
  detectRegions,
} from "../utils/figureTableRegionDetector.js";
import { createFr09FixturePdf } from "./fr09PdfFixture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

const ARXIV_SAMPLE_PATH = path.join(UPLOADS_DIR, "arxiv-2610.30421-1793047803831.pdf");
const NARBI_SAMPLE_PATH = path.join(UPLOADS_DIR, "1792858120105-narbi61ofg8.pdf");
const FONT_RENDER_SAMPLE_PATH = path.join(UPLOADS_DIR, "arxiv-2501.03505-1794913186478.pdf");
const LAYOUT_DIVERSITY_SAMPLE_PATH = path.join(UPLOADS_DIR, "seed-1793217487929-389n4mpvvtq.pdf");

describe("figureTableRegionDetector — Geometry & Bounding Box Utilities", () => {
  it("calculates exact IoU for identical, disjoint, and overlapping boxes", () => {
    const boxA = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const boxB = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    assert.equal(calculateBoxIoU(boxA, boxB), 1.0);

    const boxDisjoint = { minX: 200, minY: 200, maxX: 300, maxY: 300 };
    assert.equal(calculateBoxIoU(boxA, boxDisjoint), 0.0);

    // Box C overlapping half of box A along x
    // Box A: [0, 0, 100, 100] (area 10000)
    // Box C: [50, 0, 150, 100] (area 10000)
    // Intersection: [50, 0, 100, 100] (area 5000)
    // Union: 10000 + 10000 - 5000 = 15000
    // IoU: 5000 / 15000 = 1/3 ~ 0.333333
    const boxC = { minX: 50, minY: 0, maxX: 150, maxY: 100 };
    const iou = calculateBoxIoU(boxA, boxC);
    assert.ok(Math.abs(iou - (1 / 3)) < 1e-6);
  });

  it("handles degenerate zero and negative dimension boxes safely in IoU", () => {
    const degenerate1 = { minX: 50, minY: 50, maxX: 50, maxY: 50 };
    const normal = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    assert.equal(calculateBoxIoU(degenerate1, normal), 0.0);

    const inverted = { minX: 100, minY: 100, maxX: 0, maxY: 0 };
    assert.equal(calculateBoxIoU(inverted, normal), 0.0);
  });

  it("unions multiple bounding boxes correctly", () => {
    const boxes = [
      { minX: 10, minY: 20, maxX: 50, maxY: 60 },
      { minX: 5, minY: 30, maxX: 70, maxY: 40 },
      { minX: 15, minY: 10, maxX: 60, maxY: 80 },
    ];

    const union = unionBoxes(boxes);
    assert.equal(union.minX, 5);
    assert.equal(union.minY, 10);
    assert.equal(union.maxX, 70);
    assert.equal(union.maxY, 80);
    assert.equal(union.width, 65);
    assert.equal(union.height, 70);

    const emptyUnion = unionBoxes([]);
    assert.equal(emptyUnion.width, 0);
    assert.equal(emptyUnion.height, 0);
  });

  it("clamps bounding boxes to page boundaries", () => {
    const pageView = [0, 0, 600, 800];
    const outBox = { minX: -20, minY: -30, maxX: 650, maxY: 850 };
    const clamped = clampToPageView(outBox, pageView);

    assert.equal(clamped.minX, 0);
    assert.equal(clamped.minY, 0);
    assert.equal(clamped.maxX, 600);
    assert.equal(clamped.maxY, 800);
    assert.equal(clamped.width, 600);
    assert.equal(clamped.height, 800);
  });
});

describe("figureTableRegionDetector — Mock Page Synthetic Detection", () => {
  it("associates table caption with horizontal rules above and below", async () => {
    // Synthetic page:
    // Page height 800, width 600
    // Table 1 caption at y=500
    // Rule 1 (top of table) at y=600
    // Rule 2 (header line) at y=580
    // Rule 3 (bottom line) at y=520
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.setLineWidth,
          pdfjs.OPS.constructPath,
          pdfjs.OPS.stroke,
          pdfjs.OPS.constructPath,
          pdfjs.OPS.stroke,
          pdfjs.OPS.constructPath,
          pdfjs.OPS.stroke,
        ],
        argsArray: [
          [1.0],
          [[pdfjs.OPS.moveTo, pdfjs.OPS.lineTo], [100, 600, 300, 600]],
          [],
          [[pdfjs.OPS.moveTo, pdfjs.OPS.lineTo], [100, 580, 300, 580]],
          [],
          [[pdfjs.OPS.moveTo, pdfjs.OPS.lineTo], [100, 520, 300, 520]],
          [],
        ],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: "Table 1: Synthetic test table results.",
            transform: [9, 0, 0, 9, 100, 500],
            width: 200,
            fontName: "testFont",
          },
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    assert.equal(regions.length, 1);

    const tbl = regions[0];
    assert.equal(tbl.assetType, "table");
    assert.equal(tbl.caption.identifier, "1");
    assert.equal(tbl.detectionMethod, "caption_table_rules");
    assert.equal(tbl.heuristicConfidence, 1.0);
    assert.equal(tbl.metadata.matchedRules, 3);
    assert.ok(tbl.bounds.minY >= 519, "Table crop should begin at its visual rules, not its caption");
    assert.ok(tbl.bounds.maxY <= 601);
    assert.match(tbl.caption.fullText, /Synthetic test table results/);
    assert.equal(tbl.readingOrderIndex, 1);
  });

  it("extracts standalone embedded raster when no caption exists and suppresses cover", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject, // Standalone chart: width 300, height 200 at (100, 400)
          pdfjs.OPS.restore,
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject, // Full page cover: width 600, height 800 at (0, 0)
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [300, 0, 0, 200, 100, 400],
          ["img_chart"],
          [],
          [],
          [600, 0, 0, 800, 0, 0],
          ["img_cover"],
          [],
        ],
      }),
      getTextContent: async () => ({ items: [] }),
    };

    const regions = await detectRegions(mockPage);
    // Cover image should be suppressed; only standalone chart should be detected
    assert.equal(regions.length, 1);
    const reg = regions[0];
    assert.equal(reg.assetType, "figure");
    assert.equal(reg.detectionMethod, "embedded_raster");
    assert.equal(reg.metadata.objId, "img_chart");
    assert.equal(reg.metadata.isStandaloneRaster, true);
    assert.equal(reg.caption, null);
    assert.equal(reg.bounds.minX, 100);
    assert.equal(reg.bounds.minY, 400);
    assert.equal(reg.bounds.width, 300);
    assert.equal(reg.bounds.height, 200);
  });

  it("keeps a multi-path vector figure separate from nearby body text and caption bounds", async () => {
    const fnArray = [];
    const argsArray = [];
    const rectangles = [
      [100, 570, 80, 70],
      [184, 570, 60, 70], // Connected component of the same diagram.
      [100, 430, 300, 12],
      [100, 412, 300, 12], // Nearby body-text-like vector rules below the caption.
    ];
    for (const rectangle of rectangles) {
      fnArray.push(pdfjs.OPS.constructPath, pdfjs.OPS.fill);
      argsArray.push([[pdfjs.OPS.rectangle], rectangle], []);
    }

    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({ fnArray, argsArray }),
      getTextContent: async () => ({
        items: [{
          str: "Figure 10: Multi-path vector diagram.",
          transform: [9, 0, 0, 9, 100, 500],
          width: 220,
          fontName: "captionFont",
        }],
      }),
    };

    const regions = await detectRegions(mockPage);
    const figure = regions.find((region) => region.caption?.identifier === "10");
    assert.ok(figure, "Expected a caption-associated vector figure");
    assert.equal(figure.bounds.minX, 100);
    assert.equal(figure.bounds.maxX, 244);
    assert.equal(figure.bounds.minY, 570);
    assert.equal(figure.bounds.maxY, 640);
    assert.match(figure.caption.fullText, /Multi-path vector diagram/);
    assert.equal(figure.metadata.matchedClusters, 2);
  });

  it("uses the raster figure bounds while retaining its caption separately", async () => {
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save, pdfjs.OPS.transform, pdfjs.OPS.paintImageXObject, pdfjs.OPS.restore,
          pdfjs.OPS.constructPath, pdfjs.OPS.fill,
          pdfjs.OPS.constructPath, pdfjs.OPS.fill,
        ],
        argsArray: [
          [], [280, 0, 0, 160, 120, 590], ["raster_figure"], [],
          [[pdfjs.OPS.rectangle], [120, 430, 300, 12]], [],
          [[pdfjs.OPS.rectangle], [120, 412, 300, 12]], [],
        ],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: "Figure 11: Raster system diagram.",
            transform: [9, 0, 0, 9, 120, 500],
            width: 220,
            fontName: "captionFont",
          },
          { str: "17", transform: [9, 0, 0, 9, 380, 770], width: 10, fontName: "captionFont" },
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    const figure = regions.find((region) => region.caption?.identifier === "11");
    assert.ok(figure);
    assert.deepEqual(
      [figure.bounds.minX, figure.bounds.minY, figure.bounds.maxX, figure.bounds.maxY],
      [120, 590, 400, 750]
    );
    assert.equal(figure.caption.fullText, "Figure 11: Raster system diagram.");
    assert.equal(figure.metadata.matchedImages, 1);
    assert.equal(figure.bounds.maxY, 750, "A page folio near the image must not expand the asset crop");
  });

  it("includes nearby chart axes, tick labels, a legend and rotated axis title without prose or a neighboring panel", async () => {
    const fnArray = [];
    const argsArray = [];
    const rect = (x, y, width, height) => {
      fnArray.push(pdfjs.OPS.constructPath, pdfjs.OPS.fill);
      argsArray.push([[pdfjs.OPS.rectangle], [x, y, width, height]], []);
    };
    // Plot and separated multi-part vector marks in the left column.
    rect(240, 350, 160, 120);
    rect(255, 350, 12, 54);
    rect(285, 350, 12, 75);
    rect(315, 350, 12, 92);
    // A distinct right-column figure must not be joined to this chart.
    rect(470, 360, 70, 60);

    const textItem = (str, x, y, width, size = 9, transform = [size, 0, 0, size, x, y]) => ({
      str, transform, width, height: size, fontName: "testFont",
    });
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({ fnArray, argsArray }),
      getTextContent: async () => ({
        styles: { testFont: { fontFamily: "serif", ascent: 0.8, descent: -0.2 } },
        items: [
          textItem("Figure 1: Left-column chart.", 240, 250, 140),
          textItem("Figure 2: Separate diagram.", 470, 250, 125),
          textItem("Detection probabilities", 228, 390, 75, 12, [0, 12, -12, 0, 228, 390]),
          textItem("0", 220, 350, 5),
          textItem("1/2", 218, 395, 12),
          textItem("1", 220, 465, 5),
          textItem("A", 255, 330, 6),
          textItem("B", 315, 330, 6),
          textItem("Control", 340, 475, 36),
          textItem("The measurements shown here were collected in three separate experimental runs.", 220, 315, 250),
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    const chart = regions.find((region) => region.caption?.identifier === "1");
    const otherFigure = regions.find((region) => region.caption?.identifier === "2");
    assert.ok(chart);
    assert.ok(otherFigure);
    assert.ok(chart.bounds.minX < 240, "Expected the y-axis labels and title in the chart crop");
    assert.ok(chart.bounds.minY < 350, "Expected the x-axis labels in the chart crop");
    assert.ok(chart.bounds.maxX >= 376, "Expected the chart legend in the crop");
    assert.ok(chart.bounds.maxX < 450, "The right-column figure must stay separate");
    assert.ok(chart.bounds.minY > 300, "The nearby body paragraph must stay outside the crop");
    assert.ok(otherFigure.bounds.minX >= 470);
    assert.match(chart.caption.fullText, /Left-column chart/);
  });

  it("joins horizontally separated panels under one spanning caption without absorbing another visual", async () => {
    const fnArray = [];
    const argsArray = [];
    for (const [x, y, width, height] of [
      [100, 600, 120, 80],
      [255, 600, 120, 80], // A second panel separated by a normal panel gutter.
      [470, 610, 70, 60], // Unrelated visual, outside the shared caption's panel band.
    ]) {
      fnArray.push(pdfjs.OPS.constructPath, pdfjs.OPS.fill);
      argsArray.push([[pdfjs.OPS.rectangle], [x, y, width, height]], []);
    }

    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({ fnArray, argsArray }),
      getTextContent: async () => ({
        items: [{
          str: "Figure 12: Comparison of two model panels.",
          transform: [9, 0, 0, 9, 80, 500],
          width: 440,
          fontName: "captionFont",
        }],
      }),
    };

    const regions = await detectRegions(mockPage);
    const figure = regions.find((region) => region.caption?.identifier === "12");
    assert.ok(figure);
    assert.equal(figure.bounds.minX, 100);
    assert.equal(figure.bounds.maxX, 375);
    assert.equal(figure.bounds.minY, 600);
    assert.equal(figure.bounds.maxY, 680);
    assert.equal(figure.metadata.matchedClusters, 2);
  });
});

describe("figureTableRegionDetector — Self-contained PDF fixture", () => {
  it("detects two-column vector figures, a ruled table, and an embedded raster chart without merging captions", async () => {
    const fixture = createFr09FixturePdf();
    let doc;
    try {
      doc = await pdfjs.getDocument(fixture.filePath).promise;
      const [page1, page2, page3, cover] = await Promise.all([
        doc.getPage(1), doc.getPage(2), doc.getPage(3), doc.getPage(4),
      ]);
      const [twoColumnRegions, tableRegions, rasterRegions, coverRegions] = await Promise.all([
        detectRegions(page1), detectRegions(page2), detectRegions(page3), detectRegions(cover),
      ]);

      assert.equal(twoColumnRegions.length, 2);
      assert.deepEqual(new Set(twoColumnRegions.map((region) => region.caption.identifier)), new Set(["1", "2"]));
      assert.ok(twoColumnRegions.every((region) => region.assetType === "figure"));
      assert.ok(twoColumnRegions.every((region) => !region.caption.fullText.includes("Nearby prose")));
      assert.deepEqual(twoColumnRegions.map((region) => region.readingOrderIndex).sort(), [1, 2]);

      assert.equal(tableRegions.length, 1);
      assert.equal(tableRegions[0].assetType, "table");
      assert.equal(tableRegions[0].metadata.matchedRules, 3);
      assert.match(tableRegions[0].caption.fullText, /Synthetic measurements/);

      assert.equal(rasterRegions.length, 1);
      assert.equal(rasterRegions[0].detectionMethod, "caption_raster_association");
      assert.equal(rasterRegions[0].metadata.matchedImages, 1);
      assert.equal(coverRegions.length, 0, "A full-page cover image is not an extracted figure");
    } finally {
      if (doc) await doc.destroy();
      fixture.cleanup();
    }
  });
});

describe("figureTableRegionDetector — Real Sample PDF Regression Tests", () => {
  it("keeps nearby body text outside the figure crop on a multi-column PDF", async (t) => {
    if (!fs.existsSync(LAYOUT_DIVERSITY_SAMPLE_PATH)) {
      t.skip("Optional layout-diversity sample PDF is unavailable.");
      return;
    }

    const doc = await pdfjs.getDocument(LAYOUT_DIVERSITY_SAMPLE_PATH).promise;
    try {
      const page = await doc.getPage(11);
      const [regions, captions] = await Promise.all([detectRegions(page), detectCaptions(page)]);
      const figure = regions.find((region) => region.caption?.identifier === "4");
      const caption = captions.captions.find((candidate) => candidate.identifier === "4");
      const adjacentParagraph = captions.textItems.find((item) => item.text.startsWith("the 1-D transport problem"));
      assert.ok(figure);
      assert.ok(caption);
      assert.ok(adjacentParagraph);
      assert.ok(figure.bounds.minY > caption.bounds.maxY);
      assert.ok(
        figure.bounds.maxY + 8 < adjacentParagraph.bounds.minY,
        "The default crop padding should not reach the prose line above the figure"
      );
    } finally {
      await doc.destroy();
    }
  });

  it("keeps Figure 7 and Figure 8 crop bounds separate from captions on the supplied sample", async (t) => {
    if (!fs.existsSync(FONT_RENDER_SAMPLE_PATH)) {
      t.skip("Local font-render sample PDF is unavailable.");
      return;
    }

    const doc = await pdfjs.getDocument(FONT_RENDER_SAMPLE_PATH).promise;
    try {
      const page = await doc.getPage(13);
      const [regions, captions] = await Promise.all([detectRegions(page), detectCaptions(page)]);
      for (const identifier of ["7", "8"]) {
        const figure = regions.find((region) => region.caption?.identifier === identifier);
        const caption = captions.captions.find((candidate) => candidate.identifier === identifier);
        assert.ok(figure, `Expected Figure ${identifier} region`);
        assert.ok(caption, `Expected Figure ${identifier} caption metadata`);
        assert.ok(
          figure.bounds.minY > caption.bounds.maxY,
          `Figure ${identifier} visual bounds should exclude its caption bounds`
        );
        assert.ok(figure.caption.fullText.includes(`FIG. ${identifier}`));
        const folio = captions.textItems.find((item) => item.text.trim() === String(page.pageNumber) &&
          item.bounds.minY > page.view[3] * 0.85);
        if (folio && identifier === "7") {
          assert.ok(figure.bounds.maxY < folio.bounds.minY, "Page number must not enter the figure crop");
        }
        if (identifier === "8") {
          const yAxisTitle = captions.textItems.find((item) => item.text === "Detection probabilities");
          assert.ok(yAxisTitle);
          assert.ok(figure.bounds.minX <= yAxisTitle.bounds.minX, "Rotated y-axis title must be included");
        }
      }
    } finally {
      await doc.destroy();
    }
  });

  it("optionally detects Figure 1 on Page 6 of the local arxiv sample", async (t) => {
    if (!fs.existsSync(ARXIV_SAMPLE_PATH)) {
      t.skip("Optional local arXiv PDF is not checked into the repository; generated vector regressions run above.");
      return;
    }
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page6 = await doc.getPage(6);
    const regions = await detectRegions(page6);

    assert.ok(regions.length >= 1, "Expected at least 1 detected region on Page 6");
    const fig1 = regions.find(r => r.caption && r.caption.identifier === "1");

    assert.ok(fig1, "Expected Figure 1 region");
    assert.equal(fig1.assetType, "figure");
    assert.equal(fig1.detectionMethod, "caption_vector_association");
    assert.equal(fig1.pageNumber, 6);
    assert.ok(fig1.bounds.width > 400, "Figure 1 should span wide region");
    assert.ok(fig1.bounds.height > 150);
    assert.equal(fig1.readingOrderIndex, 1);
  });

  it("optionally detects Table 1, Table 2, and Figure 6 on Page 11 of arxiv sample", async (t) => {
    if (!fs.existsSync(ARXIV_SAMPLE_PATH)) {
      t.skip("Optional local arXiv PDF is not checked into the repository; generated table and reading-order regressions run above.");
      return;
    }
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page11 = await doc.getPage(11);
    const regions = await detectRegions(page11);

    assert.equal(regions.length, 3, "Expected 3 regions on Page 11");

    // Reading order checks (top of page has highest maxY)
    assert.equal(regions[0].readingOrderIndex, 1);
    assert.equal(regions[1].readingOrderIndex, 2);
    assert.equal(regions[2].readingOrderIndex, 3);

    const tbl1 = regions.find(r => r.caption && r.caption.identifier === "1");
    const tbl2 = regions.find(r => r.caption && r.caption.identifier === "2");
    const fig6 = regions.find(r => r.caption && r.caption.identifier === "6");

    assert.ok(tbl1, "Expected Table 1");
    assert.ok(tbl2, "Expected Table 2");
    assert.ok(fig6, "Expected Figure 6");

    assert.equal(tbl1.assetType, "table");
    assert.equal(tbl2.assetType, "table");
    assert.equal(fig6.assetType, "figure");
  });

  it("optionally checks cover suppression and standalone raster on the local narbi sample", async (t) => {
    if (!fs.existsSync(NARBI_SAMPLE_PATH)) {
      t.skip("Optional local Narbi PDF is not checked into the repository; generated cover and raster cases run above.");
      return;
    }
    const doc = await pdfjs.getDocument(NARBI_SAMPLE_PATH).promise;
    
    // Page 1: Cover image should produce 0 regions
    const page1 = await doc.getPage(1);
    const regionsP1 = await detectRegions(page1);
    assert.equal(regionsP1.length, 0, "Page 1 cover should be suppressed");

    // Page 11: Standalone raster figure
    const page11 = await doc.getPage(11);
    const regionsP11 = await detectRegions(page11);
    assert.equal(regionsP11.length, 1, "Page 11 should have 1 standalone figure");

    const rasterFig = regionsP11[0];
    assert.equal(rasterFig.assetType, "figure");
    assert.equal(rasterFig.detectionMethod, "embedded_raster");
    assert.equal(rasterFig.metadata.isStandaloneRaster, true);
    assert.ok(rasterFig.bounds.width >= 400);
    assert.ok(rasterFig.bounds.height >= 200);
  });
});

describe("figureTableRegionDetector — Bidirectional Figure Association (SEC-02)", () => {
  it("associates figure when caption is positioned ABOVE the graphic (top caption)", async () => {
    // Caption at y=600, Graphic at y=400 (height 150 -> y=400..550)
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [300, 0, 0, 150, 100, 400], // Image at x=100..400, y=400..550
          ["img_top_caption_fig"],
          [],
        ],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: "Figure 1: Diagram showing module interaction pipeline.",
            transform: [9, 0, 0, 9, 100, 600],
            width: 250,
            fontName: "f1",
          },
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    assert.equal(regions.length, 1);
    const fig = regions[0];
    assert.equal(fig.assetType, "figure");
    assert.equal(fig.caption.identifier, "1");
    assert.equal(fig.caption.position, "above");
    assert.equal(fig.detectionMethod, "caption_raster_association");
    assert.equal(fig.metadata.matchedImages, 1);
    assert.equal(fig.bounds.minX, 100);
    assert.equal(fig.bounds.minY, 400);
    assert.equal(fig.bounds.maxY, 550, "Visual crop must exclude the caption above the figure");
    assert.match(fig.caption.fullText, /module interaction pipeline/);
  });

  it("selects the closest candidate when candidates exist on both sides", async () => {
    // Caption at y=500
    // Candidate A (above): at y=520..620 (dist = 11 pt)
    // Candidate B (below): at y=300..400 (dist = 100 pt)
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.restore,
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [200, 0, 0, 100, 100, 520], // Candidate A (above): y=520..620
          ["img_above"],
          [],
          [],
          [200, 0, 0, 100, 100, 300], // Candidate B (below): y=300..400
          ["img_below"],
          [],
        ],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: "Figure 2: Performance comparison chart.",
            transform: [9, 0, 0, 9, 100, 500],
            width: 200,
            fontName: "f1",
          },
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    // Figure 2 should associate with Candidate A (above) because it's closer
    const fig2 = regions.find(r => r.caption && r.caption.identifier === "2");
    assert.ok(fig2);
    assert.equal(fig2.caption.position, "below"); // Graphic is above, caption is below
    assert.equal(fig2.bounds.minY, 520, "Visual crop must exclude caption bounds");
    assert.ok(fig2.bounds.maxY >= 620);
    // Candidate B was not paired, falls back to standalone raster
    const standalone = regions.find(r => r.detectionMethod === "embedded_raster");
    assert.ok(standalone);
    assert.equal(standalone.metadata.objId, "img_below");
  });

  it("rejects candidate located in a different column", async () => {
    // Page width 600: Col 1 is x <= 325, Col 2 is x >= 275
    // Caption in Col 1: x=72..250, y=500
    // Candidate image in Col 2: x=350..550, y=550 (above)
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 800],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [200, 0, 0, 150, 350, 550], // Col 2 image
          ["img_col2"],
          [],
        ],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: "Figure 3: Col 1 figure caption.",
            transform: [9, 0, 0, 9, 72, 500], // Col 1 caption
            width: 150,
            fontName: "f1",
          },
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    // Figure 3 caption should NOT claim Col 2 image
    const fig3 = regions.find(r => r.caption && r.caption.identifier === "3");
    // Caption may be filtered if standalone text < 50x30, but Col 2 image is standalone
    const col2Raster = regions.find(r => r.metadata && r.metadata.objId === "img_col2");
    assert.ok(col2Raster, "Col 2 image should remain standalone raster");
    assert.equal(col2Raster.detectionMethod, "embedded_raster");
    if (fig3) {
      assert.equal(fig3.metadata.matchedImages, 0);
    }
  });

  it("rejects candidate when separated by an intervening caption in the same column", async () => {
    // In Col 1:
    // Image at y=700..800
    // Caption 2 at y=600
    // Caption 1 at y=400
    // Caption 1 should NOT skip Caption 2 to claim the image at y=700
    const mockPage = {
      pageNumber: 1,
      view: [0, 0, 600, 900],
      getOperatorList: async () => ({
        fnArray: [
          pdfjs.OPS.save,
          pdfjs.OPS.transform,
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.restore,
        ],
        argsArray: [
          [],
          [200, 0, 0, 100, 72, 700], // Image at y=700..800
          ["img_top"],
          [],
        ],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: "Figure 2: Intermediate caption.",
            transform: [9, 0, 0, 9, 72, 600],
            width: 150,
            fontName: "f1",
          },
          {
            str: "Figure 1: Bottom caption.",
            transform: [9, 0, 0, 9, 72, 400],
            width: 150,
            fontName: "f1",
          },
        ],
      }),
    };

    const regions = await detectRegions(mockPage);
    const fig2 = regions.find(r => r.caption && r.caption.identifier === "2");
    const fig1 = regions.find(r => r.caption && r.caption.identifier === "1");

    assert.ok(fig2, "Expected Figure 2 region");
    // Figure 2 is directly below the image, so Figure 2 should claim the image
    assert.equal(fig2.metadata.matchedImages, 1);
    if (fig1) {
      // Figure 1 must NOT have matched the image across Figure 2
      assert.equal(fig1.metadata.matchedImages, 0);
    }
  });
});

