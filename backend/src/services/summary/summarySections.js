// FR-08: the four required summary sections, in display order.
export const SUMMARY_SECTIONS = Object.freeze([
  { key: "background", title: "Background" },
  { key: "methodology", title: "Methodology" },
  { key: "results", title: "Results" },
  { key: "limitations", title: "Limitations" },
]);

export const SUMMARY_SCHEMA_VERSION = 1;

// JSON Schema given to Gemini (structured output). Gemini returns only text and
// passage IDs; page numbers and coordinates are always resolved by the backend.
export const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: SUMMARY_SECTIONS.map((s) => s.key) },
          text: { type: "string" },
          supportingPassageIds: { type: "array", items: { type: "string" } },
          insufficientInformation: { type: "boolean" },
        },
        required: ["key", "text", "supportingPassageIds", "insufficientInformation"],
      },
    },
  },
  required: ["sections"],
};
