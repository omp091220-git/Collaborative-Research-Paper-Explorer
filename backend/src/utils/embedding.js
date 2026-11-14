/**
 * ==============================================================================
 * Embedding & Vector Math Utilities (FR-14)
 * Supports deterministic word-stem semantic embeddings and calibrated cosine similarity.
 * ==============================================================================
 */

// Common English research stop-words that carry zero domain signal
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has', 'had',
  'which', 'are', 'were', 'been', 'can', 'could', 'should', 'would', 'also',
  'into', 'their', 'such', 'than', 'more', 'most', 'about', 'both', 'these',
  'those', 'between', 'using', 'used', 'use', 'our', 'all', 'any', 'each',
  'over', 'under', 'through', 'where', 'when', 'what', 'who', 'how', 'why',
  'while', 'after', 'before', 'above', 'below', 'some', 'many', 'very',
  'will', 'just', 'only', 'even', 'then', 'them', 'they', 'other', 'paper',
  'study', 'work', 'present', 'propose', 'show', 'results', 'based', 'well',
  'does', 'did', 'doing', 'being', 'having', 'make', 'made', 'out', 'off',
]);

/**
 * Lightweight, deterministic Porter-style morphological stemmer.
 * Unifies scientific variants ("transformers" -> "transform", "attention" -> "attent")
 * WITHOUT creating false n-gram collisions between unrelated words ("transport" vs "transformer").
 */
export const stemWord = (word) => {
  if (!word || word.length <= 3) return word;

  let stem = word.toLowerCase();

  // Strip common inflectional suffixes
  if (stem.endsWith('tional')) return stem.slice(0, -4);
  if (stem.endsWith('tion')) return stem.slice(0, -3);
  if (stem.endsWith('ing') && stem.length > 5) return stem.slice(0, -3);
  if (stem.endsWith('ed') && stem.length > 4) return stem.slice(0, -2);
  if (stem.endsWith('ies') && stem.length > 4) return stem.slice(0, -3) + 'y';
  if (stem.endsWith('es') && stem.length > 4) return stem.slice(0, -2);
  if (stem.endsWith('s') && !stem.endsWith('ss') && stem.length > 3) return stem.slice(0, -1);
  if (stem.endsWith('ment') && stem.length > 6) return stem.slice(0, -4);
  if (stem.endsWith('able') && stem.length > 6) return stem.slice(0, -4);
  if (stem.endsWith('ive') && stem.length > 5) return stem.slice(0, -3);
  if (stem.endsWith('al') && stem.length > 4) return stem.slice(0, -2);

  return stem;
};

/**
 * Hash a string token into a 32-bit positive integer using FNV-1a.
 */
const hashString = (str) => {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

/**
 * Calculates calibrated cosine similarity between two word-stem vector embeddings.
 * 
 * - If vectors share 0 stems: returns 0.0 (strictly 0% match)
 * - If vectors share identical direction: returns 1.0 (100% match)
 * - Proportional saturation curve for partial academic overlap
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} calibrated similarity score between 0.0 and 1.0
 */
export const cosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) return 0;
  if (vecA.length === 0 || vecB.length === 0) return 0;

  const len = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const a = typeof vecA[i] === 'number' ? vecA[i] : 0;
    const b = typeof vecB[i] === 'number' ? vecB[i] : 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  if (dotProduct <= 0) return 0;

  const rawSim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  if (rawSim <= 0.001) return 0.0;
  if (rawSim >= 0.99) return 1.0;

  // Calibrate raw stem overlap using hyperbolic tangent curve
  const calibrated = Math.tanh(rawSim * 3.0);
  return Math.max(0, Math.min(1.0, Number(calibrated.toFixed(4))));
};

/**
 * Generates a deterministic normalized semantic embedding vector from text.
 * Uses 1024-dimensional feature hashing on stemmed content words.
 *
 * @param {string} text
 * @param {number} dimension (default 1024)
 * @returns {number[]} L2-normalized vector of floats
 */
export const generateTextEmbedding = (text, dimension = 1024) => {
  if (!text || typeof text !== 'string') {
    return new Array(dimension).fill(0);
  }

  const vector = new Array(dimension).fill(0);
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const rawWords = cleaned.split(/\s+/).filter((w) => w.length > 2);

  // Filter out stop words and apply morphological stemming
  const stems = [];
  for (const w of rawWords) {
    if (!STOP_WORDS.has(w)) {
      stems.push(stemWord(w));
    }
  }

  if (stems.length === 0) {
    return vector;
  }

  // Feature hashing on stemmed words with frequency counts
  for (const stem of stems) {
    const idx = hashString(stem) % dimension;
    vector[idx] += 1.0;
  }

  // Normalize vector to unit length (L2 norm)
  let sumSq = 0;
  for (let i = 0; i < dimension; i++) {
    sumSq += vector[i] * vector[i];
  }

  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      vector[i] = Number((vector[i] / magnitude).toFixed(6));
    }
  }

  return vector;
};

export default {
  stemWord,
  cosineSimilarity,
  generateTextEmbedding,
};
