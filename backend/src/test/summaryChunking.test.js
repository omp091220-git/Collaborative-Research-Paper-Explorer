import test from "node:test";
import assert from "node:assert/strict";
import { chunkPassages } from "../services/summary/chunking.service.js";

test("chunkPassages keeps all original passage IDs and source metadata", () => {
  const passages = Array.from({ length: 12 }, (_, index) => ({
    id: `p1-${index + 1}-hash`,
    pageNumber: 1,
    text: `Passage ${index + 1}. ` + "x".repeat(700),
    boundingBox: { x: 0.1, y: 0.1, width: 0.4, height: 0.02 },
  }));
  const chunks = chunkPassages(passages, 3000);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((p) => p.id), passages.map((p) => p.id));
  assert.ok(chunks.flat().every((p) => p.boundingBox?.x === 0.1 && p.pageNumber === 1));
});

test("chunkPassages splits a very long no-whitespace token within the estimated limit", () => {
  const passage = {
    id: "p1-1-hash",
    pageNumber: 1,
    text: "z".repeat(8000),
    boundingBox: { x: 0.1, y: 0.1, width: 0.4, height: 0.02 },
  };
  const chunks = chunkPassages([passage], 3000);
  const split = chunks.flat();
  assert.ok(split.length > 1);
  assert.ok(split.every((part) => part.text.length < 2000));
  assert.equal(split.map((part) => part.text).join(""), passage.text);
  assert.ok(split.every((part) => part.id.startsWith(`${passage.id}-part`)));
});
