/**
 * captionDetector.test.js
 *
 * FR-09 Phase 3.2: Comprehensive Test Suite for Caption Detection & Scanning.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  FIGURE_CAPTION_STARTER,
  TABLE_CAPTION_STARTER,
  isLikelyInTextCitation,
  normalizeCaptionWhitespace,
  tryReconstructSplitStarter,
  detectCaptions,
} from "../utils/captionDetector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

const ARXIV_SAMPLE_PATH = path.join(UPLOADS_DIR, "arxiv-2610.30421-1793047803831.pdf");
const NARBI_SAMPLE_PATH = path.join(UPLOADS_DIR, "1792858120105-narbi61ofg8.pdf");

describe("captionDetector — Regex & Punctuation Matching", () => {
  it("matches various figure caption starter patterns", () => {
    const validFigureStarters = [
      "Figure 1:",
      "Fig. 2.",
      "Figure 3.1 —",
      "Figure 4(a):",
      "Fig 5:",
      "Figure 12-B.",
      "  Figure 7: An overview",
    ];

    for (const str of validFigureStarters) {
      const match = FIGURE_CAPTION_STARTER.exec(str);
      assert.ok(match, `Expected '${str}' to match FIGURE_CAPTION_STARTER`);
      assert.ok(match[1], `Expected identifier in '${str}'`);
    }
  });

  it("matches various table caption starter patterns", () => {
    const validTableStarters = [
      "Table 1:",
      "Table 2.1.",
      "Table 3 —",
      "Table 4:",
      "Table 10-A:",
      "  Table 5: Quantitative comparisons",
    ];

    for (const str of validTableStarters) {
      const match = TABLE_CAPTION_STARTER.exec(str);
      assert.ok(match, `Expected '${str}' to match TABLE_CAPTION_STARTER`);
      assert.ok(match[1], `Expected identifier in '${str}'`);
    }
  });

  it("rejects non-caption text from starters", () => {
    const nonCaptions = [
      "Introduction",
      "Related Work",
      "Section 3: Methodology",
      "Algorithm 1:",
      "Not a figure at all",
    ];

    for (const str of nonCaptions) {
      assert.equal(FIGURE_CAPTION_STARTER.test(str), false, `'${str}' should not match FIGURE_CAPTION_STARTER`);
      assert.equal(TABLE_CAPTION_STARTER.test(str), false, `'${str}' should not match TABLE_CAPTION_STARTER`);
    }
  });
});

describe("captionDetector — In-Text Citation Filtering", () => {
  it("classifies inline citations as in-text references", () => {
    const citationExamples = [
      { text: "shows that the accuracy improves", punct: undefined },
      { text: "compares our method with baselines", punct: undefined },
      { text: "illustrates the architecture pipeline", punct: undefined },
      { text: "was evaluated on 5 benchmark datasets", punct: undefined },
      { text: "is presented in Section 4", punct: undefined },
      { text: "and Table 2 show consistent gains", punct: undefined },
    ];

    for (const example of citationExamples) {
      const isCitation = isLikelyInTextCitation(example.text, example.punct, 100, 600);
      assert.equal(isCitation, true, `Expected '${example.text}' to be recognized as citation`);
    }
  });

  it("does not classify captions with explicit colons or em-dashes as citations", () => {
    const validCaptions = [
      { text: "shows comparison of latency", punct: ":" },
      { text: "illustrates architecture", punct: "—" },
      { text: "Overview of data weighting pipeline", punct: ":" },
    ];

    for (const example of validCaptions) {
      const isCitation = isLikelyInTextCitation(example.text, example.punct, 72, 600);
      assert.equal(isCitation, false, `Explicit delimiter '${example.punct}' should not be treated as citation`);
    }
  });

  it("classifies lowercase running text without punctuation as citation", () => {
    const isCitation = isLikelyInTextCitation("provides higher throughput across all seeds", undefined, 100, 600);
    assert.equal(isCitation, true);
  });
});

describe("captionDetector — Text Normalization & Whitespace", () => {
  it("normalizes internal whitespace, newlines, and tabs cleanly", () => {
    const input = "  Figure 1:   Overview   of the \n   system \t architecture.  ";
    const expected = "Figure 1: Overview of the system architecture.";
    assert.equal(normalizeCaptionWhitespace(input), expected);
  });

  it("handles null and empty input safely", () => {
    assert.equal(normalizeCaptionWhitespace(""), "");
    assert.equal(normalizeCaptionWhitespace(null), "");
    assert.equal(normalizeCaptionWhitespace(undefined), "");
  });
});

describe("captionDetector — Synthetic Page & Multi-line Accumulation", () => {
  it("throws on invalid page object", async () => {
    await assert.rejects(async () => {
      await detectCaptions(null);
    }, /Invalid PDF page instance/);
  });

  it("returns empty result when page has no text items", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({ items: [] }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.hasExtractableText, false);
    assert.equal(result.captions.length, 0);
    assert.equal(result.itemCount, 0);
  });

  it("accumulates multi-line captions and ignores in-text citations", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          // Body text with inline citation: "As Figure 1 shows, our method outperforms..."
          {
            str: "As Figure 1 shows, our method outperforms all existing baselines.",
            transform: [10, 0, 0, 10, 72, 700],
            width: 350,
            fontName: "bodyFont",
          },
          // Valid Figure 1 caption spanning two lines:
          // Line 1: "Figure 1: Architecture overview of the proposed"
          {
            str: "Figure 1: Architecture overview of the proposed",
            transform: [9, 0, 0, 9, 72, 400],
            width: 250,
            fontName: "captionFont",
          },
          // Line 1 continuation: " framework."
          {
            str: "framework.",
            transform: [9, 0, 0, 9, 325, 400],
            width: 50,
            fontName: "captionFont",
          },
          // Line 2: "Left: Generator module. Right: Discriminator."
          {
            str: "Left: Generator module. Right: Discriminator.",
            transform: [9, 0, 0, 9, 72, 388],
            width: 220,
            fontName: "captionFont",
          },
          // Next paragraph (large vertical gap -> should stop accumulation)
          {
            str: "In this section, we describe the detailed loss functions.",
            transform: [10, 0, 0, 10, 72, 350],
            width: 300,
            fontName: "bodyFont",
          },
          // Valid Table 1 caption
          {
            str: "Table 1: Benchmark quantitative results.",
            transform: [9, 0, 0, 9, 72, 200],
            width: 200,
            fontName: "captionFont",
          },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.hasExtractableText, true);
    assert.equal(result.captions.length, 2);

    // Figure 1 checks
    const fig = result.captions[0];
    assert.equal(fig.targetType, "figure");
    assert.equal(fig.identifier, "1");
    assert.equal(fig.confidence, 0.95);
    assert.ok(fig.captionText.includes("Architecture overview of the proposed framework."));
    assert.ok(fig.captionText.includes("Left: Generator module."));
    assert.equal(fig.bounds.minX, 72);
    assert.ok(fig.bounds.maxX >= 375);
    assert.equal(fig.bounds.minY, 388);
    assert.equal(fig.bounds.maxY, 409); // 400 + 9

    // Table 1 checks
    const tbl = result.captions[1];
    assert.equal(tbl.targetType, "table");
    assert.equal(tbl.identifier, "1");
    assert.equal(tbl.confidence, 0.95);
    assert.ok(tbl.captionText.includes("Benchmark quantitative results."));
  });
});

describe("captionDetector — Real Sample PDF Regression Tests", () => {
  it("detects Figure 1 caption on Page 6 of arxiv sample", async () => {
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page6 = await doc.getPage(6);
    const result = await detectCaptions(page6);

    assert.equal(result.hasExtractableText, true);
    assert.ok(result.captions.length >= 1);

    const fig1 = result.captions.find(c => c.identifier === "1" && c.targetType === "figure");
    assert.ok(fig1, "Expected to detect Figure 1 caption");
    assert.equal(fig1.targetType, "figure");
    assert.equal(fig1.confidence, 0.95);
    assert.ok(fig1.captionText.startsWith("Figure 1: Dataweighting outperforms"));
    assert.ok(fig1.bounds.width > 400);
  });

  it("detects Table 1, Table 2, and Figure 6 captions on Page 11 of arxiv sample", async () => {
    const doc = await pdfjs.getDocument(ARXIV_SAMPLE_PATH).promise;
    const page11 = await doc.getPage(11);
    const result = await detectCaptions(page11);

    assert.equal(result.hasExtractableText, true);
    assert.equal(result.captions.length, 3);

    const tbl1 = result.captions.find(c => c.identifier === "1" && c.targetType === "table");
    const tbl2 = result.captions.find(c => c.identifier === "2" && c.targetType === "table");
    const fig6 = result.captions.find(c => c.identifier === "6" && c.targetType === "figure");

    assert.ok(tbl1, "Expected Table 1 caption");
    assert.ok(tbl2, "Expected Table 2 caption");
    assert.ok(fig6, "Expected Figure 6 caption");

    assert.ok(tbl1.captionText.startsWith("Table 1: Dataweighting allows"));
    assert.ok(tbl2.captionText.startsWith("Table 2: Re-evaluating the best"));
    assert.ok(fig6.captionText.startsWith("Figure 6: Parametric rank-dataweights"));
  });

  it("handles non-text or cover pages gracefully on narbi sample", async () => {
    const doc = await pdfjs.getDocument(NARBI_SAMPLE_PATH).promise;
    const page1 = await doc.getPage(1);
    const result = await detectCaptions(page1);

    assert.equal(result.hasExtractableText, false);
    assert.equal(result.captions.length, 0);
  });
});

describe("captionDetector — Split-Token Caption Starter Reconstruction (SEC-01)", () => {
  it("reconstructs 'Figure ' + '1:' on the same baseline into a figure caption", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Figure ", transform: [9, 0, 0, 9, 72, 500], width: 35, fontName: "capFont" },
          { str: "1: ", transform: [9, 0, 0, 9, 107, 500], width: 12, fontName: "capFont" },
          { str: "Overview of model pipeline.", transform: [9, 0, 0, 9, 120, 500], width: 150, fontName: "capFont" },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 1);
    const fig = result.captions[0];
    assert.equal(fig.targetType, "figure");
    assert.equal(fig.identifier, "1");
    assert.equal(fig.confidence, 0.95);
    assert.ok(fig.captionText.startsWith("Figure 1: Overview of model pipeline."));
    assert.equal(fig.bounds.minX, 72);
  });

  it("reconstructs 'Fig.' + '2' on the same baseline into a figure caption", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Fig.", transform: [9, 0, 0, 9, 72, 450], width: 20, fontName: "capFont" },
          { str: "2.", transform: [9, 0, 0, 9, 93, 450], width: 10, fontName: "capFont" },
          { str: "Training loss curve.", transform: [9, 0, 0, 9, 105, 450], width: 120, fontName: "capFont" },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 1);
    const fig = result.captions[0];
    assert.equal(fig.targetType, "figure");
    assert.equal(fig.identifier, "2");
    assert.ok(fig.captionText.includes("Training loss curve."));
  });

  it("reconstructs 'Table ' + '3.1' into a table caption", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Table ", transform: [9, 0, 0, 9, 72, 400], width: 30, fontName: "capFont" },
          { str: "3.1:", transform: [9, 0, 0, 9, 103, 400], width: 18, fontName: "capFont" },
          { str: "Ablation results across layers.", transform: [9, 0, 0, 9, 122, 400], width: 180, fontName: "capFont" },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 1);
    const tbl = result.captions[0];
    assert.equal(tbl.targetType, "table");
    assert.equal(tbl.identifier, "3.1");
    assert.equal(tbl.confidence, 0.95);
  });

  it("rejects split tokens on different baselines (vertical difference > 2.5 pt)", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Figure ", transform: [9, 0, 0, 9, 72, 500], width: 35, fontName: "capFont" },
          { str: "1: Next line token", transform: [9, 0, 0, 9, 72, 480], width: 100, fontName: "capFont" }, // deltaY = 20
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 0);
  });

  it("rejects split tokens separated by a large horizontal gap", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Figure ", transform: [9, 0, 0, 9, 72, 500], width: 35, fontName: "capFont" },
          // Gap from 107 to 200 = 93 pt > maxGap (20 pt)
          { str: "1: Far away", transform: [9, 0, 0, 9, 200, 500], width: 60, fontName: "capFont" },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 0);
  });

  it("rejects split tokens from neighboring columns", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Figure ", transform: [9, 0, 0, 9, 72, 500], width: 35, fontName: "capFont" }, // Col 1
          { str: "1: Column two header", transform: [9, 0, 0, 9, 360, 500], width: 120, fontName: "capFont" }, // Col 2
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 0);
  });

  it("rejects split token when followed by in-text citation verb (e.g. 'Figure ' + '1 shows')", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          { str: "Figure ", transform: [9, 0, 0, 9, 72, 500], width: 35, fontName: "bodyFont" },
          { str: "1 shows that TRAK is less accurate on STEM.", transform: [9, 0, 0, 9, 108, 500], width: 250, fontName: "bodyFont" },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 0);
  });

  it("accumulates multi-line body text following a reconstructed split starter", async () => {
    const mockPage = {
      view: [0, 0, 600, 800],
      getTextContent: async () => ({
        items: [
          // Split starter tokens
          { str: "Figure ", transform: [9, 0, 0, 9, 72, 500], width: 35, fontName: "capFont" },
          { str: "4: ", transform: [9, 0, 0, 9, 107, 500], width: 15, fontName: "capFont" },
          { str: "First line of long description.", transform: [9, 0, 0, 9, 122, 500], width: 180, fontName: "capFont" },
          // Line 2
          { str: "Second line continues description.", transform: [9, 0, 0, 9, 72, 488], width: 210, fontName: "capFont" },
          // Line 3
          { str: "Third line concludes with error bars.", transform: [9, 0, 0, 9, 72, 476], width: 230, fontName: "capFont" },
        ],
      }),
    };

    const result = await detectCaptions(mockPage);
    assert.equal(result.captions.length, 1);
    const fig = result.captions[0];
    assert.equal(fig.identifier, "4");
    assert.ok(fig.captionText.includes("First line of long description."));
    assert.ok(fig.captionText.includes("Second line continues description."));
    assert.ok(fig.captionText.includes("Third line concludes with error bars."));
    assert.equal(fig.bounds.minX, 72);
    assert.equal(fig.bounds.minY, 476);
  });
});

