import test from "node:test";
import assert from "node:assert/strict";
import { buildSummaryText, buildKeyFindings, SUMMARY_TYPE } from "../services/summary/summaryPersistence.service.js";
import { isUuid, resolvePaperFilePath } from "../services/summary/summaryJob.service.js";

const sections = [
  { key: "background", title: "Background", text: "Why the problem matters.", status: "supported", sources: [] },
  { key: "methodology", title: "Methodology", text: "Insufficient.", status: "insufficient_information", sources: [] },
  { key: "results", title: "Results", text: "Measured improvement.", status: "supported", sources: [] },
  { key: "limitations", title: "Limitations", text: "", status: "unsupported", sources: [] },
];

test("summary persistence formats required sections without losing missing-evidence notices", () => {
  const text = buildSummaryText(sections);
  assert.match(text, /Background\nWhy the problem matters\./);
  assert.match(text, /Methodology\nInsufficient information/);
  assert.match(text, /Results\nMeasured improvement\./);
  assert.match(text, /Limitations\nInsufficient information/);
  assert.deepEqual(buildKeyFindings(sections), [
    "Background: Why the problem matters.",
    "Results: Measured improvement.",
  ]);
  assert.equal(SUMMARY_TYPE, "comprehensive");
});

test("UUID validation accepts standard IDs and rejects path-like values", () => {
  assert.equal(isUuid("11111111-2222-4333-8444-555555555555"), true);
  assert.equal(isUuid("../../etc/passwd"), false);
  assert.equal(isUuid("not-a-uuid"), false);
});

test("stored paper path resolver blocks traversal outside project root", () => {
  assert.equal(resolvePaperFilePath("uploads/paper.pdf", "/workspace"), "/workspace/uploads/paper.pdf");
  assert.throws(() => resolvePaperFilePath("../outside.pdf", "/workspace"), /outside the project uploads directory/);
  assert.throws(() => resolvePaperFilePath("/etc/passwd", "/workspace"), /outside the project uploads directory/);
});
