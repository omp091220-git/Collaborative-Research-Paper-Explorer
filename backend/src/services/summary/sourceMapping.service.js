// FR-08: validate Gemini's structured output and resolve passage IDs against the
// passages the backend extracted. Gemini's output is untrusted: only text and IDs
// are taken from it. Page numbers, passage text and bounding boxes always come
// from the extraction result, so coordinates can never be invented.

import { SUMMARY_SECTIONS } from "./summarySections.js";

export class SummaryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SummaryValidationError";
    this.code = "INVALID_SUMMARY";
  }
}

/**
 * @typedef {Object} ResolvedSource
 * @property {string} passageId
 * @property {number} pageNumber
 * @property {string} text
 * @property {{x:number,y:number,width:number,height:number}|null} boundingBox
 *
 * @typedef {Object} SummarySection
 * @property {"background"|"methodology"|"results"|"limitations"} key
 * @property {string} title
 * @property {string} text   empty unless status is "supported"
 * @property {"supported"|"insufficient_information"|"unsupported"} status
 * @property {ResolvedSource[]} sources
 * @property {number[]} pageNumbers
 */

function parseRaw(raw) {
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new SummaryValidationError("Gemini response was not valid JSON.");
    }
  }
  return raw;
}

/**
 * @param {unknown} raw - JSON string or object returned by Gemini
 * @param {Array<{id:string,pageNumber:number,text:string,boundingBox:object|null}>} passages
 * @returns {{sections: SummarySection[], warnings: string[]}}
 * @throws {SummaryValidationError} if the structure is unusable or no section is supported
 */
export function resolveSummary(raw, passages, { allowNoSupported = false } = {}) {
  const parsed = parseRaw(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
    throw new SummaryValidationError("Gemini response is missing a sections array.");
  }

  const byId = new Map(passages.map((p) => [p.id, p]));
  const warnings = [];
  const seen = new Map();

  for (const entry of parsed.sections) {
    const key = typeof entry?.key === "string" ? entry.key.trim().toLowerCase() : "";
    if (!SUMMARY_SECTIONS.some((s) => s.key === key)) {
      warnings.push(`Ignored unknown section "${String(entry?.key)}".`);
    } else if (seen.has(key)) {
      warnings.push(`Ignored duplicate section "${key}".`);
    } else {
      seen.set(key, entry);
    }
  }

  const sections = SUMMARY_SECTIONS.map(({ key, title }) => {
    const entry = seen.get(key);
    const base = { key, title, text: "", sources: [], pageNumbers: [] };

    if (!entry) {
      warnings.push(`Section "${key}" was missing from the response.`);
      return { ...base, status: "insufficient_information" };
    }

    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    const requestedIds = Array.isArray(entry.supportingPassageIds)
      ? [...new Set(entry.supportingPassageIds.filter((id) => typeof id === "string"))]
      : [];

    const sources = [];
    for (const id of requestedIds) {
      const passage = byId.get(id);
      if (!passage) {
        warnings.push(`Section "${key}" cited unknown passage "${id}"; it was discarded.`);
        continue;
      }
      sources.push({
        passageId: passage.id,
        pageNumber: passage.pageNumber,
        text: passage.text,
        boundingBox: passage.boundingBox ? { ...passage.boundingBox } : null,
      });
    }

    if (entry.insufficientInformation === true || !text) {
      return { ...base, status: "insufficient_information" };
    }

    if (sources.length === 0) {
      // A claim with no verifiable source is withheld rather than shown.
      warnings.push(`Section "${key}" had no valid supporting passages; its text was withheld.`);
      return { ...base, status: "unsupported" };
    }

    const pageNumbers = [...new Set(sources.map((s) => s.pageNumber))].sort((a, b) => a - b);
    return { key, title, text, status: "supported", sources, pageNumbers };
  });

  if (!allowNoSupported && !sections.some((s) => s.status === "supported")) {
    throw new SummaryValidationError("Gemini response contained no section supported by source passages.");
  }

  return { sections, warnings };
}
