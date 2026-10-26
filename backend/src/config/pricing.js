/**
 * GenAI Model Pricing Configuration & Cost Estimator
 * Rates are in USD per 1,000,000 tokens (Standard pricing).
 */

export const MODEL_PRICING = Object.freeze({
  // Google Gemini models
  "gemini-1.5-pro": {
    provider: "google",
    displayName: "Gemini 1.5 Pro",
    inputCostPerMillion: 3.50,
    outputCostPerMillion: 10.50,
  },
  "gemini-1.5-flash": {
    provider: "google",
    displayName: "Gemini 1.5 Flash",
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
  },
  "gemini-2.0-flash": {
    provider: "google",
    displayName: "Gemini 2.0 Flash",
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
  },
  // OpenAI models
  "gpt-4o": {
    provider: "openai",
    displayName: "GPT-4o",
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10.00,
  },
  "gpt-4o-mini": {
    provider: "openai",
    displayName: "GPT-4o mini",
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
  },
  // Anthropic Claude models
  "claude-3-5-sonnet": {
    provider: "anthropic",
    displayName: "Claude 3.5 Sonnet",
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
  },
  "claude-3-haiku": {
    provider: "anthropic",
    displayName: "Claude 3 Haiku",
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 1.25,
  },
});

// Default fallback pricing for unlisted models
export const DEFAULT_FALLBACK_PRICING = Object.freeze({
  provider: "unknown",
  displayName: "Unknown Model",
  inputCostPerMillion: 1.00,
  outputCostPerMillion: 3.00,
});

/**
 * Normalizes model names (lowercase, trim)
 */
export const normalizeModelName = (modelName) => {
  if (!modelName || typeof modelName !== "string") return "unknown";
  return modelName.trim().toLowerCase();
};

/**
 * Retrieves pricing configuration for a given model.
 */
export const getModelPricing = (modelName) => {
  const normalized = normalizeModelName(modelName);
  return MODEL_PRICING[normalized] || {
    ...DEFAULT_FALLBACK_PRICING,
    displayName: modelName,
  };
};

/**
 * Calculates accurate USD cost for prompt and completion tokens.
 * Returns a number rounded to 6 decimal places.
 */
export const calculateCostUsd = (modelName, promptTokens = 0, completionTokens = 0) => {
  const pTokens = Math.max(0, parseInt(promptTokens, 10) || 0);
  const cTokens = Math.max(0, parseInt(completionTokens, 10) || 0);

  const pricing = getModelPricing(modelName);
  const promptCost = (pTokens / 1_000_000) * pricing.inputCostPerMillion;
  const completionCost = (cTokens / 1_000_000) * pricing.outputCostPerMillion;

  const totalCost = promptCost + completionCost;
  return Number(totalCost.toFixed(6));
};

export default {
  MODEL_PRICING,
  DEFAULT_FALLBACK_PRICING,
  getModelPricing,
  calculateCostUsd,
  normalizeModelName,
};
