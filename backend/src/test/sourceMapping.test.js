import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSummary, SummaryValidationError } from "../services/summary/sourceMapping.service.js";

const passages = [
  { id: "p1-1-aaaaaaaa", pageNumber: 1, text: "Intro text.", boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 } },
  { id: "p2-1-bbbbbbbb", pageNumber: 2, text: "Method text.", boundingBox: null },
  { id: "p3-1-cccccccc", pageNumber: 3, text: "Result text.", boundingBox: { x: 0.2, y: 0.3, width: 0.4, height: 0.1 } },
];

const section = (key, text, ids, insufficient = false) => ({
  key, text, supportingPassageIds: ids, insufficientInformation: insufficient,
});

describe("resolveSummary", () => {
  it("resolves IDs to backend-extracted pages, text and boxes", () => {
    const { sections, warnings } = resolveSummary(
      JSON.stringify({
        sections: [
          section("background", "B", ["p1-1-aaaaaaaa"]),
          section("methodology", "M", ["p2-1-bbbbbbbb", "p1-1-aaaaaaaa"]),
          section("results", "R", ["p3-1-cccccccc"]),
          section("limitations", "", [], true),
        ],
      }),
      passages
    );
    assert.deepEqual(sections.map((s) => s.key), ["background", "methodology", "results", "limitations"]);
    assert.equal(sections[0].status, "supported");
    assert.deepEqual(sections[0].sources[0], {
      passageId: "p1-1-aaaaaaaa", pageNumber: 1, text: "Intro text.",
      boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 },
    });
    assert.equal(sections[1].sources[0].boundingBox, null); // never fabricated
    assert.deepEqual(sections[1].pageNumbers, [1, 2]);
    assert.equal(sections[3].status, "insufficient_information");
    assert.deepEqual(warnings, []);
  });

  it("ignores coordinates or pages that Gemini supplies itself", () => {
    const raw = {
      sections: [
        { ...section("background", "B", ["p2-1-bbbbbbbb"]), boundingBox: { x: 0.9, y: 0.9, width: 0.1, height: 0.1 }, pageNumber: 99 },
      ],
    };
    const { sections } = resolveSummary(raw, passages);
    assert.equal(sections[0].sources[0].boundingBox, null);
    assert.equal(sections[0].sources[0].pageNumber, 2);
    assert.equal(sections[0].pageNumbers[0], 2);
  });

  it("discards unknown passage IDs and withholds sections left without support", () => {
    const { sections, warnings } = resolveSummary(
      {
        sections: [
          section("background", "B", ["p1-1-aaaaaaaa", "made-up-id"]),
          section("results", "Invented claim", ["nope"]),
        ],
      },
      passages
    );
    assert.equal(sections[0].sources.length, 1);
    assert.equal(sections[2].status, "unsupported");
    assert.equal(sections[2].text, "");
    assert.ok(warnings.some((w) => w.includes("made-up-id")));
    assert.ok(warnings.some((w) => w.includes("withheld")));
    assert.equal(sections[1].status, "insufficient_information"); // methodology missing
  });

  it("de-duplicates IDs, duplicate sections and unknown section keys", () => {
    const { sections, warnings } = resolveSummary(
      {
        sections: [
          section("Background", "B", ["p1-1-aaaaaaaa", "p1-1-aaaaaaaa"]),
          section("background", "other", ["p3-1-cccccccc"]),
          section("conclusion", "x", ["p1-1-aaaaaaaa"]),
        ],
      },
      passages
    );
    assert.equal(sections[0].text, "B");
    assert.equal(sections[0].sources.length, 1);
    assert.equal(warnings.filter((w) => w.includes("duplicate") || w.includes("unknown section")).length, 2);
  });

  it("accepts JSON wrapped in a code fence", () => {
    const raw = "```json\n" + JSON.stringify({ sections: [section("background", "B", ["p1-1-aaaaaaaa"])] }) + "\n```";
    assert.equal(resolveSummary(raw, passages).sections[0].status, "supported");
  });

  it("throws on malformed JSON, wrong shape, or nothing supported", () => {
    assert.throws(() => resolveSummary("not json", passages), SummaryValidationError);
    assert.throws(() => resolveSummary({ foo: 1 }, passages), SummaryValidationError);
    assert.throws(
      () => resolveSummary({ sections: [section("background", "B", ["bad"])] }, passages),
      SummaryValidationError
    );
  });
});
