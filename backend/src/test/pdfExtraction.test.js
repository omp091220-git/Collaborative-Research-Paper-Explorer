import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractPdfPassages, PdfExtractionError } from "../services/summary/pdfExtraction.service.js";
import { buildTestPdf } from "../services/summary/__testSupport__/buildTestPdf.js";

const PAGE_1 = {
  lines: [
    { text: "Background paragraph first line.", x: 72, y: 700 },
    { text: "Background paragraph second line.", x: 72, y: 686 },
    // large vertical gap => new passage
    { text: "Methods paragraph begins here.", x: 72, y: 600 },
  ],
};
const PAGE_2 = { lines: [{ text: "Results appear on page two.", x: 72, y: 400 }] };

describe("extractPdfPassages", () => {
  it("returns passages with page numbers, stable IDs and the file SHA-256", async () => {
    const pdf = buildTestPdf([PAGE_1, PAGE_2]);
    const result = await extractPdfPassages(pdf);

    assert.equal(result.sha256, createHash("sha256").update(pdf).digest("hex"));
    assert.equal(result.pageCount, 2);
    assert.deepEqual(result.pages, [
      { pageNumber: 1, width: 612, height: 792 },
      { pageNumber: 2, width: 612, height: 792 },
    ]);
    assert.equal(result.passages.length, 3);
    assert.deepEqual(result.passages.map((p) => p.pageNumber), [1, 1, 2]);
    assert.equal(result.passages[0].text, "Background paragraph first line. Background paragraph second line.");
    assert.equal(result.passages[1].text, "Methods paragraph begins here.");

    for (const p of result.passages) assert.match(p.id, /^p\d+-\d+-[0-9a-f]{8}$/);
    assert.equal(new Set(result.passages.map((p) => p.id)).size, 3);

    const again = await extractPdfPassages(Buffer.from(pdf));
    assert.deepEqual(again.passages.map((p) => p.id), result.passages.map((p) => p.id));
  });

  it("computes normalized top-left bounding boxes from real text positions", async () => {
    const result = await extractPdfPassages(buildTestPdf([PAGE_1]));
    const [first, second] = result.passages;

    for (const { boundingBox: b } of result.passages) {
      assert.ok(b, "bounding box present");
      assert.ok(b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0);
      assert.ok(b.x + b.width <= 1 && b.y + b.height <= 1);
    }
    // x starts at 72pt of 612pt
    assert.ok(Math.abs(first.boundingBox.x - 72 / 612) < 0.01);
    // first line baseline at y=700 => top edge ~ (792-700-12)/792 from the top
    assert.ok(Math.abs(first.boundingBox.y - (792 - 700 - 12) / 792) < 0.02);
    // two lines tall (14pt spacing + glyph height) vs one line
    assert.ok(first.boundingBox.height > second.boundingBox.height);
    // second passage lies below the first on the page
    assert.ok(second.boundingBox.y > first.boundingBox.y + first.boundingBox.height);
  });

  it("applies page rotation to dimensions and keeps boxes inside the page", async () => {
    const result = await extractPdfPassages(buildTestPdf([{ ...PAGE_1, rotate: 90 }]));
    assert.deepEqual(result.pages[0], { pageNumber: 1, width: 792, height: 612 });
    for (const { boundingBox: b } of result.passages) {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001);
    }
  });

  it("reconstructs spaces between separate positioned text items on one visual line", async () => {
    const result = await extractPdfPassages(buildTestPdf([{
      lines: [{
        y: 700,
        segments: [
          { text: "Adjacent", x: 72 },
          { text: "words", x: 124 },
          { text: "remain", x: 158 },
          { text: "separated.", x: 200 },
        ],
      }],
    }]));
    assert.equal(result.passages.length, 1);
    assert.equal(result.passages[0].text, "Adjacent words remain separated.");
  });

  it("rejects a PDF with no text layer", async () => {
    await assert.rejects(
      extractPdfPassages(buildTestPdf([{ lines: [] }])),
      (e) => e instanceof PdfExtractionError && e.code === "NO_TEXT_LAYER"
    );
  });

  it("rejects non-PDF bytes and missing files", async () => {
    await assert.rejects(
      extractPdfPassages(Buffer.from("definitely not a pdf")),
      (e) => e instanceof PdfExtractionError && e.code === "INVALID_PDF"
    );
    await assert.rejects(
      extractPdfPassages("/nonexistent/path/paper.pdf"),
      (e) => e instanceof PdfExtractionError && e.code === "FILE_NOT_FOUND"
    );
  });

  it("enforces the page limit", async () => {
    await assert.rejects(
      extractPdfPassages(buildTestPdf([PAGE_1, PAGE_2]), { maxPages: 1 }),
      (e) => e.code === "TOO_MANY_PAGES"
    );
  });
  it("does not merge text from separate columns into one source rectangle", async () => {
    const pdf = buildTestPdf([{
      lines: [
        { text: "Left column content.", x: 72, y: 700 },
        { text: "Right column content.", x: 330, y: 700 },
        { text: "Left column continuation.", x: 72, y: 686 },
        { text: "Right column continuation.", x: 330, y: 686 },
      ],
    }]);
    const result = await extractPdfPassages(pdf);
    assert.ok(result.passages.some((p) => p.text.includes("Left column content.")));
    assert.ok(result.passages.some((p) => p.text.includes("Right column content.")));
    assert.ok(result.passages.every((p) => !(p.text.includes("Left column content.") && p.text.includes("Right column content."))));
    for (const passage of result.passages) {
      if (passage.boundingBox) {
        assert.ok(passage.boundingBox.x >= 0 && passage.boundingBox.x <= 1);
        assert.ok(passage.boundingBox.width > 0 && passage.boundingBox.width <= 1);
      }
    }
  });

});
